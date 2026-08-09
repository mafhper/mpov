@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
set "FNM="
for /f "delims=" %%I in ('where fnm.exe 2^>nul') do if not defined FNM set "FNM=%%I"
if not defined FNM if exist "%LOCALAPPDATA%\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\fnm.exe" set "FNM=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\fnm.exe"
if not defined FNM (
  powershell.exe -NoProfile -WindowStyle Hidden -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Não encontrei o Node 24 desta máquina. Abra este projeto uma vez por um ambiente técnico para instalar as dependências.','Meu ponto de vista') | Out-Null"
  exit /b 1
)
start "" /min "%FNM%" exec --using=24 node "%~dp0scripts\studio-launcher.mjs"
endlocal
