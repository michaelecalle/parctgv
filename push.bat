@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM --- Se placer dans le dossier du script
cd /d "%~dp0"

echo ==========================
echo tgv-parc - AUTO PUSH
echo ==========================

REM --- 1) git status
echo.
echo --- git status ---
git status
if errorlevel 1 goto :git_error

REM --- 2) Vérifier s'il y a quelque chose a commit
for /f %%A in ('git status --porcelain') do set HASCHANGES=1
if not defined HASCHANGES (
  echo.
  echo Rien a commit : working tree propre.
  goto :end
)

REM --- 3) Generer buildInfo.ts (date/heure)
set BUILD_TIME=%date% %time%
set BUILD_TIME=%BUILD_TIME:~0,-3%

echo export const BUILD_TIME = "%BUILD_TIME%";> src\buildInfo.ts
echo export const BUILD_HASH = "";>> src\buildInfo.ts

echo.
echo --- buildInfo.ts genere ---
type src\buildInfo.ts

REM --- 4) git add
echo.
echo --- git add -A ---
git add -A
if errorlevel 1 goto :git_error

REM --- 5) Commit horodaté
set MSG=Commit du %date% %time%
set MSG=!MSG:~0,-3!

echo.
echo --- git commit ---
echo Message: "!MSG!"
git commit -m "!MSG!"
if errorlevel 1 goto :git_error

REM --- 6) Recuperer le hash du commit
for /f %%H in ('git rev-parse --short HEAD') do set HASH=%%H

REM --- 7) Mettre a jour BUILD_HASH et recommit si le fichier a change
echo export const BUILD_TIME = "%BUILD_TIME%";> src\buildInfo.ts
echo export const BUILD_HASH = "%HASH%";>> src\buildInfo.ts

git add src\buildInfo.ts >nul 2>nul
git diff --cached --quiet
if errorlevel 1 (
  echo.
  echo --- buildInfo.ts (hash) mis a jour : %HASH% ---
  git commit -m "build: %HASH%"
  if errorlevel 1 goto :git_error
)

REM --- 8) Push
echo.
echo --- git push ---
git push
if errorlevel 1 goto :git_error

echo.
echo ✅ Push termine.
goto :end

:git_error
echo.
echo ❌ Erreur git. Arret.
exit /b 1

:end
echo.
pause
endlocal