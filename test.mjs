// Prova dello script con dati finti nel formato del Ministero: node test.mjs
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

process.env.MIN_STATIONS = '3';
process.env.MIN_PRICES = '3';
const { build, tileKey } = await import('./build.mjs');

const dir = await mkdtemp(join(tmpdir(), 'pg-'));
const impianti = join(dir, 'impianti.csv');
const prezzi = join(dir, 'prezzi.csv');

await writeFile(
  impianti,
  [
    'Estrazione del 2026-10-19',
    'idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine',
    '1|A|Q8|Stradale|Q8 Pistoia|VIA E. FERMI 2/B|PISTOIA|PT|43.9300|10.9100',
    '2|B|Pompe Bianche|Stradale|Nome | con pipe|STATALE FIORENTINA 113|QUARRATA|PT|43.8500|10.9800',
    '3|C|Agip Eni|Stradale|Eni|VIA ROMA 1|MILANO|MI|45.4642|9.1900',
    '4|D|IP|Stradale|Rotto|VIA X|BOH|XX|0|0',
    '5|E|Esso|Stradale|Senza prezzi|VIA Y|PRATO|PO|43.88|11.09',
  ].join('\n'),
);
// Prezzi in codifica Windows (latin1) per verificare la decodifica
await writeFile(
  prezzi,
  Buffer.from(
    [
      'Estrazione del 2026-10-19',
      'idImpianto|descCarburante|prezzo|isSelf|dtComu',
      '1|Benzina|1.989|1|13/10/2026 07:00:00',
      '1|Gasolio|1.889|1|13/10/2026 07:00:00',
      '1|Benzina|2.150|0|13/10/2026 07:00:00',
      '2|Benzina|1.989|1|15/10/2026 08:00:00',
      '2|Blue Super|2.300|1|15/10/2026 08:00:00',
      '3|GPL|0.759|1|19/10/2026 06:00:00',
      '4|Benzina|1.700|1|19/10/2026 06:00:00',
    ].join('\n'),
    'latin1',
  ),
);

const out = join(dir, 'public');
const meta = await build({ impianti, prezzi, out });

assert.equal(meta.extractedAt, '19/10/2026');
assert.equal(meta.stations, 3); // 4 = coordinate rotte, 5 = senza prezzi
const files = await readdir(join(out, 'v1', 'tiles'));
assert.deepEqual(files.sort(), [`${tileKey(43.93, 10.91)}.json`, `${tileKey(45.4642, 9.19)}.json`].sort());

const tusc = JSON.parse(await readFile(join(out, 'v1', 'tiles', `${tileKey(43.93, 10.91)}.json`), 'utf8'));
assert.equal(tusc.s.length, 2);
const q8 = tusc.s.find((r) => r[0] === '1');
assert.equal(q8[1], 'Q8');
assert.equal(q8[2], 'VIA E. FERMI 2/B');
assert.equal(q8[7].length, 3);
assert.deepEqual(q8[7][0].slice(0, 3), [0, 1.989, 1]);
const pb = tusc.s.find((r) => r[0] === '2');
assert.equal(pb[2], 'STATALE FIORENTINA 113'); // il "|" nel nome non sposta i campi
assert.equal(pb[7].length, 1); // "Blue Super" ignorato

// Dati incompleti: non deve pubblicare
process.env.MIN_STATIONS = '1000';
const mod2 = await import('./build.mjs?again');
await assert.rejects(mod2.build({ impianti, prezzi, out: join(dir, 'public2') }), /incompleti/);

console.log('Tutti i controlli superati');
