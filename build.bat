@echo off
REM ===========================================================================
REM  build.bat -- compile the UNMODIFIED autons.cpp against the mock VEX API
REM ---------------------------------------------------------------------------
REM  Usage:   build.bat            (compiles, then runs "zuo")
REM           build.bat superzuo   (compiles, then runs that routine)
REM
REM  The compiler path is written out in full rather than relying on the system
REM  PATH, so this project has no hidden setup step: if the toolchain moves,
REM  the thing to fix is this visible line.
REM ===========================================================================
setlocal
set DEVKIT=D:\w64devkit\w64devkit\bin
set PATH=%DEVKIT%;%PATH%
set SRC=reference\117V-test-2026-07-27T06-53-04\src

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
vexsim.exe %ROUTINE%
endlocal
