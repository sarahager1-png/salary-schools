// תוספת אם — הברוטו מוצג כפי שהוזן, בלי תוספות שקטות.
//
// גלגול קודם של המסך הוסיף 10% לברוטו של אם זכאית. ההוספה בוטלה ב-1.9
// (הוראת שרה): תוספת האם נכנסת דרך אחוז המשרה שהיא קובעת — האחוז
// הרשום כבר כולל אותה — והוספה מעל הברוטו ספרה אותה פעמיים (יוכבד
// דובקין: 8,508 במקום 7,666). מה שנבדק כאן: מה שחשבת השכר הזינה הוא
// מה שמוצג, לכל ארבעת המקרים, ושום שורה אינה מנופחת.
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

// הברוטו מוצג בשדה קלט (חשבת השכר עורכת אותו במקום), ו-innerText של
// שורה אינו כולל ערכי קלט — לכן נאספים גם הם.
const rowOf = async name => {
  const tr = p.locator('tr').filter({ hasText: name }).first();
  const text = (await tr.innerText()).replace(/\s+/g, ' ');
  const inputs = await tr.locator('input').evaluateAll(es => es.map(e => e.value).filter(Boolean));
  return text + ' ⌨ ' + inputs.map(v => Number(v).toLocaleString('he-IL')).join(' ');
};
const num = (txt, after) => {
  const cells = txt.split(' ').map(x => x.replace(/,/g, '')).filter(x => /^\d{3,}$/.test(x));
  return cells;
};

for (const name of ['אם זכאית', 'אם במשרה חלקית', 'בלי ילדים', 'אם באופק']) {
  const row = await rowOf(name);
  check(`${name} — הברוטו כפי שהוזן`, row.includes('10,000') && !row.includes('11,000'),
    row.slice(0, 130));
}

await admin.from('teacher_months').delete().eq('month_key', M);
await admin.from('schools').delete().eq('id', sc.id);
await admin.from('months').delete().eq('key', M);
await admin.from('profiles').delete().eq('id', u.user.id);
await admin.auth.admin.deleteUser(u.user.id).catch(() => {});
await b.close();
console.log(fails.length ? `\n${fails.length} נכשלו` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
