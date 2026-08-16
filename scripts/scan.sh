#!/bin/bash

# ===========================================================
#  Laboratorio de Seguridad: Greenbone + n8n
#  Ejecuta nmap en el host y envia resultados a n8n (Linux)
#
#  Uso: ./scan.sh [subred] [url-n8n]
#  Ejemplo: ./scan.sh 192.168.1.0/24
#           ./scan.sh 192.168.1.0/24 http://192.168.1.50:5678/webhook/nmap
# ===========================================================

SUBNET="${1:-192.168.122.0/24}"
N8N_URL="${2:-http://localhost:5678/webhook/nmap}"

if ! command -v nmap &>/dev/null; then
    echo "ERROR: nmap no esta instalado. Corre primero: sudo ./scripts/install_nmap.sh"
    exit 1
fi

if ! command -v curl &>/dev/null; then
    echo "ERROR: curl no esta instalado."
    exit 1
fi

echo "Escaneando red: $SUBNET"
echo "Enviando resultados a: $N8N_URL"

nmap -sn -n -oX - "$SUBNET" | curl -s -X POST "$N8N_URL" \
    -H "Content-Type: application/xml" \
    --data-binary @-

if [ $? -eq 0 ]; then
    echo "Resultados enviados a n8n correctamente."
else
    echo "ERROR: No se pudo conectar a n8n en $N8N_URL"
    echo "Verificá que el laboratorio este corriendo y el workflow activo."
fi
