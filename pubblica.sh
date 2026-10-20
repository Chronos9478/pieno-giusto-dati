#!/usr/bin/env bash
# Pieno Giusto – scarica i dati del Ministero, li prepara e li pubblica su GitHub Pages.
# Gira sul server in Italia, lanciato da cron due volte al giorno.
#
# Variabili per le prove (normalmente non servono):
#   SRC_DIR   cartella con i CSV già scaricati (salta il download)
#   PUSH_URL  dove pubblicare (di default il repository GitHub, ramo gh-pages)
set -euo pipefail

# Tutto dentro una funzione: bash legge lo script per intero prima di eseguirlo,
# così il "git pull" qui sotto può aggiornare questo stesso file senza problemi.
main() {

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY="${DEPLOY_KEY:-/root/.ssh/pieno_giusto_deploy}"
UA="PienoGiusto-dati/1.0"

if [[ -z "${PUSH_URL:-}" ]]; then
  ORIGIN="$(git -C "$DIR" remote get-url origin)"          # https://github.com/UTENTE/REPO.git
  PUSH_URL="git@github.com:${ORIGIN#https://github.com/}"  # git@github.com:UTENTE/REPO.git
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[$(date '+%F %T')] Inizio"

# Prende l'ultima versione degli script (se qualcuno li ha aggiornati su GitHub)
git -C "$DIR" pull --ff-only -q 2>/dev/null || echo "Avviso: aggiornamento degli script non riuscito, uso quelli presenti"

for f in anagrafica_impianti_attivi prezzo_alle_8; do
  if [[ -n "${SRC_DIR:-}" ]]; then
    cp "$SRC_DIR/$f.csv" "$WORK/$f.csv"
  else
    curl --fail --silent --show-error --location \
      --connect-timeout 60 --max-time 600 \
      --retry 4 --retry-delay 30 --retry-all-errors \
      -A "$UA" -o "$WORK/$f.csv" "https://www.mimit.gov.it/images/exportCSV/$f.csv"
  fi
  echo "$f.csv: $(wc -l < "$WORK/$f.csv") righe"
done

node "$DIR/build.mjs" \
  --impianti "$WORK/anagrafica_impianti_attivi.csv" \
  --prezzi "$WORK/prezzo_alle_8.csv" \
  --out "$WORK/public"

# Pagine fisse del sito (es. privacy.html)
if [[ -d "$DIR/sito" ]]; then cp -r "$DIR/sito/." "$WORK/public/"; fi

# Pubblica: un solo commit sul ramo gh-pages, che sostituisce quello del giorno prima
cd "$WORK/public"
touch .nojekyll
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="Pieno Giusto" -c user.email="dati@pienogiusto.invalid" commit -q -m "Dati $(date '+%F %H:%M')"
GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" \
  git push -q --force "$PUSH_URL" gh-pages

echo "[$(date '+%F %T')] Pubblicato"
}

main "$@"
exit
