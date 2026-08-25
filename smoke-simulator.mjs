import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';

const SCHOOLS = [
  { id: 's1', name: 'שלהבות אשקלון', city: 'אשקלון', reform: 'ofek' },
  { id: 's2', name: 'בית חינוך רעננה', city: 'רעננה', reform: 'pre' },
];
const base = {
  tzId: '039485712', email: 't@x.org', level: 'elementary', degree: 'MA', seniority: 8,
  frontalHours: 26, scopePct: 100, scope: 100, role: 'none', ageGroup: 'none', isTemp: false,
  scopeChanges: [], childrenUnder18: 0, _files: [], sickFiles: [], absenceDays: 0, mmHours: 0,
  mmFor: '', monthlyExtras: 0, _officialGross: null, _officialGrossPre: null,
  _changedAt: '2026-08-20T10:00:00.000Z', _approved: false,
};
const TEACHERS = [
  { ...base, id: 't1', schoolId: 's1', name: 'חנה לוי',  reform: 'ofek', grade: 5 },
  { ...base, id: 't2', schoolId: 's2', name: 'מרים כהן', reform: 'pre',  grade: 1 },
];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' });
const p = await ctx.newPage();
const fails = [];
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails.push(n); };
const frameSrc = () => p.locator('iframe').first().getAttribute('src');

await p.goto('http://localhost:5190/');
await p.evaluate(([s, ts]) => {
  localStorage.setItem('ss-schools-v2', JSON.stringify(s));
  localStorage.setItem('ss-months-v1', JSON.stringify({ '2026-08': ts }));
}, [SCHOOLS, TEACHERS]);
await p.reload(); await p.waitForTimeout(400);

// ── clerk goes straight to the simulator ──
await p.getByText('חשבת שכר').click(); await p.waitForTimeout(200);
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(800);

// ══ 1. named routes, not the numeric ones that redirect ══
const src0 = await frameSrc();
check('הראוט שמי ולא מספרי', /Calculators\/[A-Za-z]/.test(src0), src0);
check('ברירת המחדל היא אופק חדש', src0.endsWith('OfekHadash'), src0);

// ══ 2. picking a teacher picks her calculator ══
await p.getByText('חנה לוי').click(); await p.waitForTimeout(500);
check('מורת אופק → מחשבון OfekHadash', (await frameSrc()).endsWith('OfekHadash'), await frameSrc());
await p.getByText('מרים כהן').click(); await p.waitForTimeout(500);
check('מורת עולם ישן → מחשבון OldWorld', (await frameSrc()).endsWith('OldWorld'), await frameSrc());

// ══ 3. all four calculators reachable and named ══
for (const [label, route] of [['עוז לתמורה','OzLetmura'], ['אופק — ניהול','OfekNihul'], ['עולם ישן','OldWorld'], ['אופק חדש','OfekHadash']]) {
  await p.getByRole('button', { name: label, exact: true }).first().click();
  await p.waitForTimeout(300);
  check(`מחשבון "${label}" → ${route}`, (await frameSrc()).endsWith(route), await frameSrc());
}

// ══ 4. the official calculator really loads inside the frame ══
await p.getByText('חנה לוי').click(); await p.waitForTimeout(300);
let loaded = false;
for (let i = 0; i < 12; i++) {
  const f = p.frames().find(fr => fr.url().includes('educalc'));
  if (f) { const n = await f.locator('input, select').count().catch(() => 0); if (n > 0) { loaded = true; break; } }
  await p.waitForTimeout(1500);
}
check('המחשבון הרשמי נטען בתוך המסגרת', loaded);
check('מסך ה-fallback לא מוצג כשהטעינה הצליחה',
  !(await p.getByText('המחשבון הרשמי לא נטען').isVisible().catch(() => false)));

// ══ 5. old-world simulation field only for ofek teachers ══
await p.getByText('חנה לוי').click(); await p.waitForTimeout(400);
check('שדה סימולציית עולם ישן מוצג למורת אופק',
  await p.getByPlaceholder('שכר באותם נתונים במחשבון העולם הישן').isVisible().catch(() => false));
await p.getByPlaceholder('שכר באותם נתונים במחשבון העולם הישן').fill('11000');
await p.getByPlaceholder('שכר משולב מהסימולטור').fill('12500');
await p.getByRole('button', { name: 'שמור' }).click();
await p.waitForTimeout(600);
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('ss-months-v1'))['2026-08'].find(x => x.id === 't1'));
check('השכר הרשמי נשמר', saved._officialGross === 12500, String(saved._officialGross));
check('סימולציית העולם הישן נשמרה', saved._officialGrossPre === 11000, String(saved._officialGrossPre));
check('תוספת בית חב"ד ניתנת לחישוב', saved._officialGross - saved._officialGrossPre === 1500);

await p.getByText('מרים כהן').click(); await p.waitForTimeout(400);
check('שדה עולם ישן מוסתר למורה שכבר בעולם ישן',
  !(await p.getByPlaceholder('שכר באותם נתונים במחשבון העולם הישן').isVisible().catch(() => false)));

// ══ 6. school-level reform drives a new teacher ══
await p.evaluate(() => localStorage.removeItem('ss-user'));
await p.getByRole('button', { name: 'יציאה' }).click(); await p.waitForTimeout(300);
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(500);
await p.getByText('בית חינוך רעננה').first().click(); await p.waitForTimeout(500);
check('מסך בית הספר מציג את המסלול',
  await p.getByText(/מסלול עולם ישן/).first().isVisible().catch(() => false));
await p.getByRole('button', { name: /הוסף מורה/ }).first().click(); await p.waitForTimeout(400);
const reformSel = p.locator('select').filter({ has: p.locator('option[value="pre"]') }).first();
const newReform = await reformSel.inputValue().catch(() => '');
check('מורה חדשה יורשת את מסלול בית הספר', newReform === 'pre', newReform || '(לא נמצא)');

await b.close();
console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
