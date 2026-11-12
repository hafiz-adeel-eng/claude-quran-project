@echo off
cd /d "%~dp0"
title Meeting Copilot - AI check
node tools\check-claude.js
node tools\check-chatgpt.js
echo.
pause
