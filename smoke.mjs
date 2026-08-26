import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';

const SCHOOLS = [
  { id: 's1', name: 'שלהבות אשקלון', city: 'אשקלון', principalEmail: 'a@x.org' },
  { id: 's2', name: 'בית חינוך רעננה', city: 'רעננה', principalEmail: 'b@x.org' },
];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL' });
const p = await ctx.newPage();
const fails = [];
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) fails.push(name);
};

await p.goto('http://localhost:5190/');
await p.evaluate((s) => {
  localStorage.setItem('ss-schools-v2', JSON.stringify(s));
  localStorage.setItem('ss-months-v1', JSON.stringify({ '2026-08': [] }));
}, SCHOOLS);
await p.reload();
await p.waitForTimeout(400);

// ── login as coordinator ──
await p.getByText('כניסה למערכת').click();
await p.waitForTimeout(400);

// ══ TEST 1: inline row add inside SchoolView ══
await p.getByText('שלהבות אשקלון').first().click();
await p.waitForTimeout(400);
await p.getByRole('button', { name: /הוסף מורה/ }).first().click();
await p.waitForTimeout(300);
await p.getByPlaceholder('שם מלא *').fill('חנה לוי');
await p.getByRole('button', { name: 'שמור' }).click();
await p.waitForTimeout(500);

const stored1 = await p.evaluate(() => JSON.parse(localStorage.getItem('ss-months-v1'))['2026-08']);
check('הוספת מורה בשורת הטבלה — נשמרה ב-localStorage', stored1.length === 1, `נמצאו ${stored1.length} רשומות`);
check('הוספת מורה בשורת הטבלה — השם נכון', stored1[0]?.name === 'חנה לוי', String(stored1[0]?.name));
check('הוספת מורה בשורת הטבלה — מופיעה בטבלה', await p.getByText('חנה לוי').first().isVisible().catch(() => false));
check('המורה שויכה לבית הספר הנכון', stored1[0]?.schoolId === 's1', String(stored1[0]?.schoolId));
check('המורה נכנסה לתור הסימולציה', !!stored1[0]?._changedAt && !stored1[0]?._approved);

// ══ TEST 2: editing an existing teacher does not duplicate ══
await p.getByTitle('עריכה').first().click();
await p.waitForTimeout(300);
await p.locator('input[value="חנה לוי"]').first().fill('חנה לוי-כהן');
await p.getByRole('button', { name: 'שמור' }).click();
await p.waitForTimeout(500);
const stored2 = await p.evaluate(() => JSON.parse(localStorage.getItem('ss-months-v1'))['2026-08']);
check('עריכת מורה קיימת — לא נוצרה כפילות', stored2.length === 1, `נמצאו ${stored2.length} רשומות`);
check('עריכת מורה קיימת — השם עודכן', stored2[0]?.name === 'חנה לוי-כהן', String(stored2[0]?.name));

// ══ TEST 3: school-card button opens TeacherModal (was ReferenceError) ══
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(e.message));
await p.getByRole('button', { name: /חזרה/ }).first().click();
await p.waitForTimeout(400);
const cardBtns = p.getByRole('button', { name: '+ הוסף מורה' });
await cardBtns.nth(1).click();   // כרטיס בית חינוך רעננה
await p.waitForTimeout(500);
check('כפתור הכרטיס לא זורק ReferenceError', pageErrors.length === 0, pageErrors[0] || '');
check('TeacherModal נפתח', await p.getByText('הוספת מורה').first().isVisible().catch(() => false));

// ── the fields that only exist in TeacherModal ──
const roleOpts = await p.locator('select').last().locator('option').allTextContents();
check('בורר גמול התפקיד נגיש', roleOpts.some(o => o.includes('יועץ/ת (רישיון קבוע)')), `${roleOpts.length} תפקידים`);
check('אין תפקיד סגנית — אין סגניות ברשת', !roleOpts.some(o => o.includes('סגן')), roleOpts.length + ' תפקידים');
check('בורר קבוצת גיל נגיש', await p.getByRole('button', { name: 'גיל 50–55' }).isVisible().catch(() => false));
check('בורר שלב חינוך נגיש', await p.getByRole('button', { name: 'חטיבת ביניים' }).isVisible().catch(() => false));
check('כפתור פתיחת הסימולטור נגיש', await p.getByRole('button', { name: 'פתח סימולטור' }).isVisible().catch(() => false));

await p.getByPlaceholder('שם מלא').first().fill('מרים כהן');
await p.getByRole('button', { name: 'הוסף מורה', exact: true }).last().click();
await p.waitForTimeout(500);
const stored3 = await p.evaluate(() => JSON.parse(localStorage.getItem('ss-months-v1'))['2026-08']);
check('שמירה מ-TeacherModal', stored3.length === 2, `נמצאו ${stored3.length} רשומות`);
check('המורה מהמודל שויכה לרעננה', stored3.find(x => x.name === 'מרים כהן')?.schoolId === 's2');

// ══ TEST 4: new month does not copy attachments ══
await p.evaluate(() => {
  const m = JSON.parse(localStorage.getItem('ss-months-v1'));
  m['2026-08'][0]._files = [{ id: 'f1', name: 'x.pdf', data: 'data:application/pdf;base64,AAAA' }];
  m['2026-08'][0]._approved = true;
  localStorage.setItem('ss-months-v1', JSON.stringify(m));
});
await p.reload();
await p.waitForTimeout(400);
await p.getByText('כניסה למערכת').click();
await p.waitForTimeout(400);
await p.getByTitle('פתיחת חודש חדש').click();
await p.waitForTimeout(600);
const months = await p.evaluate(() => JSON.parse(localStorage.getItem('ss-months-v1')));
const sept = months['2026-09'];
check('נפתח חודש חדש', !!sept, Object.keys(months).join(', '));
check('קבצים מצורפים לא הועתקו לחודש החדש', sept && (sept[0]._files || []).length === 0, `הועתקו ${sept ? (sept[0]._files || []).length : '?'} קבצים`);
check('הקובץ נשאר בחודש המקורי', (months['2026-08'][0]._files || []).length === 1);

await b.close();
console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
