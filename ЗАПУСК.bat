@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Генератор актов АОСР
where python >nul 2>nul
if %errorlevel%==0 (
    python app.py %*
) else (
    py app.py %*
)
echo.
pause
