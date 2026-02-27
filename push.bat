@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM --- Se placer dans le dossier du script (utile si double-clic)
cd /d "%~dp0"

REM --- IMPORTANT : reset (sinon une valeur reste parfois en mémoire dans certains contextes)
set "HASCHANGES="

echo ==========================
echo PARC TGV - AUTO PUSH
echo ==========================
echo Repo: %CD%
echo.

REM --- 1) Verifier git
echo --- git status ---
git status
if errorlevel 1 goto :git_error

REM --- 2) Mettre a jour le dataset depuis Wikipedia
echo.
echo --- Update dataset (Wikipedia) ---
npm run data:tgv:update
if errorlevel 1 goto :npm_error

REM --- 3) Validation simple (si le script existe)
echo.
echo --- Validate dataset ---
npm run data:tgv:validate
if errorlevel 1 goto :npm_error

REM --- 4) Montrer les changements detectes (utile pour debug)
echo.
echo --- git status --porcelain (debug) ---
git status --porcelain

REM --- 5) Verifier s'il y a des changements a committer
for /f %%A in ('git status --porcelain') do set HASCHANGES=1
if not defined HASCHANGES (
  echo.
  echo Rien a commit : working tree propre.
  goto :end
)

REM --- 6) git add
echo.
echo --- git add -A ---
git add -A
if errorlevel 1 goto :git_error

REM --- 7) Message de commit horodate (simple)
set MSG=Update Parc TGV - %date% %time%
set MSG=!MSG:~0,-3!

echo.
echo --- git commit ---
echo Message: "!MSG!"
git commit -m "!MSG!"
if errorlevel 1 goto :git_error

REM --- 8) git push
echo.
echo --- git push ---
git push
if errorlevel 1 goto :git_error

echo.
echo ✅ Push termine.
goto :end

:npm_error
echo.
echo ❌ Erreur npm (update/validate). Arret.
echo.
pause
exit /b 1

:git_error
echo.
echo ❌ Erreur git. Arret.
echo.
pause
exit /b 1

:end
echo.
pause
endlocal