/*
  ליבת חישוב השכר ועלות המעביד — מקור אמת אחד.

  חולץ מ-App.jsx ב-2.9.2026 כדי ששרת (api/) יוכל לחשב את אותם מספרים
  בדיוק בלי לשכפל נוסחה: פורטל מבט-רשת מקבל את עלות ההוראה בפועל
  מכאן, לא מחישוב מקביל שיכול לסטות. הכול JS טהור — בלי React.

  CHABAD_SUPP ו-MM_REPLACED הם מצב שהאפליקציה (או ה-API) ממלאים
  מהנתונים; ראי loadCalcState המשמש את הצד השרתי.
*/

const LEVELS = {
  elementary: { label: 'יסודי',        frontal: 26, individual: 5, presence: 5 },
  middle:     { label: 'חטיבת ביניים', frontal: 23, individual: 4, presence: 9 },
  high:       { label: 'עליון',         frontal: 23, individual: 4, presence: 9 },
};
const AGE_RED = {
  none:  { label: 'עד גיל 50',        f: 0, i: 0 },
  age50: { label: 'גיל 50–55',        f: 2, i: 0 },
  age55: { label: "גיל 55+ (ותיק/ה)", f: 3, i: 1 },
  age55n:{ label: "גיל 55+ (חדש/ה)",  f: 2, i: 0 },
};

const CHABAD_SUPP = new Map();
// מי שכבר שובצה לה ממ"מ: מפתחות "חודש|בית ספר|שם" של הנשות שמופיעות
// בשדה "במקום מי" של שורה אחרת. מתעדכן בכל טעינת נתונים.
const MM_REPLACED = new Set();
// מי בחל"ד החודש — מ"מ שממלאת אותה היא המשרה עצמה, לא שעות בתשלום
const MATERNITY_LEAVES = new Set();
const mmKey = (mk, sid, name) => `${mk}|${sid}|${String(name || '').trim()}`;
const hasSubstitute = t => MM_REPLACED.has(mmKey(t.monthKey, t.schoolId, t.name));
const schoolPaysSupp = id => CHABAD_SUPP.get(id) !== false;
// למנהלת בית ספר יש מחשבון נפרד — אופק ניהול
// מורת רפורמה בחטיבה העליונה היא עוז לתמורה, לא אופק חדש — שני
// מחשבונים שונים באתר. קודם כולן נותבו לאופק, והכותרת אישרה לחשבת
// בחירה שגויה.
const reformLabel = r => (REFORMS.find(x => x.id === r) || REFORMS[0]).label;

