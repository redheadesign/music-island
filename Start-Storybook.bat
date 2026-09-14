@echo off
setlocal

cd /d "%~dp0"
echo Starting Music Island component workshop...
echo It will be available at http://127.0.0.1:6006/
echo Press Ctrl+C in this window to stop it.
echo.

npm run storybook
