@echo off
setlocal
cd /d "%~dp0"

set "PY_CMD="
python --version >nul 2>&1
if %ERRORLEVEL% equ 0 set "PY_CMD=python"

if not defined PY_CMD (
    py -3 --version >nul 2>&1
    if %ERRORLEVEL% equ 0 set "PY_CMD=py -3"
)

if not defined PY_CMD (
    where winget >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        echo [SETUP] May chua co Python 3 - dang tu dong cai qua winget...
        winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements
        if exist "%LocalAppData%\Programs\Python\Python311\python.exe" (
            set "PATH=%LocalAppData%\Programs\Python\Python311;%LocalAppData%\Programs\Python\Python311\Scripts;%PATH%"
            set "PY_CMD=python"
        ) else if exist "%ProgramFiles%\Python311\python.exe" (
            set "PATH=%ProgramFiles%\Python311;%ProgramFiles%\Python311\Scripts;%PATH%"
            set "PY_CMD=python"
        )
    )
)

if not defined PY_CMD (
    echo [ERROR] Khong tim thay Python 3. Vui long cai Python 3.10+ roi chay lai start.bat.
    pause
    exit /b 1
)

%PY_CMD% "%~dp0start_system.py" %*
set "RC=%ERRORLEVEL%"
if %RC% neq 0 (
    echo.
    echo [ERROR] Khoi dong that bai ^(ma loi %RC%^).
    pause
)
exit /b %RC%
