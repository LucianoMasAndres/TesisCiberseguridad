#!/bin/bash

# ===========================================================
#  Security Lab — Instala el lanzador GUI en el escritorio
# ===========================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LAUNCHER="$PROJECT_DIR/launcher.py"
DESKTOP_FILE="$HOME/Desktop/SecurityLab.desktop"

# 1. Verificar Docker (unico requisito externo pesado -- no se instala
#    en silencio, se guia al usuario, igual que en Windows)
if ! command -v docker &>/dev/null; then
    echo "❌ Docker no está instalado."
    echo "   Instalalo siguiendo: https://docs.docker.com/engine/install/"
    if command -v xdg-open &>/dev/null; then
        xdg-open "https://docs.docker.com/engine/install/" 2>/dev/null &
    fi
    echo "   Volvé a correr este script después de instalarlo."
    exit 1
fi
if ! docker info &>/dev/null; then
    echo "❌ Docker está instalado pero el daemon no está corriendo."
    echo "   Iniciá el servicio (sudo systemctl start docker) y volvé a intentar."
    exit 1
fi
if ! docker compose version &>/dev/null; then
    echo "❌ Docker Compose v2 no está disponible."
    echo "   Instalá el plugin: sudo apt-get install docker-compose-plugin"
    exit 1
fi
echo "✅ Docker y Docker Compose OK."

# 2. Verificar python3
if ! command -v python3 &>/dev/null; then
    echo "Instalando python3..."
    sudo apt-get install -y python3
fi

# 3. Verificar / instalar tkinter
if ! python3 -c "import tkinter" 2>/dev/null; then
    echo "Instalando python3-tk..."
    sudo apt-get install -y python3-tk
fi

# 4. Hacer ejecutable el launcher
chmod +x "$LAUNCHER"

# 5. Crear acceso directo en el escritorio
cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Name=Security Lab
Comment=Greenbone + n8n Lab Launcher
Exec=python3 $LAUNCHER
Icon=security-high
Terminal=false
Type=Application
Categories=Security;Network;
StartupNotify=true
EOF

chmod +x "$DESKTOP_FILE"

# Marcar como confiable (Ubuntu/GNOME)
if command -v gio &>/dev/null; then
    gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null
fi

echo ""
echo "✅ Lanzador instalado."
echo "   Acceso directo: $DESKTOP_FILE"
echo "   También podés correrlo directamente con:"
echo "   python3 $LAUNCHER"
