#Requires -Version 5
# ===========================================================
#  Laboratorio de Seguridad: Greenbone + n8n
#  Ejecuta nmap en el host y envia resultados a n8n (Windows)
#
#  Uso: .\scan.ps1 [-Subnet 192.168.1.0/24] [-N8nUrl http://localhost:5678/webhook/nmap]
# ===========================================================

param(
    [string]$Subnet = "192.168.1.0/24",
    [string]$N8nUrl = "http://localhost:5678/webhook/nmap"
)

if (-not (Get-Command nmap -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: nmap no esta instalado. Corre primero: .\scripts\install_nmap.ps1"
    exit 1
}

Write-Host "Escaneando red: $Subnet"
Write-Host "Enviando resultados a: $N8nUrl"

$xml = nmap -sn -n -oX - $Subnet | Out-String

try {
    Invoke-RestMethod -Uri $N8nUrl -Method POST -Body $xml -ContentType "application/xml"
    Write-Host "Resultados enviados a n8n correctamente."
} catch {
    Write-Host "ERROR: No se pudo conectar a n8n en $N8nUrl"
    Write-Host "Verificá que el laboratorio este corriendo y el workflow activo."
    Write-Host $_.Exception.Message
    exit 1
}
