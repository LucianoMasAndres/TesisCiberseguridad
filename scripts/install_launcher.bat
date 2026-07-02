@echo off
:: Crea un acceso directo a launcher.py en el escritorio de Windows

set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..
set LAUNCHER=%PROJECT_DIR%\launcher.py
set SHORTCUT=%USERPROFILE%\Desktop\SecurityLab.lnk

:: Verificar que Python esté instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no está instalado o no está en el PATH.
    echo Descargalo desde https://www.python.org/downloads/
    echo Asegurate de marcar "Add Python to PATH" durante la instalación.
    pause
    exit /b 1
)

:: Verificar tkinter
python -c "import tkinter" >nul 2>&1
if errorlevel 1 (
    echo ERROR: tkinter no está disponible.
    echo Reinstalá Python desde https://www.python.org/downloads/ y asegurate
    echo de incluir "tcl/tk and IDLE" en las opciones de instalación.
    pause
    exit /b 1
)

:: Crear acceso directo en el escritorio via PowerShell
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$s = $ws.CreateShortcut('%SHORTCUT%');" ^
  "$s.TargetPath = 'python';" ^
  "$s.Arguments = '\"%LAUNCHER%\"';" ^
  "$s.WorkingDirectory = '%PROJECT_DIR%';" ^
  "$s.Description = 'Security Lab Launcher';" ^
  "$s.Save()"

if exist "%SHORTCUT%" (
    echo.
    echo Acceso directo creado en el escritorio: SecurityLab.lnk
    echo También podés correrlo directamente con:
    echo     python launcher.py
) else (
    echo ERROR: No se pudo crear el acceso directo.
)

pause
