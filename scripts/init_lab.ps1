#Requires -Version 5
# ===========================================================
#  Laboratorio de Seguridad: Greenbone + n8n
#  Script de inicio automatico (Windows)
# ===========================================================

$ProjectDir = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectDir

Write-Host "Iniciando Laboratorio Completo (Greenbone + n8n + lab-targets)..."
Write-Host "Directorio del proyecto: $ProjectDir"

# 1. Levantar lab-targets primero: crea la red externa lab-net de la que
#    depende el stack principal (ver docker-compose.yml, lab-net: external).
#    Sin este paso, "docker compose up" del stack principal falla en una
#    maquina limpia con "network lab-net declared as external, but could
#    not be found" (hallazgo B3, ronda 10 de auditoria independiente).
$LabTargetsCompose = Join-Path $ProjectDir "lab-targets\docker-compose.lab-targets.yml"
Write-Host "Levantando lab-targets (12 activos objetivo)..."
docker compose -f $LabTargetsCompose up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: docker compose de lab-targets fallo. Revisa los logs de arriba."
    exit 1
}

Write-Host "Esperando a que lab-targets este listo (healthchecks)..."
$LtElapsed = 0
$LtMaxWait = 120
$LtInterval = 2
while ($true) {
    $psJson = docker compose -f $LabTargetsCompose ps --format json 2>$null
    $lines = @($psJson -split "`n" | Where-Object { $_.Trim() -ne "" })
    if ($lines.Count -eq 0) {
        Write-Host "  No se encontraron contenedores de lab-targets. Sigo de todos modos."
        break
    }
    $healths = @()
    foreach ($line in $lines) {
        try {
            $obj = $line | ConvertFrom-Json
            if ($obj.Health) { $healths += $obj.Health }
        } catch { }
    }
    if ($healths.Count -gt 0 -and ($healths | Where-Object { $_ -ne "healthy" }).Count -eq 0) {
        Write-Host "  lab-targets: todos los healthchecks OK."
        break
    }
    Start-Sleep -Seconds $LtInterval
    $LtElapsed += $LtInterval
    if ($LtElapsed -ge $LtMaxWait) {
        Write-Host "  TIMEOUT esperando lab-targets (${LtMaxWait}s). Sigo igual, pero .10 puede fallar."
        break
    }
}

# 2. Levantar el stack principal (n8n + Greenbone), ahora que lab-net existe
Write-Host "Levantando contenedores (n8n + Greenbone)..."
docker compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: docker compose fallo. Revisa los logs de arriba."
    exit 1
}

$GvmdContainer = "greenbone-community-edition-gvmd-1"

# 3. Espera inteligente - espera el socket de gvmd
Write-Host "Esperando a que OpenVAS inicie sus servicios (esto puede tardar 1-2 minutos)..."
Write-Host "No cierres esto, estoy vigilando el arranque..."

$Retries = 0
$MaxRetries = 60  # 5 minutos maximo

while ($true) {
    docker exec $GvmdContainer ls /run/gvmd/gvmd.sock 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { break }

    Write-Host -NoNewline "."
    Start-Sleep -Seconds 5
    $Retries++

    if ($Retries -ge $MaxRetries) {
        Write-Host ""
        Write-Host "TARDO DEMASIADO: OpenVAS no genero el socket a tiempo."
        Write-Host "Revisa los logs con: docker logs $GvmdContainer"
        exit 1
    }
}

Write-Host ""
Write-Host "OpenVAS ya esta despierto!"

# 4. Configurar usuario admin
Write-Host "Configurando usuario admin..."
Start-Sleep -Seconds 10

docker exec -u 1001 $GvmdContainer gvmd --user=admin --new-password=admin123 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Contrasena de 'admin' actualizada a 'admin123'."
} else {
    Write-Host "El usuario 'admin' no existia, creandolo..."
    docker exec -u 1001 $GvmdContainer gvmd --create-user=admin --password=admin123 2>$null | Out-Null
    Write-Host "Usuario 'admin' creado con password 'admin123'."
}

# 5. Importar workflow en n8n
$WorkflowFile = Join-Path $ProjectDir "workflows\workflowV4_windows.json"
if (Test-Path $WorkflowFile) {
    Write-Host "Importando workflow en n8n..."
    Start-Sleep -Seconds 5
    # Primero se copia el archivo adentro del contenedor y recien despues se
    # intenta el import por CLI (igual que init_lab.sh). Antes este script
    # solo copiaba y no importaba, por lo que habia que hacerlo a mano desde
    # la interfaz de n8n (hallazgo B3, ronda 10 de auditoria independiente).
    docker cp $WorkflowFile "n8n-security-lab:/home/node/.n8n/workflows/workflowV4_windows.json" 2>$null
    docker exec n8n-security-lab n8n import:workflow --input="/home/node/.n8n/workflows/workflowV4_windows.json" 2>$null
    Write-Host "Workflow importado. Abri n8n, activalo y configura las credenciales de Telegram."
} else {
    Write-Host "No se encontro workflows/workflowV4_windows.json - importalo manualmente en n8n."
}

Write-Host ""
Write-Host "Laboratorio Operativo!"
Write-Host "---------------------------------------------------"
Write-Host "  n8n:     http://localhost:5678"
Write-Host "  OpenVAS: http://localhost:9392  (admin / admin123)"
Write-Host "  Mailpit: http://localhost:8025"
Write-Host "---------------------------------------------------"
Write-Host ""
Write-Host "IMPORTANTE: La primera vez, OpenVAS tarda 15-30 minutos"
Write-Host "en sincronizar los feeds de vulnerabilidades."
Write-Host "Si el workflow falla con '404 scan config', espera y reintenta."
Write-Host "---------------------------------------------------"
