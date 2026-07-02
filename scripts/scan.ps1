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

# Parsear el XML de nmap directamente en PowerShell y enviar solo las IPs
[xml]$nmapOutput = nmap -sn -n -oX - $Subnet

$hosts = @()
if ($nmapOutput.nmaprun.host) {
    $hostNodes = $nmapOutput.nmaprun.host
    if ($hostNodes -isnot [System.Array]) { $hostNodes = @($hostNodes) }

    foreach ($h in $hostNodes) {
        if ($h.status.state -eq 'up') {
            $addresses = $h.address
            if ($addresses -isnot [System.Array]) { $addresses = @($addresses) }
            $ipv4 = $addresses | Where-Object { $_.addrtype -eq 'ipv4' } | Select-Object -First 1
            if ($ipv4) { $hosts += $ipv4.addr }
        }
    }
}

Write-Host "Hosts activos encontrados: $($hosts.Count)"
if ($hosts.Count -gt 0) {
    Write-Host "IPs: $($hosts -join ', ')"
}

$jsonBody = @{
    hosts     = $hosts
    subnet    = $Subnet
    hostCount = $hosts.Count
} | ConvertTo-Json

Write-Host "Enviando resultados a: $N8nUrl"

try {
    Invoke-RestMethod -Uri $N8nUrl -Method POST -Body $jsonBody -ContentType "application/json"
    Write-Host "Resultados enviados a n8n correctamente."
} catch {
    Write-Host "ERROR: No se pudo conectar a n8n en $N8nUrl"
    Write-Host "Verificá que el laboratorio este corriendo y el workflow activo."
    Write-Host $_.Exception.Message
    exit 1
}
