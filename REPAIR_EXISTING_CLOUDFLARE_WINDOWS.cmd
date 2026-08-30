@echo off
setlocal
cd /d "%~dp0"
echo AIRUS Cloudflare repair
echo This updates the existing Worker named airus and repairs its D1 binding/schema.
echo.
call DEPLOY_CLOUDFLARE_WINDOWS.cmd
