@echo off
setlocal
cd /d "%~dp0"

echo AIRUS - fix SESSION_SECRET only
echo This will not recreate or change D1.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed
  pause
  exit /b 1
)

call npm install
if errorlevel 1 goto :fail

call npx wrangler login
if errorlevel 1 goto :fail

echo Creating and uploading a new secure SESSION_SECRET to Worker airus...
node scripts\fix-session-secret.mjs
if errorlevel 1 goto :fail

echo.
echo DONE
echo Open: https://airus.saro-olkinyan.workers.dev/api/health
echo It must show: "session":"configured"
pause
exit /b 0

:fail
echo.
echo FAILED
pause
exit /b 1
