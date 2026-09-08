/*
  אימות הברוטו באופק — לכל מורות האופק, מול המחשבון הרשמי.

  "תבדוק גם את הברוטו באופק לכולם" (שרה, 8.9). ההרצה הקודמת בדקה את
  ה**בסיס** (מחשבון עולם ישן) ומצאה שש מורות שאצלן התוספת יוצאת
  שלילית — הבסיס גבוה מהברוטו. או שהבסיס שגוי, או שהברוטו שגוי.
  כאן נבדק הצד השני.

  קריאה בלבד. אינה כותבת דבר.
    node check-ofek.mjs
*/
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';
import { openForm, runOne, formFields } from './sim-form.mjs';

const MONTH = '2026-09';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const { data: all } = await sb.from('teacher_months').select('*, schools(name)').eq('month_key', MONTH);
const rows = (all || []).filter(r =>
  r.reform === 'ofek' && r.gamul_role !== 'principal' &&
  Number(r.frontal_hours) > 0 && Number(r.official_gross) > 0 &&
  !['maternity', 'unpaid'].includes(r.leave_type || 'none') && Number(r.scope_pct) > 0);

console.log(`אימות ברוטו באופק · ${rows.length} מורות · חודש ${MONTH}\n`);

const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ locale: 'he-IL' })).newPage();
const out = [];
try {
  let i = 0;
  for (const t of rows) {
    i++;
    const ff = formFields(t);
    if (ff.skip) { console.log(`${String(i).padStart(2)}/${rows.length}`, t.name.padEnd(21), 'דילוג:', ff.skip); continue; }
    let calc = null, err = null;
    for (let a = 0; a < 2 && calc == null; a++) {
      try { calc = await runOne(p, ff, MONTH); } catch (e) { err = e.message; }
    }
    if (calc == null) { console.log(`${String(i).padStart(2)}/${rows.length}`, t.name.padEnd(21), 'שגיאה:', String(err).slice(0, 60)); continue; }
    const gap = Math.round(calc) - t.official_gross;
    out.push({ id: t.id, name: t.name, school: t.schools?.name, pct: t.scope_pct,
      gross: t.official_gross, calc: Math.round(calc), gap, kita: ff.kita, darga: ff.darga, vetek: ff.vetek });
    console.log(`${String(i).padStart(2)}/${rows.length}`, t.name.padEnd(21), (t.schools?.name || '').padEnd(17),
      `${t.scope_pct}%`.padStart(5), '| רשום', String(t.official_gross).padStart(6),
      '| מחשבון', String(Math.round(calc)).padStart(6), gap === 0 ? '| תואם' : `| ${gap > 0 ? '+' : ''}${gap}`);
  }
} finally { await b.close(); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(`check-ofek-${stamp}.json`, JSON.stringify(out, null, 1), 'utf8');
const bad = out.filter(x => Math.abs(x.gap) > 1);
console.log(`\nנבדקו ${out.length} · תואמות ${out.length - bad.length} · לא תואמות ${bad.length}`);
if (bad.length) {
  const up = bad.filter(x => x.gap > 0).reduce((a, x) => a + x.gap, 0);
  const dn = bad.filter(x => x.gap < 0).reduce((a, x) => a + x.gap, 0);
  console.log(`הברוטו במחשבון גבוה ב-${up} · נמוך ב-${dn} · נטו ${up + dn} ₪ לחודש\n`);
  for (const x of bad.sort((a, b) => b.gap - a.gap)) {
    console.log('  ', x.name.padEnd(21), (x.school || '').padEnd(17), `${x.pct}%`.padStart(5),
      '| רשום', String(x.gross).padStart(6), '| מחשבון', String(x.calc).padStart(6),
      '|', (x.gap > 0 ? '+' : '') + x.gap);
  }
}
console.log(`\nגיבוי check-ofek-${stamp}.json · לא נכתב דבר למסד.`);
