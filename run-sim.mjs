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

    node run-sim.mjs --month 2026-09 [--school "שם"] [--limit N] [--dry]

  נדרשים SIM_EMAIL ו-SIM_PASSWORD של משתמש אמיתי במערכת: הכתיבה עוברת
  דרך אותן הרשאות שבאפליקציה, ולא עוקפת אותן.
*/
import fs from 'node:fs';
import { ENV_FILE, URL as DB_URL } from './test-env.mjs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

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

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean).filter(l => !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const EMAIL = process.env.SIM_EMAIL, PASSWORD = process.env.SIM_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('חסרים SIM_EMAIL ו-SIM_PASSWORD — משתמש אמיתי במערכת, כדי שהכתיבה תעבור דרך ההרשאות.');
  process.exit(2);
}

// ── תרגום מורה לשדות הטופס. מה שלא ודאי — לא נשלח ──────────────
const OLD_DARGA = { MA: '2', BA: '3', senior: '7', intern: '18' };
const OLD_UNLICENSED_A = '12';        // שלב א — כל הבלתי מוסמכות ברשת
const PRE_FULL_HOURS = 30;
const MOM_MIN_SCOPE = 79, MOM_BONUS = 10;

const dargaFor = (t) =>
  t.degree === 'unlicensed' ? OLD_UNLICENSED_A : (OLD_DARGA[t.degree] || null);

// תוספת אם: עשר נקודות על אחוז המשרה, בעולם ישן בלבד, מ-79% ומעלה.
// למחשבון אין שדה עבורה — היא נכנסת דרך אחוז המשרה, בדיוק כפי שהכרטיס
// אומר לאסתר להקליד.
const momBonus = (t) =>
  t.reform === 'pre' && (t.children_under_18 || 0) > 0 && (t.scope_pct ?? 100) >= MOM_MIN_SCOPE
    ? MOM_BONUS : 0;

// כיתת חינוך: א' משלמת 11.5% וכיתות ב'–ו' 10%. הנתון שיש לנו הוא הגמול,
// לא הכיתה עצמה, ולכן נבחרת נציגה של הטווח — ב' לכל ב'–ו'.
const kitaFor = (t) => {
  if (t.reform !== 'pre') return null;
  const r = t.gamul_role || '';
  if (r === 'homeroom1') return '1';
  return /^homeroom/.test(r) ? '2' : null;
};

const scopeConfirmed = (t) => Boolean(t.scope_set_at) || (t.scope_pct ?? 100) !== 100;

// לאיזה שדה נכנסת התוצאה: בעולם ישן זו הסימולציה היחידה; באופק זו
// סימולציית הבסיס, והפער עד האופק הוא תוספת בית חב"ד.
const targetField = (t) => (t.reform === 'ofek' ? 'official_gross_pre' : 'official_gross');

function planFor(t) {
  if (t.gamul_role === 'principal')       return { skip: 'מנהלת — מחשבון ניהול, לא כאן' };
  if (t.leave_type === 'unpaid')          return { skip: 'חל"ת — אין שכר' };
  if (!scopeConfirmed(t))                 return { skip: 'אחוז המשרה טרם נקבע' };
  if (t[targetField(t)] != null)          return { skip: 'כבר יש סימולציה' };
  const darga = dargaFor(t);
  if (!darga)                             return { skip: `אין במחשבון תואר "${t.degree}"` };
  const pct = (t.scope_pct ?? 100) + momBonus(t);
  if (!(pct > 0 && pct <= 200))           return { skip: `אחוז משרה לא תקין (${pct})` };
  return {
    darga,
    vetek: String(Math.max(1, Math.min(40, Number(t.seniority) || 1))),
    pct: String(pct),
    kita: kitaFor(t),
    field: targetField(t),
    mom: momBonus(t) > 0,
  };
}

// ── הטופס ────────────────────────────────────────────────────
const CALC = 'https://educalc.unq.co.il/#/Calculators/OldWorld';
const openForm = async (p) => {
  await p.goto('https://educalc.unq.co.il/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6000);
  await p.evaluate(u => location.replace(u), CALC);
  await p.waitForTimeout(5000);
  // תוסף הנגישות מיירט לחיצות; האקורדיונים מסתירים את כיתת החינוך
  await p.addStyleTag({ content: `#vplugin{display:none!important}
    .panel-collapse{display:block!important;height:auto!important}
    .unqAccordionContainer, .unqAccordionContainer > div, .panel-body{display:block!important;height:auto!important}` });
  await p.waitForTimeout(800);
};

// שדה החודש הוא בורר Kendo עם מזהה אקראי בכל טעינה — מאותר לפי הערך
// שלו, MM/YYYY, ולא לפי שם.
// הזרקת ערך ב-JS אינה נקלטת — הבורר קורא את המצב הפנימי שלו וחוזר
// לחודש הקלנדרי, ובהרצה אחת הוא אפילו הפך ל-08/0006 והרעיל את התוצאה
// הראשונה. לכן הקלדה אמיתית: בחירת הטקסט, הקלדה, ו-Enter שסוגר.
const setMonth = async (p, monthKey) => {
  const [y, m] = monthKey.split('-');
  const want = `${m}/${y}`;
  const handle = await p.evaluateHandle(() =>
    [...document.querySelectorAll('input')].find(x => /^\d{2}\/\d{4}$/.test(x.value)) || null);
  const box = handle.asElement();
  if (!box) throw new Error('לא נמצא שדה חודש השכר בטופס');
  await box.click({ clickCount: 3 });
  await p.keyboard.press('Control+A');
  await p.keyboard.type(want, { delay: 60 });
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  // ה-widget עשוי לנרמל את מה שהוקלד — נקרא בחזרה מה שנקבע בפועל
  const got = await box.evaluate(x => x.value);
  if (got !== want) throw new Error(`חודש השכר לא נקבע: הטופס מציג ${got} במקום ${want}`);
  return got;
};

const runOne = async (p, plan, monthKey) => {
  // "נקה נתונים" מחזיר גם את החודש לברירת המחדל, ולכן הוא נקבע מחדש
  // לפני כל חישוב ולא פעם אחת בהתחלה.
  await setMonth(p, monthKey);
  await p.selectOption('select[name="DARGA"]', plan.darga);
  await p.selectOption('select[name="VETEK"]', plan.vetek);
  await p.fill('input[name="MEKADEM_MISRA"]', plan.pct);
  if (plan.kita) {
    const sel = p.locator('select[name="KITAT_CHINUCH"]');
    await sel.scrollIntoViewIfNeeded();
    await sel.selectOption(plan.kita);
  }
  await p.waitForTimeout(400);
  await p.locator('.btnCalc').first().click();
  await p.waitForTimeout(4500);
  const body = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  const g = body.match(/סך הכל ברוטו כללי ([\d,]+\.?\d*)/);
  const gross = g ? Math.round(Number(g[1].replace(/,/g, ''))) : null;
  // "נקה נתונים" מחזיר את הטופס למצב ההתחלתי — כולל בורר הכיתה
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /נקה נתונים/.test(x.innerText))?.click());
  await p.waitForTimeout(900);
  return gross;
};

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

console.log(`מסד: ${DB_URL}`);
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
