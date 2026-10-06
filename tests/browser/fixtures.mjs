import { test as base, expect } from '@playwright/test';
import { startServer, ADMIN_PASSWORD } from '../helpers/server.mjs';
import { adminLogin, login, send, ops, col, seedOps, createUser, SALES } from '../helpers/api.mjs';
import { XSS } from '../fixtures/gen-large-dataset.mjs';

export { expect, ADMIN_PASSWORD, SALES };

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
