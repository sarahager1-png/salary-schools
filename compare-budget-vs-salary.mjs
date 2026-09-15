/*
  בדיקת חפיפה בין מערכת התקציב (מבט-רשת / school-budget) למערכת השכר
  (salary-schools) — לכל בית ספר, קריאה בלבד, בלי לכתוב דבר.

  שלושת המקורות שמושווים:
   1. מבט-רשת — פונקציית network-budget, אותו מקור שהפורטל מציג.
      דרכה: הכנסות משרד, מענק, ייעול שנבחר, השתתפות הרשת בכרטיס,
      ועלות ההוראה המתוכננת (teachingSim).
   2. school_finance במערכת השכר — התמונה ששרה ורינה עובדות מולה בדף
      "עלות הוראה מול תקציב", כולל דגלי src (מי כתב כל שדה).
   3. teacher_months — השכר בפועל, מחושב ב-src/lib/employer.js, אותו
      מודול בדיוק שהמסך והפורטל משתמשים בו.

  הרצה: node compare-budget-vs-salary.mjs [YYYY-MM]
*/
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import * as emp from './src/lib/employer.js';
import { mapHubSchools } from './api/hub-budget.js';

const MONTH = process.argv[2] || '2026-09';
const HUB_URL = 'https://ogkwvrerolofujhydhsl.supabase.co/functions/v1/network-budget';
const HUB_CODE = process.env.HUB_ACCESS_CODE || 'reshet2026';
const MM_PCT = 0.05; // אותו קבוע כמו במסך ובפונקציה
const BUFFER_PCT = 0.10; // כרית ביטחון 10% (שרה, 15.9) — כמו BUFFER_PCT במסך ובפונקציה

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const toTeacher = (r) => ({
  monthKey: r.month_key, schoolId: r.school_id, name: r.name, reform: r.reform, level: r.level,
  grade: r.grade, degree: r.degree, seniority: r.seniority, frontalHours: r.frontal_hours,
  scope: r.scope_pct, scopePct: r.scope_pct, role: r.gamul_role, ageGroup: r.age_group,
  gender: r.gender, childrenUnder18: r.children_under_18, travelDays: r.travel_days,
  daycareChildren: r.daycare_children, leaveType: r.leave_type, mmFor: r.mm_for,
  job: r.job || 'teaching', hourlyRate: r.hourly_rate,
  _officialGross: r.official_gross, _agreedGross: r.agreed_gross,
  _chabadSupp: r.chabad_supp, _actualEmployerCost: r.actual_employer_cost,
});

// ── מקור 1: מבט-רשת ─────────────────────────────────────────────
const r = await fetch(HUB_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: HUB_CODE }) });
if (!r.ok) { console.log('מבט-רשת החזיר', r.status); process.exit(1); }
const hubRaw = await r.json();
const hub = mapHubSchools(hubRaw);

// ── מקורות 2+3: מערכת השכר ──────────────────────────────────────
const { data: schools } = await sb.from('schools').select('id, name, chabad_supp');
const { data: rows } = await sb.from('teacher_months').select('*').eq('month_key', MONTH);
const { data: finRows } = await sb.from('school_finance').select('*');

emp.CHABAD_SUPP.clear();
for (const s of schools) emp.CHABAD_SUPP.set(s.id, s.chabad_supp !== false);
emp.MM_REPLACED.clear(); emp.MATERNITY_LEAVES.clear();
for (const t of rows) {
  if (String(t.mm_for || '').trim()) emp.MM_REPLACED.add(`${t.month_key}|${t.school_id}|${String(t.mm_for).trim()}`);
  if (t.leave_type === 'maternity') emp.MATERNITY_LEAVES.add(`${t.month_key}|${t.school_id}|${String(t.name).trim()}`);
}

