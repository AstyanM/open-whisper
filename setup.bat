@echo off
setlocal EnableDelayedExpansion

echo.
echo  ============================================
echo    OpenWhisper - Setup Script
echo  ============================================
echo.

REM ---- Step 1: Check Python ----
echo  [1/5] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo    ERROR: Python not found.
    echo    Install Python 3.12+ from https://www.python.org/downloads/
    echo    Make sure to check "Add Python to PATH" during installation.
    exit /b 1
)
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo    Found Python %PYVER%

REM ---- Step 2: Check Node.js ----
echo  [2/5] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo    ERROR: Node.js not found.
    echo    Install Node.js 20+ from https://nodejs.org/
    exit /b 1
)
for /f "tokens=1 delims= " %%v in ('node --version 2^>^&1') do set NODEVER=%%v
echo    Found Node.js %NODEVER%

REM ---- Step 3: Check uv ----
echo  [3/5] Checking uv...
uv --version >nul 2>&1
if errorlevel 1 (
    echo    uv not found. Installing via pip...
    pip install uv >nul 2>&1
    if errorlevel 1 (
        echo    ERROR: Failed to install uv.
        echo    Install manually: pip install uv
        echo    Or see https://docs.astral.sh/uv/getting-started/installation/
        exit /b 1
    )
    echo    uv installed successfully.
) else (
    for /f "tokens=2 delims= " %%v in ('uv --version 2^>^&1') do set UVVER=%%v
    echo    Found uv %UVVER%
)

REM ---- Step 4: Backend setup ----
echo.
echo  [4/5] Setting up backend...
pushd backend

if not exist ".venv" (
    echo    Creating Python virtual environment...
    uv venv --python 3.13 >nul 2>&1
    if errorlevel 1 (
        echo    Python 3.13 not available, trying 3.12...
        uv venv --python 3.12 >nul 2>&1
        if errorlevel 1 (
            echo    ERROR: Could not create venv. Ensure Python 3.12+ is installed.
            popd
            exit /b 1
        )
    )
    echo    Virtual environment created.
) else (
    echo    Virtual environment already exists, skipping.
)

echo    Installing backend dependencies...
uv pip install -e ".[dev]" >nul 2>&1
if errorlevel 1 (
    echo    ERROR: Failed to install backend dependencies.
    popd
    exit /b 1
)
echo    Backend dependencies installed.
popd

REM ---- Step 5: Frontend setup ----
echo.
echo  [5/5] Setting up frontend...
pushd frontend
call npm install >nul 2>&1
if errorlevel 1 (
    echo    ERROR: Failed to install frontend dependencies.
    popd
    exit /b 1
)
echo    Frontend dependencies installed.
popd

REM ---- Config file ----
echo.
if not exist "config.yaml" (
    echo  Creating config.yaml from template...
    copy config.example.yaml config.yaml >nul
    echo    config.yaml created. Edit it to customize settings.
) else (
    echo  config.yaml already exists, skipping.
)

REM ---- MSVC / Cargo config for Tauri builds ----
echo.
echo  Detecting MSVC toolchain for Tauri builds...
call :detect_msvc
if defined MSVC_LINK (
    echo    MSVC %MSVC_VER% found.
    echo    Windows SDK %SDK_VER% found.
    call :generate_cargo_config
    echo    src-tauri\.cargo\config.toml generated.
) else (
    echo    WARNING: Could not auto-detect MSVC toolchain.
    echo    Tauri builds may fail without it.
    echo    Install Visual Studio 2022 with "Desktop development with C++" workload,
    echo    then re-run this script.
)

echo.
echo  ============================================
echo    Setup complete!
echo  ============================================
echo.
echo  Quick start:
echo.
echo    Terminal 1 (backend):   npm run backend
echo    Terminal 2 (frontend):  npm run dev
echo.
echo  Or with Tauri desktop app:
echo.
echo    Terminal 1 (backend):   npm run backend
echo    Terminal 2 (Tauri):     npm run tauri dev
echo.
echo  First startup will download the Whisper model
echo  (~1.5 GB for large-v3-turbo, ~500 MB for small).
echo  ============================================
echo.

exit /b 0

REM ============================================
REM  Subroutines
REM ============================================

:detect_msvc
REM Use vswhere to find Visual Studio installation
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
    exit /b 1
)

for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -property installationPath 2^>nul`) do set VS_PATH=%%i
if not defined VS_PATH exit /b 1

REM Find newest MSVC version
for /f "delims=" %%d in ('dir /b /ad /o-n "%VS_PATH%\VC\Tools\MSVC\" 2^>nul') do (
    set MSVC_VER=%%d
    goto :found_msvc
)
exit /b 1

:found_msvc
set "MSVC_BASE=%VS_PATH%\VC\Tools\MSVC\%MSVC_VER%"
set "MSVC_LINK=%MSVC_BASE%\bin\Hostx64\x64\link.exe"
if not exist "%MSVC_LINK%" exit /b 1

REM Find newest Windows SDK version
set "SDK_BASE=%ProgramFiles(x86)%\Windows Kits\10"
if not exist "%SDK_BASE%\Lib" exit /b 1

for /f "delims=" %%d in ('dir /b /ad /o-n "%SDK_BASE%\Lib\" 2^>nul') do (
    set SDK_VER=%%d
    goto :found_sdk
)
exit /b 1

:found_sdk
exit /b 0

:generate_cargo_config
if not exist "src-tauri\.cargo" mkdir "src-tauri\.cargo"

REM Convert backslashes to double-backslashes for TOML
set "MSVC_LINK_ESC=%MSVC_LINK:\=\\%"
set "MSVC_BASE_ESC=%MSVC_BASE:\=\\%"
set "SDK_BASE_ESC=%SDK_BASE:\=\\%"

(
    echo # Auto-generated by setup.bat — do not commit to git.
    echo # Ensures the correct MSVC linker is used ^(Git's link.exe conflicts^).
    echo.
    echo [target.x86_64-pc-windows-msvc]
    echo linker = "%MSVC_LINK_ESC%"
    echo rustflags = [
    echo     "-Lnative=%MSVC_BASE_ESC%\\lib\\x64",
    echo     "-Lnative=%SDK_BASE_ESC%\\Lib\\%SDK_VER%\\um\\x64",
    echo     "-Lnative=%SDK_BASE_ESC%\\Lib\\%SDK_VER%\\ucrt\\x64",
    echo ]
    echo.
    echo [env]
    echo LIB = "%MSVC_BASE_ESC%\\lib\\x64;%SDK_BASE_ESC%\\Lib\\%SDK_VER%\\um\\x64;%SDK_BASE_ESC%\\Lib\\%SDK_VER%\\ucrt\\x64"
    echo INCLUDE = "%MSVC_BASE_ESC%\\include;%SDK_BASE_ESC%\\Include\\%SDK_VER%\\ucrt;%SDK_BASE_ESC%\\Include\\%SDK_VER%\\um;%SDK_BASE_ESC%\\Include\\%SDK_VER%\\shared"
) > "src-tauri\.cargo\config.toml"

exit /b 0
