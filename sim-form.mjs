/*
  הטופס הרשמי של העולם הישן — התרגום והנהיגה, במקום אחד.

  גם המרַיץ (run-sim.mjs) וגם האימות (verify-sim.mjs) עובדים מולו, וחשוב
  ששניהם ישלחו בדיוק את אותם ערכים: אימות שמתרגם אחרת מהמרַיץ מאמת את
  עצמו ולא אותו.
*/

// ── תרגום מורה לשדות הטופס. מה שלא ודאי — לא נשלח ──────────────
const OLD_DARGA = { MA: '2', BA: '3', senior: '7', intern: '18' };
const OLD_UNLICENSED_A = '12';        // שלב א — כל הבלתי מוסמכות ברשת
const MOM_MIN_SCOPE = 79, MOM_BONUS = 10;

export const dargaFor = (t) =>
  t.degree === 'unlicensed' ? OLD_UNLICENSED_A : (OLD_DARGA[t.degree] || null);

// תוספת אם: עשר נקודות על אחוז המשרה, בעולם ישן בלבד, מ-79% ומעלה.
// למחשבון אין שדה עבורה — היא נכנסת דרך אחוז המשרה, בדיוק כפי שהכרטיס
// אומר לאסתר להקליד.
export const momBonus = (t) =>
  t.reform === 'pre' && (t.children_under_18 || 0) > 0 && (t.scope_pct ?? 100) >= MOM_MIN_SCOPE
    ? MOM_BONUS : 0;

// כיתת חינוך: א' משלמת 11.5% וכיתות ב'–ו' 10%. הנתון שיש לנו הוא הגמול,
// לא הכיתה עצמה, ולכן נבחרת נציגה של הטווח — ב' לכל ב'–ו'.
export const kitaFor = (t) => {
  if (t.reform !== 'pre') return null;
  const r = t.gamul_role || '';
  if (r === 'homeroom1') return '1';
  return /^homeroom/.test(r) ? '2' : null;
};

export const scopeConfirmed = (t) => Boolean(t.scope_set_at) || (t.scope_pct ?? 100) !== 100;

// לאיזה שדה נכנסת התוצאה: בעולם ישן זו הסימולציה היחידה; באופק זו
// סימולציית הבסיס, והפער עד האופק הוא תוספת בית חב"ד.
export const targetField = (t) => (t.reform === 'ofek' ? 'official_gross_pre' : 'official_gross');

/** מה נשלח לטופס עבור מורה — או סיבה בעברית למה לא. */
export function formFields(t) {
  const darga = dargaFor(t);
  if (!darga) return { skip: `אין במחשבון תואר "${t.degree}"` };
  const pct = (t.scope_pct ?? 100) + momBonus(t);
  if (!(pct > 0 && pct <= 200)) return { skip: `אחוז משרה לא תקין (${pct})` };
  return {
    darga,
    vetek: String(Math.max(1, Math.min(40, Number(t.seniority) || 1))),
    pct: String(pct),
    kita: kitaFor(t),
    field: targetField(t),
    mom: momBonus(t) > 0,
  };
}

/** התכנון המלא של המרַיץ — כולל מי מדולגת ולמה. */
export function planFor(t) {
  if (t.gamul_role === 'principal') return { skip: 'מנהלת — מחשבון ניהול, לא כאן' };
  if (t.leave_type === 'unpaid')    return { skip: 'חל"ת — אין שכר' };
  if (!scopeConfirmed(t))           return { skip: 'אחוז המשרה טרם נקבע' };
  if (t[targetField(t)] != null)    return { skip: 'כבר יש סימולציה' };
  return formFields(t);
}

// ── הטופס ────────────────────────────────────────────────────
const CALC = 'https://educalc.unq.co.il/#/Calculators/OldWorld';

export const openForm = async (p) => {
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
// שלו, MM/YYYY, ולא לפי שם. הזרקת ערך ב-JS אינה נקלטת: הבורר קורא את
// המצב הפנימי שלו וחוזר לחודש הקלנדרי, ובהרצה אחת הוא אפילו הפך
// ל-08/0006 והרעיל את התוצאה הראשונה. לכן הקלדה אמיתית.
export const setMonth = async (p, monthKey) => {
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
  const got = await box.evaluate(x => x.value);
  if (got !== want) throw new Error(`חודש השכר לא נקבע: הטופס מציג ${got} במקום ${want}`);
  return got;
};

export const runOne = async (p, plan, monthKey) => {
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
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /נקה נתונים/.test(x.innerText))?.click());
  await p.waitForTimeout(900);
  return gross;
};

/** בחירת קובץ הסביבה, בקול. הטעות שקרתה: הכלי דיבר בשקט עם מסד הבדיקות. */
export function pickEnv(fs, live) {
  const ENV_FILE = live ? '.env.local' : '.env.test';
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(`חסר ${ENV_FILE}.${live ? '' : ' להרצה מול המסד החי: --live'}`);
  }
  const env = Object.fromEntries(
    fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
  const PROD_REF = 'rvkjfjokdhkwiigorysr';
  const isProd = String(env.VITE_SUPABASE_URL).includes(PROD_REF);
  if (isProd && !live) throw new Error(`עצירה: ${ENV_FILE} מצביע על המסד החי. להרצה מכוונת: --live`);
  if (live && !isProd) throw new Error(`עצירה: ביקשת --live אבל ${ENV_FILE} אינו המסד החי.`);
  return { env, isProd, ENV_FILE };
}
