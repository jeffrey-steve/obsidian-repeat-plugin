@echo off
echo Building Obsidian Repeat Plugin (FSRS)...
call npm run build
if %errorlevel% neq 0 (
    echo Build failed!
    exit /b %errorlevel%
)

set "TARGET_DIR=D:\notes\.obsidian\plugins\repeat-plugin-fsrs"

if not exist "%TARGET_DIR%" (
    echo Creating plugin directory: %TARGET_DIR%
    mkdir "%TARGET_DIR%"
)

echo Copying files to %TARGET_DIR%...
copy /Y main.js "%TARGET_DIR%\"
copy /Y manifest.json "%TARGET_DIR%\"
copy /Y styles.css "%TARGET_DIR%\"

echo.
echo Plugin installed successfully!
echo You may need to reload Obsidian or the plugin to see changes.
pause
