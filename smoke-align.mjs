// בדיקת יישור: כל תא יושב מתחת לכותרת שלו — בשורות הנתונים ובשורת הסיכום.
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean).filter(l => !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PW = 'Align!' + Math.random().toString(36).slice(2, 9);
const EMAIL = 'align-coord@example.com';
const MONTH = '2096-04';
const SCHOOL = 'יישור בדיקה';

const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers();
  const u = data?.users?.find(x => x.email === EMAIL);
  if (u) { await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id); }
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  await admin.from('schools').delete().eq('name', SCHOOL);
}

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1450, height: 950 }, locale: 'he-IL' })).newPage();
try {
  await cleanup();
  const { data: sc } = await admin.from('schools')
    .insert({ name: SCHOOL, city: 'עיר', reform: 'ofek', hours_quota: 100 }).select().single();
  await admin.from('months').insert({ key: MONTH });
  const { data: usr } = await admin.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true });
  await admin.from('profiles').insert({ id: usr.user.id, full_name: 'בדיקת יישור', role: 'coordinator' });
  const ins = await admin.from('teacher_months').insert([
    { month_key: MONTH, school_id: sc.id, name: 'אופק שלם', reform: 'ofek', frontal_hours: 26, scope_pct: 100,
      official_gross: 12000, official_gross_pre: 9000, monthly_extras: 300 },
    { month_key: MONTH, school_id: sc.id, name: 'עולם ישן', reform: 'pre', frontal_hours: 24, scope_pct: 100,
      official_gross: 8500, monthly_extras: 0 },
    { month_key: MONTH, school_id: sc.id, name: 'בלי סימולציה', reform: 'pre', frontal_hours: 20, scope_pct: 80, monthly_extras: 0 },
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
  await p.getByText(SCHOOL).first().click();
  await p.waitForTimeout(1500);

  const probe = () => p.evaluate(() => {
    const t = document.querySelector('.sheet-scroll table');
    if (!t) return { err: 'no table' };
    const vis = el => getComputedStyle(el).display !== 'none';
    const ths = [...t.querySelectorAll('thead th')].filter(vis);
    const row = [...t.querySelectorAll('tbody tr')].find(r => r.innerText.includes('עולם ישן'));
    const foot = t.querySelector('tfoot tr');
    const cells = r => r ? [...r.querySelectorAll('td')].filter(vis) : [];
    const box = el => { const b = el.getBoundingClientRect(); return Math.round(b.right); };
    return {
      heads: ths.map(x => x.innerText.trim().slice(0, 18)),
      headRights: ths.map(box),
      rowRights: cells(row).map(box),
      rowTexts:  cells(row).map(c => c.innerText.trim().slice(0, 12)),
      footRights: cells(foot).map(box),
      footTexts:  cells(foot).map(c => c.innerText.trim().slice(0, 14)),
      scrollW: t.parentElement.scrollWidth, clientW: t.parentElement.clientWidth,
    };
  });

  for (const mode of ['מצומצמת', 'כל העמודות']) {
    if (mode === 'כל העמודות') { await p.getByRole('button', { name: /כל העמודות/ }).click(); await p.waitForTimeout(600); }
    const r = await probe();
    check(`[${mode}] מספר התאים בשורה = מספר הכותרות`, r.rowRights.length === r.heads.length, `${r.rowRights.length} / ${r.heads.length}`);
    check(`[${mode}] מספר התאים בסיכום = מספר הכותרות`, r.footRights.length === r.heads.length, `${r.footRights.length} / ${r.heads.length}`);
    const off = r.headRights.map((x, i) => Math.abs(x - (r.rowRights[i] ?? -9999))).filter(d => d > 2);
    check(`[${mode}] כל תא יושב מתחת לכותרת שלו`, off.length === 0, off.length ? `${off.length} עמודות מוסטות` : '');
    const foff = r.headRights.map((x, i) => Math.abs(x - (r.footRights[i] ?? -9999))).filter(d => d > 2);
    check(`[${mode}] שורת הסיכום מיושרת`, foff.length === 0, foff.length ? `${foff.length} עמודות מוסטות` : '');
    const iTotal = r.heads.findIndex(h => h.includes('סה״כ למעסיק') || h.includes('סה"כ למעסיק'));
    check(`[${mode}] "סה״כ למעסיק" קיים ומחושב בשורה`, iTotal >= 0 && /\d/.test(r.rowTexts[iTotal] || ''), `${r.heads[iTotal]} = ${r.rowTexts[iTotal]}`);
    check(`[${mode}] "סה״כ למעסיק" מסוכם בתחתית`, iTotal >= 0 && /\d/.test(r.footTexts[iTotal] || ''), `${r.footTexts[iTotal]}`);
    console.log(`      רוחב: ${r.clientW} מתוך ${r.scrollW} · עמודות: ${r.heads.length}`);
    console.log('      ' + r.heads.map((h, i) => `${h}=${r.rowTexts[i]}`).join(' | '));
    await p.screenshot({ path: `align-${mode === 'מצומצמת' ? 'compact' : 'all'}.png` });
  }

  // ══ הדפסה: דוח השכר על נייר ══
  await p.getByRole('button', { name: /דוח שכר/ }).click();
  await p.waitForTimeout(1200);
  await p.emulateMedia({ media: 'print' });
  await p.waitForTimeout(300);
  await p.pdf({ path: 'print-report.pdf', printBackground: true, preferCSSPageSize: true });
  const printBox = await p.evaluate(() => {
    const el = document.querySelector('.print-sheet');
    if (!el) return { err: 'אין .print-sheet' };
    const cs = getComputedStyle(el);
    const tbl = document.querySelector('.print-sheet table');
    return { position: cs.position, overflow: cs.overflow,
             docH: document.documentElement.scrollHeight,
             tableH: tbl ? Math.round(tbl.getBoundingClientRect().height) : 0,
             thead: tbl ? getComputedStyle(tbl.querySelector('thead')).display : '' };
  });
  check('חלון הדוח אינו שכבה צפה בהדפסה', printBox.position === 'static', JSON.stringify(printBox));
  check('כותרת הטבלה חוזרת בכל עמוד', printBox.thead === 'table-header-group', printBox.thead);
  check('הדף גבוה ממסך אחד — התוכן זורם לעמודים', printBox.docH > 900, String(printBox.docH));
  await p.emulateMedia({ media: 'screen' });
} catch (e) { check('הבדיקה רצה', false, e.message); }
finally { await cleanup(); await b.close(); }
console.log(fails.length ? `\n${fails.length} נכשלו` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
