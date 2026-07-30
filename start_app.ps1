# Attendance App PowerShell Launcher
Set-Location -Path $PSScriptRoot

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host " Starting Attendance Management System & HTTPS Tunnel" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

# Start Python Server in background
Start-Process python -ArgumentList "server.py" -WindowStyle Hidden
Start-Sleep -Seconds 2

Write-Host "Local Server running at: http://localhost:8000" -ForegroundColor Green
Write-Host "Launching Public HTTPS Tunnel for Median.co..." -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Cyan

ssh -o ServerAliveInterval=30 -o StrictHostKeyChecking=no -R 80:127.0.0.1:8000 serveo.net
