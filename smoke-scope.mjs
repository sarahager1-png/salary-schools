// שלב אחוזי המשרה: מי שיושבת על 100 שאיש לא בחר מגיעה לשלב הראשון,
// ומי שאחוזה נקבע יוצאת ממנו. האחוז נשמר, והחותמת נרשמת איתו.
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean).filter(l => !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PW = 'Scope!' + Math.random().toString(36).slice(2, 9);
const EMAIL = 'scope-coord@example.com';
const MONTH = '2095-03';
const SCHOOL = 'אחוזים בדיקה';

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
  await admin.from('profiles').insert({ id: usr.user.id, full_name: 'בדיקת אחוזים', role: 'coordinator' });
  const changed = new Date().toISOString();
  const ins = await admin.from('teacher_months').insert([
    // ברירת מחדל שאיש לא בחר — אמורה להגיע לשלב הראשון
    { month_key: MONTH, school_id: sc.id, name: 'אופק ברירת מחדל', reform: 'ofek',
      frontal_hours: 20, scope_pct: 100, monthly_extras: 0, changed_at: changed },
    { month_key: MONTH, school_id: sc.id, name: 'ישן ברירת מחדל', reform: 'pre',
      frontal_hours: 21, scope_pct: 100, monthly_extras: 0, changed_at: changed },
    // אחוז שנקבע — אמורה להיות מחוץ לשלב
    { month_key: MONTH, school_id: sc.id, name: 'ישן שנקבע', reform: 'pre',
      frontal_hours: 21, scope_pct: 70, monthly_extras: 0, changed_at: changed },
  ]).select();
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

  // ══ 1. מסך הסימולציה נפתח על שלב האחוזים ══
  await p.getByRole('link', { name: /סימולציה/ }).click().catch(async () => {
    await p.getByText('סימולציה', { exact: false }).first().click();
  });
  await p.waitForTimeout(1500);
  const body = () => p.locator('body').innerText();
  check('שלב אחוזי המשרה מופיע עם מונה', (await body()).includes('אחוזי משרה (2)'),
    ((await body()).match(/אחוזי משרה[^\n]*/) || [''])[0]);
  check('המסך נפתח על שלב האחוזים', (await body()).includes('שאחוז המשרה שלהן עדיין ברירת המחדל'));

  // ══ 2. מי שאחוזה נקבע אינה ברשימה ══
  const list = await body();
  check('שורת ברירת המחדל באופק ברשימה',  list.includes('אופק ברירת מחדל'));
  check('שורת ברירת המחדל בעולם ישן ברשימה', list.includes('ישן ברירת מחדל'));
  check('מי שאחוזה כבר נקבע אינה ברשימה',  !list.includes('ישן שנקבע'));

  // ══ 3. שתי המכסות נכונות: 26 באופק, 30 בעולם ישן ══
  check('אופק — מכסה 26', /20 ש׳ מתוך 26 למשרה מלאה/.test(list), (list.match(/.{0,30}למשרה מלאה/) || [''])[0]);
  check('עולם ישן — מכסה 30', /21 ש׳ מתוך 30 למשרה מלאה/.test(list));

  // ══ 4. הקלדה נשמרת, עם חותמת ══
  const card = p.locator('.apple-card').filter({ hasText: 'ישן ברירת מחדל' }).first();
  await card.locator('input[type="number"]').fill('64');
  await card.getByRole('button', { name: 'שמור' }).click();
  await p.waitForTimeout(2500);
  const { data: after } = await admin.from('teacher_months')
    .select('name, scope_pct, scope_set_at').eq('month_key', MONTH).order('name');
  const saved = after.find(x => x.name === 'ישן ברירת מחדל');
  check('האחוז שהוקלד נשמר', saved?.scope_pct === 64, String(saved?.scope_pct));
  check('נרשמה חותמת שהאחוז נקבע', !!saved?.scope_set_at, String(saved?.scope_set_at));
  check('היא ירדה מהרשימה', (await body()).includes('אחוזי משרה (1)'),
    ((await body()).match(/אחוזי משרה[^\n]*/) || [''])[0]);

  // ══ 5. "לפי השעות" מציע ואינו קובע לבד ══
  const card2 = p.locator('.apple-card').filter({ hasText: 'אופק ברירת מחדל' }).first();
  check('ההצעה מחושבת מהשעות', (await card2.innerText()).includes('לפי השעות · 77%'),
    (await card2.innerText()).replace(/\n/g, ' ').slice(0, 90));
  await card2.getByRole('button', { name: /לפי השעות/ }).click();
  await p.waitForTimeout(2500);
  const { data: after2 } = await admin.from('teacher_months')
    .select('name, scope_pct, scope_set_at').eq('month_key', MONTH).eq('name', 'אופק ברירת מחדל');
  check('לחיצה על ההצעה קובעת את האחוז', after2?.[0]?.scope_pct === 77, String(after2?.[0]?.scope_pct));
  check('כל האחוזים נקבעו', (await body()).includes('כל אחוזי המשרה נקבעו'));
} catch (e) { check('הבדיקה רצה', false, e.message); }
finally { await cleanup(); await b.close(); }
console.log(fails.length ? `\n${fails.length} נכשלו` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
