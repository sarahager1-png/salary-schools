import { supabase } from './supabase.js';

/*
  שכבת הגישה לנתונים.

  האפליקציה עובדת עם שמות שדות משלה (camelCase, `_officialGross`), ובסיס
  הנתונים עם שמות משלו (snake_case). כל התרגום קורה כאן ובמקום אחד, כדי
  שאף רכיב לא יצטרך לדעת איך נראית הטבלה.

  כל הפונקציות זורקות שגיאה עם הודעה בעברית. הקורא אחראי להציג אותה.
*/

// ── תרגום שדות ────────────────────────────────────────────────
// [שם בטבלה, שם באפליקציה]
const TEACHER_FIELDS = [
  ['school_id',            'schoolId'],
  ['name',                 'name'],
  ['tz_id',                'tzId'],
  ['email',                'email'],
  ['reform',               'reform'],
  ['level',                'level'],
  ['grade',                'grade'],
  ['degree',               'degree'],
  ['seniority',            'seniority'],
  ['frontal_hours',        'frontalHours'],
  ['scope_pct',            'scopePct'],
  ['gamul_role',           'role'],
  ['age_group',            'ageGroup'],
  ['is_temp',              'isTemp'],
  ['start_date',           'startDate'],
  ['end_date',             'endDate'],
  ['children_under_18',    'childrenUnder18'],
  ['absence_days',         'absenceDays'],
  ['mm_hours',             'mmHours'],
  ['mm_for',               'mmFor'],
  ['monthly_extras',       'monthlyExtras'],
  ['official_gross',       '_officialGross'],
  ['official_gross_pre',   '_officialGrossPre'],
  ['agreed_gross',         '_agreedGross'],
  ['actual_employer_cost', '_actualEmployerCost'],
  ['changed_at',           '_changedAt'],
  ['snapshot',             '_snapshot'],
  ['approved',             '_approved'],
  ['approved_at',          '_approvedAt'],
  ['net_approved',         '_netApproved'],
  ['net_approved_at',      '_netApprovedAt'],
];

// שדות שהאפליקציה מחזיקה אך אינם נשמרים: אחוז המשרה של העולם הישן נגזר
// מ-scopePct, והקבצים יעברו ל-Storage בשלב נפרד.
const rowToTeacher = (r) => {
  const t = { id: r.id, monthKey: r.month_key, scope: r.scope_pct, _files: [], sickFiles: [] };
  for (const [col, key] of TEACHER_FIELDS) t[key] = r[col];
  return t;
};

const teacherToRow = (t, monthKey) => {
  const r = {};
  for (const [col, key] of TEACHER_FIELDS) {
    if (t[key] !== undefined) r[col] = t[key] === '' ? null : t[key];
  }
  if (monthKey) r.month_key = monthKey;
  // scope ו-scopePct נשמרים כאחד — הם היו יוצאים מסנכרון
  if (t.scopePct !== undefined) r.scope_pct = t.scopePct;
  return r;
};

const schoolToRow = (s) => ({
  name: s.name,
  city: s.city ?? null,
  reform: s.reform || 'ofek',
  hours_quota: s.hoursQuota ?? null,
  principal_email: s.principalEmail ?? null,
  coordinator_email: s.coordinatorEmail ?? null,
});

const rowToSchool = (r) => ({
  id: r.id,
  name: r.name,
  city: r.city,
  reform: r.reform,
  hoursQuota: r.hours_quota,
  principalEmail: r.principal_email,
  coordinatorEmail: r.coordinator_email,
});

