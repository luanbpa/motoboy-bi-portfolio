@echo off
setlocal

set "PROJECT_DIR=%~dp0"
set "PYTHON_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
set "PORT=8002"
set "URL=http://localhost:%PORT%/dashboard_web/"

if not exist "%PYTHON_EXE%" (
  set "PYTHON_EXE=python"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$port=%PORT%; $project='%PROJECT_DIR%'; $python='%PYTHON_EXE%';" ^
  "if (-not (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue)) {" ^
  "  Start-Process -FilePath $python -ArgumentList @('scripts\server.py', [string]$port) -WorkingDirectory $project -WindowStyle Hidden;" ^
  "  Start-Sleep -Seconds 2" ^
  "};" ^
  "Start-Process '%URL%'"

endlocal
