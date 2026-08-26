import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:1000}, locale:'he-IL' })).newPage();
const fails=[]; const check=(n,ok,e='')=>{console.log(`${ok?'PASS':'FAIL'}  ${n}${e?' — '+e:''}`); if(!ok)fails.push(n);};
await p.goto('http://localhost:5190/');
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(500);
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(600);
const names = await p.evaluate(() => JSON.parse(localStorage.getItem('ss-schools-v2')).map(s=>s.name));
const want = ['בית חינוך רעננה','שלהבות מזכרת בתיה','שלהבות אשקלון','שלהבות אור עקיבא','שלהבות ירושלים','שלהבות גני תקוה','שלהבות רמת ישי','בית חינוך עפולה'];
check('נזרעו 8 בתי ספר', names.length===8, `${names.length}: ${names.join(', ')}`);
check('כל השמות תואמים לרשימה', want.every(w=>names.includes(w)), names.filter(n=>!want.includes(n)).join(', ')||'—');
check('אין הרצליה/חיפה/באר שבע/קרית ביאליק', !names.some(n=>/הרצליה|חיפה|באר שבע|ביאליק/.test(n)));
check('כולם מוצגים על המסך', (await p.getByText('שלהבות אשקלון').count())>0 && (await p.getByText('בית חינוך עפולה').count())>0);
// מסלול: ירושלים ועפולה עולם ישן, השאר אופק
const byName = await p.evaluate(() => Object.fromEntries(
  JSON.parse(localStorage.getItem('ss-schools-v2')).map(s => [s.name, s.reform])));
check('ירושלים — עולם ישן', byName['שלהבות ירושלים']==='pre', byName['שלהבות ירושלים']);
check('עפולה — עולם ישן', byName['בית חינוך עפולה']==='pre', byName['בית חינוך עפולה']);
check('שאר בתי הספר — אופק חדש',
  Object.entries(byName).filter(([n])=>!/ירושלים|עפולה/.test(n)).every(([,r])=>r==='ofek'),
  JSON.stringify(byName));

// תיקון חד-פעמי להתקנה קיימת שנזרעה כשכולם היו אופק
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('ss-schools-v2')).map(x => ({ ...x, reform: 'ofek' }));
  localStorage.setItem('ss-schools-v2', JSON.stringify(s));
  localStorage.removeItem('ss-reform-fix-v1');
});
await p.reload(); await p.waitForTimeout(500);
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(500);
const fixed = await p.evaluate(() => Object.fromEntries(
  JSON.parse(localStorage.getItem('ss-schools-v2')).map(s => [s.name, s.reform])));
check('התקנה קיימת מתוקנת — ירושלים', fixed['שלהבות ירושלים']==='pre', fixed['שלהבות ירושלים']);
check('התקנה קיימת מתוקנת — עפולה', fixed['בית חינוך עפולה']==='pre', fixed['בית חינוך עפולה']);
check('התיקון לא נגע בשאר',
  Object.entries(fixed).filter(([n])=>!/ירושלים|עפולה/.test(n)).every(([,r])=>r==='ofek'));

// שינוי ידני אחרי התיקון נשמר
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('ss-schools-v2'));
  s.find(x => x.name === 'שלהבות ירושלים').reform = 'ofek';
  localStorage.setItem('ss-schools-v2', JSON.stringify(s));
});
await p.reload(); await p.waitForTimeout(500);
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(500);
const manual = await p.evaluate(() => JSON.parse(localStorage.getItem('ss-schools-v2')).find(s=>s.name==='שלהבות ירושלים').reform);
check('שינוי ידני אחרי התיקון נשמר', manual==='ofek', manual);

// מחיקה מכוונת לא משוחזרת
await p.evaluate(() => localStorage.setItem('ss-schools-v2','[]'));
await p.reload(); await p.waitForTimeout(500);
await p.getByText('כניסה למערכת').click(); await p.waitForTimeout(500);
const after = await p.evaluate(() => JSON.parse(localStorage.getItem('ss-schools-v2')));
check('מחיקה מכוונת אינה משוחזרת', after.length===0, String(after.length));
await b.close();
console.log(fails.length?`\n${fails.length} כשלונות`:'\nהכול עבר');
process.exit(fails.length?1:0);
