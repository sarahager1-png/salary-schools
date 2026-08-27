// מה יכול לעשות מי שפתח חשבון לבד באתר.
//
// ההרשמה העצמית פתוחה: כל אחד באינטרנט יכול להירשם. השאלה אינה אם הוא
// יכול ליצור חשבון — הוא יכול — אלא מה החשבון הזה רואה ועושה.
//
//   node smoke-signup.mjs
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const URL = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SECRET = env.SUPABASE_SECRET_KEY;
const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

// נתון אמיתי שיש מה לגנוב ממנו
const SCHOOL = 'בית ספר לבדיקת הרשמה';
{ const { data: old } = await admin.from('schools').select('id').eq('name', SCHOOL);
  for (const x of old || []) { await admin.from('teacher_months').delete().eq('school_id', x.id);
    await admin.from('schools').delete().eq('id', x.id); } }
const { data: school, error: schErr } = await admin.from('schools')
  .insert({ name: SCHOOL, city: 'בדיקה' }).select().single();
if (!school) { console.error('לא נוצר בית ספר: ' + (schErr?.message || '')); process.exit(1); }
await admin.from('months').upsert({ key: '2098-03', locked: false });
await admin.from('teacher_months').insert({
  school_id: school.id, month_key: '2098-03', name: 'עובדת סודית',
  national_id: '999888777', phone: '0500000000', email: 'secret@example.com',
  reform: 'ofek', seniority: 9, frontal_hours: 22, official_gross: 14321,
});

const guest = createClient(URL, ANON, { auth: { persistSession: false } });
const email = `stranger-${Math.random().toString(36).slice(2, 9)}@gmail.com`;
const PW = 'Str@nger12345';

// ההרשמה העצמית פתוחה — אימות מול הגדרות הפרויקט, בלי ליצור חשבון דרכה
// ובלי לשלוח דואר לכתובת שאינה קיימת.
const settings = await fetch(URL + '/auth/v1/settings', { headers: { apikey: ANON } }).then(r => r.json());
check('ההרשמה העצמית פתוחה', settings.disable_signup === false, `disable_signup=${settings.disable_signup}`);

// מצב הסיום של נרשם מהרחוב: משתמש מחובר בלי פרופיל.
const { data: su } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
check('נוצר משתמש בלי פרופיל', !!su?.user, email);
await guest.auth.signInWithPassword({ email, password: PW });
check('והוא מחובר', !!(await guest.auth.getUser()).data?.user, '');

const readable = [];
for (const t of ['schools', 'months', 'teacher_months', 'profiles', 'access_links', 'month_documents', 'actual_costs']) {
  const { data, error } = await guest.from(t).select('*').limit(5);
  const n = (data || []).length;
  if (n) readable.push(`${t}:${n}`);
  check(`${t} — אינו נקרא`, n === 0, error ? error.message.slice(0, 40) : `${n} שורות`);
}

const { error: wErr } = await guest.from('teacher_months').insert({
  school_id: school.id, month_key: '2098-03', name: 'שורה של זר',
});
check('אינו יכול לכתוב שורת עובדת', !!wErr, wErr?.message?.slice(0, 50) || 'נכתב!');

const { error: pErr } = await guest.from('profiles').insert({ id: su.user.id, full_name: 'זר', role: 'coordinator' });
check('אינו יכול להעניק לעצמו תפקיד', !!pErr, pErr?.message?.slice(0, 50) || 'הצליח!');

const { data: rpc } = await guest.rpc('link_whoami', { p_code: 'aaaaaaaaaaaaaaaaaaaa' }).then(r => r, () => ({}));
check('קוד קישור מומצא אינו פותח דבר', !rpc || (Array.isArray(rpc) && !rpc.length) || rpc === null, JSON.stringify(rpc || null).slice(0, 40));

await admin.from('teacher_months').delete().eq('school_id', school.id);
await admin.from('schools').delete().eq('id', school.id);
await admin.from('months').delete().eq('key', '2098-03');
await admin.auth.admin.deleteUser(su.user.id).catch(() => {});

console.log(readable.length
  ? `\nחשוף לכל נרשם: ${readable.join(', ')}`
  : '\nנרשם מהרחוב אינו רואה ואינו כותב דבר. החשיפה היא חשבונות זבל בלבד.');
process.exit(fails.length ? 1 : 0);
