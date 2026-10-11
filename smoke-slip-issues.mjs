// בעיות בתלושי שכר מהקישור של המנהלת (11.10.26): מה שהמחזיקה בקישור יכולה, ומה שלא.
// רץ מול מסד הבדיקות בלבד (test-env.mjs).
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon  = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

const S1 = 'תלוש בדיקה א', S2 = 'תלוש בדיקה ב';
const CODE_A = 'sliptestaaaaaaaaaaaa', CODE_B = 'sliptestbbbbbbbbbbbb', CODE_REVOKED = 'sliptestrrrrrrrrrrrr';

async function cleanup() {
  await admin.from('access_links').delete().in('code', [CODE_A, CODE_B, CODE_REVOKED]);
  const { data: sch } = await admin.from('schools').select('id').in('name', [S1, S2]);
  if (sch?.length) await admin.from('slip_issues').delete().in('school_id', sch.map(s => s.id));
  const { data: profs } = await admin.from('profiles').select('id').like('full_name', 'תלוש בדיקה%');
  for (const p of profs || []) { await admin.from('profiles').delete().eq('id', p.id); await admin.auth.admin.deleteUser(p.id).catch(() => {}); }
  await admin.from('schools').delete().in('name', [S1, S2]);
}

try {
  await cleanup();
  const { data: s1 } = await admin.from('schools').insert({ name: S1, reform: 'ofek' }).select().single();
  const { data: s2 } = await admin.from('schools').insert({ name: S2, reform: 'ofek' }).select().single();
  const mk = async (name, school) => {
    const { data, error } = await admin.auth.admin.createUser({ email: `st-${Math.random().toString(36).slice(2)}@link.local`, email_confirm: true });
    if (error) throw new Error('יצירת משתמשת נכשלה: ' + error.message);
    const { error: pe } = await admin.from('profiles').insert({ id: data.user.id, full_name: name, role: 'principal', school_id: school });
    if (pe) throw new Error('יצירת פרופיל נכשלה: ' + pe.message);
    return data.user.id;
  };
  const pA = await mk('תלוש בדיקה מנהלת א', s1.id);
  const pB = await mk('תלוש בדיקה מנהלת ב', s2.id);
  const { error: linkErr } = await admin.from('access_links').insert([
    { code: CODE_A, profile_id: pA, revoked: false },
    { code: CODE_B, profile_id: pB, revoked: false },
    { code: CODE_REVOKED, profile_id: pA, revoked: true },
  ]);
  if (linkErr) throw new Error('יצירת קישורים נכשלה: ' + linkErr.message);

  const add = await anon.rpc('link_slip_issue_add', { p_code: CODE_A, p_name: '  רבקה   כהן ', p_issue: 'חסרות שעות בתלוש' });
  check('מנהלת מדווחת בעיה בתלוש מהקישור', !add.error && add.data?.status === 'open' && add.data?.school_id === s1.id && add.data?.teacher_name === 'רבקה כהן', add.error?.message);

  const bad = await anon.rpc('link_slip_issue_add', { p_code: 'nosuchcodexxxxxxxxxx', p_name: 'רבקה כהן', p_issue: 'בעיה בתלוש' });
  check('קוד שאינו קיים נדחה', !!bad.error);
  const rev = await anon.rpc('link_slip_issue_add', { p_code: CODE_REVOKED, p_name: 'רבקה כהן', p_issue: 'בעיה בתלוש' });
  check('קישור שבוטל נדחה', !!rev.error);
  const short = await anon.rpc('link_slip_issue_add', { p_code: CODE_A, p_name: 'רבקה כהן', p_issue: 'א' });
  check('תיאור קצר מדי נדחה', !!short.error);

  const la = await anon.rpc('link_slip_issues', { p_code: CODE_A });
  const lb = await anon.rpc('link_slip_issues', { p_code: CODE_B });
  check('בית ספר רואה רק את הדיווחים שלו', !la.error && la.data?.length === 1 && !lb.error && lb.data?.length === 0, la.error?.message || lb.error?.message);

  const direct = await anon.from('slip_issues').select('id');
  check('גולש בלי התחברות אינו קורא את הטבלה ישירות', !!direct.error || (direct.data || []).length === 0);
  const directWrite = await anon.from('slip_issues').insert({ school_id: s1.id, month_key: '2096-03', teacher_name: 'מישהי', issue: 'ניסיון כתיבה ישירה' });
  check('גולש בלי התחברות אינו כותב לטבלה ישירות', !!directWrite.error);

  const id = add.data?.id;
  const { error: dErr } = await admin.from('slip_issues').update({ status: 'done', resolution: 'תוקן' }).eq('id', id);
  const after = await anon.rpc('link_slip_issues', { p_code: CODE_A });
  check('אחרי "טופל" המנהלת רואה את התשובה ואת מועד הסימון', !dErr && after.data?.[0]?.status === 'done' && after.data?.[0]?.resolution === 'תוקן' && !!after.data?.[0]?.resolved_at, dErr?.message);
  const { error: rErr } = await admin.from('slip_issues').update({ status: 'open' }).eq('id', id);
  const reopened = await anon.rpc('link_slip_issues', { p_code: CODE_A });
  check('פתיחה מחדש מנקה את הסימון והתשובה', !rErr && reopened.data?.[0]?.status === 'open' && !reopened.data?.[0]?.resolved_at && !reopened.data?.[0]?.resolution, rErr?.message);
} catch (e) {
  check('הבדיקה רצה עד הסוף', false, e.message);
} finally {
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} נכשלו` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
