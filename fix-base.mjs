/*
  תיקון הבסיס ותוספת בית חב"ד לכל מורות האופק.

  "הסימולציות לא נכונות… 3 שעות גלום באחוז המשרה… תריץ הכל ותשנה"
  (שרה, 8.9).

  הכלל: שני המחשבונים רצים על **אותו** אחוז משרה — זה שרשום במערכת —
  וההפרש ביניהם הוא תוספת בית חב"ד. שלוש שעות גמול החינוך כבר גלומות
  באחוז, ולכן אין לגזור ממנו אחוז נוסף.

  מה שהיה: הבסיס של חיה מושקא בק חושב בעולם ישן ב-80% ולא ב-86% —
  6,883 במקום 7,399 — ולכן 516 ₪ בחודש סווגו כתוספת בית חב"ד בזמן
  שהם שכר בסיס. פנסיה וקרן השתלמות חלות על הבסיס בלבד.

  מה הכלי עושה:
    1. מריץ את מחשבון העולם הישן לכל מורת אופק, באחוז שרשום לה.
    2. מחשב תוספת = ברוטו − בסיס.
    3. שומר גיבוי מלא לפני כתיבה (fix-base-backup-<זמן>.json).
    4. כותב רק את chabad_supp, ורק למי שהפער גדול מ-1 ₪.

  הרצה יבשה (ברירת מחדל):  node fix-base.mjs
  כתיבה בפועל:             node fix-base.mjs --write
*/
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';
import { openForm, runOne, dargaFor, kitaFor } from './sim-form.mjs';

const WRITE = process.argv.includes('--write');
const MONTH = '2026-09';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const { data: all } = await sb.from('teacher_months')
  .select('*, schools(name)').eq('month_key', MONTH);
/*
  "צריך להריץ את כולם" (שרה, 8.9) — לא רק מורות האופק.
  · אופק: המחשבון הישן נותן את ה**בסיס**, והתוספת היא ברוטו פחות בסיס.
  · עולם ישן: המחשבון נותן את ה**ברוטו** עצמו — כאן זו בדיקת אימות
    ולא חישוב תוספת (למורת עולם ישן אין פער בין המסלולים).
  מנהלות מדולגות: להן מחשבון ניהול נפרד.
*/
const rows = (all || []).filter(r =>
  r.gamul_role !== 'principal' &&
  Number(r.frontal_hours) > 0 && Number(r.official_gross) > 0 &&
  !['maternity', 'unpaid'].includes(r.leave_type || 'none') &&
  Number(r.scope_pct) > 0);
const nOfek = rows.filter(r => r.reform === 'ofek').length;

console.log(`${WRITE ? 'כתיבה' : 'הרצה יבשה'} · ${rows.length} מורות (${nOfek} אופק · ${rows.length - nOfek} עולם ישן) · חודש ${MONTH}\n`);

