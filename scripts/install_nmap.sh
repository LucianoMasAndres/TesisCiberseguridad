#!/bin/bash

# ===========================================================
#  Laboratorio de Seguridad: Greenbone + n8n
#  Instalador de nmap en el host (Linux)
# ===========================================================

if command -v nmap &>/dev/null; then
    echo "nmap ya esta instalado: $(nmap --version | head -1)"
    exit 0
fi

echo "Instalando nmap..."

if command -v apt-get &>/dev/null; then
    sudo apt-get update -qq && sudo apt-get install -y nmap
elif command -v dnf &>/dev/null; then
    sudo dnf install -y nmap
elif command -v yum &>/dev/null; then
    sudo yum install -y nmap
elif command -v pacman &>/dev/null; then
    sudo pacman -Sy --noconfirm nmap
else
    echo "ERROR: No se reconoce el gestor de paquetes. Instala nmap manualmente."
    exit 1
fi

echo "nmap instalado: $(nmap --version | head -1)"
