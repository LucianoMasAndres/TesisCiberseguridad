#Requires -Version 5
# ===========================================================
#  Laboratorio de Seguridad: Greenbone + n8n
#  Script de apagado (Windows)
# ===========================================================

$ProjectDir = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectDir

Write-Host "Apagando el laboratorio..."

$Resp = Read-Host "Borrar todos los datos (volumenes)? Esto hace un reset completo. [s/N]"

if ($Resp -match '^[sS]$') {
    Write-Host "Eliminando contenedores y volumenes..."
    docker compose down -v
    Write-Host "Reset completo. Los feeds de OpenVAS deberan descargarse de nuevo la proxima vez."
} else {
    Write-Host "Deteniendo contenedores (datos conservados)..."
    docker compose down
    Write-Host "Laboratorio apagado. Los datos siguen disponibles para el proximo inicio."
}
