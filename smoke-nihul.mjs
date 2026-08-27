// שכר מנהל/ת — דרגת ניהול ורמת מורכבות.
//
// רחל אורנשטיין, מנהלת במזכרת בתיה, הוצגה לפי דרגת אופק 5 של מורה, בלי
// גמול ניהול: calcRoleSupp מחזיר 0 ל-principal, ו-calcGross שלף מטבלת
// המורים. במקביל nihulRequest שלח למחשבון דרגה א ומורכבות 1 קבועות.
//
//   node smoke-nihul.mjs
import fs from 'node:fs';
import { ENV_FILE, URL, ANON, SECRET } from './test-env.mjs';
import { createClient } from '@supabase/supabase-js';
import { nihulRequest } from './src/lib/calc.js';

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
const anon  = createClient(URL, ANON,   { auth: { persistSession: false } });
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

const MONTH = '2098-05';
const SCHOOL = 'בית ספר לבדיקת ניהול';
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const code = Array.from({ length: 20 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

// ניקוי לפני, לא רק אחרי
{ const { data: old } = await admin.from('schools').select('id').eq('name', SCHOOL);
  for (const x of old || []) { await admin.from('teacher_months').delete().eq('school_id', x.id);
    const { data: ps } = await admin.from('profiles').select('id').eq('school_id', x.id);
    for (const p of ps || []) { await admin.from('access_links').delete().eq('profile_id', p.id);
      await admin.from('profiles').delete().eq('id', p.id); await admin.auth.admin.deleteUser(p.id).catch(() => {}); }
    await admin.from('schools').delete().eq('id', x.id); } }

// ── רמת מורכבות היא תכונה של בית הספר ──
const { data: school } = await admin.from('schools')
  .insert({ name: SCHOOL, city: 'בדיקה', reform: 'ofek' }).select().single();
check('רמת מורכבות ברירת המחדל היא 1', school.murkavut === 1, String(school.murkavut));

const { data: s3 } = await admin.from('schools').update({ murkavut: 3 }).eq('id', school.id).select().single();
check('ואפשר לשנות אותה', s3.murkavut === 3, String(s3.murkavut));
const { error: bad } = await admin.from('schools').update({ murkavut: 12 }).eq('id', school.id);
check('מורכבות מחוץ לתחום נדחית', !!bad, bad?.message?.slice(0, 40) || 'התקבלה!');
await admin.from('schools').update({ murkavut: 1 }).eq('id', school.id);

await admin.from('months').upsert({ key: MONTH, locked: false });
const email = `nihul-${Math.random().toString(36).slice(2, 8)}@gmail.com`;
const { data: u } = await admin.auth.admin.createUser({ email, password: 'Nih@l12345', email_confirm: true });
await admin.from('profiles').insert({ id: u.user.id, full_name: 'מנהלת בדיקת ניהול', role: 'principal', school_id: school.id, gender: 'f' });
await admin.from('access_links').insert({ code, profile_id: u.user.id, revoked: false });

// ── המנהלת מזינה את עצמה דרך הקישור ──
const { data: added, error: addErr } = await anon.rpc('link_add_row', {
  p_code: code, p_month: MONTH,
  p_row: { name: 'מנהלת בדיקת ניהול', tz_id: '123456789', phone: '0500000000', email,
           reform: 'ofek', level: 'elementary', degree: 'MA', grade: '5', seniority: 11,
           frontal_hours: 0, scope_pct: 100, gamul_role: 'principal', nihul_grade: '3' },
});
check('שורת מנהלת נוספה דרך הקישור', !!added && !addErr, addErr?.message || '');
check('דרגת הניהול נשמרה', added?.nihul_grade === 3, `nihul_grade=${added?.nihul_grade}`);

// ── מה נשלח למחשבון ──
const t = { degree: 'MA', nihulGrade: added?.nihul_grade, scopePct: 100, role: 'principal' };
const req = nihulRequest(t, MONTH, { murkavut: 1 });
check('דרגת הניהול עוברת למחשבון, לא 1 קבוע', req.body?.DARGA_OFEK === '3', `DARGA_OFEK=${req.body?.DARGA_OFEK}`);
check('המורכבות מגיעה מבית הספר', req.body?.RAMAT_MURKAVUT === '1', `RAMAT_MURKAVUT=${req.body?.RAMAT_MURKAVUT}`);
const req3 = nihulRequest(t, MONTH, { murkavut: 3 });
check('ומשתנה איתו', req3.body?.RAMAT_MURKAVUT === '3', `RAMAT_MURKAVUT=${req3.body?.RAMAT_MURKAVUT}`);
const noGrade = nihulRequest({ ...t, nihulGrade: null }, MONTH, { murkavut: 1 });
check('בלי דרגת ניהול אין מה לשלוח', !!noGrade.skip, noGrade.skip || 'נשלח בכל זאת');

// ── שינוי דרגת ניהול מאפס סימולציה ──
await admin.from('teacher_months').update({ official_gross: 19000, approved: true }).eq('id', added.id);
const { data: saved } = await anon.rpc('link_save_row', {
  p_code: code, p_row: { id: added.id, nihul_grade: '4' },
});
check('שינוי דרגת ניהול שמור', saved?.nihul_grade === 4, `nihul_grade=${saved?.nihul_grade}`);
check('ומאפס את הסימולציה', saved?.official_gross === null, `official_gross=${saved?.official_gross}`);
check('ואת האישור', saved?.approved === false, `approved=${saved?.approved}`);

// ── ניקוי ──
await admin.from('teacher_months').delete().eq('school_id', school.id);
await admin.from('access_links').delete().eq('profile_id', u.user.id);
await admin.from('profiles').delete().eq('id', u.user.id);
await admin.auth.admin.deleteUser(u.user.id).catch(() => {});
await admin.from('schools').delete().eq('id', school.id);
await admin.from('months').delete().eq('key', MONTH);

console.log(fails.length ? `\n${fails.length} נכשלו` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
