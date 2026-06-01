==============================================================
   Ozarex ERP - النسخة النهائية
   Backend + Frontend + SQLite + Docker
==============================================================

  المشاكل المُصلحة في النسخة دي
==============================================================

✅ مشكلة "فشل حفظ البيانات على السيرفر" على Railway:
   - السبب: الملف القديم كان بيستخدم localStorage بحت
     ومافيش أي اتصال بالـ API
   - الحل: استبدلت الـ DB layer بـ fetch API ديناميكي
     يكتشف الـ API_BASE تلقائياً (Railway / Docker / local)

✅ مشكلة الـ Responsive على الموبايل:
   - كل الصفحات دلوقتي بتتكيف 100% مع شاشة الموبايل
   - مفيش Horizontal Scroll
   - كل البطاقات والجداول والفلاتر بتشتغل صح
   - نفس الـ layout بتاع صفحة الفواتير الشغالة

✅ Backend منفصل عن Frontend
   - جداول SQL حقيقية
   - يشتغل في Docker

==============================================================
   الـ Deployment على Railway
==============================================================

(1) ادخل على https://railway.app وسجل دخول

(2) New Project → Deploy from GitHub Repo
    (ارفع الملفات على GitHub أو استخدم Railway CLI)

(3) Railway هيقرأ railway.json تلقائياً ويبني الـ Docker

(4) في تاب "Variables" - متغيرات البيئة:
    
    PORT          - Railway هيحطه تلقائياً، متلمسوش
    APP_PATH      - ''  (فاضي - مهم!)
    HOST          - 0.0.0.0
    DATA_DIR      - /app/data
    NODE_ENV      - production

⚠️ مهم جداً:
   APP_PATH على Railway لازم يكون **فاضي** (string فاضي)
   عشان البرنامج يفتح على رابط Railway مباشرة:
       https://your-app.up.railway.app/
   مش على:
       https://your-app.up.railway.app/EmdadX-ERP/

(5) في تاب "Volumes":
    أضف Volume جديد:
      Mount Path: /app/data
    
    ⚠️ بدون volume، البيانات هتضيع كل deployment!

(6) Generate Domain من تاب "Settings" 
    أو اربط الدومين الخاص بيك

(7) لما يخلص الـ deploy، افتح الرابط:
       https://your-app.up.railway.app/
    
    دخول: admin / admin

==============================================================
   الـ Deployment على Synology (Container Manager)
==============================================================

(1) ارفع الملفات لـ /docker/emdadx-erp على Synology

(2) افتح Container Manager → Project → Create
    - Project name: emdadx-erp
    - Path: /docker/emdadx-erp
    - Source: Use existing docker-compose.yml

(3) اضغط Next → Done

(4) لما يخلص، افتح:
       http://[IP-السينولوجي]:8787/EmdadX-ERP

==============================================================
   التشغيل اللوكال على الكمبيوتر
==============================================================

(1) تأكد من Node.js إصدار 22+
       node -v

(2) من فولدر المشروع:
       node backend/server.js

(3) افتح:
       http://localhost:8787/EmdadX-ERP

==============================================================
   هيكل المشروع
==============================================================

emdadx-final/
├── backend/
│   ├── server.js         السيرفر الرئيسي
│   ├── db/
│   │   ├── index.js          اتصال SQLite
│   │   └── schema.sql        تعريف الجداول
│   └── src/
│       └── bridge.js         ربط blob API بـ SQL
├── frontend/
│   └── public/
│       └── index.html        الواجهة الكاملة
├── data/                     قاعدة البيانات (بتتعمل تلقائياً)
│   └── emdadx.db
├── Dockerfile
├── docker-compose.yml
├── railway.json              إعداد Railway
└── README.txt                الملف ده

==============================================================
   متغيرات البيئة المهمة
==============================================================

| المتغير    | Railway     | Synology       | Local       |
|-----------|-------------|----------------|-------------|
| PORT      | auto        | 8787           | 8787        |
| HOST      | 0.0.0.0     | 0.0.0.0        | 0.0.0.0     |
| APP_PATH  | '' (فاضي)   | /EmdadX-ERP    | /EmdadX-ERP |
| DATA_DIR  | /app/data   | /app/data      | (تلقائي)    |

==============================================================
   API Endpoints
==============================================================

GET  /api/health         فحص حالة السيرفر
GET  /api/data           جلب كل البيانات
POST /api/data           حفظ البيانات
GET  /api/backups        قائمة النسخ الاحتياطية
POST /api/reset          إعادة تعيين البيانات

==============================================================
   حل المشاكل (Troubleshooting)
==============================================================

❌ "فشل حفظ البيانات على السيرفر" على Railway:
   1. تأكد إن APP_PATH متغير وفاضي (= '')
   2. افتح F12 → Network → شوف POST /api/data هل وصل
   3. لو 404 - الـ APP_PATH غلط
   4. لو 500 - شوف Railway Logs

❌ البيانات بتضيع كل ما السيرفر يقفل:
   - لازم تضيف Volume يربط /app/data
   - على Railway: Settings → Volumes
   - على Synology/Docker: docker-compose.yml volume mapping

❌ مفيش اتصال بين Frontend و Backend:
   - تأكد إن الـ HTML بيـ fetch من نفس الـ origin
   - الـ API_BASE في الـ frontend بيتحدد تلقائياً
   - افتح Console (F12) شوف الـ errors

==============================================================
EOF
