// הסבב השלישי: מה שנשאר מהוורקפלואו השני, ו"פתיחת המערכת" — התיקון היחיד
// שאף אחת לא לחצה עליו במסד ריק.
//
// שני הצעדים הראשונים דורשים מסד בלי אף חודש. אם יש חודש (חבילה אחרת
// רצה, או שריד) — הם מדולגים ונאמר למה, לא נכשלים.
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };
const skip  = (n, why) => console.log(`SKIP  ${n} — ${why}`);

const PW = 'Fx3!' + Math.random().toString(36).slice(2, 9);
const MONTH = '2098-03', SCHOOL = 'תיקונים בדיקה', SCHOOL_DUP = 'תיקונים כפול';
const U = { coord: 'fx3-coord@example.com', clerk: 'fx3-clerk@example.com', prin: 'fx3-prin@example.com' };
const nowKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
let openedMonth = null;   // החודש ש"פתיחת המערכת" יצרה — נמחק בסוף, ורק הוא

async function cleanup() {
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  if (openedMonth) {
    await admin.from('teacher_months').delete().eq('month_key', openedMonth);
    await admin.from('months').delete().eq('key', openedMonth);
  }
  const { data: us } = await admin.auth.admin.listUsers();
  for (const email of Object.values(U)) {
    const u = us?.users?.find(x => x.email === email);
    if (u) { await admin.from('profiles').delete().eq('id', u.id); const { error } = await admin.auth.admin.deleteUser(u.id); if (error) console.error('מחיקת', email, error.message); }
  }
  await admin.from('schools').delete().in('name', [SCHOOL, SCHOOL_DUP]);
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
  await p.waitForTimeout(1000);
};

