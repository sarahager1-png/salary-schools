import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(Boolean)
  .filter(l=>!l.trimStart().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const REAL=['בית חינוך עפולה','בית חינוך רעננה','שלהבות אור עקיבא','שלהבות אשקלון','שלהבות גני תקוה','שלהבות ירושלים','שלהבות מזכרת בתיה','שלהבות רמת ישי'];
// חודש העבודה נשמר; כל השאר, אם הוא ריק, הוא שריד בדיקה.
// בלי פרמטר אין ברירת מחדל: חודש מקודד קשיח מחק פעם אחת את חודש
// העבודה עצמו, כי הוא כבר לא היה זה שנרשם כאן.
const KEEP=process.argv[2];
if(!KEEP){ console.error('שימוש: node scripts/tidy.mjs <חודש-לשמור>   (למשל 2026-09)'); process.exit(1); }
const {data:schools}=await admin.from('schools').select('id,name');
for(const s of (schools||[]).filter(x=>!REAL.includes(x.name))){
  await admin.from('teacher_months').delete().eq('school_id',s.id);
  const {data:ps}=await admin.from('profiles').select('id').eq('school_id',s.id);
  for(const x of ps||[]){await admin.from('access_links').delete().eq('profile_id',x.id);
    await admin.from('profiles').delete().eq('id',x.id);await admin.auth.admin.deleteUser(x.id).catch(()=>{});}
  await admin.from('schools').delete().eq('id',s.id);
  console.log('בית ספר בדיקה נמחק: '+s.name);
}
const {data:allUsers}=await admin.auth.admin.listUsers();
for(const u of (allUsers?.users||[]).filter(x=>/@example\.com$/i.test(x.email||''))){
  await admin.from('access_links').delete().eq('profile_id',u.id);
  await admin.from('profiles').delete().eq('id',u.id);
  await admin.auth.admin.deleteUser(u.id).catch(()=>{});
  console.log('משתמש בדיקה נמחק: '+u.email);
}
const {data:months}=await admin.from('months').select('key');
for(const m of (months||[]).filter(x=>x.key!==KEEP)){
  const {count}=await admin.from('teacher_months').select('id',{count:'exact',head:true}).eq('month_key',m.key);
  if(count){console.log(`${m.key} מכיל ${count} שורות — לא נגעתי`);continue;}
  await admin.from('month_documents').delete().eq('month_key',m.key);
  await admin.from('months').delete().eq('key',m.key);
  console.log('חודש שריד נמחק: '+m.key);
}
const {data:m2}=await admin.from('months').select('key').order('key');
const {data:s2}=await admin.from('schools').select('name');
const {data:t2}=await admin.from('teacher_months').select('id');
const {data:u2}=await admin.auth.admin.listUsers();
const {data:p2}=await admin.from('profiles').select('id');
const orphan=(u2?.users||[]).filter(u=>!p2.some(x=>x.id===u.id)).length;
console.log(`\nחודשים: ${m2.map(x=>x.key).join(', ')} · בתי ספר: ${s2.length} · שורות: ${t2.length} · משתמשים יתומים: ${orphan}`);
