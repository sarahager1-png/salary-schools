// שני השלבים במסך הסימולציה. הבדיקה כאן נועדה לשמור על דבר אחד:
// Enter בשלב הראשון מעביר את הסמן לשלב השני. כשזה לא קרה, המספר
// השני נדבק לסוף הראשון, נשמר, ועבר את מסך האישור בלי חסימה.
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const PW = 'Step!' + Math.random().toString(36).slice(2, 9);
const EMAIL = 'step-clerk@example.com';
const MONTH = '2097-07';
const SCHOOL = 'שלבים בדיקה';

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
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' })).newPage();

try {
  await cleanup();
  const { data: sc } = await admin.from('schools').insert({ name: SCHOOL, reform: 'ofek', hours_quota: 400 }).select().single();
  await admin.from('months').insert({ key: MONTH });
  const { data: u } = await admin.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true });
  await admin.from('profiles').insert({ id: u.user.id, full_name: 'חשבת שלבים', role: 'clerk' });
  const { data: row } = await admin.from('teacher_months').insert({
    month_key: MONTH, school_id: sc.id, name: 'מורת שלבים', reform: 'ofek',
    frontal_hours: 24, scope_pct: 92, seniority: 7, grade: 5, degree: 'BA',
    level: 'middle', age_group: 'age50', gamul_role: 'homeroom2',
    changed_at: new Date().toISOString(),   // בלעדיו השורה אינה ממתינה לסימולציה
  }).select().single();

  await p.goto('http://localhost:5190/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.getByPlaceholder('name@reshetch.org.il').fill(EMAIL);
  await p.locator('input[type="password"]').fill(PW);
  await p.getByRole('button', { name: /כניסה למערכת/ }).click();
  await p.getByText('מורת שלבים').first().waitFor({ timeout: 15000 });
  check('החשבת נחתה במסך הסימולציה עם המורה הממתינה', true);

  await p.getByText('מורת שלבים').first().click();
  const f1 = p.getByPlaceholder('שכר משולב ממחשבון העולם הישן');
  const f2 = p.getByPlaceholder('שכר משולב ממחשבון אופק חדש');
  await f1.waitFor({ timeout: 10000 });

  // ── הנתונים שהמחשבון הרשמי מבקש ──
  const card = p.locator('.apple-card').filter({ hasText: 'מורת שלבים' }).first();
  for (const [label, expect] of [['% משרה','92%'], ['פרונטלי','24'], ['שלב','חטיבת ביניים'], ['גיל','50'], ['גמול','מחנך']]) {
    const txt = await card.innerText();
    const ok = txt.includes(expect);
    check(`הכרטיס מציג ${label}`, ok, ok ? '' : expect + ' לא נמצא');
  }

  // ── Enter מעביר לשלב השני ──
  await f1.click();
  await p.keyboard.type('9500');
  await p.keyboard.press('Enter');
  const focused = await p.evaluate(() => document.activeElement?.placeholder || '');
  check('Enter העביר את הסמן לשלב השני', focused.includes('אופק חדש'), 'הסמן ב: ' + focused);

  await p.keyboard.type('12500');
  check('שלב 1 נשאר 9500', (await f1.inputValue()) === '9500', await f1.inputValue());
  check('שלב 2 קיבל 12500', (await f2.inputValue()) === '12500', await f2.inputValue());

  // ── Enter מהשלב השני שומר ──
  await p.keyboard.press('Enter');
  await p.waitForTimeout(2500);
  const { data: saved } = await admin.from('teacher_months')
    .select('official_gross, official_gross_pre').eq('id', row.id).single();
  check('נשמר בסיס עולם ישן 9,500', saved.official_gross_pre === 9500, String(saved.official_gross_pre));
  check('ונשמר אופק 12,500',        saved.official_gross === 12500,     String(saved.official_gross));
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 160));
} finally {
  await b.close();
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
