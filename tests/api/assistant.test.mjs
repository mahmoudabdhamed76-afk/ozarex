/* 4.50 · the in-app assistant: sale returns come off the sales total the same way the
   branch summary does, and the sixteen sharper questions route, respect can(), and
   say so when a collection was never loaded. Branch compare and inter-branch
   transfers call the existing APIs only while online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/public/js/assistant.js'), 'utf8');

function base() {
  return {
    customers: [{ id: 'c1', name: 'مركز النور', balance: 5000, creditLimit: 1000, phone: '01000000000' }],
    products: [
      { id: 'p1', name: 'ورق', unit: 'ورقة', quantity: 80, minQuantity: 0, cost: 6, price: 20 },
      { id: 'p2', name: 'رول حراري', unit: 'رول', quantity: 2, minQuantity: 10, cost: 8, price: 20 }
    ],
    suppliers: [{ id: 's1', name: 'مورد النور', priceList: [{ name: 'رول حراري', price: 5 }] }],
    invoices: [],
    issuances: [
      { id: 'is1', number: 1001, customerId: 'c1', customerName: 'مركز النور', productId: 'p1', productName: 'ورق', quantity: 50, unitPrice: 20, total: 1000, paid: 0, date: '2026-10-05' },
      { id: 'is2', number: 1002, customerId: 'c1', customerName: 'مركز النور', productId: 'p2', productName: 'رول حراري', quantity: 10, unitPrice: 5, total: 50, paid: 0, date: '2026-10-08' }
    ],
    payments: [],
    expenses: [{ id: 'e1', kind: 'purchase', supplierId: 's1', supplierName: 'مورد النور', amount: 400, date: '2026-10-02', paymentMethod: 'credit', dueDate: '2026-10-26', items: [{ name: 'رول حراري', productId: 'p2', qty: 20, price: 20 }] }],
    stockMoves: [],
    bankTransfers: [{ id: 'bt1', type: 'in', customerId: 'c1', customerName: 'مركز النور', amount: 300, date: '2026-10-20', reference: 'TR-9' }],
    supplierPayments: [],
    settings: {
      currency: 'ج', monthlyTarget: 5000, _poLead: 7,
      _returns: [
        { id: 'rt1', type: 'sale', number: 1, date: '2026-10-24', customerId: 'c1', customerName: 'مركز النور', items: [{ productId: 'p1', name: 'ورق', qty: 10, price: 20, total: 200, net: 200 }], amount: 200, refund: 50 },
        { id: 'rt2', type: 'purchase', number: 1, date: '2026-10-20', supplierId: 's1', supplierName: 'مورد النور', items: [{ productId: 'p1', name: 'ورق', qty: 5, total: 100, net: 100 }], amount: 100, refund: 0 }
      ],
      _approvals: [
        { id: 'a1', status: 'pending', title: 'تعديل سعر', page: 'products', kind: 'edit', by: { id: 'u2', name: 'بائع' }, at: 2, no: 4 },
        { id: 'a2', status: 'pending', title: 'حذف فاتورة', page: 'invoices', kind: 'delete', by: { id: 'admin', name: 'المدير' }, at: 3, no: 5 },
        { id: 'a3', status: 'approved', title: 'قديم', by: { id: 'admin', name: 'المدير' }, at: 1 }
      ],
      _requests: [{ id: 'rq1', type: 'po', status: 'pending', title: 'طلب ورق', no: 7, by: { id: 'u2', name: 'بائع' }, items: [{ name: 'ورق', qty: 20, price: 6, supplierName: 'مورد النور' }] }],
      _po: [
        { id: 'po1', status: 'sent', no: 3, date: '2026-10-01', supplierName: 'مورد النور', items: [{ name: 'ورق', qty: 40, price: 6 }] },
        { id: 'po2', status: 'received', no: 2, date: '2026-10-01', supplierName: 'مورد النور', items: [] }
      ],
      _cashCounts: [{ date: '2026-10-20', total: 800 }],
      _cashMoves: [{ dir: 'in', otherName: 'الجيزة', amount: 150, date: '2026-10-18' }]
    }
  };
}

const SAMPLES = [
  'صافي المبيعات بعد المرتجعات',
  'إيه المرتجعات الأسبوع ده؟',
  'فيه موافقات مستنية؟',
  'طلبات الشراء المستنية موافقة',
  'أطلب إيه دلوقتي ومن أنهي مورد؟',
  'طلبات الشراء المفتوحة وصلت؟',
  'هدف الشهر وصلنا لكام؟',
  'مين عدّى حد الائتمان؟',
  'مشتريات الآجل هتستحق إمتى؟',
  'الخزنة متظبطة مع آخر جرد؟',
  'فيه تحويل بنكي لسه متسجلش تحصيل؟',
  'قارن الفروع الشهر ده',
  'فيه تحويلات بين الفروع لسه متستلمتش؟',
  'هيدخل كام من السحب المتوقع الأسبوع ده؟',
  'هامش ربح الأصناف',
  'فيه صرف اتباع تحت التكلفة؟'
];

function boot(data, opts = {}) {
  const calls = [];
  const sandbox = {
    console,
    navigator: { onLine: opts.online !== false },
    fetch: opts.fetch || (async (url) => { calls.push(String(url)); throw new Error('unexpected fetch ' + url); }),
    DB: { data: data },
    can: opts.can || (() => true),
    currentUser: opts.user || { id: 'admin', role: 'admin', name: 'المدير' },
    todayStr: () => '2026-10-24'
  };
  sandbox.window = sandbox;
  if (opts.AXCash) sandbox.AXCash = opts.AXCash;
  if (opts.AXFc) sandbox.AXFc = opts.AXFc;
  if (opts.AXBStats) sandbox.AXBStats = opts.AXBStats;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'assistant.js' });
  sandbox._calls = calls;
  return sandbox;
}
function jsonFetch(body, calls) {
  return async (url) => { calls.push(String(url)); return { ok: true, json: async () => body }; };
}
const clone = (o) => JSON.parse(JSON.stringify(o));
async function ask(box, q) { return Promise.resolve(box.AXA.understand(q)); }
function text(box, r) { return box.AXA.plain(r); }

test('sales money subtracts sale returns and leaves quantity and purchase returns alone', async () => {
  const box = boot(clone(base()));
  const sales = await ask(box, 'مبيعات الشهر ده');
  const plain = text(box, sales);
  assert.equal(sales.title.startsWith('المبيعات'), true);
  assert.match(plain, /850/);
  assert.match(plain, /مرتجعات اتخصمت/);
  assert.match(plain, /200/);
  assert.match(sales.ledger.find((x) => x.l === 'مرتجعات اتخصمت').sub, /1,050/);
  assert.doesNotMatch(plain, /750/);
  const paper = text(box, await ask(box, 'طلعنا قد إيه ورق الشهر ده؟'));
  assert.match(paper, /50/);
  const net = text(box, await ask(box, 'صافي المبيعات بعد المرتجعات'));
  assert.match(net, /قبل المرتجعات/);
  assert.match(net, /1,050/);
  assert.match(net, /200/);
  assert.match(net, /850/);
});

test('a follow-up period stays on the same intent', async () => {
  const box = boot(clone(base()));
  await ask(box, 'صافي المبيعات بعد المرتجعات');
  const nxt = await ask(box, 'والشهر اللي فات');
  assert.match(nxt.title, /صافي/);
  assert.match(nxt.title + (nxt.sub || ''), /فات/);
  const box2 = boot(clone(base()));
  await ask(box2, 'مبيعات الشهر ده');
  const week = await ask(box2, 'والأسبوع ده');
  assert.equal(week.title.startsWith('المبيعات'), true);
  assert.doesNotMatch(week.title, /صافي/);
});

test('old questions keep their routes', async () => {
  const box = boot(clone(base()));
  assert.equal((await ask(box, 'الخزنة فيها كام')).title, 'الخزنة');
  assert.equal((await ask(box, 'مين متأخر في الدفع')).title, 'مفيش حد متأخر');
  const cmp = await ask(box, 'قارن الشهر ده بالشهر اللي فات');
  assert.match(cmp.title, /مقارنة/);
  assert.doesNotMatch(cmp.title, /فروع/);
  assert.equal((await ask(box, 'نطلب')).title, 'حال المخزن');
  assert.match((await ask(box, 'الأرباح الشهر ده')).title, /الأرباح/);
});

test('help lists every new question for an admin, and each one is understood', async () => {
  const calls = [];
  const box = boot(clone(base()), {
    AXFc: { model: () => ({ list: [{ name: 'مركز النور', value: 400, st: 'due', conf: 'high', left: 1 }] }) },
    fetch: jsonFetch({
      branches: [{ id: 'b1', name: 'القاهرة', sales: 100, profit: 10, collections: 10 }],
      total: { sales: 100, profit: 10, collections: 10, treasury: 10 },
      transfers: [{ status: 'sent', kind: 'cash', fromName: 'القاهرة', toName: 'الجيزة', number: 1, amount: 20 }]
    }, calls)
  });
  const help = await ask(box, 'بتعرف تعمل إيه');
  const plain = text(box, help);
  for (const q of SAMPLES) assert.match(plain, new RegExp(q.replace(/[؟]/g, '')), q);
  for (const q of SAMPLES) {
    const r = await ask(box, q);
    assert.notEqual(r.title, 'مش متأكد فهمت', q);
    assert.ok(r.title, q);
    assert.doesNotMatch(text(box, r), /NaN|undefined/);
  }
});

test('net sales and returns, including a synonym and the week', async () => {
  const box = boot(clone(base()));
  const syn = await ask(box, 'المبيعات من غير المرتجعات');
  assert.match(syn.title, /صافي/);
  assert.match(text(box, syn), /850/);
  const week = await ask(box, 'إيه المرتجعات الأسبوع ده؟');
  const wp = text(box, week);
  assert.match(week.title, /المرتجعات/);
  assert.match(wp, /200/);
  assert.match(wp, /مركز النور/);
  assert.doesNotMatch(wp, /مورد النور/);
  const month = text(box, await ask(box, 'حاجات رجعت الشهر ده'));
  assert.match(month, /مورد النور/);
  assert.match(month, /100/);
});

test('returns say the list is not loaded', async () => {
  const data = clone(base());
  delete data.settings._returns;
  const box = boot(data);
  const r = await ask(box, 'إيه المرتجعات');
  assert.match(r.note, /مش محمّلة/);
  const sales = text(box, await ask(box, 'مبيعات الشهر ده'));
  assert.match(sales, /1,050/);
  assert.doesNotMatch(sales, /مرتجعات اتخصمت/);
});

test('approvals and purchase requests: managers see the queue, others see their own', async () => {
  const admin = boot(clone(base()));
  const ap = text(admin, await ask(admin, 'فيه موافقات مستنية؟'));
  assert.match(ap, /تعديل سعر/);
  assert.match(ap, /حذف فاتورة/);
  assert.match(text(admin, await ask(admin, 'موافقات معلقه')), /موافقات/);
  const mine = boot(clone(base()), { user: { id: 'u2', role: 'sales', name: 'بائع' } });
  const own = text(mine, await ask(mine, 'مستني الموافقه'));
  assert.match(own, /تعديل سعر/);
  assert.doesNotMatch(own, /حذف فاتورة/);
  assert.match(own, /طلباتك/);
  const po = text(admin, await ask(admin, 'طلبات الشراء المستنية موافقة'));
  assert.match(po, /طلب ورق/);
  assert.match(po, /مورد النور/);
  assert.match(text(admin, await ask(admin, 'لسه المدير موافقش')), /طلب/);
});

test('approvals are refused or missing when the account cannot see them', async () => {
  const denied = boot(clone(base()), { can: (p) => p !== 'approvals' && p !== 'requests' });
  assert.equal((await ask(denied, 'فيه موافقات مستنية؟')).title, 'القسم ده مش متاح لحسابك');
  const data = clone(base());
  delete data.settings._approvals;
  const missing = boot(data);
  assert.match((await ask(missing, 'في الموافقات')).note, /مش محمّلة/);
});

test('reorder suggestion names the supplier, and open purchase orders show what is late', async () => {
  const box = boot(clone(base()));
  const order = text(box, await ask(box, 'أطلب إيه دلوقتي ومن أنهي مورد؟'));
  assert.match(order, /رول حراري/);
  assert.match(order, /مورد النور/);
  assert.match(text(box, await ask(box, 'اقتراح شراء')), /رول حراري/);
  const open = text(box, await ask(box, 'طلبات الشراء المفتوحة وصلت؟'));
  assert.match(open, /مورد النور/);
  assert.match(open, /متأخر/);
  assert.doesNotMatch(open, /#2/);
  assert.match(text(box, await ask(box, 'اوردرات الشراء')), /مفتوحة|مورد النور/);
});

test('monthly target, credit limit, and credit purchases due this week', async () => {
  const box = boot(clone(base()));
  const goal = text(box, await ask(box, 'هدف الشهر وصلنا لكام؟'));
  assert.match(goal, /5,000/);
  assert.match(goal, /850/);
  assert.match(goal, /فاضل/);
  assert.match(text(box, await ask(box, 'التارجت')), /هدف/);
  const credit = text(box, await ask(box, 'مين عدّى حد الائتمان؟'));
  assert.match(credit, /مركز النور/);
  assert.match(credit, /4,000/);
  assert.match(text(box, await ask(box, 'سقف الدين')), /ائتمان|النور/);
  const due = text(box, await ask(box, 'مشتريات الآجل هتستحق إمتى؟'));
  assert.match(due, /مورد النور/);
  assert.match(due, /400/);
  assert.match(text(box, await ask(box, 'استحقاق الموردين')), /مورد/);
});

test('cash count uses the on-device ledger and never calls the network', async () => {
  const calls = [];
  const box = boot(clone(base()), {
    fetch: async (url) => { calls.push(String(url)); throw new Error('no cash api'); },
    AXCash: { ledger: () => ({ counts: [{ date: '2026-10-20', total: 1000, expected: 1100, diff: -100 }], expectedAt: () => 900 }) }
  });
  const r = await ask(box, 'الخزنة متظبطة مع آخر جرد؟');
  assert.match(r.title, /مش متظبطة/);
  assert.match(text(box, r), /عجز/);
  assert.match(text(box, r), /1,000/);
  assert.equal(calls.length, 0);
  const raw = boot(clone(base()), { fetch: async (url) => { calls.push(String(url)); throw new Error('no'); } });
  const last = await ask(raw, 'جرد الخزنه');
  assert.match(last.title, /جرد/);
  assert.match(text(raw, last), /800/);
  assert.equal(calls.length, 0);
  const data = clone(base());
  delete data.settings._cashCounts;
  assert.match((await ask(boot(data), 'جرد الخزنه')).note, /مش محمّلة/);
});

test('unmatched incoming bank transfers, and a missing list', async () => {
  const box = boot(clone(base()));
  const r = text(box, await ask(box, 'فيه تحويل بنكي لسه متسجلش تحصيل؟'));
  assert.match(r, /300/);
  assert.match(r, /مركز النور/);
  assert.match(r, /TR-9/);
  assert.match(text(box, await ask(box, 'تحويلات بنكيه معلقه')), /تحصيل|300/);
  const data = clone(base());
  delete data.bankTransfers;
  assert.match((await ask(boot(data), 'تحويلات بنكيه معلقه')).note, /مش محمّلة/);
});

test('branch compare calls the summary API online and stays local offline', async () => {
  const calls = [];
  const online = boot(clone(base()), { fetch: jsonFetch({
    branches: [
      { id: 'b1', name: 'القاهرة', sales: 5000, profit: 1200, collections: 4000 },
      { id: 'b2', name: 'الجيزة', sales: 800, profit: 100, collections: 200 }
    ],
    total: { sales: 5800, profit: 1300, collections: 4200, treasury: 900, salesReturns: 200 },
    from: '2026-10-01', to: '2026-10-24'
  }, calls) });
  const r = await ask(online, 'قارن الفروع الشهر ده');
  assert.match(calls[0], /\/api\/branches\/summary\?p=month/);
  const p = text(online, r);
  assert.match(p, /القاهرة/);
  assert.match(p, /الجيزة/);
  assert.match(p, /5,800/);
  assert.match(text(online, await ask(online, 'احسن فرع')), /القاهرة|فروع/);
  const offCalls = [];
  const off = boot(clone(base()), { online: false, fetch: async (url) => { offCalls.push(url); throw new Error('offline'); }, AXBStats: { summary: () => ({ sales: 850, salesReturns: 200, collections: 0, profit: 100, treasury: 10, lowStock: 1 }) } });
  const local = await ask(off, 'قارن الفروع');
  assert.match(local.note, /نت/);
  assert.match(text(off, local), /850/);
  assert.equal(offCalls.length, 0);
  const sales = boot(clone(base()), { user: { id: 'u2', role: 'sales', name: 'بائع' }, fetch: async () => { throw new Error('should not fetch'); } });
  assert.equal((await ask(sales, 'قارن الفروع الشهر ده')).title, 'القسم ده مش متاح لحسابك');
});

test('in-transit branch transfers use /api/transfers online and cash moves offline', async () => {
  const calls = [];
  const online = boot(clone(base()), { fetch: jsonFetch({ transfers: [
    { status: 'sent', kind: 'stock', fromName: 'القاهرة', toName: 'الجيزة', number: 12, items: [{ name: 'ورق', qty: 5 }] },
    { status: 'received', kind: 'cash', amount: 10, number: 1 },
    { status: 'receiving', kind: 'cash', fromName: 'الجيزة', toName: 'القاهرة', number: 4, amount: 250 }
  ] }, calls) });
  const r = text(online, await ask(online, 'فيه تحويلات بين الفروع لسه متستلمتش؟'));
  assert.match(calls[0], /\/api\/transfers/);
  assert.match(r, /القاهرة/);
  assert.match(r, /في الطريق/);
  assert.match(r, /250/);
  assert.doesNotMatch(r, /received/);
  assert.match(text(online, await ask(online, 'بضاعه في الطريق')), /القاهرة|تحويل/);
  const offCalls = [];
  const off = boot(clone(base()), { online: false, fetch: async (url) => { offCalls.push(url); throw new Error('offline'); } });
  const local = await ask(off, 'تحويل بين الفروع لسه متستلمش');
  assert.match(local.note, /نت/);
  assert.match(text(off, local), /الجيزة/);
  assert.match(text(off, local), /150/);
  assert.equal(offCalls.length, 0);
});

test('expected withdrawal value uses the forecast model', async () => {
  const box = boot(clone(base()), { AXFc: {
    model: () => ({ list: [
      { name: 'مركز النور', value: 400, st: 'due', conf: 'high', quiet: true, left: 2 },
      { name: 'بعيد', value: 999, st: 'later', conf: 'low', quiet: false, left: 20 }
    ] }),
    label: (x) => x.st
  } });
  const r = text(box, await ask(box, 'هيدخل كام من السحب المتوقع الأسبوع ده؟'));
  assert.match(r, /400/);
  assert.match(r, /مركز النور/);
  assert.doesNotMatch(r, /999/);
  assert.match(r, /اتكلمنا|كلّمنا/);
  assert.match((await ask(box, 'توقع السحب')).title, /متوقع|سحب/);
  const bare = boot(clone(base()));
  assert.match((await ask(bare, 'السحب المتوقع')).note, /مش محمّلة/);
});

test('margin and below-cost need the profit page, and a product with no cost is skipped', async () => {
  const box = boot(clone(base()));
  const below = text(box, await ask(box, 'فيه صرف اتباع تحت التكلفة؟'));
  assert.match(below, /رول حراري/);
  assert.match(below, /مركز النور/);
  assert.doesNotMatch(below, /ورق ·/);
  assert.match(text(box, await ask(box, 'اقل من التكلفه')), /رول حراري/);
  const one = text(box, await ask(box, 'هامش ربح رول حراري'));
  assert.match(one, /رول حراري/);
  assert.match(one, /8/);
  const all = await ask(box, 'هامش ربح الأصناف');
  assert.match(all.title, /هامش/);
  assert.match(text(box, all), /ورق/);
  await ask(box, 'هامش ربح رول حراري');
  const prev = await ask(box, 'والشهر اللي فات');
  assert.match(prev.title, /هامش/);
  assert.match(prev.title + (prev.sub || ''), /فات|رول/);
  const sales = boot(clone(base()), { user: { id: 'u2', role: 'sales', name: 'بائع' }, can: (p) => !['profit', 'expenses', 'suppliers', 'purchases', 'transfers'].includes(p) });
  assert.equal((await ask(sales, 'فيه صرف اتباع تحت التكلفة؟')).title, 'القسم ده مش متاح لحسابك');
  assert.equal((await ask(sales, 'هامش ربح الأصناف')).title, 'القسم ده مش متاح لحسابك');
  const help = text(sales, await ask(sales, 'بتعرف تعمل إيه'));
  assert.doesNotMatch(help, /تحت التكلفة/);
  assert.doesNotMatch(help, /قارن الفروع/);
  const data = clone(base());
  delete data.products;
  assert.match((await ask(boot(data), 'هامش ربح الأصناف')).note, /مش محمّلة/);
});
