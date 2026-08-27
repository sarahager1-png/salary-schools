// תוספת אם — 10% על השכר הכולל, בעולם ישן.
//
// הזכאות הוצגה על המסך מאז ומעולם אבל לא נכנסה לחישוב: momBonusEligible
// שימש רק להערה. במחשבון של המשרד אין שדה לתוספת אם — כל שדות מחשבון
// העולם הישן נמנו — ולכן היא לא הגיעה גם משם. כל אם חושבה בחסר של 10%.
//
//   node smoke-mom.mjs
import fs from 'node:fs';
import { ENV_FILE, URL, ANON, SECRET } from './test-env.mjs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

const M = '2097-04', S = 'בית ספר תוספת אם', E = 'mom-coord@gmail.com', PW = 'Mo!m12345';
{ const { data: o } = await admin.from('schools').select('id').eq('name', S);
  for (const x of o || []) { await admin.from('teacher_months').delete().eq('school_id', x.id);
    await admin.from('schools').delete().eq('id', x.id); }
  await admin.from('teacher_months').delete().eq('month_key', M);
  await admin.from('months').delete().eq('key', M);
  const { data: us } = await admin.auth.admin.listUsers();
  for (const u of us.users.filter(x => x.email === E)) {
    await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id); } }

const { data: sc } = await admin.from('schools').insert({ name: S, reform: 'pre' }).select().single();
await admin.from('months').insert({ key: M });
const { data: u } = await admin.auth.admin.createUser({ email: E, password: PW, email_confirm: true });
await admin.from('profiles').insert({ id: u.user.id, full_name: 'רכזת אם', role: 'coordinator' });

const GROSS = 10000;
const base = { month_key: M, school_id: sc.id, reform: 'pre', level: 'elementary', degree: 'BA',
  grade: '1', seniority: 5, official_gross: GROSS, changed_at: new Date().toISOString(),
  phone: '0500000000', email: 'x@gmail.com' };
await admin.from('teacher_months').insert([
  // זכאית: עולם ישן, ילדים, משרה 79%+
  { ...base, name: 'אם זכאית',        children_under_18: 3, scope_pct: 100, frontal_hours: 24 },
  // אינה זכאית: משרה נמוכה מ-79%
  { ...base, name: 'אם במשרה חלקית',  children_under_18: 3, scope_pct: 50,  frontal_hours: 12 },
  // אינה זכאית: אין ילדים
  { ...base, name: 'בלי ילדים',        children_under_18: 0, scope_pct: 100, frontal_hours: 24 },
  // אינה זכאית: אופק חדש
  { ...base, name: 'אם באופק', reform: 'ofek', official_gross_pre: GROSS,
    children_under_18: 3, scope_pct: 100, frontal_hours: 24 },
]);

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1700, height: 1100 }, locale: 'he-IL' })).newPage();
await p.goto('http://localhost:5190/');
await p.getByPlaceholder('name@reshetch.org.il').fill(E);
await p.locator('input[type="password"]').fill(PW);
await p.getByRole('button', { name: /כניסה למערכת/ }).click();
await p.getByText(S).first().waitFor({ timeout: 25000 });
await p.selectOption('select[title="בחירת חודש"]', M).catch(() => {});
await p.waitForTimeout(800);
await p.getByText(S).first().click();
await p.waitForTimeout(2500);

const rowOf = async name => {
  const tr = p.locator('tr').filter({ hasText: name }).first();
  return (await tr.innerText()).replace(/\s+/g, ' ');
};
const num = (txt, after) => {
  const cells = txt.split(' ').map(x => x.replace(/,/g, '')).filter(x => /^\d{3,}$/.test(x));
  return cells;
};

const eligible = await rowOf('אם זכאית');
check('אם זכאית — הברוטו כולל 10%', eligible.includes('11,000'), eligible.slice(0, 160));

const partial = await rowOf('אם במשרה חלקית');
check('משרה מתחת ל-79% — בלי תוספת', partial.includes('10,000') && !partial.includes('11,000'), partial.slice(0, 130));

const noKids = await rowOf('בלי ילדים');
check('בלי ילדים — בלי תוספת', noKids.includes('10,000') && !noKids.includes('11,000'), noKids.slice(0, 130));

const ofek = await rowOf('אם באופק');
check('אופק חדש — תוספת אם אינה חלה', !ofek.includes('11,000'), ofek.slice(0, 130));

// עלות המעביד נגזרת מהברוטו הכולל, לא מזה שלפני התוספת
await p.getByText('אם זכאית').first().click();
await p.waitForTimeout(1200);
const card = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
check('הכרטיס אומר כמה התוספת', /תוספת אם/.test(card) && /1,000/.test(card),
  (card.match(/זכאית לתוספת אם[^·]*·[^)]*\)/) || [''])[0].slice(0, 90));

await admin.from('teacher_months').delete().eq('month_key', M);
await admin.from('schools').delete().eq('id', sc.id);
await admin.from('months').delete().eq('key', M);
await admin.from('profiles').delete().eq('id', u.user.id);
await admin.auth.admin.deleteUser(u.user.id).catch(() => {});
await b.close();
console.log(fails.length ? `\n${fails.length} נכשלו` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
