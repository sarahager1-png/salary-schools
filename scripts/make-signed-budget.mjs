/*
  תקציב שנתי לחתימה לבית ספר אחד — שלושה חלקים:
    א. עלות הוראה  — מערכת השכר (אותו חישוב כמו api/shalhavot-budget, כולל מנהלת, 10% + 5%)
    ב. צהרון       — שורות job=tzaharon במערכת השכר, ×12; הכנסות הצהרון להשלמה ביד
    ג. כל השאר     — מערכת התקציב (מבט-רשת): כל סעיף בשמו, בלי שכר המנהלת (כבר בחלק א)
  "תכין לי תקציב מלא לחתימה לגני תקווה עם חלוקה לעלות הוראה צהרון ופירוט כל השאר" (שרה, 15.9)

  סכומים בית-ספריים בלבד — בלי שמות עובדות ובלי שכר אישי.
  הרצה: node scripts/make-signed-budget.mjs "גני תקוה" [YYYY-MM]
  פלט: Desktop\תקציב לחתימה - <בית ספר>.pdf (+ html)
*/
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import * as emp from '../src/lib/employer.js';

const MATCH = process.argv[2] || 'גני תקוה';
const MONTH = process.argv[3] || '2026-09';
const OUT_DIR = 'C:/Users/PC/OneDrive/Desktop';
const TZAHARON_MONTHS = 12; // הכרעת שרה, 15.9

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
Object.assign(process.env, env);
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const norm = n => String(n || '').replace(/["'\u05f4\u05f3־-]/g, '').replace(/\s+/g, ' ').replace(/תקווה/g, 'תקוה').trim();

// ── א. עלות הוראה: מקור אחד עם הדשבורד ──
const { default: budgetApi } = await import('../api/shalhavot-budget.js');
const res = { status(c) { this.c = c; return this; }, json(j) { this.j = j; return this; } };
await budgetApi({ headers: { 'x-access-code': env.SHALHAVOT_BUDGET_CODE }, url: `/api/shalhavot-budget?month=${MONTH}` }, res);
if (res.c !== 200) throw new Error(res.j?.error || 'shalhavot-budget');
const api = res.j.schools.find(s => norm(s.name).includes(norm(MATCH)));
if (!api) throw new Error(`לא נמצא בית ספר: ${MATCH}`);

// ── ב. צהרון ──
const { data: schools } = await sb.from('schools').select('id, name, chabad_supp, hours_quota');
const school = schools.find(s => s.name === api.name);
const { data: rows } = await sb.from('teacher_months').select('*').eq('month_key', MONTH).eq('school_id', school.id);
for (const s of schools) emp.CHABAD_SUPP.set(s.id, s.chabad_supp !== false);
const tz = { count: 0, weekly: 0, gross: 0, social: 0, total: 0, rates: new Set() };
for (const r of rows) {
  if ((r.job || 'teaching') !== 'tzaharon') continue;
  const c = emp.calcEmployer({
    monthKey: r.month_key, schoolId: r.school_id, name: r.name, reform: r.reform, level: r.level,
    grade: r.grade, degree: r.degree, seniority: r.seniority, frontalHours: r.frontal_hours,
    scope: r.scope_pct, scopePct: r.scope_pct, role: r.gamul_role, ageGroup: r.age_group, gender: r.gender,
    childrenUnder18: r.children_under_18, travelDays: r.travel_days, daycareChildren: r.daycare_children,
    leaveType: r.leave_type, mmFor: r.mm_for, job: r.job, hourlyRate: r.hourly_rate,
    _officialGross: r.official_gross, _agreedGross: r.agreed_gross, _chabadSupp: r.chabad_supp,
    _actualEmployerCost: r.actual_employer_cost,
  });
  tz.count++; tz.weekly += Number(r.frontal_hours) || 0;
  tz.gross += c.gross; tz.social += c.social; tz.total += c.total;
  tz.rates.add(Number(r.hourly_rate) || emp.MIN_WAGE_HOUR);
}

// ── ג. כל השאר: מבט-רשת, סעיף-סעיף ──
const hubRes = await fetch('https://ogkwvrerolofujhydhsl.supabase.co/functions/v1/network-budget', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: env.HUB_ACCESS_CODE || 'reshet2026' }),
});
const hub = (await hubRes.json()).schools.find(s => norm(s.name) === norm(api.name));
if (!hub) throw new Error('בית הספר לא נמצא במבט-רשת');
const raw = hub.raw;
const catById = new Map(raw.categories.map(c => [c.id, c]));
const annualOf = e => Number(e.amount || 0) * (e.period === 'monthly' ? 12 : 1);
const GROUPS = { salary: 'שכר ושירותים', building: 'מבנה ואחזקה', events: 'פעילויות ואירועים', equipment: 'ציוד ותשתיות', profdev: 'פיתוח מקצועי', other: 'ביטוח ואחר' };
const otherGroups = new Map();
const addLine = (group, name, amount, basis) => {
  if (!amount) return;
  if (!otherGroups.has(group)) otherGroups.set(group, []);
  otherGroups.get(group).push({ name: name.trim(), amount: Math.round(amount), basis });
};
const principalAnnual = (Number(hub.principalMonthly) || 0) * 12;
for (const e of raw.expenses) {
  // שכר המנהלת נספר בעלות ההוראה (חלק א) — לא פעמיים
  if (/שכר מנהלת/.test(e.name)) continue;
  const kind = catById.get(e.category_id)?.kind || 'other';
  addLine(GROUPS[kind] || GROUPS.other, e.name, annualOf(e),
    e.period === 'monthly' ? `${Math.round(e.amount).toLocaleString('he-IL')} ₪ × 12 חודשים` : 'שנתי');
}
const k = raw.constants;
addLine('תלמידים ופעילות', 'הוצאות פר תלמיד', hub.expenses.studentExp,
  `${Number(k.expense_per_student).toLocaleString('he-IL')} ₪ × ${hub.students} תלמידים · כולל אירועים, ערבי הורים ושכפולים`);
