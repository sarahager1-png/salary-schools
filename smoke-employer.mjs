// הוצאות המעביד, רכיב־רכיב. קודם היה כאן מספר אחד — 40% — שאיש לא יכול
// היה להצליב מול מה שהנהלת החשבונות מוציאה בפועל.
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const PW = 'Emp!' + Math.random().toString(36).slice(2, 9);
const EMAIL = 'emp-coord@example.com';
const MONTH = '2098-01';
const SCHOOL = 'עלות מעביד בדיקה';

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
const p = await (await b.newContext({ viewport:{width:1600,height:1100}, locale:'he-IL' })).newPage();

try {
  await cleanup();
  const { data: sc } = await admin.from('schools').insert({ name: SCHOOL, reform: 'ofek', hours_quota: 400 }).select().single();
  await admin.from('months').insert({ key: MONTH });
  const { data: u } = await admin.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true });
  await admin.from('profiles').insert({ id: u.user.id, full_name: 'שליח עלות', role: 'coordinator' });
  // ותק 8 → 16 ימי הבראה. 100% משרה. אופק: בסיס 11,200, אופק 12,500 → תוספת 1,300
  await admin.from('teacher_months').insert({
    month_key: MONTH, school_id: sc.id, name: 'מורת עלות', reform: 'ofek',
    frontal_hours: 26, scope_pct: 100, seniority: 8, grade: 5, degree: 'BA', level: 'elementary',
    official_gross_pre: 11200, official_gross: 12500, changed_at: new Date().toISOString(),
  });

  await p.goto('http://localhost:5190/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.getByPlaceholder('name@reshetch.org.il').fill(EMAIL);
  await p.locator('input[type="password"]').fill(PW);
  await p.getByRole('button', { name: /כניסה למערכת/ }).click();
  await p.waitForTimeout(2000);
  // האפליקציה נשארת על החודש הקלנדרי כשהוא קיים, ולכן הבדיקה
  // בוחרת במפורש את החודש שלה.
  await p.selectOption('select[title="בחירת חודש"]', MONTH).catch(() => {});
  await p.waitForTimeout(700);
  await p.getByText(SCHOOL).first().waitFor({ timeout: 15000 });
  await p.getByText(SCHOOL).first().click();
  await p.getByText('מורת עלות').first().waitFor({ timeout: 10000 });
  // הכרטיס המלא נפתח מכפתור "פרטים מלאים" בשורה, לא מלחיצה על השם
  await p.locator('button[title^="פרטים מלאים"]').first().click();
  await p.getByText('פירוק התשלום').first().waitFor({ timeout: 10000 });

  const txt = (await p.locator('body').innerText());
  const has = (x) => txt.includes(x);

  // הפירוק עצמו
  check('בסיס עולם ישן 11,200',   has('11,200'));
  check('תוספת בית חב"ד 1,300',   has('1,300'));
  check('ברוטו לעובדת 12,500',    has('12,500'));

  // ששת הרכיבים — סכומים מחושבים ידנית מהשיעורים
  for (const [label, amount] of [
    ['פנסיה ופיצויים', '1,661'],   // 11,200 × 14.83%
    ['קרן השתלמות',    '941'],     // 11,200 × 8.4%
    ['מס שכר',         '992'],     // 13,230 × 7.5%  (כולל הבראה וביגוד)
    ['ביטוח לאומי',    '767'],     // 7,703×4.51% + 5,527×7.6%
    ['הבראה',          '561'],     // 16 ימים × 421 ÷ 12
    ['ביגוד',          '169'],     // 2,028 ÷ 12
  ]) {
    const ok = has(label) && has(amount);
    check(`${label} = ${amount} ₪`, ok, ok ? '' : (has(label) ? `הסכום ${amount} לא נמצא` : 'השורה לא נמצאה'));
  }

  check('סה"כ הוצאות מעביד 5,091', has('5,091'));       // סכום השישה
  check('סה"כ למעסיק 17,591',      has('17,591'));       // 12,500 + 5,091
  check('השיעור בפועל 40.7%',      has('40.7%'), has('40.7%') ? '' : 'לא מוצג');
  check('מזה 196 ₪ על התוספת',     has('196'), has('196') ? '' : 'החלק של התוספת לא מוצג');
  check('אין יותר "40%" קבוע',     !has('אומדן 40%'));
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 200));
} finally {
  await b.close();
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
