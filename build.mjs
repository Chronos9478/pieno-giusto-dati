#!/usr/bin/env node
// Pieno Giusto – preparazione dei dati.
// Scarica i file open data del Ministero (MIMIT), li controlla e li divide
// in piccoli "riquadri" JSON (0,5° x 0,5°, circa 55 x 40 km) che l'app
// scarica in base alla posizione: pochi KB invece di 7-8 MB.
//
// Uso:  node build.mjs [--out public] [--impianti file-o-url] [--prezzi file-o-url]
// Nessuna dipendenza: basta Node.js 20 o successivo.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const URL_IMPIANTI = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';
const URL_PREZZI = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';

export const TILE_DEG = 0.5;
// Sotto queste soglie il file del Ministero è probabilmente incompleto:
// meglio NON pubblicare e lasciare online i dati del giorno prima.
const MIN_STATIONS = Number(process.env.MIN_STATIONS ?? 15000);
const MIN_PRICES = Number(process.env.MIN_PRICES ?? 40000);

const FUELS = ['benzina', 'gasolio', 'gpl', 'metano']; // l'indice è il codice nel JSON
const LAT_MIN = 35, LAT_MAX = 47.5, LON_MIN = 6, LON_MAX = 19;

// ---------------------------------------------------------------- lettura

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

function decode(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('latin1').decode(buf); // file in codifica Windows
  }
}

async function getText(src) {
  if (!/^https?:\/\//.test(src)) return decode(await readFile(src));
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(src, { headers: { 'User-Agent': 'PienoGiusto-dati/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return decode(new Uint8Array(await res.arrayBuffer()));
    } catch (e) {
      lastErr = e;
      console.warn(`Tentativo ${attempt} fallito per ${src}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
  throw new Error(`Impossibile scaricare ${src}: ${lastErr?.message}`);
}

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const num = (s) => Number(clean(s).replace(',', '.'));

function findHeader(lines) {
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const l = lines[i].trim().toLowerCase();
    if (l.startsWith('idimpianto')) return { index: i, sep: l.includes('|') ? '|' : l.includes(';') ? ';' : ',' };
  }
  throw new Error('Intestazione del file non trovata: il formato del Ministero potrebbe essere cambiato');
}

export function extractionDate(text) {
  const head = text.slice(0, 500).split(/\r?\n/).slice(0, 3).join(' ');
  const iso = head.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const it = head.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return it ? `${it[1]}/${it[2]}/${it[3]}` : null;
}

function parseDate(s) {
  const v = clean(s);
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return Math.floor(new Date(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime() / 1000);
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : Math.floor(t / 1000);
}

export function parseStations(text) {
  const lines = text.split(/\r?\n/);
  const { index, sep } = findHeader(lines);
  const out = new Map();
  for (let i = index + 1; i < lines.length; i++) {
    if (!lines[i]?.trim()) continue;
    const f = lines[i].split(sep);
    const n = f.length;
    if (n < 10) continue;
    const lat = num(f[n - 2]);
    const lon = num(f[n - 1]);
    if (!(lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX)) continue;
    const id = clean(f[0]);
    if (!id) continue;
    out.set(id, {
      id,
      brand: clean(f[2]) || 'Senza marchio',
      address: clean(f[n - 5]),
      city: clean(f[n - 4]),
      province: clean(f[n - 3]),
      lat,
      lon,
    });
  }
  return out;
}

export function parsePrices(text) {
  const lines = text.split(/\r?\n/);
  const { index, sep } = findHeader(lines);
  const out = new Map();
  let count = 0;
  for (let i = index + 1; i < lines.length; i++) {
    if (!lines[i]?.trim()) continue;
    const f = lines[i].split(sep);
    const n = f.length;
    if (n < 5) continue;
    const fuel = FUELS.indexOf(clean(f.slice(1, n - 3).join(' ')).toLowerCase());
    if (fuel < 0) continue;
    const price = num(f[n - 3]);
    if (!(price > 0.3 && price < 5)) continue;
    const self = ['1', 'true'].includes(clean(f[n - 2]).toLowerCase()) ? 1 : 0;
    const id = clean(f[0]);
    const list = out.get(id) ?? [];
    list.push([fuel, price, self, parseDate(f[n - 1])]);
    out.set(id, list);
    count++;
  }
  return { byStation: out, count };
}

export const tileKey = (lat, lon) => `${Math.floor(lat / TILE_DEG)}_${Math.floor(lon / TILE_DEG)}`;

// ---------------------------------------------------------------- main

export async function build({ impianti = URL_IMPIANTI, prezzi = URL_PREZZI, out = 'public' } = {}) {
  console.log('Leggo i file del Ministero…');
  const [stationsCsv, pricesCsv] = await Promise.all([getText(impianti), getText(prezzi)]);

  const stations = parseStations(stationsCsv);
  const { byStation, count } = parsePrices(pricesCsv);
  const extractedAt = extractionDate(pricesCsv) ?? extractionDate(stationsCsv);

  const tiles = new Map();
  let withPrices = 0;
  for (const [id, s] of stations) {
    const prices = byStation.get(id);
    if (!prices) continue;
    withPrices++;
    const key = tileKey(s.lat, s.lon);
    if (!tiles.has(key)) tiles.set(key, []);
    tiles.get(key).push([id, s.brand, s.address, s.city, s.province, +s.lat.toFixed(5), +s.lon.toFixed(5), prices]);
  }

  console.log(`Impianti: ${stations.size}, con prezzi: ${withPrices}, prezzi validi: ${count}, riquadri: ${tiles.size}`);
  if (withPrices < MIN_STATIONS || count < MIN_PRICES) {
    throw new Error(
      `Dati incompleti (${withPrices} impianti con prezzi, ${count} prezzi): non pubblico nulla per non sovrascrivere i dati buoni.`,
    );
  }

  const generatedAt = new Date().toISOString();
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, 'v1', 'tiles'), { recursive: true });

  let bytes = 0;
  for (const [key, list] of tiles) {
    const body = JSON.stringify({ v: 1, extractedAt, generatedAt, s: list });
    bytes += body.length;
    await writeFile(join(out, 'v1', 'tiles', `${key}.json`), body);
  }

  const meta = { v: 1, tileDeg: TILE_DEG, fuels: FUELS, extractedAt, generatedAt, stations: withPrices, prices: count, tiles: [...tiles.keys()].sort() };
  await writeFile(join(out, 'v1', 'meta.json'), JSON.stringify(meta, null, 1));
  await writeFile(
    join(out, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Dati Pieno Giusto</title><body style="font-family:sans-serif;padding:24px">` +
      `<h1>Dati Pieno Giusto</h1><p>Dati del Ministero del ${extractedAt ?? '?'} · generati ${generatedAt}</p>` +
      `<p>${withPrices} distributori, ${tiles.size} riquadri. Fonte: MIMIT – Osservaprezzi carburanti.</p></body>`,
  );
  console.log(`Fatto: ${tiles.size} file, in media ${Math.round(bytes / tiles.size / 1024)} KB ciascuno, dati del ${extractedAt}`);
  return meta;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build.mjs')) {
  build({ impianti: arg('impianti', URL_IMPIANTI), prezzi: arg('prezzi', URL_PREZZI), out: arg('out', 'public') }).catch(
    (e) => {
      console.error(`ERRORE: ${e.message}`);
      process.exit(1);
    },
  );
}
