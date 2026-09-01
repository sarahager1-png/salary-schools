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
  ['phone',                'phone'],
  ['reform',               'reform'],
  ['nihul_grade',          'nihulGrade'],
  ['level',                'level'],
  ['grade',                'grade'],
  ['degree',               'degree'],
  ['seniority',            'seniority'],
  ['frontal_hours',        'frontalHours'],
  ['scope_pct',            'scopePct'],
  ['scope_set_at',         'scopeSetAt'],
  ['scope_pct_pre',        'scopePctPre'],
  ['scope_pre_set_at',     'scopePreSetAt'],
  ['gender',               'gender'],
  ['gamul_role',           'role'],
  ['age_group',            'ageGroup'],
  ['is_temp',              'isTemp'],
  ['start_date',           'startDate'],
  ['end_date',             'endDate'],
  ['children_under_18',    'childrenUnder18'],
  ['leave_type',           'leaveType'],
  ['leave_from',           'leaveFrom'],
  ['leave_to',             'leaveTo'],
  ['absence_days',         'absenceDays'],
  ['mm_hours',             'mmHours'],
  ['mm_for',               'mmFor'],
  ['monthly_extras',       'monthlyExtras'],
  ['travel_days',          'travelDays'],
  ['daycare_children',     'daycareChildren'],
  ['official_gross',       '_officialGross'],
  ['official_gross_pre',   '_officialGrossPre'],
  ['agreed_gross',         '_agreedGross'],
  ['actual_employer_cost', '_actualEmployerCost'],
  ['min_wage_supp',        '_minWageSupp'],
  ['chabad_supp',          '_chabadSupp'],
  ['gross_set_at',         '_grossSetAt'],
  ['reported_at',          '_reportedAt'],
  ['late_report',          '_lateReport'],
  ['payroll_ready',        '_payrollReady'],
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
  murkavut: s.murkavut ?? 1,
  chabad_supp: s.chabadSupp !== false,
  extra_hours: s.extraHours ?? 0,
  extra_hours_note: s.extraHoursNote ?? null,
  principal_email: s.principalEmail ?? null,
  coordinator_email: s.coordinatorEmail ?? null,
});

const rowToSchool = (r) => ({
  id: r.id,
  name: r.name,
  city: r.city,
  reform: r.reform,
  hoursQuota: r.hours_quota,
  murkavut: r.murkavut ?? 1,
  chabadSupp: r.chabad_supp !== false,
  extraHours: r.extra_hours ?? 0,
  extraHoursNote: r.extra_hours_note,
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
  // הסיסמה נכונה אבל אין פרופיל — לא משאירים חיבור תקוע בדפדפן, אחרת
  // הרענון הבא נכנס שוב לאותו מבוי סתום.
  try {
    return await getProfile();
  } catch (e) {
    await supabase.auth.signOut().catch(() => {});
    throw e;
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

// מי אני: תפקיד, שם, ובית ספר אם מנהלת
/*
  אילו ספקי התחברות מופעלים בפרויקט. נשאל מהשרת ולא נקבע בקוד, כך
  שברגע שגוגל יופעל בלוח הבקרה הכפתור יופיע — בלי פריסה מחדש. כתובת
  ההגדרות פתוחה למפתח הציבורי ואינה חושפת דבר.
*/
let providersCache = null;
export async function authProviders() {
  if (providersCache) return providersCache;
  try {
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    });
    if (!r.ok) return (providersCache = []);
    const j = await r.json();
    providersCache = Object.entries(j.external || {}).filter(([, on]) => on === true).map(([k]) => k);
  } catch { providersCache = []; }
  return providersCache;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      // בוחרת חשבון בכל כניסה: לרבות מהמשתמשות יש יותר מחשבון גוגל אחד,
      // וכניסה שקטה לחשבון הלא נכון נראית כמו "אין לי הרשאה".
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) {
    if (/not enabled|Unsupported provider/i.test(error.message)) {
      throw new Error('כניסה עם גוגל אינה מופעלת בשרת. יש להפעיל אותה בהגדרות הפרויקט.');
    }
    raise(error, 'הכניסה עם גוגל נכשלה');
  }
}

/*
  כניסה בקישור למייל, בלי סיסמה.
  shouldCreateUser:false — רק מי שכבר מוגדרת במערכת מקבלת קישור. בלי
  זה כל כתובת שתוקלד הייתה יוצרת משתמש חדש, והשולחת הייתה מגלה זאת
  רק כשהיא נתקעת בלי הרשאות.
*/
export async function sendLoginLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
  });
  if (error) {
    if (/not found|Signups not allowed|not authorized/i.test(error.message)) {
      throw new Error('הכתובת אינה מוגדרת במערכת. פני לשרה הגר.');
    }
    if (/rate|too many|seconds/i.test(error.message)) {
      throw new Error('נשלח קישור לאחרונה. בדקי במייל, ואם לא הגיע — נסי שוב בעוד דקה.');
    }
    raise(error, 'שליחת הקישור נכשלה');
  }
}

