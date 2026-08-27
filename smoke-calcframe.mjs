// המחשבון הרשמי בתוך המסגרת שלנו.
//
// הטופס של משרד החינוך גבוה מ-1,200 פיקסלים וכפתור "חשב" בתחתיתו.
// כשהמסגרת הייתה בגובה הפאנל הכפתור נפל מתחת לקצה, והדרך היחידה להגיע
// אליו הייתה גלילה בתוך המסגרת — שאין לה סימן. הבדיקה שומרת על כך
// שהכפתור נשאר בתוך המסגרת ושהמחשבון הנכון נטען לפי המורה.
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';
// המסגרת נטענת פעם אחת ומנווטת ב-hash, ולכן התכונה src קפואה על דף
// הבית. הכתובת האמיתית היא זו של המסמך בתוך המסגרת.
const frameUrl = async (page, tries = 14) => {
  for (let i = 0; i < tries; i++) {
    const f = page.frames().find(x => x.url().includes('educalc'));
    if (f && /\/Calculators\/\w/.test(f.url())) return f.url();
    await page.waitForTimeout(1200);
  }
  return page.frames().find(x => x.url().includes('educalc'))?.url() || '';
};
const env=Object.fromEntries(fs.readFileSync(ENV_FILE,'utf8').split('\n').filter(Boolean).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const M='2099-07', S='מסגרת בדיקה', E='frame-clerk@example.com', PW='Fr!'+Math.random().toString(36).slice(2,9);
const clean=async()=>{const {data}=await admin.auth.admin.listUsers();const u=data?.users?.find(x=>x.email===E);
 if(u){await admin.from('profiles').delete().eq('id',u.id);await admin.auth.admin.deleteUser(u.id);}
 await admin.from('teacher_months').delete().eq('month_key',M);await admin.from('months').delete().eq('key',M);
 await admin.from('schools').delete().eq('name',S);};
await clean();
const {data:sc}=await admin.from('schools').insert({name:S,reform:'ofek'}).select().single();
await admin.from('months').insert({key:M});
const {data:u}=await admin.auth.admin.createUser({email:E,password:PW,email_confirm:true});
await admin.from('profiles').insert({id:u.user.id,full_name:'חשבת מסגרת',role:'clerk'});
await admin.from('teacher_months').insert({month_key:M,school_id:sc.id,name:'מורת מסגרת',reform:'ofek',frontal_hours:26,scope_pct:100,seniority:8,grade:'5',degree:'BA',level:'elementary',changed_at:new Date().toISOString()});

const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:1500,height:1000},locale:'he-IL'})).newPage();
await p.goto('http://localhost:5190/');
await p.evaluate(()=>localStorage.clear()); await p.reload();
await p.getByPlaceholder('name@reshetch.org.il').fill(E);
await p.locator('input[type="password"]').fill(PW);
await p.getByRole('button',{name:/כניסה למערכת/}).click();
await p.getByText('מורת מסגרת').first().waitFor({timeout:20000});
let fails = 0;
const check = (n, ok, e='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${e?' — '+e:''}`); if(!ok) fails++; };
  // המחשבון זמין תוך זמן סביר
  let ready = false;
  for (let waited = 0; waited < 20000 && !ready; waited += 2000) {
    await p.waitForTimeout(2000);
    try { ready = await p.frameLocator('iframe').first().locator('.btnCalc').count() > 0; } catch { /* עדיין נטען */ }
  }
  check('המחשבון הרשמי נטען בתוך המסגרת', ready);

  // בחירת מורת אופק פותחת את מחשבון העולם הישן — שלב 1
  await p.getByText('מורת מסגרת').first().click();
  await p.waitForTimeout(9000);
  const src = await frameUrl(p);
  check('מורת אופק מתחילה במחשבון העולם הישן', /OldWorld/.test(src || ''), src || '');

  const f = p.frameLocator('iframe').first();
  const box = await p.locator('iframe').first().boundingBox();
  const btn = await f.locator('.btnCalc').first().boundingBox().catch(() => null);
  check('כפתור "חשב" קיים', !!btn);
  check('והוא בתוך המסגרת ולא חתוך מתחתיה',
    !!(btn && box && btn.y < box.height), btn && box ? `חשב ב-${Math.round(btn.y)}, מסגרת ${Math.round(box.height)}` : '');
  check('הרמז לכפתור מוצג', (await p.locator('body').innerText()).includes('הכפתור'));

  console.log(fails ? String(fails) + ' כשלונות' : 'הכול עבר');
  await b.close(); await clean();
process.exit(fails ? 1 : 0);
