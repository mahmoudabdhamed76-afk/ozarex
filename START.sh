#!/usr/bin/env bash
set -e
echo "============================================"
echo "   نظام الحسابات"
echo "   تشغيل محلي"
echo "============================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[خطأ] Node.js مش متثبت. حمّله من: https://nodejs.org (نسخة 22+)"
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "[خطأ] محتاج Node.js نسخة 22 أو أحدث. النسخة الحالية: $(node -v)"
  exit 1
fi

export PORT=8787
export APP_PATH=

echo "Node.js: $(node -v)"
echo "المنفذ: $PORT"
echo ""
echo "بيشتغل على: http://localhost:$PORT/"
echo "(لإيقاف البرنامج: Ctrl+C)"
echo ""

# Open browser (macOS / Linux)
( sleep 2.5
  if command -v open >/dev/null 2>&1; then open "http://localhost:$PORT/";
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:$PORT/";
  fi
) &

node backend/server.js
