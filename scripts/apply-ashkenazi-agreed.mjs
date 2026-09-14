// גב' דרייזי אשכנזי (מנהלת רעננה) — ברוטו מוסכם 19,086 כמו שהיה (שרה, 15.9.2026)
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth:{persistSession:false} });
const { data: schools } = await sb.from('schools').select('id,name'); const s = schools.find(x=>x.name.includes('רעננה'));
const { data: [r] } = await sb.from('teacher_months').select('id,name,official_gross,agreed_gross').eq('month_key','2026-09').eq('school_id',s.id).eq('name','דרייזי אשכנזי');
console.log('לפני:', JSON.stringify(r));
const { error } = await sb.from('teacher_months').update({ agreed_gross: 19086 }).eq('id', r.id);
console.log(error ? 'נחסם: '+error.message : '✓ ברוטו מוסכם 19,086');
const { data: [a] } = await sb.from('teacher_months').select('name,official_gross,agreed_gross').eq('id', r.id);
console.log('אחרי:', JSON.stringify(a));
