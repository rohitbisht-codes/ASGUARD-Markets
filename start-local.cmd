@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title ASGARD Markets - Local Launcher
set "GXX=C:\msys64\ucrt64\bin\g++.exe"
set "PATH=C:\msys64\ucrt64\bin;C:\msys64\usr\bin;%PATH%"
if not exist "%GXX%" (echo [ERROR] GCC missing at %GXX%&pause&exit /b 1)
where node >nul 2>nul
if errorlevel 1 (echo [ERROR] Node.js missing from PATH.&pause&exit /b 1)

echo [0/5] Stopping stale ASGARD processes that can lock the C++ executable...
taskkill /F /IM matching_engine.exe >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%P >nul 2>&1

echo [1/5] Compiling C++ matching engine...
if exist "engine\matching_engine.new.exe" del /F /Q "engine\matching_engine.new.exe" >nul 2>&1
"%GXX%" -std=c++17 -O2 -Wall -Wextra -I "engine\include" "engine\src\engine.cpp" "engine\src\main.cpp" -o "engine\matching_engine.new.exe"
if errorlevel 1 (echo [ERROR] C++ compile failed. Close antivirus quarantine or check folder permissions.&pause&exit /b 1)
if exist "engine\matching_engine.exe" del /F /Q "engine\matching_engine.exe" >nul 2>&1
move /Y "engine\matching_engine.new.exe" "engine\matching_engine.exe" >nul
if errorlevel 1 (echo [ERROR] Could not replace engine executable. Check Windows file permissions.&pause&exit /b 1)

echo [2/5] Building C++ tests...
"%GXX%" -std=c++17 -O2 -Wall -Wextra -I "engine\include" "engine\src\engine.cpp" "tests\engine\engine_tests.cpp" -o "tests\engine\engine_tests.exe"
if errorlevel 1 (echo [ERROR] Tests failed to compile.&pause&exit /b 1)
"tests\engine\engine_tests.exe"
if errorlevel 1 (echo [ERROR] Engine tests failed.&pause&exit /b 1)

echo [3/5] Installing npm packages if missing...
if not exist "server\node_modules" (pushd server&call npm.cmd install&if errorlevel 1 (popd&pause&exit /b 1)&popd)
if not exist "frontend\node_modules" (pushd frontend&call npm.cmd install&if errorlevel 1 (popd&pause&exit /b 1)&popd)

echo [4/5] Starting ASGARD API and website...
start "ASGARD API - KEEP OPEN" /D "%~dp0server" cmd /k "set PATH=C:\msys64\ucrt64\bin;C:\msys64\usr\bin;%PATH%&&npm.cmd start"
start "ASGARD WEBSITE - KEEP OPEN" /D "%~dp0frontend" cmd /k "npm.cmd run dev"
echo.
echo [5/5] Open http://localhost:5173
 echo API health: http://localhost:3001/api/health
echo Keep both service windows open while testing locally.
pause
