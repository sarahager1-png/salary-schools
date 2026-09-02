/*
  נתוני התלוש — עולם ישן מהשעות, והתוספת היא ההפרש.

  "תלושי השכר של הרשת הם בעולם ישן. החשבת בונה עולם ישן, והתוספת היא
  תוספת בית חב"ד. לכל אחת מהמורות תבנה על פי השעות שלה נתונים לתלוש.
  למחנכת יש 3 שעות חינוך בעולם ישן." (שרה, 3.9.2026)

  הגזירה לכל מורה:
    שעות לתלוש     = פרונטלי + 3 למחנכת
    אחוז עולם ישן  = שעות ÷ 30 · ולאם, אם התוצאה מעל 79% — עוד 10 נק׳
                     (הכללים חיים ב-computedBaseScope/momScopeBonus —
                     אותו קוד של המערכת, לא חישוב מקביל)
    דרגה עולם ישן  = מהתואר (MA=2, BA=3, בכירים=7, מתמחה=18, בלתי־מוסמכת=12)
    ברוטו עולם ישן = מחשבון משרד החינוך, בדרייבר המוקשח
    תוספת בית חב"ד = השכר בפועל במערכת − הברוטו לתלוש

  מורת עולם-ישן: התלוש הוא השכר עצמו והתוספת היא מה שהוזן (אם הוזן).
  מזכרת בתיה אינה משלמת תוספת — מסומן.

    node slip-data.mjs --month 2026-09 --name "חן דאבוש" [--live]
    node slip-data.mjs --month 2026-09 --school "שלהבות אשקלון" [--live]
*/
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';
import { dargaFor, kitaFor, openForm, runOne, pickEnv } from './sim-form.mjs';
import { computedBaseScope, momScopeBonus, homeroomHours, isPrincipalRow } from './src/lib/employer.js';

const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const MONTH = arg('month'), NAME = arg('name'), SCHOOL = arg('school');
const LIVE = process.argv.includes('--live');
const ALL = process.argv.includes('--all');
if (!MONTH || (!NAME && !SCHOOL && !ALL)) { console.error('חסר --month ו---name/--school/--all'); process.exit(2); }
let env, isProd;
try { ({ env, isProd } = pickEnv(fs, LIVE)); } catch (e) { console.error(e.message); process.exit(2); }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

let q = sb.from('teacher_months')
  .select('id, name, reform, degree, grade, seniority, scope_pct, gamul_role, gender, children_under_18, leave_type, frontal_hours, official_gross, agreed_gross, chabad_supp, schools!inner(name, chabad_supp)')
  .eq('month_key', MONTH);
if (NAME) q = q.eq('name', NAME);
if (SCHOOL) q = q.eq('schools.name', SCHOOL);
const { data: rows, error } = await q;
if (error) { console.error(error.message); process.exit(1); }
console.log(`מסד: ${env.VITE_SUPABASE_URL}  ${isProd ? '★ החי' : '(בדיקות)'}  ·  קריאה בלבד\n`);

/*
  אחוז העולם הישן — מהשעות, בכללי pre, גם למורת אופק: התלוש נבנה
  בעולם ישן. pseudo עם reform='pre' מפעיל את homeroomHours (3 ש׳)
  ואת כלל האם של העולם הישן על אותו קוד שהמערכת חיה עליו.
*/
const oldScopeOf = (t) => {
  const pseudo = {
    reform: 'pre', frontalHours: t.frontal_hours, role: t.gamul_role,
    gender: t.gender, childrenUnder18: t.children_under_18,
  };
  const base = computedBaseScope(pseudo);
  const bonus = momScopeBonus({ ...pseudo, scope: base, scopePct: base });
  return { base, bonus, total: Math.min(100, base + bonus), hours: (Number(t.frontal_hours) || 0) + homeroomHours(pseudo) };
};

