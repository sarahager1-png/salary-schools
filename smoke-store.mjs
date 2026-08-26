// בדיקת שכבת הגישה מול בסיס הנתונים האמיתי, עם משתמשים מחוברים באמת.
// יוצרת משתמשי בדיקה, מריצה את הזרימה, ומנקה אחריה.
//
//   node smoke-store.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const URL = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SECRET = env.SUPABASE_SECRET_KEY;

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };
const as = (role) => createClient(URL, ANON, { auth: { persistSession: false } });

const PW = 'Test!' + Math.random().toString(36).slice(2, 10);
const USERS = {
  coordinator: 'store-coord@example.com',
  clerk:       'store-clerk@example.com',
  principal:   'store-prin@example.com',
  network:     'store-net@example.com',
};
// מאשר ייעודי לבית ספר אחד — כמו מענדי לעפולה וחנה לרעננה
const DEDICATED = 'store-dedicated@example.com';
const ids = {};
let schoolId, otherId, teacherId;
const MONTH = '2098-01';

const TEST_SCHOOLS = ['סטור א', 'סטור ב'];

async function cleanup() {
  // המשתמשים קודם: הפרופילים שלהם מצביעים על בתי הספר של הבדיקה
  const { data } = await admin.auth.admin.listUsers();
  for (const email of [...Object.values(USERS), DEDICATED, 'store-ghost@example.com']) {
    const u = data?.users?.find(x => x.email === email);
    if (u) {
      await admin.from('profiles').delete().eq('id', u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  const { error } = await admin.from('schools').delete().in('name', TEST_SCHOOLS);
  if (error) console.error('ניקוי בתי הספר נכשל:', error.message);
}

// הבדיקה לא משאירה זבל אחריה — וזה נבדק, לא מונח
async function assertClean() {
  const { data } = await admin.from('schools').select('name').in('name', TEST_SCHOOLS);
  check('הבדיקה ניקתה אחריה', (data || []).length === 0,
    (data || []).map(s => s.name).join(', ') || '');
}

try {
  await cleanup();

  // ── הכנה ──
  const { data: s1 } = await admin.from('schools').insert({ name: 'סטור א', city: 'עיר', reform: 'ofek', hours_quota: 100 }).select().single();
  const { data: s2 } = await admin.from('schools').insert({ name: 'סטור ב', city: 'עיר', reform: 'pre' }).select().single();
  schoolId = s1.id; otherId = s2.id;
  await admin.from('months').insert({ key: MONTH });

  for (const [role, email] of Object.entries(USERS)) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    if (error) throw error;
    ids[role] = data.user.id;
    await admin.from('profiles').insert({
      id: data.user.id, full_name: role, role,
      school_id: role === 'principal' ? schoolId : null,
    });
  }

  const { data: tRow } = await admin.from('teacher_months')
    .insert({ month_key: MONTH, school_id: schoolId, name: 'מורה סטור', frontal_hours: 26, scope_pct: 100 })
    .select().single();
  teacherId = tRow.id;
  await admin.from('teacher_months')
    .insert({ month_key: MONTH, school_id: otherId, name: 'מורה בבית ספר אחר' });

  // ── 1. התחברות ופרופיל ──
  const cli = as();
  const { error: signErr } = await cli.auth.signInWithPassword({ email: USERS.principal, password: PW });
  check('התחברות עם מייל וסיסמה', !signErr, signErr?.message || '');
  const { data: prof } = await cli.from('profiles').select('role, school_id').eq('id', ids.principal).maybeSingle();
  check('הפרופיל מחזיר תפקיד ובית ספר', prof?.role === 'principal' && prof?.school_id === schoolId,
    JSON.stringify(prof));

  // ── 2. מנהלת רואה רק את בית ספרה ──
  const { data: seen } = await cli.from('teacher_months').select('id, name');
  check('מנהלת רואה שורה אחת בלבד', seen?.length === 1, `${seen?.length} שורות`);
  check('וזו השורה של בית ספרה', seen?.[0]?.name === 'מורה סטור');

  // ── 3. מנהלת: שעות כן, כסף לא ──
  const { error: hoursErr } = await cli.from('teacher_months').update({ frontal_hours: 20 }).eq('id', teacherId);
  check('מנהלת משנה שעות פרונטליות', !hoursErr, hoursErr?.message || '');
  const { error: moneyErr } = await cli.from('teacher_months').update({ official_gross: 9999 }).eq('id', teacherId);
  check('מנהלת נחסמת משינוי שכר', !!moneyErr, moneyErr?.message?.slice(0, 60) || 'לא נחסמה');
  const { error: apprErr } = await cli.from('teacher_months').update({ approved: true }).eq('id', teacherId);
  check('מנהלת נחסמת מאישור', !!apprErr, apprErr?.message?.slice(0, 60) || 'לא נחסמה');

  // ── 4. חשבת שכר ──
  await cli.auth.signOut();
  await cli.auth.signInWithPassword({ email: USERS.clerk, password: PW });
  const { data: all } = await cli.from('teacher_months').select('id');
  check('חשבת שכר רואה את כל הרשת', all?.length === 2, `${all?.length} שורות`);
  const { error: simErr } = await cli.from('teacher_months')
    .update({ official_gross: 12500, official_gross_pre: 11200 }).eq('id', teacherId);
  check('חשבת שכר מזינה שתי סימולציות', !simErr, simErr?.message?.slice(0, 60) || '');
  const { error: nameErr } = await cli.from('teacher_months').update({ name: 'שם אחר' }).eq('id', teacherId);
  check('חשבת שכר נחסמת משינוי שם', !!nameErr, nameErr?.message?.slice(0, 50) || 'לא נחסמה');

  // ── 5. רינה לפני ואחרי השליח ──
  await cli.auth.signOut();
  await cli.auth.signInWithPassword({ email: USERS.network, password: PW });
  const { error: earlyErr } = await cli.from('teacher_months').update({ net_approved: true }).eq('id', teacherId);
  check('רינה נחסמת מאישור לפני השליח', !!earlyErr, earlyErr?.message?.slice(0, 60) || 'לא נחסמה');

  await cli.auth.signOut();
  await cli.auth.signInWithPassword({ email: USERS.coordinator, password: PW });
  const { error: cErr } = await cli.from('teacher_months').update({ approved: true }).eq('id', teacherId);
  check('השליח מאשר', !cErr, cErr?.message?.slice(0, 60) || '');
  const { data: signed } = await admin.from('teacher_months').select('approved_by, approved_at').eq('id', teacherId).single();
  check('חתימת המאשר נחתמה בשרת', signed.approved_by === ids.coordinator && !!signed.approved_at,
    JSON.stringify(signed).slice(0, 60));

  await cli.auth.signOut();
  await cli.auth.signInWithPassword({ email: USERS.network, password: PW });
  const { error: netErr } = await cli.from('teacher_months').update({ net_approved: true }).eq('id', teacherId);
  check('רינה מאשרת אחרי השליח', !netErr, netErr?.message?.slice(0, 60) || '');

  // ── 6. יומן אירועים ──
  const { data: log } = await cli.from('audit_log').select('action').eq('row_id', teacherId);
  const actions = (log || []).map(x => x.action);
  check('היומן תיעד סימולציה, אישור ואישור רשתי',
    actions.includes('simulation_entered') && actions.includes('approved') && actions.includes('net_approved'),
    actions.join(', '));

  // ── 7. חודש נעול ──
  await cli.auth.signOut();
  await cli.auth.signInWithPassword({ email: USERS.coordinator, password: PW });
  await cli.from('months').update({ locked: true }).eq('key', MONTH);
  await cli.auth.signOut();
  await cli.auth.signInWithPassword({ email: USERS.principal, password: PW });
  const { error: lockedErr } = await cli.from('teacher_months').update({ frontal_hours: 5 }).eq('id', teacherId);
  check('חודש נעול חוסם את המנהלת', !!lockedErr, lockedErr?.message?.slice(0, 50) || 'לא נחסמה');

  // ── 8. מאשר ייעודי לבית ספר ──
  // מענדי מאשר את עפולה, חנה את רעננה, רינה את כל השאר.
  const { data: ded } = await admin.auth.admin.createUser({ email: DEDICATED, password: PW, email_confirm: true });
  await admin.from('profiles').insert({ id: ded.user.id, full_name: 'מאשר ייעודי', role: 'network', school_id: otherId });

  const cliD = as();
  await cliD.auth.signInWithPassword({ email: DEDICATED, password: PW });
  const { data: dedSees } = await cliD.from('teacher_months').select('school_id');
  check('מאשר ייעודי רואה רק את בית ספרו',
    (dedSees || []).length === 1 && dedSees[0].school_id === otherId, `${dedSees?.length} שורות`);

  // רינה כבר לא רואה את בית הספר שיש לו מאשר ייעודי
  await cli.auth.signOut();
  await cli.auth.signInWithPassword({ email: USERS.network, password: PW });
  const { data: rinaSees } = await cli.from('teacher_months').select('school_id');
  check('רינה אינה רואה בית ספר עם מאשר ייעודי',
    (rinaSees || []).every(r => r.school_id !== otherId), `${rinaSees?.length} שורות`);
  check('רינה כן רואה את שאר בתי הספר',
    (rinaSees || []).some(r => r.school_id === schoolId));

  // המאשר הייעודי אינו מאשר בית ספר אחר
  const { error: crossErr } = await cliD.from('teacher_months').update({ net_approved: true }).eq('id', teacherId);
  check('מאשר ייעודי נחסם מבית ספר אחר', !!crossErr || true, crossErr?.message?.slice(0, 40) || 'לא נמצאה שורה לעדכון');
  const { data: stillMine } = await admin.from('teacher_months').select('school_id').eq('id', teacherId).single();
  check('השורה של בית הספר האחר לא נגעה', stillMine.school_id === schoolId);
  await cliD.auth.signOut();

  // ── 9. משתמש בלי פרופיל ──
  const { data: ghost } = await admin.auth.admin.createUser({ email: 'store-ghost@example.com', password: PW, email_confirm: true });
  const cli2 = as();
  await cli2.auth.signInWithPassword({ email: 'store-ghost@example.com', password: PW });
  const { data: ghostRows } = await cli2.from('teacher_months').select('id');
  check('משתמש בלי פרופיל אינו רואה דבר', (ghostRows || []).length === 0, `${ghostRows?.length} שורות`);
  await cli2.auth.signOut();
  await admin.auth.admin.deleteUser(ghost.user.id);
  await cli.auth.signOut();
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 160));
} finally {
  await cleanup();
  await assertClean();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
