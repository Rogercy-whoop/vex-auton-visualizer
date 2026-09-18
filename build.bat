@echo off
REM ===========================================================================
REM  build.bat -- compile the UNMODIFIED autons.cpp against the mock VEX API
REM ---------------------------------------------------------------------------
REM  Usage:   build.bat              compile, run every routine, write out/logs.js
REM           build.bat superzuo     compile, run only that routine
REM
REM  SOURCE OF TRUTH
REM    The live VEXcode project on the Desktop is compiled directly, so the
REM    file being simulated is the very file that gets uploaded to the brain.
REM    Its seven relevant files are also copied into reference/ on every build,
REM    so the repository's snapshot never drifts from the real project and
REM    `git diff` shows exactly how the autons changed between commits.
REM
REM    If the live project is not present (e.g. on another machine), the build
REM    falls back to the snapshot in reference/ and says so.
REM
REM  The compiler path is spelled out in full rather than relying on the
REM  system PATH: no hidden setup step, and if the toolchain moves the thing
REM  to fix is this one visible line.
REM
REM  %USERPROFILE% is used instead of the literal path because the path
REM  contains non-ASCII characters and batch files are read in the system
REM  code page; an environment variable sidesteps the encoding entirely.
REM ===========================================================================
setlocal
REM Always run from the folder this file lives in, wherever it was launched from.
cd /d "%~dp0"

set DEVKIT=D:\w64devkit\w64devkit\bin
set PATH=%DEVKIT%;%PATH%

set LIVE=%USERPROFILE%\Desktop\117V-test-2026-07-27T06-53-04
set SNAP=reference\117V-test-2026-07-27T06-53-04

if exist "%LIVE%\src\autons.cpp" (
  set SRC=%LIVE%\src
  echo [src] live VEXcode project
  REM keep the repository snapshot current
  copy /Y "%LIVE%\src\autons.cpp"                   "%SNAP%\src\"                >nul
  copy /Y "%LIVE%\src\autofunction.cpp"             "%SNAP%\src\"                >nul
  copy /Y "%LIVE%\src\main.cpp"                     "%SNAP%\src\"                >nul
  copy /Y "%LIVE%\src\user.cpp"                     "%SNAP%\src\"                >nul
  copy /Y "%LIVE%\src\robot-config.cpp"             "%SNAP%\src\"                >nul
  copy /Y "%LIVE%\src\auto-Template\drive.cpp"      "%SNAP%\src\auto-Template\"  >nul
  copy /Y "%LIVE%\src\auto-Template\PID.cpp"        "%SNAP%\src\auto-Template\"  >nul
  copy /Y "%LIVE%\src\auto-Template\util.cpp"       "%SNAP%\src\auto-Template\"  >nul
  copy /Y "%LIVE%\include\auto-Template\drive.h"    "%SNAP%\include\auto-Template\" >nul
) else (
  set SRC=%SNAP%\src
  echo [src] live project not found, using repository snapshot
)

set ROUTINE=%1
if "%ROUTINE%"=="" set ROUTINE=--all

echo [1/2] compiling...
g++ -std=c++17 -I mock -o vexsim.exe ^
    mock\recorder.cpp ^
    mock\devices.cpp ^
    mock\drive.cpp ^
    harness\main_sim.cpp ^
    "%SRC%\autons.cpp" ^
    "%SRC%\autofunction.cpp" ^
    "%SRC%\auto-Template\util.cpp"
if errorlevel 1 (
  echo COMPILE FAILED
  exit /b 1
)

echo [2/2] running %ROUTINE%...
.\vexsim.exe %ROUTINE%
endlocal
