# Launcher for ArtCraft YT Dashboard (layperson-friendly)
# Generates dashboard and starts local server so the page buttons can run updates.

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$dashboardScript = Join-Path $PSScriptRoot "yt-dashboard.mjs"
$daemonScript = Join-Path $PSScriptRoot "yt-daemon.mjs"
$buildScript = Join-Path $PSScriptRoot "yt-build-dataset.mjs"

function Main() {
    Set-Location $root
    Write-Host "Preparando o painel de vídeos..." -ForegroundColor Cyan

    # Ensure merged dataset exists (uses already collected runs)
    if (Test-Path $buildScript) {
        & node $buildScript | Out-Host
    }
    & node $dashboardScript | Out-Host

    # Start daemon if port 8799 not already listening
    $listening = $false
    try {
        $conn = Get-NetTCPConnection -LocalPort 8799 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn) { $listening = $true }
    } catch {}

    if (-not $listening) {
        Write-Host "Iniciando servidor local do painel..." -ForegroundColor Cyan
        Start-Process -FilePath "node" -ArgumentList "`"$daemonScript`" --port 8799" -WorkingDirectory $root -WindowStyle Hidden
        Start-Sleep -Seconds 2
    } else {
        Write-Host "Servidor local já está ativo." -ForegroundColor Green
    }

    # Cache-busting: a stale page in the browser keeps the OLD inline script and
    # every button dies silently. A unique query string forces a fresh load.
    $url = "http://127.0.0.1:8799/?v=$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())"
    Start-Process $url
    Write-Host "Painel aberto: http://127.0.0.1:8799" -ForegroundColor Green
}

Main