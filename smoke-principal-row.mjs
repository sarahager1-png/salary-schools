import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' })).newPage();
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };
const schools = () => p.evaluate(() => JSON.parse(localStorage.getItem('ss-schools-v2')));
const teachers = () => p.evaluate(() => {
  const m = JSON.parse(localStorage.getItem('ss-months-v1'));
  const k = Object.keys(m).sort();
  return m[k[k.length - 1]] || [];
});

const waitSrc = async (want) => {
  // המסגרת נטענת קודם ברשימת המחשבונים ורק אז מנווטת ליעד
  for (let i = 0; i < 14; i++) {
    const s = await p.locator('iframe').first().getAttribute('src');
    if ((s || '').endsWith(want)) return s;
    await p.waitForTimeout(700);
  }
  return await p.locator('iframe').first().getAttribute('src');
};
await p.goto('http://localhost:5190/');
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(500);
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(700);

// ══ 1. every school gets a principal row on a fresh install ══
const s = await schools();
const ts = await teachers();
const principals = ts.filter(t => t.role === 'principal');
check('נוצרה שורת מנהלת לכל בית ספר', principals.length === s.length, `${principals.length} / ${s.length}`);
check('כל שורת מנהלת משויכת לבית ספר אחר',
  new Set(principals.map(x => x.schoolId)).size === s.length);
check('שורת המנהלת יורשת את מסלול בית הספר', principals.every(pr =>
  pr.reform === s.find(x => x.id === pr.schoolId).reform),
  principals.map(x => x.reform).join(','));
check('שורת המנהלת ממתינה לסימולציה', principals.every(x => !!x._changedAt && !x._approved));

// ══ 2. she shows up in the school table, first, marked ══
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(600);
const firstRow = (await p.locator('table tbody tr').first().textContent()) || '';
check('שורת המנהלת ראשונה בטבלה', firstRow.includes('מנהלת'), firstRow.slice(0, 50));
check('מסומנת בתג "מנהלת"', await p.locator('table').getByText('מנהלת', { exact: true }).first().isVisible().catch(() => false));

// ══ 3. she is counted in the school's budget ══
await p.evaluate(() => {
  const m = JSON.parse(localStorage.getItem('ss-months-v1'));
  const k = Object.keys(m).sort(); const cur = m[k[k.length - 1]];
  const sc = JSON.parse(localStorage.getItem('ss-schools-v2')).find(x => x.name === 'שלהבות אשקלון');
  cur.filter(t => t.schoolId === sc.id).forEach(t => { t._officialGross = 10000; t._officialGrossPre = 10000; });
  localStorage.setItem('ss-months-v1', JSON.stringify(m));
});
await p.reload(); await p.waitForTimeout(400);
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(400);
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(700);
const stats = (await p.locator('.apple-stat').allTextContents()).join(' | ');
check('המנהלת נספרת במניין המורות של בית הספר', /1/.test(stats), stats.slice(0, 90));
check('שכר המנהלת נכנס לעלות המעסיק', stats.includes('14,000'), stats.slice(0, 120));

// ══ 4. the management calculator opens for her ══
// מחזירים את כולן לתור הסימולציה, ואז נכנסים כחשבת שכר
await p.evaluate(() => {
  const m = JSON.parse(localStorage.getItem('ss-months-v1'));
  const k = Object.keys(m).sort(); const cur = m[k[k.length - 1]];
  cur.forEach(t => { t._officialGross = null; t._officialGrossPre = null; t._changedAt = '2026-08-21T10:00:00.000Z'; t._approved = false; });
  localStorage.setItem('ss-months-v1', JSON.stringify(m));
});
await p.reload(); await p.waitForTimeout(500);
await p.getByText('חשבת שכר').click(); await p.waitForTimeout(300);
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(1200);
await p.getByText('מנהלת בית הספר').first().click(); await p.waitForTimeout(600);
// למנהלת סימולציית ניהול אחת — לא שני שלבים
const src1 = await waitSrc('OfekNihul');
check('המנהלת מקבלת את מחשבון אופק — ניהול', src1.endsWith('OfekNihul'), src1);
check('למנהלת שדה אחד, בלי שלב עולם ישן',
  !(await p.getByPlaceholder('שכר משולב ממחשבון העולם הישן').isVisible().catch(() => false)));
await p.getByPlaceholder('שכר משולב ממחשבון אופק — ניהול').fill('18400');
await p.getByPlaceholder('שכר משולב ממחשבון אופק — ניהול').press('Enter');
await p.waitForTimeout(700);
const pr = (await teachers()).find(x => x.role === 'principal');
check('הסימולציה נשמרה למנהלת', pr._officialGross === 18400, String(pr._officialGross));
check('למנהלת אין רכיב תוספת — הבסיס מלא', !pr._officialGrossPre, String(pr._officialGrossPre));

// ══ 5. a newly created school gets one too ══
await p.getByRole('button', { name: 'יציאה' }).click(); await p.waitForTimeout(300);
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(500);
await p.getByRole('button', { name: /הוסף בית ספר/ }).click(); await p.waitForTimeout(400);
await p.getByPlaceholder('שם בית הספר *').fill('שלהבות בדיקה');
await p.getByRole('button', { name: 'שמור' }).click(); await p.waitForTimeout(700);
const ts2 = await teachers();
const newSchool = (await schools()).find(x => x.name === 'שלהבות בדיקה');
check('בית ספר חדש נפתח עם שורת מנהלת',
  ts2.some(t => t.schoolId === newSchool.id && t.role === 'principal'));

// ══ 6. the backfill runs only once ══
await p.evaluate(() => {
  const m = JSON.parse(localStorage.getItem('ss-months-v1'));
  const k = Object.keys(m).sort();
  m[k[k.length - 1]] = m[k[k.length - 1]].filter(t => t.role !== 'principal');
  localStorage.setItem('ss-months-v1', JSON.stringify(m));
});
await p.reload(); await p.waitForTimeout(500);
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(600);
const ts3 = await teachers();
check('מחיקה מכוונת של שורת מנהלת אינה משוחזרת',
  ts3.filter(t => t.role === 'principal').length === 0, String(ts3.filter(t => t.role === 'principal').length));

await b.close();
console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
