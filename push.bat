@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

echo ==========================
echo PARC TGV - AUTO PUSH
echo ==========================
echo Repo: %CD%
echo.

echo [TEST] Verification de git...
where git >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] git introuvable dans le PATH.
  goto :end_fail
)
echo [OK] git trouve.
echo.

echo [TEST] Verification de npm...
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] npm introuvable dans le PATH.
  echo Astuce: si Node est installe mais non detecte, relance Windows.
  goto :end_fail
)
echo [OK] npm trouve.
echo.

echo [TEST] git status...
git status
if errorlevel 1 (
  echo [ERREUR] git status a echoue.
  goto :end_fail
)
echo.

echo [TEST] Update dataset...
call npm run data:tgv:update
if errorlevel 1 (
  echo [ERREUR] npm run data:tgv:update a echoue.
  goto :end_fail
)
echo.

echo [TEST] Validate dataset...
call npm run data:tgv:validate
if errorlevel 1 (
  echo [ERREUR] npm run data:tgv:validate a echoue.
  goto :end_fail
)
echo.

echo [TEST] Verification des changements...
set "HASCHANGES="
for /f %%A in ('git status --porcelain') do set HASCHANGES=1

if not defined HASCHANGES (
  echo Aucun changement detecte. Rien a commit.
  goto :end_ok
)

echo Changements detectes.
echo.

echo [TEST] git add -A...
git add -A
if errorlevel 1 (
  echo [ERREUR] git add -A a echoue.
  goto :end_fail
)
echo.

set "MSG=Update dataset - %date% %time%"
set "MSG=!MSG:~0,-3!"

echo [TEST] git commit...
echo Message: "!MSG!"
git commit -m "!MSG!"
if errorlevel 1 (
  echo [ERREUR] git commit a echoue.
  goto :end_fail
)
echo.

echo [TEST] git push...
git push
if errorlevel 1 (
  echo [ERREUR] git push a echoue.
  goto :end_fail
)

echo.
echo [OK] Push termine.
goto :end_ok

:end_fail
echo.
echo [ECHEC] Erreur bloquante.
pause
exit /b 1

:end_ok
echo.
pause
endlocal
exit /b 0