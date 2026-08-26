import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(Boolean).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
// 0547747443 -> +972547747443
const e164 = local => '+972' + String(local).replace(/\D/g,'').replace(/^0/,'');
const [name, phone] = process.argv.slice(2);
const {data:p}=await admin.from('profiles').select('id, full_name, phone').ilike('full_name', `%${name}%`);
if(!p?.length){ console.error('לא נמצאה: '+name); process.exit(1); }
if(p.length>1){ console.error('יותר מאחת: '+p.map(x=>x.full_name).join(', ')); process.exit(1); }
const {error}=await admin.from('profiles').update({phone:e164(phone)}).eq('id',p[0].id);
if(error){ console.error('נכשל: '+error.message); process.exit(1); }
console.log(`✓ ${p[0].full_name} — ${e164(phone)}`);
