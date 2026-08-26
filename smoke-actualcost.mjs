// עלות מעביד בפועל — אסתר מקלידה.
//
// האומדן הוא שש שורות לפי החוק; המספר האמיתי מגיע מהנהלת החשבונות אחרי
// שהשכר רץ. השרת התיר לחשבת השכר את העמודה מההתחלה — רק הממשק לא נתן
// לה מקום. הבדיקה מוודאת שהמספר שהיא מקלידה מחליף את האומדן אצל כולם.
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

const PW = 'Act!' + Math.random().toString(36).slice(2, 9);
const MONTH = '2098-08', SCHOOL = 'עלות בפועל בדיקה';
const U = { coord: 'act-coord@example.com', clerk: 'act-clerk@example.com' };

async function cleanup() {
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  const { data: us } = await admin.auth.admin.listUsers();
  for (const email of Object.values(U)) {
    const u = us?.users?.find(x => x.email === email);
    if (u) { await admin.from('profiles').delete().eq('id', u.id); const { error } = await admin.auth.admin.deleteUser(u.id); if (error) console.error('מחיקת', email, error.message); }
  }
  await admin.from('schools').delete().eq('name', SCHOOL);
}
const client = async (email) => {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`כניסה ${email}: ${error.message}`);
  return c;
};
const settled = async (id, pred, ms = 15000) => {
  const until = Date.now() + ms;
  for (;;) {
    const { data } = await admin.from('teacher_months').select('*').eq('id', id).single();
    if (data && pred(data)) return data;
    if (Date.now() > until) return null;
    await new Promise(r => setTimeout(r, 400));
  }
};

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' })).newPage();
let lastDialog = '';
p.on('dialog', d => { lastDialog = d.message(); d.accept(); });
const login = async (email) => {
  await p.goto('http://localhost:5190/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.getByPlaceholder('name@reshetch.org.il').fill(email);
  await p.locator('input[type="password"]').fill(PW);
  await p.getByRole('button', { name: /כניסה למערכת/ }).click();
  await p.getByRole('button', { name: /יציאה/ }).first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(800);
  await p.selectOption('select[title="בחירת חודש"]', MONTH).catch(() => {});
  await p.waitForTimeout(800);
};

try {
  await cleanup();
  const { data: sc } = await admin.from('schools').insert({ name: SCHOOL, reform: 'ofek', hours_quota: 400 }).select().single();
  await admin.from('months').insert({ key: MONTH });
  const mk = async (email, name, role) => {
    const { data } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    await admin.from('profiles').insert({ id: data.user.id, full_name: name, role });
  };
  await mk(U.coord, 'שליח עלות', 'coordinator');
  await mk(U.clerk, 'חשבת עלות', 'clerk');
  // מורה עם סימולציה מלאה (11,200 / 12,500 → אומדן 5,091), ומורה בלי
  const ins = async (row) => (await admin.from('teacher_months').insert({
    month_key: MONTH, school_id: sc.id, reform: 'ofek', level: 'elementary', degree: 'BA', grade: '5',
    seniority: 8, frontal_hours: 26, scope_pct: 100, changed_at: new Date().toISOString(), ...row,
  }).select().single()).data;
  const done    = await ins({ name: 'עלות מורה מוכנה', official_gross: 12500, official_gross_pre: 11200 });
  const pending = await ins({ name: 'עלות מורה ממתינה' });

  // ── 1. הלשונית ──
  await login(U.clerk);
  await p.getByRole('button', { name: /עלות מעביד בפועל/ }).waitFor({ timeout: 15000 });
  const tabLabel = await p.getByRole('button', { name: /עלות מעביד בפועל/ }).innerText();
  check('הלשונית מציגה כמה חסרות', /\(1\)/.test(tabLabel), tabLabel);
  await p.getByRole('button', { name: /עלות מעביד בפועל/ }).click();
  await p.getByText('עלות מורה מוכנה').first().waitFor({ timeout: 10000 });
  let body = await p.locator('body').innerText();
  check('רק מורה עם סימולציה מלאה מופיעה', body.includes('עלות מורה מוכנה') && !body.includes('עלות מורה ממתינה'));
  check('האומדן מוצג לידה', body.includes('אומדן 5,091'));

  // ── 2. הקלדה ושמירה ב-Enter ──
  const field = p.getByPlaceholder('עלות בפועל').first();
  await field.fill('5400');
  await field.press('Enter');
  const saved = await settled(done.id, r => r.actual_employer_cost === 5400);
  check('הסכום נשמר בשרת', !!saved, saved ? '' : 'לא הגיע');
  await p.waitForTimeout(1200);
  body = await p.locator('body').innerText();
  check('מוצג הפער מול האומדן', /בפועל \+6\.1%/.test(body), body.match(/בפועל [+-]?[\d.]+%/)?.[0] || 'לא מוצג');
  check('המונה בלשונית ירד', !/עלות מעביד בפועל \(\d+\)/.test(body));

  // ── 3. מינוס נעצר ──
  await field.fill('-1');
  await field.press('Enter');
  await p.waitForTimeout(400);
  check('סכום שלילי — הודעה בעברית', lastDialog.includes('חיובי'), lastDialog);

  // ── 4. אצל השליח: אין יותר ~ ──
  await login(U.coord);
  await p.getByText(SCHOOL).first().click();
  const row = await p.locator('tr').filter({ hasText: 'עלות מורה מוכנה' }).first().innerText();
  check('בטבלת השליח הסכום בפועל בלי ~', row.includes('5,400') && !/~\s*5,400/.test(row), row.replace(/\s+/g, ' ').slice(-80));

  // ── 5. ריק = חזרה לאומדן ──
  await login(U.clerk);
  await p.getByRole('button', { name: /עלות מעביד בפועל/ }).click();
  await p.getByText('עלות מורה מוכנה').first().waitFor({ timeout: 10000 });
  const f2 = p.getByPlaceholder('עלות בפועל').first();
  await f2.fill('');
  await f2.press('Enter');
  const back = await settled(done.id, r => r.actual_employer_cost === null);
  check('ריק מחזיר לאומדן', !!back, back ? '' : 'הערך לא התאפס');

  // ── 6. מנהלת אינה יכולה (השרת) ──
  const { data: pu } = await admin.auth.admin.createUser({ email: 'act-prin@example.com', password: PW, email_confirm: true });
  await admin.from('profiles').insert({ id: pu.user.id, full_name: 'מנהלת עלות', role: 'principal', school_id: sc.id });
  const prin = await client('act-prin@example.com');
  const { error: pe } = await prin.from('teacher_months').update({ actual_employer_cost: 1 }).eq('id', done.id);
  check('מנהלת אינה מזינה עלות בפועל', !!pe, pe?.message?.slice(0, 60) || 'עבר!');
  await admin.from('profiles').delete().eq('id', pu.user.id); await admin.auth.admin.deleteUser(pu.user.id);
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 220));
} finally {
  await b.close();
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
