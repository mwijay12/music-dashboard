@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo Install failed. Check the output above.
    pause
    exit /b 1
  )
)
echo Building Timbre app and globe...
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed. Check the output above.
  pause
  exit /b 1
)
echo.
echo Build complete: bundle.js + globe-dist
echo Open index.html directly, or refresh the browser tab.
pause
