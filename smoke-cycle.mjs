/*
  המחזור החודשי — פתיחה, תזכורת, מועד, סגירה, וחל"ד.

  מריצה את ה-cron ישירות כפונקציות, מול מסד הבדיקות. אין כאן דפדפן
  ואין רשת: מה שנבדק הוא מה שקורה לנתונים ומה נכנס לתור ההודעות.

  שום הודעה אינה נשלחת — התור נבדק בתוכנו, ו-queue-drain מדלג כשאין
  פרטי Green API. זו גם ההתנהגות בפרודקשן: הודעה ממתינה ולא יוצאת
  ממספר שגוי.
*/
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
process.env.VITE_SUPABASE_URL   = env.VITE_SUPABASE_URL;
process.env.SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY;
process.env.CRON_SECRET         = 'cycle-test-secret';
process.env.ADMIN_PHONE         = '+972547703015';   // קרישבסקי — לבדיקות בלבד
delete process.env.GREEN_API_INSTANCE_ID;
delete process.env.GREEN_API_TOKEN;

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

const PREV = '2094-11', MONTH = '2094-12', SCHOOL = 'מחזור בדיקה';

/** מריצה handler עם req/res מדומים ומחזירה את גוף התשובה */
async function call(mod, params = {}) {
  const q = new URLSearchParams({ secret: process.env.CRON_SECRET, ...params });
  const req = { url: `/api/cron/x?${q}`, headers: {} };
  let body = null, code = 0;
  const res = { status(c) { code = c; return this; }, json(b) { body = b; return b; } };
  const { default: handler } = await import(`./api/cron/${mod}.js`);
  await handler(req, res);
  return { code, body };
}

async function cleanup() {
  const u = (await admin.auth.admin.listUsers()).data?.users?.find(x => x.email === 'cycle-prin@example.com');
  if (u) { await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id); }
  const { data } = await admin.from('schools').select('id').eq('name', SCHOOL);
  const ids = (data ?? []).map(s => s.id);
  await admin.from('notifications').delete().in('month_key', [PREV, MONTH]);
  await admin.from('teacher_months').delete().in('month_key', [PREV, MONTH]);
  await admin.from('months').delete().in('key', [PREV, MONTH]);
  if (ids.length) {
    await admin.from('profiles').delete().in('school_id', ids);
    await admin.from('schools').delete().in('id', ids);
  }
}

