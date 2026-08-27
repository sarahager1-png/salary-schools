import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(Boolean)
  .filter(l=>!l.trimStart().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});

const {data:schools}=await admin.from('schools').select('id,name').order('name');
const {data:rows}=await admin.from('teacher_months').select('school_id, name, phone, email, official_gross, official_gross_pre, reform');
const {data:links}=await admin.from('access_links')
  .select('profile_id, last_used_at, revoked, profiles(full_name, school_id)').eq('revoked',false);

const byLink=new Map((links||[]).map(l=>[l.profiles?.school_id, l]));
console.log('בית ספר'.padEnd(22)+'נכנסה'.padEnd(18)+'עובדים'.padEnd(9)+'חסר קשר');
console.log('─'.repeat(62));
let total=0, entered=0;
for(const s of schools||[]){
  const mine=(rows||[]).filter(r=>r.school_id===s.id);
  const l=byLink.get(s.id);
  const when=l?.last_used_at ? new Date(l.last_used_at).toLocaleString('he-IL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
  const noContact=mine.filter(r=>!r.phone||!r.email).length;
  total+=mine.length; if(l?.last_used_at) entered++;
  console.log(s.name.padEnd(22)+when.padEnd(18)+String(mine.length).padEnd(9)+(noContact||'—'));
}
console.log('─'.repeat(62));
console.log(`${entered} מתוך ${(schools||[]).length} נכנסו · ${total} עובדי הוראה הוזנו`);
if(total){
  const sim=(rows||[]).filter(r=>r.reform==='ofek' ? (r.official_gross&&r.official_gross_pre) : r.official_gross).length;
  console.log(`מתוכם ${sim} עם סימולציה מלאה`);
}
