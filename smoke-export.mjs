import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-dl-'));
const SCHOOLS = [
  { id: 's1', name: 'שלהבות אשקלון', city: 'אשקלון' },
  { id: 's2', name: 'בית חינוך רעננה', city: 'רעננה' },
];
const base = {
  schoolId: 's1', tzId: '039485712', email: 't@x.org', reform: 'ofek', level: 'elementary',
  degree: 'BA', seniority: 8, frontalHours: 26, scopePct: 100, scope: 100, role: 'none',
  ageGroup: 'none', isTemp: false, scopeChanges: [], childrenUnder18: 2, _files: [],
  sickFiles: [], absenceDays: 0, mmHours: 0, mmFor: '', monthlyExtras: 0,
  _officialGrossPre: null, _snapshot: null, _changedAt: null, _approved: false,
};
const TEACHERS = [
  { ...base, id: 't1', name: 'לוי, חנה', grade: 5, _officialGross: 12500, _approved: true },
  { ...base, id: 't2', name: 'מרים כהן', grade: 3, absenceDays: 2, mmHours: 4, mmFor: 'לוי, חנה', monthlyExtras: 350 },
  { ...base, id: 't3', name: 'שרה "שרי" גולד', schoolId: 's2', grade: 7, _officialGross: 15800 },
];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL', acceptDownloads: true });
const p = await ctx.newPage();
const fails = [];
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails.push(n); };

const grab = async (fn) => {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), fn()]);
  const f = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(f);
  return { name: dl.suggestedFilename(), text: fs.readFileSync(f, 'utf8') };
};

await p.goto('http://localhost:5190/');
await p.evaluate(([s, ts]) => {
  localStorage.setItem('ss-schools-v2', JSON.stringify(s));
  localStorage.setItem('ss-months-v1', JSON.stringify({ '2026-08': ts }));
}, [SCHOOLS, TEACHERS]);
await p.reload(); await p.waitForTimeout(400);
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(400);

// ══ 1. backup export ══
const bk = await grab(async () => {
  await p.getByRole('button', { name: 'גיבוי' }).click();
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'ייצוא גיבוי מלא' }).click();
});
check('גיבוי — הקובץ ירד', /^גיבוי_שכר_\d{4}-\d{2}-\d{2}\.json$/.test(bk.name), bk.name);
let parsed = null;
try { parsed = JSON.parse(bk.text); } catch { /* ignore */ }
check('גיבוי — JSON תקין', !!parsed);
check('גיבוי — מכיל את כל בתי הספר', parsed?.schools?.length === 2);
check('גיבוי — מכיל את כל רשומות המורים', parsed?.counts?.teacherRecords === 3, String(parsed?.counts?.teacherRecords));
check('גיבוי — נושא חתימת אפליקציה וגרסה', parsed?.app === 'salary-schools' && parsed?.version === 1);

// ══ 2. restore round-trip ══
const bkFile = path.join(OUT, bk.name);
await p.getByRole('button', { name: 'סגירה' }).last().click();
await p.waitForTimeout(300);
// wipe one school, then restore
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('ss-schools-v2'));
  localStorage.setItem('ss-schools-v2', JSON.stringify(s.slice(0, 1)));
  localStorage.setItem('ss-months-v1', JSON.stringify({ '2026-08': [] }));
});
await p.reload(); await p.waitForTimeout(400);
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(400);
const before = await p.evaluate(() => JSON.parse(localStorage.getItem('ss-schools-v2')).length);
const acceptAll = d => d.accept();          // confirm השחזור, ואז "השחזור הושלם"
p.on('dialog', acceptAll);
await p.getByRole('button', { name: 'גיבוי' }).click();
await p.waitForTimeout(300);
await p.locator('input[type="file"]').setInputFiles(bkFile);
await p.waitForTimeout(1200);
const after = await p.evaluate(() => ({
  schools: JSON.parse(localStorage.getItem('ss-schools-v2')).length,
  teachers: JSON.parse(localStorage.getItem('ss-months-v1'))['2026-08'].length,
}));
check('שחזור — בתי הספר חזרו', before === 1 && after.schools === 2, `${before} → ${after.schools}`);
check('שחזור — המורים חזרו', after.teachers === 3, String(after.teachers));
p.off('dialog', acceptAll);