addLine('תלמידים ופעילות', 'חוגים', hub.expenses.clubsExpense, `${hub.classCount} כיתות`);
if (hub.expenses.profDev) addLine('תלמידים ופעילות', 'פיתוח מקצועי', hub.expenses.profDev);

// הכנסות: מקורות שהוקלדו + הייעול הכספי שנבחר (שכ"ל, השתתפות הורים)
const otherIncome = [];
for (const x of raw.income || []) otherIncome.push({ name: x.name, amount: Math.round(annualOf(x)) });
if (hub.income.perStudent + hub.income.talan > 0) otherIncome.push({ name: 'שכר לימוד ותל"ן (גבייה 80%)', amount: Math.round(hub.income.perStudent + hub.income.talan) });
const HOURS_YIEUL = /^(הורדת \d+ שעות הוראה|קבלת שבת|שעות פרטניות|שעות הוראה של המנהלת)/;
const yieulRows = hub.efficiency?.saved === true ? hub.efficiency.rows : [];
for (const r of yieulRows) {
  if (HOURS_YIEUL.test(r.label)) continue; // ייעול שעות — כבר בפועל בעלות ההוראה מהשכר
  otherIncome.push({ name: r.label, amount: Math.round(r.saving) });
}
const hoursYieul = yieulRows.filter(r => HOURS_YIEUL.test(r.label));

// ── סכומים ──
const sum = a => a.reduce((s, x) => s + x.amount, 0);
const A = { income: api.teaching.income, expenses: api.teaching.expenses };
A.inc = sum(A.income); A.exp = sum(A.expenses);
const B = {
  expenses: [
    { name: `שכר ברוטו · ${tz.count} עובדות · ${tz.weekly} שעות שבועיות`, amount: Math.round(tz.gross * TZAHARON_MONTHS) },
    { name: 'עלויות מעביד והפרשות סוציאליות', amount: Math.round(tz.social * TZAHARON_MONTHS) },
  ],
};
B.exp = Math.round(tz.total * TZAHARON_MONTHS);
B.expenses[0].amount += B.exp - sum(B.expenses);
const C = { income: otherIncome, groups: [...otherGroups.entries()] };
C.inc = sum(C.income); C.exp = C.groups.reduce((s, [, l]) => s + sum(l), 0);

// בדיקת שלמות: כל ההוצאות של מבט-רשת מחוץ להוראה = חלק ג + המנהלת
const hubOther = hub.expenses.total - hub.expenses.teaching - (hub.expenses.counselingCost || 0);
if (Math.abs(hubOther - principalAnnual - C.exp) > 1) {
  throw new Error(`חלק ג אינו מתאים למבט-רשת: ${C.exp} מול ${hubOther - principalAnnual}`);
}

