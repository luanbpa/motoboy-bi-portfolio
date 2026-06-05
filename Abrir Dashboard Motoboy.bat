@echo off
setlocal
set "PROJECT_DIR=%~dp0"
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%Iniciar Dashboard Motoboy.ps1"
endlocal
