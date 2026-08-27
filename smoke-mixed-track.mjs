// שני דברים שנשברו יחד: הכפתור "הוסף מורה" מתוך מסך בית הספר, ומורה
// בעולם ישן בתוך בית ספר אופק. המסלול הוא של המורה — בית הספר רק קובע
// את ברירת המחדל — ולכן חייב להיות אפשר לשנות אותו בשורה ולראות זאת.
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const PW = 'Mix!' + Math.random().toString(36).slice(2, 9);
const EMAIL = 'mix-coord@example.com';
const MONTH = '2097-09';
const SCHOOL = 'תמהיל בדיקה';

const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers();
  const u = data?.users?.find(x => x.email === EMAIL);
  if (u) { await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id); }
  const { data: scs } = await admin.from('schools').select('id').eq('name', SCHOOL);
  for (const x of scs || []) await admin.from('teacher_months').delete().eq('school_id', x.id);
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  await admin.from('schools').delete().eq('name', SCHOOL);
}

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'he-IL' })).newPage();
const errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

try {
  await cleanup();
  const { data: sc } = await admin.from('schools').insert({ name: SCHOOL, reform: 'ofek', hours_quota: 400 }).select().single();
  await admin.from('months').insert({ key: MONTH });
  const { data: u } = await admin.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true });
  await admin.from('profiles').insert({ id: u.user.id, full_name: 'שליח תמהיל', role: 'coordinator' });

  await p.goto('http://localhost:5190/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.getByPlaceholder('name@reshetch.org.il').fill(EMAIL);
  await p.locator('input[type="password"]').fill(PW);
  await p.getByRole('button', { name: /כניסה למערכת/ }).click();
  await p.selectOption('select[title="בחירת חודש"]', MONTH).catch(() => {});
  await p.waitForTimeout(600);
  await p.getByText(SCHOOL).first().waitFor({ timeout: 15000 });

  check('בית ספר ריק מוצג כברירת מחדל, לא כעובדה',
    (await p.locator('body').innerText()).includes('ברירת מחדל: אופק חדש'));

  await p.getByText(SCHOOL).first().click();
  await p.getByRole('button', { name: /^הוספת עובד\/ת הוראה$/ }).first().waitFor({ timeout: 10000 });

  // ── הכפתור ששלח UPDATE במקום INSERT ──
  await p.getByRole('button', { name: /^הוספת עובד\/ת הוראה$/ }).first().click();
  await p.locator('tr:has(select)').first().locator('input').first().fill('מורת אופק');
  await p.getByRole('button', { name: /^שמור$/ }).click();
  await p.waitForTimeout(2500);
  const { data: t1 } = await admin.from('teacher_months').select('name, reform').eq('month_key', MONTH).eq('name', 'מורת אופק');
  check('"הוסף מורה" מתוך מסך בית הספר שומר', (t1 || []).length === 1, `${t1?.length} שורות`);
  check('וירשה את מסלול ברירת המחדל', t1?.[0]?.reform === 'ofek', t1?.[0]?.reform || '');
  check('בלי שגיאת uuid בקונסול', !errors.some(e => /uuid/i.test(e)), errors.find(e => /uuid/i.test(e)) || '');

  // ── מורה בעולם ישן בתוך בית ספר אופק ──
  await p.getByRole('button', { name: /^הוספת עובד\/ת הוראה$/ }).first().click();
  const row = p.locator('tr:has(select)').first();
  await row.locator('input').first().fill('מורת עולם ישן');
  await row.locator('select').first().selectOption('pre');
  await p.getByRole('button', { name: /^שמור$/ }).click();
  await p.waitForTimeout(2500);
  const { data: t2 } = await admin.from('teacher_months').select('name, reform').eq('month_key', MONTH).eq('name', 'מורת עולם ישן');
  check('מורה בעולם ישן נשמרת בתוך בית ספר אופק', t2?.[0]?.reform === 'pre', t2?.[0]?.reform || 'לא נשמרה');

  // ── והתמהיל מוצג במסך הראשי ──
  await p.getByRole('button', { name: /בתי הספר|חזרה/ }).first().click().catch(() => {});
  await p.goto('http://localhost:5190/');
  await p.getByText(SCHOOL).first().waitFor({ timeout: 15000 });
  // גם כאן: אחרי רענון האפליקציה חוזרת לחודש הקלנדרי אם הוא קיים
  await p.selectOption('select[title="בחירת חודש"]', MONTH).catch(() => {});
  await p.waitForTimeout(800);
  const body = await p.locator('body').innerText();
  check('כרטיס בית הספר מציג "1 אופק חדש"', body.includes('1 אופק חדש'));
  check('וגם "1 עולם ישן"',                  body.includes('1 עולם ישן'));
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 200));
} finally {
  await b.close();
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
