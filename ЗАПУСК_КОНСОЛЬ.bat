@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Генератор актов АОСР (консоль)
where python >nul 2>nul
if %errorlevel%==0 (
    python generate_aosr.py %*
) else (
    py generate_aosr.py %*
)
echo.
pause
