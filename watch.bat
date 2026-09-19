@echo off
REM ===========================================================================
REM  watch.bat -- rebuild whenever autons.cpp is saved
REM ---------------------------------------------------------------------------
REM  Leave this running in a terminal while you edit in VEXcode. Every time you
REM  press Ctrl+S it recompiles and rewrites out/logs.js; then press F5 in the
REM  browser to see the new path.
REM
REM  The page cannot reload itself: a file:// page is not allowed to poll a
REM  local file for changes (the same browser rule that made logs.js a script
REM  instead of JSON). F5 is the one manual step that rule costs us.
REM
REM  Ctrl+C to stop.
REM ===========================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set LIVE=%USERPROFILE%\Desktop\117V-test-2026-07-27T06-53-04\src\autons.cpp
if not exist "%LIVE%" set LIVE=reference\117V-test-2026-07-27T06-53-04\src\autons.cpp

echo watching %LIVE%
echo press Ctrl+C to stop
echo.

set LAST=
:loop
for %%F in ("%LIVE%") do set STAMP=%%~tF
if not "!STAMP!"=="!LAST!" (
  set LAST=!STAMP!
  echo.
  echo [%TIME:~0,8%] change detected, rebuilding...
  call build.bat
  echo [%TIME:~0,8%] done -- press F5 in the browser
)
timeout /t 2 /nobreak >nul
goto loop
