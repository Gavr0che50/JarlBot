@echo off
setlocal
cd /d "%~dp0"

echo Arret des instances JarlBot precedentes...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'node' -and ($_.CommandLine -match 'index\\.js' -or $_.CommandLine -match 'scripts\\\\launcher\\.js' -or $_.CommandLine -match 'deploy-commands\\.js' -or $_.CommandLine -match 'eva-refresh\\.js') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable.
  echo Installe Node.js 24+ depuis https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installation des dependances JarlBot...
  npm install
  if errorlevel 1 (
    echo Installation echouee. Verifie ta connexion internet puis relance.
    pause
    exit /b 1
  )
)

node scripts\launcher.js
pause
