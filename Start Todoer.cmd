@echo off
rem Double-click to start Todoer. Keep this window open: closing it stops Todoer.
cd /d "%~dp0"
call npm start
pause
