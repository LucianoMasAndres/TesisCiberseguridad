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

# --- Paso 1: Descubrimiento (host vivo / muerto) ---
[xml]$nmapOutput = nmap -sn -n -oX - $Subnet

$ips = @()
if ($nmapOutput.nmaprun.host) {
    $hostNodes = $nmapOutput.nmaprun.host
    if ($hostNodes -isnot [System.Array]) { $hostNodes = @($hostNodes) }

    foreach ($h in $hostNodes) {
        if ($h.status.state -eq 'up') {
            $addresses = $h.address
            if ($addresses -isnot [System.Array]) { $addresses = @($addresses) }
            $ipv4 = $addresses | Where-Object { $_.addrtype -eq 'ipv4' } | Select-Object -First 1
            if ($ipv4) { $ips += $ipv4.addr }
        }
    }
}

Write-Host "Hosts activos encontrados: $($ips.Count)"

# --- Paso 2: Filtrado (puertos relevantes para el algoritmo de clasificacion) ---
# Solo se escanean los puertos catalogados en SERVICE_WEIGHTS (ver docs/anexo_e_f_v2.md);
# son los que la organizacion considera con impacto real en la superficie de ataque.
$puertosTcp = "21,22,23,25,80,389,443,445,587,3306,5432,6379,8080"
$hosts = @()

if ($ips.Count -gt 0) {
    $ipsCsv = $ips -join ","
    Write-Host "Escaneando puertos relevantes en: $ipsCsv"
    [xml]$portScan = nmap -n -Pn --open -p "T:$puertosTcp,U:161" -sV -oX - $ipsCsv

    $psHosts = $portScan.nmaprun.host
    if ($psHosts -isnot [System.Array]) { $psHosts = @($psHosts) }

    foreach ($h in $psHosts) {
        if (-not $h) { continue }
        $addresses = $h.address
        if ($addresses -isnot [System.Array]) { $addresses = @($addresses) }
        $ipv4 = $addresses | Where-Object { $_.addrtype -eq 'ipv4' } | Select-Object -First 1
        if (-not $ipv4) { continue }

        $openPorts = @()
        if ($h.ports.port) {
            $portNodes = $h.ports.port
            if ($portNodes -isnot [System.Array]) { $portNodes = @($portNodes) }
            foreach ($p in $portNodes) {
                if ($p.state.state -eq 'open') { $openPorts += [int]$p.portid }
            }
        }

        $hosts += [ordered]@{ ip = $ipv4.addr; ports = $openPorts }
    }
}

if ($hosts.Count -gt 0) {
    Write-Host "Detalle de puertos por host:"
    foreach ($h in $hosts) {
        Write-Host "  $($h.ip): $($h.ports -join ', ')"
    }
}

$jsonBody = @{
    hosts     = $hosts
    subnet    = $Subnet
    hostCount = $hosts.Count
} | ConvertTo-Json -Depth 5

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
