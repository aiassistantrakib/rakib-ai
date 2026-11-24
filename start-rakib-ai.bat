@echo off
title RAKIB AI
cd /d "%~dp0"
echo ============================================
echo   RAKIB AI chalu hocche... (http://localhost:7788)
echo   Bondho korte ei window-e Ctrl+C chapun
echo ============================================
start "" http://localhost:7788
node server.js
pause
