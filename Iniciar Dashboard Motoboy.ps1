$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 8002
$DashboardUrl = "http://localhost:$Port/dashboard_web/"
$PythonCandidates = @(
  "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
  "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe",
  "python"
)

function Get-PythonPath {
  foreach ($candidate in $PythonCandidates) {
    if ($candidate -eq "python") {
      $command = Get-Command python -ErrorAction SilentlyContinue
      if ($command) { return $command.Source }
    } elseif (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }
  throw "Python nao encontrado. Instale Python 3.12 ou ajuste o caminho no arquivo Iniciar Dashboard Motoboy.ps1."
}

function Test-DashboardApi {
  try {
    $response = Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/api/health" -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Stop-DashboardPort {
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -gt 0 } |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($processId in $listeners) {
    if ($processId -ne $PID) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }
}

$Python = Get-PythonPath
$LogDir = Join-Path $ProjectDir "logs"
$OutLogPath = Join-Path $LogDir "dashboard-server.out.log"
$ErrLogPath = Join-Path $LogDir "dashboard-server.err.log"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

$SourceCsv = Join-Path (Split-Path -Parent $ProjectDir) "FINANCAS LUAN(Planilha1).csv"
$RawCsv = Join-Path $ProjectDir "data\raw\financas_luan_motoboy.csv"
if (Test-Path -LiteralPath $SourceCsv) {
  $sourceInfo = Get-Item -LiteralPath $SourceCsv
  $rawInfo = Get-Item -LiteralPath $RawCsv -ErrorAction SilentlyContinue
  if (-not $rawInfo -or $sourceInfo.LastWriteTimeUtc -gt $rawInfo.LastWriteTimeUtc) {
    Copy-Item -LiteralPath $SourceCsv -Destination $RawCsv -Force
  }
}

try {
  $PrepareDataScript = Join-Path $ProjectDir "scripts\prepare_data.py"
  & $Python $PrepareDataScript
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao atualizar os dados processados."
  }
} catch {
  Write-Warning "Os dados processados nao puderam ser atualizados: $($_.Exception.Message)"
}

if (-not (Test-DashboardApi)) {
  Stop-DashboardPort
  Start-Sleep -Milliseconds 700
  Start-Process -FilePath $Python `
    -ArgumentList @("scripts\server.py", [string]$Port) `
    -WorkingDirectory $ProjectDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLogPath `
    -RedirectStandardError $ErrLogPath
}

$ready = $false
for ($attempt = 1; $attempt -le 20; $attempt++) {
  if (Test-DashboardApi) {
    $ready = $true
    break
  }
  Start-Sleep -Milliseconds 500
}

if (-not $ready) {
  Start-Process notepad.exe $ErrLogPath
  throw "Dashboard nao iniciou. Abri o log do servidor para verificacao."
}

$CacheBuster = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
Start-Process "$DashboardUrl?v=$CacheBuster"
