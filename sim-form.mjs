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
  // "מי שעדיין עם 0 שעות נחכה לעדכון המנהלות" (שרה, 1.9) — לא מריצים
  // ולא ממלאים שורה בלי שעות; היא עוד לא דווחה באמת.
  if (!Number(t.frontal_hours))     return { skip: '0 שעות — ממתינה לעדכון המנהלת' };
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

export const openForm = async (p, calc = 'old', { fresh = false } = {}) => {
  if (onCalc === calc && !fresh) return;
  if (onCalc === null) {
    await p.goto('https://educalc.unq.co.il/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(6000);
  } else if (fresh) {
    /*
      טעינה נקייה במקום "נקה נתונים". הכפתור מנקה את הצ׳יפים אבל משאיר
      את פאנל הגמול ב-DOM כשהמודל כבר מנותק: הבורר מציג ערך, הטופס
      מתעלם, והתוצאה חסרה 1,000 ₪ בלי שום שגיאה. ניווט מלא לא משאיר
      כלום — וזה מה שאימות של שכר צריך.
    */
    await p.evaluate(() => location.replace('https://educalc.unq.co.il/#/Home'));
    await p.waitForTimeout(1500);
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
const pickGmul = async (p, label, { expectOff = false } = {}) => {
  /*
    הלחיצה על פריט ברשימה נקלטת במודל רק ברוב הפעמים — נמדד 2.9.2026:
    שלוש ריצות זהות, באחת מהן הצ'יפ נשאר ריק והחישוב יצא בלי הגמול,
    1,000 ₪ פחות, בלי שום שגיאה. הצ'יפ שמופיע בבורר הוא העדות היחידה
    שהבחירה באמת נקלטה, ולכן הוא נבדק — ובלעדיו מנסים שוב.
  */
  for (let attempt = 1; attempt <= 3; attempt++) {
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
      const cs = [...document.querySelectorAll('.k-animation-container')];
      const c = cs.find(x => x.innerText.includes(want));
      return c ? [...c.querySelectorAll('li,[role=option]')]
        .find(x => x.innerText.replace(/\s+/g, ' ').trim() === want) || null : null;
    }, label);
    const el = h.asElement();
    if (!el) throw new Error(`לא נמצא הגמול "${label}" ברשימה`);
    await el.click();
    await p.waitForTimeout(1500);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(700);
    const chips = await p.evaluate(() =>
      (document.querySelector('.k-multiselect, kendo-multiselect')?.innerText || '').replace(/\s+/g, ' '));
    if (chips.includes(label) !== expectOff) return;
  }
  throw new Error(`הגמול "${label}" לא ${expectOff ? 'ירד מהבורר' : 'נקלט בבורר'} גם אחרי שלושה ניסיונות`);
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

/*
  טבלת התוצאות — הרכיבים שהמחשבון באמת חישב.

  זו ההגנה מפני התקלה שקרתה ב-1.9: גמול החינוך נקלט בטופס לסירוגין,
  ושתי ריצות זהות החזירו מספרים שונים ב-1,000 ₪ בלי שום שגיאה. מספר
  בלי הרכיבים שמאחוריו אינו תוצאה; כל ריצה קוראת עכשיו גם את הפירוט,
  ומי שביקשה גמול חינוך ולא קיבלה אותו ברכיבים — נזרקת, לא נרשמת.
*/
/*
  שורות התלוש כמבנה: [{code, label, amount, qty}] מטבלת התוצאות של
  המחשבון — לא פרשנות שלנו, השורות עצמן. משמש את מסך התלושים.
*/
export const readResultRows = async (p) => {
  const h = await p.evaluateHandle(() =>
    [...document.querySelectorAll('table')].find(t => t.innerText.includes('סך הכל ברוטו כללי')) || null);
  const el = h.asElement();
  if (!el) return [];
  return el.evaluate(t => [...t.querySelectorAll('tr')]
    .map(tr => [...tr.children].map(td => td.innerText.trim()))
    .filter(c => c.length >= 3 && c[1] && c[2] && !/תיאור/.test(c[1]))
    .map(c => ({ code: c[0] || '', label: c[1], amount: Number(String(c[2]).replace(/,/g, '')) || 0, qty: c[3] || '' }))
    .filter(r => !/סך הכל ברוטו/.test(r.label)));
};

const readResults = async (p) => {
  const h = await p.evaluateHandle(() =>
    [...document.querySelectorAll('table')].find(t => t.innerText.includes('סך הכל ברוטו כללי')) || null);
  const el = h.asElement();
  return el ? (await el.innerText()).replace(/\s+/g, ' ') : '';
};

/*
  שדה אחוז המשרה — הקלדה אמיתית, לא fill. נמדדה ריצה (יוסף ברוד,
  2.9.2026) שבה fill השאיר את המודל על 100: החישוב יצא 8,057 במקום
  6,446 — בדיוק פי 1.25. מקלידים כמשתמשת, קוראים חזרה, ואם לא נקלט —
  שוב.
*/
const typePct = async (p, selector, pct) => {
  for (let i = 0; i < 3; i++) {
    const el = p.locator(selector);
    await el.click({ clickCount: 3 });
    await p.keyboard.press('Control+A');
    await p.keyboard.type(String(pct), { delay: 40 });
    await p.keyboard.press('Tab');
    await p.waitForTimeout(400);
    if ((await el.inputValue()) === String(pct)) return;
  }
  throw new Error(`אחוז המשרה לא נקלט בשדה ${selector}`);
};

/*
  בחירה בבורר שהמודל באמת מקבל. selectOption מציב ערך ב-DOM, אבל נמדדו
  ריצות (2.9.2026) שבהן המודל של הטופס נשאר ריק — הערך מוצג, החישוב
  מתעלם. אחרי הבחירה בודקים שהרכיב הפך ng-dirty; אם לא — משגרים את
  האירועים בפירוש ובודקים שוב. כישלון נזרק, לא נבלע.
*/
const bindSelect = async (p, selector, value) => {
  const el = p.locator(selector);
  await el.scrollIntoViewIfNeeded();
  for (let i = 0; i < 3; i++) {
    await el.selectOption(value);
    await p.waitForTimeout(250);
    const st = await el.evaluate(e => ({ v: e.value, dirty: /ng-dirty/.test(e.className) }));
    if (st.v === value && st.dirty) return;
    await el.evaluate((e, v) => {
      e.value = v;
      e.dispatchEvent(new Event('input',  { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await p.waitForTimeout(350);
    const st2 = await el.evaluate(e => ({ v: e.value, dirty: /ng-dirty/.test(e.className) }));
    if (st2.v === value && st2.dirty) return;
  }
  throw new Error(`הבורר ${selector} לא קיבל את הערך "${value}" למודל`);
};

export const runOne = async (p, plan, monthKey, attempt = 1) => {
  await openForm(p, plan.calc || 'old', { fresh: true });
  // "נקה נתונים" מחזיר גם את החודש לברירת המחדל, ולכן הוא נקבע מחדש
  // לפני כל חישוב ולא פעם אחת בהתחלה.
  await setMonth(p, monthKey);
  if (plan.calc === 'ofek') {
    // דרגת ההשכלה קודם — בורר הדרגה נעול ומתמלא רק אחריה
    await bindSelect(p, 'select[name="DERUG_OFEK"]', plan.derug);
    await p.waitForTimeout(1200);
    await bindSelect(p, 'select[name="DARGA1"]', plan.darga);
    await bindSelect(p, 'select[name="VETEK"]', plan.vetek);
    await typePct(p, 'input[name="MEKADEM_MISRA_REFORMA"]', plan.pct);
    /*
      האמת היחידה על גמול נבחר היא הצ'יפ בבורר "בחר גמולים" — נמדד
      2.9.2026, שלוש ריצות זהות: צ'יפ מלא ⇒ הגמול נספר, צ'יפ ריק ⇒
      לא נספר, גם כשהפאנל והבורר מציגים ערך. הפאנל גם שורד ניווט
      מחדש, ולכן "הבורר גלוי" אינו אומר כלום. ההחלטה כאן לפי הצ'יפ,
      ורק לפיו.
    */
    const chipOn = async () => (await p.evaluate(() =>
      (document.querySelector('.k-multiselect, kendo-multiselect')?.innerText || ''))).includes('חינוך כיתה');
    const kitaSel = p.locator('select[name="KOD_TAFKID_2"]');
    if (plan.kita) {
      if (!(await chipOn())) await pickGmul(p, 'חינוך כיתה');
      await bindSelect(p, 'select[name="KOD_TAFKID_2"]', plan.kita);
      if (!(await chipOn())) throw new Error('הצ׳יפ של גמול החינוך נעלם אחרי הבחירה');
    } else if (await chipOn()) {
      // שריד: הגמול מסומן משורה קודמת. לחיצה חוזרת על הפריט מבטלת.
      await pickGmul(p, 'חינוך כיתה', { expectOff: true });
      if (await chipOn()) throw new Error('גמול חינוך משורה קודמת לא ירד מהבורר');
    }
    // קריאה חוזרת: הטופס מחזיק את מה שנשלח, לא את מה שקיווינו
    for (const [name, want] of [['DERUG_OFEK', plan.derug], ['DARGA1', plan.darga], ['VETEK', plan.vetek]]) {
      const got = await p.locator(`select[name="${name}"]`).inputValue();
      if (got !== want) throw new Error(`השדה ${name} מציג "${got}" במקום "${want}"`);
    }
    await p.waitForTimeout(400);
    await p.locator('.btnCalc').first().click();
    await p.waitForTimeout(5000);
    const res = await readResults(p);
    const g = res.match(/סך הכל ברוטו כללי ([\d,]+\.?\d*)/);
    const gross = g ? Math.round(Number(g[1].replace(/,/g, ''))) : null;
    const hasKita = /חינוך/.test(res);
    if (gross != null && Boolean(plan.kita) !== hasKita) {
      if (attempt < 3) return runOne(p, plan, monthKey, attempt + 1);
      throw new Error((plan.kita
        ? 'גמול חינוך נשלח אבל אינו ברכיבי התוצאה — פעמיים'
        : 'גמול חינוך מופיע ברכיבים בלי שנתבקש — פעמיים') + ' · הרכיבים: ' + res.slice(0, 220));
    }
    return gross;
  }
  await bindSelect(p, 'select[name="DARGA"]', plan.darga);
  await bindSelect(p, 'select[name="VETEK"]', plan.vetek);
  await typePct(p, 'input[name="MEKADEM_MISRA"]', plan.pct);
  // כיתת חינוך נקבעת רק כשיש — בחירת ריק אינה מלכלכת את המודל, ובדף
  // נקי (טעינה מלאה לכל שורה) אין שריד לנקות
  if (plan.kita) await bindSelect(p, 'select[name="KITAT_CHINUCH"]', plan.kita);
  await p.waitForTimeout(400);
  await p.locator('.btnCalc').first().click();
  await p.waitForTimeout(4500);
  const res = await readResults(p);
  const g = res.match(/סך הכל ברוטו כללי ([\d,]+\.?\d*)/);
  const gross = g ? Math.round(Number(g[1].replace(/,/g, ''))) : null;
  /*
    בעולם הישן אין לְמה להשוות רכיבים: גמול החינוך מובלע בשורות
    המשולבות (נמדד: יוכבד דובקין 7,666.1 — תואמת בדיוק, ואין 'חינוך'
    ברכיבים). ההגנה שם היא bindSelect — הבורר פשוט וישיר, והמודל
    מאומת. בדיקת הרכיבים חיה רק באופק, שבו הגמול הוא שורה נפרדת
    ושם גם גרה התקלה.
  */
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
