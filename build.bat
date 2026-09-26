@echo off
REM Compile a VEXcode project against the mock and record every routine.
REM
REM   build.bat                                   our project
REM   build.bat -Project "D:\path\to\project"     any team's project folder
REM   build.bat -Project "..." -Profile "x.json"  with an explicit robot profile
REM
REM The work is done by tools\build.ps1 -- see the notes at the top of it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\build.ps1" %*
