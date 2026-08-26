// קישור אישי: מה שהמחזיקה בו יכולה, ומה שהיא לא.
// זו הגישה היחידה במערכת שאינה דורשת סיסמה — ולכן הבדיקה כאן היא
// בעיקר על מה *לא* עובד.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
// לקוח anon — בדיוק מה שיש לדפדפן שפותח את הקישור, בלי שום התחברות
const anon  = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

const MONTH = '2096-03';
const S1 = 'קישור בדיקה א', S2 = 'קישור בדיקה ב';
const CODE_A = 'linktestaaaaaaaaaaaa', CODE_B = 'linktestbbbbbbbbbbbb', CODE_REVOKED = 'linktestrrrrrrrrrrrr';

async function cleanup() {
  await admin.from('access_links').delete().in('code', [CODE_A, CODE_B, CODE_REVOKED]);
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  const { data: profs } = await admin.from('profiles').select('id, full_name').like('full_name', 'קישור בדיקה%');
  for (const p of profs || []) { await admin.from('profiles').delete().eq('id', p.id); await admin.auth.admin.deleteUser(p.id).catch(() => {}); }
  await admin.from('schools').delete().in('name', [S1, S2]);
}

try {
  await cleanup();
  const { data: s1 } = await admin.from('schools').insert({ name: S1, reform: 'ofek' }).select().single();
  const { data: s2 } = await admin.from('schools').insert({ name: S2, reform: 'ofek' }).select().single();
  await admin.from('months').insert({ key: MONTH });

  const mk = async (name, school) => {
    const { data, error } = await admin.auth.admin.createUser({ email: `lt-${Math.random().toString(36).slice(2)}@link.local`, email_confirm: true });
    if (error) throw new Error('יצירת משתמשת נכשלה: ' + error.message);
    const { error: pe } = await admin.from('profiles').insert({ id: data.user.id, full_name: name, role: 'principal', school_id: school });
    if (pe) throw new Error('יצירת פרופיל נכשלה: ' + pe.message);
    return data.user.id;
  };
  const pA = await mk('קישור בדיקה מנהלת א', s1.id);
  const pB = await mk('קישור בדיקה מנהלת ב', s2.id);
  const { error: linkErr } = await admin.from('access_links').insert([
    { code: CODE_A, profile_id: pA, revoked: false },
    { code: CODE_B, profile_id: pB, revoked: false },
    { code: CODE_REVOKED, profile_id: pA, revoked: true },
  ]);
  if (linkErr) throw new Error('יצירת הקישורים נכשלה: ' + linkErr.message);

  const { data: rowA } = await admin.from('teacher_months')
    .insert({ month_key: MONTH, school_id: s1.id, name: 'מורה א', frontal_hours: 26, scope_pct: 100, official_gross: 12000 })
    .select().single();
  const { data: rowB } = await admin.from('teacher_months')
    .insert({ month_key: MONTH, school_id: s2.id, name: 'מורה ב', frontal_hours: 20 })
    .select().single();

  // ══ 1. הטבלאות עצמן סגורות ל-anon ══
  const { data: direct } = await anon.from('teacher_months').select('id');
  check('anon אינו קורא ישירות מטבלת השכר', (direct || []).length === 0, `${direct?.length} שורות`);
  const { data: dSchools } = await anon.from('schools').select('id');
  check('anon אינו קורא ישירות מבתי הספר', (dSchools || []).length === 0, `${dSchools?.length} שורות`);
  const { data: dLinks } = await anon.from('access_links').select('code');
  check('anon אינו יכול לשלוף את רשימת הקודים', (dLinks || []).length === 0, `${dLinks?.length} שורות`);

  // ══ 2. קוד תקף ══
  const { data: who } = await anon.rpc('link_whoami', { p_code: CODE_A });
  check('קוד תקף מזהה את המנהלת', who?.[0]?.full_name === 'קישור בדיקה מנהלת א', JSON.stringify(who?.[0] || {}));
  check('ומחזיר את בית ספרה', who?.[0]?.school_name === S1);

  const { data: rows } = await anon.rpc('link_rows', { p_code: CODE_A, p_month: MONTH });
  check('רואה את השורות של בית ספרה', (rows || []).length === 1 && rows[0].name === 'מורה א', `${rows?.length} שורות`);
  check('ואינה רואה בית ספר אחר', !(rows || []).some(r => r.school_id === s2.id));

  // ══ 3. קודים לא תקפים ══
  for (const [label, code] of [['קוד שגוי', 'zzzzzzzzzzzzzzzzzzzz'], ['קוד מבוטל', CODE_REVOKED], ['קוד ריק', '']]) {
    const { data: w } = await anon.rpc('link_whoami', { p_code: code });
    const { data: r } = await anon.rpc('link_rows', { p_code: code, p_month: MONTH });
    check(`${label} אינו מזהה אף אחת`, (w || []).length === 0);
    check(`${label} אינו מחזיר שורות`, (r || []).length === 0);
  }

  // ══ 4. שמירה דרך הקוד ══
  const { error: saveErr } = await anon.rpc('link_save_row', {
    p_code: CODE_A, p_row: { id: rowA.id, frontal_hours: 18, scope_pct: 69 },
  });
  check('שמירה בקוד תקף עוברת', !saveErr, saveErr?.message?.slice(0, 60) || '');
  const { data: after } = await admin.from('teacher_months').select('frontal_hours, approved, changed_at').eq('id', rowA.id).single();
  check('השעות נשמרו', after.frontal_hours === 18, String(after.frontal_hours));
  check('השינוי החזיר את המורה לתור', !after.approved && !!after.changed_at);

  // ══ 5. מה שקוד לא יכול ══
  const { error: crossErr } = await anon.rpc('link_save_row', {
    p_code: CODE_A, p_row: { id: rowB.id, frontal_hours: 5 },
  });
  check('קוד של בית ספר אחד אינו עורך בית ספר אחר', !!crossErr, crossErr?.message?.slice(0, 60) || 'לא נחסם');
  const { data: bStill } = await admin.from('teacher_months').select('frontal_hours').eq('id', rowB.id).single();
  check('והשורה של בית הספר האחר לא נגעה', bStill.frontal_hours === 20, String(bStill.frontal_hours));

  // הקוד אינו יכול לגעת בכסף — השדות האלה כלל אינם ב-link_save_row
  await anon.rpc('link_save_row', { p_code: CODE_A, p_row: { id: rowA.id, official_gross: 99999, approved: true } });
  const { data: money } = await admin.from('teacher_months').select('official_gross, approved').eq('id', rowA.id).single();
  check('קוד אינו מזין שכר רשמי', money.official_gross !== 99999, String(money.official_gross));
  check('קוד אינו מאשר', money.approved === false);

  const { error: revokedSave } = await anon.rpc('link_save_row', { p_code: CODE_REVOKED, p_row: { id: rowA.id, frontal_hours: 1 } });
  check('קוד מבוטל אינו שומר', !!revokedSave, revokedSave?.message?.slice(0, 50) || 'לא נחסם');

  // ══ 6. חודש נעול ══
  await admin.from('months').update({ locked: true }).eq('key', MONTH);
  const { error: lockedErr } = await anon.rpc('link_save_row', { p_code: CODE_A, p_row: { id: rowA.id, frontal_hours: 12 } });
  check('חודש נעול חוסם גם דרך קישור', !!lockedErr, lockedErr?.message?.slice(0, 50) || 'לא נחסם');
  await admin.from('months').update({ locked: false }).eq('key', MONTH);

  // ══ 7. שימוש אחרון נרשם ══
  const { data: link } = await admin.from('access_links').select('last_used_at').eq('code', CODE_A).single();
  check('נרשם מתי הקישור שימש לאחרונה', !!link.last_used_at);
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 160));
} finally {
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
