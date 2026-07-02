#!/bin/bash

# ===========================================================
#  Security Lab — Instala el lanzador GUI en el escritorio
# ===========================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LAUNCHER="$PROJECT_DIR/launcher.py"
DESKTOP_FILE="$HOME/Desktop/SecurityLab.desktop"

# 1. Verificar python3
if ! command -v python3 &>/dev/null; then
    echo "ERROR: Python 3 no está instalado."
    exit 1
fi

# 2. Verificar / instalar tkinter
if ! python3 -c "import tkinter" 2>/dev/null; then
    echo "Instalando python3-tk..."
    sudo apt-get install -y python3-tk
fi

# 3. Hacer ejecutable el launcher
chmod +x "$LAUNCHER"

# 4. Crear acceso directo en el escritorio
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
