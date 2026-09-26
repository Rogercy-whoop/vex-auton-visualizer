@echo off
REM Rebuild every time the project's code is saved; then press F5 in the browser.
REM
REM   watch.bat                                 our project
REM   watch.bat -Project "D:\path\to\project"   any team's project folder
REM
REM The work is done by tools\watch.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\watch.ps1" %*
