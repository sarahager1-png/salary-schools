import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1900,height:950},locale:'he-IL'})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,200)));
await p.goto('http://localhost:5190/');
await p.getByPlaceholder('name@reshetch.org.il').fill('pct@gmail.com');
await p.locator('input[type="password"]').fill('Pc!t12345');
await p.getByRole('button',{name:/כניסה למערכת/}).click();
await p.waitForTimeout(5000);
await p.getByText('בדיקת רצף').first().click();
await p.waitForTimeout(2500);
const t = await p.locator('table').count();
console.log('טבלאות בעמוד:', t);
if (t) {
  const box = await p.locator('table').first().boundingBox();
  console.log('מידות הטבלה:', JSON.stringify(box));
  const vis = await p.locator('tbody tr').count();
  console.log('שורות:', vis);
}
if (errs.length) console.log('שגיאות:', errs.join('\n'));
await p.screenshot({path:'C:/Users/PC/AppData/Local/Temp/claude/c--tmp-work/969a4e2b-c649-47eb-a340-bfcde62b4471/scratchpad/tbl.png'});
await b.close();
