#Requires -Version 5
# ===========================================================
#  Laboratorio de Seguridad: Greenbone + n8n
#  Script de inicio automatico (Windows)
# ===========================================================

$ProjectDir = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectDir

Write-Host "Iniciando Laboratorio Completo (Greenbone + n8n)..."
Write-Host "Directorio del proyecto: $ProjectDir"

# 1. Levantar el stack
Write-Host "Levantando contenedores..."
docker compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: docker compose fallo. Revisa los logs de arriba."
    exit 1
}

$GvmdContainer = "greenbone-community-edition-gvmd-1"

# 2. Espera inteligente - espera el socket de gvmd
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

# 3. Configurar usuario admin
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

# 4. Importar workflow en n8n
$WorkflowFile = Join-Path $ProjectDir "workflows\workflowV4_windows.json"
if (Test-Path $WorkflowFile) {
    Write-Host "Importando workflow en n8n..."
    Start-Sleep -Seconds 5
    docker cp $WorkflowFile "n8n-security-lab:/home/node/.n8n/workflows/workflowV4_windows.json" 2>$null
    Write-Host "Workflow copiado. Abri n8n y configura las credenciales de Telegram."
} else {
    Write-Host "No se encontro workflows/workflowV3.json - importalo manualmente en n8n."
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