try {
  await cleanup();
  const mk = async (email, name, role, school) => {
    const { data } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    await admin.from('profiles').insert({ id: data.user.id, full_name: name, role, school_id: school ?? null });
  };
  await mk(U.coord, 'שליח תיקונים', 'coordinator');
  await mk(U.clerk, 'חשבת תיקונים', 'clerk');

  // ══ 0. מסד בלי חודשים: הוספת בית ספר נחסמת, ו"פתיחת המערכת" פותחת את החודש הנוכחי ══
  const { data: existing } = await admin.from('months').select('key');
  if (existing.length) {
    skip('בית ספר לפני חודש נחסם', `יש ${existing.length} חודשים במסד (${existing.map(m => m.key).join(', ')})`);
    skip('"פתיחת המערכת" פותחת את החודש הנוכחי', 'אותה סיבה');
  } else {
    await login(U.coord);
    let body = await p.locator('body').innerText();
    check('במסד ריק הכפתור נקרא "פתיחת המערכת"', body.includes('פתיחת המערכת'));
    const { count: before } = await admin.from('schools').select('id', { count: 'exact', head: true });
    await p.getByRole('button', { name: /הוסף בית ספר/ }).first().click();
    await p.getByPlaceholder('שם בית הספר').fill(SCHOOL_DUP).catch(async () => {
      await p.locator('.apple-card input').first().fill(SCHOOL_DUP);
    });
    await p.getByRole('button', { name: /^שמור$/ }).click();
    await p.waitForTimeout(1200);
    body = await p.locator('body').innerText();
    check('בית ספר לפני חודש נחסם עם הסבר', body.includes('פתיחת המערכת') && body.includes('לפני הוספת בית ספר'));
    const { count: after } = await admin.from('schools').select('id', { count: 'exact', head: true });
    check('ולא נכתב בית ספר יתום', after === before, `${before} → ${after}`);
    await p.getByRole('button', { name: /^ביטול$/ }).click().catch(() => {});

    await p.getByRole('button', { name: /פתיחת המערכת/ }).click();
    await p.waitForTimeout(2500);
    const { data: months } = await admin.from('months').select('key');
    openedMonth = months.find(m => m.key === nowKey())?.key || null;
    check('"פתיחת המערכת" פתחה את החודש הנוכחי', openedMonth === nowKey(), months.map(m => m.key).join(', ') || 'לא נוצר חודש');
    body = await p.locator('body').innerText();
    check('והכפתור הפך ל"חודש"', !body.includes('פתיחת המערכת') && /\+?\s*חודש/.test(body));
  }

  // ══ 1. פיקסטורות לשאר ══
  const { data: sc } = await admin.from('schools').insert({ name: SCHOOL, reform: 'ofek', hours_quota: 400 }).select().single();
  await mk(U.prin, 'מנהלת תיקונים', 'principal', sc.id);
  const { data: mExists } = await admin.from('months').select('key').eq('key', MONTH);
  if (!mExists.length) await admin.from('months').insert({ key: MONTH });
  const ins = async (row) => (await admin.from('teacher_months').insert({
    month_key: MONTH, school_id: sc.id, reform: 'ofek', level: 'elementary', degree: 'BA', grade: '5',
    seniority: 6, frontal_hours: 26, scope_pct: 100, changed_at: new Date().toISOString(), ...row,
  }).select().single()).data;
  // שורת המנהלת — המערכת יוצרת אותה עם פתיחת בית ספר מהממשק; כאן נוצרת ישירות
  await ins({ name: 'מנהלת בית הספר', gamul_role: 'principal', changed_at: null });
  const tPre  = await ins({ name: 'תיקונים ישן',  reform: 'pre', frontal_hours: 24, scope_pct: 92 });
  const tHigh = await ins({ name: 'תיקונים עליון', level: 'high', frontal_hours: 23 });
  const tOfek = await ins({ name: 'תיקונים אופק' });

  // ══ 2. השליח ══
  await login(U.coord);
  await p.selectOption('select[title="בחירת חודש"]', MONTH).catch(() => {});
  await p.waitForTimeout(600);
  await p.getByText(SCHOOL).first().click();
  await p.getByText('תיקונים ישן').first().waitFor({ timeout: 15000 });
  const preRow = await p.locator('tr').filter({ hasText: 'תיקונים ישן' }).first().innerText();
  check('שעות פרונטליות של מורת עולם ישן מוצגות בטבלה', /\b24\b/.test(preRow), preRow.replace(/\s+/g, ' ').slice(0, 120));
  const prinRow = p.locator('span.apple-badge', { hasText: 'מנהלת' }).first();
  check('לתג "מנהלת" יש הסבר מאיפה השורה', ((await prinRow.getAttribute('title')) || '').includes('נוצרה אוטומטית'));

  // בית ספר בשם קיים
  await p.getByRole('button', { name: /ראשי|חזרה/ }).first().click().catch(() => {});
  await p.goto('http://localhost:5190/');
  await p.getByText(SCHOOL).first().waitFor({ timeout: 15000 });
  await p.getByRole('button', { name: /הוסף בית ספר/ }).first().click();
  await p.locator('.apple-card input').first().fill(SCHOOL);
  await p.getByRole('button', { name: /^שמור$/ }).click();
  await p.waitForTimeout(2000);
  let body = await p.locator('body').innerText();
  check('שם בית ספר כפול — הודעה בעברית', body.includes('כבר קיים'));
  const { count: dupCount } = await admin.from('schools').select('id', { count: 'exact', head: true }).eq('name', SCHOOL);
  check('ולא נוצר כפיל', dupCount === 1, String(dupCount));
  await p.getByRole('button', { name: /^ביטול$/ }).click().catch(() => {});

  // חלון הגיבוי
  await p.getByRole('button', { name: /גיבוי/ }).first().click();
  await p.waitForTimeout(500);
  body = await p.locator('body').innerText();
  check('חלון הייצוא לא טוען יותר שהנתונים בדפדפן', body.includes('שמורים בשרת') && !body.includes('בדפדפן הזה בלבד'));
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: /סגירה/ }).first().click().catch(() => {});

  // ══ 3. חשבת השכר ══
  await login(U.clerk);
  await p.selectOption('select[title="בחירת חודש"]', MONTH).catch(() => {});
  await p.waitForTimeout(800);
  await p.getByText('תיקונים עליון').first().waitFor({ timeout: 15000 });
  await p.getByText('תיקונים עליון').first().click();
  await p.waitForTimeout(800);
  check('מורת חטיבה עליונה מנותבת לעוז לתמורה', await p.getByPlaceholder('שכר משולב ממחשבון עוז לתמורה').count() > 0);

  // לחיצה על שדה "עולם ישן" בכרטיס פעיל אינה מחליפה למחשבון אופק
  await p.getByText('תיקונים אופק').first().click();
  await p.waitForTimeout(800);
  const oldField = p.getByPlaceholder('שכר משולב ממחשבון העולם הישן');
  await oldField.click();
  await p.waitForTimeout(4500);   // המסגרת מנווטת אחרי שהאתר מתייצב
  const src = await p.locator('iframe').first().getAttribute('src');
  check('לחיצה על שדה "עולם ישן" משאירה את מחשבון העולם הישן', /OldWorld/.test(src || ''), src || '');

  // מינוס נעצר בעברית — בשמירה (Enter בשלב הראשון רק עובר לשלב השני)
  const ofekField = p.getByPlaceholder('שכר משולב ממחשבון אופק חדש');
  await oldField.fill('-500');
  await oldField.press('Enter');
  await ofekField.fill('12500');
  await ofekField.press('Enter');
  await p.waitForTimeout(400);
  check('סכום שלילי — הודעה בעברית, לא שגיאת Postgres', lastDialog.includes('חיובי'), lastDialog);
  const { data: untouched } = await admin.from('teacher_months').select('official_gross').eq('id', tOfek.id).single();
  check('ולא נשמר דבר', untouched.official_gross === null, String(untouched.official_gross));

  // אגורות מתעגלות
  await oldField.fill('8100.75');
  await oldField.press('Enter');
  await p.getByPlaceholder('שכר משולב ממחשבון אופק חדש').fill('12500');
  await p.getByPlaceholder('שכר משולב ממחשבון אופק חדש').press('Enter');
  const saved = await settled(tOfek.id, r => r.official_gross === 12500);
  check('אגורות מתעגלות לשקל שלם', saved?.official_gross_pre === 8101, String(saved?.official_gross_pre));

  // המונה אחרי שהכול אושר
  const clerk = await client(U.clerk);
  for (const t of [tPre, tHigh]) await clerk.from('teacher_months').update({ official_gross: 11000, official_gross_pre: t.reform === 'pre' ? null : 10500 }).eq('id', t.id);
  const coord = await client(U.coord);
  for (const t of [tPre, tHigh, tOfek]) await coord.from('teacher_months').update({ approved: true }).eq('id', t.id);
  await p.reload();
  await p.getByRole('button', { name: /יציאה/ }).first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(1200);
  body = await p.locator('body').innerText();
  check('אחרי שהכול אושר המונה לא מציג "0 / 3"', !/0 \/ \d+ הושלמו/.test(body) && body.includes('אין ממתינות'), body.match(/\d+ \/ \d+ הושלמו|אין ממתינות/)?.[0] || '');

  // ══ 4. המנהלת: "שלח לשליח" בלי מייל שליח ══
  await login(U.prin);
  await p.selectOption('select[title="בחירת חודש"]', MONTH).catch(() => {});
  await p.waitForTimeout(800);
  await p.getByText('תיקונים ישן').first().waitFor({ timeout: 15000 });
  lastDialog = '';
  await p.getByRole('button', { name: /שלח לשליח/ }).click();
  await p.waitForTimeout(500);
  check('"שלח לשליח" בלי מייל שליח אומר מה חסר', lastDialog.includes('מייל שליח'), lastDialog || 'אין הודעה');
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 220));
} finally {
  await b.close();
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
