// גב' חני זלמנוב (רעננה) — חופשת לידה עד סוף דצמבר 2026 (שרה, 15.9.2026)
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth:{persistSession:false} });
const { data: schools } = await sb.from('schools').select('id,name'); const s = schools.find(x=>x.name.includes('רעננה'));
const { data: [r] } = await sb.from('teacher_months').select('id,name,leave_type,leave_from,leave_to').eq('month_key','2026-09').eq('school_id',s.id).eq('name','חני זלמנוב');
console.log('לפני:', JSON.stringify(r));
const patch = { leave_type:'maternity', leave_from: r.leave_from || '2026-09-01', leave_to:'2026-12-31' };
const { error } = await sb.from('teacher_months').update(patch).eq('id', r.id);
console.log(error ? 'שגיאה: '+error.message : '✓ עודכן '+JSON.stringify(patch));
const { data: [a] } = await sb.from('teacher_months').select('name,leave_type,leave_from,leave_to').eq('id', r.id);
console.log('אחרי:', JSON.stringify(a));