try {
  await cleanup();
  const { data: sc } = await admin.from('schools')
    .insert({ name: SCHOOL, city: 'עיר', reform: 'ofek', hours_quota: 100 }).select().single();
  await admin.from('months').insert({ key: PREV, opened_at: new Date().toISOString() });
  const base = { month_key: PREV, school_id: sc.id, monthly_extras: 0, seniority: 3, scope_pct: 80, net_approved: false,
                 scope_set_at: new Date().toISOString(), changed_at: new Date().toISOString() };
  const seed = await admin.from('teacher_months').insert([
    { ...base, name: 'דיווחה בזמן', reform: 'pre',  official_gross: 8000, approved: true, tz_id: '111111118' },
    { ...base, name: 'לא דיווחה',   reform: 'pre',  official_gross: 7000, approved: true, tz_id: '222222226' },
    { ...base, name: 'בלי ברוטו',   reform: 'ofek', approved: false, tz_id: '333333334' },
  ]);
  if (seed.error) throw new Error('זריעה: ' + seed.error.message);

  // ── 1. פתיחת חודש ──
  const open = await call('monthly-open', { month: MONTH });
  check('החודש נפתח', open.body?.ok && open.body.month === MONTH, JSON.stringify(open.body));
  check('שלוש השורות הועתקו', open.body?.copied === 3, String(open.body?.copied));
  const { data: m } = await admin.from('months').select('report_due, submit_due').eq('key', MONTH).single();
  // הדיווח על חודש העבודה מגיע בחודש שאחריו — 2094-12 מדווח ב-05/01/2095
  check('מועדי הדיווח הם של החודש שאחרי', m.report_due === '2095-01-05' && m.submit_due === '2095-01-06',
    `${m.report_due} / ${m.submit_due}`);
  const { data: copied } = await admin.from('teacher_months')
    .select('name, approved, official_gross, reported_at').eq('month_key', MONTH).order('name');
  check('האישור עבר עם השורה', copied.filter(r => r.approved).length === 2,
    String(copied.filter(r => r.approved).length));
  check('הדיווח החודשי מתחיל מחדש', copied.every(r => !r.reported_at));

  const again = await call('monthly-open', { month: MONTH });
  check('פתיחה חוזרת אינה מכפילה', again.body?.note === 'החודש כבר פתוח', JSON.stringify(again.body));

  // ── 2. תזכורת ──
  // profiles.id הוא מזהה משתמש אמיתי — בלי משתמש אין פרופיל, ובלי
  // פרופיל אין למי לשלוח תזכורת.
  const PRIN_MAIL = 'cycle-prin@example.com';
  const old = (await admin.auth.admin.listUsers()).data?.users?.find(u => u.email === PRIN_MAIL);
  if (old) { await admin.from('profiles').delete().eq('id', old.id); await admin.auth.admin.deleteUser(old.id); }
  const { data: pu } = await admin.auth.admin.createUser({
    email: PRIN_MAIL, password: 'Cyc!' + Math.random().toString(36).slice(2, 9), email_confirm: true });
  const prof = await admin.from('profiles').insert({
    id: pu.user.id, full_name: 'מנהלת בדיקה', role: 'principal', school_id: sc.id, phone: '+972501234567',
  });
  if (prof.error) throw new Error('פרופיל: ' + prof.error.message);
  const rem = await call('report-reminder', { month: MONTH });
  check('תזכורת נכנסה לתור', rem.body?.queued === 1, JSON.stringify(rem.body));
  const rem2 = await call('report-reminder', { month: MONTH });
  check('אין תזכורת כפולה', rem2.body?.queued === 0, JSON.stringify(rem2.body));
  const { data: q1 } = await admin.from('notifications').select('body, to_phone').eq('month_key', MONTH).eq('kind', 'report_reminder');
  check('ההודעה נושאת את התאריך והמשמעות',
    /05\/\d{2}\/\d{4}/.test(q1[0].body) && q1[0].body.includes('לא ייכנס לשכר'), q1[0].body.split('\n').pop());

  // ── 3. מועד הדיווח — נסגר אבל מסומן ──
  const ids = await admin.from('teacher_months').select('id, name').eq('month_key', MONTH);
  const onTime = ids.data.find(r => r.name === 'דיווחה בזמן');
  await admin.from('teacher_months').update({ reported_at: new Date().toISOString() }).eq('id', onTime.id);

  const due = await call('report-due', { month: MONTH });
  check('שתי השורות שלא דווחו סומנו', due.body?.marked_late === 2, String(due.body?.marked_late));
  const { data: after } = await admin.from('teacher_months').select('name, late_report').eq('month_key', MONTH);
  check('מי שדיווחה בזמן לא סומנה', after.find(r => r.name === 'דיווחה בזמן').late_report === false);
  check('החודש נסגר לדיווח אבל השורות נשארו',
    after.length === 3 && after.filter(r => r.late_report).length === 2);
  const { data: sum } = await admin.from('notifications').select('body').eq('kind', 'report_due_summary').eq('month_key', MONTH);
  check('שרה קיבלה סיכום', sum.length === 1 && sum[0].body.includes('לא דווחו במועד'), sum[0]?.body?.slice(0, 60));

  // ── 4. מועד ההשלמה — רק מי שהשלימה עוברת ──
  await admin.from('teacher_onboarding').delete().eq('tz_id', '111111118');
  await admin.from('teacher_onboarding').insert({
    school_id: sc.id, tz_id: '111111118', name: 'דיווחה בזמן', phone: '0500000000',
    code: 'cyc' + Math.random().toString(36).slice(2, 8), form101_signed_at: new Date().toISOString(),
  });
  const cut = await call('payroll-cutoff', { month: MONTH });
  check('רק מי שהשלימה 101 עברה לשכר', cut.body?.ready === 1, JSON.stringify(cut.body));
  check('השאר נחסמו', cut.body?.blocked === 2, String(cut.body?.blocked));
  const { data: ready } = await admin.from('teacher_months').select('name, payroll_ready').eq('month_key', MONTH);
  check('הסימון על השורה הנכונה',
    ready.find(r => r.name === 'דיווחה בזמן').payroll_ready === true &&
    ready.filter(r => r.payroll_ready).length === 1);

  // ── 5. חל"ד — מיידית ──
  const noGross = ids.data.find(r => r.name === 'בלי ברוטו');
  await admin.from('teacher_months').update({
    leave_type: 'maternity', leave_from: `${MONTH}-10`, leave_to: '2095-04-10',
  }).eq('id', noGross.id);
  const mat = await call('maternity-watch', { month: MONTH });
  check('חל"ד יצרה התראה', mat.body?.queued === 1, JSON.stringify(mat.body));
  const mat2 = await call('maternity-watch', { month: MONTH });
  check('ואינה חוזרת על עצמה', mat2.body?.note === 'כל החל"ד כבר דווחו', JSON.stringify(mat2.body));
  const { data: matMsg } = await admin.from('notifications').select('body').eq('kind', 'maternity_alert').eq('month_key', MONTH);
  check('ההתראה אומרת שאין מחליפה', matMsg[0].body.includes('טרם שובצה מחליפה'), matMsg[0].body.split('\n').pop());

  // ── 6. התור אינו שולח בלי פרטי חיבור ──
  const drain = await call('queue-drain');
  check('בלי Green API התור ממתין ואינו מתרוקן', !!drain.body?.skipped, JSON.stringify(drain.body));
  const { data: pending } = await admin.from('notifications').select('status').eq('month_key', MONTH);
  check('כל ההודעות נשמרו כממתינות', pending.every(n => n.status === 'pending'), String(pending.length));

  // ── 7. השער ──
  const noSecret = await call('report-due', { month: MONTH, secret: 'wrong' });
  check('בלי הסוד הנכון אין כניסה', noSecret.code === 403, String(noSecret.code));
} catch (e) {
  check('הבדיקה רצה', false, e.message);
} finally {
  await cleanup();
}
console.log(fails.length ? `\n${fails.length} נכשלו` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
