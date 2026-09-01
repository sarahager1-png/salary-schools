/*
  אימות: להריץ מחדש במחשבון הרשמי את מה שכבר חושב ביד, ולהשוות.

  "כשעשית הערכות הן לא תאמו" — הן לא תאמו כי הן לא היו חישוב אלא קו ישר
  בין שני מספרים שהומצאו. הכלי הזה לא מעריך כלום: הוא לוקח כל שורה שיש
  לה כבר מספר רשמי, שולח את אותם נתונים לטופס של משרד החינוך, ומשווה את
  מה שחוזר למה שרשום. פער — נאמר, עם הסיבה.

  **אינו כותב דבר.** קריאה בלבד, גם מול המסד החי.

    node verify-sim.mjs --month 2026-09 [--live] [--school "שם"] [--limit N]
*/
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';
import { formFields, openForm, runOne, targetField, pickEnv } from './sim-form.mjs';

const arg = (name, def = null) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? (process.argv[i + 1]?.startsWith('--') ? true : process.argv[i + 1]) : def;
};
const MONTH  = arg('month');
const SCHOOL = arg('school');
const LIMIT  = Number(arg('limit', 0)) || 0;
const LIVE   = process.argv.includes('--live');
if (!MONTH || !/^\d{4}-\d{2}$/.test(String(MONTH))) {
  console.error('חסר --month בפורמט YYYY-MM');
  process.exit(2);
}

let env, isProd;
try { ({ env, isProd } = pickEnv(fs, LIVE)); }
catch (e) { console.error(e.message); process.exit(2); }

// קריאה בלבד — מפתח השרת מספיק ואין צורך בסיסמת משתמש. הכלי אינו כותב.
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY ?? env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } });

let q = sb.from('teacher_months')
  .select('name, reform, degree, seniority, scope_pct, scope_pct_pre, scope_set_at, gamul_role, leave_type, children_under_18, official_gross, official_gross_pre, schools!inner(name)')
  .eq('month_key', MONTH);
if (SCHOOL && SCHOOL !== true) q = q.eq('schools.name', SCHOOL);
const { data: rows, error } = await q;
if (error) { console.error('טעינה נכשלה:', error.message); process.exit(1); }

// רק שורות שיש להן כבר מספר מהעולם הישן — הן ההוכחה
const cases = [];
for (const t of rows) {
  if (t.gamul_role === 'principal' || t.leave_type === 'unpaid') continue;
  const field = targetField(t);
  const expected = t[field];
  if (expected == null) continue;
  const f = formFields(t);
  if (f.skip) { cases.push({ t, skip: f.skip }); continue; }
  cases.push({ t, plan: f, expected });
}
const todo = cases.filter(c => c.plan).slice(0, LIMIT || undefined);

console.log(`מסד: ${env.VITE_SUPABASE_URL}  ${isProd ? '★ החי' : '(בדיקות)'}  ·  קריאה בלבד`);
console.log(`חודש ${MONTH} · ${rows.length} שורות · ${todo.length} עם מספר קיים להשוואה\n`);
if (!todo.length) process.exit(0);

const b = await chromium.launch();
const p = await (await b.newContext({ locale: 'he-IL', viewport: { width: 1300, height: 1400 } })).newPage();
const same = [], diff = [], failed = [];
try {
  await openForm(p);
  for (const c of todo) {
    const got = await runOne(p, c.plan, MONTH);
    const school = c.t.schools?.name ?? '';
    if (got == null) { failed.push(c); console.log(`✗ ${c.t.name} — לא נקרא ברוטו מהטופס`); continue; }
    const delta = got - c.expected;
    const pctOff = c.expected ? Math.abs(delta) / c.expected * 100 : 0;
    const line = `${c.t.name.padEnd(20)} ${(c.t.reform === 'ofek' ? 'בסיס' : 'ישן').padEnd(5)} ` +
      `דרגה ${c.plan.darga} · ותק ${String(c.plan.vetek).padStart(2)} · ${String(c.plan.pct).padStart(3)}%` +
      `${c.plan.kita ? ' · מחנכת' : '       '}  רשום ${String(c.expected).padStart(6)} · מחשבון ${String(got).padStart(6)}`;
    if (Math.abs(delta) <= 1) { same.push(c); console.log(`✓ ${line}`); }
    else { diff.push({ ...c, got, delta, pctOff, school }); console.log(`≠ ${line}  · פער ${delta > 0 ? '+' : ''}${delta} (${pctOff.toFixed(1)}%)`); }
  }
} finally { await b.close(); }

console.log('');
for (const c of cases.filter(x => x.skip)) console.log(`דילוג  ${c.t.name} — ${c.skip}`);
console.log(`\nתאמו ${same.length} · נבדלו ${diff.length} · לא נקראו ${failed.length}  (מתוך ${todo.length})`);

if (diff.length) {
  console.log('\nהפערים:');
  for (const d of diff) {
    console.log(`  ${d.school} · ${d.t.name}: רשום ${d.expected}, מחשבון ${d.got}, פער ${d.delta > 0 ? '+' : ''}${d.delta} (${d.pctOff.toFixed(1)}%)`);
  }
  fs.writeFileSync('verify-sim-diffs.json', JSON.stringify(diff.map(d => ({
    school: d.school, name: d.t.name, reform: d.t.reform, degree: d.t.degree,
    seniority: d.t.seniority, scope_pct: d.t.scope_pct, gamul_role: d.t.gamul_role,
    sent: d.plan, expected: d.expected, got: d.got, delta: d.delta,
  })), null, 1));
  console.log('\nהפירוט המלא: verify-sim-diffs.json');
}
process.exit(failed.length ? 1 : 0);
