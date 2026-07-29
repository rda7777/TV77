@echo off
cd /d "%~dp0"
echo Iniciando servidor de desarrollo Next.js...
call npm run dev
pause
