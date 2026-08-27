// סימולציית עולם ישן במחשבון הרשמי, עובדת אחר עובדת, בדפדפן אמיתי —
// אותו טופס ציבורי ואותה לחיצה על "חשב" שאסתר עושה ביד.
//
// שתי שורות לא רצות בכוונה: חני אלבוים ויוכבד דובקין ממתינות להכרעת
// שרה על האחוז (הכפתור "תקני" אצלן). מריצים את מה שסגור.
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';

const T = [
  // שם, דרגה במחשבון, ותק, אחוז אפקטיבי, כיתת חינוך (ערך בבורר או null)
  { name:'אביה אהרון',    darga:'3', vetek:1, pct:73, kita:'3' },   // מחנכת ג'
  { name:'חני אלבז',      darga:'3', vetek:1, pct:83, kita:'2' },   // מחנכת ב'
  { name:'דבורה דרשן',    darga:'7', vetek:7, pct:30, kita:null },  // בכיר
  { name:'חנה מוריה הבא', darga:'3', vetek:2, pct:27, kita:null },
  { name:'טוהר פחימה',    darga:'3', vetek:1, pct:57, kita:null },
  { name:'יעל ליפשיץ',    darga:'3', vetek:1, pct:70, kita:null },
  { name:'קיילא גרוזמן',  darga:'3', vetek:1, pct:30, kita:null },
];

const b = await chromium.launch();
const p = await (await b.newContext({ locale:'he-IL', viewport:{width:1300,height:1400} })).newPage();
// תוסף הנגישות של האתר מיירט לחיצות — מוסתר לפני הכול
await p.addStyleSheet ? null : null;
await p.goto('https://educalc.unq.co.il/', { waitUntil:'domcontentloaded' });
await p.addStyleTag({ content: '#vplugin{display:none!important}' }).catch(()=>{});
await p.waitForTimeout(6000);
await p.evaluate(() => location.replace('https://educalc.unq.co.il/#/Calculators/OldWorld'));
await p.waitForTimeout(4500);
await p.addStyleTag({ content: '#vplugin{display:none!important}' }).catch(()=>{});

const openPanels = () => p.evaluate(() => {
  document.querySelectorAll('.panel-collapse').forEach(el => {
    el.classList.add('in','show'); el.style.height='auto'; el.style.display='block';
  });
});

const readAll = async () => {
  const tbl = p.locator('table').last();
  const rows = await tbl.evaluate(t => [...t.querySelectorAll('tr')].map(tr =>
    [...tr.querySelectorAll('td,th')].map(c => c.innerText.trim())));
  const body = (await p.locator('body').innerText()).replace(/\s+/g,' ');
  const g = body.match(/סך הכל ברוטו כללי ([\d,]+\.?\d*)/);
  return { rows, gross: g ? g[1] : null };
};

const out = [];
for (const t of T) {
  await p.selectOption('select[name="DARGA"]', t.darga);
  await p.selectOption('select[name="VETEK"]', String(t.vetek));
  await p.fill('input[name="MEKADEM_MISRA"]', String(t.pct));
  if (t.kita) {
    await openPanels();
    await p.waitForTimeout(600);
    const ok = await p.evaluate(k => {
      const el = document.getElementById('KITAT_CHINUCH');
      if (!el) return 'אין שדה';
      el.value = k;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      return el.value;
    }, t.kita);
    console.error(`  [${t.name}] כיתת חינוך → ${ok}`);
  }
  await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('.btnCalc')?.click());
  await p.waitForTimeout(4500);
  const r = await readAll();
  out.push({ ...t, ...r });
  console.error(`  ${t.name}: ברוטו ${r.gross}`);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /נקה נתונים/.test(x.innerText))?.click());
  await p.waitForTimeout(900);
  if (t.kita) { // ניקוי משאיר את הבורר — מאפסים
    await p.evaluate(() => { const el=document.getElementById('KITAT_CHINUCH'); if(el){el.value='';el.dispatchEvent(new Event('change',{bubbles:true}));} });
  }
}
await b.close();
import fs from 'node:fs';
fs.writeFileSync('sim-results.json', JSON.stringify(out, null, 1));
console.error('נשמר sim-results.json');
