// כניסה עם גוגל.
//
// הספק עצמו מופעל בלוח הבקרה של Supabase, לא מכאן. מה שנבדק כאן הוא
// הצד שלנו: שהכפתור מופיע רק כשהספק באמת פעיל, שהוא מפנה לגוגל,
// ושחשבון שהתחבר אך אינו מוגדר במערכת מקבל הסבר ולא מסך ריק.
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(String.fromCharCode(10)).filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

const APP = process.argv[2] || 'http://localhost:5190';
const PW = 'Ggl!' + Math.random().toString(36).slice(2, 9);
const GHOST = 'google-noprofile@example.com';

async function cleanup() {
  const { data: us } = await admin.auth.admin.listUsers();
  const u = us?.users?.find(x => x.email === GHOST);
  if (u) { await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {}); }
}

const b = await chromium.launch();
const p = await (await b.newContext({ locale: 'he-IL' })).newPage();

try {
  await cleanup();

  // ── מה מופעל בשרת ──
  await p.goto(APP, { waitUntil: 'networkidle', timeout: 60000 });
  const providers = await p.evaluate(async ([u, k]) => {
    const r = await fetch(`${u}/auth/v1/settings`, { headers: { apikey: k } });
    const j = await r.json();
    return Object.entries(j.external || {}).filter(([, on]) => on === true).map(([x]) => x);
  }, [env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY]);
  const googleOn = providers.includes('google');
  console.log(`      ספקים פעילים: ${providers.join(', ')}`);

  const btn = p.getByRole('button', { name: /כניסה עם גוגל/ });
  await p.waitForTimeout(1500);
  const shown = await btn.count() > 0;
  check(googleOn ? 'גוגל מופעל — הכפתור מוצג' : 'גוגל כבוי — הכפתור אינו מוצג', shown === googleOn,
    `מופעל=${googleOn} מוצג=${shown}`);

  if (googleOn) {
    // הלחיצה מפנה לגוגל. לא מתחברים בפועל — רק מוודאים לאן זה הולך.
    const [nav] = await Promise.all([
      p.waitForURL(/accounts\.google\.com/, { timeout: 20000 }).then(() => true).catch(() => false),
      btn.click(),
    ]);
    check('הכפתור מפנה לגוגל', nav, p.url().slice(0, 60));
    const u = new URL(p.url());
    check('ומבקש לבחור חשבון', u.searchParams.get('prompt') === 'select_account');
    await p.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } else {
    console.log('SKIP  הפניה לגוגל — הספק כבוי בפרויקט');
  }

  // ── חשבון שהתחבר אך אינו מוגדר: ההודעה חייבת להסביר ──
  const { data: g } = await admin.auth.admin.createUser({ email: GHOST, password: PW, email_confirm: true });
  check('נוצר משתמש בלי פרופיל', !!g?.user);
  await p.goto(APP, { waitUntil: 'networkidle', timeout: 60000 });
  await p.getByPlaceholder('name@reshetch.org.il').fill(GHOST);
  await p.locator('input[type="password"]').fill(PW);
  await p.getByRole('button', { name: /כניסה למערכת/ }).click();
  await p.waitForTimeout(4000);
  const body = await p.locator('body').innerText();
  check('נאמר איזה חשבון נכנס', body.includes(GHOST), body.match(/[^\n]*אינו משויך[^\n]*/)?.[0] || body.slice(0, 100));
  check('ונאמר למי לפנות', body.includes('פני לשרה'));
  check('והיא נשארת במסך ההתחברות', body.includes('כניסה למערכת'));
  // ולא נשאר session תקוע
  const stuck = await p.evaluate(() => Object.keys(localStorage).some(k => /auth-token/.test(k) && localStorage.getItem(k)?.includes('access_token')));
  check('לא נשאר חיבור תקוע בדפדפן', !stuck);
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 200));
} finally {
  await b.close();
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
