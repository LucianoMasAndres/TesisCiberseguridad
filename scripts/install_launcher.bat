@echo off
:: Crea un acceso directo en el escritorio de Windows.
:: Si existe el .exe compilado (dist\SecurityLabLauncher.exe) apunta a ese
:: -- no requiere Python instalado. Si no, cae al modo "correr con python"
:: (para desarrollo; requiere python + tkinter).

set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..
set EXE=%PROJECT_DIR%\dist\SecurityLabLauncher.exe
set LAUNCHER=%PROJECT_DIR%\launcher.py
set SHORTCUT=%USERPROFILE%\Desktop\SecurityLab.lnk

if exist "%EXE%" (
    echo Encontrado SecurityLabLauncher.exe -- creando acceso directo...
    powershell -NoProfile -Command ^
      "$ws = New-Object -ComObject WScript.Shell;" ^
      "$s = $ws.CreateShortcut('%SHORTCUT%');" ^
      "$s.TargetPath = '%EXE%';" ^
      "$s.WorkingDirectory = '%PROJECT_DIR%';" ^
      "$s.Description = 'Security Lab Launcher';" ^
      "$s.Save()"
    goto :done
)

echo No se encontro el .exe compilado. Modo desarrollo: se requiere Python.
echo (Para generar el .exe: scripts\build_launcher_windows.bat)
echo.

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

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$s = $ws.CreateShortcut('%SHORTCUT%');" ^
  "$s.TargetPath = 'python';" ^
  "$s.Arguments = '\"%LAUNCHER%\"';" ^
  "$s.WorkingDirectory = '%PROJECT_DIR%';" ^
  "$s.Description = 'Security Lab Launcher';" ^
  "$s.Save()"

:done
if exist "%SHORTCUT%" (
    echo.
    echo Acceso directo creado en el escritorio: SecurityLab.lnk
) else (
    echo ERROR: No se pudo crear el acceso directo.
)
pause
