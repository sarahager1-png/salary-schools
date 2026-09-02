/*
  חישוב מחדש לשורות שאחוז המשרה שלהן שוּנה.

  "תריץ סימולציות לכל מי ששיניתי אחוזי משרה" (שרה, 2.9). נלקחות כל
  השורות שבהן scope_set_at מאוחר מ---since, מורצות במחשבון עם הנתונים
  הנוכחיים, והפלט נשמר ל-recomputed.json עם הישן והחדש זה לצד זה.
  קריאה בלבד — הכתיבה בשלב נפרד, עם שמירת ערך-ישן בתנאי העדכון.

    node recompute.mjs --month 2026-09 --since 2026-09-02 [--live]
*/
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';
import { formFields, openForm, runOne, pickEnv } from './sim-form.mjs';

const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const MONTH = arg('month');
const SINCE = arg('since');
const LIVE = process.argv.includes('--live');
if (!MONTH || !SINCE) { console.error('חסר --month או --since'); process.exit(2); }
let env, isProd;
try { ({ env, isProd } = pickEnv(fs, LIVE)); } catch (e) { console.error(e.message); process.exit(2); }

const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY ?? env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } });
const { data: rows, error } = await sb.from('teacher_months')
  .select('id, name, reform, degree, grade, seniority, scope_pct, scope_set_at, gamul_role, leave_type, frontal_hours, children_under_18, official_gross, schools!inner(name)')
  .eq('month_key', MONTH).gte('scope_set_at', SINCE);
if (error) { console.error('טעינה נכשלה:', error.message); process.exit(1); }

console.log(`מסד: ${env.VITE_SUPABASE_URL}  ${isProd ? '★ החי' : '(בדיקות)'}  ·  קריאה בלבד`);
console.log(`${rows.length} שורות עם אחוז שנקבע מאז ${SINCE}\n`);
const todo = [], skipped = [];
for (const t of rows) {
  if (t.gamul_role === 'principal') { skipped.push([t, 'מנהלת']); continue; }
  const f = formFields(t);
  if (f.skip) { skipped.push([t, f.skip]); continue; }
  todo.push({ t, plan: f });
}
todo.sort((a, b) => (a.plan.calc || 'old').localeCompare(b.plan.calc || 'old'));
for (const [t, why] of skipped) console.log(`דילוג  ${t.name} — ${why}`);
if (!todo.length) process.exit(0);

const b = await chromium.launch();
const p = await (await b.newContext({ locale: 'he-IL', viewport: { width: 1300, height: 1600 } })).newPage();
const out = [];
try {
  await openForm(p, todo[0].plan.calc || 'old');
  for (const { t, plan } of todo) {
    let gross = null;
    try { gross = await runOne(p, plan, MONTH); } catch (e) { console.log(`✗ ${t.name} — ${e.message?.slice(0, 90)}`); continue; }
    if (!gross) { console.log(`✗ ${t.name} — לא נקרא ברוטו`); continue; }
    const mark = gross === t.official_gross ? 'ללא שינוי' : `${(t.official_gross ?? '—')} → ${gross}`;
    out.push({ id: t.id, name: t.name, school: t.schools.name, old: t.official_gross, gross, pct: plan.pct, kita: plan.kita });
    console.log(`✓ ${t.name.padEnd(20)} ${t.schools.name.padEnd(18)} ${String(plan.pct).padStart(3)}%${plan.kita ? ' · מחנכת' : ''}  ${mark}`);
  }
} finally { await b.close(); }
fs.writeFileSync('recomputed.json', JSON.stringify({ month: MONTH, live: isProd, results: out }, null, 1));
console.log(`\n${out.length} חושבו · נשמר recomputed.json (שום דבר לא נכתב למסד)`);
