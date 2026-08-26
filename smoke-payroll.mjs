import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';

const mk = (o) => ({
  schoolId: 's1', tzId: '039485712', email: 't@x.org', reform: 'ofek', level: 'elementary',
  grade: 5, degree: 'BA', seniority: 12, frontalHours: 26, scopePct: 100, scope: 100,
  role: 'none', ageGroup: 'none', isTemp: false, scopeChanges: [], childrenUnder18: 0,
  _files: [], sickFiles: [], absenceDays: 0, mmHours: 0, mmFor: '', monthlyExtras: 0,
  _officialGross: null, _officialGrossPre: null, _changedAt: '2026-08-21T10:00:00.000Z',
  _approved: false, _approvedAt: null, _snapshot: null, ...o,
});

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' })).newPage();
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };
const read = () => p.evaluate(() => {
  const m = JSON.parse(localStorage.getItem('ss-months-v1'));
  return m[Object.keys(m).sort().pop()] || [];
});
const seed = async (schools, ts, role) => {
  await p.evaluate(([s, x]) => {
    localStorage.setItem('ss-schools-v2', JSON.stringify(s));
    localStorage.setItem('ss-months-v1', JSON.stringify({ '2026-08': x }));
    localStorage.setItem('ss-seeded-v1', '1');
    localStorage.setItem('ss-reform-fix-v1', '1');
    localStorage.setItem('ss-principal-rows-v1', '1');
  }, [schools, ts]);
  await p.reload(); await p.waitForTimeout(400);
  if (role) { await p.getByText(role).click(); await p.waitForTimeout(200); }
  await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(role ? 900 : 500);
};
const OFEK = [{ id: 's1', name: 'שלהבות אשקלון', city: 'אשקלון', reform: 'ofek' }];
const OLD  = [{ id: 's1', name: 'שלהבות ירושלים', city: 'ירושלים', reform: 'pre' }];

await p.goto('http://localhost:5190/');

// ══════════ מודל התשלום ══════════
// אופק: בסיס 11,200 · תוספת 1,300 · ברוטו 12,500
// מעביד: 11,200×40% = 4,480 · 1,300×30% = 390 → 4,870 · סה"כ 17,370
await seed(OFEK, [mk({ id: 't1', name: 'חנה לוי', _officialGrossPre: 11200, _officialGross: 12500 })]);
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(600);
const row = () => p.locator('table tbody tr').first().textContent().then(x => x || '');
let r = await row();
check('אופק — בסיס עולם ישן 11,200', r.includes('11,200'), r.slice(0, 60));
check('אופק — תוספת בית חב"ד 1,300', r.includes('1,300'));
check('אופק — ברוטו 12,500', r.includes('12,500'));
check('אופק — הוצאות מעביד 4,870 (40% בסיס + 30% תוספת)', r.includes('4,870'),
  r.match(/[\d,]{3,}/g)?.join(' ') || '');
check('אופק — סה"כ למעסיק 17,370', r.includes('17,370'));
check('אופק — לא לפי המודל הישן (17,500)', !r.includes('17,500'));
// שורת הסה"כ מיושרת מול העמודות החדשות
const foot = (await p.locator('table tfoot tr').first().textContent()) || '';
check('שורת סה"כ — בסיס 11,200', foot.includes('11,200'), foot.slice(0, 70));
check('שורת סה"כ — תוספת 1,300', foot.includes('1,300'), foot.slice(0, 70));
check('שורת סה"כ — ברוטו 12,500', foot.includes('12,500'));
check('שורת סה"כ — למעסיק 17,370', foot.includes('17,370'));

// עולם ישן: סימולציה אחת, אין תוספת. 11,200 + 40% = 15,680
await seed(OLD, [mk({ id: 't1', name: 'מרים כהן', reform: 'pre', degree: 'MA', _officialGross: 11200 })]);
await p.getByText('שלהבות ירושלים').first().click(); await p.waitForTimeout(600);
r = await row();
check('עולם ישן — בסיס 11,200', r.includes('11,200'));
check('עולם ישן — סה"כ למעסיק 15,680', r.includes('15,680'), r.match(/[\d,]{3,}/g)?.join(' ') || '');
check('עולם ישן — אין רכיב תוספת', !r.includes('1,300'));

// פער שלילי: אופק 10,800 מול עולם ישן 11,200 → תוספת 0, ברוטו 11,200
await seed(OFEK, [mk({ id: 't1', name: 'פער שלילי', _officialGrossPre: 11200, _officialGross: 10800 })]);
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(600);
r = await row();
check('פער שלילי — הברוטו נשאר 11,200', r.includes('11,200'));
check('פער שלילי — התוספת 0', r.includes('0'), r.match(/[\d,]{3,}/g)?.join(' ') || '');
check('פער שלילי — סה"כ למעסיק 15,680', r.includes('15,680'));

