// האם המערכת באמת ניתנת להתקנה? בודק את המניפסט, האייקונים וה-service worker
// מול הכתובת החיה.
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
const URL = 'https://salary-schools.vercel.app';
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };
const b = await chromium.launch();
const p = await (await b.newContext({ locale: 'he-IL' })).newPage();
try {
  await p.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  const href = await p.locator('link[rel="manifest"]').getAttribute('href');
  check('יש קישור למניפסט', !!href, href || '');
  const m = await p.evaluate(async h => (await fetch(h)).json(), href);
  check('שם האפליקציה', m.name?.includes('שכר מורים'), m.name);
  check('שם קצר למסך הבית', m.short_name === 'שכר מורים', m.short_name);
  check('נפתחת כאפליקציה', m.display === 'standalone', m.display);
  check('עברית מימין לשמאל', m.lang === 'he' && m.dir === 'rtl');
  check('צבע הרשת', m.theme_color === '#4B2E83', m.theme_color);
  for (const s of ['192x192', '512x512']) {
    check(`אייקון ${s}`, m.icons.some(i => i.sizes === s && i.purpose === 'any'));
    check(`אייקון ${s} לאנדרואיד (maskable)`, m.icons.some(i => i.sizes === s && i.purpose === 'maskable'));
  }
  for (const i of m.icons) {
    const st = await p.evaluate(async u => (await fetch(u)).status, i.src);
    check(`${i.src} נטען`, st === 200, String(st));
  }
  const apple = await p.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  const appleSt = await p.evaluate(async u => (await fetch(u)).status, apple);
  check('אייקון לאייפון נטען', appleSt === 200, `${apple} → ${appleSt}`);
  const sw = await p.evaluate(() => new Promise(r => {
    if (!('serviceWorker' in navigator)) return r('אין תמיכה');
    navigator.serviceWorker.ready.then(reg => r(reg.active ? 'פעיל' : 'רשום')).catch(e => r('שגיאה: ' + e.message));
    setTimeout(() => r('לא נרשם תוך 12 שניות'), 12000);
  }));
  check('service worker פעיל', sw === 'פעיל' || sw === 'רשום', sw);
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 160));
} finally { await b.close(); }
console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