// ── טיפול בשגיאות ─────────────────────────────────────────────
// הודעות ה-RLS והטריגרים מגיעות בעברית מהשרת; שאר השגיאות מתורגמות כאן.
function raise(error, fallback) {
  if (!error) return;
  const m = error.message || '';
  if (/row-level security|violates row-level/i.test(m)) {
    throw new Error('אין לך הרשאה לפעולה הזו');
  }
  // סינון תוכן (נטו/נטספארק וכדומה) מחזיר דף HTML במקום התשובה מהשרת.
  // בלי הזיהוי הזה ההודעה שהמשתמשת רואה היא קוד HTML גולמי, והיא מחפשת
  // את התקלה במערכת במקום ברשת שממנה היא מחוברת.
  if (/^\s*<(!doctype|html)/i.test(m) || /safepage|netspark|neto\.net\.il|blocked/i.test(m)) {
    throw new Error('החיבור לשרת נחסם על ידי סינון התוכן של הרשת. יש לאשר את הכתובת supabase.co בסינון, או להתחבר מרשת אחרת.');
  }
  if (/duplicate key/i.test(m)) throw new Error('הרשומה כבר קיימת');
  if (/failed to fetch|network|load failed/i.test(m)) throw new Error('אין חיבור לשרת. בדקי את האינטרנט ונסי שוב.');
  if (/JWT|not authenticated/i.test(m)) throw new Error('פג תוקף ההתחברות — התחברי מחדש');
  throw new Error(m || fallback || 'הפעולה נכשלה');
}

// ── התחברות ───────────────────────────────────────────────────
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    if (/invalid login/i.test(error.message)) throw new Error('מייל או סיסמה שגויים');
    raise(error, 'ההתחברות נכשלה');
  }
  return getProfile();
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

// מי אני: תפקיד, שם, ובית ספר אם מנהלת
export async function getProfile() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, school_id')
    .eq('id', auth.user.id)
    .maybeSingle();
  raise(error, 'טעינת הפרופיל נכשלה');
  if (!data) throw new Error('המשתמש אינו משויך לתפקיד במערכת. פני לשליח.');
  return { id: data.id, name: data.full_name, role: data.role, schoolId: data.school_id, email: auth.user.email };
}

// ── טעינת כל המצב ─────────────────────────────────────────────
export async function loadAll() {
  const [schoolsRes, monthsRes, teachersRes] = await Promise.all([
    supabase.from('schools').select('*').order('name'),
    supabase.from('months').select('*').order('key'),
    supabase.from('teacher_months').select('*'),
  ]);
  raise(schoolsRes.error,  'טעינת בתי הספר נכשלה');
  raise(monthsRes.error,   'טעינת החודשים נכשלה');
  raise(teachersRes.error, 'טעינת נתוני השכר נכשלה');

  const months = {};
  for (const m of monthsRes.data) months[m.key] = [];
  for (const r of teachersRes.data) {
    if (!months[r.month_key]) months[r.month_key] = [];
    months[r.month_key].push(rowToTeacher(r));
  }
  return {
    schools: schoolsRes.data.map(rowToSchool),
    months,
    locked: Object.fromEntries(monthsRes.data.map(m => [m.key, m.locked])),
  };
}

// ── בתי ספר ───────────────────────────────────────────────────
export async function saveSchool(s) {
  if (s.id) {
    const { data, error } = await supabase.from('schools').update(schoolToRow(s)).eq('id', s.id).select().single();
    raise(error, 'שמירת בית הספר נכשלה');
    return rowToSchool(data);
  }
  const { data, error } = await supabase.from('schools').insert(schoolToRow(s)).select().single();
  raise(error, 'הוספת בית הספר נכשלה');
  return rowToSchool(data);
}

export async function deleteSchool(id) {
  const { error } = await supabase.from('schools').delete().eq('id', id);
  raise(error, 'מחיקת בית הספר נכשלה');
}

// ── חודשים ────────────────────────────────────────────────────
export async function openMonth(key, teachers) {
  const { error } = await supabase.from('months').insert({ key });
  raise(error, 'פתיחת החודש נכשלה');
  if (teachers?.length) {
    const rows = teachers.map(t => {
      const r = teacherToRow(t, key);
      delete r.id;
      return r;
    });
    const { error: e2 } = await supabase.from('teacher_months').insert(rows);
    raise(e2, 'העתקת המורות לחודש החדש נכשלה');
  }
  return loadAll();
}

export async function setMonthLocked(key, locked) {
  const { error } = await supabase.from('months').update({ locked }).eq('key', key);
  raise(error, 'נעילת החודש נכשלה');
}

