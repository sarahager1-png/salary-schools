// אימות ישיר של חל"ד מול השרת — עוקף את הדפדפן, שהסינון חוסם לו לפעמים
// את קריאות ה-RPC.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(Boolean).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const anon=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const fails=[]; const check=(n,ok,e='')=>{console.log(`${ok?'PASS':'FAIL'}  ${n}${e?' — '+e:''}`);if(!ok)fails.push(n);};
const M='2097-11',C='leavetestaaaaaaaaaaa',S='חלד בדיקה';
const clean=async()=>{await admin.from('access_links').delete().eq('code',C);
 await admin.from('teacher_months').delete().eq('month_key',M);await admin.from('months').delete().eq('key',M);
 const {data:ps}=await admin.from('profiles').select('id').like('full_name','חלד בדיקה%');
 for(const x of ps||[]){await admin.from('profiles').delete().eq('id',x.id);await admin.auth.admin.deleteUser(x.id).catch(()=>{});}
 await admin.from('schools').delete().eq('name',S);};
try{
  await clean();
  const {data:sc}=await admin.from('schools').insert({name:S,reform:'ofek'}).select().single();
  await admin.from('months').insert({key:M});
  const {data:u}=await admin.auth.admin.createUser({email:`lv-${Math.random().toString(36).slice(2)}@link.local`,email_confirm:true});
  await admin.from('profiles').insert({id:u.user.id,full_name:'חלד בדיקה מנהלת',role:'principal',school_id:sc.id});
  await admin.from('access_links').insert({code:C,profile_id:u.user.id,revoked:false});

  // הוספה עם חל"ד ותאריכים
  const {data:added,error:ae}=await anon.rpc('link_add_row',{p_code:C,p_month:M,p_row:{
    name:'יולדת בדיקה',reform:'ofek',degree:'BA',grade:'3',seniority:5,frontal_hours:26,
    leave_type:'maternity',leave_from:'2097-11-15',leave_to:'2098-03-15'}});
  check('הוספה עם חל"ד ותאריכים',!ae&&added?.leave_type==='maternity'&&added?.leave_from==='2097-11-15'&&added?.leave_to==='2098-03-15',
    ae?.message||JSON.stringify({t:added?.leave_type,f:added?.leave_from,to:added?.leave_to}));

  // מורה עובדת → יציאה לחל"ד מבטלת סימולציה ואישור
  const {data:t2}=await anon.rpc('link_add_row',{p_code:C,p_month:M,p_row:{name:'עובדת בדיקה',reform:'ofek',degree:'BA',grade:'3',seniority:5,frontal_hours:26}});
  await admin.from('teacher_months').update({official_gross:12000,official_gross_pre:11000}).eq('id',t2.id);
  const {data:left,error:le}=await anon.rpc('link_save_row',{p_code:C,p_row:{id:t2.id,leave_type:'maternity',leave_from:'2097-12-01'}});
  check('יציאה לחל"ד נרשמת',!le&&left?.leave_type==='maternity'&&left?.leave_from==='2097-12-01',le?.message||JSON.stringify({t:left?.leave_type,f:left?.leave_from}));
  check('ומבטלת את הסימולציה והאישור',left?.official_gross===null&&left?.approved===false);

  // חזרה לעבודה מנקה תאריכים
  const {data:back}=await anon.rpc('link_save_row',{p_code:C,p_row:{id:t2.id,leave_type:'none',leave_from:'',leave_to:''}});
  check('חזרה לעבודה מנקה את התאריכים',back?.leave_type==='none'&&back?.leave_from===null&&back?.leave_to===null,
    JSON.stringify({t:back?.leave_type,f:back?.leave_from,to:back?.leave_to}));

  // תאריך חזרה לפני היציאה נדחה במסד
  const {error:orderErr}=await anon.rpc('link_save_row',{p_code:C,p_row:{id:t2.id,leave_type:'unpaid',leave_from:'2098-01-01',leave_to:'2097-12-01'}});
  check('תאריך חזרה לפני היציאה נדחה',!!orderErr,orderErr?.message?.slice(0,70)||'עבר!');

  // חופשה בלי תאריך
  const {error:noDate}=await anon.rpc('link_save_row',{p_code:C,p_row:{id:t2.id,leave_type:'sick'}});
  check('חופשה בלי תאריך נחסמת בעברית',/תאריך יציאה/.test(noDate?.message||''),noDate?.message?.slice(0,70)||'עבר!');
}catch(e){check('הרצה ללא חריגה',false,e.message?.slice(0,200));}
finally{await clean();}
console.log(fails.length?`\n${fails.length} כשלונות`:'\nהכול עבר');
process.exit(fails.length?1:0);
