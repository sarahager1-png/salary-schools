// האפליקציה מול Supabase: התחברות אמיתית, נתונים מהשרת, והרשאות שנאכפות.
// מריצה מול שרת הפיתוח ב-5190 ומול הפרויקט האמיתי.
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const PW = 'AppTest!' + Math.random().toString(36).slice(2, 9);
const U = { coord: 'app-coord@example.com', clerk: 'app-clerk@example.com', prin: 'app-prin@example.com' };
const MONTH = '2097-05';
const SCHOOL = 'אפליקציה בדיקה';

const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers();
  for (const email of Object.values(U)) {
    const u = data?.users?.find(x => x.email === email);
    if (u) { await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id); }
  }
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  await admin.from('schools').delete().eq('name', SCHOOL);
}

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' })).newPage();
const login = async (email) => {
  await p.goto('http://localhost:5190/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.getByPlaceholder('name@reshetch.org.il').fill(email);
  await p.locator('input[type="password"]').fill(PW);
  await p.getByRole('button', { name: /כניסה למערכת/ }).click();
  await p.waitForTimeout(2500);
};

try {
  await cleanup();
  const { data: sc } = await admin.from('schools')
    .insert({ name: SCHOOL, city: 'עיר', reform: 'ofek', hours_quota: 100 }).select().single();
  await admin.from('months').insert({ key: MONTH });
  for (const [k, email] of Object.entries(U)) {
    const { data } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    const role = k === 'coord' ? 'coordinator' : k === 'clerk' ? 'clerk' : 'principal';
    await admin.from('profiles').insert({
      id: data.user.id, full_name: 'בדיקה ' + role, role,
      school_id: role === 'principal' ? sc.id : null,
    });
  }
  await admin.from('teacher_months').insert({
    month_key: MONTH, school_id: sc.id, name: 'מורה מהשרת',
    frontal_hours: 26, scope_pct: 100, changed_at: new Date().toISOString(),
  });

  // ══ 1. מסך התחברות ══
  await p.goto('http://localhost:5190/');
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(900);
  check('מוצג מסך התחברות עם מייל וסיסמה',
    await p.getByPlaceholder('name@reshetch.org.il').isVisible().catch(() => false));
  check('אין יותר בורר תפקידים',
    !(await p.getByText('שליח / מנהל רשת').first().isVisible().catch(() => false)));

  // ══ 2. סיסמה שגויה ══
  await p.getByPlaceholder('name@reshetch.org.il').fill(U.coord);
  await p.locator('input[type="password"]').fill('wrong-password');
  await p.getByRole('button', { name: /כניסה למערכת/ }).click();
  await p.waitForTimeout(2500);
  check('סיסמה שגויה מציגה שגיאה בעברית',
    await p.getByText('מייל או סיסמה שגויים').isVisible().catch(() => false));

  // ══ 3. שליח: רואה את הנתונים מהשרת ══
  await login(U.coord);
  const body = await p.locator('body').innerText();
  check('השליח נכנס ורואה את בתי הספר', body.includes(SCHOOL), body.slice(0, 100).replace(/\n/g, ' | '));
  check('הנתונים הגיעו מהשרת ולא מ-localStorage',
    await p.evaluate(() => !localStorage.getItem('ss-months-v1')));

  // ══ 4. הנתונים באמת מהשרת: שינוי בשרת מופיע אחרי רענון ══
  await admin.from('teacher_months').insert({
    month_key: MONTH, school_id: sc.id, name: 'נוספה בשרת', frontal_hours: 10,
  });
  await p.reload(); await p.waitForTimeout(2500);
  await p.getByText(SCHOOL).first().click(); await p.waitForTimeout(1200);
  check('שורה שנוספה בשרת מופיעה באפליקציה',
    (await p.locator('body').innerText()).includes('נוספה בשרת'));

  // ══ 5. עריכה באפליקציה נשמרת בשרת ══
  await p.getByTitle('עריכה מהירה בשורה').first().click(); await p.waitForTimeout(400);
  await p.locator('table input[type="number"]').nth(1).fill('18');
  await p.getByRole('button', { name: 'שמור' }).click();
  await p.waitForTimeout(2500);
  const { data: saved } = await admin.from('teacher_months')
    .select('name, frontal_hours, scope_pct').eq('month_key', MONTH).order('name');
  const edited = saved.find(x => x.frontal_hours === 18);
  check('העריכה נשמרה בבסיס הנתונים', !!edited, JSON.stringify(saved.map(x => x.frontal_hours)));
  check('אחוז המשרה הנגזר נשמר גם הוא', edited?.scope_pct === 69, String(edited?.scope_pct));

  // ══ 6. מנהלת רואה רק את בית ספרה, ואין לה שדות כסף ══
  await login(U.prin);
  await p.waitForTimeout(1200);
  const pBody = await p.locator('body').innerText();
  check('מנהלת נכנסת ישר לבית ספרה', pBody.includes(SCHOOL), pBody.slice(0, 90).replace(/\n/g, ' | '));
  check('למנהלת אין שדה שכר רשמי פתוח',
    (await p.locator('table input[placeholder="—"]').count()) === 0);

  // ══ 7. חשבת שכר נכנסת ישר לסימולטור ══
  await login(U.clerk);
  check('חשבת שכר נכנסת למסך הסימולציה',
    (await p.locator('iframe').count()) > 0);

  // ══ 8. יציאה ══
  await p.getByRole('button', { name: 'יציאה' }).click();
  await p.waitForTimeout(1200);
  check('יציאה מחזירה למסך ההתחברות',
    await p.getByPlaceholder('name@reshetch.org.il').isVisible().catch(() => false));
  await p.reload(); await p.waitForTimeout(1500);
  check('אחרי יציאה ורענון עדיין מנותקת',
    await p.getByPlaceholder('name@reshetch.org.il').isVisible().catch(() => false));
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 200));
} finally {
  await b.close();
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
