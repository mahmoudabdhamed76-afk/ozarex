# Smart Ads Manager — نظام إعلانات مستقل

النظام ده مفصول عن تصميم وبيانات البرنامج، وتقدر تنقله لأي برنامج على نفس الـ stack.

| الملف | الدور |
|---|---|
| `backend/src/ads.js` | السيرفر: جداول `ads` و`ad_events` و`ads_meta`، مسارات `/api/ads`، التحقق من البيانات والصلاحيات |
| `frontend/public/js/adscore.js` | المحرك والعرض: Popup / Banner / Floating Card، قواعد الظهور، تسجيل الظهور والضغط، روابط wa.me |
| `frontend/public/css/ads.css` | الشكل: Glassmorphism وحركات دخول وخروج، والألوان من الإعلان نفسه |
| `frontend/public/js/adsadmin.js` | جزء OZAREX: تشغيل المحرك + قسم «إدارة الإعلانات» في الإعدادات |

## التركيب في برنامج تاني
```js
// server.js — بعد التحقق من المستخدم
const ads = require('./src/ads').create({ db, readBody, sendJSON, broadcast });
if (pathname === '/api/ads' || pathname.startsWith('/api/ads/')) return ads.handle(req, res, pathname, me);
```
```js
// الواجهة
SmartAds.init({ api: '', brand: 'OZAREX', user: () => currentUser, page: () => currentPage, blocked: () => false, bottomOffset: () => 0 });
// لما يوصل حدث ads_changed من الـ SSE:
window.dispatchEvent(new CustomEvent('ax:ads-changed'));
```

## المسارات
- `GET /api/ads/feed` — أي مستخدم: الإعلانات النشطة المناسبة له (التاريخ، الجمهور، أقصى عدد مرات) + سجله
- `POST /api/ads/event {id, type: view|click|cta2|close}` — أي مستخدم
- للمدير بس (والسيرفر بيرفض غيره بـ 403):
  - `GET /api/ads` — كل الإعلانات + الإحصائيات
  - `POST /api/ads`
  - `PUT /api/ads/:id`
  - `POST /api/ads/:id/status`
  - `POST /api/ads/:id/duplicate`
  - `POST /api/ads/:id/reset-stats`
  - `DELETE /api/ads/:id`
  - `POST /api/ads/settings {defaultWa}`
