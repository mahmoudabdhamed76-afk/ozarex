import { test as base, expect } from '@playwright/test';
import { startServer, ADMIN_PASSWORD } from '../helpers/server.mjs';
import { adminLogin, login, send, ops, col, seedOps, createUser, SALES, CLERK } from '../helpers/api.mjs';
import { XSS } from '../fixtures/gen-large-dataset.mjs';

export { expect, ADMIN_PASSWORD, SALES, CLERK };

/* the 25 pages and the title each one must show in the top bar */
export const PAGES = {
  dashboard: 'لوحة التحكم', customers: 'العملاء والمراكز', issuances: 'صرف الورق للمراكز', forecast: 'مواعيد السحب المتوقعة',
  invoices: 'الفواتير', payments: 'التحصيل والمديونيات', aging: 'أعمار الديون', transfers: 'التحويلات البنكية', cheques: 'الشيكات',
  debts: 'سداد المديونية', suppliers: 'الموردين', purchases: 'فواتير المشتريات', inventory: 'إدارة المخازن', stock: 'مخزوني وجرد',
  expenses: 'المصروفات', reports: 'التقارير', monthly: 'تقرير الشهر والتقفيل', profit: 'الأرباح', aiassistant: 'المساعد الذكي',
  approvals: 'طلبات الموافقة', requests: 'الطلبات والمقترحات', users: 'إدارة المستخدمين', audit: 'سجل التعديلات الذكي',
  security: 'الأمان والنسخ الاحتياطي', settings: 'الإعدادات'
};

/* outside services this sandbox / an offline machine cannot reach — not app errors */
const EXTERNAL = /api\.ipify\.org|fonts\.(googleapis|gstatic)\.com|mp3quran\.net|\/api\/market|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_TUNNEL|net::ERR_/;

export async function seedSmall(baseUrl) {
  const admin = (await adminLogin(baseUrl)).token;
  await send(baseUrl, admin, seedOps());
  /* injection probes in every kind of name/note the screens print */
  await send(baseUrl, admin, ops({ cols: {
    customers: col({ added: [{ id: 'c_xss', name: XSS, phone: XSS, address: XSS, balance: 300, customPrices: {} }] }),
    products: col({ added: [{ id: 'p_xss', name: XSS, unit: XSS, quantity: 5, minQuantity: 10, cost: 1, price: 2 }] }),
    suppliers: col({ added: [{ id: 's_xss', name: XSS, phone: XSS }] }),
    invoices: col({ added: [{ id: 'i_xss', number: 1002, customerId: 'c_xss', customerName: XSS, date: '2026-10-04', total: 300, paid: 0, notes: XSS, createdAt: 2,
      items: [{ productId: 'p_xss', productName: XSS, name: XSS, qty: 1, quantity: 1, price: 300, total: 300 }] }] }),
    issuances: col({ added: [{ id: 'is_xss', number: 1001, customerId: 'c_xss', customerName: XSS, productId: 'p_xss', productName: XSS, quantity: 3, unit: 'ورقة', unitPrice: 100, total: 300, paid: 0, date: '2026-10-04', createdAt: 3, items: [] }] }),
    expenses: col({ added: [{ id: 'e_xss', description: XSS, category: XSS, amount: 25, date: '2026-10-03' }] })
  }, counters: { invoice: 1002, issuance: 1001 } }));
  await createUser(baseUrl, admin, SALES);
  await createUser(baseUrl, admin, CLERK);
  await createUser(baseUrl, admin, { id: 'u_acct', username: 'acct', password: 'Acct-Test-Pass-1', name: 'محاسب', role: 'accountant' });
  await createUser(baseUrl, admin, { id: 'u_keep', username: 'keeper', password: 'Keep-Test-Pass-1', name: 'أمين مخزن', role: 'sales', pages: ['stock'] });
  return admin;
}

export const test = base.extend({
  /* one real server per worker, seeded with a small business + XSS probes */
  server: [async ({}, use) => {
    const s = await startServer();
    await seedSmall(s.base);
    await use(s);
    await s.stop();
  }, { scope: 'worker' }],

  /* a page signed in as admin (session cookie + device token, like a returning device) */
  app: async ({ page, server, context }, use) => {
    const l = await login(server.base, 'admin', ADMIN_PASSWORD);
    await openSignedIn(page, context, server.base, l.token);
    await use(page);
  }
});

