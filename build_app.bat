@echo off
echo Setting up Visual Studio environment...
call "C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvars64.bat"

if %errorlevel% neq 0 (
    echo Failed to load vcvars64.bat. Please check your Visual Studio installation.
    pause
    exit /b %errorlevel%
)

echo Setting specific linker path to avoid conflict with GNU link...
set "CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=%VCToolsInstallDir%\bin\Hostx64\x64\link.exe"
echo Using Linker: %CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER%

echo Environment set. Running Tauri build...
npx @tauri-apps/cli build

if %errorlevel% neq 0 (
    echo Build failed.
    pause
    exit /b %errorlevel%
)

echo Build successful!
pause
