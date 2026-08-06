@echo off
chcp 65001 > nul
title AutoCAD Skills Vault Launcher
echo ===================================================
echo   Запуск приложения AutoCAD Skills Vault
echo ===================================================
echo.

cd /d "%~dp0"

if not exist ".venv" (
    echo [1/3] Создание виртуального окружения Python...
    python -m venv .venv
)

echo [2/3] Проверка и установка зависимостей...
call .venv\Scripts\activate.bat
python -m pip install -r requirements.txt --quiet

echo [3/3] Запуск сервера AutoCAD Skills Vault...
python app.py

pause
