import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';

const SCHOOLS = [{ id: 's1', name: 'שלהבות אשקלון', city: 'אשקלון', reform: 'ofek' }];
const mk = (o) => ({
  schoolId: 's1', tzId: '039485712', email: 't@x.org', reform: 'ofek', level: 'elementary',
  grade: 5, degree: 'BA', seniority: 12, frontalHours: 26, scopePct: 100, scope: 100,
  role: 'none', ageGroup: 'none', isTemp: false, scopeChanges: [], childrenUnder18: 0,
  _files: [], sickFiles: [], absenceDays: 0, mmHours: 0, mmFor: '', monthlyExtras: 0,
  _officialGross: 12500, _officialGrossPre: null, _changedAt: null, _approved: true,
  _approvedAt: '2026-08-20T10:00:00.000Z', _snapshot: null, ...o,
});
const T = [mk({ id: 't1', name: 'חנה לוי' }), mk({ id: 't2', name: 'מרים כהן' })];

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' })).newPage();
const fails = [];
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails.push(n); };
const seed = async (ts) => {
  await p.evaluate(([s, x]) => {
    localStorage.setItem('ss-schools-v2', JSON.stringify(s));
    localStorage.setItem('ss-months-v1', JSON.stringify({ '2026-08': x }));
  }, [SCHOOLS, ts]);
  await p.reload(); await p.waitForTimeout(400);
  await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(400);
};
const read = () => p.evaluate(() => JSON.parse(localStorage.getItem('ss-months-v1')));
const setField = (id, patch) => p.evaluate(([i, pa]) => {
  const m = JSON.parse(localStorage.getItem('ss-months-v1'));
  Object.assign(m['2026-08'].find(x => x.id === i), pa);
  localStorage.setItem('ss-months-v1', JSON.stringify(m));
}, [id, patch]);

await p.goto('http://localhost:5190/');
await seed(T);

// ══ 1. role / level / ageGroup — כולם משנים שכר וכולם היו חסרים מ-BASE_FIELDS ══
for (const [label, apply] of [
  ['תפקיד',      async () => { await p.locator('select').last().selectOption('vp'); }],
  ['שלב',        async () => { await p.getByRole('button', { name: 'חטיבת ביניים' }).click(); }],
  ['קבוצת גיל',  async () => { await p.getByRole('button', { name: 'גיל 55+ (ותיק/ה)' }).click(); }],
]) {
  await seed(T);
  await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(500);
  await p.getByTitle(/פרטים מלאים/).first().click(); await p.waitForTimeout(500);
  await apply(); await p.waitForTimeout(300);
  await p.getByRole('button', { name: /^שמור/ }).last().click(); await p.waitForTimeout(600);
  const after = (await read())['2026-08'].find(x => x.id === 't1');
  check(`שינוי ${label} מפיל אישור מאושר`, after._approved === false && after._officialGross === null,
    `approved=${after._approved} gross=${after._officialGross}`);
  check(`שינוי ${label} נרשם ב-diff לשליח`, !!after._snapshot,
    after._snapshot ? Object.keys(after._snapshot).length + ' שדות' : 'אין snapshot');
}

// ══ 2. childrenUnder18 מופיע ב-diff (קודם הפיל אישור בלי להיראות) ══
await seed(T);
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(500);
await p.getByTitle('עריכה').first().click(); await p.waitForTimeout(300);
// ותק(0) פרונטלי(1) ילדים(2) ...
await p.locator('table input[type="number"]').nth(2).fill('3');
await p.getByRole('button', { name: 'שמור' }).click(); await p.waitForTimeout(500);
const kids = (await read())['2026-08'].find(x => x.id === 't1');
check('שינוי מספר ילדים מפיל אישור', kids._approved === false);
check('שינוי מספר ילדים מופיע ב-diff', !!kids._snapshot && 'childrenUnder18' in kids._snapshot,
  Object.keys(kids._snapshot || {}).length + ' שדות ב-snapshot');