const norm = (s) => String(s || '').replace(/["'׳״]/g, '').replace(/\s+/g, ' ')
  .replace(/^בית חינוך /, '').replace(/^שלהבות /, '')
  .replace(/גני תקווה/, 'גני תקוה').trim();
const hubBy = new Map(hub.map(h => [norm(h.name), h]));
const finBy = new Map((finRows || []).map(f => [f.school_id, f]));

const money = (v) => v == null ? '—' : Math.round(v).toLocaleString('he-IL');
const out = [];
const notes = [];

for (const s of schools) {
  // צהרון ומשרות שעתיות — מחוץ להשוואה מול התקציב (15.9)
  const ts = rows.filter(t => t.school_id === s.id).map(toTeacher).filter(t => !emp.isHourlyRow(t));
  let teaching = 0, principal = 0;
  for (const t of ts) {
    const c = emp.calcEmployer(t).total;
    if (emp.isPrincipalRow(t)) principal += c; else teaching += c;
  }
  const actualAnnual = (teaching + principal) * 12;
  const h = hubBy.get(norm(s.name)) || null;
  const f = finBy.get(s.id) || {};

  out.push({
    name: s.name, teachers: ts.length,
    hours: ts.filter(t => !emp.isPrincipalRow(t)).reduce((a, t) => a + (Number(t.frontalHours) || 0), 0),
    actualAnnual: ts.length ? actualAnnual : null,
    hubSim: h ? h.teachingSim : null,
    finSim: f.teaching_sim ?? null,
    hubMinistry: h ? h.ministry : null,
    finMinistry: f.ministry_budget ?? null,
    hubSupport: h ? h.networkSupport : null,
    finSupport: f.network_support ?? null,
    hubYieul: h ? h.yieul : null,
    finYieul: f.yieul ?? null,
    src: f.src || null,
    inHub: !!h, mode: h ? (h.teach === null ? 'simple' : 'full') : null,
  });
}

// בתי ספר שקיימים במבט-רשת ואינם במערכת השכר
for (const h of hub) {
  if (!schools.some(s => norm(s.name) === norm(h.name))) {
    notes.push(`${h.name} — קיים במערכת התקציב ואינו במערכת השכר`);
  }
}

const pad = (s, w) => { s = String(s); const len = [...s].length; return s + ' '.repeat(Math.max(0, w - len)); };
console.log(`\nחודש ${MONTH} · השוואה בין מערכת התקציב למערכת השכר\n`);
console.log(pad('בית ספר', 22), pad('מורות', 6), pad('שעות', 6), pad('שכר בפועל/שנה', 15), pad('תכנון תקציב', 14), pad('פער', 14), 'הערה');
console.log('─'.repeat(110));
for (const o of out) {
  const plan = o.finSim ?? o.hubSim;
  const gap = (o.actualAnnual != null && plan != null) ? o.actualAnnual - plan : null;
  let note = '';
  if (!o.inHub) note = 'אין במבט-רשת';
  else if (o.mode === 'simple') note = 'מעקב פשוט (בלי סימולציה)';
  else if (plan == null) note = 'אין סימולציית הוראה';
  else if (o.actualAnnual == null) note = 'אין שורות שכר';
  console.log(pad(o.name, 22), pad(o.teachers, 6), pad(o.hours, 6),
    pad(money(o.actualAnnual), 15), pad(money(plan), 14),
    pad(gap == null ? '—' : (gap > 0 ? '+' : '') + money(gap), 14), note);
}

console.log('\n\nחפיפת השדות המשותפים (מבט-רשת מול מערכת השכר)\n');
console.log(pad('בית ספר', 22), pad('משרד: הַב | שכר', 26), pad('השתתפות: הַב | שכר', 28), 'ייעול: הַב | שכר');
console.log('─'.repeat(110));
const diffs = [];
for (const o of out) {
  if (!o.inHub) continue;
  const cmp = (a, b) => (a == null && b == null) ? '=' : (Math.round(a || 0) === Math.round(b || 0) ? '=' : '≠');
  const m = cmp(o.hubMinistry, o.finMinistry), su = cmp(o.hubSupport, o.finSupport), y = cmp(o.hubYieul, o.finYieul);
  console.log(pad(o.name, 22),
    pad(`${money(o.hubMinistry)} | ${money(o.finMinistry)} ${m}`, 26),
    pad(`${money(o.hubSupport)} | ${money(o.finSupport)} ${su}`, 28),
    `${money(o.hubYieul)} | ${money(o.finYieul)} ${y}`);
  if (m === '≠') diffs.push(`${o.name}: תקציב משרד — מבט-רשת ${money(o.hubMinistry)} מול שכר ${money(o.finMinistry)}`);
  if (su === '≠') diffs.push(`${o.name}: השתתפות הרשת — מבט-רשת ${money(o.hubSupport)} מול שכר ${money(o.finSupport)}`);
  if (y === '≠') diffs.push(`${o.name}: ייעול — מבט-רשת ${money(o.hubYieul)} מול שכר ${money(o.finYieul)}`);
  if (o.hubSim != null && o.finSim != null && Math.round(o.hubSim) !== Math.round(o.finSim)) {
    diffs.push(`${o.name}: סימולציית הוראה — מבט-רשת ${money(o.hubSim)} מול שכר ${money(o.finSim)}`);
  }
}

console.log('\n\nפערים שדורשים הכרעה\n');
if (!diffs.length) console.log('אין אי-התאמות בשדות המשותפים.');
for (const d of diffs) console.log('·', d);
for (const n of notes) console.log('·', n);

// ── תמונת הפער התקציבי, כמו במסך ──────────────────────────────
console.log('\n\nהפרש עלות הוראה (כמו בדף "עלות הוראה מול תקציב")\n');
console.log(pad('בית ספר', 22), pad('הכנסות', 14), pad('שכר בפועל', 14), pad('+10% +5% מ"מ', 14), pad('סה"כ הוצאה', 14), 'הפרש');
console.log('─'.repeat(100));
let tIncome = 0, tCost = 0;
for (const o of out) {
  if (o.actualAnnual == null || o.finMinistry == null) continue;
  const income = (o.finMinistry || 0) + (o.finSupport || 0);
  const mm = o.actualAnnual * (MM_PCT + BUFFER_PCT);
  const cost = o.actualAnnual + mm;
  tIncome += income; tCost += cost;
  console.log(pad(o.name, 22), pad(money(income), 14), pad(money(o.actualAnnual), 14),
    pad(money(mm), 12), pad(money(cost), 14), (income - cost > 0 ? '+' : '') + money(income - cost));
}
console.log('─'.repeat(100));
console.log(pad('סה"כ', 22), pad(money(tIncome), 14), pad('', 14), pad('', 12), pad(money(tCost), 14),
  (tIncome - tCost > 0 ? '+' : '') + money(tIncome - tCost));
