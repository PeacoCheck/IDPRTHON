@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "IDV_PY=.venv\Scripts\python.exe"
set "AC_DIR=%~dp0..\autocad"
set "AC_PY=%AC_DIR%\.venv\Scripts\python.exe"

echo ID Vault - Launcher
echo ===================

if exist "%IDV_PY%" goto :main_venv_ok
echo Creating virtual environment for main project...
py -3.12 -m venv .venv
if not exist "%IDV_PY%" python -m venv .venv
if not exist "%IDV_PY%" goto :error
:main_venv_ok

"%IDV_PY%" -c "import fastapi, uvicorn, sqlalchemy, docx" >nul 2>&1
if not errorlevel 1 goto :main_reqs_ok
echo Installing dependencies for main project...
"%IDV_PY%" -m pip install --upgrade pip --quiet
"%IDV_PY%" -m pip install -r requirements.txt --quiet
if errorlevel 1 goto :error
:main_reqs_ok

if exist "%AC_PY%" goto :ac_venv_ok
echo Creating virtual environment for AutoCAD service...
py -3.12 -m venv "%AC_DIR%\.venv"
if not exist "%AC_PY%" python -m venv "%AC_DIR%\.venv"
if not exist "%AC_PY%" goto :error
:ac_venv_ok

"%AC_PY%" -c "import fastapi, uvicorn, sqlalchemy, win32com" >nul 2>&1
if not errorlevel 1 goto :ac_reqs_ok
echo Installing dependencies for AutoCAD service...
"%AC_PY%" -m pip install --upgrade pip --quiet
"%AC_PY%" -m pip install -r "%AC_DIR%\requirements.txt" --quiet
if errorlevel 1 goto :error
:ac_reqs_ok

echo Building frontend...
pushd frontend
if not exist node_modules call npm install --silent
if errorlevel 1 goto :error_popd
call npm run build
if errorlevel 1 goto :error_popd
popd
goto :frontend_ok

:error_popd
popd
goto :error

:frontend_ok

echo Starting AutoCAD service...
start "AutoCAD Skills Vault" cmd /k ""%AC_PY%" "%AC_DIR%\app.py" --port 8770 --no-browser"

echo Starting main ID Vault...
"%IDV_PY%" app.py --port 8765
if errorlevel 1 goto :error
exit /b 0

:error
echo Launch failed.
pause
exit /b 1