export async function getProfile() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, school_id')
    .eq('id', auth.user.id)
    .maybeSingle();
  raise(error, 'טעינת הפרופיל נכשלה');
  // התחברות הצליחה אבל אין פרופיל — קורה בעיקר בכניסה עם גוגל, כשהמייל
  // של חשבון הגוגל אינו זה שהוגדר במערכת. אומרים איזה מייל נכנס, אחרת
  // אי אפשר לנחש מה השתבש.
  if (!data) throw new Error(`החשבון ${auth.user.email} התחבר, אך אינו משויך לתפקיד במערכת. פני לשרה הגר כדי שתשייך אותו.`);
  return { id: data.id, name: data.full_name, role: data.role, schoolId: data.school_id, email: auth.user.email };
}

// ── טעינת כל המצב ─────────────────────────────────────────────
export async function loadAll() {
  const [schoolsRes, monthsRes, teachersRes, approversRes] = await Promise.all([
    supabase.from('schools').select('*').order('name'),
    supabase.from('months').select('*').order('key'),
    supabase.from('teacher_months').select('*'),
    // מי מאשרת כל בית ספר — כדי שהתג "אצל …" יציג את השם הנכון ולא
    // שם מקודד קשיח. כשלון כאן אינו עוצר את הטעינה: יוצג השם הכללי.
    supabase.rpc('school_approvers'),
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
    // מועדי הדיווח לכל חודש — מסך הדיווח של המנהלת סופר לפיהם
    due: Object.fromEntries(monthsRes.data.map(m => [m.key, { report: m.report_due, submit: m.submit_due }])),
    approvers: (approversRes.data || []).map(a => ({ schoolId: a.school_id, name: a.full_name })),
  };
}

// ── בתי ספר ───────────────────────────────────────────────────
export async function saveSchool(s) {
  // שני בתי ספר באותו שם — המסד מסרב (אינדקס ייחודי), וכאן זה נאמר בעברית
  const dup = (error) => {
    if (/duplicate key/i.test(error?.message || '')) throw new Error(`בית ספר בשם "${s.name}" כבר קיים`);
  };
  if (s.id) {
    const { data, error } = await supabase.from('schools').update(schoolToRow(s)).eq('id', s.id).select().single();
    dup(error);
    raise(error, 'שמירת בית הספר נכשלה');
    return rowToSchool(data);
  }
  const { data, error } = await supabase.from('schools').insert(schoolToRow(s)).select().single();
  dup(error);
  raise(error, 'הוספת בית הספר נכשלה');
  return rowToSchool(data);
}

export async function deleteSchool(id) {
  const { error } = await supabase.from('schools').delete().eq('id', id);
  raise(error, 'מחיקת בית הספר נכשלה');
}

// ── חודשים ────────────────────────────────────────────────────
/*
  חודש חדש הוא העתק של הקודם. מה שלא השתנה נשאר — כולל הסימולציות,
  כך שחשבת השכר אינה מקלידה מחדש כל חודש את אותם מספרים. מה שכן
  מתאפס הוא מה שבאמת שייך לחודש: היעדרויות, ממ"מ, תוספות והאישורים.
  שינוי בשדה בסיס מחזיר את השורה למסלול הרגיל — ורק אותה.
*/
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

/*
  חשבת השכר מזינה: ברוטו, תוספת בית חב"ד, ועלות מעביד בפועל.

  קודם זו הייתה "שמירת סימולציה" ושתי עמודות ברוטו. הסימולטור ירד, והמספר
  מגיע ממנה. gross_set_at נחתם כאן כדי שיהיה אפשר להבדיל בין מספר שהיא
  הזינה לשריד מהתקופה הקודמת. approved_at/by נחתמים בשרת.

  הטריגר בשרת מתיר לחשבת בדיוק את העמודות האלה ותו לא — אחוז המשרה,
  למשל, נשאר של שרה.
*/
export async function savePayroll(id, { gross, chabadSupp, actualCost } = {}) {
  const patch = {};
  if (gross !== undefined) {
    patch.official_gross = gross ?? null;
    patch.gross_set_at = gross == null ? null : new Date().toISOString();
  }
  if (chabadSupp !== undefined) patch.chabad_supp = chabadSupp ?? null;
  if (actualCost !== undefined) patch.actual_employer_cost = actualCost ?? null;
  if (!Object.keys(patch).length) return null;
  const { data, error } = await supabase.from('teacher_months').update(patch).eq('id', id).select().single();
  raise(error, 'השמירה נכשלה');
  return rowToTeacher(data);
}

// עלות המעביד בפועל בלבד. null מחזיר את השורה לאומדן.
export async function saveActualCost(id, amount) {
  return savePayroll(id, { actualCost: amount ?? null });
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

/*
  התקדמות המילוי לפי בית ספר: מי נכנסה, מתי, וכמה הזינה.
  הקוד עצמו אינו מוחזר — הוא מפתח כניסה, ואין סיבה שיעבור ברשת שוב.
*/
export async function schoolProgress(monthKey) {
  const { data, error } = await supabase.rpc('school_progress', { p_month: monthKey });
  raise(error, 'טעינת ההתקדמות נכשלה');
  return (data || []).map(r => ({
    schoolId: r.school_id, principal: r.principal, hasLink: r.has_link,
    lastSeen: r.last_seen, teachers: r.teachers,
    missingContact: r.missing_contact, simulated: r.simulated,
  }));
}

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
  return { fullName: me.full_name, role: me.role, schoolId: me.school_id, schoolName: me.school_name, gender: me.gender };
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

export async function linkAddRow(code, monthKey, teacher) {
  // בית הספר נגזר מהקוד בשרת ולא נשלח מכאן
  const { data, error } = await supabase.rpc('link_add_row', {
    p_code: code, p_month: monthKey, p_row: teacherToRow(teacher),
  });
  raise(error, 'הוספת המורה נכשלה');
  return data ? rowToTeacher(data) : null;
}

export async function linkSaveRow(code, teacher) {
  // teacherToRow אינו כולל את המזהה — הוא נגזר מהמסד ואינו שדה עריכה.
  // link_save_row מאתרת לפיו את השורה, ולכן כאן הוא נוסף במפורש.
  const row = { ...teacherToRow(teacher), id: teacher.id };
  const { data, error } = await supabase.rpc('link_save_row', { p_code: code, p_row: row });
  raise(error, 'השמירה נכשלה');
  return data ? rowToTeacher(data) : null;
}

/* ── מסמכים מהנהלת החשבונות ────────────────────────────────────
   הקבצים בדלי פרטי. הנתיב הוא מזהה אקראי בלבד — השם המקורי נשמר
   בטבלה לתצוגה, כדי ששמות בעברית ורווחים לא ייכנסו למפתח ב-Storage.
*/
const DOCS_BUCKET = 'payroll-docs';
const rowToDoc = (r) => ({
  id: r.id, monthKey: r.month_key, schoolId: r.school_id, path: r.path,
  fileName: r.file_name, size: r.size_bytes, note: r.note,
  uploadedBy: r.uploaded_by, uploadedAt: r.uploaded_at,
});

export async function listDocuments(monthKey) {
  const { data, error } = await supabase.from('month_documents')
    .select('*').eq('month_key', monthKey).order('uploaded_at', { ascending: false });
  raise(error, 'טעינת המסמכים נכשלה');
  return (data || []).map(rowToDoc);
}

export async function uploadDocument({ monthKey, schoolId, note, file }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('פג תוקף ההתחברות — התחברי מחדש');
  const ext  = (file.name.match(/\.([A-Za-z0-9]{1,6})$/)?.[1] || 'bin').toLowerCase();
  const path = `${monthKey}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(DOCS_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  raise(up.error, 'העלאת הקובץ נכשלה');
  const { data, error } = await supabase.from('month_documents').insert({
    month_key: monthKey, school_id: schoolId || null, path,
    file_name: file.name, size_bytes: file.size, note: note || null, uploaded_by: user.id,
  }).select().single();
  if (error) {
    // הקובץ עלה אבל הרישום נכשל — לא משאירים קובץ יתום בדלי
    await supabase.storage.from(DOCS_BUCKET).remove([path]).catch(() => {});
    raise(error, 'רישום הקובץ נכשל');
  }
  return rowToDoc(data);
}

export async function deleteDocument(doc) {
  const { error: se } = await supabase.storage.from(DOCS_BUCKET).remove([doc.path]);
  raise(se, 'מחיקת הקובץ נכשלה');
  const { error } = await supabase.from('month_documents').delete().eq('id', doc.id);
  raise(error, 'מחיקת הרישום נכשלה');
}

// כתובת חד-פעמית לעשר דקות. אין לקבצים כתובת קבועה.
export async function documentUrl(doc) {
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(doc.path, 600);
  raise(error, 'פתיחת הקובץ נכשלה');
  return data.signedUrl;
}

/* ── קישור אישי מהממשק ───────────────────────────────────────
   השליח מנפיק קישור למנהלת קיימת בלי טרמינל. יצירת פרופיל חדש עדיין
   דורשת את מפתח השרת (scripts/make-link.mjs) — הדפדפן אינו רשאי.
*/
export async function principalsOfSchool(schoolId) {
  const { data, error } = await supabase.from('profiles')
    .select('id, full_name, phone').eq('role', 'principal').eq('school_id', schoolId);
  raise(error, 'טעינת המנהלת נכשלה');
  return (data || []).map(p => ({ id: p.id, fullName: p.full_name, phone: p.phone }));
}

const LINK_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';   // כמו בסקריפט: בלי תווים שמתבלבלים
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(20)))
  .map(b => LINK_ALPHABET[b % LINK_ALPHABET.length]).join('');

export async function issueLink(profileId) {
  // הקישור הקודם מתבטל — לא נשארים שני קישורים פעילים לאותה מנהלת
  const { error: re } = await supabase.from('access_links').update({ revoked: true }).eq('profile_id', profileId);
  raise(re, 'ביטול הקישור הקודם נכשל');
  const code = makeCode();
  const { error } = await supabase.from('access_links').insert({ code, profile_id: profileId, revoked: false });
  raise(error, 'יצירת הקישור נכשלה');
  return code;
}


/* ═══ קליטת עובדת — טופס 101, מסמכים וחתימות דרך קישור אישי ═══ */

export async function obWhoami(code) {
  const { data, error } = await supabase.rpc('ob_whoami', { p_code: code });
  raise(error, 'טעינת הקישור נכשלה');
  return data?.[0] || null;
}

export async function obSave(code, patch) {
  const { error } = await supabase.rpc('ob_save', { p_code: code, p_patch: patch });
  raise(error, 'השמירה נכשלה');
}

// העלאת קובץ לתיקיית הקוד של העובדת; מחזירה את הנתיב לרישום
export async function obUpload(code, slot, file) {
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${code}/${slot}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('onboarding').upload(path, file, { upsert: true });
  raise(error, 'העלאת הקובץ נכשלה');
  return path;
}

export async function obDownload(path) {
  const { data, error } = await supabase.storage.from('onboarding').download(path);
  raise(error, 'הורדת הקובץ נכשלה');
  return URL.createObjectURL(data);
}

// ─── צד הצוות ───
export async function listOnboarding() {
  const { data, error } = await supabase.from('teacher_onboarding')
    .select('*, schools(name)').order('name');
  raise(error, 'טעינת הקליטה נכשלה');
  return data || [];
}

const OB_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const obCode = () => Array.from(crypto.getRandomValues(new Uint8Array(20)))
  .map(b => OB_ALPHABET[b % OB_ALPHABET.length]).join('');

// קישור לכל עובדת בחודש הפעיל שאין לה עדיין — בכל בתי הספר
export async function createOnboardingLinks(monthKey) {
  const { data: rows, error } = await supabase.from('teacher_months')
    .select('school_id, name, tz_id, phone').eq('month_key', monthKey);
  raise(error, 'טעינת העובדות נכשלה');
  const { data: existing } = await supabase.from('teacher_onboarding').select('tz_id, name');
  const seen = new Set((existing || []).map(x => x.tz_id || x.name));
  let made = 0;
  for (const r of rows || []) {
    const key = r.tz_id || r.name;
    if (!r.name || seen.has(key)) continue;
    seen.add(key);
    const { error: e2 } = await supabase.from('teacher_onboarding').insert({
      school_id: r.school_id, name: r.name, tz_id: r.tz_id, phone: r.phone, code: obCode(),
    });
    raise(e2, 'יצירת קישור נכשלה');
    made++;
  }
  return made;
}

export async function uploadContract(file) {
  const { error } = await supabase.storage.from('onboarding')
    .upload('contract/contract.pdf', file, { upsert: true, contentType: 'application/pdf' });
  raise(error, 'העלאת החוזה נכשלה');
}

/* ── התראות ────────────────────────────────────────────────────
   הקו ששולח רשום על הנייד של שרה, ולכן התראה אליה לא תגיע בוואטסאפ
   לעולם — היא נשמרת עם channel='inapp' ומוצגת כאן. השאר יוצאות בתור.
*/
export async function listNotifications({ limit = 60 } = {}) {
  const { data, error } = await supabase.from('notifications')
    .select('id, kind, to_name, body, month_key, channel, status, sent_at, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  raise(error, 'טעינת ההתראות נכשלה');
  return (data || []).map(n => ({
    id: n.id, kind: n.kind, toName: n.to_name, body: n.body, monthKey: n.month_key,
    channel: n.channel, status: n.status, sentAt: n.sent_at, readAt: n.read_at, createdAt: n.created_at,
  }));
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from('notifications')
    .update({ read_at: new Date().toISOString() }).eq('id', id);
  raise(error, 'סימון ההתראה נכשל');
}

/* ── דיווח חודשי של המנהלת ──────────────────────────────────────
   סימון "דיווחתי" על כל שורות בית הספר בחודש. השדות עצמם (העדרות,
   מילוי מקום, חל"ד) נשמרים בשורה כרגיל; זה מה שמכריז שהחודש נמסר.

   late נקבע בשרת ולא כאן: שעון הדפדפן אינו ראיה. הוא מחושב מול
   months.report_due באותה שאילתה שכותבת את החותמת.
*/
export async function reportMonth(schoolId, monthKey) {
  const { data: m } = await supabase.from('months').select('report_due').eq('key', monthKey).maybeSingle();
  const now = new Date();
  const late = m?.report_due ? now > new Date(m.report_due + 'T23:59:59') : false;
  const { error } = await supabase.from('teacher_months')
    .update({ reported_at: now.toISOString(), late_report: late })
    .eq('school_id', schoolId).eq('month_key', monthKey);
  raise(error, 'שליחת הדיווח נכשלה');
  return { late };
}

/* ── בקשת טפסים מהמורות ────────────────────────────────────────
   נשלחת בלחיצה של שרה אחרי שהיא אישרה, ולא באוטומציה (הוראתה, 1.9).
   ההודעה נכנסת לתור והיוצא נשלח משם — כך שגם לחיצה כפולה אינה מכפילה
   הודעה, והכול מתועד במסך ההתראות.

   הקישור אישי לכל מורה. מי שאין לה — נוצר לה כאן, אחרת ההודעה הייתה
   מפנה אותה לשום מקום. מי שאין לה נייד נספרת ומדווחת, כי אין דרך
   להגיע אליה והשתיקה הזאת חייבת להיראות.
*/
export async function requestTeacherForms(monthKey) {
  const site = window.location.origin;

  const { data: rows, error } = await supabase.from('teacher_months')
    .select('id, name, tz_id, phone, leave_type')
    .eq('month_key', monthKey).eq('approved', true);
  raise(error, 'טעינת המורות נכשלה');
  const approved = (rows || []).filter(r => r.name && r.leave_type !== 'unpaid');

  const { data: ob } = await supabase.from('teacher_onboarding')
    .select('id, tz_id, name, code, form101_signed_at');
  const byKey = new Map((ob || []).map(o => [o.tz_id || o.name, o]));

  const { data: already } = await supabase.from('notifications')
    .select('teacher_id').eq('kind', 'teacher_forms').eq('month_key', monthKey);
  const sent = new Set((already || []).map(n => n.teacher_id));

  const queue = [];
  let done = 0, noPhone = 0;
  for (const t of approved) {
    if (sent.has(t.id)) continue;
    let rec = byKey.get(t.tz_id || t.name);
    if (rec?.form101_signed_at) { done++; continue; }
    if (!t.phone) { noPhone++; continue; }
    if (!rec) {
      const { data: made, error: e2 } = await supabase.from('teacher_onboarding')
        .insert({ name: t.name, tz_id: t.tz_id, phone: t.phone, code: obCode() })
        .select('code').single();
      raise(e2, 'יצירת קישור אישי נכשלה');
      rec = made;
    }
    if (!rec?.code) continue;
    queue.push({
      kind: 'teacher_forms', to_phone: t.phone, to_name: t.name,
      month_key: monthKey, teacher_id: t.id,
      body: `${t.name}, שלום.\n` +
        `כדי שהשכר ייצא בחודש הבא צריך להשלים את הפרטים: טופס 101, נתוני העסקה והסכם.\n` +
        `הכול בקישור אישי אחד, כמה דקות:\n${site}/?f=${rec.code}\n\n` +
        `רק מי שתשלים תקבל שכר בחודש הבא.`,
    });
  }
  if (queue.length) {
    const { error: e3 } = await supabase.from('notifications').insert(queue);
    raise(e3, 'הכנסת ההודעות לתור נכשלה');
  }
  return { queued: queue.length, done, noPhone, approved: approved.length };
}
