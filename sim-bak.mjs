/*
  סימולציית עולם ישן לחיה מושקא בק — במחשבון הרשמי, שלוש הרצות.

  "הסימולציות לא נכונות… תעשה סימולציה עולם ישן לבק" (שרה, 8.9).
  היא רשומה באופק ב-86%, אבל **הבסיס** שממנו נגזרת תוספת בית חב"ד
  מחושב בעולם הישן — ושם האחוז שלה הוא 90%: 21 שעות ועוד 3 גמול
  חינוך, חלקי 30 = 80%, ומעל 79% אֵם מקבלת עוד 10.

  `preScope` ב-sim-form.mjs שולח למחשבון `scope_pct` — 86 — גם כשהוא
  מריץ את מחשבון העולם הישן. הריצה כאן בודקת איזה אחוז מייצר את הבסיס
  הרשום לה, 6,883 ₪.

  קריאה בלבד. אינה כותבת דבר למסד.
*/
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';
import { openForm, runOne, dargaFor, kitaFor, formFields } from './sim-form.mjs';

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

const supp = Number(t.chabad_supp) || 0;
const base = t.official_gross - supp;
const hrs = Number(t.frontal_hours) || 0;
const kitaHours = /^homeroom/.test(t.gamul_role || '') ? 3 : 0;
const raw = (hrs + kitaHours) / 30 * 100;
const isMom = t.gender === 'f' && (t.children_under_18 || 0) > 0;
const oldPct = isMom && raw > 79 ? Math.min(100, Math.floor(raw) + 10) : Math.round(raw);

console.log(`${t.name} · ${t.schools?.name}`);
console.log(`  מסלול ${t.reform} · תואר ${t.degree} · ותק ${t.seniority} · גמול ${t.gamul_role} · ${t.children_under_18} ילדים`);
console.log(`  שעות ${hrs}${kitaHours ? ` (+${kitaHours} גמול חינוך = ${hrs + kitaHours})` : ''}`);
console.log(`  אחוז אופק רשום: ${t.scope_pct}%  ·  אחוז עולם ישן: ${raw.toFixed(1)}%${isMom && raw > 79 ? ` → +10 תוספת אם = ${oldPct}%` : ` = ${oldPct}%`}`);
console.log(`  במערכת: ברוטו ${t.official_gross} · תוספת ${supp} · בסיס ${base}\n`);

const darga = dargaFor(t), kita = kitaFor(t);
const vetek = String(Math.max(1, Math.min(40, Number(t.seniority) || 1)));
const rawPct = Math.round(raw);
const runs = [
  { label: `${t.scope_pct}% — אחוז האופק (מה שנשלח היום)`,      pct: String(t.scope_pct) },
  { label: `${rawPct}% — עולם ישן בלי תוספת אם`,                 pct: String(rawPct) },
  { label: `${oldPct}% — עולם ישן עם תוספת אם`,                  pct: String(oldPct) },
];

const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ locale: 'he-IL' })).newPage();
try {
  /* מחשבון אופק — הברוטו עצמו, מול מה שרשום לה */
  if (t.reform === 'ofek') {
    const ff = formFields(t);
    console.log('— מחשבון אופק (הברוטו) —');
    if (ff.skip) console.log('  דילוג:', ff.skip);
    else for (const pct of [String(t.scope_pct), String(oldPct)]) {
      let v = null, e = null;
      try { v = await runOne(p, { ...ff, pct }, MONTH); } catch (x) { e = x.message; }
      const g = v != null ? v - t.official_gross : null;
      console.log(`  אופק ב-${pct}%`.padEnd(36), '→', v != null ? String(Math.round(v)).padStart(6) + ' ₪' : 'שגיאה: ' + e,
        g != null ? `| מול הברוטו הרשום ${t.official_gross}: ${g === 0 ? 'תואם בדיוק' : (g > 0 ? '+' : '') + Math.round(g)}` : '');
    }
    console.log('');
  }
  console.log('— מחשבון עולם ישן (הבסיס) —');
  await openForm(p, 'old', { fresh: true });
  for (const r of runs) {
    const plan = { calc: 'old', darga, vetek, pct: r.pct, kita, field: 'official_gross' };
    let val = null, err = null;
    // runOne מחזיר את הברוטו כמספר, לא אובייקט
    try { val = await runOne(p, plan, MONTH); } catch (e) { err = e.message; }
    const gap = val != null ? val - base : null;
    console.log(r.label.padEnd(38), '→', val != null ? String(Math.round(val)).padStart(6) + ' ₪' : `שגיאה: ${err}`,
      gap != null ? `| מול הבסיס הרשום ${base}: ${gap === 0 ? 'תואם בדיוק' : (gap > 0 ? '+' : '') + Math.round(gap)}` : '');
  }
} finally { await b.close(); }
