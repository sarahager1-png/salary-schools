import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';

const SCHOOLS = [{ id: 's1', name: 'שלהבות אשקלון', city: 'אשקלון', reform: 'ofek' }];
const T = [{
  id: 't1', schoolId: 's1', name: 'חנה לוי', tzId: '039485712', email: 't@x.org',
  reform: 'ofek', level: 'elementary', grade: 5, degree: 'BA', seniority: 12,
  frontalHours: 26, scopePct: 100, scope: 100, role: 'none', ageGroup: 'none',
  isTemp: false, scopeChanges: [], childrenUnder18: 0, _files: [], sickFiles: [],
  absenceDays: 0, mmHours: 0, mmFor: '', monthlyExtras: 0,
  _officialGross: 12500, _officialGrossPre: null,
  _changedAt: null, _approved: true, _approvedAt: '2026-08-20T10:00:00.000Z', _snapshot: null,
}];

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' })).newPage();
const fails = [];
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails.push(n); };

await p.goto('http://localhost:5190/');
await p.evaluate(([s, ts]) => {
  localStorage.setItem('ss-schools-v2', JSON.stringify(s));
  localStorage.setItem('ss-months-v1', JSON.stringify({ '2026-08': ts }));
}, [SCHOOLS, T]);
await p.reload(); await p.waitForTimeout(400);

// ══ 1. employer rate is 40% ══
// ביגוד והבראה כלולים בתוך ה-40% ואינם מתווספים מעליו:
// ברוטו 12,500 · הוצאות מעביד 40% = 5,000 · סה"כ למעסיק = 17,500
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(400);
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(600);
const empCell = (await p.locator('table tbody tr').first().locator('td').last().textContent()) || '';
const totalTxt = (await p.locator('table tbody tr').first().textContent()) || '';
check('סה"כ למעסיק = ברוטו + 40% = 17,500 ₪', totalTxt.includes('17,500'),
  totalTxt.match(/[\d,]{4,}/g)?.join(' | ') || empCell);
check('ביגוד והבראה אינם מתווספים מעל ה-40%', !totalTxt.includes('18,719'));
check('עמודת הוצאות המעביד מציגה 5,000', totalTxt.includes('5,000'), totalTxt.match(/[\d,]{4,}/g)?.join(' | '));

const note = await p.getByText(/הוצאות מעביד/).first().textContent().catch(() => '');
await p.getByRole('button', { name: 'דוח רשת' }).click(); await p.waitForTimeout(500);
const netNote = (await p.getByText(/ברוטו למעסיק =/).textContent()) || '';
check('הערת הדוח מציגה 40% ולא 30%', netNote.includes('40%') && !netNote.includes('30%'), netNote.trim().slice(0, 80));
check('הערת הדוח אינה מפרטת רכיבים', !/ביטוח לאומי|פנסיה|קרן השתלמות/.test(netNote), netNote.trim().slice(0, 70));

// ══ 2. principal: frontal hours drive scope, salary locked ══
await p.getByRole('button', { name: 'יציאה' }).click(); await p.waitForTimeout(300);
await p.getByText('מנהלת בית ספר').click(); await p.waitForTimeout(300);
await p.locator('select').first().selectOption({ label: 'שלהבות אשקלון' });
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(700);

check('מוצג מקרא למנהלת', await p.getByText(/אחוז המשרה מחושב מהן/).isVisible().catch(() => false));
await p.getByTitle('עריכה').first().click(); await p.waitForTimeout(400);

const numInputs = await p.locator('table input[type="number"]').count();
check('שדה השכר הרשמי אינו ניתן לעריכה למנהלת',
  !(await p.locator('table input[placeholder="—"]').count()), `${numInputs} שדות מספריים בשורה`);
check('אחוז המשרה מוצג כמחושב', await p.getByText('מחושב').first().isVisible().catch(() => false));

// שינוי שעות פרונטליות -> אחוז משרה נגזר (26 -> 13 = 50%)
// ותק(0) · פרונטלי(1) · ילדים(2) · העדרות(3) · ממ"מ(4) · תוספות(5)
const frontal = p.locator('table input[type="number"]').nth(1);
const beforeScope = (await p.locator('table tbody tr').first().textContent()) || '';
check('לפני השינוי 100%', beforeScope.includes('100%'));
await frontal.fill('13');
await p.waitForTimeout(400);
const afterScope = (await p.locator('table tbody tr').first().textContent()) || '';
check('13 שעות פרונטליות → 50% משרה', afterScope.includes('50%'), afterScope.match(/\d+%/g)?.join(' ') || '');
await frontal.fill('20');
await p.waitForTimeout(400);
const s20 = (await p.locator('table tbody tr').first().textContent()) || '';
check('20 שעות פרונטליות → 77% משרה', s20.includes('77%'), s20.match(/\d+%/g)?.join(' ') || '');

// שמירה: אחוז המשרה שנשמר הוא הנגזר
await p.getByRole('button', { name: 'שמור' }).click();
await p.waitForTimeout(600);
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('ss-months-v1'))['2026-08'][0]);
check('נשמרו השעות שהוזנו', saved.frontalHours === 20, String(saved.frontalHours));
check('נשמר אחוז המשרה הנגזר', saved.scopePct === 77, String(saved.scopePct));
check('שינוי שעות מחזיר את המורה לתור הסימולציה', saved._officialGross === null && !!saved._changedAt,
  `gross=${saved._officialGross} changedAt=${!!saved._changedAt}`);
check('נשמר snapshot לפני/אחרי לשליח', !!saved._snapshot && saved._snapshot.frontalHours === 26,
  JSON.stringify(saved._snapshot?.frontalHours));

await b.close();
console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
