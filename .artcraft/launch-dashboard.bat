@echo off
:: ArtCraft YT Dashboard Launcher (para leigos)
:: Abre o painel com servidor local para os botões funcionarem (buscar vídeos, atualizar, etc.)

echo.
echo =========================================================
echo  ArtCraft - Painel de Videos por Categoria
echo  (abrindo painel... aguarde alguns segundos)
echo =========================================================
echo.

set SCRIPT_DIR=%~dp0

where node >nul 2>nul
if errorlevel 1 (
    echo ERRO: Node.js nao encontrado.
    echo Instale o Node.js e tente novamente.
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%run-dashboard.ps1" %*

if errorlevel 1 (
    echo.
    echo ERRO ao abrir o painel.
    pause
    exit /b 1
)

echo.
echo Se o navegador nao abriu, acesse: http://127.0.0.1:8799
echo Pode fechar esta janela.
timeout /t 3 >nul
exit /b 0