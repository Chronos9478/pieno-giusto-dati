# Pieno Giusto – dati

Ogni mattina scarica i prezzi dei carburanti dal Ministero (MIMIT – Osservaprezzi carburanti), li controlla e li pubblica divisi in piccoli file per zona. L'app scarica solo quelli vicini a te: pochi KB invece di 7-8 MB.

Gira gratis su GitHub (GitHub Actions + GitHub Pages).

## Come attivarlo (una volta sola, circa 10 minuti)

1. Crea un account gratuito su https://github.com
2. In alto a destra premi **+** → **New repository**
   - Repository name: `pieno-giusto-dati`
   - Lascia **Public**, perché GitHub Pages gratis funziona solo con i repository pubblici. Qui ci sono solo i dati, non il codice dell'app.
   - Premi **Create repository**
3. Nella pagina che si apre, clicca il link **uploading an existing file**. Trascina dentro **tutto il contenuto** di questa cartella: `build.mjs`, `test.mjs`, `README.md` e la cartella `.github`. Poi premi **Commit changes**.
   - Controlla che sia comparsa la cartella `.github`. Se manca, premi **Add file → Create new file**, come nome scrivi `.github/workflows/aggiorna-dati.yml`, incolla il contenuto del file con lo stesso nome e premi **Commit changes**.
4. Vai su **Settings → Pages**. Alla voce *Build and deployment → Source* scegli **GitHub Actions**.
5. Vai su **Actions**. Se te lo chiede, abilita i workflow. Poi apri **Aggiorna dati carburanti** e premi **Run workflow** → **Run workflow**.
6. Dopo 1-2 minuti compare un pallino verde. Apri `https://TUONOME.github.io/pieno-giusto-dati/`: devi vedere la data dei dati e il numero dei distributori.

Da quel momento si aggiorna da solo due volte al giorno.

## Da sapere

- Se un giorno il file del Ministero arriva incompleto, lo script **non pubblica nulla** e restano online i dati del giorno prima. GitHub ti avvisa per email con un pallino rosso.
- Se nel repository non succede niente per 60 giorni, GitHub sospende gli aggiornamenti automatici e ti manda un'email. Per riattivarli basta un clic su **Enable workflow** nella scheda Actions.
- Per provarlo sul computer: `node test.mjs` (dati finti) oppure `node build.mjs` (dati veri, crea la cartella `public`).

## Formato dei file

`v1/tiles/<lat>_<lon>.json`, dove la chiave è `floor(lat / 0,5)_floor(lon / 0,5)`:

```
{ "v": 1, "extractedAt": "19/10/2026", "generatedAt": "...",
  "s": [ [id, marchio, indirizzo, comune, provincia, lat, lon,
          [[carburante, prezzo, self, data_in_secondi], ...] ], ... ] }
```

Codici carburante: 0 benzina, 1 gasolio, 2 GPL, 3 metano. Il file `v1/meta.json` contiene il riepilogo.
