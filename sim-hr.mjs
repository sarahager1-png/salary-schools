// גמול חינוך: פותחים את מקטע "חינוך כיתה" בלחיצה אמיתית ובוחרים כיתה
// בבורר עצמו — הזרקת ערך ב-JS אינה נקלטת בטופס של האתר.
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
const T = [
  { name:'אביה אהרון', darga:'3', vetek:1, pct:73, kita:'3', kName:'ג' },
  { name:'חני אלבז',   darga:'3', vetek:1, pct:83, kita:'2', kName:'ב' },
];
const b = await chromium.launch();
const p = await (await b.newContext({ locale:'he-IL', viewport:{width:1300,height:1600} })).newPage();
await p.goto('https://educalc.unq.co.il/', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(6000);
await p.evaluate(() => location.replace('https://educalc.unq.co.il/#/Calculators/OldWorld'));
await p.waitForTimeout(4500);
await p.addStyleTag({ content: '#vplugin{display:none!important}' });

const out = [];
for (const t of T) {
  await p.selectOption('select[name="DARGA"]', t.darga);
  await p.selectOption('select[name="VETEK"]', String(t.vetek));
  await p.fill('input[name="MEKADEM_MISRA"]', String(t.pct));
  // המקטע קבור באקורדיון כפול ("גמולים" ובתוכו "חינוך כיתה").
  // כופים הכול פתוח ב-CSS, ואז הבחירה נעשית בבורר האמיתי — אירועים
  // אמיתיים שהטופס של האתר קולט.
  await p.addStyleTag({ content: `
    .panel-collapse{display:block!important;height:auto!important}
    .unqAccordionContainer, .unqAccordionContainer > div, .panel-body{display:block!important;height:auto!important}
  ` });
  await p.waitForTimeout(700);
  const sel = p.locator('select[name="KITAT_CHINUCH"]');
  await sel.scrollIntoViewIfNeeded();
  console.error('  הבורר נראה:', await sel.isVisible());
  await sel.selectOption(t.kita);
  await p.waitForTimeout(400);
  await p.locator('.btnCalc').first().click();
  await p.waitForTimeout(4500);
  const rows = await p.locator('table').last().evaluate(tb => [...tb.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('td,th')].map(c => c.innerText.trim())));
  const body = (await p.locator('body').innerText()).replace(/\s+/g,' ');
  const g = body.match(/סך הכל ברוטו כללי ([\d,]+\.?\d*)/);
  out.push({ ...t, rows, gross: g?.[1] });
  const chin = rows.find(r => r.some(c => /חינוך/.test(c)));
  console.error(`  ${t.name} (כיתה ${t.kName}): ברוטו ${g?.[1]} · שורת חינוך: ${chin ? chin.join(' ') : 'אין!'}`);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /נקה נתונים/.test(x.innerText))?.click());
  await p.waitForTimeout(900);
}
await b.close();
import fs from 'node:fs';
const prev = JSON.parse(fs.readFileSync('sim-results.json','utf8'));
for (const o of out) { const i = prev.findIndex(x => x.name === o.name); if (i >= 0) prev[i] = o; }
fs.writeFileSync('sim-results.json', JSON.stringify(prev, null, 1));
console.error('עודכן');
