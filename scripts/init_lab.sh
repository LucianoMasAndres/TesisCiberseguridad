#!/bin/bash

# ===========================================================
#  Laboratorio de Seguridad: Greenbone + n8n
#  Script de inicio automático
# ===========================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "🚀 Iniciando Laboratorio Completo (Greenbone + n8n + lab-targets)..."
echo "📁 Directorio del proyecto: $PROJECT_DIR"

# 1. Levantar lab-targets primero: crea la red externa lab-net de la que
#    depende el stack principal (ver docker-compose.yml, lab-net: external).
#    Sin este paso, "docker compose up" del stack principal falla en una
#    máquina limpia con "network lab-net declared as external, but could
#    not be found" (hallazgo B3, ronda 10 de auditoría independiente).
echo "📦 Levantando lab-targets (12 activos objetivo)..."
docker compose -f "$PROJECT_DIR/lab-targets/docker-compose.lab-targets.yml" up -d --build

if [ $? -ne 0 ]; then
    echo "❌ ERROR: docker compose de lab-targets falló. Revisá los logs de arriba."
    exit 1
fi

echo "⏳ Esperando a que lab-targets esté listo (healthchecks)..."
"$SCRIPT_DIR/wait_lab_targets_ready.sh" || echo "⚠️  Continuando de todos modos (ver warning arriba)."

# 2. Levantar el stack principal (n8n + Greenbone), ahora que lab-net existe
echo "📦 Levantando contenedores (n8n + Greenbone)..."
docker compose up -d --build

if [ $? -ne 0 ]; then
    echo "❌ ERROR: docker compose falló. Revisá los logs de arriba."
    exit 1
fi

GVMD_CONTAINER="greenbone-community-edition-gvmd-1"

# 3. Espera Inteligente — espera el socket de gvmd
echo "⏳ Esperando a que OpenVAS inicie sus servicios (esto puede tardar 1-2 minutos)..."
echo "   No cierres esto, estoy vigilando el arranque..."

RETRIES=0
MAX_RETRIES=60  # 5 minutos máximo

while ! docker exec $GVMD_CONTAINER ls /run/gvmd/gvmd.sock > /dev/null 2>&1; do
    echo -n "."
    sleep 5
    RETRIES=$((RETRIES+1))
    if [ $RETRIES -ge $MAX_RETRIES ]; then
        echo ""
        echo "❌ TARDÓ DEMASIADO: OpenVAS no generó el socket a tiempo."
        echo "   Revisá los logs con: docker logs $GVMD_CONTAINER"
        exit 1
    fi
done

echo ""
echo "✅ ¡OpenVAS ya está despierto!"

# 4. Configurar usuario admin
echo "🔑 Configurando usuario admin..."
sleep 10

if docker exec -u 1001 $GVMD_CONTAINER gvmd --user=admin --new-password=admin123 > /dev/null 2>&1; then
    echo "✅ Contraseña de 'admin' actualizada a 'admin123'."
else
    echo "⚠️  El usuario 'admin' no existía, creándolo..."
    docker exec -u 1001 $GVMD_CONTAINER gvmd --create-user=admin --password=admin123 > /dev/null 2>&1
    echo "✅ Usuario 'admin' creado con password 'admin123'."
fi

# 5. Importar workflow en n8n (si existe el archivo)
# Este script es el de Linux, así que importa la variante Linux (workflowV3_linux.json,
# nmap corre dentro del contenedor de n8n). La variante Windows (workflowV4_windows.json)
# la importa scripts/init_lab.ps1.
WORKFLOW_NAME="workflowV3_linux.json"
WORKFLOW_FILE="$PROJECT_DIR/workflows/$WORKFLOW_NAME"
if [ -f "$WORKFLOW_FILE" ]; then
    echo "📋 Importando workflow en n8n..."
    sleep 5
    # Primero se copia el archivo adentro del contenedor y recién después se
    # intenta el import por CLI (al revés el import siempre fallaba porque el
    # archivo todavía no existía dentro del contenedor).
    docker cp "$WORKFLOW_FILE" "n8n-security-lab:/home/node/.n8n/workflows/$WORKFLOW_NAME" 2>/dev/null && \
    docker exec n8n-security-lab \
        n8n import:workflow --input="/home/node/.n8n/workflows/$WORKFLOW_NAME" 2>/dev/null
    echo "✅ Workflow copiado. Abrí n8n, importá/activá $WORKFLOW_NAME y configurá las credenciales de Telegram."
else
    echo "⚠️  No se encontró workflows/$WORKFLOW_NAME — importalo manualmente en n8n."
fi

echo ""
echo "✨ ¡Laboratorio Operativo!"
echo "---------------------------------------------------"
echo "➡️  n8n:     http://localhost:5678"
echo "➡️  OpenVAS: http://localhost:9392  (admin / admin123)"
echo "➡️  Mailpit: http://localhost:8025"
echo "---------------------------------------------------"
echo ""
echo "⚠️  IMPORTANTE: La primera vez, OpenVAS tarda 15-30 minutos"
echo "   en sincronizar los feeds de vulnerabilidades."
echo "   Si el workflow falla con '404 scan config', esperá y reintentá."
echo "---------------------------------------------------"
