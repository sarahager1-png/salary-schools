// בדיקה חיה של הפריסה: שהמסך עולה, שההתחברות עובדת מול Supabase,
// ושמפתח השרת לא דלף לקוד שנשלח לדפדפן.
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
// הערכים האמיתיים מהסביבה המקומית. בדיקה לפי *מילים* נותנת התראת שווא:
// המחרוזת "sb_secret_" מופיעה בקוד של ספריית Supabase עצמה, שבודקת
// סוגי מפתחות — היא אינה מפתח.
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(String.fromCharCode(10)).filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const URL = process.argv[2] || 'https://salary-schools.vercel.app';
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };
const b = await chromium.launch();
const p = await (await b.newContext({ locale: 'he-IL' })).newPage();
const js = [];
p.on('response', async r => { if (/\.js(\?|$)/.test(r.url())) { try { js.push(await r.text()); } catch { /* ignore */ } } });
try {
  const res = await p.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  check('הכתובת עונה', res?.status() === 200, String(res?.status()));
  const body = await p.locator('body').innerText();
  check('מסך ההתחברות עולה', body.includes('כניסה למערכת'), body.slice(0, 80));
  check('ומזכיר למנהלות את הקישור האישי', body.includes('קישור האישי'));
  const bundle = js.join('\n');
  check('כתובת Supabase נכנסה לבנדל', /supabase\.co/.test(bundle));
  for (const k of ['SUPABASE_SECRET_KEY', 'SUPABASE_DB_PASSWORD', 'VERCEL_OIDC_TOKEN']) {
    const v = env[k];
    if (v) check(`${k} לא דלף לבנדל`, !bundle.includes(v));
  }
  // קוד שגוי — מוכיח שהקישור מחובר לשרת האמיתי
  await p.goto(`${URL}/?k=zzzzzzzzzzzzzzzzzzzz`, { waitUntil: 'networkidle', timeout: 60000 });
  await p.getByText('הקישור אינו תקף').first().waitFor({ timeout: 25000 });
  check('מסלול הקישור חי ומדבר עם Supabase', true);
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 160));
} finally { await b.close(); }
console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
