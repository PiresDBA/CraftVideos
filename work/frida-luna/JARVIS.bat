@echo off
chcp 65001 >nul
cd /d D:\CRAFT\work\frida-luna
py -u jarvis.py %*
echo.
pause
