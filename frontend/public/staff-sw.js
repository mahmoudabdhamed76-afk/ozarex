/* الموظفين — إشعارات الموظف (مهمة جديدة، حل جديد في بنك الأعطال، مكافأة، رسالة) — من غير أي خدمة خارجية */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let m; try { m = e.data ? e.data.json() : {}; } catch (_) { m = { title: 'حضوري', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'حضوري', {
    body: m.body || '', icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png', tag: m.tag || undefined, renotify: !!m.tag,
    dir: 'rtl', lang: 'ar', vibrate: [150, 80, 150], requireInteraction: !!m.urgent, data: { url: m.url || '/staff' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => w.url.indexOf('/staff') > -1);
    if (c) return c.focus();
    return self.clients.openWindow('/staff');
  }));
});
