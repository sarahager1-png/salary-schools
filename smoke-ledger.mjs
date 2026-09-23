// מסך "תקבולים ותשלומים" (שרה, 23.9): רישום חודשי של מה שהתקבל ממשרד
// החינוך ומה ששולם מבית חב"ד, והפער שנותר על הרשת — עם סיכום חודשים.
// הבדיקה רושמת שני חודשים, מוודאת שהפער מחושב נכון בכל אחד, שבחירת
// שני החודשים מסכמת אותם, ושהקבצים יורדים עם אותם מספרים.
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean).filter(l => !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PW = 'Ledg!' + Math.random().toString(36).slice(2, 9);
const EMAIL = 'ledger-coord@example.com';
const M1 = '2096-07', M2 = '2096-08';
const SCHOOL = 'סניף פנקס בדיקה';

const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };
const numOf = s => Number(String(s).replace(/[^\d-]/g, '')) || 0;

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers();
  const u = data?.users?.find(x => x.email === EMAIL);
  if (u) { await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id); }
  const { data: sc } = await admin.from('schools').select('id').eq('name', SCHOOL).maybeSingle();
  if (sc) {
    await admin.from('school_payment_ledger').delete().eq('school_id', sc.id);
    await admin.from('school_finance').delete().eq('school_id', sc.id);
  }
  for (const m of [M1, M2]) await admin.from('teacher_months').delete().eq('month_key', m);
  for (const m of [M1, M2]) await admin.from('months').delete().eq('key', m);
  if (sc) await admin.from('schools').delete().eq('id', sc.id);
}

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1450, height: 950 }, locale: 'he-IL', acceptDownloads: true })).newPage();
try {
  await cleanup();
  const { data: sc } = await admin.from('schools')
    .insert({ name: SCHOOL, city: 'עיר', reform: 'ofek', hours_quota: 100 }).select().single();
  for (const m of [M1, M2]) await admin.from('months').insert({ key: m });
  const { data: usr } = await admin.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true });
  await admin.from('profiles').insert({ id: usr.user.id, full_name: 'בדיקת פנקס', role: 'coordinator' });
  // אותן עובדות בשני החודשים — עלות חודשית זהה, כדי שהסיכום יהיה כפול
  const seed = m => ([
    { month_key: m, school_id: sc.id, name: 'מורה א', reform: 'ofek', frontal_hours: 26, scope_pct: 100, official_gross: 12000, monthly_extras: 0 },
    { month_key: m, school_id: sc.id, name: 'מורה ב', reform: 'pre',  frontal_hours: 24, scope_pct: 100, official_gross: 8500,  monthly_extras: 0 },
  ]);
  for (const m of [M1, M2]) {
    const ins = await admin.from('teacher_months').insert(seed(m));
    if (ins.error) throw new Error('seed ' + m + ': ' + ins.error.message);
  }

  await p.goto('http://localhost:5190/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.getByPlaceholder('name@reshetch.org.il').fill(EMAIL);
  await p.locator('input[type="password"]').fill(PW);
  await p.getByRole('button', { name: /כניסה למערכת/ }).click();
  await p.waitForTimeout(3000);
  await p.selectOption('select[title="בחירת חודש"]', M1).catch(() => {});
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: /תקבולים ותשלומים/ }).click();
  await p.waitForTimeout(2000);

  const read = () => p.evaluate((name) => {
    const table = document.querySelector('.fin-table');
    if (!table) return { err: 'אין טבלה' };
    const cells = r => [...r.querySelectorAll('td')].map(c => c.innerText.trim());
    const row = [...table.querySelectorAll('tbody tr')].find(r => r.innerText.includes(name));
    return {
      heads: [...table.querySelectorAll('thead th')].map(x => x.innerText.trim()),
      row: row ? cells(row) : null,
      inputs: row ? [...row.querySelectorAll('input')].length : 0,
      foot: table.querySelector('tfoot tr') ? cells(table.querySelector('tfoot tr')) : null,
      period: document.body.innerText.match(/חודשים\s*·\s*([^\n]+)/)?.[1] || '',
      scrollW: table.parentElement.scrollWidth, clientW: table.parentElement.clientWidth,
    };
  }, SCHOOL);

  let t = await read();
  if (t.err) throw new Error(t.err);
  check('המסך נטען עם 5 עמודות', t.heads.length === 5, t.heads.join(' | '));
  check('חודש אחד נבחר → התאים ניתנים להקלדה', t.inputs === 2, `${t.inputs} שדות`);
  check('הטבלה נכנסת ברוחב בלי גלילה', t.scrollW <= t.clientW + 2, `${t.scrollW} מול ${t.clientW}`);

  const costMonth = numOf(t.row[1]);
  check('עלות התקופה מחושבת', costMonth > 0, String(costMonth));

  // ── רישום החודש הראשון ──
  const row = p.locator('.fin-table tbody tr').filter({ hasText: SCHOOL }).first();
  await row.locator('input[type="number"]').nth(0).fill('20000');
  await row.locator('input[type="number"]').nth(0).blur();
  await p.waitForTimeout(800);
  await row.locator('input[type="number"]').nth(1).fill('5000');
  await row.locator('input[type="number"]').nth(1).blur();
  await p.waitForTimeout(1200);

  t = await read();
  check('הפער = עלות − משרד − בית חב"ד',
    Math.abs(numOf(t.row[4]) - (costMonth - 20000 - 5000)) <= 2,
    `${t.row[4]} מול ${Math.round(costMonth - 20000 - 5000)}`);

  // ── רישום החודש השני ──
  await p.getByRole('button', { name: new RegExp(`^✓?\\s*${'יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר|ינואר|פברואר|מרץ|אפריל|מאי|יוני'}`) }).first().waitFor({ timeout: 5000 }).catch(() => {});
  const monthBtns = p.locator('.apple-card button.apple-btn-ghost');
  // כיבוי החודש הראשון והדלקת השני — לפי סדר המפתחות בטבלה
  await p.evaluate(() => {
    const btns = [...document.querySelectorAll('.apple-card button')].filter(b => /^✓?\s*\S+\s+\d{4}$/.test(b.innerText.trim()));
    btns.find(b => b.innerText.startsWith('✓'))?.click();      // כיבוי הנבחר
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const btns = [...document.querySelectorAll('.apple-card button')].filter(b => /^✓?\s*\S+\s+\d{4}$/.test(b.innerText.trim()));
    btns[btns.length - 1]?.click();                             // הדלקת האחרון
  });
  await p.waitForTimeout(1200);

  t = await read();
  check('מעבר לחודש השני — התאים עדיין להקלדה', t.inputs === 2, `${t.inputs} שדות`);
  check('החודש השני ריק', numOf(t.row[2]) === 0 && numOf(t.row[3]) === 0, `${t.row[2]} / ${t.row[3]}`);

  const row2 = p.locator('.fin-table tbody tr').filter({ hasText: SCHOOL }).first();
  await row2.locator('input[type="number"]').nth(0).fill('30000');
  await row2.locator('input[type="number"]').nth(0).blur();
  await p.waitForTimeout(800);
  await row2.locator('input[type="number"]').nth(1).fill('7000');
  await row2.locator('input[type="number"]').nth(1).blur();
  await p.waitForTimeout(1200);

  // ── סיכום שני החודשים ──
  await p.getByRole('button', { name: 'כל החודשים' }).click();
  await p.waitForTimeout(1200);
  t = await read();
  check('שני חודשים נבחרו → קריאה בלבד, בלי שדות', t.inputs === 0, `${t.inputs} שדות`);
  check('סכום משרד החינוך על שני החודשים', numOf(t.row[2]) === 50000, t.row[2]);
  check('סכום בית חב"ד על שני החודשים', numOf(t.row[3]) === 12000, t.row[3]);
  check('עלות התקופה = פי שניים מחודש אחד',
    Math.abs(numOf(t.row[1]) - costMonth * 2) <= 2, `${t.row[1]} מול ${Math.round(costMonth * 2)}`);
  check('הפער המסוכם = עלות התקופה − 50,000 − 12,000',
    Math.abs(numOf(t.row[4]) - (costMonth * 2 - 62000)) <= 2,
    `${t.row[4]} מול ${Math.round(costMonth * 2 - 62000)}`);
  check('שורת הסיכום מסתדרת',
    Math.abs((numOf(t.foot[1]) - numOf(t.foot[2]) - numOf(t.foot[3])) - numOf(t.foot[4])) <= 2, t.foot.join(' | '));

  // ── הקבצים ──
  await p.evaluate(() => {
    window.__pdfHtml = null;
    const orig = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
    Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
      set(v) { window.__pdfHtml = v; orig.set.call(this, v); }, get() { return orig.get.call(this); },
    });
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
    check('לוגו הרשת ב-PDF', html.includes('logo-chabad.png'));
    check('המסמך מוגדר להדפסה לרוחב', /@page\s*\{\s*size:\s*A4 landscape/.test(html));
    check('הסניף ב-PDF', html.includes(SCHOOL));
    check('התקופה בכותרת ה-PDF', /2 חודשים/.test(html), (html.match(/class="sub">([^<]*)/) || [])[1] || '');
    fs.writeFileSync('_ledger-preview.html', html.replace(/src="[^"]*logo-chabad/, 'src="http://localhost:5190/logo-chabad'));
  }

  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 15000 }),
    p.getByRole('button', { name: /הורדה לאקסל/ }).click(),
  ]);
  await dl.saveAs('_ledger.xlsx');
  const XLSX = (await import('xlsx')).default ?? await import('xlsx');
  const wb = XLSX.read(fs.readFileSync('_ledger.xlsx'));
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  check('שם קובץ האקסל כולל את התקופה', dl.suggestedFilename().includes(M1) && dl.suggestedFilename().includes(M2),
    dl.suggestedFilename());
  check('הגיליון מימין לשמאל', wb.Workbook?.Views?.[0]?.RTL === true);
  const xr = aoa.find(x => x[0] === SCHOOL);
  check('שורת הסניף באקסל', !!xr, xr ? xr.join(' | ') : 'לא נמצאה');
  check('המספרים באקסל תואמים למסך', !!xr && xr[2] === 50000 && xr[3] === 12000, xr ? `${xr[2]} / ${xr[3]}` : '');
  check('המספרים באקסל הם מספרים', !!xr && xr.slice(1).every(v => typeof v === 'number'),
    xr ? xr.slice(1).map(v => typeof v).join(',') : '');

  // ── הנתונים נשמרו במסד, לא רק במסך ──
  const { data: saved } = await admin.from('school_payment_ledger')
    .select('month_key, ministry_received, chabad_paid').eq('school_id', sc.id).order('month_key');
  check('שתי שורות נשמרו במסד', (saved || []).length === 2, JSON.stringify(saved));
  check('הסכומים במסד נכונים',
    Number(saved?.[0]?.ministry_received) === 20000 && Number(saved?.[1]?.ministry_received) === 30000,
    JSON.stringify(saved));

  // ── צילומים ──
  const shot = async (name, w, h) => {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `_ledger_${name}.png` });
  };
  await shot('desktop', 1450, 950);
  await shot('sara', 1000, 440);
  await shot('mobile', 390, 780);
  const mob = await p.evaluate(() => {
    const c = [...document.querySelectorAll('.only-mobile .mcard')].find(x => x.innerText.includes('פער לתשלום הרשת'));
    return c ? c.innerText.split('\n').filter(Boolean).join(' · ') : null;
  });
  check('בנייד יש כרטיס פנקס', !!mob, mob || 'אין');

  await p.setViewportSize({ width: 1450, height: 950 });
  const prev = await (await b.newContext({ locale: 'he-IL' })).newPage();
  await prev.goto('file:///' + process.cwd().replace(/\\/g, '/') + '/_ledger-preview.html');
  await prev.waitForTimeout(1200);
  await prev.screenshot({ path: '_ledger_pdf.png', fullPage: true });
} catch (e) {
  check('ריצה ללא שגיאה', false, e.message);
} finally {
  await cleanup();
  await b.close();
}
console.log(fails.length ? `\n${fails.length} כשלים: ${fails.join(', ')}` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