const out = [];
const b = await chromium.launch();
const p = await (await b.newContext({ locale: 'he-IL', viewport: { width: 1300, height: 1600 } })).newPage();
try {
  await openForm(p, 'old');
  for (const t of rows || []) {
    if (isPrincipalRow({ role: t.gamul_role })) { console.log(`— ${t.name}: מנהלת — תלוש נפרד, לא כאן\n`); continue; }
    if (t.leave_type === 'maternity') { console.log(`— ${t.name}: חל"ד — אין תלוש שכר, רק הפרשות\n`); continue; }
    if (t.leave_type === 'unpaid') { console.log(`— ${t.name}: חל"ת — אין תלוש\n`); continue; }
    if (!Number(t.frontal_hours)) { console.log(`— ${t.name}: 0 שעות — ממתינה לעדכון\n`); continue; }
    const darga = dargaFor(t);
    if (!darga) { console.log(`— ${t.name}: אין תרגום לתואר "${t.degree}"\n`); continue; }

    if (t.reform !== 'ofek') {
      // עולם ישן: התלוש הוא השורה עצמה — הברוטו כבר אומת מול המחשבון
      const actualPre = Number(t.agreed_gross) || Number(t.official_gross) || 0;
      out.push({ id: t.id, name: t.name, school: t.schools.name, track: 'pre',
        darga: dargaFor(t), vetek: t.seniority, pct: t.scope_pct,
        kita: kitaFor(t), oldGross: actualPre, actual: actualPre,
        supp: Number(t.chabad_supp) || 0, suppAction: 'קיימת/ללא' });
      console.log(`✓ ${t.name.padEnd(22)} עולם ישן · ${t.scope_pct}% · תלוש = ${actualPre.toLocaleString('he-IL')} ₪ · תוספת כפי שהוזנה`);
      continue;
    }
    const sc = oldScopeOf(t);
    const plan = {
      calc: 'old', darga,
      vetek: String(Math.max(1, Math.min(40, Number(t.seniority) || 1))),
      pct: String(sc.total),
      kita: kitaFor(t),
    };
    const oldGross = await runOne(p, plan, MONTH);
    const actual = Number(t.agreed_gross) || Number(t.official_gross) || 0;
    const paysSupp = t.schools.chabad_supp !== false;
    const supp = paysSupp ? actual - (oldGross || 0) : 0;

    out.push({ id: t.id, name: t.name, school: t.schools.name, track: 'ofek',
      darga, vetek: plan.vetek, pct: sc.total, hours: sc.hours, kita: plan.kita,
      oldGross, actual, supp, paysSupp });
    if (ALL) {
      console.log(`✓ ${t.name.padEnd(22)} ${t.schools.name.padEnd(18)} ${String(sc.total).padStart(3)}%${plan.kita ? ' · מחנכת' : '        '} עולם-ישן ${String(oldGross ?? '?').padStart(6)} + תוספת ${String(supp).padStart(6)} = ${actual}`);
      continue;
    }
    console.log(`═══ ${t.name} · ${t.schools.name} ═══`);
    console.log(`  מסלול בפועל: ${t.reform === 'ofek' ? 'אופק חדש' : 'עולם ישן'} · תואר ${t.degree} · ותק ${plan.vetek}`);
    console.log(`  שעות לתלוש: ${t.frontal_hours} פרונטלי${sc.hours > Number(t.frontal_hours) ? ' + 3 חינוך (מחנכת) = ' + sc.hours : ''}`);
    console.log(`  אחוז משרה עולם ישן: ${sc.hours}/30 = ${sc.base}%${sc.bonus ? ` + ${sc.bonus} תוספת אם = ${sc.total}%` : ''}`);
    console.log(`  ── לתלוש ──`);
    console.log(`  דרגה: ${darga} · ותק: ${plan.vetek} · אחוז: ${sc.total}%${plan.kita ? ' · גמול חינוך' : ''}`);
    console.log(`  ברוטו עולם ישן (מחשבון המשרד): ${oldGross ? oldGross.toLocaleString('he-IL') : '?'} ₪`);
    console.log(`  השכר בפועל במערכת: ${actual.toLocaleString('he-IL')} ₪`);
    if (!paysSupp) console.log(`  תוספת בית חב"ד: — (בית הספר אינו משלם תוספת)`);
    else console.log(`  תוספת בית חב"ד לתלוש: ${supp >= 0 ? '' : '−'}${Math.abs(supp).toLocaleString('he-IL')} ₪${supp < 0 ? '  ← שלילית! העולם הישן גבוה מהשכר בפועל — לבדיקה' : ''}`);
    // "הברוטו נשאר אותו ברוטו... לא מוסיפים תוספות על תוספת בית חב"ד"
    if (paysSupp) console.log(`  בדיקה: ${oldGross ? oldGross.toLocaleString('he-IL') : '?'} + ${supp.toLocaleString('he-IL')} = ${actual.toLocaleString('he-IL')} ₪ — אותו ברוטו בדיוק`);
    console.log(`  לחשבת: התוספת שורה קבועה — בלי הבראה/ביגוד/פנסיה עליה; רק מס שכר וביטוח לאומי כחוק`);
    console.log('');
  }
} finally { await b.close(); }
fs.writeFileSync('slip-data.json', JSON.stringify({ month: MONTH, rows: out }, null, 1));
const neg = out.filter(r => r.track === 'ofek' && r.paysSupp && r.supp < 0);
console.log(`
נגזרו ${out.length} תלושים · נשמר slip-data.json${neg.length ? ` · ${neg.length} תוספות שליליות — לבדיקה!` : ''}`);