// סימולציה חלקית — לא מגיעה לשליח
await seed(OFEK, [mk({ id: 't1', name: 'חצי סימולציה', _officialGross: 12500 })]);
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(600);
check('אופק עם סימולציה אחת — מסומן כחסר', (await row()).includes('חסרה סימולציית עולם ישן'), (await row()).slice(-60));
const apprBtn = await p.locator('.nav-btn').filter({ hasText: /לאישור|אישורים/ }).first().textContent();
check('אופק עם סימולציה אחת — לא נספר לאישור', !/\d/.test(apprBtn || ''), apprBtn || '');

// ══════════ מסך החשבת — שני שלבים ══════════
await seed(OFEK, [mk({ id: 't1', name: 'חנה לוי' })], 'חשבת שכר');
await p.getByText('חנה לוי').click(); await p.waitForTimeout(600);
const src = () => p.locator('iframe').first().getAttribute('src');
check('שלב 1 פותח את מחשבון העולם הישן', (await src()).endsWith('OldWorld'), await src());
await p.getByPlaceholder('שכר משולב ממחשבון העולם הישן').fill('11200');
await p.getByPlaceholder('שכר משולב ממחשבון העולם הישן').press('Enter');
await p.waitForTimeout(400);
check('Enter מעביר לשלב 2 — מחשבון אופק', (await src()).endsWith('OfekHadash'), await src());
await p.getByPlaceholder('שכר משולב ממחשבון אופק חדש').fill('12500');
await p.waitForTimeout(300);
check('הפער מוצג חי לפני השמירה',
  await p.getByText('תוספת בית חב"ד').first().isVisible().catch(() => false));
await p.getByPlaceholder('שכר משולב ממחשבון אופק חדש').press('Enter');
await p.waitForTimeout(700);
const saved = (await read())[0];
check('נשמרו שתי הסימולציות', saved._officialGrossPre === 11200 && saved._officialGross === 12500,
  `pre=${saved._officialGrossPre} ofek=${saved._officialGross}`);

// ══════════ מכסת שעות ══════════
const QUOTA = [{ id: 's1', name: 'שלהבות אשקלון', city: 'אשקלון', reform: 'ofek', hoursQuota: 180 }];
const three = [
  mk({ id: 't1', name: 'א', frontalHours: 26 }),
  mk({ id: 't2', name: 'ב', frontalHours: 26 }),
  mk({ id: 't3', name: 'ג', frontalHours: 20 }),
];  // 72 שעות
await seed(QUOTA, three);
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(600);
check('מד המכסה מוצג', await p.getByText('שעות עובדי הוראה').isVisible().catch(() => false));
check('מוצג 72 / 180', (await p.locator('body').textContent()).includes('72 / 180'));
check('מוצג כמה נותרו', (await p.locator('body').textContent()).includes('נותרו 108'));

// שמירה בתוך המכסה
await p.getByTitle('עריכה מהירה בשורה').first().click(); await p.waitForTimeout(300);
await p.locator('table input[type="number"]').nth(1).fill('30');
await p.getByRole('button', { name: 'שמור' }).click(); await p.waitForTimeout(600);
check('שמירה בתוך המכסה עוברת', (await read()).find(x => x.id === 't1').frontalHours === 30,
  String((await read()).find(x => x.id === 't1').frontalHours));

// חריגה — נחסמת
let alertText = null;
p.on('dialog', async d => { alertText = d.message(); await d.dismiss(); });
await p.getByTitle('עריכה מהירה בשורה').first().click(); await p.waitForTimeout(300);
await p.locator('table input[type="number"]').nth(1).fill('160');   // 160+26+20 = 206 > 180
await p.getByRole('button', { name: 'שמור' }).click(); await p.waitForTimeout(700);
check('חריגה מהמכסה נחסמת', !!alertText && alertText.includes('מכסת השעות'), (alertText || 'לא הוצגה הודעה').split('\n')[0]);
check('ההודעה אומרת בכמה חורגים', !!alertText && alertText.includes('26'), (alertText || '').split('\n').pop());
check('השעות לא נשמרו', (await read()).find(x => x.id === 't1').frontalHours === 30,
  String((await read()).find(x => x.id === 't1').frontalHours));

// עריכת מורה קיימת לא נספרת פעמיים
await p.locator('table input[type="number"]').nth(1).fill('134');   // 134+26+20 = 180 בדיוק
await p.getByRole('button', { name: 'שמור' }).click(); await p.waitForTimeout(700);
check('מיצוי מדויק של המכסה עובר', (await read()).find(x => x.id === 't1').frontalHours === 134,
  String((await read()).find(x => x.id === 't1').frontalHours));

// בלי מכסה — אין חסימה
await seed(OFEK, [mk({ id: 't1', name: 'א', frontalHours: 26 })]);
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(600);
check('בלי מכסה מוגדרת — אין מד', !(await p.getByText('שעות עובדי הוראה').isVisible().catch(() => false)));
alertText = null;
await p.getByTitle('עריכה מהירה בשורה').first().click(); await p.waitForTimeout(300);
await p.locator('table input[type="number"]').nth(1).fill('300');
await p.getByRole('button', { name: 'שמור' }).click(); await p.waitForTimeout(700);
check('בלי מכסה — שום חסימה', !alertText && (await read())[0].frontalHours === 300,
  `alert=${alertText} hours=${(await read())[0].frontalHours}`);

await b.close();
console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
