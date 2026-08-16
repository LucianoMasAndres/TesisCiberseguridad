#!/bin/bash
# Espera a que todos los contenedores de lab-targets con healthcheck definido
# reporten "healthy" antes de disparar el escaneo Nmap. Corrige la condicion
# de carrera documentada en Pendientes_Correccion_TFI.txt punto 1.3
# (172.20.0.10 nunca detectado: el escaneo arrancaba antes de que el
# contenedor terminara de levantar).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/lab-targets/docker-compose.lab-targets.yml"

MAX_WAIT=120
ELAPSED=0

echo "⏳ Esperando a que lab-targets esté listo (healthchecks)..."

while true; do
    # Solo nos importan los contenedores que declaran healthcheck (Health no
    # vacio). Los que no tienen healthcheck reportan "Health":"" y no deben
    # bloquear la espera.
    STATUSES=$(docker compose -f "$COMPOSE_FILE" ps --format json | grep -o '"Health":"[a-z]\+"' || true)

    if [ -z "$STATUSES" ]; then
        echo "❌ No se encontraron contenedores con healthcheck. ¿Está el stack levantado?"
        exit 1
    fi

    if echo "$STATUSES" | grep -qv '"Health":"healthy"'; then
        UNHEALTHY_COUNT=$(echo "$STATUSES" | grep -cv '"Health":"healthy"')
        echo -n "."
        sleep 2
        ELAPSED=$((ELAPSED+2))
        if [ $ELAPSED -ge $MAX_WAIT ]; then
            echo ""
            echo "❌ TIMEOUT: $UNHEALTHY_COUNT contenedor(es) siguen sin estar 'healthy' tras ${MAX_WAIT}s."
            docker compose -f "$COMPOSE_FILE" ps
            exit 1
        fi
        continue
    fi

    echo ""
    echo "✅ Todos los contenedores con healthcheck están 'healthy'. Seguro para disparar el escaneo."
    exit 0
done