const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ locale: 'he-IL' })).newPage();
const out = [];
try {
  await openForm(p, 'old', { fresh: true });
  let i = 0;
  for (const t of rows) {
    i++;
    /*
      הבסיס רץ באחוז ה**ישן**, לא באחוז האופק (שרה, 8.9 — אושר על
      חיה מושקא בק: שכר משולב 2,945 מתקבל ב-90% בלבד).
      האחוז הישן = (שעות + 3 למחנכת) / 30, ומעל 79% אֵם מקבלת עוד 10.
    */
    const hrs = Number(t.frontal_hours) || 0;
    const kitaH = /^homeroom/.test(t.gamul_role || '') ? 3 : 0;
    const raw = (hrs + kitaH) / 30 * 100;
    const isMom = t.gender === 'f' && (t.children_under_18 || 0) > 0;
    const oldPct = t.reform === 'ofek'
      ? (isMom && raw > 79 ? Math.min(100, Math.floor(raw) + 10) : Math.round(raw))
      : Number(t.scope_pct);
    const plan = { calc: 'old', darga: dargaFor(t), kita: kitaFor(t),
      vetek: String(Math.max(1, Math.min(40, Number(t.seniority) || 1))),
      pct: String(oldPct) };
    if (!plan.darga) { console.log(`${String(i).padStart(2)}/${rows.length}`, t.name.padEnd(21), 'דילוג: אין דרגה בעולם הישן'); continue; }
    let base = null, err = null;
    for (let a = 0; a < 2 && base == null; a++) {
      try { base = await runOne(p, plan, MONTH); } catch (e) { err = e.message; }
    }
    if (base == null) { console.log(`${String(i).padStart(2)}/${rows.length}`, t.name.padEnd(21), 'שגיאה:', String(err).slice(0, 60)); continue; }
    const isOfek = t.reform === 'ofek';
    const oldSupp = Number(t.chabad_supp) || 0;
    const oldBase = t.official_gross - oldSupp;
    const newSupp = Math.round(t.official_gross - base);
    // בעולם ישן אין תוספת: המחשבון מחזיר את הברוטו עצמו, וזו בדיקה בלבד
    const delta = isOfek ? newSupp - oldSupp : null;
    const grossGap = isOfek ? null : Math.round(base) - t.official_gross;
    out.push({ id: t.id, name: t.name, school: t.schools?.name, reform: t.reform, pct: t.scope_pct,
      gross: t.official_gross, calc: Math.round(base), oldPct,
      oldBase: isOfek ? oldBase : null, newBase: isOfek ? Math.round(base) : null,
      oldSupp: isOfek ? oldSupp : null, newSupp: isOfek ? newSupp : null, delta, grossGap });
    console.log(`${String(i).padStart(2)}/${rows.length}`, t.name.padEnd(21), (t.schools?.name || '').padEnd(17),
      `${oldPct}%`.padStart(5), isOfek
        ? `| בסיס ${String(oldBase).padStart(6)} → ${String(Math.round(base)).padStart(6)} | תוספת ${String(oldSupp).padStart(5)} → ${String(newSupp).padStart(5)} ${delta === 0 ? '| תואם' : `| ${delta > 0 ? '+' : ''}${delta}`}`
        : `| ישן · ברוטו ${String(t.official_gross).padStart(6)} מול מחשבון ${String(Math.round(base)).padStart(6)} ${grossGap === 0 ? '| תואם' : `| ${grossGap > 0 ? '+' : ''}${grossGap}`}`);
  }
} finally { await b.close(); }

const changed = out.filter(x => x.delta != null && Math.abs(x.delta) > 1);
const preGaps = out.filter(x => x.grossGap != null && Math.abs(x.grossGap) > 1);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(`fix-base-backup-${stamp}.json`, JSON.stringify(out, null, 1), 'utf8');
console.log(`\nחושבו ${out.length} · תוספת משתנה אצל ${changed.length} מורות אופק · גיבוי fix-base-backup-${stamp}.json`);
if (preGaps.length) {
  console.log(`\nעולם ישן — ברוטו שאינו תואם למחשבון: ${preGaps.length} (בדיקה בלבד, לא נכתב)`);
  const up = preGaps.filter(x => x.grossGap > 0).reduce((a, x) => a + x.grossGap, 0);
  for (const x of preGaps) {
    console.log('  ', x.name.padEnd(21), (x.school || '').padEnd(17), `${x.pct}%`.padStart(5),
      '| רשום', String(x.gross).padStart(6), '| מחשבון', String(x.calc).padStart(6),
      '|', (x.grossGap > 0 ? '+' : '') + x.grossGap);
  }
  console.log(`  סה"כ העלאה אם יתוקן: ${up} ₪ לחודש`);
}
if (changed.length) {
  const up = changed.filter(x => x.delta > 0).reduce((a, x) => a + x.delta, 0);
  const dn = changed.filter(x => x.delta < 0).reduce((a, x) => a + x.delta, 0);
  console.log(`תוספת בית חב"ד: ${up > 0 ? '+' : ''}${up} עולה · ${dn} יורדת · נטו ${up + dn} ₪ לחודש`);
}
if (!WRITE) { console.log('\nהרצה יבשה — לא נכתב דבר. להרצה בפועל: node fix-base.mjs --write'); process.exit(0); }

/*
  הכתיבה עוברת דרך SQL ולא דרך PostgREST: הטריגר enforce_column_permissions
  חוסם כתיבת chabad_supp מהשרת, והמעקף המתועד הוא app.via_link — אותו
  מסלול שבו המנהלת שומרת. trg_log_data_fix ממשיך לרשום כל שינוי.
*/
fs.writeFileSync('fix-base.sql',
  'begin;\nset local app.via_link = \'1\';\n' +
  changed.map(x => `update public.teacher_months set chabad_supp = ${x.newSupp} where id = '${x.id}';`).join('\n') +
  '\ncommit;\n', 'utf8');
console.log('\nנכתב fix-base.sql · הרצה: supabase db query --linked -f fix-base.sql');