// ── HTML ──
const ils = v => (v == null ? '' : `${Math.round(v).toLocaleString('he-IL')} ₪`);
const signed = v => `<span class="${v < 0 ? 'neg' : 'pos'}">${ils(v)}</span>`;
const logo = 'data:image/png;base64,' + fs.readFileSync('C:/tmp/work/school-budget/public/logo.png').toString('base64');
const lineRows = (lines) => lines.map(l => `<tr><td>${l.name}${l.basis ? `<div class="basis">${l.basis}</div>` : ''}</td><td class="n">${ils(l.amount)}</td></tr>`).join('');
const today = new Date().toLocaleDateString('he-IL');

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>תקציב לחתימה — ${api.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 14mm 13mm 14mm 13mm; }
* { box-sizing: border-box; }
body { font-family: Heebo, Arial, sans-serif; color: #1D3461; font-size: 10.5pt; margin: 0; }
.bh { position: absolute; top: 0; right: 0; font-size: 10pt; font-weight: 700; }
header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #4B2E83; padding: 14px 0 10px; }
header img { height: 58px; }
h1 { font-size: 19pt; font-weight: 900; margin: 0; }
.sub { color: #5A5478; font-size: 10pt; margin-top: 2px; }
h2 { font-size: 13pt; font-weight: 900; color: #4B2E83; margin: 18px 0 6px; display: flex; align-items: baseline; gap: 8px; }
h2 .src { font-size: 8.5pt; font-weight: 500; color: #6E6893; }
h3 { font-size: 10pt; font-weight: 700; color: #5A5478; margin: 8px 0 2px; }
table { width: 100%; border-collapse: collapse; }
td, th { padding: 3.5px 6px; text-align: right; vertical-align: top; }
td.n, th.n { text-align: left; white-space: nowrap; font-variant-numeric: tabular-nums; direction: ltr; }
.lines tr td { border-bottom: 1px dashed #E0DCF0; }
.basis { font-size: 8pt; color: #6E6893; }
tr.total td { font-weight: 900; border-top: 1.5px solid #1D3461; border-bottom: none; }
tr.diff td { font-weight: 900; background: #F5F3FC; font-size: 11pt; }
.neg { color: #B42318; } .pos { color: #067647; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.summary { margin-top: 12px; border: 1.5px solid #4B2E83; border-radius: 8px; overflow: hidden; }
.summary th { background: #4B2E83; color: #fff; font-weight: 700; }
.summary td { border-bottom: 1px solid #E0DCF0; }
.summary tr.grand td { background: #EDE9FB; font-weight: 900; font-size: 11.5pt; border: none; }
.fill { display: inline-block; min-width: 110px; border-bottom: 1px solid #1D3461; height: 1em; }
.note { font-size: 8.5pt; color: #5A5478; margin-top: 4px; line-height: 1.5; }
section { break-inside: avoid; }
.sign { margin-top: 26px; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; break-inside: avoid; }
.sign div { border-top: 1px solid #1D3461; padding-top: 4px; font-size: 9.5pt; }
.sign b { display: block; margin-bottom: 30px; font-size: 10.5pt; }
footer { margin-top: 14px; font-size: 8pt; color: #6E6893; border-top: 1px solid #E0DCF0; padding-top: 5px; }
</style></head><body>
<div class="bh">ב״ה</div>
<header>
  <img src="${logo}" alt="">
  <div>
    <h1>תקציב שנתי לחתימה — ${api.name}</h1>
    <div class="sub">שנת הלימודים תשפ״ז · ${hub.students} תלמידים · ${hub.classCount} כיתות · תקן ${school.hours_quota} שעות שבועיות · נכון ל-${today}</div>
  </div>
</header>

<table class="summary">
  <tr><th>חלק</th><th class="n">הכנסות</th><th class="n">הוצאות</th><th class="n">הפרש</th></tr>
  <tr><td>א. עלות הוראה</td><td class="n">${ils(A.inc)}</td><td class="n">${ils(A.exp)}</td><td class="n">${signed(A.inc - A.exp)}</td></tr>
  <tr><td>ב. צהרון</td><td class="n"><span class="fill"></span></td><td class="n">${ils(B.exp)}</td><td class="n"><span class="fill"></span></td></tr>
  <tr><td>ג. הוצאות שוטפות, מבנה ופעילות</td><td class="n">${ils(C.inc)}</td><td class="n">${ils(C.exp)}</td><td class="n">${signed(C.inc - C.exp)}</td></tr>
  <tr class="grand"><td>סה״כ בית הספר <span class="basis">(לפני הכנסות הצהרון)</span></td><td class="n">${ils(A.inc + C.inc)}</td><td class="n">${ils(A.exp + B.exp + C.exp)}</td><td class="n">${signed(A.inc + C.inc - A.exp - B.exp - C.exp)}</td></tr>
</table>

<section>
<h2>א. עלות הוראה <span class="src">ממערכת השכר · עובדי הוראה ומנהלת · שנתי</span></h2>
<div class="two">
  <div><h3>הכנסות</h3><table class="lines">${lineRows(A.income)}<tr class="total"><td>סה״כ הכנסות</td><td class="n">${ils(A.inc)}</td></tr></table></div>
  <div><h3>הוצאות</h3><table class="lines">${lineRows(A.expenses)}<tr class="total"><td>סה״כ הוצאות</td><td class="n">${ils(A.exp)}</td></tr></table></div>
</div>
<table><tr class="diff"><td>הפרש עלות הוראה</td><td class="n">${signed(A.inc - A.exp)}</td></tr></table>
${hoursYieul.length ? `<div class="note">ייעול השעות שנבחר (${hoursYieul.map(r => r.label.replace(/\s*\(.*\)$/, '')).join(' · ')}) כבר מגולם בעלות ההוראה בפועל ואינו מופחת שוב.</div>` : ''}
</section>

<section>
<h2>ב. צהרון <span class="src">ממערכת השכר · ${TZAHARON_MONTHS} חודשים · מחוץ לתקן ההוראה</span></h2>
<div class="two">
  <div><h3>הכנסות</h3><table class="lines">
    <tr><td>תשלומי הורים לצהרון</td><td class="n"><span class="fill"></span></td></tr>
    <tr><td>הכנסות נוספות לצהרון</td><td class="n"><span class="fill"></span></td></tr>
    <tr class="total"><td>סה״כ הכנסות</td><td class="n"><span class="fill"></span></td></tr></table></div>
  <div><h3>הוצאות</h3><table class="lines">${lineRows(B.expenses)}<tr class="total"><td>סה״כ הוצאות</td><td class="n">${ils(B.exp)}</td></tr></table>
    <div class="note">${ils(Math.round(tz.total))} לחודש · תעריף ${[...tz.rates].join(' / ')} ₪ לשעה</div></div>
</div>
<table><tr class="diff"><td>הפרש צהרון</td><td class="n"><span class="fill"></span></td></tr></table>
</section>

<section>
<h2>ג. הוצאות שוטפות, מבנה ופעילות <span class="src">ממערכת התקציב · שנתי</span></h2>
<div class="two">
  <div><h3>הכנסות</h3><table class="lines">${C.income.length ? lineRows(C.income) : '<tr><td>אין הכנסות נוספות</td><td></td></tr>'}<tr class="total"><td>סה״כ הכנסות</td><td class="n">${ils(C.inc)}</td></tr></table>
    <div class="note">הכנסות מהורים לפי הייעול שנבחר במערכת התקציב.</div></div>
  <div>${C.groups.map(([g, l]) => `<h3>${g}</h3><table class="lines">${lineRows(l)}</table>`).join('')}
    <table><tr class="total"><td>סה״כ הוצאות</td><td class="n">${ils(C.exp)}</td></tr></table>
    <div class="note">שכר המנהלת (${ils(principalAnnual)} בשנה) נכלל בעלות ההוראה בחלק א ולכן אינו מופיע כאן.</div></div>
</div>
<table><tr class="diff"><td>הפרש הוצאות שוטפות</td><td class="n">${signed(C.inc - C.exp)}</td></tr></table>
</section>

<div class="sign">
  <div><b>מנהלת בית הספר</b>שם: ____________________ &nbsp; תאריך: __________<br><br>חתימה: ____________________</div>
  <div><b>השליח</b>שם: ____________________ &nbsp; תאריך: __________<br><br>חתימה: ____________________</div>
</div>
<footer>הופק ממערכת השכר וממערכת התקציב של רשת חינוך חב״ד · ${today} · סכומים שנתיים בשקלים</footer>
</body></html>`;

const base = path.join(OUT_DIR, `תקציב לחתימה - ${api.name}`);
fs.writeFileSync(base + '.html', html);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({ path: base + '.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(JSON.stringify({ A: [A.inc, A.exp], B: B.exp, C: [C.inc, C.exp], total: A.inc + C.inc - A.exp - B.exp - C.exp, pdf: base + '.pdf' }));
