import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(Boolean)
  .filter(l=>!l.trimStart().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const {data:m}=await admin.from('months').select('key').order('key');
console.log(m.map(x=>x.key).join(', ')||'(אין)');
