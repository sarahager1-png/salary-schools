// בדיקה ממוקדת: לחיצה על שורת בית ספר בדוח הרשת פותחת את פירוט המשרות.
// רצה מול מסד הבדיקות בלבד (test-env.mjs עוצר מול החי).
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean)
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const PW = 'PosTest!' + Math.random().toString(36).slice(2, 9);
const EMAIL = 'pos-coord@example.com';
const MONTH = '2097-06';
const SCHOOL = 'פירוט משרות בדיקה';

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers();
  const u = data?.users?.find(x => x.email === EMAIL);
  if (u) { await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id); }
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  await admin.from('schools').delete().eq('name', SCHOOL);
}

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const check = (n, ok, e = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`);

try {
  await cleanup();
  const { data: sc } = await admin.from('schools')
    .insert({ name: SCHOOL, city: 'עיר בדיקה', reform: 'ofek', hours_quota: 100 }).select().single();
  await admin.from('months').insert({ key: MONTH });
  const { data: user } = await admin.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true });
  await admin.from('profiles').insert({ id: user.user.id, full_name: 'בדיקה רכזת', role: 'coordinator', school_id: null });

  // שלוש משרות בשלושה מצבים: מאושרת, ממתינה לאישור, ממתינה לסימולציה
  const now = new Date().toISOString();
  await admin.from('teacher_months').insert([
    { school_id: sc.id, month_key: MONTH, name: 'מורה מאושרת', reform: 'pre', frontal_hours: 20,
      scope_pct: 80, scope_set_at: now, gamul_role: 'homeroom', degree: 'ba', seniority: 5,
      official_gross: 9000, changed_at: now, approved: true },
    { school_id: sc.id, month_key: MONTH, name: 'מורה לאישור', reform: 'pre', frontal_hours: 15,
      scope_pct: 60, scope_set_at: now, gamul_role: 'none', degree: 'ba', seniority: 3,
      official_gross: 7000, changed_at: now, approved: false },
    { school_id: sc.id, month_key: MONTH, name: 'מורה בלי סימולציה', reform: 'ofek', frontal_hours: 24,
      scope_pct: 100, gamul_role: 'none', degree: 'ma', seniority: 8, changed_at: now, approved: false },
  ]);

  await p.goto('http://localhost:5190/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.getByPlaceholder('name@reshetch.org.il').fill(EMAIL);
  await p.locator('input[type="password"]').fill(PW);
  await p.getByRole('button', { name: /כניסה למערכת/ }).click();
  await p.waitForTimeout(2500);
  await p.selectOption('select[title="בחירת חודש"]', MONTH).catch(() => {});
  await p.waitForTimeout(800);

  // מעבר לדוח הרשת
  await p.getByRole('button', { name: /דוח רשת/ }).first().click().catch(async () => {
    await p.getByText(/דוח רשת/).first().click();
  });
  await p.waitForTimeout(1200);
  const row = p.locator('tr', { hasText: SCHOOL }).first();
  check('שורת בית הספר מופיעה בדוח', await row.count() > 0);

  const before = await p.getByText('פירוט המשרות —').count();
  check('הפירוט סגור לפני לחיצה', before === 0);
  await row.click();
  await p.waitForTimeout(600);
  const title = p.getByText('פירוט המשרות —').first();
  check('הפירוט נפתח בלחיצה', await title.count() > 0);
  const names = await p.locator('table').last().locator('tbody tr').allInnerTexts();
  check('שלוש המשרות מופיעות', names.length === 3, names.length + ' שורות');
  console.log(names.map(x => '   · ' + x.replace(/\t/g, ' | ')).join('\n'));
  await p.screenshot({ path: 'C:/Users/PC/AppData/Local/Temp/claude/c--tmp-work/624e1074-ba30-4420-b23f-3167807447d7/scratchpad/positions.png', fullPage: true });
  await row.click();
  await p.waitForTimeout(500);
  check('לחיצה חוזרת סוגרת', await p.getByText('פירוט המשרות —').count() === 0);
  check('אין שגיאות בקונסול', errs.length === 0, errs.join(' | '));
} finally {
  await cleanup();
  await b.close();
}
