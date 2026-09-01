/*
  הטופס הרשמי של העולם הישן — התרגום והנהיגה, במקום אחד.

  גם המרַיץ (run-sim.mjs) וגם האימות (verify-sim.mjs) עובדים מולו, וחשוב
  ששניהם ישלחו בדיוק את אותם ערכים: אימות שמתרגם אחרת מהמרַיץ מאמת את
  עצמו ולא אותו.
*/

// ── תרגום מורה לשדות הטופס. מה שלא ודאי — לא נשלח ──────────────
const OLD_DARGA = { MA: '2', BA: '3', senior: '7', intern: '18' };
const OLD_UNLICENSED_A = '12';        // שלב א — כל הבלתי מוסמכות ברשת

export const dargaFor = (t) =>
  t.degree === 'unlicensed' ? OLD_UNLICENSED_A : (OLD_DARGA[t.degree] || null);

/*
  תוספת אם אינה נוספת כאן. למחשבון אין שדה עבורה והיא נכנסת דרך אחוז
  המשרה — אבל האחוז שרשום במערכת כבר כולל אותה (אומת מול הנתונים,
  1.9.2026: יוכבד דובקין מלמדת 24 שעות שהן 80%, ורשום לה 91). הוספה
  כאן הייתה מקלידה 101 למחשבון ומקבלת 8,508 במקום 7,666.
*/

/*
  כיתת חינוך: א' משלמת 11.5% וכיתות ב'–ו' 10%. הנתון שיש לנו הוא הגמול
  ולא הכיתה עצמה, ולכן נבחרת נציגה של הטווח — ב' לכל ב'–ו'.

  גם למורת אופק. הסימולציה הזאת היא עולם ישן לכל דבר (הוראת שרה, 1.9),
  והפער בינה לבין שכר האופק הוא תוספת בית חב"ד — כלומר כל שקל שחסר כאן
  מנפח את התוספת שהרשת משלמת.
*/
export const kitaFor = (t) => {
  const r = t.gamul_role || '';
  if (r === 'homeroom1') return '1';
  return /^homeroom/.test(r) ? '2' : null;
};

/*
  מחשבון אופק חדש.

  הוא נפרד מהעולם הישן ולא היה ממופה, ולכן כל מורת אופק דולגה. המכשול
  לא היה בשדות אלא במבנה: המקטע "גמולים" מקופל, ובתוכו אין שדות אלא
  בורר אחד — "בחר גמולים". השדה KOD_TAFKID_2 אינו קיים כלל עד שבוחרים
  בו "חינוך כיתה". פתיחת האקורדיון ב-CSS לא עוזרת, ולכן ההרצות הקודמות
  נראו כאילו הכיתה "לא נקלטת": היא באמת לא נשלחה. חן דאבוש בלי הגמול
  8,593 ועם הגמול 9,607 — מול 9,606 הרשומים לה.

  דרגה: הרשימה בטופס היא חצאי דרגות, ולכן דרגה g יושבת בערך g*2-1.
  הבורר נעול עד שנבחרת דרגת השכלה, ולכן הסדר קובע.
*/
const OFEK_DERUG = { intern: '100', BA: '101', MA: '102', senior: '104', unlicensed: '106' };
export const ofekDargaFor = (t) => {
  const g = t.grade === 'intern' ? 1 : Number(t.grade);
  return Number.isFinite(g) && g >= 1 && g <= 9 ? String(g * 2 - 1) : null;
};

/*
  האחוז שנכנס למחשבון — זה שרשום בשורה.

  היו כאן שני אחוזים, כי סימולציית הבסיס של מורת אופק רצה בעולם הישן.
  המודל הזה ירד ב-1.9 יחד עם הסימולטור: יש ברוטו אחד שחשבת השכר מזינה,
  ואחוז משרה אחד ששרה קובעת.
*/
export const preScope = (t) => t.scope_pct;

export const scopeConfirmed = (t) =>
  Boolean(t.scope_set_at) || (t.scope_pct ?? 100) !== 100;

// הברוטו — עמודה אחת לכולן מאז שהסימולטור ירד.
export const targetField = () => 'official_gross';

/** מה נשלח לטופס עבור מורה — או סיבה בעברית למה לא. */
export function formFields(t) {
  const pctOk = (v) => v != null && v > 0 && v <= 200;
  if (t.reform === 'ofek') {
    const derug = OFEK_DERUG[t.degree];
    if (!derug) return { skip: `אין באופק תואר "${t.degree}"` };
    const darga = ofekDargaFor(t);
    if (!darga) return { skip: 'דרגת האופק טרם נקבעה' };
    const p2 = preScope(t);
    if (!pctOk(p2)) return { skip: p2 == null ? 'אחוז המשרה טרם נקבע' : `אחוז משרה לא תקין (${p2})` };
    return {
      calc: 'ofek', derug, darga,
      vetek: String(Math.max(1, Math.min(40, Number(t.seniority) || 1))),
      pct: String(p2),
      kita: kitaFor(t),
      field: targetField(),
    };
  }
  const darga = dargaFor(t);
  if (!darga) return { skip: `אין במחשבון תואר "${t.degree}"` };
  const pct = preScope(t);
  if (pct == null) return { skip: 'אחוז המשרה טרם נקבע' };
  if (!(pct > 0 && pct <= 200)) return { skip: `אחוז משרה לא תקין (${pct})` };
  return {
    calc: 'old',
    darga,
    vetek: String(Math.max(1, Math.min(40, Number(t.seniority) || 1))),
    pct: String(pct),
    kita: kitaFor(t),
    field: targetField(),
  };
}

