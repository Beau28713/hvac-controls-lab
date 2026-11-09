@echo off
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
  py -3 start_bench.py
) else (
  python start_bench.py
)
if errorlevel 1 pause
