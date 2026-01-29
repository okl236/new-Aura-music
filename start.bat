@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
set "NODE_DIR=%SCRIPT_DIR%NODE"
set "NODE_MODULES_DIR=%NODE_DIR%\node_modules"
set "NODE_INSTALLER=node-v24.12.0-x64.msi"

echo Starting Music Player...
echo.

where node >nul 2>nul
if not errorlevel 1 goto NODE_READY

if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    goto NODE_READY
)
if defined ProgramFiles(x86) (
    if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
        goto NODE_READY
    )
)

echo Node.js not detected in PATH. Auto downloading and installing... (Internet required)
if not exist "%NODE_INSTALLER%" (
    echo Downloading Node.js installer...
    powershell -Command "try { Invoke-WebRequest -Uri 'https://nodejs.org/dist/v24.12.0/node-v24.12.0-x64.msi' -OutFile '%NODE_INSTALLER%' -UseBasicParsing } catch { exit 1 }"
    if errorlevel 1 (
        echo Failed to download Node.js. Please check network or firewall.
        goto :END
    )
) else (
    echo Node.js installer already exists. Skip download.
)
echo Installing Node.js silently. Please wait...
msiexec /i "%NODE_INSTALLER%" /qn /norestart
if errorlevel 1 (
    echo Silent install of Node.js failed. Please run "%NODE_INSTALLER%" manually.
    goto :END
)
echo Node.js installation finished. Rechecking...
where node >nul 2>nul
if errorlevel 1 (
    echo Still cannot detect Node.js. Please restart Windows or check installation.
    goto :END
)

:NODE_READY

if not exist "%NODE_DIR%" (
    mkdir "%NODE_DIR%"
)

if exist "%NODE_MODULES_DIR%" (
    echo Found "%NODE_MODULES_DIR%". Skip dependency installation.
) else (
    echo "%NODE_MODULES_DIR%" not found. Preparing to install dependencies...
    if exist "%SCRIPT_DIR%node_modules" (
        echo Found root node_modules. Moving to NODE folder...
        move /Y "%SCRIPT_DIR%node_modules" "%NODE_DIR%" >nul
    ) else (
        echo No node_modules in root. Running "npm install"...
        call npm install
        if errorlevel 1 (
            echo "npm install" failed. Please check network or npm config.
            goto :END
        )
        echo Dependencies installed. Moving node_modules to NODE folder...
        if exist "%SCRIPT_DIR%node_modules" (
            move /Y "%SCRIPT_DIR%node_modules" "%NODE_DIR%" >nul
        )
    )
)

set "NODE_PATH=%NODE_MODULES_DIR%"

echo.
echo *******************************
echo  Starting backend: node server.js
echo  Wait for console output:
echo  "Server running on http://localhost:XXXX"
echo  Then open this URL in your browser.
echo *******************************
echo.

node server.js

:END
echo.
echo Press any key to close this window...
pause >nul

endlocal
