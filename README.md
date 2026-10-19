# Pieno Giusto – dati

Ogni giorno un piccolo server in Italia scarica i prezzi dei carburanti dal Ministero (MIMIT – Osservaprezzi carburanti). Li controlla, li divide in piccoli file per zona e li pubblica gratis su GitHub Pages. L'app scarica solo i file della tua zona: pochi KB invece di 7-8 MB.

Perché un server in Italia: da metà ottobre 2026 il sito del Ministero non accetta più collegamenti dai server di GitHub, che sono all'estero.

## File

| File | A cosa serve |
|---|---|
| `build.mjs` | Legge i file del Ministero, li controlla e crea i file per zona |
| `pubblica.sh` | Scarica, prepara e pubblica sul ramo `gh-pages`. Lo lancia il server alle 9:30 e alle 12:30 |
| `installa.sh` | Prepara il server, da lanciare una volta sola |
| `test.mjs` | Prova `build.mjs` con dati finti: `node test.mjs` |

## Installazione

### A. Su GitHub (repository `pieno-giusto-dati`)
1. Se esiste il vecchio file `.github/workflows/aggiorna-dati.yml`, aprilo, premi **⋯** in alto a destra → **Delete file** → **Commit changes**.
2. Premi **Add file → Upload files** e trascina `build.mjs`, `pubblica.sh`, `installa.sh` e `README.md`. Poi premi **Commit changes**.

### B. Il server (Aruba Cloud, o un altro VPS con indirizzo italiano)
1. Compra un **Cloud VPS** con sistema operativo **Ubuntu** (24.04 o più recente). Basta il piano più piccolo.
2. Annota l'**indirizzo IP** del server e la **password di root**.

### C. Installazione sul server
1. Sul PC apri PowerShell e collegati al server, scrivendo il tuo IP al posto di `INDIRIZZO_IP`:
   ```
   ssh root@INDIRIZZO_IP
   ```
   Alla domanda "Are you sure…" scrivi `yes`, poi inserisci la password. Mentre la scrivi non compare nulla: è normale.
2. Incolla questo comando, con il tuo nome utente GitHub alla fine:
   ```
   curl -fsSL https://raw.githubusercontent.com/Chronos9478/pieno-giusto-dati/main/installa.sh | bash -s Chronos9478
   ```
3. Alla fine il comando stampa una riga che inizia con `ssh-ed25519`. Aggiungila su GitHub come **Deploy key**: si fa su `github.com/TUONOME/pieno-giusto-dati/settings/keys/new`, spuntando **Allow write access**.
4. Torna nel terminale del server e lancia la prima pubblicazione:
   ```
   /opt/pieno-giusto-dati/pubblica.sh
   ```

### D. Attiva la pagina
Su GitHub vai in **Settings → Pages**. Imposta *Source* su **Deploy from a branch**, scegli il ramo **gh-pages** con la cartella **/ (root)** e premi **Save**. Dopo un paio di minuti `https://TUONOME.github.io/pieno-giusto-dati/` mostra la data dei dati.

## Controllare che funzioni
- Il registro è sul server: `tail -n 30 /var/log/pieno-giusto.log`
- Se un giorno il file del Ministero arriva incompleto, `build.mjs` **non pubblica nulla** e restano online i dati del giorno prima.

## Formato dei file
`v1/tiles/<lat>_<lon>.json`, dove la chiave è `floor(lat / 0,5)_floor(lon / 0,5)`:

```
{ "v": 1, "extractedAt": "19/10/2026", "generatedAt": "...",
  "s": [ [id, marchio, indirizzo, comune, provincia, lat, lon,
          [[carburante, prezzo, self, data_in_secondi], ...] ], ... ] }
```
Codici carburante: 0 benzina, 1 gasolio, 2 GPL, 3 metano. `v1/meta.json` contiene il riepilogo.