// ══ 3. reject a bad file ══
const badFile = path.join(OUT, 'bad.json');
fs.writeFileSync(badFile, JSON.stringify({ app: 'something-else', schools: [] }), 'utf8');
await p.getByRole('button', { name: 'גיבוי' }).click();
await p.waitForTimeout(300);
await p.locator('input[type="file"]').setInputFiles(badFile);
await p.waitForTimeout(600);
check('שחזור — קובץ זר נדחה עם הודעה',
  await p.getByText('זה לא קובץ גיבוי של מערכת השכר.').isVisible().catch(() => false));
const stillThere = await p.evaluate(() => JSON.parse(localStorage.getItem('ss-schools-v2')).length);
check('שחזור — קובץ זר לא דרס נתונים', stillThere === 2, String(stillThere));
await p.getByRole('button', { name: 'סגירה' }).last().click();
await p.waitForTimeout(300);

// ══ 4. school CSV ══
await p.getByText('שלהבות אשקלון').first().click();
await p.waitForTimeout(500);
const csv = await grab(() => p.getByRole('button', { name: 'ייצוא CSV' }).click());
check('CSV בית ספר — ירד', csv.name.endsWith('.csv'), csv.name);
check('CSV בית ספר — BOM לאקסל', csv.text.charCodeAt(0) === 0xFEFF);
const lines = csv.text.replace(/^\uFEFF/, '').split('\r\n');
check('CSV בית ספר — כותרת + 2 מורות + סה"כ', lines.length === 4, `${lines.length} שורות`);
check('CSV בית ספר — שם עם פסיק עוטף במרכאות', lines[1].startsWith('"לוי, חנה"'), lines[1].slice(0, 24));
check('CSV בית ספר — מסמן רשמי מול אומדן',
  lines[1].includes('רשמי') && lines[2].includes('טרם הורצה סימולציה'));
check('CSV בית ספר — שורת סה"כ', lines[3].includes('מורות עם שכר רשמי'), lines[3].slice(0, 42));
check('CSV בית ספר — מרכאות בתוך ערך מוכפלות כנדרש', csv.text.includes('"שרה ""שרי"" גולד"') === false && lines[3].includes('""'));

// ══ 5. absence CSV ══
const abs = await grab(async () => {
  await p.getByRole('button', { name: /ממ"מ והעדרויות/ }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'ייצוא CSV' }).last().click();
});
check('CSV העדרויות — ירד', abs.name.endsWith('.csv'), abs.name);
check('CSV העדרויות — כולל את המורה עם ההעדרות', abs.text.includes('מרים כהן'));
await p.locator('button[title="סגירה"]').last().click();
await p.waitForTimeout(400);

// ══ 6. network report CSV ══
await p.getByRole('button', { name: 'דוח רשת' }).click();
await p.waitForTimeout(500);
const net = await grab(() => p.getByRole('button', { name: 'ייצוא CSV' }).click());
check('CSV דוח רשת — ירד', /^דוח_רשת_\d{4}-\d{2}-\d{2}\.csv$/.test(net.name), net.name);
check('CSV דוח רשת — שני בתי ספר + סה"כ', net.text.replace(/^\uFEFF/, '').split('\r\n').length === 4);
check('CSV דוח רשת — עמודת "מתוכן עם שכר רשמי"', net.text.includes('מתוכן עם שכר רשמי'));
check('דוח רשת — מציג כמה מורות באמת רשמיות',
  await p.getByText('(1 רשמי)').first().isVisible().catch(() => false));

await b.close();
fs.rmSync(OUT, { recursive: true, force: true });
console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
