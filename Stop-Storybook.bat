@echo off
setlocal

for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 6006 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($listener) { $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener.OwningProcess); if ($process.CommandLine -match 'storybook') { $listener.OwningProcess } }"`) do (
  echo Stopping Storybook (process %%P)...
  taskkill /PID %%P /T /F >nul
  echo Storybook stopped.
  exit /b 0
)

echo Storybook is not running on http://127.0.0.1:6006/.