export async function openSignedIn(page, context, baseUrl, token) {
  const host = new URL(baseUrl).hostname;
  await context.addCookies([{ name: 'emx_sid', value: token, domain: host, path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await page.addInitScript(t => { try { localStorage.setItem('emx_tok', t); } catch (_) { /* private mode */ } }, token);
  await page.goto(baseUrl + '/');
  await waitForApp(page);
}

/* sign in through the real login form (also stores the offline verifier, like a real device) */
export async function formLogin(page, baseUrl, username, password) {
  await page.goto(baseUrl + '/');
  await page.fill('#login-username', username);
  await page.fill('#login-password', password);
  await page.click('#login-form button[type=submit], #login-form .lgn-btn');
  await waitForApp(page);
}

export async function waitForApp(page) {
  await page.waitForFunction(() => {
    const a = document.getElementById('app'), pc = document.getElementById('page-content');
    return a && getComputedStyle(a).display !== 'none' && pc && pc.children.length > 0;
  }, null, { timeout: 30_000 });
}

/* collects page errors and console errors that come from the app itself */
export function watchErrors(page, { allow } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + String(e.message || e).slice(0, 300)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text(), url = (m.location() && m.location().url) || '';
    if (EXTERNAL.test(text) || EXTERNAL.test(url) || (allow && allow.test(text))) return;
    errors.push('console: ' + text.slice(0, 300));
  });
  return errors;
}

export async function horizontalOverflow(page) {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
}

/* ── Phase 3 · reading the device's own storage directly (not through the app) ── */
/* one helper runs inside the page: opens the app's IndexedDB the same way the app does
   (same version, same stores — so it can never leave a half-made database behind), then does `op` */
function idb(page, op, arg) {
  return page.evaluate(async ([op, arg]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('erp-offline', 1);
      r.onupgradeneeded = () => { const d = r.result;
        if (!d.objectStoreNames.contains('sync_queue')) d.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        if (!d.objectStoreNames.contains('data_snapshot')) d.createObjectStore('data_snapshot', { keyPath: 'key' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const run = (store, mode, f) => new Promise((res, rej) => { const tx = db.transaction(store, mode); const q = f(tx.objectStore(store)); let v;
      if (q) q.onsuccess = () => { v = q.result; }; tx.oncomplete = () => res(v); tx.onerror = () => rej(tx.error); });
    try {
      if (op === 'copy') {
        const rec = await run('data_snapshot', 'readonly', s => s.get('snapshot'));
        if (!rec) return null;
        const out = { bytes: (rec.json || '').length, owner: rec.owner, ts: rec.ts, v: rec.v };
        if (arg) out.json = rec.json;
        return out;
      }
      if (op === 'clear') return await run('data_snapshot', 'readwrite', s => s.clear());
      if (op === 'count') return await run('sync_queue', 'readonly', s => s.count());
    } finally { db.close(); }
  }, [op, arg]);
}
/* the offline copy in IndexedDB → { bytes, owner, ts, v, json? } or null */
export const offlineCopy = (page, { withJson = false } = {}) => idb(page, 'copy', withJson);
export const clearOfflineCopy = page => idb(page, 'clear');
export const queuedCount = page => idb(page, 'count').catch(() => -1);
/* everything this origin keeps in localStorage, in characters (keys + values) */
export async function localStorageChars(page) {
  return page.evaluate(() => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || '').length; } return n; });
}
/* while the server is unreachable: reload, type the password on the login form, wait for the saved copy */
export async function reopenOffline(page, username, password, { timeout = 30_000 } = {}) {
  await page.reload().catch(() => {});
  await expect(page.locator('#login-page')).toBeVisible({ timeout: 15_000 });
  await page.fill('#login-username', username);
  await page.fill('#login-password', password);
  const t0 = Date.now();
  await page.click('#login-form button[type=submit], #login-form .lgn-btn');
  await page.waitForFunction(() => {
    const a = document.getElementById('app'), pc = document.getElementById('page-content');
    return a && getComputedStyle(a).display !== 'none' && pc && pc.children.length > 0;
  }, null, { timeout });
  return Date.now() - t0;
}
