@echo off
setlocal
cd /d "%~dp0"
python "%~dp0start_system.py" %*
set "RC=%ERRORLEVEL%"
if %RC% neq 0 (
    echo.
    echo [ERROR] Khoi dong that bai ^(ma loi %RC%^).
    pause
)
exit /b %RC%
