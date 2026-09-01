/*
  שלב החישוב של המרַיץ — קריאה בלבד.

  מריץ במחשבון הרשמי כל שורה שחסר לה ברוטו ותוכנית ההרצה שלה שלמה,
  ושומר את התוצאות ל-computed-sims.json. לא כותב למסד דבר: הכתיבה היא
  שלב נפרד (apply-sims), אחרי שרואים את המספרים.

    node compute-sims.mjs --month 2026-09 [--live] [--limit N]
*/
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';
import { planFor, openForm, runOne, pickEnv } from './sim-form.mjs';

const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const MONTH = arg('month');
const LIMIT = Number(arg('limit', 0)) || 0;
const LIVE = process.argv.includes('--live');
if (!MONTH) { console.error('חסר --month'); process.exit(2); }
let env, isProd;
try { ({ env, isProd } = pickEnv(fs, LIVE)); } catch (e) { console.error(e.message); process.exit(2); }

const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY ?? env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } });
const { data: rows, error } = await sb.from('teacher_months')
  .select('id, name, reform, degree, grade, seniority, scope_pct, scope_set_at, gamul_role, leave_type, frontal_hours, children_under_18, official_gross, schools!inner(name)')
  .eq('month_key', MONTH).is('official_gross', null);
if (error) { console.error('טעינה נכשלה:', error.message); process.exit(1); }

const plans = rows.map(t => ({ t, plan: planFor(t) }));
const todo = plans.filter(x => !x.plan.skip)
  .sort((a, b) => (a.plan.calc || 'old').localeCompare(b.plan.calc || 'old'))
  .slice(0, LIMIT || undefined);
console.log(`מסד: ${env.VITE_SUPABASE_URL}  ${isProd ? '★ החי' : '(בדיקות)'}  ·  קריאה בלבד`);
console.log(`${rows.length} שורות בלי ברוטו · ${todo.length} להרצה\n`);
if (!todo.length) process.exit(0);

const b = await chromium.launch();
const p = await (await b.newContext({ locale: 'he-IL', viewport: { width: 1300, height: 1600 } })).newPage();
const out = [], failed = [];
try {
  await openForm(p, todo[0].plan.calc || 'old');
  for (const { t, plan } of todo) {
    let gross = null;
    try { gross = await runOne(p, plan, MONTH); } catch (e) { failed.push({ t, why: e.message?.slice(0, 80) }); console.log(`✗ ${t.name} — ${e.message?.slice(0, 80)}`); continue; }
    if (!gross) { failed.push({ t, why: 'לא נקרא ברוטו' }); console.log(`✗ ${t.name} — לא נקרא ברוטו`); continue; }
    out.push({ id: t.id, name: t.name, school: t.schools.name, calc: plan.calc, sent: plan, gross });
    console.log(`✓ ${t.name.padEnd(22)} ${t.schools.name.padEnd(18)} ${(plan.calc === 'ofek' ? 'אופק' : 'ישן').padEnd(5)} ותק ${plan.vetek} · ${plan.pct}%${plan.kita ? ' · מחנכת' : ''} → ${gross.toLocaleString('he-IL')} ₪`);
  }
} finally { await b.close(); }

fs.writeFileSync('computed-sims.json', JSON.stringify({ month: MONTH, live: isProd, results: out }, null, 1));
console.log(`\nחושבו ${out.length} · נכשלו ${failed.length} · נשמר computed-sims.json (שום דבר לא נכתב למסד)`);
