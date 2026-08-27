// טלפון ומייל של עובד/ת הוראה — דרך הקישור ודרך המסך המחובר.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(Boolean)
  .filter(l=>!l.trimStart().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const anon=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const fails=[]; const check=(n,ok,e='')=>{console.log(`${ok?'PASS':'FAIL'}  ${n}${e?' — '+e:''}`);if(!ok)fails.push(n);};
const M='2097-04',C='phonetestaaaaaaaaaaa',S='טלפון בדיקה';
const clean=async()=>{await admin.from('access_links').delete().eq('code',C);
 await admin.from('teacher_months').delete().eq('month_key',M);await admin.from('months').delete().eq('key',M);
 const {data:ps}=await admin.from('profiles').select('id').like('full_name','טלפון בדיקה%');
 for(const x of ps||[]){await admin.from('profiles').delete().eq('id',x.id);await admin.auth.admin.deleteUser(x.id).catch(()=>{});}
 await admin.from('schools').delete().eq('name',S);};
try{
  await clean();
  const {data:sc}=await admin.from('schools').insert({name:S,reform:'ofek'}).select().single();
  await admin.from('months').insert({key:M});
  const {data:u}=await admin.auth.admin.createUser({email:`ph-${Math.random().toString(36).slice(2)}@link.local`,email_confirm:true});
  await admin.from('profiles').insert({id:u.user.id,full_name:'טלפון בדיקה מנהלת',role:'principal',school_id:sc.id});
  await admin.from('access_links').insert({code:C,profile_id:u.user.id,revoked:false});

  const {data:added,error:ae}=await anon.rpc('link_add_row',{p_code:C,p_month:M,p_row:{
    name:'עובדת עם טלפון', phone:'054-1234567', email:'t@example.com', reform:'ofek', frontal_hours:26}});
  check('הוספה עם טלפון ומייל',!ae&&added?.phone==='054-1234567'&&added?.email==='t@example.com',
    ae?.message||JSON.stringify({p:added?.phone,e:added?.email}));

  const {data:upd,error:ue}=await anon.rpc('link_save_row',{p_code:C,p_row:{id:added.id,phone:'052-9998887'}});
  check('עדכון טלפון דרך הקישור',!ue&&upd?.phone==='052-9998887',ue?.message||upd?.phone);
  check('ושינוי טלפון אינו מבטל סימולציה',upd?.changed_at===added.changed_at,'שדה קשר אינו שדה בסיס');

  // צורות שונות של מספר לא נחסמות
  const {error:fe}=await anon.rpc('link_save_row',{p_code:C,p_row:{id:added.id,phone:'+972 54 123 4567'}});
  check('פורמט חופשי אינו נחסם',!fe,fe?.message?.slice(0,60)||'');

  // ── חובה ──
  const {error:noPhone}=await anon.rpc('link_add_row',{p_code:C,p_month:M,p_row:{name:'בלי טלפון',email:'a@b.co'}});
  check('הוספה בלי טלפון נחסמת',/יש למלא טלפון/.test(noPhone?.message||''),noPhone?.message?.slice(0,70)||'עברה!');
  const {error:noMail}=await anon.rpc('link_add_row',{p_code:C,p_month:M,p_row:{name:'בלי מייל',phone:'0541112222'}});
  check('הוספה בלי מייל נחסמת',/יש למלא מייל/.test(noMail?.message||''),noMail?.message?.slice(0,70)||'עברה!');
  const {error:badMail}=await anon.rpc('link_add_row',{p_code:C,p_month:M,p_row:{name:'מייל שגוי',phone:'0541112222',email:'לא-מייל'}});
  check('מייל לא תקין נחסם',/אינה תקינה/.test(badMail?.message||''),badMail?.message?.slice(0,70)||'עבר!');
  const {error:clearPhone}=await anon.rpc('link_save_row',{p_code:C,p_row:{id:added.id,phone:''}});
  check('אי אפשר לרוקן טלפון קיים',/יש למלא טלפון/.test(clearPhone?.message||''),clearPhone?.message?.slice(0,70)||'עבר!');
  const {data:untouched}=await admin.from('teacher_months').select('phone,email').eq('id',added.id).single();
  check('והשורה נשארה שלמה',!!untouched.phone&&!!untouched.email,JSON.stringify(untouched));
  // עדכון שאינו נוגע בקשר עדיין עובר
  const {error:ok2}=await anon.rpc('link_save_row',{p_code:C,p_row:{id:added.id,absence_days:2}});
  check('עדכון אחר אינו נחסם',!ok2,ok2?.message?.slice(0,60)||'');
}catch(e){check('הרצה ללא חריגה',false,e.message?.slice(0,180));}
finally{await clean();}
console.log(fails.length?`\n${fails.length} כשלונות`:'\nהכול עבר');
process.exit(fails.length?1:0);
