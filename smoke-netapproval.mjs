import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';

const SCHOOLS = [
  { id: 's1', name: 'שלהבות אשקלון', city: 'אשקלון', reform: 'ofek' },
  { id: 's2', name: 'בית חינוך רעננה', city: 'רעננה', reform: 'ofek' },
];
const mk = (o) => ({
  schoolId: 's1', tzId: '039485712', email: 't@x.org', reform: 'ofek', level: 'elementary',
  grade: 5, degree: 'BA', seniority: 12, frontalHours: 26, scopePct: 100, scope: 100,
  role: 'none', ageGroup: 'none', isTemp: false, scopeChanges: [], childrenUnder18: 0,
  _files: [], sickFiles: [], absenceDays: 0, mmHours: 0, mmFor: '', monthlyExtras: 0,
  _officialGrossPre: 11200, _officialGross: 12500, _agreedGross: null, _actualEmployerCost: null,
  _changedAt: null, _approved: true, _approvedAt: '2026-08-20T10:00:00.000Z', _snapshot: null,
  _netApproved: false, _netApprovedAt: null, ...o,
});

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' })).newPage();
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };
const read = (mk2 = '2026-08') => p.evaluate((k) => JSON.parse(localStorage.getItem('ss-months-v1'))[k] || [], mk2);
const seed = async (months, role) => {
  await p.evaluate(([s, m]) => {
    localStorage.setItem('ss-schools-v2', JSON.stringify(s));
    localStorage.setItem('ss-months-v1', JSON.stringify(m));
    localStorage.setItem('ss-seeded-v1', '1');
    localStorage.setItem('ss-reform-fix-v1', '1');
    localStorage.setItem('ss-principal-rows-v1', '1');
  }, [SCHOOLS, months]);
  await p.reload(); await p.waitForTimeout(400);
  if (role) { await p.getByText(role, { exact: true }).click(); await p.waitForTimeout(250); }
  await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(700);
};
const THREE = [
  mk({ id: 't1', name: 'חנה לוי' }),
  mk({ id: 't2', name: 'מרים כהן' }),
  mk({ id: 't3', name: 'דבורה אברמסון', schoolId: 's2' }),
];

await p.goto('http://localhost:5190/');

// ══ 1. רינה רואה את מה שהשליח אישר ══
await seed({ '2026-08': THREE }, 'רינה אלהרר');
check('נכנסת כמאשרת רשתית', (await p.locator('body').innerText()).includes('אישור רשתי'));
check('מוצגות שלוש הממתינות', (await p.locator('body').innerText()).includes('3 עובדות ממתינות'),
  (await p.locator('body').innerText()).slice(0, 140).replace(/\n/g, ' | '));
check('מקובץ לפי בתי ספר', await p.getByText('שלהבות אשקלון').isVisible() && await p.getByText('בית חינוך רעננה').isVisible());

// ══ 2. אישור מורה בודדת ══
p.on('dialog', d => d.accept());
await p.getByText('הצג פירוט').first().click(); await p.waitForTimeout(400);
await p.getByRole('button', { name: 'אישור', exact: true }).first().click(); await p.waitForTimeout(700);
let now = await read();
check('אושרה מורה אחת בלבד', now.filter(x => x._netApproved).length === 1,
  String(now.filter(x => x._netApproved).length));
check('נרשם מועד האישור', !!now.find(x => x._netApproved)._netApprovedAt);

// ══ 3. אישור בית ספר שלם ══
await seed({ '2026-08': THREE }, 'רינה אלהרר');
await p.getByRole('button', { name: 'אישור בית הספר' }).first().click(); await p.waitForTimeout(700);
now = await read();
const s1 = now.filter(x => x.schoolId === 's1');
check('כל בית הספר אושר', s1.every(x => x._netApproved), s1.map(x => x._netApproved).join(','));
check('בית הספר השני לא נגע', !now.find(x => x.schoolId === 's2')._netApproved);

