@echo off
title cLAWssroom - Advocate's Chambers & Indian Court Portal
echo ====================================================================
echo   cLAWssroom ^| Advocate's Chambers & Indian Court Portal
echo   Jurisdiction: Republic of India
echo ====================================================================
echo Starting local law chambers server on http://localhost:3000 ...

start "" "http://localhost:3000"

set "NODE_CMD="
if exist "%APPDATA%\Antigravity\bin\agy-node.cmd" (
    set "NODE_CMD=%APPDATA%\Antigravity\bin\agy-node.cmd"
) else (
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        set "NODE_CMD=node"
    ) else (
        set "NODE_CMD=agy-node.cmd"
    )
)

"%NODE_CMD%" server.js

pause