// ── שורות שכר ─────────────────────────────────────────────────
export async function saveTeacher(t, monthKey) {
  if (t.id) {
    const row = teacherToRow(t);
    delete row.school_id;   // העברה בין בתי ספר אינה נתמכת דרך המסך
    const { data, error } = await supabase.from('teacher_months').update(row).eq('id', t.id).select().single();
    raise(error, 'שמירת המורה נכשלה');
    return rowToTeacher(data);
  }
  // teacherToRow אינו מעביר מזהה — הוא נקבע במסד
  const { data, error } = await supabase.from('teacher_months').insert(teacherToRow(t, monthKey)).select().single();
  raise(error, 'הוספת המורה נכשלה');
  return rowToTeacher(data);
}

export async function deleteTeacher(id) {
  const { error } = await supabase.from('teacher_months').delete().eq('id', id);
  raise(error, 'מחיקת המורה נכשלה');
}

// חשבת שכר. approved_at/by נחתמים בשרת, לא נשלחים מכאן.
export async function saveSimulation(id, gross, grossPre) {
  const patch = { official_gross: gross };
  if (grossPre !== undefined) patch.official_gross_pre = grossPre;
  const { data, error } = await supabase.from('teacher_months').update(patch).eq('id', id).select().single();
  raise(error, 'שמירת הסימולציה נכשלה');
  return rowToTeacher(data);
}

export async function approve(ids) {
  const { error } = await supabase.from('teacher_months').update({ approved: true }).in('id', ids);
  raise(error, 'האישור נכשל');
}

export async function netApprove(ids) {
  const { error } = await supabase.from('teacher_months').update({ net_approved: true }).in('id', ids);
  raise(error, 'האישור הרשתי נכשל');
}

// ── יומן אירועים ──────────────────────────────────────────────
export async function loadAudit(rowId) {
  const q = supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(200);
  const { data, error } = rowId ? await q.eq('row_id', rowId) : await q;
  raise(error, 'טעינת יומן האירועים נכשלה');
  return data;
}

export const _internals = { rowToTeacher, teacherToRow, rowToSchool, schoolToRow };

/* ── כניסה בקישור אישי ──────────────────────────────────────────
   למי שנכנס בקישור אין session ואין auth.uid(). הטבלאות סגורות בפניו
   לחלוטין, וכל גישה עוברת דרך שלוש פונקציות שמקבלות את הקוד ומאמתות
   אותו בעצמן. הקוד הוא כל ההגנה, ולכן הוא לעולם לא נשמר בדפדפן —
   הוא חי בכתובת בלבד.
*/
export async function linkWhoami(code) {
  const { data, error } = await supabase.rpc('link_whoami', { p_code: code });
  raise(error, 'הקישור אינו תקף');
  const me = data?.[0];
  if (!me) throw new Error('הקישור אינו תקף. ייתכן שהוחלף בקישור חדש.');
  return { fullName: me.full_name, role: me.role, schoolId: me.school_id, schoolName: me.school_name };
}

export async function linkMonths(code) {
  const { data, error } = await supabase.rpc('link_months', { p_code: code });
  raise(error, 'טעינת החודשים נכשלה');
  return (data || []).map(m => ({ key: m.key, locked: m.locked }));
}

export async function linkRows(code, monthKey) {
  const { data, error } = await supabase.rpc('link_rows', { p_code: code, p_month: monthKey });
  raise(error, 'טעינת המורות נכשלה');
  return (data || []).map(rowToTeacher);
}

export async function linkSaveRow(code, teacher) {
  // teacherToRow אינו כולל את המזהה — הוא נגזר מהמסד ואינו שדה עריכה.
  // link_save_row מאתרת לפיו את השורה, ולכן כאן הוא נוסף במפורש.
  const row = { ...teacherToRow(teacher), id: teacher.id };
  const { data, error } = await supabase.rpc('link_save_row', { p_code: code, p_row: row });
  raise(error, 'השמירה נכשלה');
  return data ? rowToTeacher(data) : null;
}
