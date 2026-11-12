@echo off
cd /d "%~dp0"
title Meeting Copilot
echo Starting Meeting Copilot...
echo.
"node_modules\electron\dist\electron.exe" .
if errorlevel 1 (
  echo.
  echo It did not start cleanly.
  echo If this is the first run, close this and run SETUP.bat once.
  echo.
  pause
)
