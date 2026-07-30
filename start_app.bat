@echo off
title Attendance Management System Launcher
echo ===================================================
echo  Starting Attendance Management System & HTTPS Tunnel
echo ===================================================
cd /d "%~dp0"

echo [1/2] Launching Python API & Web Server...
start /b python server.py

timeout /t 2 >nul

echo [2/2] Launching Public HTTPS Tunnel...
echo ===================================================
echo Access Locally at: http://localhost:8000
echo Public HTTPS URL will appear below:
echo ===================================================
echo.
ssh -o ServerAliveInterval=30 -o StrictHostKeyChecking=no -R 80:127.0.0.1:8000 serveo.net
