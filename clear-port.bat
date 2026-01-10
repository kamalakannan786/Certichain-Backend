@echo off
echo Cleaning up port 5000 for CertiChain...

REM Find processes using port 5000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
    if not "%%a"=="0" (
        echo Killing process %%a using port 5000...
        taskkill /PID %%a /F >nul 2>&1
    )
)

REM Verify port is free
netstat -ano | findstr :5000 >nul
if %errorlevel% equ 0 (
    echo ❌ Port 5000 still in use
) else (
    echo ✅ Port 5000 is now free
)

echo Ready to start CertiChain server!
pause