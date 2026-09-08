/*
  פירוט רכיבי השכר מהמחשבון הרשמי — שורה-שורה, לא רק הסה"כ.

  "כמה שכר משולב?" (שרה, 8.9). runOne מחזיר את "סך הכל ברוטו כללי"
  בלבד; כאן קוראים את כל טבלת התוצאה, כדי לראות מה מרכיב אותו.

  קריאה בלבד. אינה כותבת דבר למסד.
    node sim-rows.mjs "שם מורה" [אחוז-אופק] [אחוז-ישן]
*/
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';
import { openForm, setMonth, readResultRows, formFields, dargaFor, kitaFor } from './sim-form.mjs';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const NAME = process.argv[2] || 'חיה מושקא בק';
const MONTH = '2026-09';

const { data } = await sb.from('teacher_months')
  .select('*, schools(name)').eq('month_key', MONTH).ilike('name', `%${NAME}%`);
const t = data?.[0];
if (!t) { console.error('לא נמצאה', NAME); process.exit(1); }

const hrs = Number(t.frontal_hours) || 0;
const kitaHours = /^homeroom/.test(t.gamul_role || '') ? 3 : 0;
const oldPctRaw = Math.round((hrs + kitaHours) / 30 * 100);
const ofekPct = process.argv[3] || String(t.scope_pct);
const oldPct  = process.argv[4] || String(oldPctRaw);

const supp = Number(t.chabad_supp) || 0;
console.log(`${t.name} · ${t.schools?.name} · ${t.degree} · ותק ${t.seniority} · ${hrs} שעות${kitaHours ? ' (מחנכת)' : ''}`);
console.log(`במערכת: ברוטו ${t.official_gross} · תוספת ${supp} · בסיס ${t.official_gross - supp}\n`);

const show = (title, rows) => {
  console.log(title);
  if (!rows.length) { console.log('  (לא נקראו רכיבים)\n'); return; }
  let sum = 0;
  for (const r of rows) { sum += r.amount;
    console.log('  ' + String(r.label).padEnd(34) + String(Math.round(r.amount)).padStart(8) + ' ₪' + (r.qty ? `   ${r.qty}` : '')); }
  console.log('  ' + '─'.repeat(46));
  console.log('  ' + 'סך הרכיבים'.padEnd(34) + String(Math.round(sum)).padStart(8) + ' ₪\n');
};

const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ locale: 'he-IL' })).newPage();
try {
  if (t.reform === 'ofek') {
    const ff = formFields(t);
    if (!ff.skip) {
      await runPlan(p, { ...ff, pct: ofekPct });
      show(`— אופק חדש ב-${ofekPct}% —`, await readResultRows(p));
    } else console.log('אופק — דילוג:', ff.skip, '\n');
  }
  const plan = { calc: 'old', darga: dargaFor(t), kita: kitaFor(t),
    vetek: String(Math.max(1, Math.min(40, Number(t.seniority) || 1))), pct: oldPct };
  await runPlan(p, plan);
  show(`— עולם ישן ב-${oldPct}% —`, await readResultRows(p));
} finally { await b.close(); }

/* הרצה אחת בלי לקרוא את הסה"כ — הרכיבים נקראים אחריה */
async function runPlan(page, plan) {
  const { runOne } = await import('./sim-form.mjs');
  try { await runOne(page, plan, MONTH); } catch (e) { console.log('  (אזהרה בהרצה:', e.message.slice(0, 80) + ')'); }
}
