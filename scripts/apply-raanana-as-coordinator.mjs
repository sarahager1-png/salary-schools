// שלוש הזנות ברעננה שהשרת אינו רשאי לבצע (שדות של שרה בלבד), מבוצעות דרך
// חשבון המתאמת qa-bot@reshetch.org.il בקישור-קסם חד-פעמי, בלי סיסמה.
// הכרעות שרה 15.9.2026:
//   · גב' דרייזי אשכנזי — ברוטו מוסכם 19,086
//   · גב' דינה שכטר — ממלאת מקום של חני זלמנוב, 1.9.2026 עד 31.12.2026, שיבוץ זמני
//   · "חני מור יוסף" — שם → חני עטייה
// הרצה מתיקיית הפרויקט:  node scripts/apply-raanana-as-coordinator.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const EMAIL = 'qa-bot@reshetch.org.il';

const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
if (le) { console.log('generateLink:', le.message); process.exit(1); }
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sess, error: ve } = await user.auth.verifyOtp({ email: EMAIL, token: link.properties.email_otp, type: 'magiclink' });
if (ve) { console.log('verifyOtp:', ve.message); process.exit(1); }
console.log('מחוברת כ-', sess.user.email);

const { data: schools } = await user.from('schools').select('id,name');
const s = schools.find(x => x.name.includes('רעננה'));
const { data: rows } = await user.from('teacher_months').select('id,name').eq('month_key', '2026-09').eq('school_id', s.id);
const id = n => rows.find(r => r.name.trim() === n)?.id;
const upd = async (n, patch) => {
  if (!id(n)) { console.log(`✗ ${n}: לא נמצאה`); return; }
  const { error } = await user.from('teacher_months').update(patch).eq('id', id(n));
  console.log(error ? `✗ ${n}: ${error.message}` : `✓ ${n} ${JSON.stringify(patch)}`);
};
await upd('דרייזי אשכנזי', { agreed_gross: 19086 });
await upd('דינה שכטר', { mm_for: 'חני זלמנוב', mm_from: '2026-09-01', mm_to: '2026-12-31', is_temp: true, end_date: '2026-12-31' });
await upd('חני מור יוסף', { name: 'חני עטייה' });

const { data: after } = await user.from('teacher_months').select('name,agreed_gross,mm_for,mm_to,is_temp')
  .eq('month_key', '2026-09').eq('school_id', s.id).in('name', ['דרייזי אשכנזי', 'דינה שכטר', 'חני עטייה', 'חני מור יוסף']);
console.log('אחרי:', JSON.stringify(after));
await user.auth.signOut();
