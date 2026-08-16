#!/bin/bash

# ===========================================================
#  Laboratorio de Seguridad: Greenbone + n8n
#  Script de apagado
# ===========================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "🛑 Apagando el laboratorio..."

# Preguntar si borrar volúmenes
read -p "¿Borrar todos los datos (volúmenes)? Esto hace un reset completo. [s/N]: " RESP

if [[ "$RESP" =~ ^[sS]$ ]]; then
    echo "⚠️  Eliminando contenedores y volúmenes..."
    docker compose down -v
    echo "✅ Reset completo. Los feeds de OpenVAS deberán descargarse de nuevo la próxima vez."
else
    echo "📦 Deteniendo contenedores (datos conservados)..."
    docker compose down
    echo "✅ Laboratorio apagado. Los datos siguen disponibles para el próximo inicio."
fi
