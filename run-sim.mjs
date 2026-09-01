/*
  הרצת סימולציות עולם ישן במחשבון הרשמי — אוטומטית, על הטופס האמיתי.

  זה לא חישוב שלנו. זה אותו טופס ציבורי שאסתר ממלאת ביד, באותו דפדפן,
  עם אותה לחיצה על "חשב" — רק שהשדות מוקלדים מהמסד והתוצאה חוזרת אליו.
  המספר שנשמר הוא "סך הכל ברוטו כללי", כמו שנשמר היום.

  למה בדפדפן ולא ב-API: אתר המחשבון יושב מאחורי Cloudflare שמחזיר 403
  לכל פנייה שאינה מדפדפן (ראי supabase/functions/calc-salary). דפדפן
  אמיתי הוא לא עקיפה — זו בדיוק הדרך שבה משתמשים במחשבון.

  ── מה נשלח לטופס ──
  דרגת השכלה, ותק, אחוז משרה, וכיתת חינוך למחנכת. שום דבר אינו מנוחש:
  מי שהתרגום שלה אינו ודאי מדולגת ונשארת להזנה ידנית. אחוז משרה שלא
  נקבע (עדיין ברירת המחדל 100) מדלג גם הוא — סימולציה עליו תצא שגויה.

  ── חודש השכר ──
  הטופס נפתח על החודש הקלנדרי. בהרצה הקודמת הוא לא נקבע, וארבע מתוך
  שבע התוצאות תאמו את אסתר בדיוק בעוד שלוש נפלו ב-2.05% — הפרש של
  חודש שכר, לא של חישוב. כאן הוא נקבע במפורש לחודש שמריצים.

    node run-sim.mjs --month 2026-09 [--live] [--school "שם"] [--limit N] [--dry]

  בלי --live הוא מדבר עם מסד הבדיקות. עם --live — עם המסד שהמנהלות
  עובדות בו, והשורה הראשונה בפלט אומרת את זה.

  נדרשים SIM_EMAIL ו-SIM_PASSWORD של משתמש אמיתי במערכת: הכתיבה עוברת
  דרך אותן הרשאות שבאפליקציה, ולא עוקפת אותן.
*/
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';
import { planFor, openForm, runOne, pickEnv } from './sim-form.mjs';

// ── ארגומנטים ────────────────────────────────────────────────
const arg = (name, def = null) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? (process.argv[i + 1]?.startsWith('--') ? true : process.argv[i + 1]) : def;
};
const MONTH  = arg('month');
const SCHOOL = arg('school');
const LIMIT  = Number(arg('limit', 0)) || 0;
const DRY    = process.argv.includes('--dry');
if (!MONTH || !/^\d{4}-\d{2}$/.test(String(MONTH))) {
  console.error('חסר --month בפורמט YYYY-MM. לדוגמה: node run-sim.mjs --month 2026-09 --dry');
  process.exit(2);
}

/*
  לאיזה מסד. זו לא הערה טכנית — זו הטעות שקרתה בפועל: כל שאר הכלים כאן
  טוענים .env.test אם הוא קיים, כי הם בדיקות שיוצרות ומוחקות נתונים.
  המרַיץ הזה אינו בדיקה, והוא רץ בשקט מול מסד הבדיקות: "הרצתי" ולא קרה
  כלום, כי שם אין את בתי הספר. לכן המסד נבחר במפורש ונאמר בקול.
*/
const LIVE = process.argv.includes('--live');
let env, isProd;
try { ({ env, isProd } = pickEnv(fs, LIVE)); }
catch (e) { console.error(e.message); process.exit(2); }
const DB_URL = env.VITE_SUPABASE_URL;

const EMAIL = process.env.SIM_EMAIL, PASSWORD = process.env.SIM_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error(
    'חסרים SIM_EMAIL ו-SIM_PASSWORD — משתמש אמיתי במערכת, כדי שהכתיבה תעבור דרך ההרשאות.\n' +
    'ב-PowerShell:  $env:SIM_EMAIL="sarah@reshetch.org.il"; $env:SIM_PASSWORD="..."'
  );
  process.exit(2);
}

// ── ריצה ─────────────────────────────────────────────────────
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error('התחברות נכשלה:', authErr.message); process.exit(1); }

let q = sb.from('teacher_months')
  .select('id, name, reform, degree, seniority, scope_pct, scope_set_at, gamul_role, leave_type, children_under_18, official_gross, official_gross_pre, schools!inner(name)')
  .eq('month_key', MONTH);
if (SCHOOL && SCHOOL !== true) q = q.eq('schools.name', SCHOOL);
const { data: rows, error } = await q;
if (error) { console.error('טעינה נכשלה:', error.message); process.exit(1); }

const plans = rows.map(t => ({ t, plan: planFor(t) }));
const todo  = plans.filter(x => !x.plan.skip).slice(0, LIMIT || undefined);
const skips = plans.filter(x => x.plan.skip);

console.log(`מסד: ${DB_URL}  ${isProd ? '★ החי — המנהלות עובדות בו' : '(בדיקות)'}`);
console.log(`חודש ${MONTH}${SCHOOL && SCHOOL !== true ? ` · ${SCHOOL}` : ''} · ${rows.length} שורות · ${todo.length} לסימולציה${DRY ? ' · יבש, בלי כתיבה' : ''}\n`);
if (!todo.length) {
  for (const s of skips) console.log(`דילוג  ${s.t.name} — ${s.plan.skip}`);
  process.exit(0);
}

const b = await chromium.launch();
const p = await (await b.newContext({ locale: 'he-IL', viewport: { width: 1300, height: 1400 } })).newPage();
const done = [], failed = [];
try {
  await openForm(p);
  console.log(`חודש השכר בטופס: ${await setMonth(p, MONTH)}\n`);

  for (const { t, plan } of todo) {
    const gross = await runOne(p, plan, MONTH);
    if (!gross) { failed.push({ t, why: 'לא נקרא ברוטו מהטופס' }); console.log(`✗ ${t.name} — לא נקרא ברוטו`); continue; }
    let saved = 'יבש';
    if (!DRY) {
      const { error: upErr } = await sb.from('teacher_months')
        .update({ [plan.field]: gross }).eq('id', t.id);
      if (upErr) { failed.push({ t, why: upErr.message }); console.log(`✗ ${t.name} — ${upErr.message}`); continue; }
      saved = 'נשמר';
    }
    done.push({ t, plan, gross });
    console.log(`✓ ${t.name.padEnd(20)} ${t.reform === 'ofek' ? 'בסיס' : 'עולם ישן'} · דרגה ${plan.darga} · ותק ${plan.vetek} · ${plan.pct}%${plan.mom ? ' (כולל אם)' : ''}${plan.kita ? ' · מחנכת' : ''} → ${gross.toLocaleString('he-IL')} ₪ · ${saved}`);
  }
} finally { await b.close(); }

console.log('');
for (const s of skips) console.log(`דילוג  ${s.t.name} — ${s.plan.skip}`);
console.log(`\nהורצו ${done.length} · נכשלו ${failed.length} · דילוגים ${skips.length}`);
process.exit(failed.length ? 1 : 0);
