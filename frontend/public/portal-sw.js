/* صفحة المركز — إشعارات المركز (طلبه اتأكد، الفني في الطريق، العطل اتصلح) — من غير أي خدمة خارجية */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let m; try { m = e.data ? e.data.json() : {}; } catch (_) { m = { title: 'تحديث على طلبكم', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'تحديث على طلبكم', {
    body: m.body || '', icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png', tag: m.tag || undefined, renotify: !!m.tag,
    dir: 'rtl', lang: 'ar', vibrate: [150, 80, 150], requireInteraction: !!m.urgent, data: { url: m.url || self.registration.scope }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => w.url.indexOf(url) > -1);
    if (c) return c.focus().then(w => { try { w.navigate(url); } catch (_) {} return w; });
    return self.clients.openWindow(url);
  }));
});
