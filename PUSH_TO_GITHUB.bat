@echo off
echo ================================
echo   Pushing to GitHub
echo ================================
echo.

cd /d "%~dp0"

echo [1/3] Staging all files...
git add .

echo.
echo [2/3] Creating commit...
git commit -m "Add testing reports, security fixes, and deployment guides"

echo.
echo [3/3] Pushing to GitHub...
git push -u origin main

echo.
echo ================================
echo   Push Complete!
echo ================================
echo.
echo Your code is now on GitHub at:
echo https://github.com/ratnasunil93/ludoadda
echo.
pause
