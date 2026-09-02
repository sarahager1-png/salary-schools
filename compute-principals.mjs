/*
  תלושי מנהלים בעולם ישן — "למנהלים תעשה חישוב תלוש לפי עולם ישן עם
  תוספת בית חב"ד" (שרה, 3.9.2026).

  לכל מנהל/ת: הרצת מחשבון העולם הישן (דרגה+ותק, 100%, גמול ניהול לפי
  ותק ההוראה ומספר הכיתות מהתקציב), לכידת שורות הרכיבים אל slip_lines,
  והדפסת התוספת = ברוטו בפועל − תוצאת העולם הישן. לא כותב שום שכר —
  רק slip_lines (טבלת התצוגה של התלושים).

  הרצה:  node compute-principals.mjs            (מסד חי)
*/
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { openForm, runOne, readResultRows, principalPlanFor } from './sim-form.mjs';

const env = Object.fromEntries(readFileSync('C:/tmp/work/salary-schools/.env.local', 'utf8')
  .split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const MONTH = '2026-09';
const { data: schools } = await sb.from('schools').select('id, name');
const byId = new Map(schools.map(s => [s.id, s.name]));
const { data: principals } = await sb.from('teacher_months')
  .select('id, name, school_id, degree, grade, seniority, official_gross')
  .eq('month_key', MONTH).eq('gamul_role', 'principal').order('name');

const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: 'he-IL', viewport: { width: 1300, height: 1600 } })).newPage();

let ok = 0;
for (const t of principals) {
  const schoolName = byId.get(t.school_id);
  const plan = principalPlanFor(t, schoolName);
  if (plan.skip) { console.log(`⏭ ${t.name} (${schoolName}): ${plan.skip}`); continue; }
  try {
    const gross = await runOne(page, plan, MONTH);
    if (gross == null) { console.log(`✗ ${t.name}: אין ברוטו בתוצאה`); continue; }
    const rows = await readResultRows(page);
    await sb.from('slip_lines').upsert({
      teacher_month_id: t.id, lines: rows, gross,
      computed_at: new Date().toISOString(),
    });
    const supp = t.official_gross != null ? Math.round(t.official_gross - gross) : null;
    console.log(`✓ ${t.name} (${schoolName}, ${plan.darga}/${plan.vetek}, ${plan.nihul.classes} כיתות) → עולם ישן ${gross.toLocaleString()} ₪` +
      (supp != null ? ` · תוספת בית חב"ד ${supp.toLocaleString()} ₪` : ' · אין ברוטו בפועל — תוספת תחושב כשיוזן'));
    ok++;
  } catch (e) {
    console.log(`✗ ${t.name}: ${String(e.message).slice(0, 140)}`);
  }
}
console.log(`\nהושלמו ${ok}/${principals.length}`);
await browser.close();
