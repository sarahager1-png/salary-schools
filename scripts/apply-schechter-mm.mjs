// גב' דינה שכטר = ממלאת המקום של גב' חני זלמנוב (חל"ד עד 31.12.2026) — שרה, 15.9.2026
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth:{persistSession:false} });
const { data: schools } = await sb.from('schools').select('id,name'); const s = schools.find(x=>x.name.includes('רעננה'));
const { data: [r] } = await sb.from('teacher_months').select('id').eq('month_key','2026-09').eq('school_id',s.id).eq('name','דינה שכטר');
const tries = [
  { mm_for:'חני זלמנוב', mm_from:'2026-09-01', is_temp:true, end_date:'2026-12-31' },
  { mm_for:'חני זלמנוב', is_temp:true, end_date:'2026-12-31' },
  { mm_for:'חני זלמנוב', is_temp:true },
  { mm_for:'חני זלמנוב' },
];
for (const patch of tries) {
  const { error } = await sb.from('teacher_months').update(patch).eq('id', r.id);
  console.log(error ? 'נחסם: '+JSON.stringify(patch)+' → '+error.message : '✓ עודכן '+JSON.stringify(patch));
  if (!error) break;
}
const { data: [a] } = await sb.from('teacher_months').select('name,mm_for,mm_from,mm_to,is_temp,end_date').eq('id', r.id);
console.log('אחרי:', JSON.stringify(a));
