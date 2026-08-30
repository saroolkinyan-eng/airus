@echo off
setlocal
cd /d "%~dp0"

echo AIRUS Cloudflare full repair/deploy
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 20+ is not installed
  echo Install Node.js LTS and run this file again
  pause
  exit /b 1
)

node -e "const m=+process.versions.node.split('.')[0]; if(m<20){console.error('ERROR: Node.js 20+ is required'); process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)

echo [1/4] Installing Wrangler
call npm install
if errorlevel 1 goto :fail

echo [2/4] Checking project files
call npm run check
if errorlevel 1 goto :fail

echo [3/4] Signing in to Cloudflare
call npx wrangler login
if errorlevel 1 goto :fail

echo [4/4] Creating or repairing D1, applying schema, deploying Worker and configuring session secret
call npm run provision
if errorlevel 1 goto :fail

echo.
echo DONE
 echo Check: https://airus.saro-olkinyan.workers.dev/api/health
 echo Login: https://airus.saro-olkinyan.workers.dev/admin/login
 echo.
pause
exit /b 0

:fail
echo.
echo DEPLOYMENT FAILED
 echo Copy the last red error from this window if you need help
pause
exit /b 1