// המורה שלמעלה עברה ל"נדרשת סימולציה" (שדה בסיס אופס את השכר), ולכן היא
// עוד לא בתור האישורים. נזרע ישירות מורה שממתינה לאישור עם אותו שינוי.
await seed([mk({
  id: 't1', name: 'ממתינה לאישור', childrenUnder18: 3, isTemp: true,
  _changedAt: '2026-08-21T10:00:00.000Z', _approved: false, _officialGross: 12500,
  _snapshot: { childrenUnder18: 0, isTemp: false, role: 'none' },
})]);
await p.locator('.nav-btn').filter({ hasText: /לאישור|אישורים/ }).first().click(); await p.waitForTimeout(600);
check('השליח רואה את התווית "ילדים עד 18"',
  await p.getByText('ילדים עד 18').first().isVisible().catch(() => false));
check('השליח רואה את התווית "שיבוץ זמני"',
  await p.getByText('שיבוץ זמני').first().isVisible().catch(() => false));
check('שיבוץ זמני מוצג כ"לא ← כן" ולא כערך גולמי',
  await p.getByText('כן').first().isVisible().catch(() => false));
check('אין שורת diff בלי תווית', !(await p.getByText(/^undefined/).count()));

// ══ 3. "אשר הכל" מאשר רק את מי שממתין לאישור ══
await seed([
  mk({ id: 't1', name: 'ממתינה לאישור', _changedAt: '2026-08-21T10:00:00.000Z', _approved: false, _officialGross: 12500, _snapshot: { seniority: 10 } }),
  mk({ id: 't2', name: 'ממתינה לסימולציה', _changedAt: '2026-08-21T10:00:00.000Z', _approved: false, _officialGross: null, _snapshot: { seniority: 10 } }),
  mk({ id: 't3', name: 'לא שינתה כלום', _changedAt: null, _approved: false, _officialGross: null }),
]);
await p.locator('.nav-btn').filter({ hasText: /לאישור|אישורים/ }).first().click(); await p.waitForTimeout(500);
await p.getByRole('button', { name: /אשר הכל|אשר את כל/ }).click(); await p.waitForTimeout(700);
const after3 = (await read())['2026-08'];
check('אושרה רק מי שהמתינה לאישור', after3.find(x => x.id === 't1')._approved === true);
check('מי שממתינה לסימולציה לא אושרה', after3.find(x => x.id === 't2')._approved === false,
  String(after3.find(x => x.id === 't2')._approved));
check('מי שממתינה לסימולציה נשארה בתור', after3.find(x => x.id === 't2')._changedAt !== null);
check('מי שלא שינתה כלום לא אושרה', after3.find(x => x.id === 't3')._approved === false);

// ══ 4. חודש חדש מתחיל בלי שכר רשמי ══
await seed(T);
await p.getByTitle('פתיחת חודש חדש').click(); await p.waitForTimeout(800);
const months = await read();
const sept = months['2026-09'];
check('נפתח חודש חדש', !!sept);
check('החודש החדש מתחיל בלי שכר רשמי', sept.every(x => x._officialGross === null),
  JSON.stringify(sept.map(x => x._officialGross)));
check('החודש החדש מתחיל בלי אישור', sept.every(x => x._approved === false));
check('המורים בחודש החדש נמצאים בתור הסימולציה', sept.every(x => !!x._changedAt));
check('החודש הקודם שמר את השכר שלו', months['2026-08'].every(x => x._officialGross === 12500));

// ══ 5. אחוז משרה: scope ו-scopePct לא נפרדים ══
await seed(T);
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(500);
await p.getByTitle('עריכה').first().click(); await p.waitForTimeout(300);
await p.locator('table input[type="number"]').nth(1).fill('13');
await p.getByRole('button', { name: 'שמור' }).click(); await p.waitForTimeout(500);
const sc = (await read())['2026-08'].find(x => x.id === 't1');
check('scopePct עודכן', sc.scopePct === 50, String(sc.scopePct));
check('scope עודכן יחד איתו', sc.scope === 50, String(sc.scope));

// מורה בעולם ישן ב-50% — ביגוד והבראה יחסיים, לא של משרה מלאה
await seed([mk({ id: 't1', name: 'עולם ישן', reform: 'pre', degree: 'MA', scope: 50, scopePct: 50, _officialGross: null, _approved: false })]);
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(600);
const rowTxt = (await p.locator('table tbody tr').first().textContent()) || '';
check('מורת עולם ישן ב-50% מוצגת כ-50%', rowTxt.includes('50%'), rowTxt.match(/\d+%/g)?.join(' ') || '');

await b.close();
console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