/** התכנון המלא של המרַיץ — כולל מי מדולגת ולמה. */
export function planFor(t) {
  if (t.gamul_role === 'principal') return { skip: 'מנהלת — מחשבון ניהול, לא כאן' };
  if (t.leave_type === 'unpaid')    return { skip: 'חל"ת — אין שכר' };
  if (!scopeConfirmed(t))           return { skip: 'אחוז המשרה טרם נקבע' };
  if (t[targetField(t)] != null)    return { skip: 'כבר יש ברוטו' };
  return formFields(t);
}

// ── הטופס ────────────────────────────────────────────────────
const CALC = {
  old:  'https://educalc.unq.co.il/#/Calculators/OldWorld',
  ofek: 'https://educalc.unq.co.il/#/Calculators/OfekHadash',
};
let onCalc = null;

export const openForm = async (p, calc = 'old') => {
  if (onCalc === calc) return;
  if (onCalc === null) {
    await p.goto('https://educalc.unq.co.il/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(6000);
  }
  await p.evaluate(u => location.replace(u), CALC[calc]);
  await p.waitForTimeout(5000);
  /*
    תוסף הנגישות מיירט לחיצות. ה-CSS פותח את האקורדיונים של העולם הישן,
    שבו השדות קיימים ורק מוסתרים. באופק זה אינו מספיק — שם השדה נוצר רק
    אחרי בחירה בבורר הגמולים — ולכן שם פותחים בלחיצה אמיתית.
  */
  await p.addStyleTag({ content: `#vplugin{display:none!important}
    .panel-collapse{display:block!important;height:auto!important}
    .unqAccordionContainer, .unqAccordionContainer > div, .panel-body{display:block!important;height:auto!important}` });
  await p.waitForTimeout(800);
  onCalc = calc;
};

/*
  בחירת גמול במחשבון האופק. הכותרת "גמולים" אינה הפקד הלחיץ — הוא
  span.collapse-oral שבתוכה, ומצבו נקרא ב-aria-expanded. הרשימה עצמה
  נפתחת ב-.k-animation-container מחוץ לטופס.
*/
const pickGmul = async (p, label) => {
  const head = p.locator('.panel-heading', { hasText: 'גמולים' }).first().locator('span.collapse-oral').first();
  if ((await head.getAttribute('aria-expanded')) !== 'true') {
    await head.scrollIntoViewIfNeeded();
    await head.click();
    await p.waitForTimeout(1200);
  }
  // ה-k-input הראשון הוא שדה החודש; השני הוא בורר הגמולים
  const picker = p.locator('input.k-input').nth(1);
  await picker.scrollIntoViewIfNeeded();
  await picker.click();
  await p.waitForTimeout(1200);
  const h = await p.evaluateHandle((want) => {
    const c = document.querySelector('.k-animation-container');
    return c ? [...c.querySelectorAll('li,[role=option]')]
      .find(x => x.innerText.replace(/\s+/g, ' ').trim() === want) || null : null;
  }, label);
  const el = h.asElement();
  if (!el) throw new Error(`לא נמצא הגמול "${label}" ברשימה`);
  await el.click();
  await p.waitForTimeout(1500);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(700);
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
  await openForm(p, plan.calc || 'old');
  // "נקה נתונים" מחזיר גם את החודש לברירת המחדל, ולכן הוא נקבע מחדש
  // לפני כל חישוב ולא פעם אחת בהתחלה.
  await setMonth(p, monthKey);
  if (plan.calc === 'ofek') {
    // דרגת ההשכלה קודם — בורר הדרגה נעול ומתמלא רק אחריה
    await p.selectOption('select[name="DERUG_OFEK"]', plan.derug);
    await p.waitForTimeout(1200);
    await p.selectOption('select[name="DARGA1"]', plan.darga);
    await p.selectOption('select[name="VETEK"]', plan.vetek);
    await p.fill('input[name="MEKADEM_MISRA_REFORMA"]', plan.pct);
    if (plan.kita) {
      await pickGmul(p, 'חינוך כיתה');
      const sel = p.locator('select[name="KOD_TAFKID_2"]');
      await sel.scrollIntoViewIfNeeded();
      await sel.selectOption(plan.kita);
      const got = await sel.inputValue();
      if (got !== plan.kita) throw new Error(`כיתת החינוך לא נקלטה: הטופס מציג "${got}"`);
    }
    await p.waitForTimeout(400);
    await p.locator('.btnCalc').first().click();
    await p.waitForTimeout(5000);
    const body = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
    const g = body.match(/סך הכל ברוטו כללי ([\d,]+\.?\d*)/);
    const gross = g ? Math.round(Number(g[1].replace(/,/g, ''))) : null;
    await p.evaluate(() => [...document.querySelectorAll('input,button')]
      .find(x => /נקה נתונים/.test(x.value || x.innerText))?.click());
    await p.waitForTimeout(1500);
    return gross;
  }
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
