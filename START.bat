@echo off
chcp 65001 >nul
title نظام الحسابات - تشغيل محلي
echo ============================================
echo    نظام الحسابات
echo    تشغيل محلي
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [خطأ] Node.js مش متثبت على الجهاز.
  echo حمّله من: https://nodejs.org  ^(اختار نسخة 22 أو أحدث^)
  pause
  exit /b
)

for /f "tokens=1 delims=v." %%a in ('node -v') do set NODEVER=%%a
if %NODEVER% LSS 22 (
  echo [خطأ] محتاج Node.js نسخة 22 أو أحدث. النسخة الحالية:
  node -v
  echo حمّل أحدث نسخة من: https://nodejs.org
  pause
  exit /b
)

set PORT=8787
set APP_PATH=

echo Node.js: 
node -v
echo المنفذ: %PORT%
echo.
echo بيشتغل... هيفتح المتصفح تلقائياً خلال 3 ثواني
echo ^(لإيقاف البرنامج: اقفل النافذة دي أو اضغط Ctrl+C^)
echo.

start /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:%PORT%/"
node backend\server.js

pause