// ══ 4. אישור כל הרשת ══
await seed({ '2026-08': THREE }, 'רינה אלהרר');
await p.getByRole('button', { name: 'אישור כל הרשת' }).click(); await p.waitForTimeout(800);
now = await read();
check('כל הרשת אושרה', now.every(x => x._netApproved), now.map(x => x._netApproved).join(','));
check('המסך מתרוקן', await p.getByText('אין מה לאשר כרגע').isVisible().catch(() => false));

// ══ 5. רק מי שהשליח אישר מגיעה לרינה ══
await seed({ '2026-08': [
  mk({ id: 't1', name: 'אושרה בידי השליח' }),
  mk({ id: 't2', name: 'ממתינה לשליח', _approved: false, _changedAt: '2026-08-21T10:00:00.000Z' }),
  mk({ id: 't3', name: 'ממתינה לסימולציה', _approved: false, _changedAt: '2026-08-21T10:00:00.000Z', _officialGross: null, _officialGrossPre: null }),
] }, 'רינה אלהרר');
check('רק מי שאושרה בידי השליח ממתינה לרינה',
  (await p.locator('body').innerText()).includes('1 עובדות ממתינות'),
  (await p.locator('body').innerText()).slice(0, 120).replace(/\n/g, ' | '));

// ══ 6. חודש שני — אין צורך באישור רשתי ══
await seed({ '2026-08': THREE.map(x => ({ ...x, _netApproved: true })), '2026-09': THREE }, 'רינה אלהרר');
check('בחודש השני אין צורך באישור', await p.getByText(/אין צורך באישור רשתי/).isVisible().catch(() => false),
  (await p.locator('body').innerText()).slice(0, 130).replace(/\n/g, ' | '));

// ══ 7. מה שהשליח רואה ══
await seed({ '2026-08': THREE });
check('השליח רואה כמה ממתינות אצל רינה',
  (await p.locator('body').innerText()).includes('אצל רינה אלהרר'),
  (await p.locator('body').innerText()).slice(0, 120).replace(/\n/g, ' | '));
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(600);
check('בטבלה מסומן "אצל רינה אלהרר"',
  await p.locator('table').getByText(/אצל רינה אלהרר/).first().isVisible().catch(() => false));
check('אין עדיין תג "מאושר"', !(await p.getByText('מאושר', { exact: true }).first().isVisible().catch(() => false)));

// אחרי אישור רינה — מסומן מאושר
await seed({ '2026-08': THREE.map(x => ({ ...x, _netApproved: true })) });
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(600);
check('אחרי האישור הרשתי מסומן "מאושר"',
  await p.getByText('מאושר', { exact: true }).first().isVisible().catch(() => false));

// ══ 8. נתוני העסקה לחתימה — רק אחרי האישור הרשתי ══
await seed({ '2026-08': THREE });
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(600);
check('לפני האישור הרשתי אין כפתור נתוני העסקה',
  (await p.getByTitle('נתוני העסקה לחתימת העובדת').count()) === 0);

await seed({ '2026-08': THREE.map(x => ({ ...x, _netApproved: true })) });
await p.getByText('שלהבות אשקלון').first().click(); await p.waitForTimeout(600);
check('אחרי האישור הכפתור מופיע', (await p.getByTitle('נתוני העסקה לחתימת העובדת').count()) > 0);
await p.getByTitle('נתוני העסקה לחתימת העובדת').first().click(); await p.waitForTimeout(500);
const doc = await p.locator('.apple-card').filter({ hasText: 'נתוני העסקה' }).first().innerText();
check('המסמך נושא את שם העובדת ות.ז.', doc.includes('חנה לוי') && doc.includes('039485712'), doc.slice(0, 60));
check('מציג שעות ואחוז משרה', doc.includes('26') && doc.includes('100%'));
check('מציג בסיס, תוספת וברוטו', doc.includes('11,200') && doc.includes('1,300') && doc.includes('12,500'));
check('אין בו עלות מעסיק — זה לא עניינה של העובדת', !doc.includes('17,370') && !doc.includes('למעסיק'));
check('יש הצהרה ומקום חתימה', doc.includes('אני החתומה מטה') && doc.includes('חתימת העובדת'));
check('מסויג מפורשות מטופס 101', doc.includes('אינו מחליף טופס 101'));

await b.close();
console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
