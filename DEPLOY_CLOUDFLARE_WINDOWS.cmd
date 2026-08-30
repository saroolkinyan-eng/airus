@echo off
setlocal
cd /d "%~dp0"

echo AIRUS Cloudflare deployment
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 20+ is not installed
  echo Install Node.js and run this file again
  pause
  exit /b 1
)

node -e "const m=+process.versions.node.split('.')[0]; if(m<20){console.error('ERROR: Node.js 20+ is required'); process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)

echo [1/4] Installing dependencies
call npm install
if errorlevel 1 goto :fail

echo [2/4] Checking project
call npm run check
if errorlevel 1 goto :fail

echo [3/4] Cloudflare login
call npx wrangler login
if errorlevel 1 goto :fail

echo [4/4] Deploying Worker and provisioning D1
call npm run deploy
if errorlevel 1 goto :fail

echo.
echo DONE. Open the workers.dev URL shown above and check /healthz
pause
exit /b 0

:fail
echo.
echo Deployment failed. Read CLOUDFLARE_README.txt for troubleshooting
pause
exit /b 1
