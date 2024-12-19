@echo off
setlocal enabledelayedexpansion

:: Get commit message from arguments
set "message=%1"
if "!message!"=="" (
    echo Error: Please provide a commit message
    echo Usage: commit "Your commit message"
    exit /b 1
)

:: Show status before commit
echo.
echo Current Git Status:
git status
echo.

:: Confirm with user
set /p "confirm=Proceed with commit? [Y/N] "
if /i "!confirm!" neq "Y" (
    echo Operation cancelled by user
    exit /b 0
)

:: Add all changes
echo.
echo Adding changes...
git add .

:: Commit with message
echo.
echo Committing changes...

git commit -m %1

:: Push to vercel branch
echo.
echo Pushing to vercel branch...
git push origin vercel

echo.
echo Operation completed successfully!
