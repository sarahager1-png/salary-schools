// מול עלות ההוראה נספרות הכנסות משרד החינוך בלבד (שרה, 23.9):
// "הכנסות כוללות תשלומי הורים? — תוריד", ועל רווח הצהרון וחוק נהרי —
// "זה הכנסות לחשבונות אחרים". הבדיקה מוודאת ששום שורת הכנסה נוספת
// אינה נספרת — לא של הורים ולא של חשבונות אחרים — ושכולן עדיין
// מוצגות ומסומנות "לא נספר", כי מחיקה שקטה של מספר גרועה מהצגתו.
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean).filter(l => !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PW = 'Pay!' + Math.random().toString(36).slice(2, 9);
const EMAIL = 'parentpay-coord@example.com';
const MONTH = '2096-09';
const SCHOOL = 'סניף הורים בדיקה';

const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };
const numOf = s => Number(String(s).replace(/[^\d-]/g, '')) || 0;

// חמש שורות תשלומי הורים שקיימות בייצור ב-23.9, ועוד שתי
// הכנסות שאינן מההורים — אף אחת מהן אינה נספרת
const PARENT = [
  ['שכר לימוד ותל"ן (גבייה 80%)', 10000],
  ['שכר לימוד', 20000],
  ['שכר לימוד ותל"ן (תשלומי הורים)', 30000],
  ['תל"ן — תשלומי הורים', 40000],
  ['תשלומי הורים הסעות', 50000],
];
const KEPT = [
  ['רווח על צהרון', 7000],
  ['חוק נהרי', 3000],
];
const PARENT_SUM = PARENT.reduce((a, x) => a + x[1], 0);   // 150,000
const KEPT_SUM   = KEPT.reduce((a, x) => a + x[1], 0);     //  10,000

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers();
  const u = data?.users?.find(x => x.email === EMAIL);
  if (u) { await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id); }
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  const { data: sc } = await admin.from('schools').select('id').eq('name', SCHOOL).maybeSingle();
  if (sc) { await admin.from('school_finance').delete().eq('school_id', sc.id); await admin.from('schools').delete().eq('id', sc.id); }
}

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1450, height: 950 }, locale: 'he-IL' })).newPage();
try {
  await cleanup();
  const { data: sc } = await admin.from('schools')
    .insert({ name: SCHOOL, city: 'עיר', reform: 'ofek', hours_quota: 100 }).select().single();
  await admin.from('months').insert({ key: MONTH });
  const { data: usr } = await admin.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true });
  await admin.from('profiles').insert({ id: usr.user.id, full_name: 'בדיקת הורים', role: 'coordinator' });
  const ins = await admin.from('teacher_months').insert([
    { month_key: MONTH, school_id: sc.id, name: 'מורה א', reform: 'ofek', frontal_hours: 26, scope_pct: 100, official_gross: 12000, monthly_extras: 0 },
  ]);
  if (ins.error) throw new Error('seed: ' + ins.error.message);
  const fin = await admin.from('school_finance').upsert({
    school_id: sc.id,
    ministry_budget: 300000,
    income_total: PARENT_SUM + KEPT_SUM,
    detail: { income: [...PARENT, ...KEPT].map(([name, amount]) => ({ name, amount })) },
  });
  if (fin.error) throw new Error('finance: ' + fin.error.message);
  const back = await admin.from('school_finance').select('*').eq('school_id', sc.id).maybeSingle();

  await p.goto('http://localhost:5190/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.getByPlaceholder('name@reshetch.org.il').fill(EMAIL);
  await p.locator('input[type="password"]').fill(PW);
  await p.getByRole('button', { name: /כניסה למערכת/ }).click();
  await p.waitForTimeout(3000);
  await p.selectOption('select[title="בחירת חודש"]', MONTH).catch(() => {});
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: /עלות הוראה/ }).click();
  await p.waitForTimeout(2500);

  const t = await p.evaluate((name) => {
    const table = document.querySelector('.fin-table');
    const cells = r => [...r.querySelectorAll('td')].map(c => c.innerText.trim());
    const row = [...table.querySelectorAll('tbody tr')].find(r => r.innerText.includes(name));
    return {
      // ל-thead שתי שורות: קיבוץ (הכנסות/הוצאות/תוצאה) ומעליה הכותרות
      // עצמן. רק השורה האחרונה מיישרת לתאי הנתונים.
      heads: [...[...table.querySelectorAll('thead tr')].pop().querySelectorAll('th')].map(x => x.innerText.trim()),
      row: row ? cells(row) : null,
      foot: table.querySelector('tfoot tr') ? cells(table.querySelector('tfoot tr')) : null,
    };
  }, SCHOOL);


  // סדר העמודות: סניף | משרד | הכנסות נוספות | סה"כ הכנסות | ...
  const iOther = t.heads.findIndex(h => h.includes('הכנסות נוספות'));
  const iTotal = t.heads.findIndex(h => h.includes('סה"כ הכנסות') || h.includes('סה״כ הכנסות'));
  check('עמודות ההכנסה נמצאו', iOther > 0 && iTotal > 0, t.heads.join(' | '));

  const otherCell = t.row[iOther];
  check('כל ההכנסות הנוספות מוצגות בעמודה',
    numOf(otherCell) === PARENT_SUM + KEPT_SUM,
    `${otherCell.replace(/\r?\n/g, ' · ')} מול ${PARENT_SUM + KEPT_SUM}`);
  check('הן מסומנות "לא נספר"', /לא נספר/.test(otherCell), otherCell.replace(/\r?\n/g, ' · '));
  check('סה"כ הכנסות = משרד החינוך בלבד',
    numOf(t.row[iTotal]) === 300000, `${t.row[iTotal]} מול 300000`);
  // הפער נגזר מההכנסות, ולכן חייב לציית לכלל ולא לסכום שנמשך ממבט-רשת
  const iGap = t.heads.findIndex(h => h.includes('פער הכנסות מול הוצאות'));
  const iExp = t.heads.findIndex(h => /^סה["״]כ הוצאות/.test(h));
  check('פער הכנסות מול הוצאות = משרד החינוך פחות ההוצאות',
    Math.abs(numOf(t.row[iGap]) - (300000 - numOf(t.row[iExp]))) <= 2,
    `${t.row[iGap]} מול ${300000 - numOf(t.row[iExp])}`);

  // כל שורות ההכנסה — של הורים ושל חשבונות אחרים — מוצגות ואינן נספרות
  // הכרטיס נפתח בלחיצה עליו עצמו (onClick על ה-apple-card)
  await p.evaluate((name) => {
    const h = [...document.querySelectorAll('h2')].find(x => x.innerText.includes('כרטיסי בתי הספר'));
    let el = h;
    while ((el = el.nextElementSibling)) {
      if (el.classList?.contains('apple-card') && el.innerText?.includes(name)) { el.click(); break; }
    }
  }, SCHOOL);
  await p.waitForTimeout(1500);
  const card = await p.evaluate((name) => {
    const heads = [...document.querySelectorAll('h2')];
    const h = heads.find(x => x.innerText.includes('כרטיסי בתי הספר'));
    let el = h, box = null;
    while ((el = el.nextElementSibling)) {
      if (el.innerText?.includes(name) && /תקציב נוסף · (שנתי|חודשי)/.test(el.innerText)) { box = el; break; }
    }
    return box ? box.innerText : null;
  }, SCHOOL);
  check('הכרטיס נפתח עם הפירוט', !!card, card ? '' : 'לא נמצא');
  if (card) {
    check('כותרת "הכנסות שאינן נספרות מול עלות ההוראה"',
      card.includes('הכנסות שאינן נספרות מול עלות ההוראה'));
    // בכרטיס שתי שורות "סה״כ הכנסות" — של עלות ההוראה ושל התקציב הנוסף.
    // כאן נבדקת זו של התקציב הנוסף, שחייבת להיות אפס.
    const opPart = card.slice(card.search(/תקציב נוסף · (שנתי|חודשי)/)).replace(/\s+/g, ' ');
    check('סה"כ ההכנסות בתקציב הנוסף = 0',
      /סה"כ הכנסות 0 ₪/.test(opPart),
      (opPart.match(/סה"כ הכנסות.{0,12}/) || [''])[0]);
    // שתי הקבוצות יחד — של ההורים ושל החשבונות האחרים
    for (const [name] of [...PARENT, ...KEPT])
      check(`"${name}" מוצג ואינו נספר`,
        new RegExp('הכנסות שאינן נספרות[\\s\\S]*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(card));
  }

  await p.screenshot({ path: '_income_desktop.png' });
} catch (e) {
  check('ריצה ללא שגיאה', false, e.message);
} finally {
  await cleanup();
  await b.close();
}
console.log(fails.length ? `\n${fails.length} כשלים: ${fails.join(', ')}` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
