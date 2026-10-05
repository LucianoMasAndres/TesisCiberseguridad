#!/bin/bash

# ===========================================================
#  Laboratorio de Seguridad: Greenbone + n8n
#  Script de inicio automático
# ===========================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 0. Dependencias del host: Docker con el plugin Compose v2.
if ! command -v docker >/dev/null 2>&1; then
    echo "❌ ERROR: Docker no está instalado. Ver README (Instalar Docker en Linux)."
    exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
    echo "❌ ERROR: falta Docker Compose v2 (comando 'docker compose'). Ver README."
    exit 1
fi
if ! docker info >/dev/null 2>&1; then
    echo "❌ ERROR: el demonio de Docker no responde o tu usuario no tiene permiso."
    echo "   Probá: sudo usermod -aG docker \$USER  (y volvé a iniciar sesión)"
    exit 1
fi

echo "🚀 Iniciando Laboratorio Completo (Greenbone + n8n + lab-targets)..."
echo "📁 Directorio del proyecto: $PROJECT_DIR"

# 1. Levantar lab-targets primero: crea la red externa lab-net de la que
#    depende el stack principal (ver docker-compose.yml, lab-net: external).
#    Sin este paso, "docker compose up" del stack principal falla en una
#    máquina limpia con "network lab-net declared as external, but could
#    not be found".
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

# 4b. Esperar a que el escáner cargue las pruebas (VT). gvmd puede estar listo
#     y ospd-openvas no: si la carga inicial falla, ospd-openvas no reintenta
#     y un análisis lanzado en ese estado termina en minutos sin resultados.
echo "⏳ Esperando a que el escáner (ospd-openvas) cargue las pruebas de vulnerabilidad..."
vts_estado() {
    docker compose logs --no-log-prefix ospd-openvas 2>&1         | grep -E "Loading VTs|Finished loading VTs|VTs were up to date|Updating VTs failed" | tail -1
}
VTS_OK=0
VTS_REINICIOS=0
for _ in $(seq 1 120); do   # 10 minutos máximo
    case "$(vts_estado)" in
        *"Finished loading VTs"*|*"VTs were up to date"*) VTS_OK=1; break ;;
        *"Updating VTs failed"*)
            if [ $VTS_REINICIOS -lt 2 ]; then
                VTS_REINICIOS=$((VTS_REINICIOS+1))
                echo "   La carga de pruebas falló; reiniciando ospd-openvas (intento $VTS_REINICIOS)..."
                docker compose restart ospd-openvas > /dev/null 2>&1
            fi ;;
    esac
    echo -n "."
    sleep 5
done
echo ""
if [ $VTS_OK -eq 1 ]; then
    echo "✅ El escáner cargó las pruebas."
else
    echo "⚠️  El escáner no confirmó la carga de las pruebas. No lances un análisis todavía:"
    echo "   mirá 'docker compose logs ospd-openvas' y, si dice 'Updating VTs failed',"
    echo "   ejecutá 'docker compose restart ospd-openvas'."
fi

# 5. Importar workflow en n8n (si existe el archivo)
# Se importa workflowV4_windows.json, igual que scripts/init_lab.ps1: pese al
# nombre histórico, V4 no depende del sistema operativo del host (Nmap, gvm-cli
# y el socket de gvmd corren dentro de los contenedores) y es el único flujo que
# implementa el sistema descrito en la tesis: descubrimiento y escaneo de
# puertos (NmapScan), clasificación por criticidad (Code), análisis de los
# activos Alto/Crítico en Greenbone y rama de timeout. workflowV3_linux.json es
# histórico (sin clasificación ni escaneo de puertos) y solo lo usa el prototipo
# de app móvil; ver README.
WORKFLOW_NAME="workflowV4_windows.json"
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
    echo "✅ Workflow importado. Abrí n8n, activá $WORKFLOW_NAME (workflowV4_webhook) y cargá el token y el Chat ID de Telegram en sus nodos (ver README)."
else
    echo "⚠️  No se encontró workflows/$WORKFLOW_NAME — importalo manualmente en n8n."
fi

echo ""
echo "✨ ¡Laboratorio Operativo!"
echo "---------------------------------------------------"
echo "➡️  n8n:     http://localhost:5678  (solo en 127.0.0.1)"
echo "➡️  OpenVAS: http://127.0.0.1:9392  (admin / admin123)"
echo "➡️  Mailpit: http://127.0.0.1:8025"
echo "---------------------------------------------------"
echo ""
echo "⚠️  IMPORTANTE: La primera vez, OpenVAS tarda 15-30 minutos"
echo "   en sincronizar los feeds de vulnerabilidades."
echo "   Si el workflow falla con '404 scan config', esperá y reintentá."
echo "---------------------------------------------------"
