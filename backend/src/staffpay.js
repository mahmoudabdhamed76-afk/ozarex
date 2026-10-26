'use strict';
/* 4.70 · المرتبات — خصم تأخير وغياب، إضافي، مكافآت، سلف بالأقساط، تسويات، كشف مرتب.
   Computed on the fly from attendance (report()) + staff_reward + the tables below; nothing here changes attendance. */
module.exports = function ({ db, report, rulesOf, cfg, cfgSet, str, fail, log, nowLocal }) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS staff_pay_emp (emp_id TEXT PRIMARY KEY, salary REAL NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS staff_loan (
    id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, total REAL NOT NULL, n INTEGER NOT NULL, start_month TEXT NOT NULL,
    note TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT, created_by TEXT
  );
  CREATE TABLE IF NOT EXISTS staff_adj (
    id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, month TEXT NOT NULL, kind TEXT NOT NULL, amount REAL NOT NULL,
    note TEXT, created_at TEXT, created_by TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_staff_adj ON staff_adj (month, emp_id);
  `);
  const PAY_DEF = { pay_days: '30', late_mult: '1', absent_mult: '1', ot_mult: '1.5' };
  const pc = k => { const v = Number(cfg(k) != null ? cfg(k) : PAY_DEF[k]); return Number.isFinite(v) ? v : Number(PAY_DEF[k]); };
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const isMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
  const mIdx = m => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
  const money = v => { const n = Number(v); if (!Number.isFinite(n) || n <= 0 || n > 10000000) fail(400, 'اكتب مبلغ صحيح'); return r2(n); };
  const empOf = id => db.prepare('SELECT * FROM staff_emp WHERE id = ?').get(str(id, 20)) || fail(404, 'الموظف مش موجود');

  /* a loan's installment in a month (0 when it isn't due) — the last one takes the rounding remainder */
  function instOf(l, month) {
    const i = mIdx(month) - mIdx(l.start_month);
    if (i < 0 || i >= l.n) return 0;
    const per = r2(l.total / l.n);
    return i === l.n - 1 ? r2(l.total - per * (l.n - 1)) : per;
  }
  function loanOut(l, month) {
    const i = mIdx(month) - mIdx(l.start_month), paidN = Math.max(0, Math.min(l.n, i + 1));
    let paid = 0; for (let k = 0; k < paidN; k++) paid += instOf(l, addM(l.start_month, k));
    return Object.assign({}, l, { per: r2(l.total / l.n), paid: r2(paid), left: r2(l.total - paid), due: instOf(l, month), end_month: addM(l.start_month, l.n - 1), done: i >= l.n - 1 });
  }
  function addM(m, k) { const x = mIdx(m) + k; return Math.floor(x / 12) + '-' + String((x % 12) + 1).padStart(2, '0'); }

  function payroll(month) {
    const m = isMonth(month) ? month : nowLocal().date.slice(0, 7);
    const rep = report(m), days = Math.max(1, pc('pay_days')), lm = pc('late_mult'), am = pc('absent_mult'), om = pc('ot_mult');
    const sal = {}; db.prepare('SELECT * FROM staff_pay_emp').all().forEach(r => { sal[r.emp_id] = r.salary; });
    const rw = {}; db.prepare("SELECT emp_id, SUM(amount) AS s FROM staff_reward WHERE substr(created_at,1,7) = ? GROUP BY emp_id").all(m).forEach(r => { rw[r.emp_id] = r.s || 0; });
    const adjs = db.prepare('SELECT a.*, e.name AS emp_name FROM staff_adj a JOIN staff_emp e ON e.id = a.emp_id WHERE a.month = ? ORDER BY a.id DESC').all(m);
    const loans = db.prepare('SELECT l.*, e.name AS emp_name FROM staff_loan l JOIN staff_emp e ON e.id = l.emp_id WHERE l.active = 1 ORDER BY l.id DESC').all().map(l => loanOut(l, m));
    const rows = [];
    for (const r of rep.rows) {
      if (!r.active) continue;
      const e = db.prepare('SELECT * FROM staff_emp WHERE id = ?').get(r.id), R = rulesOf(e), hours = Math.max(1, R.len / 60);
      const salary = r2(sal[r.id] || 0), daily = salary / days, hourly = daily / hours;
      const lateDed = r2(r.lateMin / 60 * hourly * lm), absDed = r2(r.absent * daily * am), ot = r2(r.over / 60 * hourly * om);
      const rewards = r2(rw[r.id] || 0);
      const mine = adjs.filter(a => a.emp_id === r.id);
      const bonus = r2(mine.filter(a => a.kind === 'bonus').reduce((t, a) => t + a.amount, 0)), ded = r2(mine.filter(a => a.kind === 'deduct').reduce((t, a) => t + a.amount, 0));
      const inst = r2(loans.filter(l => l.emp_id === r.id).reduce((t, l) => t + l.due, 0));
      const gross = r2(salary + ot + rewards + bonus), cut = r2(lateDed + absDed + ded + inst);
      rows.push({ emp_id: r.id, name: r.name, job: r.job, salary, set: salary > 0, present: r.present, absent: r.absent, expected: r.expected, late: r.late, lateMin: r.lateMin, overMin: r.over,
        daily: r2(daily), hourly: r2(hourly), lateDed, absDed, ot, rewards, bonus, ded, inst, gross, cut, net: r2(gross - cut) });
    }
    const tot = k => r2(rows.reduce((t, x) => t + x[k], 0));
    return { month: m, rows, adjs, loans, cfg: { pay_days: days, late_mult: lm, absent_mult: am, ot_mult: om },
      totals: { salary: tot('salary'), ot: tot('ot'), rewards: tot('rewards'), bonus: tot('bonus'), lateDed: tot('lateDed'), absDed: tot('absDed'), ded: tot('ded'), inst: tot('inst'), net: tot('net') } };
  }

  async function route(req, res, p, who, body, send, q) {
    if (req.method === 'GET') {
      if (p === '/pay') return send(200, payroll(q.get('month'))), true;
      return false;
    }
    if (!p.startsWith('/pay/')) return false;
    const b = await body();
    if (p === '/pay/salary') {
      const e = empOf(b.emp_id), s = Number(b.salary);
      if (!Number.isFinite(s) || s < 0 || s > 10000000) fail(400, 'المرتب غلط');
      db.prepare('INSERT INTO staff_pay_emp (emp_id, salary) VALUES (?, ?) ON CONFLICT(emp_id) DO UPDATE SET salary = excluded.salary').run(e.id, r2(s));
      log(who, 'pay.salary', { emp: e.name }); return send(200, { ok: true }), true;
    }
    if (p === '/pay/cfg') {
      const lim = { pay_days: [20, 31], late_mult: [0, 5], absent_mult: [0, 5], ot_mult: [0, 5] };
      for (const k of Object.keys(lim)) if (b[k] !== undefined) { const v = Number(b[k]); if (!Number.isFinite(v) || v < lim[k][0] || v > lim[k][1]) fail(400, 'قيمة غلط: ' + k); cfgSet(k, v); }
      log(who, 'pay.cfg', b); return send(200, { ok: true }), true;
    }
    if (p === '/pay/adj') {
      const e = empOf(b.emp_id); if (!['bonus', 'deduct'].includes(b.kind)) fail(400, 'نوع غلط');
      const m = isMonth(b.month) ? b.month : nowLocal().date.slice(0, 7);
      db.prepare('INSERT INTO staff_adj (emp_id, month, kind, amount, note, created_at, created_by) VALUES (?,?,?,?,?,?,?)').run(e.id, m, b.kind, money(b.amount), str(b.note, 120), nowLocal().ts, who);
      log(who, 'pay.adj', { emp: e.name, kind: b.kind, amount: b.amount }); return send(200, { ok: true }), true;
    }
    if (p === '/pay/adj/delete') { db.prepare('DELETE FROM staff_adj WHERE id = ?').run(Number(b.id)); return send(200, { ok: true }), true; }
    if (p === '/pay/loan') {
      const e = empOf(b.emp_id), n = Math.round(Number(b.n));
      if (!Number.isFinite(n) || n < 1 || n > 60) fail(400, 'عدد الأقساط من 1 لـ 60');
      const m = isMonth(b.start_month) ? b.start_month : nowLocal().date.slice(0, 7);
      db.prepare('INSERT INTO staff_loan (emp_id, total, n, start_month, note, created_at, created_by) VALUES (?,?,?,?,?,?,?)').run(e.id, money(b.total), n, m, str(b.note, 120), nowLocal().ts, who);
      log(who, 'pay.loan', { emp: e.name, total: b.total, n }); return send(200, { ok: true }), true;
    }
    if (p === '/pay/loan/delete') { db.prepare('UPDATE staff_loan SET active = 0 WHERE id = ?').run(Number(b.id)); return send(200, { ok: true }), true; }
    return false;
  }
  return { payroll, route };
};
