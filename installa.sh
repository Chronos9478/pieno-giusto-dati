#!/usr/bin/env bash
# Pieno Giusto – installazione sul server (Ubuntu). Da lanciare una volta sola, come root:
#   curl -fsSL https://raw.githubusercontent.com/UTENTE/pieno-giusto-dati/main/installa.sh | bash -s UTENTE
set -euo pipefail

UTENTE="${1:?Scrivi il tuo nome utente GitHub dopo il comando, es: bash -s Chronos9478}"
REPO="https://github.com/$UTENTE/pieno-giusto-dati.git"
DIR=/opt/pieno-giusto-dati
KEY=/root/.ssh/pieno_giusto_deploy

echo "== 1/5 Controllo che il sito del Ministero risponda da questo server…"
CODE="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 60 --max-time 120 -r 0-999 \
  https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv || true)"
if [[ "$CODE" != "200" && "$CODE" != "206" ]]; then
  echo "ERRORE: il Ministero non risponde da questo server (codice: ${CODE:-nessuno})."
  echo "Fermati qui e manda questo messaggio a Claude."
  exit 1
fi
echo "OK, il Ministero risponde."

echo "== 2/5 Installo i programmi necessari (qualche minuto)…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates nodejs >/dev/null
echo "Node.js $(node --version)"

echo "== 3/5 Imposto l'ora italiana…"
timedatectl set-timezone Europe/Rome || ln -sf /usr/share/zoneinfo/Europe/Rome /etc/localtime

echo "== 4/5 Scarico gli script dal tuo repository…"
if [[ -d "$DIR/.git" ]]; then git -C "$DIR" pull --ff-only -q; else git clone -q "$REPO" "$DIR"; fi
chmod +x "$DIR/pubblica.sh"

cat > /etc/cron.d/pieno-giusto <<EOF
# Aggiorna i dati alle 9:30 e alle 12:30 (ora italiana)
30 9,12 * * * root $DIR/pubblica.sh >> /var/log/pieno-giusto.log 2>&1
EOF
chmod 644 /etc/cron.d/pieno-giusto
systemctl restart cron 2>/dev/null || true

echo "== 5/5 Creo la chiave per pubblicare su GitHub…"
mkdir -p /root/.ssh && chmod 700 /root/.ssh
[[ -f "$KEY" ]] || ssh-keygen -q -t ed25519 -N "" -C "pieno-giusto-server" -f "$KEY"

cat <<EOF

=====================================================================
 Installazione completata. Manca un ultimo passo su GitHub:

 1. Apri https://github.com/$UTENTE/pieno-giusto-dati/settings/keys/new
 2. Title: server
 3. Key: copia e incolla TUTTA questa riga:

$(cat "$KEY.pub")

 4. Spunta "Allow write access" e premi "Add key".
 5. Torna qui e lancia la prima pubblicazione con:

    $DIR/pubblica.sh
=====================================================================
EOF
