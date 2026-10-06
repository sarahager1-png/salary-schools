/*
  תרגום שורת עובדת מהמסד לשמות של האפליקציה — בקובץ משלו, בלי תלות
  בדפדפן, כדי שגם נקודות השרת (api/) יתרגמו באותה רשימה בדיוק. מיפוי
  חלקי בשרת כבר גרם לסכום שונה מהמסך (6.10: ירושלים וקרית ביאליק).
*/

// ── תרגום שדות ────────────────────────────────────────────────
// [שם בטבלה, שם באפליקציה]
export const TEACHER_FIELDS = [
  ['school_id',            'schoolId'],
  ['job',                  'job'],
  ['extra_roles',          'extraRoles'],
  ['non_quota_hours',      'nonQuotaHours'],
  ['hourly_rate',          'hourlyRate'],
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
  ['individual_hours',     'individualHours'],
  ['presence_hours',       'presenceHours'],
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
  ['absence_hours',        'absenceHours'],
  ['absence_reason',       'absenceReason'],
  ['sick_form_path',       'sickFormPath'],
  ['mm_hours',             'mmHours'],
  ['mm_for',               'mmFor'],
  ['mm_from',              'mmFrom'],
  ['mm_to',                'mmTo'],
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
  ['slip_issued_at',       '_slipIssuedAt'],
  ['slip_gross',           '_slipGross'],
  ['changed_at',           '_changedAt'],
  ['snapshot',             '_snapshot'],
  ['approved',             '_approved'],
  ['approved_at',          '_approvedAt'],
  ['net_approved',         '_netApproved'],
  ['net_approved_at',      '_netApprovedAt'],
];

// שדות שהאפליקציה מחזיקה אך אינם נשמרים: אחוז המשרה של העולם הישן נגזר
// מ-scopePct, והקבצים יעברו ל-Storage בשלב נפרד.
export const rowToTeacher = (r) => {
  const t = { id: r.id, monthKey: r.month_key, scope: r.scope_pct, _files: [], sickFiles: [] };
  for (const [col, key] of TEACHER_FIELDS) t[key] = r[col];
  if (!Array.isArray(t.extraRoles)) t.extraRoles = [];
  // דיווח מנהלת שממתין לאישור שרה (21.9.26). נקרא בלבד — אינו ב-TEACHER_FIELDS,
  // כדי ששמירת שורה שלמה עם ערך ישן לא תנקה אותו בלי אישור.
  t._reportPending   = Boolean(r.report_pending);
  t._reportPendingAt = r.report_pending_at ?? null;
  return t;
};
