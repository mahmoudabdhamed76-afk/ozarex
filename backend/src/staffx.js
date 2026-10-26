'use strict';
/* ════════════════════════════════════════════════════════════════════
   ERP · الموظفين 4.63 — الإشعارات + بنك الأعطال + مهام «في الطريق»
   · notify(): push to the managers (and to one employee / every employee)
     with the ERP's own web-push (no outside service) + a live event that
     the open ERP screens turn into a toast and a refresh.
   · بنك الأعطال: every visit that had a fault keeps its fix; any engineer
     searches by code or by words and sees the fix and who made it, can 👍 it,
     and everybody is told the moment a new fix is saved.
   · المهام: the manager gives an employee a center to go to; while he is on
     the way his phone reports every 30 s, the board shows distance / time /
     percent and celebrates the arrival.
   Everything is decided on the server (clock, distances, who voted).
════════════════════════════════════════════════════════════════════ */
const webpush = require('./webpush');

module.exports = function init(H) {
  const { db, nowLocal, tsMin, haversine, num, str, fail, centerByKey, centersAll, centerRadius, cfg, openRecord, log } = H;

  db.exec(`
  CREATE TABLE IF NOT EXISTS staff_task (
    id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, center_key TEXT NOT NULL, center_name TEXT, title TEXT, note TEXT,
    status TEXT NOT NULL DEFAULT 'new', created_at TEXT, created_by TEXT, started_at TEXT, arrived_at TEXT, done_at TEXT,
    d0 INTEGER, dist INTEGER, last_lat REAL, last_lng REAL, last_at TEXT, speed REAL, seen_at TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_staff_task ON staff_task (emp_id, status);
  CREATE TABLE IF NOT EXISTS staff_fault (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, title TEXT NOT NULL, solution TEXT NOT NULL, center_key TEXT, center_name TEXT,
    emp_id TEXT, emp_name TEXT, visit_id INTEGER, at TEXT NOT NULL, votes INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS staff_reward (
    id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, stars INTEGER NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0, message TEXT,
    created_at TEXT NOT NULL, created_by TEXT, seen_at TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_staff_reward ON staff_reward (emp_id, created_at);
  CREATE TABLE IF NOT EXISTS staff_fault_vote (fault_id INTEGER NOT NULL, who TEXT NOT NULL, at TEXT, PRIMARY KEY (fault_id, who));
  `);
  try { const tc = db.prepare('PRAGMA table_info(staff_task)').all().map(c => c.name); if (!tc.includes('working_at')) db.exec('ALTER TABLE staff_task ADD COLUMN working_at TEXT'); if (!tc.includes('result')) db.exec('ALTER TABLE staff_task ADD COLUMN result TEXT'); } catch (e) { console.error('[staff] task cols', e.message); }
  try { if (!db.prepare('PRAGMA table_info(staff_visit)').all().some(c => c.name === 'task_id')) db.exec('ALTER TABLE staff_visit ADD COLUMN task_id INTEGER'); } catch (e) { console.error('[staff] task_id', e.message); }

  /* ───────── notifications ───────── */
  let NT = { admins: () => [], event: () => {} };
  const setNotify = n => { NT = Object.assign(NT, n || {}); };
  const on = k => cfg(k) !== '0';
  function toAdmins(msg) {
    try { NT.event('staff', { kind: msg.kind || 'info', text: msg.title + (msg.body ? ' — ' + msg.body : ''), tag: msg.tag || '' }); } catch (e) {}
    const ids = (NT.admins() || []).slice(0, 50); if (!ids.length) return;
    webpush.send(ids, { title: msg.title, body: msg.body || '', url: './?go=staff', tag: msg.tag || undefined, urgent: !!msg.urgent }).catch(() => {});
  }
  function toEmps(ids, msg) {
    const list = (ids || []).map(i => 'emp:' + i); if (!list.length) return;
    webpush.send(list, { title: msg.title, body: msg.body || '', url: './staff', tag: msg.tag || undefined, urgent: !!msg.urgent }).catch(() => {});
  }
  const allEmpIds = except => db.prepare('SELECT id FROM staff_emp WHERE active = 1').all().map(r => r.id).filter(id => id !== except);
  const hm = ts => { const m = /(\d{2}):(\d{2})/.exec(String(ts || '').slice(11)); if (!m) return ''; const h = +m[1]; return '\u2066' + ((h % 12) || 12) + ':' + m[2] + (h < 12 ? ' AM' : ' PM') + '\u2069'; };
  const dur = m => { m = Math.max(0, Math.round(m)); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

  /* called by staff.js after a real punch */
  function onPunch(e, type, now, info) {
    info = info || {};
    if (type === 'in' && on('notify_in')) {
      const bits = [];
      if (info.late > 0) bits.push('متأخر ' + info.late + ' د');
      if (info.dist != null && info.far) bits.push('بعيد ' + info.dist + ' م عن ' + (info.site || 'مكان الشغل'));
      toAdmins({ kind: 'in', title: '✅ ' + e.name + ' سجّل حضور ' + hm(now.ts), body: bits.join(' · '), tag: 'sp-in-' + e.id, urgent: info.late > 0 && false });
    }
    if (type === 'out' && on('notify_out')) {
      toAdmins({ kind: 'out', title: '🔴 ' + e.name + ' سجّل انصراف ' + hm(now.ts), body: info.worked != null ? 'اشتغل ' + dur(info.worked) + ' ساعة' + (info.visits ? ' · ' + info.visits + ' زيارة' : '') : '', tag: 'sp-out-' + e.id });
    }
  }
  function onVisit(e, v, kind) {
    if (kind === 'start' && cfg('notify_visit') === '1') toAdmins({ kind: 'visit', title: '🏥 ' + e.name + ' وصل ' + v.center_name, body: v.purpose || '', tag: 'sp-v-' + e.id });
  }

  /* ───────── بنك الأعطال ───────── */
  const AR_DIG = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
  const norm = s => String(s || '').toLowerCase().replace(/[٠-٩]/g, d => AR_DIG[d]).replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[^a-z0-9ء-ي]+/g, ' ').trim();
  const codeKey = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const groupKey = f => { const c = codeKey(f.code); return c ? 'c:' + c : 't:' + norm(f.title).split(' ').slice(0, 4).join(' '); };

  function addFault(e, b, visitId, centerKey) {
    const title = str(b.title, 160), solution = str(b.solution, 800), code = codeKey(b.code).slice(0, 30);
    if (!title || !solution) return null;
    const now = nowLocal();
    const last = db.prepare('SELECT * FROM staff_fault WHERE emp_id = ? ORDER BY id DESC LIMIT 1').get(e.id);
    if (last && last.title === title && last.solution === solution && last.at.slice(0, 10) === now.date) return last.id;           // double tap
    const c = centerKey ? centerByKey(centerKey) : null;
    const r = db.prepare('INSERT INTO staff_fault (code, title, solution, center_key, center_name, emp_id, emp_name, visit_id, at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(code || null, title, solution, c ? c.key : null, c ? c.name : (b.center_name ? str(b.center_name, 80) : null), e.id, e.name, visitId || null, now.ts);
    const id = Number(r.lastInsertRowid);
    const body = (code ? '[' + code + '] ' : '') + title + ' ← ' + solution.slice(0, 90);
    toEmps(allEmpIds(e.id), { title: '🛠 حل جديد في بنك الأعطال — ' + e.name, body, tag: 'sp-fault' });
    toAdmins({ kind: 'fault', title: '🛠 ' + e.name + ' سجّل حل عطل' + (c ? ' في ' + c.name : ''), body, tag: 'sp-fault-' + id });
    return id;
  }
  function faultsOut(rows, who) {
    const voted = new Set(db.prepare('SELECT fault_id FROM staff_fault_vote WHERE who = ?').all(who).map(r => r.fault_id));
    const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const cnt = new Map();
    for (const f of db.prepare('SELECT code, title, at FROM staff_fault').all()) if (f.at.slice(0, 10) >= since) { const k = groupKey(f); cnt.set(k, (cnt.get(k) || 0) + 1); }
    return rows.map(f => ({ id: f.id, code: f.code || '', title: f.title, solution: f.solution, center: f.center_name || '', emp: f.emp_name || '', emp_id: f.emp_id, at: f.at, votes: f.votes, voted: voted.has(f.id), repeats: cnt.get(groupKey(f)) || 1 }));
  }
  function searchFaults(q, who) {
    const all = db.prepare('SELECT * FROM staff_fault ORDER BY id DESC LIMIT 3000').all();
    const text = norm(q), ck = codeKey(q);
    let rows;
    if (!text) rows = all.slice().sort((a, b) => (b.votes - a.votes) || (a.at < b.at ? 1 : -1)).slice(0, 5).concat(all.slice(0, 40)).filter((f, i, a) => a.findIndex(x => x.id === f.id) === i).slice(0, 40);
    else {
      const toks = text.split(' ').filter(Boolean);
      rows = all.map(f => {
        const t = norm(f.title), s = norm(f.solution), c = codeKey(f.code), fc = norm(f.center_name);
        let sc = 0, hit = 0;
        if (ck && c && c === ck) sc += 20;
        for (const w of toks) {
          let h = 0;
          if (c && (c === codeKey(w) || (w.length >= 2 && c.includes(codeKey(w))))) h += 8;
          if (t.includes(w)) h += 3; if (s.includes(w)) h += 1.5; if (fc.includes(w)) h += 1;
          if (h) hit++; sc += h;
        }
        return { f, sc: hit === toks.length ? sc + 5 : sc, hit };
      }).filter(x => x.sc > 0 && (x.hit === toks.length || x.hit >= Math.ceil(toks.length / 2))).sort((a, b) => (b.sc - a.sc) || (b.f.votes - a.f.votes) || (a.f.at < b.f.at ? 1 : -1)).slice(0, 40).map(x => x.f);
    }
    return { list: faultsOut(rows, who), total: db.prepare('SELECT COUNT(*) AS n FROM staff_fault').get().n };
  }
  function vote(id, who, ownerId) {
    const f = db.prepare('SELECT * FROM staff_fault WHERE id = ?').get(Number(id)); if (!f) fail(404, 'الحل ده مش موجود');
    if (ownerId && f.emp_id === ownerId) fail(400, 'مينفعش تقيّم حلّك أنت');
    const had = db.prepare('SELECT 1 FROM staff_fault_vote WHERE fault_id = ? AND who = ?').get(f.id, who);
    if (had) db.prepare('DELETE FROM staff_fault_vote WHERE fault_id = ? AND who = ?').run(f.id, who);
    else db.prepare('INSERT INTO staff_fault_vote (fault_id, who, at) VALUES (?,?,?)').run(f.id, who, nowLocal().ts);
    const n = db.prepare('SELECT COUNT(*) AS n FROM staff_fault_vote WHERE fault_id = ?').get(f.id).n;
    db.prepare('UPDATE staff_fault SET votes = ? WHERE id = ?').run(n, f.id);
    return { ok: true, votes: n, voted: !had };
  }
  /* the faults that keep coming back — the same code (or the same words) 2+ times in 90 days */
  function recurring() {
    const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const g = new Map();
    for (const f of db.prepare('SELECT * FROM staff_fault ORDER BY id DESC').all()) {
      if (f.at.slice(0, 10) < since) continue;
      const k = groupKey(f), x = g.get(k) || { key: k, code: f.code || '', title: f.title, n: 0, centers: new Set(), emps: new Set(), last: f.at, best: null };
      x.n++; if (f.center_name) x.centers.add(f.center_name); if (f.emp_name) x.emps.add(f.emp_name);
      if (!x.best || f.votes > x.best.votes) x.best = { id: f.id, solution: f.solution, emp: f.emp_name, votes: f.votes };
      g.set(k, x);
    }
    return [...g.values()].filter(x => x.n >= 2).sort((a, b) => b.n - a.n || (a.last < b.last ? 1 : -1)).slice(0, 12).map(x => ({ key: x.key, code: x.code, title: x.title, n: x.n, centers: [...x.centers].slice(0, 6), emps: [...x.emps].slice(0, 6), last: x.last, best: x.best }));
  }

  /* ───────── المهام «في الطريق» ───────── */
  const faultOfTask = id => { const f = db.prepare('SELECT f.code, f.title, f.solution FROM staff_fault f JOIN staff_visit v ON v.id = f.visit_id WHERE v.task_id = ? ORDER BY f.id DESC LIMIT 1').get(id); return f ? { code: f.code || '', title: f.title, solution: f.solution } : null; };
  const taskOut = t => {
    const c = centerByKey(t.center_key), known = !!(c && c.lat != null);
    const pct = t.status === 'arrived' || t.status === 'done' ? 100 : (t.d0 && t.dist != null ? Math.max(0, Math.min(99, Math.round((1 - t.dist / Math.max(t.d0, 1)) * 100))) : 0);
    let eta = null;
    if (t.status === 'going' && t.dist != null) {
      let sp = t.speed && t.speed > 0.7 ? t.speed : null;
      if (!sp && t.started_at && t.d0 != null && t.dist != null && t.d0 > t.dist) { const el = (tsMin(t.last_at || t.started_at) - tsMin(t.started_at)) * 60; if (el > 30) sp = (t.d0 - t.dist) / el; }
      sp = Math.max(1.2, Math.min(sp || 6, 25));
      eta = Math.max(1, Math.round(t.dist / sp / 60));
    }
    return { id: t.id, emp_id: t.emp_id, center_key: t.center_key, center: t.center_name, title: t.title || '', note: t.note || '', status: t.status, created_at: t.created_at, created_by: t.created_by,
      started_at: t.started_at, arrived_at: t.arrived_at, working_at: t.working_at || null, done_at: t.done_at, result: t.result || '', fault: faultOfTask(t.id), d0: t.d0, dist: t.dist, pct, eta, known, c_lat: known ? c.lat : null, c_lng: known ? c.lng : null, last_lat: t.last_lat, last_lng: t.last_lng, last_at: t.last_at };
  };
  function createTask(b, who) {
    const e = db.prepare('SELECT * FROM staff_emp WHERE id = ? AND active = 1').get(str(b.emp_id, 20)); if (!e) fail(404, 'الموظف مش موجود');
    const c = centerByKey(str(b.center, 80)); if (!c) fail(404, 'المركز مش موجود');
    const title = str(b.title, 120) || 'زيارة ' + c.name;
    const r = db.prepare('INSERT INTO staff_task (emp_id, center_key, center_name, title, note, status, created_at, created_by) VALUES (?,?,?,?,?,?,?,?)')
      .run(e.id, c.key, c.name, title, str(b.note, 300), 'new', nowLocal().ts, who);
    log(who, 'task.create', { emp: e.name, center: c.name });
    toEmps([e.id], { title: '📌 مهمة جديدة: ' + c.name, body: title + (b.note ? ' — ' + str(b.note, 80) : ''), tag: 'sp-task-' + r.lastInsertRowid, urgent: true });
    return { ok: true, id: Number(r.lastInsertRowid) };
  }
  function cancelTask(id, who) {
    const t = db.prepare('SELECT * FROM staff_task WHERE id = ?').get(Number(id)); if (!t) fail(404, 'المهمة مش موجودة');
    if (t.status === 'done') fail(400, 'المهمة دي خلصت');
    db.prepare("UPDATE staff_task SET status = 'cancel', done_at = ? WHERE id = ?").run(nowLocal().ts, t.id);
    log(who, 'task.cancel', { emp: t.emp_id, center: t.center_name });
    toEmps([t.emp_id], { title: '🚫 اتلغت مهمة: ' + t.center_name, body: '', tag: 'sp-task-' + t.id });
    return { ok: true };
  }
  const tasksOf = empId => db.prepare("SELECT * FROM staff_task WHERE emp_id = ? AND status IN ('new','going','arrived','working') ORDER BY id").all(empId).map(taskOut);
  function startTask(e, b) {
    const t = db.prepare('SELECT * FROM staff_task WHERE id = ? AND emp_id = ?').get(Number(b.id), e.id); if (!t || !['new', 'going'].includes(t.status)) fail(404, 'المهمة دي مش متاحة');
    const now = nowLocal();
    if (!openRecord(e.id, now)) fail(409, 'سجّل حضورك الأول وبعدين ابدأ الطريق');
    db.prepare("UPDATE staff_task SET status = 'going' WHERE status = 'going' AND emp_id = ? AND id != ?").run(e.id, t.id);          // one road at a time
    const lat = num(b.lat), lng = num(b.lng), c = centerByKey(t.center_key);
    const has = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const d0 = has && c && c.lat != null ? Math.round(haversine(lat, lng, c.lat, c.lng)) : null;
    if (has) { const open = openRecord(e.id, now); if (open) H.logLoc(e, open.id, now, lat, lng, num(b.acc), b.battery, 'route'); }
    if (t.status === 'new') {
      db.prepare("UPDATE staff_task SET status = 'going', started_at = ?, d0 = ?, dist = ?, last_lat = ?, last_lng = ?, last_at = ?, seen_at = ? WHERE id = ?").run(now.ts, d0, d0, has ? lat : null, has ? lng : null, has ? now.ts : null, now.ts, t.id);
      toAdmins({ kind: 'road', title: '🚗 ' + e.name + ' في الطريق إلى ' + t.center_name, body: d0 != null ? 'المسافة ' + (d0 >= 1000 ? (d0 / 1000).toFixed(1) + ' كم' : d0 + ' م') : '', tag: 'sp-road-' + t.id });
    }
    return { ok: true };
  }
  function pingTask(e, b) {
    const t = db.prepare("SELECT * FROM staff_task WHERE id = ? AND emp_id = ? AND status IN ('new','going','arrived','working')").get(Number(b.id), e.id); if (!t) return { ok: false, stop: true };
    const now = nowLocal(), open = openRecord(e.id, now); if (!open) return { ok: false, closed: true };
    const lat = num(b.lat), lng = num(b.lng); if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail(400, 'موقع غير صالح');
    const last = db.prepare('SELECT at FROM staff_loc WHERE emp_id = ? ORDER BY id DESC LIMIT 1').get(e.id);
    if (last && tsMin(now.ts) - tsMin(last.at) < 0.25) return { ok: true, skipped: true };            // never twice inside 15 s
    H.logLoc(e, open.id, now, lat, lng, num(b.acc), b.battery, 'route');
    const c = centerByKey(t.center_key);
    const dist = c && c.lat != null ? Math.round(haversine(lat, lng, c.lat, c.lng)) : null;
    let speed = t.speed;
    if (t.last_lat != null && t.last_at) {
      const dt = (tsMin(now.ts) - tsMin(t.last_at)) * 60, dm = haversine(t.last_lat, t.last_lng, lat, lng);
      if (dt >= 10 && dm >= 8) { const s = dm / dt; speed = speed ? speed * 0.6 + s * 0.4 : s; }
    }
    let d0 = t.d0; if (d0 == null && dist != null) d0 = dist;
    db.prepare('UPDATE staff_task SET dist = ?, d0 = ?, last_lat = ?, last_lng = ?, last_at = ?, speed = ? WHERE id = ?').run(dist, d0, lat, lng, now.ts, speed || null, t.id);
    let arrived = false;
    if (t.status === 'going' && dist !== null && dist <= Math.max(80, Math.min(centerRadius(), 250))) arrived = markArrived(e, t, now, dist);
    return { ok: true, dist, arrived, task: taskOut(db.prepare('SELECT * FROM staff_task WHERE id = ?').get(t.id)) };
  }
  function markArrived(e, t, now, dist) {
    const r = db.prepare("UPDATE staff_task SET status = 'arrived', arrived_at = ?, dist = ? WHERE id = ? AND status = 'going'").run(now.ts, dist, t.id);
    if (!Number(r.changes)) return false;
    if (cfg('notify_arrive') !== '0') toAdmins({ kind: 'arrive', title: '🎉 ' + e.name + ' وصل ' + t.center_name, body: 'بعد ' + dur(tsMin(now.ts) - tsMin(t.started_at || now.ts)) + ' ساعة من بداية الطريق', tag: 'sp-arr-' + t.id });
    return true;
  }
  /* «وصلت» by hand (the center's place is not known yet, or the GPS is shy) */
  function arriveTask(e, b) {
    const t = db.prepare("SELECT * FROM staff_task WHERE id = ? AND emp_id = ? AND status IN ('new','going')").get(Number(b.id), e.id); if (!t) fail(404, 'المهمة دي مش متاحة');
    const now = nowLocal();
    db.prepare("UPDATE staff_task SET status = 'going', started_at = COALESCE(started_at, ?) WHERE id = ?").run(now.ts, t.id);
    markArrived(e, db.prepare('SELECT * FROM staff_task WHERE id = ?').get(t.id), now, t.dist);
    return { ok: true };
  }
  /* 4.64 · one button, the next stage: في الطريق → وصلت → بدأت الشغل → خلّصت */
  function stepTask(e, b) {
    const step = String(b.step || '');
    if (step === 'going') return startTask(e, b);
    if (step === 'arrived') return arriveTask(e, b);
    const t = db.prepare("SELECT * FROM staff_task WHERE id = ? AND emp_id = ? AND status IN ('new','going','arrived','working')").get(Number(b.id), e.id); if (!t) fail(404, 'المهمة دي مش متاحة');
    const now = nowLocal();
    if (!openRecord(e.id, now)) fail(409, 'سجّل حضورك الأول');
    const pos = { lat: b.lat, lng: b.lng, acc: b.acc, battery: b.battery };
    if (step === 'working') {
      if (t.status === 'working') return { ok: true };
      const ov = db.prepare('SELECT * FROM staff_visit WHERE emp_id = ? AND end_at IS NULL ORDER BY id DESC LIMIT 1').get(e.id);
      if (!ov || ov.center_key !== t.center_key) { try { H.startVisit(e, Object.assign({ center: t.center_key, task: t.id, purpose: 'صيانة / تجربة' }, pos)); } catch (er) { if (er.status === 400) throw er; } }
      else if (!ov.task_id) db.prepare('UPDATE staff_visit SET task_id = ? WHERE id = ?').run(t.id, ov.id);
      db.prepare("UPDATE staff_task SET status = 'working', started_at = COALESCE(started_at, ?), arrived_at = COALESCE(arrived_at, ?), working_at = ? WHERE id = ?").run(now.ts, now.ts, now.ts, t.id);
      toAdmins({ kind: 'work', title: '🔧 ' + e.name + ' بدأ الشغل في ' + t.center_name, body: t.title || '', tag: 'sp-work-' + t.id });
      return { ok: true };
    }
    if (step === 'done') {
      const f = b.fault && b.fault.title && b.fault.solution ? b.fault : null;
      const ov = db.prepare('SELECT * FROM staff_visit WHERE emp_id = ? AND end_at IS NULL AND task_id = ? ORDER BY id DESC LIMIT 1').get(e.id, t.id);
      if (ov) H.endVisit(e, Object.assign({ fault: f }, pos)); else if (f) addFault(e, f, null, t.center_key);
      db.prepare("UPDATE staff_task SET status = 'done', done_at = ?, result = ?, working_at = COALESCE(working_at, ?), arrived_at = COALESCE(arrived_at, ?) WHERE id = ?").run(now.ts, str(b.note, 300), now.ts, now.ts, t.id);
      toAdmins({ kind: 'done', title: '✅ ' + e.name + ' خلّص ' + (t.title && t.title.indexOf('زيارة ') !== 0 ? t.title + ' في ' : '') + t.center_name, body: f ? '🛠 ' + f.title + ' ← ' + String(f.solution).slice(0, 80) : (b.note ? str(b.note, 120) : ''), tag: 'sp-done-' + t.id, urgent: true });
      return { ok: true };
    }
    fail(400, 'خطوة غير معروفة');
  }
  /* 4.65 · the employee registers a job he is about to do → the manager is told */
  function selfTask(e, b) {
    const now = nowLocal();
    if (!openRecord(e.id, now)) fail(409, 'سجّل حضورك الأول وبعدين سجّل المهمة');
    const c = centerByKey(str(b.center, 80)); if (!c) fail(404, 'المركز مش موجود');
    if (e.branch_id && c.branch !== e.branch_id) fail(403, 'المركز ده مش في فرعك');
    const title = str(b.title, 120) || 'زيارة ' + c.name;
    const r = db.prepare('INSERT INTO staff_task (emp_id, center_key, center_name, title, note, status, created_at, created_by) VALUES (?,?,?,?,?,?,?,?)')
      .run(e.id, c.key, c.name, title, str(b.note, 300), 'new', now.ts, 'emp:' + e.name);
    const id = Number(r.lastInsertRowid);
    const lat = num(b.lat), lng = num(b.lng);
    if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) { const open = openRecord(e.id, now); if (open) H.logLoc(e, open.id, now, lat, lng, num(b.acc), b.battery, 'route'); db.prepare('UPDATE staff_task SET last_lat = ?, last_lng = ?, last_at = ? WHERE id = ?').run(lat, lng, now.ts, id); }
    toAdmins({ kind: 'task', title: '📌 ' + e.name + ' هيعمل مهمة في ' + c.name, body: title + (b.note ? ' — ' + str(b.note, 100) : ''), tag: 'sp-self-' + id, urgent: true });
    return { ok: true, id };
  }
  /* the path of one job: every location from the moment it was given / registered until it was finished */
  function routeOf(id) {
    const t = db.prepare('SELECT t.*, e.name AS emp_name FROM staff_task t JOIN staff_emp e ON e.id = t.emp_id WHERE t.id = ?').get(Number(id)); if (!t) fail(404, 'المهمة مش موجودة');
    const to = t.done_at || (t.status === 'cancel' ? t.done_at : null) || nowLocal().ts;
    const points = db.prepare('SELECT at, lat, lng, acc, battery, kind FROM staff_loc WHERE emp_id = ? AND at >= ? AND at <= ? ORDER BY at').all(t.emp_id, t.created_at, to);
    const c = centerByKey(t.center_key);
    let km = 0; for (let i = 1; i < points.length; i++) km += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng) / 1000;
    return { task: Object.assign(taskOut(t), { emp: t.emp_name }), points, km: Math.round(km * 10) / 10, center: c && c.lat != null ? { name: c.name, lat: c.lat, lng: c.lng } : null };
  }
  /* «ريست» — wipe every job registered on one employee */
  function resetTasks(empId, who) {
    const e = db.prepare('SELECT * FROM staff_emp WHERE id = ?').get(str(empId, 20)); if (!e) fail(404, 'الموظف مش موجود');
    const n = db.prepare('DELETE FROM staff_task WHERE emp_id = ?').run(e.id).changes;
    db.prepare('UPDATE staff_visit SET task_id = NULL WHERE emp_id = ?').run(e.id);
    log(who, 'task.reset', { emp: e.name, n: Number(n) });
    return { ok: true, n: Number(n) };
  }

  /* ───────── 4.65 · المكافآت والتقدير ───────── */
  const rewardOut = r => ({ id: r.id, emp_id: r.emp_id, emp: r.emp_name || '', stars: r.stars, amount: r.amount, message: r.message || '', created_at: r.created_at, created_by: r.created_by || '', seen_at: r.seen_at || null });
  function giveReward(b, who) {
    const e = db.prepare('SELECT * FROM staff_emp WHERE id = ? AND active = 1').get(str(b.emp_id, 20)); if (!e) fail(404, 'الموظف مش موجود');
    const stars = Math.max(0, Math.min(5, Math.round(Number(b.stars) || 0))), amount = Math.max(0, Math.min(1e6, Math.round((Number(b.amount) || 0) * 100) / 100)), message = str(b.message, 400);
    if (!stars && !amount && !message) fail(400, 'اكتب رسالة أو اختار نجوم أو مبلغ');
    const r = db.prepare('INSERT INTO staff_reward (emp_id, stars, amount, message, created_at, created_by) VALUES (?,?,?,?,?,?)').run(e.id, stars, amount, message, nowLocal().ts, who);
    log(who, 'reward', { emp: e.name, stars, amount });
    toEmps([e.id], { title: '🏆 ' + (amount ? 'مكافأة ' + amount + ' ج' : 'تقدير من الإدارة') + (stars ? ' ' + '⭐'.repeat(stars) : ''), body: message || 'افتح التطبيق علشان تشوفها', tag: 'sp-rw-' + r.lastInsertRowid, urgent: true });
    return { ok: true, id: Number(r.lastInsertRowid) };
  }
  function rewardsFor(empId) {
    const now = nowLocal(), m = now.date.slice(0, 7);
    const all = db.prepare('SELECT * FROM staff_reward WHERE emp_id = ? ORDER BY id DESC LIMIT 30').all(empId).map(rewardOut);
    const month = all.filter(r => r.created_at.slice(0, 7) === m);
    return { unseen: all.filter(r => !r.seen_at).reverse(), list: all.slice(0, 10), month: { n: month.length, amount: month.reduce((t, r) => t + r.amount, 0), stars: month.reduce((t, r) => t + r.stars, 0) } };
  }
  function seenReward(e, id) {
    const r = db.prepare('SELECT * FROM staff_reward WHERE id = ? AND emp_id = ?').get(Number(id), e.id); if (!r) fail(404, 'مش موجودة');
    if (!r.seen_at) {
      db.prepare('UPDATE staff_reward SET seen_at = ? WHERE id = ?').run(nowLocal().ts, r.id);
      toAdmins({ kind: 'seen', title: '👀 ' + e.name + ' شاف ' + (r.amount ? 'المكافأة (' + r.amount + ' ج)' : 'التقدير'), body: r.message ? String(r.message).slice(0, 80) : '', tag: 'sp-rws-' + r.id });
    }
    return { ok: true };
  }
  function rewardsList(month) {
    const m = /^\d{4}-\d{2}$/.test(String(month || '')) ? month : nowLocal().date.slice(0, 7);
    const rows = db.prepare("SELECT r.*, e.name AS emp_name FROM staff_reward r JOIN staff_emp e ON e.id = r.emp_id WHERE substr(r.created_at, 1, 7) = ? ORDER BY r.id DESC").all(m).map(rewardOut);
    const by = {}; rows.forEach(r => { const x = by[r.emp_id] || (by[r.emp_id] = { emp_id: r.emp_id, emp: r.emp, n: 0, amount: 0, stars: 0 }); x.n++; x.amount += r.amount; x.stars += r.stars; });
    return { month: m, list: rows, by: Object.values(by).sort((a, b) => b.stars - a.stars || b.amount - a.amount), total: rows.reduce((t, r) => t + r.amount, 0) };
  }

  /* a visit started / ended on a task's center closes the loop */
  function visitStarted(e, visitId, centerKey, taskId) {
    let t = taskId ? db.prepare("SELECT * FROM staff_task WHERE id = ? AND emp_id = ? AND status IN ('new','going','arrived','working')").get(Number(taskId), e.id) : null;
    if (!t) t = db.prepare("SELECT * FROM staff_task WHERE emp_id = ? AND center_key = ? AND status IN ('going','arrived') ORDER BY id DESC LIMIT 1").get(e.id, centerKey);
    if (!t) return;
    db.prepare('UPDATE staff_visit SET task_id = ? WHERE id = ?').run(t.id, visitId);
    db.prepare("UPDATE staff_task SET status = CASE WHEN status IN ('new','going') THEN 'arrived' ELSE status END, arrived_at = COALESCE(arrived_at, ?) WHERE id = ?").run(nowLocal().ts, t.id);
  }
  function visitEnded(e, v) {
    if (!v.task_id) return;
    db.prepare("UPDATE staff_task SET status = 'done', done_at = ? WHERE id = ? AND status IN ('arrived','going','new','working')").run(nowLocal().ts, v.task_id);
  }
  /* the board on the manager's «النهارده» */
  function board() {
    const now = nowLocal();
    const rows = db.prepare("SELECT t.*, e.name AS emp_name FROM staff_task t JOIN staff_emp e ON e.id = t.emp_id WHERE t.status IN ('new','going','arrived','working') OR (t.status = 'done' AND t.done_at >= ?) OR (t.status = 'cancel' AND t.done_at >= ?) ORDER BY t.id DESC LIMIT 60").all(now.date + ' 00:00:00', now.date + ' 00:00:00');
    return rows.map(r => Object.assign(taskOut(r), { emp: r.emp_name }));
  }
  function sweep() { try { db.prepare("UPDATE staff_task SET status = 'cancel', done_at = ? WHERE status IN ('new','going','arrived','working') AND created_at < ?").run(nowLocal().ts, new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)); } catch (e) {} }
  sweep(); setInterval(sweep, 6 * 3600e3).unref();

  /* ───────── routes ───────── */
  async function publicRoute(req, res, pathname, e, send, readBody) {
    const q = new URL(req.url, 'http://x').searchParams, post = req.method === 'POST';
    const body = async () => (await readBody(req, 0.02)) || {};
    if (pathname === '/staff/api/push/key' && req.method === 'GET') return send(200, { key: webpush.publicKey(), devices: webpush.countFor('emp:' + e.id) }), true;
    if (pathname === '/staff/api/push/subscribe' && post) { const b = await body(); try { webpush.subscribe({ id: 'emp:' + e.id }, b.subscription, req.headers['user-agent']); } catch (er) { return send(400, { error: 'bad', message: 'الاشتراك ده مش صالح' }), true; } return send(200, { ok: true }), true; }
    if (pathname === '/staff/api/push/off' && post) { const b = await body(); webpush.unsubscribe(b.endpoint); return send(200, { ok: true }), true; }
    if (pathname === '/staff/api/faults' && req.method === 'GET') return send(200, searchFaults(q.get('q') || '', 'e:' + e.id)), true;
    if (pathname === '/staff/api/fault' && post) { const b = await body(); const id = addFault(e, b, null, null); if (!id) fail(400, 'اكتب العطل والحل'); return send(200, { ok: true, id }), true; }
    if (pathname === '/staff/api/fault/vote' && post) return send(200, vote((await body()).id, 'e:' + e.id, e.id)), true;
    if (pathname === '/staff/api/tasks' && req.method === 'GET') return send(200, { tasks: tasksOf(e.id) }), true;
    if (pathname === '/staff/api/task/start' && post) return send(200, startTask(e, await body())), true;
    if (pathname === '/staff/api/task/ping' && post) return send(200, pingTask(e, await body())), true;
    if (pathname === '/staff/api/task/self' && post) { selfTask(e, await body()); return send(200, { ok: true, home: H.home(e) }), true; }
    if (pathname === '/staff/api/reward/seen' && post) { seenReward(e, (await body()).id); return send(200, { ok: true, rewards: rewardsFor(e.id) }), true; }
    if (pathname === '/staff/api/task/step' && post) { const b = await body(); stepTask(e, b); return send(200, { ok: true, tasks: tasksOf(e.id), home: H.home(e) }), true; }
    if (pathname === '/staff/api/task/arrive' && post) return send(200, arriveTask(e, await body())), true;
    return false;
  }
  async function adminRoute(req, res, p, who, body, send) {
    const q = new URL(req.url, 'http://x').searchParams, get = req.method === 'GET';
    if (get && p === '/faults') return send(200, Object.assign(searchFaults(q.get('q') || '', 'a:' + who), { recurring: recurring() })), true;
    if (get && p === '/tasks') return send(200, { tasks: board() }), true;
    if (get && p === '/task/route') return send(200, routeOf(q.get('id'))), true;
    if (get && p === '/rewards') return send(200, rewardsList(q.get('month'))), true;
    if (get && p === '/centers') return send(200, { list: centersAll().map(c => ({ key: c.key, name: c.name, branch: c.branch, known: c.lat != null })) }), true;
    if (req.method !== 'POST') return false;
    if (p === '/task') return send(200, createTask(await body(), who)), true;
    if (p === '/task/reset') return send(200, resetTasks((await body()).emp_id, who)), true;
    if (p === '/reward') return send(200, giveReward(await body(), who)), true;
    if (p === '/reward/delete') { const b = await body(); db.prepare('DELETE FROM staff_reward WHERE id = ?').run(Number(b.id)); log(who, 'reward.delete', { id: b.id }); return send(200, { ok: true }), true; }
    if (p === '/task/cancel') return send(200, cancelTask((await body()).id, who)), true;
    if (p === '/fault/vote') return send(200, vote((await body()).id, 'a:' + who, null)), true;
    if (p === '/fault/delete') { const b = await body(); db.prepare('DELETE FROM staff_fault WHERE id = ?').run(Number(b.id)); db.prepare('DELETE FROM staff_fault_vote WHERE fault_id = ?').run(Number(b.id)); log(who, 'fault.delete', { id: b.id }); return send(200, { ok: true }), true; }
    if (p === '/fault') {
      const b = await body();
      const id = addFault({ id: 'admin', name: who }, b, null, b.center ? str(b.center, 80) : null); if (!id) fail(400, 'اكتب العطل والحل');
      return send(200, { ok: true, id }), true;
    }
    return false;
  }
  return { rewardsFor, stepTask, setNotify, onPunch, onVisit, addFault, tasksOf, board, visitStarted, visitEnded, publicRoute, adminRoute, recurring, searchFaults, toAdmins, toEmps };
};
