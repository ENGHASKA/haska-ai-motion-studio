@echo off
setlocal
cd /d "%~dp0"
node scripts\studio.mjs %*
exit /b %ERRORLEVEL%
