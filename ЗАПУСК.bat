@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "IDV_PY=.venv\Scripts\python.exe"

if not exist "%IDV_PY%" (
  py -3.12 -m venv .venv
)

"%IDV_PY%" -c "import fastapi, uvicorn, sqlalchemy, docx" >nul 2>&1
if errorlevel 1 (
  "%IDV_PY%" -m pip install --upgrade pip
  "%IDV_PY%" -m pip install -r requirements.txt
  if errorlevel 1 goto :error
)

pushd frontend
if not exist node_modules call npm install
if errorlevel 1 goto :error
call npm run build
if errorlevel 1 goto :error
popd

"%IDV_PY%" app.py %*
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo Не удалось запустить ID Vault. Ошибка показана выше.
pause
exit /b 1
