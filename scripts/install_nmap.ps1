#Requires -Version 5
# ===========================================================
#  Laboratorio de Seguridad: Greenbone + n8n
#  Instalador de nmap en el host (Windows)
# ===========================================================

if (Get-Command nmap -ErrorAction SilentlyContinue) {
    $version = nmap --version | Select-Object -First 1
    Write-Host "nmap ya esta instalado: $version"
    exit 0
}

Write-Host "Instalando nmap..."

# Intentar con winget (disponible en Windows 10 1709+ y Windows 11)
if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id Insecure.Nmap -e --silent
    if ($LASTEXITCODE -eq 0) {
        Write-Host "nmap instalado correctamente via winget."
        Write-Host "Reinicia la terminal para que nmap quede disponible en el PATH."
        exit 0
    }
}

# Fallback: chocolatey
if (Get-Command choco -ErrorAction SilentlyContinue) {
    choco install nmap -y
    if ($LASTEXITCODE -eq 0) {
        Write-Host "nmap instalado correctamente via chocolatey."
        exit 0
    }
}

Write-Host "ERROR: No se encontro winget ni chocolatey."
Write-Host "Instala nmap manualmente desde https://nmap.org/download.html"
exit 1
