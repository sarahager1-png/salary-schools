// טבלת "העברות לסניפים" (שרה, 23.9): עלות ההוראה לשנה +20%, מענק רשת,
// פער להעברה לשנה ולחודש — לכל סניף שהרשת משלמת בו שכר.
// הבדיקה זורעת שני בתי ספר (אחד לתשלום שכר, אחד לא), מוודאת שהמספרים
// בטבלה הם החישוב הנכון, שהסניף שלא משלמים בו אינו מופיע, ושה-PDF
// המעוצב נבנה עם הלוגו ועם כל השורות.
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean).filter(l => !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PW = 'Trans!' + Math.random().toString(36).slice(2, 9);
const EMAIL = 'transfers-coord@example.com';
const MONTH = '2096-05';
const S_PAY = 'סניף משלם בדיקה';
const S_NOPAY = 'סניף לא משלם בדיקה';
// סניף עם עובדות אך בלי תקציב משרד החינוך — מופיע בטבלה, מחוץ לסיכום
const S_NOBUD = 'סניף בלי תקציב בדיקה';

const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };
const numOf = s => Number(String(s).replace(/[^\d-]/g, '')) || 0;

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers();
  const u = data?.users?.find(x => x.email === EMAIL);
  if (u) { await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id); }
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  for (const n of [S_PAY, S_NOPAY, S_NOBUD]) {
    const { data: sc } = await admin.from('schools').select('id').eq('name', n).maybeSingle();
    if (sc) { await admin.from('school_finance').delete().eq('school_id', sc.id); await admin.from('schools').delete().eq('id', sc.id); }
  }
}

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1450, height: 950 }, locale: 'he-IL', acceptDownloads: true })).newPage();
try {
  await cleanup();
  const { data: scPay } = await admin.from('schools')
    .insert({ name: S_PAY, city: 'עיר', reform: 'ofek', hours_quota: 100 }).select().single();
  /*
     סניף שאינו אמור להיכלל. במסד הבדיקות אין עדיין עמודת pays_salary
     (המיגרציה 20260922140000 לא הורצה בו), ולכן הסניף הזה נזרע בלי
     עובדות — עלות הוראה 0, אותו צד של אותו סינון. הסינון על
     paysSalary === false הוא אותו דפוס בדיוק כמו בטבלה שמעליה.
  */
  const { data: scNo } = await admin.from('schools')
    .insert({ name: S_NOPAY, city: 'עיר', reform: 'ofek', hours_quota: 100 }).select().single();
  const { data: scNb } = await admin.from('schools')
    .insert({ name: S_NOBUD, city: 'עיר', reform: 'ofek', hours_quota: 100 }).select().single();
  await admin.from('months').insert({ key: MONTH });
  const { data: usr } = await admin.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true });
  await admin.from('profiles').insert({ id: usr.user.id, full_name: 'בדיקת העברות', role: 'coordinator' });
  const ins = await admin.from('teacher_months').insert([
    { month_key: MONTH, school_id: scPay.id, name: 'מורה א', reform: 'ofek', frontal_hours: 26, scope_pct: 100, official_gross: 12000, monthly_extras: 0 },
    { month_key: MONTH, school_id: scPay.id, name: 'מורה ב', reform: 'pre',  frontal_hours: 24, scope_pct: 100, official_gross: 8500,  monthly_extras: 0 },
    { month_key: MONTH, school_id: scNb.id,  name: 'מורה ג', reform: 'pre',  frontal_hours: 20, scope_pct: 80,  official_gross: 7000,  monthly_extras: 0 },
  ]);
  if (ins.error) throw new Error('seed: ' + ins.error.message);

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
  await p.waitForTimeout(2000);

  // תקציב משרד החינוך ומענק רשת לסניף המשלם — דרך שדות הטבלה שלמעלה
  const row = p.locator('.fin-table tbody tr').filter({ hasText: S_PAY }).first();
  await row.locator('input[type="number"]').nth(0).fill('200000');
  await row.locator('input[type="number"]').nth(0).blur();
  await p.waitForTimeout(700);
  await row.locator('input[type="number"]').nth(1).fill('50000');
  await row.locator('input[type="number"]').nth(1).blur();
  await p.waitForTimeout(1200);

  // ── הטבלה החדשה ──
  const t = await p.evaluate((names) => {
    const heads = [...document.querySelectorAll('h2')];
    const h = heads.find(x => x.innerText.includes('העברות לסניפים'));
    if (!h) return { err: 'אין כותרת "העברות לסניפים"' };
    // הטבלה הראשונה שאחרי הכותרת
    let el = h, table = null;
    while ((el = el.nextElementSibling)) { table = el.querySelector?.('table'); if (table) break; }
    if (!table) return { err: 'אין טבלה מתחת לכותרת' };
    const txt = r => [...r.querySelectorAll('td')].map(c => c.innerText.trim());
    const rows = [...table.querySelectorAll('tbody tr')].map(txt);
    return {
      heads: [...table.querySelectorAll('thead th')].map(x => x.innerText.trim()),
      rows, foot: txt(table.querySelector('tfoot tr') || document.createElement('tr')),
      hasNoPay: rows.some(r => r[0] === names.noPay),
      noBudRow: rows.find(r => r[0].startsWith(names.noBud)) || null,
      scrollW: table.parentElement.scrollWidth, clientW: table.parentElement.clientWidth,
    };
  }, { noPay: S_NOPAY, noBud: S_NOBUD });
  if (t.err) throw new Error(t.err);

  check('הטבלה קיימת עם 8 עמודות', t.heads.length === 8, t.heads.join(' | '));
  check('סניף בלי עלות הוראה אינו מופיע', !t.hasNoPay);
  // הסינון על "לא לתשלום שכר" אינו ניתן לבדיקה במסד הבדיקות — נבדק בקוד
  check('הסינון כולל גם "לא לתשלום שכר"',
    fs.readFileSync('src/App.jsx', 'utf8')
      .includes("rows.filter(r => r.sc.paysSalary !== false && r.annual > 0)"));
  const r = t.rows.find(x => x[0] === S_PAY);
  check('הסניף המשלם מופיע בטבלה', !!r, r ? r.join(' | ') : 'לא נמצא');
  if (r) {
    const [, annual, add20, withAdd, ministry, support, yearly, monthly] = r.map(numOf);
    check('תוספת 20% = 20% מעלות ההוראה', Math.abs(add20 - annual * 0.2) <= 1, `${add20} מול ${Math.round(annual * 0.2)}`);
    check('סה"כ עלות = עלות + תוספת', Math.abs(withAdd - (annual + add20)) <= 1, `${withAdd} מול ${annual + add20}`);
    check('הכנסות משרד החינוך נקראו', ministry === 200000, String(ministry));
    check('מענק רשת נקרא', support === 50000, String(support));
    const expect = withAdd - ministry - support;
    check('פער להעברה = עלות עם תוספת פחות משרד ומענק', Math.abs(yearly - Math.abs(expect)) <= 2, `${yearly} מול ${Math.abs(expect)}`);
    check('פער לחודש = הפער חלקי 12', expect <= 0 || Math.abs(monthly - expect / 12) <= 2, `${monthly} מול ${Math.round(expect / 12)}`);
    console.log('      ' + t.heads.map((h, i) => `${h}=${r[i]}`).join(' | '));
  }
  check('שורת סיכום קיימת', /^סה["״]כ/.test(t.foot[0] || ''), t.foot.join(' | '));
  check('הטבלה נכנסת ברוחב המסך בלי גלילה', t.scrollW <= t.clientW + 2, `${t.scrollW} מול ${t.clientW}`);
  // שורת הסיכום חייבת להסתדר בחיסור, אחרת המספר בקובץ נראה שגוי
  const fo = t.foot.map(numOf);
  const balances = Math.abs((fo[3] - fo[4] - fo[5]) - fo[6]) <= 2;
  check('הסיכום מסתדר: סה"כ עלות − משרד − מענק = הפער', balances,
    balances ? '' : `${fo[3]} − ${fo[4]} − ${fo[5]} ≠ ${fo[6]}`);

  /*
    סניף עם עובדות אך בלי תקציב משרד החינוך: אין לו פער לחשב, ולכן הוא
    מופיע בטבלה עם "—" ועם תגית, אך אינו נספר בשורת הסיכום — אחרת
    העלות שלו נכנסת לסה"כ בלי שהפער שלו נכנס, והחיסור אינו מסתדר.
  */
  check('סניף בלי תקציב משרד מופיע בטבלה', !!t.noBudRow, t.noBudRow ? t.noBudRow.join(' | ') : 'לא נמצא');
  if (t.noBudRow) {
    check('הוא מסומן "טרם הוזן תקציב משרד"', t.noBudRow[0].includes('טרם הוזן תקציב משרד'), t.noBudRow[0]);
    check('הפער שלו ריק', t.noBudRow[6] === '—' && t.noBudRow[7] === '—', `${t.noBudRow[6]} / ${t.noBudRow[7]}`);
    const his = numOf(t.noBudRow[3]);
    check('העלות שלו אינה נספרת בשורת הסיכום', Math.abs(fo[3] - (numOf(r[3]) )) <= 2,
      `סיכום ${fo[3]} · הסניף המשלם ${numOf(r[3])} · הסניף בלי תקציב ${his}`);
    // "סניף אחד לא נכלל" ברבים אחד, "N סניפים לא נכללו" ברבים
    check('שורת הסיכום מציינת כמה סניפים לא נכללו', /לא נכלל(ו)?/.test(t.foot[0]), t.foot[0].replace(/\n/g, ' '));
  }

  /*
    הבאג שנתפס בסקירה: ToComplete מריץ per(), ולכן עמודת "פער להעברה ·
    לשנה" התחלקה ב-12 כשהמתג שלמעלה על "חודשי" — בעוד שאר העמודות נשארו
    שנתיות. הטבלה הזאת חייבת להישאר שנתית תמיד.
  */
  const gapCells = () => p.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find(x => x.innerText.includes('העברות לסניפים'));
    let el = h, table = null;
    while ((el = el.nextElementSibling)) { table = el.querySelector?.('table'); if (table) break; }
    const cells = r => [...r.querySelectorAll('td')].map(c => c.innerText.trim());
    return {
      row:  cells([...table.querySelectorAll('tbody tr')][0]),
      foot: cells(table.querySelector('tfoot tr')),
    };
  });
  const before = await gapCells();
  await p.getByRole('button', { name: /^חודשי$/ }).click();
  await p.waitForTimeout(800);
  const after = await gapCells();
  check('מתג "חודשי" אינו משנה את טבלת ההעברות', JSON.stringify(before) === JSON.stringify(after),
    `לפני: ${before.row.join('|')}  אחרי: ${after.row.join('|')}`);
  await p.getByRole('button', { name: /^שנתי$/ }).click();
  await p.waitForTimeout(800);

  // ── ה-PDF המעוצב: לוכדים את ה-iframe במקום לפתוח דיאלוג הדפסה ──
  await p.evaluate(() => {
    window.__pdfHtml = null;
    const orig = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
    Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
      set(v) { window.__pdfHtml = v; orig.set.call(this, v); }, get() { return orig.get.call(this); },
    });
    // print בתוך iframe חוסם את הדפדפן — מנטרלים אותו לבדיקה
    const ap = Node.prototype.appendChild;
    Node.prototype.appendChild = function (n) {
      if (n?.tagName === 'IFRAME') n.addEventListener('load', () => { try { n.contentWindow.print = () => {}; } catch {} }, true);
      return ap.call(this, n);
    };
  });
  await p.getByRole('button', { name: /הורדת PDF מעוצב/ }).click();
  await p.waitForTimeout(1500);
  const html = await p.evaluate(() => window.__pdfHtml);
  check('ה-PDF נבנה', !!html && html.length > 500, html ? `${html.length} תווים` : 'ריק');
  if (html) {
    check('לוגו הרשת במסמך', html.includes('logo-chabad.png'));
    check('כיוון ימין-לשמאל', html.includes('dir="rtl"'));
    check('הסניף המשלם בטבלת ה-PDF', html.includes(S_PAY));
    check('הסניף שלא משלמים בו אינו ב-PDF', !html.includes(S_NOPAY));
    check('עמודת הפער החודשי במסמך', html.includes('לחודש'));
    fs.writeFileSync('_transfers-preview.html', html.replace(/src="[^"]*logo-chabad/, 'src="http://localhost:5190/logo-chabad'));
  }

  // ── האקסל: שהקובץ באמת יורד, ושהמספרים בו מספרים ולא טקסט ──
  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 15000 }),
    p.getByRole('button', { name: /הורדה לאקסל/ }).click(),
  ]);
  check('שם קובץ האקסל', /^העברות_לסניפים_\d{4}-\d{2}-\d{2}\.xlsx$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  await dl.saveAs('_transfers.xlsx');
  const XLSX = (await import('xlsx')).default ?? await import('xlsx');
  const wb = XLSX.read(fs.readFileSync('_transfers.xlsx'));
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  check('שם הגיליון', wb.SheetNames[0] === 'העברות לסניפים', wb.SheetNames[0]);
  check('הגיליון מימין לשמאל', wb.Workbook?.Views?.[0]?.RTL === true);
  // האקסל נושא עמודת "הערה" נוספת שאין בטבלה — שם נרשם "לפי התקציב"
  // ו"טרם הוזן תקציב משרד החינוך", שבמסך מוצגים כתגית ליד שם הסניף.
  check('כותרות האקסל = כותרות הטבלה + "הערה"',
    JSON.stringify(aoa[0]) === JSON.stringify([...t.heads, 'הערה']), (aoa[0] || []).join(' | '));
  const xr = aoa.find(x => x[0] === S_PAY);
  check('שורת הסניף באקסל', !!xr, xr ? xr.join(' | ') : 'לא נמצאה');
  check('המספרים באקסל הם מספרים (ניתן לסכם)', !!xr && xr.slice(1, 8).every(v => typeof v === 'number'),
    xr ? xr.slice(1, 8).map(v => typeof v).join(',') : '');
  check('שורת סה"כ באקסל', /^סה["״]כ/.test(String(aoa[aoa.length - 1][0])), String(aoa[aoa.length - 1][0]));

  // ── צילומים: דסקטופ, החלון הקטן של שרה, ונייד ──
  const shot = async (name, w, h) => {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(500);
    const h2 = p.getByRole('heading', { name: 'העברות לסניפים' });
    await h2.scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
    await p.screenshot({ path: `_transfers_${name}.png` });
  };
  await shot('desktop', 1450, 950);
  await shot('sara', 1000, 440);
  await shot('mobile', 390, 780);
  // הטבלה בנייד מוחלפת בכרטיסים — אותם נתונים
  const mob = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.only-mobile .mcard')];
    const c = cards.find(x => x.innerText.includes('פער להעברה'));
    return c ? c.innerText.split('\n').filter(Boolean) : null;
  });
  check('בנייד יש כרטיס העברות', !!mob, mob ? mob.join(' · ') : 'אין');

  // ה-PDF עצמו, כדי לראות את הפריסה המודפסת
  await p.setViewportSize({ width: 1450, height: 950 });
  const prev = await (await b.newContext({ locale: 'he-IL' })).newPage();
  await prev.goto('file:///' + process.cwd().replace(/\\/g, '/') + '/_transfers-preview.html');
  await prev.waitForTimeout(1200);
  await prev.pdf({ path: '_transfers.pdf', printBackground: true, preferCSSPageSize: true });
  await prev.screenshot({ path: '_transfers_pdf.png', fullPage: true });
} catch (e) {
  check('ריצה ללא שגיאה', false, e.message);
} finally {
  await cleanup();
  await b.close();
}
console.log(fails.length ? `\n${fails.length} כשלים: ${fails.join(', ')}` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
