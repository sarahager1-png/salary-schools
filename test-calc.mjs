import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { ofekRequest, oldRequest, nihulRequest, readResult } from './src/lib/calc.js';

// מיפוי המורה לבקשה למחשבון הרשמי, והשומרים של פונקציית המתווך.
// הקריאה עצמה חסומה כרגע ב-Cloudflare — ראי supabase/functions/calc-salary.

const env = Object.fromEntries(
  fs.readFileSync('.env.local','utf8').split('\n').filter(Boolean)
    .map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {auth:{persistSession:false}});
const fails=[]; const check=(n,ok,e='')=>{console.log(`${ok?'PASS':'FAIL'}  ${n}${e?' — '+e:''}`);if(!ok)fails.push(n);};

const EMAIL='calc-test@example.com', PW='Calc!'+Math.random().toString(36).slice(2,9);
async function cleanup(){
  const {data}=await admin.auth.admin.listUsers();
  const u=data?.users?.find(x=>x.email===EMAIL);
  if(u){await admin.from('profiles').delete().eq('id',u.id);await admin.auth.admin.deleteUser(u.id);}
}
try{
  await cleanup();
  const {data:u}=await admin.auth.admin.createUser({email:EMAIL,password:PW,email_confirm:true});
  await admin.from('profiles').insert({id:u.user.id,full_name:'בדיקת מחשבון',role:'clerk'});
  const anon=createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
  await anon.auth.signInWithPassword({email:EMAIL,password:PW});

  // ── ללא התחברות ──
  const nobody=createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
  const {data:no}=await nobody.functions.invoke('calc-salary',{body:{calls:[{id:'x',endpoint:'ofek',body:{}}]}});
  check('בלי התחברות אין גישה', !no?.results, JSON.stringify(no||{}).slice(0,60));

  // ── מחשבון לא מוכר לא מפנה לשום מקום ──
  const {data:bad}=await anon.functions.invoke('calc-salary',{body:{calls:[{id:'b',endpoint:'https://evil.example/x',body:{}}]}});
  check('כתובת זרה נדחית', /לא מוכר/.test(bad?.results?.[0]?.error||''), bad?.results?.[0]?.error||'');

  const T = { degree:'BA', grade:5, seniority:8, scopePct:100 };
  const MONTH = '2026-07';
  const reqs = [
    ['אופק חדש',  ofekRequest(T, MONTH)],
    ['עולם ישן',  oldRequest(T, MONTH)],
    ['אופק ניהול', nihulRequest({...T, nihulGrade:1}, MONTH)],
  ];
  for (const [name, r] of reqs) check(`${name} — נבנתה בקשה`, !r.skip, r.skip||'');

  const {data,error}=await anon.functions.invoke('calc-salary',{
    body:{calls: reqs.map(([n,r],i)=>({id:String(i), endpoint:r.endpoint, body:r.body}))}});
  if(error) throw new Error('invoke: '+error.message);
  // האתר מאחורי Cloudflare ומחזיר 403 לכל פנייה שאינה מדפדפן. הבדיקה
  // מתעדת את המצב במקום להיכשל עליו — וכשהחסימה תוסר היא תתחיל לאמת
  // את השכר עצמו במקום את החסימה.
  let blocked = 0;
  for (const [i,[name]] of reqs.entries()) {
    const res=(data.results||[]).find(x=>x.id===String(i));
    const parsed=res?.rows?readResult(res.rows):null;
    if (parsed?.meshulav) {
      check(`${name} — התקבל שכר`, true,
        `משולב ${parsed.meshulav.toLocaleString('he-IL')} · ברוטו ${parsed.bruto.toLocaleString('he-IL')}`);
    } else if (/403/.test(res?.error||'')) {
      blocked++;
      console.log(`SKIP  ${name} — חסום ב-Cloudflare, כצפוי`);
    } else {
      check(`${name} — התקבל שכר`, false, res?.error||'ריק');
    }
  }
  check('החסימה עקבית בשלושת המחשבונים', blocked === 0 || blocked === 3, `${blocked} מתוך 3`);

  // ── מורה שאי אפשר לתרגם אינה מנוחשת ──
  const s1=oldRequest({...T,degree:'intern'},MONTH);
  check('מתמחה בעולם ישן -> דרגה 18', s1.body?.DARGA==='18', s1.skip||s1.body?.DARGA);
  const s2=oldRequest({...T,degree:'unlicensed'},MONTH);
  check('בלתי מוסמכת -> שלב א (12) כברירת מחדל', s2.body?.DARGA==='12', s2.skip||s2.body?.DARGA);
  for (const [stage,val] of [['aa','10'],['a+','11'],['a','12'],['b','13']]) {
    const r=oldRequest({...T,degree:'unlicensed',unlicensedStage:stage},MONTH);
    check(`בלתי מוסמכת שלב ${stage} -> ${val}`, r.body?.DARGA===val, r.skip||r.body?.DARGA);
  }
  check('מתמחה באופק -> DERUG_OFEK=100', ofekRequest({...T,degree:'intern'},MONTH).body.DERUG_OFEK==='100');

  // ── דרגה 5 היא הערך 9 באתר ──
  check('דרגה 5 -> DARGA1=9', ofekRequest({...T,grade:5},MONTH).body.DARGA1==='9', ofekRequest({...T,grade:5},MONTH).body.DARGA1);
  check('דרגה 1 -> DARGA1=1', ofekRequest({...T,grade:1},MONTH).body.DARGA1==='1');
  check('דרגה 9 -> DARGA1=17',ofekRequest({...T,grade:9},MONTH).body.DARGA1==='17');
}catch(e){check('הרצה ללא חריגה',false,e.message?.slice(0,180));}
finally{await cleanup();}
console.log(fails.length?`\n${fails.length} כשלונות`:'\nהכול עבר');
process.exit(fails.length?1:0);