// שורת המנהלת מזוהה לפי התפקיד, שכבר קיים ב-ROLES
const OFEK_GRADES = [
  { id: 'intern', label: 'מתמחה' },
  { id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' },
  { id: 4, label: '4' }, { id: 5, label: '5' }, { id: 6, label: '6' },
  { id: 7, label: '7' }, { id: 8, label: '8' }, { id: 9, label: '9' },
];
const REFORMS = [
  { id: 'ofek', label: 'אופק חדש' },
  { id: 'pre',  label: 'עולם ישן' },
];
const DEGREE_LABELS = {
  intern: 'מתמחה', unlicensed: 'לא מוסמך', senior: 'בכיר',
  BA: 'תואר ראשון', MA: 'תואר שני',
};
const ROLES = [
  { id: 'none',       label: 'ללא תפקיד נוסף',             pct: 0,    min: 0    },
  { id: 'homeroom',   label: "מחנך/ת כיתה (יסודי ב'-ו')",  pct: 10,   min: 1000 },
  { id: 'homeroom1',  label: "מחנך/ת כיתה א'",              pct: 11.5, min: 1000 },
  { id: 'homeroom2',  label: 'מחנך/ת כיתה (חטיבה)',         pct: 11.5, min: 1000 },
  { id: 'subject6',   label: 'מרכז/ת מקצוע (יסודי)',        pct: 6,    min: 0    },
  { id: 'subject8',   label: 'מרכז/ת מקצוע (חטיבה/עליון)', pct: 8,    min: 0    },
  { id: 'team',       label: 'ראש צוות / מרכז שכבה',        pct: 6.5,  min: 1000 },
  { id: 'counselor',  label: "יועץ/ת (רישיון זמני)",         pct: 12,   min: 0    },
  { id: 'counselor2', label: "יועץ/ת (רישיון קבוע)",         pct: 18,   min: 0    },
  { id: 'principal',  label: 'מנהל/ת בית ספר (אופק ד1)',    pct: 0,    min: 0    },
];
/* ═══════════════════════════════════════════════════════════════
   המחשבון הרשמי של משרד החינוך
   הראוטים שמיים. קודם היו כאן מספרים (Calculators/1..4) — כל אחד מהם
   מפנה בשקט לרשימת המחשבונים, כך שהחשבת חשבה שהיא במחשבון אחד
   בזמן שהמסך שלפניה היה מסך אחר לגמרי.
═══════════════════════════════════════════════════════════════ */
const PRINCIPAL_ROLE = 'principal';
// שכר הבסיס של מנהלת. כל מה שמעליו משולם כתוספת בית חב"ד.
// שכר מנהלת באופק — מספר אחד וקבוע, ולא סולם לפי ותק: ותק 9 עד 23
// מחזירים את אותו מספר במחשבון הניהול (הוראת שרה, 1.9.2026). כל מה
// שמעבר לו נקבע בהסכם מראש ונרשם כשכר מוסכם.
const PRINCIPAL_OFEK_GROSS = 19087;
// תוספת בית חב"ד של מנהלת — סכום קבוע, מתוך השכר (שרה, 2.9.2026)
const PRINCIPAL_CHABAD_SUPP = 4700;
const isPrincipalRow = t => t?.role === PRINCIPAL_ROLE;
// דרגת הניהול היא א..ד ואינה סולם המורים. נשמרת כמספר 1..4.
const NIHUL_GRADES = [{ v:1, l:'א' }, { v:2, l:'ב' }, { v:3, l:'ג' }, { v:4, l:'ד' }];
// שם קצר לבורר שבתוך הטבלה — השם המלא נחתך שם ואי אפשר להבחין
// בין מחנכת כיתה א' למחנכת ב'-ו'.
const ROLE_SHORT = {
  none:'—', homeroom:'מחנכת ב׳-ו׳ · 10%', homeroom1:'מחנכת א׳ · 11.5%',
  homeroom2:'מחנכת חטיבה · 11.5%', subject6:'רכזת מקצוע · 6%', subject8:'רכזת מקצוע · 8%',
  team:'ראש צוות · 6.5%', counselor:'יועצת · 12%', counselor2:'יועצת · 18%', principal:'מנהל/ת',
};
// בחירת תפקיד מנהל/ת גוררת את ברירות המחדל שלה: אופק חדש ודרגת ניהול א.
// שתיהן ניתנות לשינוי ידני אחר כך — זו נקודת פתיחה, לא נעילה.
// מנהלת תמיד: אופק חדש · 100% משרה · 40 שעות · דרגת ניהול א.
// נקודת פתיחה — שרה יכולה לשנות ידנית כל שדה.
const principalDefaults = draft => (
  draft?.role === PRINCIPAL_ROLE || draft?.gamulRole === PRINCIPAL_ROLE
    ? { reform: 'ofek', nihulGrade: draft.nihulGrade ?? 1,
        scopePct: 100, scope: 100, frontalHours: 40 }
    : {});


/*
  יציאה לחופשה. עד עכשיו חל"ד היה קיים רק מהצד השני — REASON_TYPES של
  מילוי מקום ידע לומר *למה* מישהי נכנסה, אבל לא היה איפה לרשום שמורה
  קיימת יוצאת וממתי. זה נתון שהמנהלת יודעת ראשונה, והוא משנה שכר.
*/
const LEAVE_TYPES = [
  { id: 'none',      label: 'עובדת' },
  { id: 'maternity', label: 'חופשת לידה (חל"ד)' },
  { id: 'unpaid',    label: 'חופשה ללא תשלום (חל"ת)' },
  { id: 'sick',      label: 'מחלה ממושכת' },
  { id: 'other',     label: 'חופשה אחרת' },
];
const leaveLabel = id => (LEAVE_TYPES.find(x => x.id === id) || LEAVE_TYPES[0]).label;
const onLeave = t => Boolean(t?.leaveType && t.leaveType !== 'none');
// חופשה שאין בה שכר החודש: חל"ד — המוסד לביטוח לאומי משלם, לא הרשת;
// חל"ת — ללא תשלום מהגדרתה. מחלה ממושכת וחופשה אחרת נשארות בשכר.
const unpaidThisMonth = t => t?.leaveType === 'maternity' || t?.leaveType === 'unpaid';
const fmtDay  = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
// תיאור קצר לתג ולדוחות: "חל\"ד מ-01/09/2026" או "… עד 01/03/2027"
const leaveText = t => !onLeave(t) ? '' :
  `${leaveLabel(t.leaveType)}${t.leaveFrom ? ` מ-${fmtDay(t.leaveFrom)}` : ''}${t.leaveTo ? ` עד ${fmtDay(t.leaveTo)}` : ''}`;

const REASON_TYPES = [
  { id: 'maternity', label: 'מילוי מקום לחל"ד' },
  { id: 'system',    label: 'צרכי מערכת' },
  { id: 'other',     label: 'אחר' },
];

/* ═══════════════════════════════════════════════════════════════
   CALCULATIONS
═══════════════════════════════════════════════════════════════ */
function currentScope(t) {
  if (t.scopeChanges?.length > 0) {
    return [...t.scopeChanges].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  }
  return { scopePct: t.scopePct || 100, frontalHours: t.frontalHours || baseFrontalFor(t) };
}
/*
  אחוז המשרה בפועל — והוא סופי.

  עד 1.9 המערכת הוסיפה כאן עוד עשר נקודות על מה שרשום, בהנחה שהרשום
  הוא הבסיס מהשעות. הבדיקה מול המחשבון הרשמי הראתה את ההפך: האחוז
  הרשום כבר כולל את תוספת האם. יוכבד דובקין מלמדת 21 שעות ועוד 3
  למחנכת — 24 מתוך 30, שהם 80% — ורשום לה 91, כלומר 80 ועוד התוספת.
  ההוספה השנייה הפכה אותה ל-101%, ומי שהקליד 101 למחשבון קיבל 8,508
  במקום 7,666 שרשומים לה. אחת הכפילות האלה לכל אם ברשת.

  הכלל עצמו (הוראת שרה, 1.9): 30 שעות הן 100% בעולם ישן, מחנכת מקבלת
  3 שעות מעל מה שהיא מלמדת, ואם התוצאה עולה מעל 79% ומדובר באם —
  מוסיפים עשר נקודות. לאם, בפועל, 27 שעות הן כבר 100%. הנוסחה הזאת
  חיה ב-computedBaseScope ומוצעת ככפתור; היא אינה רצה מעצמה.
*/
function effectiveScope(t) {
  if (t.reform === 'ofek') return currentScope(t).scopePct || 100;
  return (t.scope ?? t.scopePct ?? 100);
}
// תוספת אם קיימת בשני המסלולים. בעולם ישן היא עשר נקודות מעל 79%;
// באופק היא טבלה (OFEK_MOM_SCOPE) ולא תוספת אחוזים.
//
// זכאות: אֵם — ולא כל מי שיש לו ילדים. הזכאות נגזרה ממספר הילדים עד 18
// בלבד, ולכן שלושה גברים ברשת קיבלו אותה על הנייר. gender='f' הוא
// התנאי; שורה בלי מין אינה זכאית עד שייקבע.
const MOM_MIN_SCOPE = 79;
const isMother = t => t.gender === 'f' && (t.childrenUnder18 || 0) > 0;

/*
  תוספת אם באופק חדש — קיימת, בניגוד למה שהמערכת החזיקה עד 1.9.

  הטבלה כפי שנמסרה: 20 שעות = 76%, 21 = 86%, 22 = 91%, 23 = 94%.
  הקפיצות אינן אחידות — עשר נקודות בין 20 ל-21, חמש בין 21 ל-22, שלוש
  בין 22 ל-23 — ולכן אין כאן נוסחה שאפשר להמשיך, אלא טבלה שנשמרת
  כטבלה. גם השעות חלקי 26 היו נותנות משהו אחר לגמרי (77, 81, 85, 88).

  מחוץ לשלוש השורות האלה אין הצעה. ניחוש בין ערכים היה נראה כמו ידיעה,
  ואחוז משרה שגוי מזיז את כל השכר — זה בדיוק מה שקרה כשהייתה כאן נוסחה
  שהוסרה ב-27.8.
*/
/*
  "תראה שיש טבלאות לאם" (שרה, 4.9): שתי טבלאות המרה באופק — לאם
  ולרגילה — שחולצו מהנתונים שהיא ייבאה ואושרו על ידה. שעה שאינה
  בטבלה נופלת לנוסחה הליניארית (שעות/26).
*/
const OFEK_MOM_SCOPE = { 10: 38, 12: 46, 13: 50, 15: 58, 16: 64, 17: 65,
                         18: 69, 19: 74, 20: 76, 21: 86, 22: 91, 23: 94 };
// הטבלה הרגילה — הכרעת שרה 4.9: "6 זה 23, 16 זה 62, 17 זה 65,
// 18 זה 69, 19 זה 73" (ליניארית שעות/26; 21→86 נשאר לפי אישורה הקודם)
const OFEK_SCOPE     = { 6: 23, 9: 36, 10: 38, 12: 46, 13: 50, 14: 54, 15: 58,
                         16: 62, 17: 65, 18: 69, 19: 73, 21: 86, 26: 100 };
const ofekTableScope = t =>
  t.reform === 'ofek' && !isMother(t) ? (OFEK_SCOPE[Number(t.frontalHours)] ?? null) : null;
const ofekMomScope = t =>
  t.reform === 'ofek' && isMother(t) ? (OFEK_MOM_SCOPE[Number(t.frontalHours)] ?? null) : null;

function momBonusEligible(t) {
  if (t.reform === 'ofek') return ofekMomScope(t) != null;
  return t.reform === 'pre' && isMother(t) && computedBaseScope(t) > MOM_MIN_SCOPE;
}
// אם שמתחת לסף — לתצוגה בלבד, כדי שיהיה ברור שלא נשכחה אלא לא זכאית
const momUnderThreshold = t =>
  isMother(t) && !momBonusEligible(t) &&
  (t.reform === 'pre' ? computedBaseScope(t) <= MOM_MIN_SCOPE : true);
// עשר נקודות על אחוז המשרה. הן כבר בתוך האחוז הרשום — ראי effectiveScope.
const MOM_SCOPE_BONUS = 10;
// בסיס אחוז המשרה מהשעות: 30 שעות = משרה מלאה בעולם ישן, 26 באופק
// (יסודי). מחנכת בעולם ישן מקבלת 3 שעות מעל מה שהיא מלמדת. תוספת
// האם אינה כאן — היא מעל הבסיס, ב-effectiveScope.
// אומת מול ההקלדות הידניות של שרה, 27.8: שבע מתוך תשע עד עיגול.
function rawBaseScope(t) {
  // מנהלת: תמיד 100% — 40 שעות ניהול, לא נוסחת הוראה
  if (isPrincipalRow(t)) return 100;
  const hr = t.reform === 'pre' && /^homeroom/.test(t.role || t.gamulRole || '') ? HOMEROOM_HOURS_PRE : 0;
  const full = t.reform === 'pre' ? PRE_FRONTAL : (LEVELS[t.level]?.frontal || 26);
  const h = Number(t.frontalHours) || 0;
  return full ? (h + hr) / full * 100 : 100;
}
function computedBaseScope(t) { return Math.round(rawBaseScope(t)); }
const momScopeBonus = t => (momBonusEligible(t) ? MOM_SCOPE_BONUS : 0);
/*
  "שים לב היא 96 אחוז — תלמד את הנתונים" (שרה, 4.9): כשנוספת תוספת
  האם, הבסיס נחתך כלפי מטה לפני ה-10+ — לא מעוגל. נלמד מההקלדות שלה:
  איטה 23+3 ⇒ 86.67 ⇒ 86+10=96 (לא 97); חני אלבוים 20+3 ⇒ 76.67 ⇒
  76+10=86 (כפי שרשום). בלי התוספת — עיגול רגיל (חיים שטראקס 87).
*/
const scopeWithMom = t => (momBonusEligible(t)
  ? Math.min(100, Math.floor(rawBaseScope(t)) + MOM_SCOPE_BONUS)
  : computedBaseScope(t));
/*
  ההצעה שמוצגת ככפתור — מה שבאמת מוקלד למחשבון: הבסיס מהשעות, ועוד
  תוספת האם כשהיא מגיעה. האחוז שנשמר הוא הסופי, ולכן ההצעה חייבת
  להיות סופית גם היא. אין כאן מילוי אוטומטי; ההצעה מחכה ללחיצה.
*/
const suggestedScope = t => ofekMomScope(t) ?? ofekTableScope(t) ?? scopeWithMom(t);
function calcNet(gross) { return Math.round(gross * 0.735); }
// אחוז המשרה והשעות הפרונטליות קשורים זה בזה דרך השלב והפחתת הגיל.
// אפשר להזין כל אחד מהם, והשני נגזר — לפעמים השעות ידועות, ולפעמים
// האחוז הוא מה שאושר בבניית התקציב והשעות נגזרות ממנו.
// שעות משרה מלאה בעולם ישן. LEVELS מחזיק את מספרי האופק — 26 ביסודי,
// 23 בחטיבה — והם אינם חלים כאן. כל שורות הרשת היום ביסודי; אם תיפתח
// חטיבה בעולם ישן, המספר שלה צריך להגיע ממך ולא מהערכה.
const PRE_FRONTAL = 30;
function baseFrontalFor(t) {
  const agR = AGE_RED[t.ageGroup] || AGE_RED.none;
  if (t.reform !== 'ofek') return PRE_FRONTAL - agR.f;
  const lvl = LEVELS[t.level] || LEVELS.elementary;
  return lvl.frontal - agR.f;
}
// גמול חינוך בעולם ישן: שלוש שעות מעל מה שהיא מלמדת בפועל. באופק
// הגמול הוא אחוז מהשכר (ROLES) ולא שעות, ולכן זה חל על עולם ישן בלבד.
const HOMEROOM_HOURS_PRE = 3;
const homeroomHours = t =>
  (t?.reform === 'pre' && /^homeroom/.test(t?.role || t?.gamulRole || '') ? HOMEROOM_HOURS_PRE : 0);

// אחוז המשרה מוזן ביד ואינו נגזר. הנוסחה שהייתה כאן שגתה שלוש פעמים:
// בסיס 30 בעולם ישן ולא 26, שלוש שעות גמול חינוך למחנכת, ועשר נקודות
// תוספת אם. עד שהיא תהיה נכונה ומאושרת — אין נוסחה.

function deriveHours(t, scopeOverride) {
  if (t.reform !== 'ofek') return null;
  const lvl = LEVELS[t.level] || LEVELS.elementary;
  const agR = AGE_RED[t.ageGroup] || AGE_RED.none;
  const baseFrontal    = lvl.frontal    - agR.f;
  const baseIndividual = lvl.individual - agR.i;
  if (baseFrontal === 0) return null;
  const cur        = scopeOverride || currentScope(t);
  const scopePct   = cur.scopePct || Math.round((cur.frontalHours / baseFrontal) * 100);
  const frontal    = cur.frontalHours || Math.round(baseFrontal * scopePct / 100);
  const individual = Math.round(baseIndividual * scopePct / 100);
  const presence   = Math.round(lvl.presence   * scopePct / 100);
  return { scopePct, frontal, individual, presence };
}

// ביגוד + הבראה (מקור: הסכם קיבוצי חינוך 2024)
// החזרי הוצאות — אינם שכר לכל דבר ועניין, אינם פנסיוניים, ואינם נספרים
// בשכר המינימום. כן חייבים במס שכר ובביטוח לאומי.
const TRAVEL_DAY    = 22.6;  // תקרת דמי נסיעה ליום, צו הרחבה 11.8.2016
const DAYCARE_1     = 372;   // תוספת מעונות, ילד ראשון עד גיל 5 — חוזר הממונה 1.1.2026
const DAYCARE_2     = 251;   // ילד שני. משולם לכל היותר עבור שני ילדים
const HAVRAAH_DAY   = 421;   // שכר יום הבראה 2024
const BIGUUD_ANNUAL = 2028;  // ביגוד שנתי למורה (הסכם חינוך)
function havraahDays(sen) {
  if (sen < 1)  return 0;
  if (sen < 2)  return 10;
  if (sen < 4)  return 14;
  if (sen < 11) return 16;
  if (sen < 16) return 20;
  if (sen < 20) return 22;
  if (sen < 25) return 24;
  return 26;
}
function calcExtras(t) {
  // ביגוד והבראה משולמים יחסית לאחוז משרה
  const factor  = effectiveScope(t) / 100;
  const biguud  = Math.round(BIGUUD_ANNUAL * factor / 12);
  const havraah = Math.round(havraahDays(t.seniority) * HAVRAAH_DAY * factor / 12);
  return { biguud, havraah, total: biguud + havraah };
}
// נסיעות לפי ימי עבודה בפועל; מעונות לפי מספר הילדים עד גיל 5, פרו-רטה
// לאחוז המשרה (עובדת הוראה בחצי משרה מקבלת מחצית התוספת).
function calcReimb(t) {
  const travel = Math.round((Number(t.travelDays) || 0) * TRAVEL_DAY);
  const kids = Math.min(2, Math.max(0, Number(t.daycareChildren) || 0));
  const full = (kids >= 1 ? DAYCARE_1 : 0) + (kids >= 2 ? DAYCARE_2 : 0);
  const daycare = Math.round(full * effectiveScope(t) / 100);
  return { travel, daycare, total: travel + daycare };
}

/*
  הוצאות המעביד מעל הברוטו — רכיב־רכיב.

  קודם היה כאן מספר אחד, 40%, ואיש לא יכול היה לבדוק מה בתוכו. הפירוט
  מגלה שני דברים: מס שכר של מלכ"ר לא היה מיוצג כלל, ותוספת בית חב"ד
  נשאה 30% בזמן שהיא נושאת בפועל מס שכר וביטוח לאומי בלבד — היא אינה
  פנסיונית ואינה נושאת קרן השתלמות.

  לכן אין כאן שיעור כולל קבוע. כל רכיב מחושב על הבסיס שלו, והשיעור
  הכולל נגזר מהתוצאה ומשתנה לפי הוותק, אחוז המשרה וגובה השכר.
*/
// שעת מילוי מקום — נגזרת מ-90 שעות למשרה מלאה (שרה, 3.9)
const MM_HOUR_RATE = 100;
const PENSION_RATE   = 0.1483;  // תגמולי מעסיק 6.5% + פיצויים 8.33%
const KEREN_RATE     = 0.084;   // קרן השתלמות עובדי הוראה — חלק המעסיק
const MAS_SACHAR     = 0.075;   // מס שכר למלכ"ר (מחליף מע"מ)
const BL_STEP        = 7703;    // מדרגת ביטוח לאומי המופחתת, 2026
const BL_LOW         = 0.0451;  // עד המדרגה
const BL_HIGH        = 0.076;   // מעליה

// ביטוח לאומי מדורג. מחושב על כל שכר העבודה, כולל הבראה וביגוד.
function bituachLeumi(wage) {
  if (wage <= 0) return 0;
  return wage <= BL_STEP
    ? wage * BL_LOW
    : BL_STEP * BL_LOW + (wage - BL_STEP) * BL_HIGH;
}

/*
  פנסיה וקרן השתלמות חלים על הבסיס בלבד — תוספת בית חב"ד אינה פנסיונית
  ואינה נושאת קרן השתלמות. מס שכר וביטוח לאומי חלים על כל שכר העבודה,
  והבראה וביגוד הם עצמם שכר עבודה ולכן נכללים בבסיס שלהם.
*/
function employerParts(t, base, supplement) {
  const { biguud, havraah } = calcExtras(t);
  const { travel, daycare } = calcReimb(t);
  // נסיעות ומעונות נכנסים לבסיס של מס שכר וביטוח לאומי, אך לא לפנסיה
  // ולקרן ההשתלמות — הם החזר הוצאות ולא שכר.
  const wage = base + supplement + biguud + havraah + travel + daycare;
  const parts = [
    { key:'pension',  label:'פנסיה ופיצויים',   rate:PENSION_RATE, on:base, amount: Math.round(base * PENSION_RATE) },
    { key:'keren',    label:'קרן השתלמות',      rate:KEREN_RATE,   on:base, amount: Math.round(base * KEREN_RATE) },
    { key:'masSachar',label:'מס שכר (מלכ"ר)',   rate:MAS_SACHAR,   on:wage, amount: Math.round(wage * MAS_SACHAR) },
    { key:'bl',       label:'ביטוח לאומי',      rate:null,         on:wage, amount: Math.round(bituachLeumi(wage)) },
    { key:'havraah',  label:'הבראה',            rate:null,         on:null, amount: havraah },
    { key:'biguud',   label:'ביגוד',            rate:null,         on:null, amount: biguud },
  ];
  if (travel > 0) parts.push({ key:'travel', label:`נסיעות (${t.travelDays} ימים × ₪${TRAVEL_DAY})`, rate:null, on:null, amount: travel });
  if (daycare > 0) parts.push({ key:'daycare', label:`מעונות (${t.daycareChildren} ילדים עד גיל 5)`, rate:null, on:null, amount: daycare });
  return { parts, total: parts.reduce((s, x) => s + x.amount, 0), wage };
}

// כמה מהעלות נגרר מרכיב התוספת בלבד — מס שכר וביטוח לאומי שוליים עליו
function supplementCost(base, supplement, biguud, havraah) {
  if (supplement <= 0) return 0;
  const without = base + biguud + havraah;
  return Math.round(supplement * MAS_SACHAR + (bituachLeumi(without + supplement) - bituachLeumi(without)));
}

/*
  מערכת התשלומים של הרשת היא עולם ישן. מורה במסלול אופק לא מקבלת את שכר
  האופק ישירות: מה שעובר בתשלומים הוא שכר העולם הישן, והפער עד שכר האופק
  משולם כרכיב נפרד — תוספת בית חב"ד.

  base       — שכר העולם הישן, מה שרץ במערכת התשלומים
  supplement — תוספת בית חב"ד, הפער עד שכר האופק (לעולם לא שלילי)
  gross      — סך הברוטו לעובדת
*/
function payBreakdown(t) {
  /*
    ברוטו אחד, ותוספת שהוזנה.

    עד 1.9 היו כאן שתי עמודות — סימולציית עולם ישן וסימולציית אופק —
    והפער ביניהן היה תוספת בית חב"ד. המודל הזה ירד: מתוך 28 הסימולציות
    שנבדקו מול המחשבון הרשמי 8 התאימו, והפערים היו בקלט. שרה הכריעה
    שהפער אינו עניינה ושחשבת השכר מזינה ברוטו ותוספת.

    base       — הברוטו פחות התוספת. פנסיה וקרן השתלמות חלות עליו בלבד.
    supplement — תוספת בית חב"ד כפי שהוזנה. אינה פנסיונית ואינה נושאת
                 קרן השתלמות; נושאת מס שכר וביטוח לאומי.
    gross      — הברוטו לעובדת.
  */
  const gross0 = Number(t._officialGross) || 0;
  const supp0  = Math.max(0, Number(t._chabadSupp) || 0);
  const agreed = Number(t._agreedGross) || 0;

  /*
    מנהלת: באופק המספר קבוע (19,087), וכל מה שמעבר לו על פי הסכם מראש
    שנרשם כשכר מוסכם. "גם למנהלות יש תוספת בית חב"ד על סך 4,700"
    (שרה, 2.9) — מתוך השכר, כמו אצל המורות: עליה מפרישים רק את
    החובה (מס שכר וביטוח לאומי), בלי פנסיה ובלי קרן השתלמות.
    בבית ספר שאינו משלם תוספת (מזכרת בתיה) — אין.
  */
  if (isPrincipalRow(t)) {
    const gross = agreed || gross0 || (t.reform === 'ofek' ? PRINCIPAL_OFEK_GROSS : 0);
    const psupp = schoolPaysSupp(t.schoolId) ? Math.min(PRINCIPAL_CHABAD_SUPP, gross) : 0;
    return { base: gross - psupp, mom: 0, supplement: psupp, gross, agreed: !!agreed };
  }

  const gross = agreed || gross0;
  // בית ספר שאינו משלם תוספת (מזכרת בתיה) — כל הברוטו הוא בסיס רגיל
  const supplement = schoolPaysSupp(t.schoolId) ? Math.min(supp0, gross) : 0;
  return { base: gross - supplement, mom: 0, supplement, gross, agreed: !!agreed };
}

// ברוטו למעסיק = בסיס + 40% · תוספת + 30%.
// זהו אומדן. כשהנהלת החשבונות מזינה את עלות המעביד בפועל, היא גוברת.
function calcEmployer(t) {
  // חל"ת: איפוס מלא — אין שכר ואין חובת הפרשות.
  if (t.leaveType === 'unpaid') {
    return { gross:0, base:0, mom:0, supplement:0, employerBase:0, employerSupp:0,
             social:0, estimate:0, isEstimate:false, total:0, parts:[], pct:0,
             extras:{ biguud:0, havraah:0, total:0 }, unpaidLeave:true };
  }
  // חל"ד: אין שכר מהרשת — המוסד לביטוח לאומי משלם — אבל חובת המעסיק
  // להמשיך את ההפרשות הסוציאליות נשארת: פנסיה ופיצויים וקרן השתלמות
  // על הבסיס הרגיל. יורדים: השכר, מס שכר, ביטוח לאומי, הבראה וביגוד.
  // כל עוד לא שובצה מחליפה, השכר נשאר מלא בתקציב — הוראת שרה 28.8.
  // ברגע ששורה אחרת נושאת את שמה ב"במקום מי", עוברים למצב ההפרשות.
  if (t.leaveType === 'maternity' && hasSubstitute(t)) {
    const bd = payBreakdown(t);
    const parts = [
      { key:'pension', label:'פנסיה ופיצויים (חל"ד)', rate:PENSION_RATE, on:bd.base, amount: Math.round(bd.base * PENSION_RATE) },
      { key:'keren',   label:'קרן השתלמות (חל"ד)',    rate:KEREN_RATE,   on:bd.base, amount: Math.round(bd.base * KEREN_RATE) },
    ];
    const social = parts.reduce((x, y) => x + y.amount, 0);
    return { gross:0, base:0, mom:0, supplement:0, employerBase:social, employerSupp:0,
             social, estimate:social, isEstimate:true, total:social, parts, pct:0,
             extras:{ biguud:0, havraah:0, total:0 }, unpaidLeave:true, maternity:true };
  }
  const { base, mom, supplement, gross } = payBreakdown(t);
  const extras = calcExtras(t);
  const { parts, total: itemized } = employerParts(t, base, supplement);

  // רצפת תקצוב: העלות למעסיק לא יורדת מ-140% מהברוטו. הפירוט למעלה מגיע
  // ל-127%–142% לפי תמהיל הבסיס והתוספת, ואינו כולל עדיין נסיעות ומעונות —
  // ולכן תקצוב לפיו בלבד יוצא חסר. ההשלמה מוצגת כשורה נפרדת ולא מובלעת
  // ברכיבים, כדי שיישאר ברור מה מפורט ומה אומדן, וכדי שברגע שנסיעות
  // ומעונות ייכנסו כרכיבים אמיתיים היא תצטמצם מעצמה. הוראת שרה 29.8.
  const FLOOR_RATE = 0.40;
  const floorGap = Math.max(0, Math.round(gross * FLOOR_RATE) - itemized);
  if (floorGap > 0) {
    parts.push({
      key: 'floor',
      label: 'השלמה ל-140% (נסיעות, מעונות ותוספות שטרם פורטו)',
      rate: null, on: null, amount: floorGap,
    });
  }
  const estimate = itemized + floorGap;

  const employerSupp = supplementCost(base, supplement, extras.biguud, extras.havraah);
  const employerBase = estimate - employerSupp;
  const actual   = Number(t._actualEmployerCost) || 0;
  const social   = actual || estimate;
  /*
    מילוי מקום: 100 ₪ לשעה (משרה מלאה = 90 שעות בחודש — שרה, 3.9).
    התשלום למ"מ אינו נכנס לתלוש — הוא מתווסף לעלות ההוראה בלבד,
    על השורה של הממלאת. הנעדרת אינה מנוכה.
  */
  // "זה לא נכון כי זה מ"מ לחופשת לידה" (שרה, 3.9): מחליפת חל"ד
  // מקבלת את שכרה הרגיל — היא המשרה. 100 ₪ לשעה רק למילוי שוטף.
  const coversMaternity = t.mmFor &&
    MATERNITY_LEAVES.has(mmKey(t.monthKey, t.schoolId, String(t.mmFor).trim()));
  const mmPay = coversMaternity ? 0 : (Number(t.mmHours) || 0) * MM_HOUR_RATE;
  if (mmPay > 0) parts.push({ key: 'mm',
    label: `מילוי מקום (${t.mmHours} שעות × ${MM_HOUR_RATE} ₪)`,
    rate: null, on: null, amount: mmPay });
  return {
    gross, base, mom, supplement, employerBase, employerSupp, social,
    estimate, isEstimate: !actual, mmPay,
    total: gross + social + mmPay,
    parts,                                    // הפירוט המלא, שורה לכל רכיב
    // השיעור בפועל, מעל הברוטו לעובדת. עם רצפת ה-140% הוא לא יורד מ-40%,
    // ועולה מעליה במורה שרוב שכרה בסיס (פנסיה וקרן חלות על הבסיס בלבד).
    pct: gross ? Math.round(estimate / gross * 1000) / 10 : 0,
    extras,
  };
}

export {
  MM_HOUR_RATE,
  MATERNITY_LEAVES,
  LEVELS,
  AGE_RED,
  CHABAD_SUPP,
  MM_REPLACED,
  mmKey,
  hasSubstitute,
  schoolPaysSupp,
  reformLabel,
  OFEK_GRADES,
  REFORMS,
  DEGREE_LABELS,
  ROLES,
  PRINCIPAL_ROLE,
  PRINCIPAL_OFEK_GROSS,
  PRINCIPAL_CHABAD_SUPP,
  isPrincipalRow,
  NIHUL_GRADES,
  ROLE_SHORT,
  principalDefaults,
  LEAVE_TYPES,
  leaveLabel,
  onLeave,
  unpaidThisMonth,
  fmtDay,
  leaveText,
  REASON_TYPES,
  currentScope,
  effectiveScope,
  MOM_MIN_SCOPE,
  isMother,
  OFEK_MOM_SCOPE,
  ofekMomScope,
  momBonusEligible,
  momUnderThreshold,
  MOM_SCOPE_BONUS,
  computedBaseScope,
  momScopeBonus,
  suggestedScope,
  calcNet,
  PRE_FRONTAL,
  baseFrontalFor,
  HOMEROOM_HOURS_PRE,
  homeroomHours,
  deriveHours,
  TRAVEL_DAY,
  DAYCARE_1,
  DAYCARE_2,
  HAVRAAH_DAY,
  BIGUUD_ANNUAL,
  havraahDays,
  calcExtras,
  calcReimb,
  PENSION_RATE,
  KEREN_RATE,
  MAS_SACHAR,
  BL_STEP,
  BL_LOW,
  BL_HIGH,
  bituachLeumi,
  employerParts,
  supplementCost,
  payBreakdown,
  calcEmployer,
  scopeWithMom,
};

/* ── גזירת נתוני התלוש (שרה, 3.9) ──────────────────────────────
   התלוש נבנה בעולם ישן: דרגה מהתואר, אחוז מהשעות (+3 למחנכת,
   +10 לאם מעל 79%), הבסיס = הברוטו פחות תוספת בית חב"ד. */
const SLIP_DARGA = { MA: '2', BA: '3', senior: '7', intern: '18', unlicensed: '12' };
export const slipDarga = (t) => SLIP_DARGA[t.degree] || null;
export function slipScope(t) {
  const pseudo = { reform: 'pre', frontalHours: t.frontalHours, role: t.role,
    gender: t.gender, childrenUnder18: t.childrenUnder18 };
  const base = computedBaseScope(pseudo);
  const bonus = momBonusEligible({ ...pseudo, scope: base, scopePct: base }) ? MOM_SCOPE_BONUS : 0;
  return { base, bonus, total: Math.min(100, base + bonus),
    hours: (Number(t.frontalHours) || 0) + homeroomHours(pseudo) };
}
