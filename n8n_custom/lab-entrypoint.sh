#!/bin/sh
# Punto de entrada del contenedor n8n del laboratorio.
#
# 1. Genera, la primera vez, el secreto que protege los webhooks del flujo y lo
#    guarda en el volumen de datos de n8n (lab_webhook_token, modo 600).
# 2. Lo registra en n8n como credencial Header Auth (id labWebhookAuth01,
#    encabezado X-Lab-Token), que es la que referencian los nodos Webhook de
#    workflows/*.json. Sin ese encabezado n8n responde 403 y el flujo no corre.
#    Si el registro falla, los webhooks quedan sin credencial y tampoco corren.
# 3. La primera vez registra tambien la credencial SMTP de Mailpit que usa el
#    nodo Send Email, salvo que ya exista una con ese identificador.
# 4. Cede el control al punto de entrada original de la imagen de n8n.
#
# Para leer el secreto desde el host:
#   docker exec n8n-security-lab cat /home/node/.n8n/lab_webhook_token

N8N_DIR=/home/node/.n8n
TOKEN_FILE="$N8N_DIR/lab_webhook_token"
SMTP_MARK="$N8N_DIR/lab_smtp_credential"
SMTP_ID=S9DipsS82gdEzcbP

umask 077
mkdir -p "$N8N_DIR"

if [ ! -s "$TOKEN_FILE" ]; then
  head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$TOKEN_FILE"
fi

TMP="$(mktemp)"
printf '[{"id":"labWebhookAuth01","name":"Lab Webhook Token","type":"httpHeaderAuth","data":{"name":"X-Lab-Token","value":"%s"}}]\n' \
  "$(cat "$TOKEN_FILE")" > "$TMP"
n8n import:credentials --input="$TMP" > /dev/null \
  || echo "lab-entrypoint: no se pudo registrar la credencial de los webhooks (quedan cerrados)" >&2

if [ ! -e "$SMTP_MARK" ]; then
  if ! n8n export:credentials --id="$SMTP_ID" --output="$TMP" > /dev/null 2>&1; then
    printf '[{"id":"%s","name":"Mailpit SMTP","type":"smtp","data":{"user":"","password":"","host":"mailpit","port":1025,"secure":false,"disableStartTls":true}}]\n' \
      "$SMTP_ID" > "$TMP"
    n8n import:credentials --input="$TMP" > /dev/null \
      || echo "lab-entrypoint: no se pudo registrar la credencial SMTP de Mailpit" >&2
  fi
  : > "$SMTP_MARK"
fi

rm -f "$TMP"
umask 022
exec /docker-entrypoint.sh "$@"
