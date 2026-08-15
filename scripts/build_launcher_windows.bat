@echo off
:: Compila launcher.py como un .exe standalone (no requiere Python en la
:: maquina destino). El resultado queda en dist\SecurityLabLauncher.exe

set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no esta instalado. Este script solo hace falta correrlo
    echo una vez, en la maquina donde se compila el .exe -- no en la del usuario final.
    pause
    exit /b 1
)

echo Instalando PyInstaller...
python -m pip install --quiet pyinstaller

echo Compilando SecurityLabLauncher.exe...
cd /d "%PROJECT_DIR%"
python -m PyInstaller --onefile --windowed --name "SecurityLabLauncher" ^
    --distpath "dist" --workpath "build" --specpath "build" launcher.py

if exist "dist\SecurityLabLauncher.exe" (
    echo.
    echo Listo: dist\SecurityLabLauncher.exe
    echo Copialo a donde quieras -- no necesita Python instalado para correr.
) else (
    echo ERROR: la compilacion fallo.
)
pause
