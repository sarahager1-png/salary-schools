import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Briefcase, Calculator, School, Check, ArrowLeft, ArrowRight,
  ChevronLeft, ChevronRight, Plus, LogOut, BarChart3, ClipboardCheck,
  Printer, Download, Upload, Send, Pencil, Trash2, X, Search,
  Paperclip, Image as ImageIcon, FileText, AlertTriangle, Lightbulb,
  CalendarClock, Bell, Users, FolderOpen, Database, FileSpreadsheet, ShieldAlert,
  ExternalLink, ShieldCheck, MessageCircle,
} from 'lucide-react';
import * as store from './lib/store.js';
import './index.css';
// v3 — רשת חינוך חב"ד design system

/* ═══════════════════════════════════════════════════════════════
   SALARY TABLES
═══════════════════════════════════════════════════════════════ */
function buildBase(start, end, steps = 30) {
  return Array.from({ length: steps }, (_, i) =>
    Math.round(start + (end - start) * (i / (steps - 1)))
  );
}
const OFEK_SALARY = {
  intern: buildBase(4800, 6096, 30),
  1: buildBase(6096,  8900),  2: buildBase(7300,  10200),
  3: buildBase(8500,  11500), 4: buildBase(9800,  12800),
  5: buildBase(11000, 13600), 6: buildBase(11900, 14300),
  7: buildBase(12800, 15000), 8: buildBase(13700, 15600),
  9: buildBase(14600, 16339),
};
const OFEK_GRADES = [
  { id: 'intern', label: 'מתמחה' },
  { id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' },
  { id: 4, label: '4' }, { id: 5, label: '5' }, { id: 6, label: '6' },
  { id: 7, label: '7' }, { id: 8, label: '8' }, { id: 9, label: '9' },
];
const PRE_SALARY = {
  intern:     buildBase(4500, 5800, 30),  // מתמחה
  unlicensed: buildBase(5000, 10500),     // לא מוסמך
  senior:     buildBase(5500, 12000),     // בכיר
  BA:         buildBase(5800, 13500),     // תואר ראשון
  MA:         buildBase(7200, 15200),     // תואר שני
};
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
/* ═══════════════════════════════════════════════════════════════
   המחשבון הרשמי של משרד החינוך
   הראוטים שמיים. קודם היו כאן מספרים (Calculators/1..4) — כל אחד מהם
   מפנה בשקט לרשימת המחשבונים, כך שהחשבת חשבה שהיא במחשבון אחד
   בזמן שהמסך שלפניה היה מסך אחר לגמרי.
═══════════════════════════════════════════════════════════════ */
const CALC_BASE = 'https://educalc.unq.co.il/#/Calculators/';
// דף רשימת המחשבונים — בלי לוכסן בסוף, אחרת זה אינו ראוט תקין באתר
const CALC_HOME = 'https://educalc.unq.co.il/#/Calculators';
const CALCULATORS = [
  { id: 'ofek', route: 'OfekHadash', label: 'אופק חדש' },
  { id: 'oz',   route: 'OzLetmura',  label: 'עוז לתמורה' },
  { id: 'mgmt', route: 'OfekNihul',  label: 'אופק — ניהול' },
  { id: 'old',  route: 'OldWorld',   label: 'עולם ישן' },
];
// מעדכנים ביד בכל פריסה. מוצג בכותרת ובמסך הכניסה.
const BUILD = 5;

const calcUrl = id => CALC_BASE + (CALCULATORS.find(c => c.id === id) || CALCULATORS[0]).route;
// מסלול המורה -> המחשבון שמתאים לו
const calcForReform = reform => (reform === 'pre' ? 'old' : 'ofek');
// למנהלת בית ספר יש מחשבון נפרד — אופק ניהול
// מורת רפורמה בחטיבה העליונה היא עוז לתמורה, לא אופק חדש — שני
// מחשבונים שונים באתר. קודם כולן נותבו לאופק, והכותרת אישרה לחשבת
// בחירה שגויה.
const calcForTeacher = t => (
  isPrincipalRow(t) ? 'mgmt'
  : t?.reform === 'ofek' && t?.level === 'high' ? 'oz'
  : calcForReform(t?.reform));

const REFORMS = [
  { id: 'ofek', label: 'אופק חדש' },
  { id: 'pre',  label: 'עולם ישן' },
];
const reformLabel = r => (REFORMS.find(x => x.id === r) || REFORMS[0]).label;

// שורת המנהלת מזוהה לפי התפקיד, שכבר קיים ב-ROLES
const PRINCIPAL_ROLE = 'principal';
// שכר הבסיס של מנהלת. כל מה שמעליו משולם כתוספת בית חב"ד.
const PRINCIPAL_BASE = 14400;
const isPrincipalRow = t => t?.role === PRINCIPAL_ROLE;
// דרגת הניהול היא א..ד ואינה סולם המורים. נשמרת כמספר 1..4.
const NIHUL_GRADES = [{ v:1, l:'א' }, { v:2, l:'ב' }, { v:3, l:'ג' }, { v:4, l:'ד' }];
const nihulLabel = v => NIHUL_GRADES.find(g => g.v === Number(v))?.l || null;
// בחירת תפקיד מנהל/ת גוררת את ברירות המחדל שלה: אופק חדש ודרגת ניהול א.
// שתיהן ניתנות לשינוי ידני אחר כך — זו נקודת פתיחה, לא נעילה.
const principalDefaults = draft => (
  draft?.role === PRINCIPAL_ROLE || draft?.gamulRole === PRINCIPAL_ROLE
    ? { reform: 'ofek', nihulGrade: draft.nihulGrade ?? 1 }
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
function calcBase(t) {
  const sen = Math.min(Math.max(Math.floor(t.seniority), 0), 29);
  if (t.reform === 'ofek') return (OFEK_SALARY[t.grade] || OFEK_SALARY[1])[sen];
  // טרום רפורמה: מתמחה = intern, אחרת לפי תואר
  return (PRE_SALARY[t.degree] || PRE_SALARY.BA)[sen];
}
function calcRoleSupp(base, roleId) {
  const r = ROLES.find(r => r.id === roleId);
  if (!r || r.pct === 0) return 0;
  return Math.max(Math.round(base * r.pct / 100), r.min);
}
function currentScope(t) {
  if (t.scopeChanges?.length > 0) {
    return [...t.scopeChanges].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  }
  return { scopePct: t.scopePct || 100, frontalHours: t.frontalHours || baseFrontalFor(t) };
}
// אחוז המשרה בפועל. עורך הטבלה כותב scopePct גם לעולם ישן, אבל רשומות
// ותיקות נשמרו ב-scope בלבד — ולכן שתיהן נקראות כאן.
function effectiveScope(t) {
  if (t.reform === 'ofek') return currentScope(t).scopePct || 100;
  // תוספת אם אינה מתווספת כאן. האחוז הוא מה שהוזן, ותו לא.
  return t.scope ?? t.scopePct ?? 100;
}
// תוספת אם עובדת קיימת בעולם ישן בלבד. באופק חדש אין לה ביטוי בשכר,
// ולכן מספר הילדים נאסף שם כמידע ואינו רכיב שכר.
// זכאות בעולם ישן: ילד אחד ומעלה עד גיל 18, בהיקף משרה 79% ומעלה.
function momBonusEligible(t) {
  return t.reform === 'pre' && (t.childrenUnder18 || 0) > 0;
}
// עשר נקודות אחוז על אחוז המשרה. במחשבון אין שדה לתוספת אם, וכך היא
// מוזנת — המשרה עולה, והשכר נגזר ממנה. אינה אחוז על השכר: מי שב-73%
// עולה ל-83%, ולא מקבלת 7.3% כסף.
const MOM_SCOPE_BONUS = 10;
function calcGross(t) {
  if (t._officialGross) return Number(t._officialGross);
  // שכר מנהל/ת אינו על סולם המורים, וגמול הניהול אינו אחוז מעליו: הוא
  // יוצא ממחשבון הניהול, לפי דרגת ניהול ורמת מורכבות. אומדן מטבלת
  // המורים היה מספר שנראה סביר וטועה בכיוון אחד — כלפי מטה.
  if (isPrincipalRow(t)) return 0;
  const base  = calcBase(t);
  const role  = calcRoleSupp(base, t.role);
  const scope = effectiveScope(t);
  return Math.round((base + role) * scope / 100);
}
// שורה שאין לה מספר עד שתרוץ סימולציה — להצגה, כדי שלא יופיע 0 ₪
// כאילו זו העלות.
const awaitingSim = t => isPrincipalRow(t) && !t._officialGross && !t._agreedGross;
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
/*
  הוצאות המעביד מעל הברוטו — רכיב־רכיב.

  קודם היה כאן מספר אחד, 40%, ואיש לא יכול היה לבדוק מה בתוכו. הפירוט
  מגלה שני דברים: מס שכר של מלכ"ר לא היה מיוצג כלל, ותוספת בית חב"ד
  נשאה 30% בזמן שהיא נושאת בפועל מס שכר וביטוח לאומי בלבד — היא אינה
  פנסיונית ואינה נושאת קרן השתלמות.

  לכן אין כאן שיעור כולל קבוע. כל רכיב מחושב על הבסיס שלו, והשיעור
  הכולל נגזר מהתוצאה ומשתנה לפי הוותק, אחוז המשרה וגובה השכר.
*/
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
  const wage = base + supplement + biguud + havraah;
  const parts = [
    { key:'pension',  label:'פנסיה ופיצויים',   rate:PENSION_RATE, on:base, amount: Math.round(base * PENSION_RATE) },
    { key:'keren',    label:'קרן השתלמות',      rate:KEREN_RATE,   on:base, amount: Math.round(base * KEREN_RATE) },
    { key:'masSachar',label:'מס שכר (מלכ"ר)',   rate:MAS_SACHAR,   on:wage, amount: Math.round(wage * MAS_SACHAR) },
    { key:'bl',       label:'ביטוח לאומי',      rate:null,         on:wage, amount: Math.round(bituachLeumi(wage)) },
    { key:'havraah',  label:'הבראה',            rate:null,         on:null, amount: havraah },
    { key:'biguud',   label:'ביגוד',            rate:null,         on:null, amount: biguud },
  ];
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
  const ofek = Number(t._officialGross) || 0;
  const old  = Number(t._officialGrossPre) || 0;
  // מנהלת: שכר הבסיס קבוע, וכל מה שמעליו הוא תוספת בית חב"ד.
  // הברוטו מגיע מסימולציית הניהול, או מהשכר המוסכם אם נקבע לה כזה.
  const agreed = Number(t._agreedGross) || 0;
  if (isPrincipalRow(t)) {
    const gross = agreed || ofek;
    const base  = Math.min(PRINCIPAL_BASE, gross);
    return { base, supplement: gross - base, gross, agreed: !!agreed };
  }
  // בית ספר עולם ישן — סימולציה אחת, אין רכיב תוספת
  // תוספת אם אינה נוספת כאן: היא כבר בתוך אחוז המשרה שהוזן למחשבון,
  // והמספר שחזר משם כולל אותה.
  if (t.reform !== 'ofek') return { base: ofek, mom: 0, supplement: 0, gross: ofek };
  // אם האופק יוצא נמוך מהעולם הישן, העובדת נשארת עם העולם הישן
  const supplement = Math.max(0, ofek - old);
  return { base: old, mom: 0, supplement, gross: old + supplement };
}

// ברוטו למעסיק = בסיס + 40% · תוספת + 30%.
// זהו אומדן. כשהנהלת החשבונות מזינה את עלות המעביד בפועל, היא גוברת.
function calcEmployer(t) {
  const { base, mom, supplement, gross } = payBreakdown(t);
  const extras = calcExtras(t);
  const { parts, total: estimate } = employerParts(t, base, supplement);
  const employerSupp = supplementCost(base, supplement, extras.biguud, extras.havraah);
  const employerBase = estimate - employerSupp;
  const actual   = Number(t._actualEmployerCost) || 0;
  const social   = actual || estimate;
  return {
    gross, base, mom, supplement, employerBase, employerSupp, social,
    estimate, isEstimate: !actual,
    total: gross + social,
    parts,                                    // הפירוט המלא, שורה לכל רכיב
    // השיעור בפועל, מעל הברוטו לעובדת. הוא אינו קבוע: הוא נמוך יותר
    // ככל שחלק גדול יותר מהשכר הוא תוספת בית חב"ד, שנושאת פחות.
    pct: gross ? Math.round(estimate / gross * 1000) / 10 : 0,
    extras,
  };
}

/* ═══════════════════════════════════════════════════════════════
   CHANGE TRACKING
═══════════════════════════════════════════════════════════════ */
/*
  מקור אמת אחד לשדות המורה.
  קודם היו כאן שלוש רשימות ידניות (TRACKED, FIELD_LBL, BASE_FIELDS) שיצאו
  מסנכרון: role/level/ageGroup השפיעו על השכר ולא הפילו אישור מאושר,
  childrenUnder18 הפיל אישור אבל לא הופיע ב-diff, ו-isTemp הופיע ב-diff
  בלי תווית. עכשיו כל אחת מהן נגזרת מכאן.

  base    — משפיע על השכר. שינוי מבטל את הסימולציה ואת האישור.
  tracked — מוצג לשליח כ"לפני / אחרי".
  fmt     — תצוגה קריאה בעברית.
*/
const FIELDS = [
  { key:'reform',          label:'מסלול',          base:true,  tracked:true,  fmt: v => reformLabel(v) },
  { key:'grade',           label:'דרגה',           base:true,  tracked:true,  fmt: v => v === 'intern' ? 'מתמחה' : `ד${v}` },
  { key:'degree',          label:'תואר',           base:true,  tracked:true,  fmt: v => DEGREE_LABELS[v] || v },
  { key:'level',           label:'שלב',            base:true,  tracked:true,  fmt: v => LEVELS[v]?.label || v },
  { key:'ageGroup',        label:'קבוצת גיל',      base:true,  tracked:true,  fmt: v => AGE_RED[v]?.label || v },
  { key:'seniority',       label:'ותק',            base:true,  tracked:true },
  { key:'role',            label:'תפקיד',          base:true,  tracked:true,  fmt: v => ROLES.find(r => r.id === v)?.label.split('(')[0].trim() || 'ללא תפקיד נוסף' },
  { key:'scopePct',        label:'% משרה',         base:true,  tracked:true,  fmt: v => `${v}%` },
  { key:'frontalHours',    label:'שעות פרונטלי',   base:true,  tracked:true },
  { key:'scope',           label:'% משרה',         base:true,  tracked:false, fmt: v => `${v}%` },
  // משפיע על השכר בעולם ישן בלבד — באופק אין לו ביטוי בשכר
  { key:'childrenUnder18', label:'ילדים עד 18',    base: t => t.reform === 'pre', tracked:true },
  { key:'leaveType',       label:'סטטוס',          base:true,  tracked:true,  fmt: v => leaveLabel(v) },
  { key:'leaveFrom',       label:'יציאה לחופשה',   base:true,  tracked:true,  fmt: v => fmtDay(v) },
  { key:'leaveTo',         label:'חזרה מחופשה',    base:true,  tracked:true,  fmt: v => fmtDay(v) },
  { key:'isTemp',          label:'שיבוץ זמני',     base:false, tracked:true,  fmt: v => v ? 'כן' : 'לא' },
  { key:'startDate',       label:'מתאריך',         base:false, tracked:true,  fmt: v => v.split('-').reverse().join('/') },
  { key:'endDate',         label:'עד תאריך',       base:false, tracked:true,  fmt: v => v.split('-').reverse().join('/') },
];
const TRACKED     = FIELDS.filter(f => f.tracked).map(f => f.key);
const BASE_FIELDS = FIELDS.filter(f => f.base).map(f => f.key);
const FIELD_LBL   = Object.fromEntries(FIELDS.map(f => [f.key, f.label]));
const FIELD_FMT   = Object.fromEntries(FIELDS.filter(f => f.fmt).map(f => [f.key, f.fmt]));
function snapT(t) { return Object.fromEntries(TRACKED.map(k => [k, t[k]])); }
function diffT(t) {
  if (!t._snapshot) return [];
  return TRACKED.filter(k => String(t[k] ?? '') !== String(t._snapshot[k] ?? ''));
}
// שינוי בשדה בסיס מבטל את הסימולציה ואת האישור
function baseFieldsChanged(next, prev) {
  return FIELDS.some(f => {
    if (!f.base) return false;
    // base יכול להיות מותנה במסלול — נבדק על שני הצדדים, כדי שגם מעבר
    // מסלול שמכניס שדה לחישוב ייחשב שינוי
    const affectsPay = typeof f.base === 'function' ? (f.base(next) || f.base(prev)) : true;
    return affectsPay && String(next[f.key] ?? '') !== String(prev[f.key] ?? '');
  });
}
// מורת אופק דורשת שתי סימולציות — עולם ישן ואופק — כי הפער ביניהן הוא
// רכיב התשלום. מורת עולם ישן דורשת אחת.
// טלפון ומייל הם הדרך היחידה להעביר לעובד/ת את נתוני ההעסקה לחתימה.
// שורה בלעדיהם נראית שלמה ומתגלה רק בשלב החתימה.
const hasContact = t => Boolean(String(t?.phone || '').trim() && String(t?.email || '').trim());

const simComplete = t => {
  if (t._agreedGross) return true;               // שכר מוסכם — אין צורך בסימולציה
  if (isPrincipalRow(t)) return Boolean(t._officialGross);   // ניהול — סימולציה אחת
  return Boolean(t.reform === 'ofek'
    ? (t._officialGross && t._officialGrossPre)
    : t._officialGross);
};

// סטטוס מורה בזרימת העבודה:
// needs_sim: מנהלת שמרה שינויים, ממתין לסימולציה אצל חשבת שכר
// needs_approval: הסימולציות הושלמו, ממתין לאישור שליח
// approved: השליח אישר
const needsSim      = t => Boolean(t._changedAt && !t._approved && !simComplete(t));
const needsApproval = t => Boolean(t._changedAt && !t._approved && simComplete(t));
const isPending     = t => Boolean(t._changedAt && !t._approved); // = needsSim || needsApproval

// בחודש הראשון נדרש אישור רשתי נוסף אחרי אישור השליח. רק אחריו נשלחים
// למורות נתוני ההעסקה לחתימה.
const NETWORK_APPROVER = 'רינה אלהרר';
// שורה מאושרת שהסימולציה שלה נמחקה אחרי האישור אינה עוברת הלאה: בלי
// סימולציה מלאה אין מספר לחתום עליו, והמאשרת ראתה "בסיס 0" ו-818 ₪.
const needsNetApproval = (t, isFirstMonth) =>
  Boolean(isFirstMonth && t._approved && !t._netApproved && simComplete(t));
const fullyApproved = (t, isFirstMonth) =>
  Boolean(t._approved && simComplete(t) && (!isFirstMonth || t._netApproved));

// מי מאשרת את בית הספר: מאשר ייעודי אם יש, אחרת המאשרת הכללית.
// השם המקודד נשאר רק כגיבוי לרגע שלפני הטעינה.
function approverFor(approvers, schoolId) {
  return approvers.find(a => a.schoolId === schoolId)
      || approvers.find(a => !a.schoolId)
      || { name: NETWORK_APPROVER, schoolId: null };
}

function readableVal(field, val) {
  if (val === undefined || val === null || val === '') return '—';
  if (typeof val === 'boolean') return FIELD_FMT[field] ? FIELD_FMT[field](val) : (val ? 'כן' : 'לא');
  return FIELD_FMT[field] ? FIELD_FMT[field](val) : String(val);
}

/* ═══════════════════════════════════════════════════════════════
   STORAGE
═══════════════════════════════════════════════════════════════ */
const LS_SCHOOLS  = 'ss-schools-v2';
const LS_SEEDED   = 'ss-seeded-v1';     // כדי שמחיקה מכוונת לא תשוחזר בטעינה הבאה
const LS_REFORM_FIX = 'ss-reform-fix-v1';
const LS_PRINCIPAL_ROWS = 'ss-principal-rows-v1';

// בתי הספר של הרשת. השמות לקוחים מ-schools.config.json של מערכת תקציב
// בית הספר, כדי ששתי המערכות יקראו לאותו בית ספר באותו שם.
// המסלול קובע אם תוספת אם נכנסת לחישוב, ואיזה מחשבון רשמי נפתח.
const DEFAULT_SCHOOLS = [
  { name: 'בית חינוך רעננה',      city: 'רעננה',        reform: 'ofek' },
  { name: 'שלהבות מזכרת בתיה',    city: 'מזכרת בתיה',   reform: 'ofek' },
  { name: 'שלהבות אשקלון',        city: 'אשקלון',       reform: 'ofek' },
  { name: 'שלהבות אור עקיבא',     city: 'אור עקיבא',    reform: 'ofek' },
  { name: 'שלהבות ירושלים',       city: 'ירושלים',      reform: 'pre'  },
  { name: 'שלהבות גני תקוה',      city: 'גני תקוה',     reform: 'ofek' },
  { name: 'שלהבות רמת ישי',       city: 'רמת ישי',      reform: 'ofek' },
  { name: 'בית חינוך עפולה',      city: 'עפולה',        reform: 'pre'  },
];
// ירושלים ועפולה נזרעו בטעות כאופק בגרסה קודמת — תיקון חד-פעמי לפי שם,
// כדי שהתקנה קיימת לא תישאר עם המסלול הלא נכון. שינוי ידני אחריו נשמר.
const OLD_WORLD_NAMES = DEFAULT_SCHOOLS.filter(s => s.reform === 'pre').map(s => s.name);
const LS_TEACHERS = 'ss-teachers-v2';   // legacy
const LS_MONTHS   = 'ss-months-v1';
const uid   = () => Math.random().toString(36).slice(2, 10);

// Month helpers
const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const toMonthKey   = (y, m) => `${y}-${String(m).padStart(2,'0')}`;
const nowMonthKey  = () => { const d=new Date(); return toMonthKey(d.getFullYear(), d.getMonth()+1); };
const fmtMonth     = k => { if (!k) return ''; const [y,m]=k.split('-'); return `${MONTH_NAMES[Number(m)-1]} ${y}`; };
const nextMonthKey = k => { const [y,m]=k.split('-').map(Number); return m===12 ? toMonthKey(y+1,1) : toMonthKey(y,m+1); };

// Base fields — if changed, simulation clears for that month

const EMPTY_TEACHER = {
  id: '', schoolId: '', tzId: '', name: '', email: '', phone: '',
  reform: 'ofek', level: 'elementary', grade: 1, degree: 'BA',
  seniority: 0, frontalHours: 26, scopePct: 100, scope: 100,
  role: 'none', ageGroup: 'none',
  isTemp: false, startDate: '', endDate: '', scopeChanges: [],
  leaveType: 'none', leaveFrom: null, leaveTo: null,
  childrenUnder18: 0,
  _officialGrossPre: null,
  _agreedGross: null,          // שכר מוסכם למנהלת — מחליף את הסימולציה
  _actualEmployerCost: null,   // עלות מעביד בפועל מהנהלת החשבונות — גוברת על האומדן
  _netApproved: false,         // אישור רשתי — נדרש בחודש הראשון בלבד
  _netApprovedAt: null,
  _snapshot: null, _changedAt: null, _approved: false, _approvedAt: null,
  _files: [],
  // ─── Monthly fields (reset each month) ───
  absenceDays: 0,        // ימי העדרות
  sickFiles: [],         // קבצי מחלה
  mmHours: 0,            // שעות ממ"מ
  mmFor: '',             // במקום מי
  monthlyExtras: 0,      // תוספות חודשיות נוספות (₪)
};

const fmt = d => d ? d.split('-').reverse().join('/') : '—';

// המנהלת היא עובדת של הרשת, ולכן יש לה שורה משלה בטבלת השכר —
// אחרת התקציב של בית הספר מציג את כל צוות ההוראה חוץ ממי שמנהלת אותו.
const PRINCIPAL_PLACEHOLDER = 'מנהלת בית הספר';
function makePrincipalRow(school) {
  return {
    ...EMPTY_TEACHER,
    schoolId: school.id,
    name: PRINCIPAL_PLACEHOLDER,
    role: PRINCIPAL_ROLE,
    reform: school.reform || 'ofek',
    _changedAt: new Date().toISOString(),
    _approved: false,
  };
}
/* ═══════════════════════════════════════════════════════════════
   BACKUP — כל המצב חי ב-localStorage בלבד, ולכן חייב לצאת החוצה
═══════════════════════════════════════════════════════════════ */
const BACKUP_VERSION = 1;

function exportBackup(schools, months) {
  const teacherCount = Object.values(months).reduce((s, ts) => s + ts.length, 0);
  const payload = {
    app: 'salary-schools',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: { schools: schools.length, months: Object.keys(months).length, teacherRecords: teacherCount },
    schools,
    months,
  };
  downloadBlob(JSON.stringify(payload, null, 2), `גיבוי_שכר_${stampToday()}.json`, 'application/json;charset=utf-8;');
  return payload.counts;
}

/* ═══════════════════════════════════════════════════════════════
   LOGIN SCREEN
═══════════════════════════════════════════════════════════════ */
/* iframe של אתר חיצוני — אם הוא לא נטען (חסימת עוגיות צד-שלישי, תקלה
   באתר, רשת מסוננת) המסך נשאר לבן בלי הסבר. כאן יש מצב טעינה,
   פסק זמן, ותמיד דרך לפתוח את המחשבון בחלון נפרד. */
function CalculatorFrame({ calcId, style }) {
  const url = calcUrl(calcId);
  const [state, setState] = useState('loading');   // loading | ready | slow
  const frameRef = useRef(null);

  // האתר הוא SPA, וקישור עמוק ישיר נופל חזרה לרשימת המחשבונים ומציג את
  // אופק חדש. לכן נטענת הרשימה, ורק אחרי שהאתר מסיים את האתחול שלו —
  // הוא מפנה את עצמו דרך /ClientPage — משנים את ה-hash.
  //
  // הניווט נעשה ב-contentWindow.location ולא בהחלפת src: החלפת src היא
  // טעינה מחדש, והאתר בולע בה את הראוט שוב. ניווט על מסמך שכבר טעון הוא
  // שינוי hash, והראוטר של האתר מגיב לו. כתיבה ל-location של מסגרת
  // ממקור אחר מותרת — רק קריאה חסומה.
  //
  // הקומפוננטה ממופתחת ב-key לפי calcId בצד הקורא, ולכן החלפת מחשבון
  // מרכיבה אותה מחדש והמצב חוזר ל-loading בלי setState בתוך effect.
  useEffect(() => {
    const nudge = () => {
      try { frameRef.current?.contentWindow?.location.replace(url); }
      catch { /* מקור אחר — הניווט עדיין נשלח */ }
    };
    // דחיפה אחת אינה מספיקה: כל עוד האתר מפנה את עצמו דרך /ClientPage
    // הניווט נבלע. דוחפים שוב ושוב עד שהוא נתפס. ניווט חוזר לאותה
    // כתובת בדיוק הוא no-op, ולכן אינו מאפס טופס שכבר מולא.
    const nudges = [3000, 4500, 6000, 7500].map(ms => setTimeout(nudge, ms));
    // הכיסוי יורד רק אחרי הדחיפה האחרונה. קודם הוא ירד ב-6 שניות, בעוד
    // המסגרת עדיין הציגה את אופק חדש — והחשבת יכלה להקליד למחשבון הלא
    // נכון בלי לדעת. ריק זה בלבול; מחשבון שגוי זה מספר שגוי.
    const ok   = setTimeout(() => setState('ready'), 8500);
    const slow = setTimeout(() => setState(s => (s === 'ready' ? s : 'slow')), 18000);
    return () => { nudges.forEach(clearTimeout); clearTimeout(ok); clearTimeout(slow); };
  }, [url]);

  return (
    // הטופס של משרד החינוך גבוה מ-1,200 פיקסלים, וכפתור "חשב" בתחתיתו.
    // כשהמסגרת בגובה הפאנל הכפתור נופל מתחת לקצה, והגלילה היחידה שמגיעה
    // אליו היא גלילה *בתוך* המסגרת — שאין לה סימן ואיש אינו מנחש אותה.
    // לכן המסגרת נפרשת למלוא גובה הטופס, והפאנל עצמו הוא שנגלל.
    <div style={{ position:'relative', flex:1, minHeight:0, overflowY:'auto', ...style }}>
      <iframe
        ref={frameRef}
        src={CALC_HOME}
        style={{ width:'100%', height:'100%', minHeight:1320, border:'none', display:'block' }}
        title="מחשבון שכר רשמי — משרד החינוך"
        allow="fullscreen"
      />
      {state === 'ready' && (
        // הכפתור "חשב" נמצא בתחתית טופס ארוך. בלי המשפט הזה אפשר למלא
        // את כל השדות ולא למצוא איפה מחשבים.
        <div style={{ position:'sticky', bottom:0, insetInline:0, padding:'7px 12px', background:'rgba(255,255,255,0.94)',
          borderTop:'1px solid var(--line)', backdropFilter:'blur(6px)', pointerEvents:'none' }}>
          <p style={{ fontSize:11.5, color:'var(--text3)', textAlign:'center' }}>
            מלאי את השדות וגללי מטה — הכפתור <b style={{ color:'var(--text2)' }}>חשב</b> בתחתית הטופס
          </p>
        </div>
      )}
      {state !== 'ready' && (
        <div style={{ position:'absolute', inset:0, background:'var(--bg)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:24, textAlign:'center' }}>
          {state === 'loading' ? (
            <p style={{ fontSize:13.5, color:'var(--text3)', fontWeight:600 }}>טוען את המחשבון הרשמי…</p>
          ) : (
            <>
              <div style={{ width:52, height:52, borderRadius:16, background:'var(--warn-bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <AlertTriangle size={24} strokeWidth={2} color="var(--warn)" />
              </div>
              <p style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>המחשבון הרשמי לא נטען</p>
              <p style={{ fontSize:12.5, color:'var(--text3)', maxWidth:320, lineHeight:1.6 }}>
                ייתכן שהדפדפן חוסם עוגיות צד-שלישי, או שהאתר של משרד החינוך אינו זמין כרגע.
                אפשר לפתוח אותו בחלון נפרד ולחזור לכאן עם התוצאה.
              </p>
            </>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer" className="apple-btn apple-btn-ghost" style={{ textDecoration:'none' }}>
            <ExternalLink size={14} strokeWidth={2.2} />
            פתיחה בחלון נפרד
          </a>
        </div>
      )}
    </div>
  );
}

function LoginScreen({ onSignedIn, initialError = '' }) {
  const [email, setEmail]   = useState('');
  const [password, setPass] = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(initialError);
  // הכפתור מופיע רק אם הספק באמת מופעל בשרת. כפתור שנכשל בלחיצה גרוע
  // מכפתור שאינו קיים, וברגע שגוגל יופעל בלוח הבקרה הוא יופיע לבד.
  const [hasGoogle, setHasGoogle] = useState(false);
  useEffect(() => {
    let alive = true;
    store.authProviders().then(ps => { if (alive) setHasGoogle(ps.includes('google')); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const google = async () => {
    setBusy(true); setError('');
    try { await store.signInWithGoogle(); }   // מפנה לגוגל; החזרה מטופלת באתחול
    catch (err) { setError(err.message); setBusy(false); }
  };

  // כניסה בלי סיסמה: קישור למייל
  const [linkSent, setLinkSent] = useState('');
  const sendLink = async () => {
    if (!email.trim()) { setError('יש למלא כתובת מייל'); return; }
    setBusy(true); setError(''); setLinkSent('');
    try { await store.sendLoginLink(email); setLinkSent(email.trim()); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true); setError('');
    try {
      const profile = await store.signIn(email, password);
      onSignedIn(profile);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'32px 18px' }} dir="rtl">
      <form onSubmit={submit} style={{ width:'100%', maxWidth:400 }} className="spring-enter">

        <div style={{ textAlign:'center', marginBottom:26 }}>
          <img src="/logo-chabad.png" alt="רשת חינוך חב״ד"
            style={{ height:56, width:'auto', objectFit:'contain', margin:'0 auto 16px', display:'block' }} />
          <h1 style={{ fontSize:27, fontWeight:800, letterSpacing:'-0.03em', color:'var(--text)', marginBottom:5 }}>מערכת שכר מורים</h1>
          <p style={{ fontSize:14, color:'var(--text3)' }}>ניהול תקציב שכר — רשת בתי הספר</p>
        </div>

        <div className="apple-card" style={{ padding:'24px 22px' }}>
          <div style={{ marginBottom:14 }}>
            <p className="apple-label">כתובת מייל</p>
            <input className="apple-input" type="email" dir="ltr" autoComplete="username"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="name@reshetch.org.il" autoFocus />
          </div>

          <div style={{ marginBottom:18 }}>
            <p className="apple-label">סיסמה</p>
            <input className="apple-input" type="password" autoComplete="current-password"
              value={password} onChange={e => setPass(e.target.value)} />
          </div>

          {linkSent && (
            <div style={{ background:'var(--ok-bg)', border:'1px solid var(--ok-line)', borderRadius:12,
              padding:'11px 13px', marginBottom:14, fontSize:13, color:'var(--ok)', lineHeight:1.7 }}>
              <b>נשלח קישור כניסה ל־{linkSent}</b><br/>
              פתחי אותו <b>מהמכשיר הזה</b>. הקישור תקף לשעה.
            </div>
          )}

          {error && (
            <div style={{ background:'var(--danger-bg)', border:'1px solid var(--danger-line)', borderRadius:12,
              padding:'10px 13px', marginBottom:14, fontSize:13, color:'var(--danger)', fontWeight:600 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={busy || !email.trim() || !password}
            className="apple-btn apple-btn-blue"
            style={{ width:'100%', minHeight:48, fontSize:15.5, fontWeight:700 }}>
            {busy ? 'מתחברת…' : 'כניסה למערכת'}
            {!busy && <ArrowLeft size={17} strokeWidth={2.5} />}
          </button>

          <div style={{ display:'flex', alignItems:'center', gap:10, margin:'16px 0 14px' }}>
            <div style={{ flex:1, height:1, background:'var(--line)' }} />
            <span style={{ fontSize:11.5, color:'var(--text3)' }}>או בלי סיסמה</span>
            <div style={{ flex:1, height:1, background:'var(--line)' }} />
          </div>

          <button type="button" onClick={sendLink} disabled={busy || !email.trim()}
            className="apple-btn apple-btn-ghost"
            style={{ width:'100%', minHeight:46, fontSize:14.5, fontWeight:600, gap:8 }}>
            <Send size={16} strokeWidth={2.3} />
            שלחו לי קישור כניסה למייל
          </button>

          {hasGoogle && (
            <>
              <div style={{ height:10 }} />
              <button type="button" onClick={google} disabled={busy}
                className="apple-btn apple-btn-ghost"
                style={{ width:'100%', minHeight:48, fontSize:15, fontWeight:600, gap:10 }}>
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.2z"/>
                  <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z"/>
                  <path fill="#FBBC05" d="M11.6 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.3C2.8 17 2 20.4 2 24s.8 7 2.3 9.9l7.3-5.7z"/>
                  <path fill="#EA4335" d="M24 10.7c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.1 30 2 24 2 15.4 2 7.9 6.9 4.3 14.1l7.3 5.7c1.7-5.2 6.6-9.1 12.4-9.1z"/>
                </svg>
                כניסה עם גוגל
              </button>
            </>
          )}
        </div>

        <p style={{ textAlign:'center', fontSize:12, color:'var(--text3)', marginTop:18, lineHeight:1.7 }}>
          מנהלות בית ספר נכנסות דרך הקישור האישי שנשלח אליהן.<br/>
          {hasGoogle && <>הכניסה עם גוגל היא לחשבון שהוגדר לך במערכת.<br/></>}
          רשת חינוך חב״ד
        </p>
      </form>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TEACHER DIFF
═══════════════════════════════════════════════════════════════ */
function TeacherDiff({ t }) {
  const diffs = diffT(t);
  const isNew = !t._snapshot;
  if (isNew) return <span className="apple-badge badge-blue">עובד/ת הוראה חדש/ה</span>;
  if (diffs.length === 0) {
    const hasScopeChanges = t.scopeChanges?.some(c => !c._approved);
    if (!hasScopeChanges) return <span className="apple-badge badge-orange">שינוי תוכן</span>;
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      {diffs.map(k => (
        <div key={k} style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', fontSize:12 }}>
          <span style={{ color:'var(--apple-text2)' }}>{FIELD_LBL[k]}:</span>
          <span style={{ textDecoration:'line-through', color:'var(--apple-red)' }}>{readableVal(k, t._snapshot[k])}</span>
          <span style={{ color:'var(--apple-text3)' }}>→</span>
          <span style={{ fontWeight:600, color:'var(--apple-green)' }}>{readableVal(k, t[k])}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EMPLOYMENT DETAILS — נתוני העסקה לחתימת העובדת
═══════════════════════════════════════════════════════════════ */
function EmploymentDetails({ teacher: x, school, monthLabel, onClose }) {
  const emp = calcEmployer(x);
  const d   = deriveHours(x);
  const rows = [
    ['שם העובדת',        x.name],
    ['תעודת זהות',       x.tzId || '—'],
    ['בית הספר',         school?.name || '—'],
    ['מסלול',            reformLabel(x.reform)],
    ...(x.reform === 'ofek' && !isPrincipalRow(x)
      ? [['דרגה באופק', x.grade === 'intern' ? 'מתמחה' : `דרגה ${x.grade}`]] : []),
    ...(isPrincipalRow(x) ? [['תפקיד', 'מנהלת בית ספר']] : []),
    ['תואר',             DEGREE_LABELS[x.degree] || x.degree || '—'],
    ['ותק בהוראה',       `${x.seniority || 0} שנים`],
    ['שלב חינוך',        LEVELS[x.level]?.label || '—'],
    ['שעות פרונטליות',   d ? d.frontal : (x.frontalHours || '—')],
    ...(d ? [['שעות פרטניות', d.individual], ['שעות שהייה', d.presence]] : []),
    ['אחוז משרה',        `${effectiveScope(x)}%`],
    ...(x.isTemp ? [['שיבוץ', `זמני${x.endDate ? ` · עד ${fmt(x.endDate)}` : ''}`]] : []),
  ];
  const pay = [
    ['שכר בסיס',           emp.base],
    ...(emp.supplement ? [['תוספת בית חב"ד', emp.supplement]] : []),
    ['ברוטו חודשי',        emp.gross],
  ];

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:100, overflowY:'auto', padding:'24px 16px' }} dir="rtl">
      <div className="apple-card" style={{ maxWidth:640, margin:'0 auto', padding:0 }}>
        <div className="no-print" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'14px 20px', borderBottom:'1px solid var(--line)' }}>
          <h2 style={{ fontSize:17, fontWeight:800, color:'var(--text)' }}>נתוני העסקה לחתימה</h2>
          <div style={{ display:'flex', gap:8 }}>
            <button className="apple-btn apple-btn-blue" onClick={() => window.print()} style={{ minHeight:36, fontSize:13 }}>
              <Printer size={14} strokeWidth={2.2} />
              הדפסה / PDF
            </button>
            <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ minHeight:36, fontSize:13 }}>סגירה</button>
          </div>
        </div>

        <div style={{ padding:'24px 28px 28px' }}>
          <div style={{ textAlign:'center', marginBottom:20 }}>
            <img src="/logo-chabad.png" alt="רשת חינוך חב״ד" style={{ height:46, margin:'0 auto 10px', display:'block' }} />
            <h3 style={{ fontSize:19, fontWeight:800, color:'var(--text)', letterSpacing:'-0.02em' }}>נתוני העסקה</h3>
            <p style={{ fontSize:13, color:'var(--text3)', marginTop:3 }}>{school?.name} · {monthLabel}</p>
          </div>

          <table className="apple-table" style={{ marginBottom:18 }}>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ color:'var(--text3)', width:'45%' }}>{k}</td>
                  <td style={{ fontWeight:600, color:'var(--text)' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="apple-section" style={{ marginBottom:18 }}>
            {pay.map(([k, v], i) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0',
                borderTop: i === pay.length - 1 ? '1px solid var(--line)' : undefined,
                marginTop: i === pay.length - 1 ? 6 : 0, paddingTop: i === pay.length - 1 ? 10 : 5 }}>
                <span style={{ fontSize:13.5, color:'var(--text2)', fontWeight: i === pay.length - 1 ? 700 : 400 }}>{k}</span>
                <span className="num" style={{ fontSize: i === pay.length - 1 ? 17 : 14,
                  fontWeight: i === pay.length - 1 ? 800 : 600,
                  color: i === pay.length - 1 ? 'var(--purple)' : 'var(--text)' }}>
                  {v.toLocaleString('he-IL')} ₪
                </span>
              </div>
            ))}
          </div>

          <p style={{ fontSize:12.5, color:'var(--text2)', lineHeight:1.8, marginBottom:20 }}>
            אני החתומה מטה מאשרת שנתוני ההעסקה המפורטים לעיל נכונים, ושהם משקפים את
            תנאי העסקתי ברשת חינוך חב״ד.
          </p>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            {['חתימת העובדת', 'תאריך'].map(l => (
              <div key={l}>
                <div style={{ borderBottom:'1px solid var(--text3)', height:44 }} />
                <p style={{ fontSize:11.5, color:'var(--text3)', marginTop:5 }}>{l}</p>
              </div>
            ))}
          </div>

          <p style={{ fontSize:10.5, color:'var(--text3)', marginTop:22, lineHeight:1.7, textAlign:'center' }}>
            מסמך פנימי של רשת חינוך חב״ד. אינו מחליף טופס 101.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NETWORK APPROVAL — אישור רשתי בחודש הראשון
═══════════════════════════════════════════════════════════════ */
function NetworkApprovalView({ schools, teachers, isFirstMonth, monthLabel, onApprove,
  approvers = [], user, firstMonthKey, firstMonthLabel, firstMonthPending = 0, onGoToMonth }) {
  const [openSchool, setOpenSchool] = useState(null);

  const waiting = teachers.filter(t => needsNetApproval(t, isFirstMonth));
  // תחום האחריות: מאשר ייעודי — בית ספר אחד; המאשרת הכללית — כל מה
  // שאין לו ייעודי. "אישור כל הרשת" שסיים ב"הכול מאושר" בזמן שעפולה
  // חיכתה למענדי — נבע מכך שהמסך ספר רק את מה שה-RLS החזיר.
  const mine   = user?.schoolId
    ? schools.filter(s => s.id === user.schoolId)
    : schools.filter(s => !approvers.some(a => a.schoolId === s.id));
  const others = schools.filter(s => !mine.includes(s));
  const scopeLabel = user?.schoolId ? (mine[0]?.name || 'בית הספר שלך') : 'כל בתי הספר באחריותך';
  const nWorkers   = n => (n === 1 ? 'עובדת אחת' : `${n} עובדות`);
  const othersNote = others.length
    ? `${others.map(s => `${s.name} (${approverFor(approvers, s.id).name})`).join(', ')} — באישור של מאשר אחר`
    : '';
  const grouped = schools
    .map(s => ({ school: s, list: waiting.filter(t => t.schoolId === s.id) }))
    .filter(g => g.list.length > 0);
  const totalCost = waiting.reduce((s, t) => s + calcEmployer(t).total, 0);

  const confirmAnd = (list, what) => {
    if (!list.length) return;
    const cost = list.reduce((s, t) => s + calcEmployer(t).total, 0);
    const ok = window.confirm(
      `אישור ${what}\n\n${nWorkers(list.length)} · עלות מעסיק ${cost.toLocaleString('he-IL')} ₪ לחודש · ${(cost * 12).toLocaleString('he-IL')} ₪ לשנה\n\n`
      + `לאחר האישור אפשר להפיק למורות את נתוני ההעסקה לחתימה.\n\nלאשר?`
    );
    if (ok) onApprove(list.map(t => t.id));
  };

  if (!isFirstMonth) {
    return (
      <div style={{ maxWidth:640, margin:'0 auto', padding:'60px 20px', textAlign:'center' }} dir="rtl">
        <div style={{ width:56, height:56, borderRadius:17, background:'var(--ok-bg)', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ShieldCheck size={26} strokeWidth={2.2} color="var(--ok)" />
        </div>
        <p style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>אין צורך באישור רשתי ב{monthLabel}</p>
        <p style={{ fontSize:13, color:'var(--text3)', marginTop:4, lineHeight:1.7 }}>
          האישור הרשתי נדרש בחודש הראשון בלבד. בחודשים שאחריו האישור של השליח מספיק.
        </p>
        {firstMonthPending > 0 && onGoToMonth && (
          <button className="apple-btn apple-btn-blue" style={{ marginTop:18 }} onClick={() => onGoToMonth(firstMonthKey)}>
            <ShieldCheck size={15} strokeWidth={2.3} />
            {nWorkers(firstMonthPending)} ממתינות לך ב{firstMonthLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh' }} dir="rtl">
      <div className="no-print" style={{ background:'var(--surface)', borderBottom:'1px solid var(--line)', padding:'18px 20px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ display:'flex', alignItems:'center', gap:9 }}>
              <span className="title-bar" />
              <h1 style={{ fontSize:23, fontWeight:800, color:'var(--text)', letterSpacing:'-0.025em' }}>אישור רשתי — {monthLabel}</h1>
            </div>
            <p style={{ fontSize:13, color:'var(--text3)', marginTop:2, marginInlineStart:13 }}>
              {waiting.length > 0
                ? `${nWorkers(waiting.length)} ממתינות · עלות מעסיק ${totalCost.toLocaleString('he-IL')} ₪ לחודש · ${(totalCost * 12).toLocaleString('he-IL')} ₪ לשנה`
                : others.length ? `סיימת את שלך · ${othersNote}` : 'הכול מאושר'}
            </p>
          </div>
          {waiting.length > 0 && (
            <button className="apple-btn apple-btn-blue" onClick={() => confirmAnd(waiting, scopeLabel)}>
              <ShieldCheck size={15} strokeWidth={2.3} />
              אישור {scopeLabel}
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'20px 20px 40px' }}>
        {grouped.length === 0 ? (
          <div className="apple-card" style={{ textAlign:'center', padding:'64px 20px' }}>
            <div style={{ width:56, height:56, borderRadius:17, background:'var(--ok-bg)', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Check size={26} strokeWidth={2.4} color="var(--ok)" />
            </div>
            <p style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>אין מה לאשר כרגע</p>
            <p style={{ fontSize:13, color:'var(--text3)', marginTop:4 }}>
              עובדות מגיעות לכאן אחרי שהשליח אישר אותן.
            </p>
            {othersNote && <p style={{ fontSize:12.5, color:'var(--text3)', marginTop:10 }}>{othersNote}</p>}
          </div>
        ) : grouped.map(({ school, list }, i) => {
          const open = openSchool === school.id;
          const cost = list.reduce((s, x) => s + calcEmployer(x).total, 0);
          return (
            <div key={school.id} className="apple-card spring-enter" style={{ marginBottom:12, animationDelay:`${i*50}ms` }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', flexWrap:'wrap' }}>
                <button onClick={() => setOpenSchool(open ? null : school.id)}
                  style={{ flex:1, minWidth:180, textAlign:'right', background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:'inherit' }}>
                  <p style={{ fontSize:15.5, fontWeight:700, color:'var(--text)' }}>{school.name}</p>
                  <p style={{ fontSize:12.5, color:'var(--text3)', marginTop:2 }}>
                    {nWorkers(list.length)} · {cost.toLocaleString('he-IL')} ₪ לחודש · {open ? 'הסתר' : 'הצג פירוט'}
                  </p>
                </button>
                <button className="apple-btn apple-btn-ghost" onClick={() => confirmAnd(list, school.name)}>
                  <ShieldCheck size={14} strokeWidth={2.3} />
                  אישור בית הספר
                </button>
              </div>

              {open && (
                <div className="sheet-scroll" style={{ maxHeight:'none', borderTop:'1px solid var(--line)' }}>
                  <table className="apple-table" style={{ fontSize:13 }}>
                    <thead>
                      <tr>
                        <th>שם עובדת</th>
                        <th style={{ textAlign:'center' }}>מסלול</th>
                        <th style={{ textAlign:'center' }}>% משרה</th>
                        <th style={{ textAlign:'center' }}>פרונטלי</th>
                        <th style={{ textAlign:'center' }}>בסיס</th>
                        <th style={{ textAlign:'center' }}>תוספת בית חב"ד</th>
                        <th style={{ textAlign:'center' }}>ברוטו</th>
                        <th style={{ textAlign:'center', color:'var(--purple)' }}>סה״כ למעסיק</th>
                        <th style={{ width:110 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(x => {
                        const emp = calcEmployer(x);
                        const d   = deriveHours(x);
                        return (
                          <tr key={x.id}>
                            <td style={{ fontWeight:600, color:'var(--text)' }}>
                              {x.name}
                              {isPrincipalRow(x) && <span className="apple-badge badge-purple" style={{ fontSize:10.5, padding:'2px 8px', marginInlineStart:6 }}>מנהלת</span>}
                            </td>
                            <td style={{ textAlign:'center' }}>{reformLabel(x.reform)}</td>
                            <td style={{ textAlign:'center' }}>{effectiveScope(x)}%</td>
                            <td style={{ textAlign:'center' }}>{d ? d.frontal : (x.frontalHours || '—')}</td>
                            <td style={{ textAlign:'center' }}>{emp.base.toLocaleString('he-IL')}</td>
                            <td style={{ textAlign:'center', color:'var(--purple)', fontWeight:600 }}>
                              {emp.supplement ? emp.supplement.toLocaleString('he-IL') : '—'}
                            </td>
                            <td style={{ textAlign:'center', fontWeight:700, color:'var(--text)' }}>{emp.gross.toLocaleString('he-IL')}</td>
                            <td style={{ textAlign:'center', fontWeight:800, color:'var(--purple)', cursor:'help' }}
                              title={emp.isEstimate
                                ? `אומדן ${emp.pct}% מעל הברוטו — ${emp.parts.filter(x => x.amount).map(x => `${x.label} ${x.amount.toLocaleString('he-IL')}`).join(' · ')}`
                                : 'סכום בפועל מהנהלת החשבונות'}>
                              {emp.isEstimate && <span style={{ color:'var(--warn)' }}>~</span>}
                              {emp.total.toLocaleString('he-IL')} ₪
                            </td>
                            <td>
                              <button className="apple-btn apple-btn-green" style={{ padding:'0 11px', minHeight:30, fontSize:12.5 }}
                                onClick={() => confirmAnd([x], x.name)}>
                                <Check size={13} strokeWidth={2.8} />
                                אישור
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(() => {
                    // מה בתוך העלות. בלי זה שתי עובדות בברוטו זהה הציגו הפרש
                    // של מאות שקלים בלי שום עמודה שמסבירה אותו — הוותק
                    // (הבראה) ואחוז המשרה (ביגוד) נכנסים לעלות ולא לברוטו.
                    const sums = {};
                    for (const x of list) for (const part of calcEmployer(x).parts) sums[part.label] = (sums[part.label] || 0) + part.amount;
                    return (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 14px', padding:'9px 18px', borderTop:'1px solid var(--line)', background:'var(--fill)', fontSize:11.5, color:'var(--text3)' }}>
                        <span style={{ fontWeight:700, color:'var(--text2)' }}>הוצאות מעביד:</span>
                        {Object.entries(sums).filter(([, v]) => v).map(([k, v]) => (
                          <span key={k}>{k} <b style={{ color:'var(--text2)' }}>{v.toLocaleString('he-IL')}</b></span>
                        ))}
                        <span style={{ marginInlineStart:'auto' }}>שנתי <b style={{ color:'var(--purple)' }}>{(cost * 12).toLocaleString('he-IL')} ₪</b></span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}

        <p style={{ fontSize:11.5, color:'var(--text3)', marginTop:14, lineHeight:1.7 }}>
          הסימון ~ מציין שעלות המעסיק היא אומדן שממתין לסכום מהנהלת החשבונות.<br/>
          האומדן לפי רכיבי החוק: פנסיה ופיצויים 14.83% · קרן השתלמות 8.4% · מס שכר 7.5% · ביטוח לאומי מדורג · הבראה לפי ותק · ביגוד לפי משרה.
          לכן שתי עובדות בברוטו זהה יכולות לעלות אחרת — הוותק ואחוז המשרה נכנסים לעלות.
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   APPROVAL VIEW (coordinator only)
═══════════════════════════════════════════════════════════════ */
function ApprovalView({ teachers, schools, onApprove, onApproveAll, onClose }) {
  // רק מורים שסימולציה הושלמה (יש שכר רשמי) → ממתינים לאישור שליח
  const readyToApprove = teachers.filter(needsApproval);
  // מורים עדיין ממתינים לסימולציה אצל חשבת שכר
  const waitingSim     = teachers.filter(needsSim);

  const bySchool = schools.map(s => ({
    school: s,
    ts: readyToApprove.filter(t => t.schoolId === s.id),
  })).filter(g => g.ts.length > 0);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:50, overflowY:'auto', backdropFilter:'blur(6px)' }} dir="rtl">
      <div style={{ maxWidth:680, margin:'0 auto', background:'var(--apple-bg)', minHeight:'100vh', padding:24 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, letterSpacing:'-0.02em', color:'var(--apple-text)', marginBottom:2 }}>אישור שכר חודשי</h2>
            <p style={{ fontSize:13, color:'var(--apple-text2)' }}>{readyToApprove.length} ממתינים לאישורך</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {readyToApprove.length > 0 && (
              <button className="apple-btn apple-btn-green" onClick={onApproveAll} style={{ fontSize:13 }}>
                אשר הכל ({readyToApprove.length})
              </button>
            )}
            <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ fontSize:13 }}>סגור</button>
          </div>
        </div>

        {/* ממתינים לסימולציה */}
        {waitingSim.length > 0 && (
          <div className="apple-card" style={{ padding:16, marginBottom:16, borderRight:'3px solid var(--apple-orange)' }}>
            <p style={{ fontWeight:600, fontSize:14, color:'var(--apple-text)', marginBottom:4 }}>
              {waitingSim.length} מורים ממתינים לסימולציה
            </p>
            <p style={{ fontSize:12, color:'var(--apple-text2)', marginBottom:10 }}>אחרי שחשבת השכר תזין שכר רשמי, הם יופיעו כאן</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {waitingSim.slice(0, 8).map(t => (
                <span key={t.id} className="apple-badge badge-orange">{t.name}</span>
              ))}
              {waitingSim.length > 8 && <span style={{ fontSize:12, color:'var(--apple-text2)' }}>ועוד {waitingSim.length - 8}...</span>}
            </div>
          </div>
        )}

        {readyToApprove.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px 0' }}>
            <div style={{ width:60, height:60, borderRadius:18, margin:'0 auto 16px', display:'flex', alignItems:'center', justifyContent:'center',
              background: waitingSim.length > 0 ? 'var(--warn-bg)' : 'var(--ok-bg)' }}>
              {waitingSim.length > 0
                ? <Calculator size={27} strokeWidth={1.9} color="var(--warn)" />
                : <Check size={27} strokeWidth={2.2} color="var(--ok)" />}
            </div>
            <p style={{ fontWeight:600, color:'var(--apple-text2)' }}>
              {waitingSim.length > 0 ? 'ממתין לסימולציה אצל חשבת שכר' : 'אין שינויים ממתינים לאישור'}
            </p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {bySchool.map(({ school, ts }) => (
              <div key={school.id}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ background:'var(--apple-blue)', color:'#fff', fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10 }}>{ts.length}</span>
                  <span style={{ fontWeight:600, fontSize:14, color:'var(--apple-text)' }}>{school.name}{school.city ? ` — ${school.city}` : ''}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {ts.map(t => {
                    const emp = calcEmployer(t);
                    return (
                      <div key={t.id} className="apple-card" style={{ padding:16 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                          <div>
                            <p style={{ fontWeight:600, fontSize:15, color:'var(--apple-text)', marginBottom:2 }}>{t.name}</p>
                            {t.tzId && <p style={{ fontSize:12, color:'var(--apple-text3)', fontFamily:'monospace' }}>{t.tzId}</p>}
                            {t._changedAt && <p style={{ fontSize:12, color:'var(--apple-blue)', marginTop:2 }}>שונה: {new Date(t._changedAt).toLocaleDateString('he-IL')}</p>}
                          </div>
                          <div style={{ textAlign:'left' }}>
                            <p style={{ fontSize:11, color:'var(--apple-green)', fontWeight:600, marginBottom:2 }}>שכר רשמי</p>
                            <p style={{ fontWeight:700, fontSize:16, color:'var(--apple-text)' }}>{emp.gross.toLocaleString()} ₪</p>
                            <p style={{ fontSize:11, color:'var(--apple-text3)' }}>למעסיק: {emp.total.toLocaleString()} ₪</p>
                          </div>
                        </div>
                        <div style={{ marginBottom:12 }}><TeacherDiff t={t} /></div>
                        <div style={{ display:'flex', justifyContent:'flex-end' }}>
                          <button className="apple-btn apple-btn-green" onClick={() => onApprove(t.id)} style={{ fontSize:13, padding:'7px 16px' }}>
                            אשר
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize:12, color:'var(--apple-text3)', textAlign:'center', marginTop:32 }}>
          לאחר אישור, הנתונים מוכנים לחישוב משכורות חודשי
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCOPE CHANGE MODAL
═══════════════════════════════════════════════════════════════ */
function ScopeChangeModal({ teacher, onSave, onClose }) {
  const lvl = LEVELS[teacher.level] || LEVELS.elementary;
  const agR = AGE_RED[teacher.ageGroup] || AGE_RED.none;
  const baseFrontal = lvl.frontal - agR.f;
  const [c, setC] = useState({
    id: uid(), date: new Date().toISOString().slice(0,10),
    scopePct: teacher.scopePct || 100,
    frontalHours: teacher.frontalHours || baseFrontal,
    reasonType: 'system', detail: '',
  });
  const set = (k,v) => setC(p => ({...p,[k]:v}));
  const syncFromScope   = pct => setC(p => ({...p, scopePct: pct,                      frontalHours: Math.round(baseFrontal * pct / 100) }));
  const syncFromFrontal = hrs => setC(p => ({...p, frontalHours: hrs,                  scopePct: baseFrontal > 0 ? Math.round((hrs/baseFrontal)*100) : 100 }));

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(6px)' }}>
      <div className="apple-card" style={{ width:'100%', maxWidth:360, padding:24 }}>
        <h3 style={{ fontWeight:700, fontSize:17, letterSpacing:'-0.01em', color:'var(--apple-text)', marginBottom:20 }}>שינוי משרה — {teacher.name}</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <p className="apple-label">תאריך השינוי</p>
            <input type="date" value={c.date} onChange={e => set('date', e.target.value)} className="apple-input" dir="ltr" />
          </div>
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <p className="apple-label" style={{ marginBottom:0 }}>אחוז משרה</p>
              <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{c.scopePct}%</span>
            </div>
            <input type="range" min={1} max={140} value={c.scopePct} onChange={e => syncFromScope(+e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
            <div style={{ display:'flex', gap:4, marginTop:8, flexWrap:'wrap' }}>
              {[50,67,75,100,112,125,140].map(v => (
                <button key={v} onClick={() => syncFromScope(v)} style={{
                  flex:1, minWidth:0, padding:'5px 4px', borderRadius:8, border:'none', fontSize:12, fontWeight:600, cursor:'pointer',
                  background: c.scopePct===v ? 'var(--apple-blue)' : 'var(--apple-fill)',
                  color: c.scopePct===v ? '#fff' : 'var(--apple-text2)',
                }}>{v}%</button>
              ))}
            </div>
          </div>
          {teacher.reform === 'ofek' && (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <p className="apple-label" style={{ marginBottom:0 }}>שעות פרונטליות (מ-{baseFrontal})</p>
                <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{c.frontalHours}</span>
              </div>
              <input type="range" min={0} max={40} value={c.frontalHours} onChange={e => syncFromFrontal(+e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
            </div>
          )}
          <div>
            <p className="apple-label">סיבת השינוי</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {REASON_TYPES.map(r => (
                <button key={r.id} onClick={() => set('reasonType', r.id)} style={{
                  padding:'10px 14px', borderRadius:10, border:'none', fontSize:14, fontWeight: c.reasonType===r.id?600:400,
                  background: c.reasonType===r.id ? 'rgba(0,122,255,0.1)' : 'var(--apple-fill)',
                  color: c.reasonType===r.id ? 'var(--apple-blue)' : 'var(--apple-text)',
                  cursor:'pointer', textAlign:'right',
                }}>{r.label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="apple-label">פירוט נוסף</p>
            <textarea value={c.detail} onChange={e => set('detail', e.target.value)} rows={2}
              className="apple-input" placeholder="תיאור קצר (אופציונלי)"
              style={{ resize:'none', lineHeight:1.5 }} />
          </div>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:20 }}>
          <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ flex:1 }}>ביטול</button>
          <button className="apple-btn apple-btn-blue" onClick={() => onSave(c)} style={{ flex:1 }}>שמור שינוי</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL REPORT HELPER
═══════════════════════════════════════════════════════════════ */
function buildEmailBody(school, teachers, monthLabel) {
  const ts  = teachers.filter(t => t.schoolId === school.id);
  // החודש הפעיל, לא הקלנדרי — הדוח הוא על חודש השכר שעובדים עליו
  const now = monthLabel || new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  const totGross = ts.reduce((s,t) => s + calcGross(t), 0);
  const totEmp   = ts.reduce((s,t) => s + calcEmployer(t).total, 0);
  const pending  = ts.filter(isPending);

  let body = `דוח שכר חודשי — ${school.name}\nתאריך: ${now}\n\n`;
  body += `סה"כ עובדי הוראה: ${ts.length}\nברוטו: ${totGross.toLocaleString()} ₪\nברוטו למעסיק: ${totEmp.toLocaleString()} ₪\n`;
  body += `\n— רשימת מורים —\n`;
  ts.forEach(t => {
    const emp   = calcEmployer(t);
    const grade = t.reform === 'ofek' ? (t.grade === 'intern' ? 'מתמחה' : `ד${t.grade}`) : (t.degree === 'intern' ? 'מתמחה' : t.degree);
    body += `\n${t.name} | ת.ז.: ${t.tzId||'—'} | ${reformLabel(t.reform)} ${grade} | ותק: ${t.seniority} | ברוטו: ${emp.gross.toLocaleString()} ₪ | למעסיק: ${emp.total.toLocaleString()} ₪`;
  });
  if (pending.length > 0) {
    body += `\n\n⚠️ שינויים ממתינים לאישור (${pending.length}):\n`;
    pending.forEach(t => { body += `• ${t.name}\n`; });
  }
  body += `\n\nהסכומים הם הערכה בלבד — לאימות מול מדור שכר`;
  return body;
}

// מחזירה הודעת שגיאה בעברית, או null כשהמייל נפתח.
// קודם הנמען היה תמיד המנהלת — גם כשהמנהלת עצמה לחצה "שלח לשליח" —
// ובלי כתובת נפתח mailto עם נמען ריק ושום דבר לא קרה על המסך.
function sendMonthlyEmail(school, teachers, { userRole, monthLabel } = {}) {
  const toCoordinator = userRole === 'principal';
  const to = toCoordinator ? school.coordinatorEmail : school.principalEmail;
  const cc = toCoordinator ? school.principalEmail   : school.coordinatorEmail;
  if (!to) {
    return toCoordinator
      ? 'לא הוגדר מייל שליח לבית הספר. בקשי מהרשת להגדיר אותו בכרטיס בית הספר.'
      : 'לא הוגדר מייל מנהלת לבית הספר. הגדירי אותו בעריכת בית הספר.';
  }
  const subject = encodeURIComponent(`דוח שכר ${monthLabel || ''} — ${school.name}`.replace(/\s+/g, ' '));
  const body    = encodeURIComponent(buildEmailBody(school, teachers, monthLabel));
  const ccPart  = cc ? `&cc=${encodeURIComponent(cc)}` : '';
  window.open(`mailto:${encodeURIComponent(to)}?subject=${subject}${ccPart}&body=${body}`);
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   IMPORT MODAL (from file / WhatsApp paste)
═══════════════════════════════════════════════════════════════ */
// המרת תאריך DD/MM/YYYY → YYYY-MM-DD
function parseDateHeb(s) {
  if (!s) return '';
  s = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
  const m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}
// המרת דרגה ידידותית → ערך פנימי
function parseGrade(raw, reform) {
  if (!raw) return reform === 'ofek' ? 1 : 'BA';
  const s = raw.trim();
  if (s === 'מתמחה' || s.toLowerCase() === 'intern') return 'intern';
  if (reform !== 'ofek') {
    if (s.includes('דוקטורט') || s.includes('phd')) return 'PHD';
    if (s.includes('שני') || s === 'MA') return 'MA';
    if (s.includes('ראשון') || s === 'BA') return 'BA';
    return 'BA';
  }
  const n = Number(s);
  return (n >= 1 && n <= 9) ? n : 1;
}
// המרת תפקיד ידידותי → id
function parseRole(raw) {
  if (!raw) return 'none';
  const s = raw.trim();
  if (s.includes('מחנך') || s.includes('מחנכ')) {
    if (s.includes("א'")) return 'homeroom1';
    if (s.includes('חטיבה')) return 'homeroom2';
    return 'homeroom';
  }
  if (s.includes('מקצוע') && s.includes('חטיבה')) return 'subject8';
  if (s.includes('מקצוע')) return 'subject6';
  if (s.includes('צוות') || s.includes('שכבה')) return 'team';
  if (s.includes('יועץ') || s.includes('יועצ')) return 'counselor';
  const known = ['homeroom','homeroom1','homeroom2','subject6','subject8','team','counselor','counselor2'];
  return known.includes(s) ? s : 'none';
}

function parseTeachers(text, schoolId) {
  const results = [];
  // דלג על שורות הסבר (#) וחלק ריק
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  // Detect CSV (has commas, first line might be header)
  const isCSV = lines[0]?.includes(',') && lines[0].split(',').length >= 3;

  if (isCSV) {
    const start = lines[0].match(/שם|name/i) ? 1 : 0;
    for (let i = start; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (!cols[0]) continue;

      // עמודות חדשות: שם,ת.ז.,מייל,רפורמה,דרגה,ותק,% משרה,תפקיד,שיבוץ זמני,תאריך התחלה,תאריך סיום
      // תמיכה גם בפורמט ישן: שם,ת.ז.,רפורמה,דרגה,ותק,% משרה,תפקיד,תאריך התחלה,תאריך סיום
      const hasEmail = cols.length >= 9 && (cols[2].includes('@') || cols[2] === '');
      let name, tzId, email, reformRaw, gradeRaw, seniority, scopePct, roleRaw, isTempRaw, startRaw, endRaw;

      if (hasEmail) {
        [name, tzId, email, reformRaw, gradeRaw, seniority, scopePct, roleRaw, isTempRaw, startRaw, endRaw] = cols;
      } else {
        [name, tzId, reformRaw, gradeRaw, seniority, scopePct, roleRaw, startRaw, endRaw] = cols;
        email = '';
        isTempRaw = '';
      }

      const reform = (reformRaw?.includes('טרום') || reformRaw?.includes('ישן')) ? 'pre' : 'ofek';
      const grade  = parseGrade(gradeRaw, reform);
      const scope  = Number(scopePct) || 100;
      const isTemp = isTempRaw?.trim() === 'כן';

      results.push({
        ...EMPTY_TEACHER, id: '', schoolId,
        name:      name || '',
        tzId:      tzId || '',
        email:     email || '',
        reform,
        grade,
        degree:    reform === 'pre' ? (typeof grade === 'string' ? grade : 'BA') : 'BA',
        seniority: Number(seniority) || 0,
        scopePct:  scope,
        scope,
        frontalHours: Math.round(26 * scope / 100),
        role:      parseRole(roleRaw),
        isTemp,
        startDate: parseDateHeb(startRaw),
        endDate:   parseDateHeb(endRaw),
        _changedAt: new Date().toISOString(),
      });
    }
  } else {
    // WhatsApp / free text: look for blocks with כname + ת.ז / שם
    const blocks = text.split(/\n\s*\n/).filter(Boolean);
    for (const block of blocks) {
      const get = (patterns) => {
        for (const p of patterns) {
          const m = block.match(p);
          if (m) return m[1]?.trim();
        }
        return '';
      };
      const name = get([/שם[:\s]+([^\n]+)/, /^([^\n:]{2,20})$/m]);
      if (!name) continue;
      const tzId     = get([/ת\.?ז\.?[:\s]*([\d]{5,9})/]);
      const reform   = block.match(/טרום/) ? 'pre' : 'ofek';
      const gradeRaw = get([/דרגה[:\s]*([\dא-ת]+)/, /grade[:\s]*([\d]+)/i]);
      const grade    = gradeRaw === 'מתמחה' ? 'intern' : (Number(gradeRaw) || 1);
      const sen      = Number(get([/ותק[:\s]*([\d]+)/, /seniority[:\s]*([\d]+)/i])) || 0;
      const scopePct = Number(get([/משרה[:\s]*([\d]+)/, /%([\d]+)/])) || 100;
      results.push({
        ...EMPTY_TEACHER, id: '', schoolId,
        name, tzId, reform, grade, seniority: sen, scopePct,
        frontalHours: Math.round(26 * scopePct / 100),
        _changedAt: new Date().toISOString(),
      });
    }
  }
  return results;
}

/* ─── CSV template download ─── */
/* ═══════════════════════════════════════════════════════════════
   EXPORT — הורדת קבצים (CSV עם BOM, וגיבוי JSON)
═══════════════════════════════════════════════════════════════ */
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // בלי revoke הדפדפן מחזיק את הקובץ בזיכרון עד לרענון
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// עוטף שדה בודד: פסיק, מרכאות או שורה חדשה בתוך ערך שוברים את הקובץ
function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.split('"').join('""') + '"' : s;
}

// headers: [{ key, label }] · rows: מערך אובייקטים · footer: שורה אחת אופציונלית
function downloadCSV(headers, rows, filename, footer) {
  const BOM   = '\uFEFF';
  const lines = [headers.map(h => csvCell(h.label)).join(',')];
  rows.forEach(r => lines.push(headers.map(h => csvCell(r[h.key])).join(',')));
  if (footer) lines.push(headers.map(h => csvCell(footer[h.key])).join(','));
  downloadBlob(BOM + lines.join('\r\n'), filename, 'text/csv;charset=utf-8;');
}

const stampToday = () => new Date().toISOString().slice(0, 10);

function downloadTemplate(schoolName) {
  const BOM = '\uFEFF';
  // שורת הסבר (מתחילה ב-# — תדלג עליה המערכת)
  const note1 = '# הנחיות מילוי: שורה אחת לכל עובד/ת הוראה. אין למחוק את שורת הכותרת.';
  const note2 = '# רפורמה: כתבי אופק או טרום  |  דרגה אופק: 1-9 או מתמחה  |  דרגה טרום: תואר-ראשון / תואר-שני / דוקטורט / מתמחה';
  const note3 = '# שיבוץ זמני: כתבי כן אם זו החלפה זמנית. תאריך סיום חובה לשיבוץ זמני.';
  const header = 'שם פרטי ומשפחה,תעודת זהות,מייל,רפורמה,דרגה,ותק (שנים),אחוז משרה (%),תפקיד,שיבוץ זמני (כן/לא),תאריך התחלה (DD/MM/YYYY),תאריך סיום (DD/MM/YYYY)';
  const ex1 = 'שרה כהן,123456789,sarah@school.edu,אופק,5,10,100,מחנכת,לא,01/09/2024,';
  const ex2 = 'רחל לוי,987654321,rachel@school.edu,אופק,מתמחה,1,100,ללא תפקיד,לא,01/09/2024,';
  const ex3 = 'מרים דוד,111222333,miriam@school.edu,טרום,תואר-שני,18,75,ללא תפקיד,כן,01/09/2024,31/01/2025';
  const csv = BOM + [note1, note2, note3, header, ex1, ex2, ex3].join('\r\n');
  downloadBlob(csv, `מורים_${schoolName || 'בית_ספר'}.csv`, 'text/csv;charset=utf-8;');
}

function ImportModal({ schoolId, schoolName, onImport, onClose }) {
  const [text, setText]   = useState('');
  const [preview, setPrev]= useState(null);
  const [error, setError] = useState('');

  const handleFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => { setText(ev.target.result); setPrev(null); };
    reader.readAsText(f, 'utf-8');
    e.target.value = '';
  };

  const handlePreview = () => {
    setError('');
    const parsed = parseTeachers(text, schoolId);
    if (parsed.length === 0) { setError('לא זוהו נתונים. בדקי את הפורמט.'); return; }
    setPrev(parsed);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, overflowY:'auto' }}>
      <div className="apple-card" style={{ width:'100%', maxWidth:640, padding:24, margin:'16px auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ fontWeight:700, fontSize:17, color:'var(--apple-text)', letterSpacing:'-0.01em' }}>ייבוא מורים — {schoolName}</h2>
          <button onClick={onClose} style={{ background:'var(--apple-fill)', border:'none', borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:14, color:'var(--apple-text2)', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={15} strokeWidth={2.4} /></button>
        </div>

        {/* שלב 1 */}
        <div style={{ background:'rgba(0,122,255,0.06)', borderRadius:14, padding:16, marginBottom:12, border:'1px solid rgba(0,122,255,0.15)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div>
              <p style={{ fontWeight:700, fontSize:14, color:'var(--apple-blue)', marginBottom:2 }}>שלב 1 — הורד תבנית למילוי</p>
              <p style={{ fontSize:12, color:'var(--apple-text2)' }}>קובץ CSV עם כל השדות + שורות לדוגמה</p>
            </div>
            <button className="apple-btn apple-btn-blue" onClick={() => downloadTemplate(schoolName)} style={{ fontSize:13, padding:'8px 14px', whiteSpace:'nowrap' }}>⬇️ הורד תבנית</button>
          </div>
          <div style={{ marginTop:10, fontSize:12, color:'var(--apple-blue)', background:'rgba(0,122,255,0.08)', borderRadius:10, padding:'8px 12px', lineHeight:1.7 }}>
            שם · ת.ז. · מייל · רפורמה · דרגה · ותק · % משרה · תפקיד · שיבוץ זמני · תאריך התחלה/סיום
          </div>
        </div>

        {/* שלב 2 */}
        <div style={{ background:'var(--apple-fill)', borderRadius:14, padding:16, marginBottom:12 }}>
          <p style={{ fontWeight:700, fontSize:13, color:'var(--apple-text2)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.04em' }}>שלב 2 — העלי קובץ</p>
          <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', border:'2px dashed var(--apple-fill2)', borderRadius:12, padding:24, cursor:'pointer', transition:'border-color 0.15s', background:'var(--apple-surface)' }}>
            <FolderOpen size={28} strokeWidth={1.8} color="var(--text3)" style={{ marginBottom:9 }} />
            <span style={{ fontWeight:600, fontSize:14, color:'var(--apple-text)' }}>לחצי להעלאת קובץ CSV</span>
            <span style={{ fontSize:12, color:'var(--apple-text3)', marginTop:4 }}>או גררי לכאן</span>
            <input type="file" accept=".csv,.txt" onChange={handleFile} style={{ display:'none' }} />
          </label>
          {text && (
            <p style={{ fontSize:12, color:'var(--apple-green)', fontWeight:600, textAlign:'center', marginTop:10 }}>
              קובץ נקרא — {text.split('\n').filter(l=>l.trim()).length} שורות
            </p>
          )}
        </div>

        {error && (
          <div style={{ background:'rgba(255,59,48,0.08)', border:'1px solid rgba(255,59,48,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'var(--apple-red)', fontWeight:600 }}>
            {error}
          </div>
        )}

        {preview ? (
          <div>
            <p style={{ fontWeight:700, fontSize:14, color:'var(--apple-text)', marginBottom:10 }}>שלב 3 — אישור: נמצאו {preview.length} מורים</p>
            <div style={{ background:'rgba(255,159,10,0.08)', border:'1px solid rgba(255,159,10,0.2)', borderRadius:10, padding:'8px 12px', marginBottom:12, fontSize:12, color:'var(--warn)' }}>
              <Lightbulb size={13} strokeWidth={2.2} style={{ display:'inline', verticalAlign:'-2px', marginInlineEnd:4 }} />
            לאחר הייבוא — כנסי לסימולטור והזיני את השכר הרשמי לכל מורה
            </div>
            <div style={{ overflowX:'auto', border:'1px solid var(--apple-fill2)', borderRadius:12, maxHeight:220, overflowY:'auto' }}>
              <table className="apple-table" style={{ fontSize:12 }}>
                <thead>
                  <tr>
                    {['שם','ת.ז.','מייל','רפורמה','דרגה','ותק','% משרה','תפקיד','זמני','תאריך התחלה'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((t,i) => (
                    <tr key={i}>
                      <td style={{ fontWeight:600 }}>{t.name}</td>
                      <td style={{ fontFamily:'monospace', fontSize:11 }}>{t.tzId||'—'}</td>
                      <td style={{ fontSize:11, color:'var(--apple-text2)' }}>{t.email||'—'}</td>
                      <td>{reformLabel(t.reform)}</td>
                      <td>{t.grade==='intern'?'מתמחה':t.grade}</td>
                      <td>{t.seniority}</td>
                      <td>{t.scopePct}%</td>
                      <td style={{ fontSize:11 }}>{ROLES.find(r=>r.id===t.role)?.label.split('(')[0].trim()||'—'}</td>
                      <td style={{ textAlign:'center' }}>{t.isTemp?'כן':'—'}</td>
                      <td style={{ fontSize:11 }}>{t.startDate||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button className="apple-btn apple-btn-ghost" onClick={() => setPrev(null)} style={{ flex:1, fontSize:14 }}><ArrowRight size={15} strokeWidth={2.4} />חזרה</button>
              <button className="apple-btn apple-btn-green" onClick={() => onImport(preview)} style={{ flex:1, fontSize:14 }}>ייבא {preview.length} מורים<Check size={15} strokeWidth={2.6} /></button>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', gap:8 }}>
            <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ flex:1, fontSize:14 }}>ביטול</button>
            <button className="apple-btn apple-btn-blue" onClick={handlePreview} disabled={!text.trim()} style={{ flex:1, fontSize:14 }}>תצוגה מקדימה<ArrowLeft size={15} strokeWidth={2.4} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FILE ATTACHMENTS SECTION
═══════════════════════════════════════════════════════════════ */
function FileAttachSection({ files, onChange }) {
  const MAX_SIZE = 2 * 1024 * 1024;

  const handleAdd = e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > MAX_SIZE) { alert('קובץ גדול מדי (מקסימום 2MB)'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const file = { id: uid(), name: f.name, type: f.type, data: ev.target.result, uploadedAt: new Date().toISOString() };
      onChange([...files, file]);
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const download = file => {
    const a = document.createElement('a');
    a.href = file.data; a.download = file.name; a.click();
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <span className="apple-label" style={{ marginBottom:0, display:'inline-flex', alignItems:'center', gap:5 }}>
          <Paperclip size={13} strokeWidth={2.2} />
          קבצים מצורפים
        </span>
        <label style={{ cursor:'pointer' }}>
          <span className="apple-btn apple-btn-ghost" style={{ fontSize:12, padding:'5px 12px', display:'inline-flex', alignItems:'center', gap:4 }}>
            + הוסף קובץ
          </span>
          <input type="file" style={{ display:'none' }} onChange={handleAdd} />
        </label>
      </div>
      {files.length === 0 ? (
        <p style={{ fontSize:12, color:'var(--apple-text3)', textAlign:'center', padding:'12px 0' }}>אין קבצים מצורפים</p>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {files.map(f => (
            <div key={f.id} style={{ display:'flex', alignItems:'center', gap:10, background:'var(--apple-fill)', borderRadius:10, padding:'8px 12px' }}>
              <span style={{ width:32, height:32, borderRadius:9, background:'var(--surface)', border:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'var(--text3)' }}>
                {f.type?.startsWith('image')
                  ? <ImageIcon size={15} strokeWidth={2} />
                  : f.type?.includes('pdf') ? <FileText size={15} strokeWidth={2} /> : <Paperclip size={15} strokeWidth={2} />}
              </span>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:13, fontWeight:600, color:'var(--apple-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</p>
                <p style={{ fontSize:11, color:'var(--apple-text3)' }}>{new Date(f.uploadedAt).toLocaleDateString('he-IL')}</p>
              </div>
              <button onClick={() => download(f)} style={{ fontSize:12, color:'var(--apple-blue)', background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:'4px 8px' }}>הורד</button>
              <button onClick={() => onChange(files.filter(x => x.id !== f.id))} style={{ fontSize:13, color:'var(--apple-red)', background:'none', border:'none', cursor:'pointer', padding:'4px 6px' }}><X size={15} strokeWidth={2.4} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TEACHER MODAL
═══════════════════════════════════════════════════════════════ */
function TeacherModal({ teacher, schools, onSave, onClose, userRole }) {
  const [t, setT] = useState({ ...EMPTY_TEACHER, ...teacher, scopeChanges: teacher.scopeChanges || [], _files: teacher._files || [] });
  const [showScopeChange, setShowScopeChange] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [simCalc, setSimCalc] = useState(calcForTeacher(teacher));
  const set = (k, v) => setT(p => {
    const next = { ...p, [k]: v };
    // תפקיד מנהל/ת גורר אופק חדש ודרגת ניהול א, כנקודת פתיחה
    return k === 'role' ? { ...next, ...principalDefaults(next) } : next;
  });


  const lvl = LEVELS[t.level] || LEVELS.elementary;
  const agR = AGE_RED[t.ageGroup] || AGE_RED.none;
  const baseFrontal = lvl.frontal - agR.f;

  const syncFromFrontal = hrs => {
    const scopePct = baseFrontal > 0 ? Math.round((hrs / baseFrontal) * 100) : 100;
    setT(p => ({ ...p, frontalHours: hrs, scopePct }));
  };
  const syncFromScope = pct => {
    const frontalHours = Math.round(baseFrontal * pct / 100);
    setT(p => ({ ...p, scopePct: pct, frontalHours }));
  };

  const cur     = currentScope(t);
  const derived = deriveHours(t, cur);
  const emp     = calcEmployer(t);

  const addScopeChange = c => {
    const changes = [...t.scopeChanges, c].sort((a,b) => a.date.localeCompare(b.date));
    setT(p => ({ ...p, scopeChanges: changes }));
    setShowScopeChange(false);
  };
  const removeScopeChange = id => setT(p => ({ ...p, scopeChanges: p.scopeChanges.filter(c => c.id !== id) }));
  const sortedChanges = [...t.scopeChanges].sort((a,b) => b.date.localeCompare(a.date));

  return (
    <div className={['fixed inset-0 bg-black/50 z-50 flex', showSimulator ? 'flex-row items-stretch' : 'flex-col items-center justify-start overflow-y-auto p-4'].join(' ')}>

      {/* סימולטור — פאנל שמאל */}
      {showSimulator && (
        <div style={{ display:'flex', flexDirection:'column', background:'#fff', borderLeft:'0.5px solid var(--apple-fill2)', width:'55%' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'var(--apple-fill)', borderBottom:'0.5px solid var(--apple-fill2)', flexWrap:'wrap' }}>
            <span style={{ fontSize:12, fontWeight:600, color:'var(--apple-text2)' }}>מחשבון רשמי</span>
            <div className="apple-seg">
              {CALCULATORS.map(c => (
                <button key={c.id} onClick={() => setSimCalc(c.id)} className={['apple-seg-item', simCalc===c.id?'active':''].join(' ')} style={{ padding:'5px 10px', fontSize:12 }}>{c.label}</button>
              ))}
            </div>
          </div>
          <CalculatorFrame key={simCalc} calcId={simCalc} />
        </div>
      )}

      {/* טופס — פאנל ימין */}
      <div style={showSimulator
        ? { width:'45%', display:'flex', flexDirection:'column', background:'#fff', overflowY:'auto' }
        : { background:'#fff', borderRadius:18, width:'100%', maxWidth:520, margin:'24px auto', boxShadow:'var(--apple-shadow)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 24px', borderBottom:'0.5px solid var(--apple-fill2)' }}>
          <h2 style={{ fontSize:17, fontWeight:700, letterSpacing:'-0.02em', color:'var(--apple-text)' }}>{t.id ? 'עריכת עובד/ת הוראה' : 'הוספת עובד/ת הוראה'}</h2>
          <button onClick={onClose} style={{ background:'var(--apple-fill)', border:'none', borderRadius:'50%', width:28, height:28, fontSize:14, cursor:'pointer', color:'var(--text3)', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={15} strokeWidth={2.4} /></button>
        </div>
        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>

          {/* שם + ת.ז */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p className="apple-label">שם עובד/ת ההוראה</p>
              <input value={t.name} onChange={e => set('name', e.target.value)} placeholder="שם מלא" className="apple-input" />
            </div>
            <div>
              <p className="apple-label">תעודת זהות</p>
              <input value={t.tzId} onChange={e => set('tzId', e.target.value)} placeholder="000000000" dir="ltr" className="apple-input" style={{ fontFamily:'monospace' }} />
            </div>
          </div>

          {/* דרכי קשר — לשליחת נתוני ההעסקה לחתימה ולכל בירור על התלוש */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <div style={{ flex:'1 1 150px' }}>
              <p className="apple-label">טלפון *</p>
              <input value={t.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="05x-xxxxxxx" dir="ltr" className="apple-input" />
            </div>
            <div style={{ flex:'1 1 180px' }}>
              <p className="apple-label">מייל *</p>
              <input value={t.email || ''} onChange={e => set('email', e.target.value)} placeholder="teacher@school.edu" dir="ltr" className="apple-input" />
            </div>
          </div>

          {/* בית ספר */}
          {userRole !== 'principal' && (
            <div>
              <p className="apple-label">בית ספר</p>
              <select value={t.schoolId} onChange={e => set('schoolId', e.target.value)} className="apple-select">
                <option value="">בחר בית ספר</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* שיבוץ זמני + תאריכים */}
          <div className="apple-section" style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <label className="apple-toggle">
                <input type="checkbox" checked={t.isTemp} onChange={e => set('isTemp', e.target.checked)} />
                <div className="apple-toggle-track" />
              </label>
              <div>
                <p style={{ fontWeight:600, fontSize:14, color:'var(--apple-text)' }}>שיבוץ זמני (מילוי מקום)</p>
                {t.isTemp && <p style={{ fontSize:12, color:'var(--apple-orange)' }}>תאריך סיום — חובה</p>}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <p className="apple-label">תאריך התחלה</p>
                <input type="date" value={t.startDate} onChange={e => set('startDate', e.target.value)} dir="ltr" className="apple-input" />
              </div>
              <div>
                <p className="apple-label" style={{ color: t.isTemp ? 'var(--apple-orange)' : undefined }}>
                  תאריך סיום{t.isTemp ? ' *' : ''}
                </p>
                <input type="date" value={t.endDate} onChange={e => set('endDate', e.target.value)} dir="ltr" className="apple-input" />
              </div>
            </div>
          </div>

          {/* רפורמה */}
          <div>
            <p className="apple-label">רפורמה</p>
            <div className="apple-seg" style={{ width:'100%' }}>
              {REFORMS.map(({ id: v, label: l }) => (
                <button key={v} onClick={() => set('reform', v)} className={['apple-seg-item', t.reform===v?'active':''].join(' ')}>{l}</button>
              ))}
            </div>
          </div>

          {/* אופק חדש */}
          {t.reform === 'ofek' && (<>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <p className="apple-label">דרגה</p>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:4 }}>
                  {OFEK_GRADES.map(g => (
                    <button key={g.id} onClick={() => set('grade', g.id)} style={{
                      padding:'7px 2px', borderRadius:8, border:'none', fontSize:12, fontWeight:700, cursor:'pointer',
                      background: t.grade===g.id ? 'var(--apple-blue)' : 'var(--apple-fill)',
                      color: t.grade===g.id ? '#fff' : 'var(--apple-text2)',
                    }}>{g.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="apple-label">שלב לימוד</p>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {Object.entries(LEVELS).map(([k,v]) => (
                    <button key={k} onClick={() => set('level', k)} style={{
                      padding:'8px 12px', borderRadius:8, border:'none', fontSize:13, fontWeight:600, cursor:'pointer', textAlign:'right',
                      background: t.level===k ? 'var(--apple-blue)' : 'var(--apple-fill)',
                      color: t.level===k ? '#fff' : 'var(--apple-text)',
                    }}>{v.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="apple-label">קבוצת גיל</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {Object.entries(AGE_RED).map(([k,v]) => (
                  <button key={k} onClick={() => set('ageGroup', k)} style={{
                    padding:'8px 12px', borderRadius:8, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', textAlign:'right',
                    background: t.ageGroup===k ? 'var(--apple-orange)' : 'var(--apple-fill)',
                    color: t.ageGroup===k ? '#fff' : 'var(--apple-text)',
                  }}>{v.label}</button>
                ))}
              </div>
            </div>

            <div className="apple-section" style={{ gap:12, display:'flex', flexDirection:'column' }}>
              <p className="apple-label" style={{ marginBottom:0 }}>משרה</p>
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:13, color:'var(--apple-text2)' }}>אחוז משרה</span>
                  <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{t.scopePct}%</span>
                </div>
                <input type="range" min={1} max={140} value={t.scopePct} onChange={e => syncFromScope(+e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
                <div style={{ display:'flex', gap:4, marginTop:8, flexWrap:'wrap' }}>
                  {[50,67,75,100,112,125,140].map(v => (
                    <button key={v} onClick={() => syncFromScope(v)} style={{
                      flex:1, minWidth:0, padding:'5px 2px', borderRadius:8, border:'none', fontSize:11, fontWeight:600, cursor:'pointer',
                      background: t.scopePct===v ? 'var(--apple-blue)' : '#fff',
                      color: t.scopePct===v ? '#fff' : 'var(--apple-text2)',
                    }}>{v}%</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:13, color:'var(--apple-text2)' }}>שעות פרונטליות (מ-{baseFrontal})</span>
                  <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{t.frontalHours}</span>
                </div>
                <input type="range" min={0} max={40} value={t.frontalHours} onChange={e => syncFromFrontal(+e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
              </div>
              {derived && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, textAlign:'center' }}>
                  {[
                    { label: 'אחוז', val: derived.scopePct + '%' },
                    { label: 'פרונטלי', val: derived.frontal },
                    { label: 'פרטני',   val: derived.individual },
                    { label: 'שהייה',   val: derived.presence },
                  ].map(c => (
                    <div key={c.label} style={{ background:'#fff', borderRadius:10, padding:'8px 4px' }}>
                      <p style={{ fontSize:11, color:'var(--apple-text3)', marginBottom:2 }}>{c.label}</p>
                      <p style={{ fontWeight:700, color:'var(--apple-blue)', fontSize:14 }}>{c.val}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* שינויי משרה */}
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <p className="apple-label" style={{ marginBottom:0 }}>שינויי משרה</p>
                <button className="apple-btn apple-btn-blue" onClick={() => setShowScopeChange(true)} style={{ fontSize:12, padding:'5px 12px' }}>+ הוסף</button>
              </div>
              {sortedChanges.length === 0 ? (
                <p style={{ fontSize:12, color:'var(--apple-text3)', textAlign:'center', padding:'8px 0' }}>אין שינויים רשומים</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {sortedChanges.map(c => (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', borderRadius:10, padding:'8px 12px' }}>
                      <div style={{ flex:1, fontSize:12 }}>
                        <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{c.scopePct}%</span>
                        {c.frontalHours && <span style={{ color:'var(--apple-text2)' }}> · {c.frontalHours} פר׳</span>}
                        <span style={{ color:'var(--apple-text3)' }}> · {fmt(c.date)}</span>
                        <span style={{ color:'var(--apple-orange)' }}> · {REASON_TYPES.find(r=>r.id===c.reasonType)?.label}</span>
                        {c.detail && <span style={{ color:'var(--apple-text2)' }}> ({c.detail})</span>}
                      </div>
                      <button onClick={() => removeScopeChange(c.id)} style={{ background:'none', border:'none', color:'var(--apple-red)', cursor:'pointer', fontSize:14 }}><X size={15} strokeWidth={2.4} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>)}

          {/* עולם ישן */}
          {t.reform === 'pre' && (<>
            <div>
              <p className="apple-label">דרגה / תואר</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {[['intern','מתמחה'],['BA','תואר ראשון'],['MA','תואר שני']].map(([v,l]) => (
                  <button key={v} onClick={() => set('degree', v)} style={{
                    padding:'10px 12px', borderRadius:10, border:'none', fontSize:13, fontWeight:600, cursor:'pointer',
                    background: t.degree===v ? 'var(--apple-purple)' : 'var(--apple-fill)',
                    color: t.degree===v ? '#fff' : 'var(--apple-text)',
                  }}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:13, color:'var(--apple-text2)' }}>אחוז משרה</span>
                <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{t.scope}%</span>
              </div>
              {/* scope ו-scopePct הם אותו נתון בשני שמות. רק scope_pct
                  נשמר במסד, ולכן כתיבה ל-scope בלבד לא הגיעה לשרת:
                  המשרה שנבחרה נעלמה, והמסמך לחתימה הודפס עם 100%. */}
              <input type="range" min={1} max={140} value={t.scope}
                onChange={e => { const v = +e.target.value; set('scope', v); set('scopePct', v); }}
                style={{ accentColor:'var(--apple-blue)' }} />
            </div>
          </>)}

          {/* יציאה לחופשה */}
          <div className="apple-section">
            <p className="apple-label" style={{ marginBottom:6 }}>סטטוס העסקה</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              <select className="apple-select" value={t.leaveType || 'none'} style={{ flex:'1 1 160px' }}
                onChange={e => {
                  const v = e.target.value;
                  set('leaveType', v);
                  if (v === 'none') { set('leaveFrom', null); set('leaveTo', null); }
                }}>
                {LEAVE_TYPES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
              {onLeave(t) && (
                <>
                  <label style={{ display:'flex', flexDirection:'column', gap:3, flex:'1 1 120px' }}>
                    <span style={{ fontSize:11, color:'var(--text3)' }}>מתאריך</span>
                    <input type="date" className="apple-input" dir="ltr" value={String(t.leaveFrom ?? '').slice(0,10)}
                      onChange={e => set('leaveFrom', e.target.value || null)} />
                  </label>
                  <label style={{ display:'flex', flexDirection:'column', gap:3, flex:'1 1 120px' }}>
                    <span style={{ fontSize:11, color:'var(--text3)' }}>עד תאריך (אם ידוע)</span>
                    <input type="date" className="apple-input" dir="ltr" value={String(t.leaveTo ?? '').slice(0,10)}
                      onChange={e => set('leaveTo', e.target.value || null)} />
                  </label>
                </>
              )}
            </div>
          </div>

          {/* ותק */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontSize:13, color:'var(--apple-text2)' }}>שנות ותק</span>
              <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{t.seniority}</span>
            </div>
            <input type="range" min={0} max={40} value={t.seniority} onChange={e => set('seniority', +e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
          </div>

          {/* תפקיד */}
          <div>
            <p className="apple-label">גמול תפקיד</p>
            <select value={t.role} onChange={e => set('role', e.target.value)} className="apple-select">
              {ROLES.map(r => (
                <option key={r.id} value={r.id}>
                  {r.label}{r.pct > 0 ? ` — ${r.pct}%${r.min ? `, מינ' ${r.min.toLocaleString()}₪` : ''}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* דרגת ניהול — ברירת המחדל א, ניתנת לשינוי ידני */}
          {isPrincipalRow(t) && (
            <div>
              <p className="apple-label">דרגת ניהול</p>
              <select value={String(t.nihulGrade ?? 1)}
                onChange={e => set('nihulGrade', Number(e.target.value))} className="apple-select">
                {NIHUL_GRADES.map(g => <option key={g.v} value={g.v}>דרגה {g.l}</option>)}
              </select>
            </div>
          )}

          {/* קבצים מצורפים */}
          <FileAttachSection files={t._files} onChange={f => setT(p => ({...p, _files: f}))} />

          {/* תוספת אם */}
          <div style={{ background:'rgba(88,86,214,0.06)', borderRadius:14, padding:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:13, fontWeight:600, color:'var(--purple)', marginBottom:2 }}>
                  {t.reform === 'pre' ? 'תוספת אם עובדת' : 'ילדים עד גיל 18'}
                </p>
                <p style={{ fontSize:12, color:'var(--text2)' }}>
                  {t.reform === 'pre'
                    ? 'ילדים עד גיל 18 (זכאות מ-79% משרה)'
                    : 'באופק חדש אינה רכיב שכר — נאסף כמידע בלבד'}
                </p>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button onClick={() => set('childrenUnder18', Math.max(0, (t.childrenUnder18||0)-1))}
                  style={{ width:28, height:28, borderRadius:'50%', border:'1px solid var(--apple-fill2)', background:'var(--apple-fill)', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>−</button>
                <span style={{ fontWeight:800, fontSize:18, color:'var(--apple-purple)', minWidth:20, textAlign:'center' }}>{t.childrenUnder18||0}</span>
                <button onClick={() => set('childrenUnder18', (t.childrenUnder18||0)+1)}
                  style={{ width:28, height:28, borderRadius:'50%', border:'1px solid var(--apple-fill2)', background:'var(--apple-fill)', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>+</button>
              </div>
            </div>
            {momBonusEligible(t) && (
              <p style={{ fontSize:12, color:'var(--apple-purple)', fontWeight:600, marginTop:8 }}>
                זכאית לתוספת אם — {t.childrenUnder18} ילדים עד גיל 18
                {` · ${t.scopePct ?? t.scope ?? 100}% + ${MOM_SCOPE_BONUS} = ${effectiveScope(t)}% משרה`}
              </p>
            )}
            {t.reform === 'pre' && (t.childrenUnder18||0) > 0 && !momBonusEligible(t) && (
              <p style={{ fontSize:12, color:'var(--apple-orange)', marginTop:8 }}>
                אחוז משרה נמוך מ-79% — אין זכאות לתוספת אם
              </p>
            )}
          </div>

          {/* מנהלת בית ספר אינה מזינה שכר, והשרת אוסר עליה את העמודות
              האלה. כשהשדות הוצגו לה בכל זאת, שמירה שכללה גם שינוי בשדה
              בסיס בלעה בשקט את הסכום שהקלידה: הוותק נשמר, השכר נעלם,
              והחלון נסגר בלי הודעה. */}
          {userRole === 'principal' ? (
            <div style={{ background:'var(--fill2)', borderRadius:14, padding:16 }}>
              <p style={{ fontSize:13, fontWeight:600, color:'var(--text2)', marginBottom:4 }}>שכר</p>
              <p style={{ fontSize:12, color:'var(--text3)' }}>
                {simComplete(t)
                  ? 'הוזן על ידי חשבת השכר. שינוי בוותק, בדרגה, בתואר או בשעות יחזיר אותה לחישוב מחדש.'
                  : 'ממתין לחשבת השכר.'}
              </p>
            </div>
          ) : (
          <div style={{ background:'rgba(52,199,89,0.08)', borderRadius:14, padding:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <p style={{ fontSize:13, fontWeight:600, color:'#1a7a38' }}>שכר משולב מהסימולטור</p>
              <button className="apple-btn apple-btn-green" onClick={() => setShowSimulator(v => !v)} style={{ fontSize:12, padding:'6px 12px' }}>
                {showSimulator ? 'סגור' : 'פתח סימולטור'}
              </button>
            </div>
            <p style={{ fontSize:12, color:'var(--ok)', marginBottom:10 }}>הריצי את הסימולטור → הכניסי כאן את "השכר המשולב"</p>

            {/* עלות מעביד בפועל — הנהלת החשבונות מחליפה את האומדן */}
            {userRole !== 'principal' && simComplete(t) && (
              <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:12, marginBottom:10 }}>
                <p className="apple-label" style={{ marginBottom:4 }}>עלות מעביד בפועל — הנהלת חשבונות</p>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input type="number" className="apple-input" dir="ltr" style={{ fontSize:13.5 }}
                    value={t._actualEmployerCost || ''}
                    onChange={e => set('_actualEmployerCost', e.target.value ? Number(e.target.value) : null)}
                    placeholder={`אומדן: ${emp.estimate.toLocaleString('he-IL')} ₪`} />
                  {t._actualEmployerCost && <button onClick={() => set('_actualEmployerCost', null)}
                    style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer' }}><X size={15} strokeWidth={2.4} /></button>}
                </div>
                <p style={{ fontSize:11, color:'var(--text3)', marginTop:6, lineHeight:1.6 }}>
                  בחודש הראשון העלות היא אומדן לפי רכיבי החוק — פנסיה ופיצויים · קרן השתלמות · מס שכר · ביטוח לאומי · הבראה · ביגוד — עד שהנהלת החשבונות מזינה את הסכום בפועל.
                  משהוזן כאן סכום, הוא גובר עליו בכל הדוחות.
                </p>
              </div>
            )}

            {/* שכר מוסכם — למנהלת בלבד, ולא בידי המנהלת עצמה */}
            {isPrincipalRow(t) && userRole !== 'principal' && (
              <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:12, marginBottom:10 }}>
                <div className="apple-seg" style={{ width:'100%', marginBottom: t._agreedGross ? 10 : 0 }}>
                  <button className={['apple-seg-item', !t._agreedGross ? 'active' : ''].join(' ')}
                    onClick={() => set('_agreedGross', null)}>לפי סימולציית ניהול</button>
                  <button className={['apple-seg-item', t._agreedGross ? 'active' : ''].join(' ')}
                    onClick={() => set('_agreedGross', t._agreedGross || t._officialGross || '')}>שכר מוסכם</button>
                </div>
                {t._agreedGross !== null && t._agreedGross !== undefined && (
                  <>
                    <input type="number" className="apple-input" dir="ltr" autoFocus
                      value={t._agreedGross || ''}
                      onChange={e => set('_agreedGross', e.target.value ? Number(e.target.value) : '')}
                      placeholder="ברוטו מוסכם" style={{ fontSize:14 }} />
                    <p style={{ fontSize:11, color:'var(--text3)', marginTop:6, lineHeight:1.6 }}>
                      מחליף את הברוטו ואת הסימולציה. השורה לא תמתין לחשבת השכר.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* אופק חדש — שני שדות. למנהלת סימולציית ניהול אחת. */}
            {isPrincipalRow(t) ? (
              <div>
                <p style={{ fontSize:11, fontWeight:700, color:'var(--purple)', marginBottom:4 }}>סימולציית אופק — ניהול</p>
                <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                  <input type="number" className="apple-input" dir="ltr" style={{ fontSize:13 }}
                    value={t._officialGross || ''}
                    onChange={e => set('_officialGross', e.target.value ? Number(e.target.value) : null)}
                    placeholder="שכר ניהול..." disabled={!!t._agreedGross} />
                  {t._officialGross && <button onClick={() => set('_officialGross', null)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer' }}><X size={15} strokeWidth={2.4} /></button>}
                </div>
                <p style={{ fontSize:11, color:'var(--text3)', marginTop:5 }}>
                  הסכום הזה הוא הבסיס במלואו — אין למנהלת רכיב תוספת בית חב"ד.
                </p>
              </div>
            ) : t.reform === 'ofek' ? (<>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <div>
                  <p style={{ fontSize:11, fontWeight:700, color:'#1a7a38', marginBottom:4 }}>סימולציית אופק חדש</p>
                  <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                    <input type="number" className="apple-input" dir="ltr" style={{ fontSize:13 }}
                      value={t._officialGross || ''}
                      onChange={e => set('_officialGross', e.target.value ? Number(e.target.value) : null)}
                      placeholder="שכר אופק..." />
                    {t._officialGross && <button onClick={() => set('_officialGross', null)} style={{ background:'none', border:'none', color:'var(--apple-red)', cursor:'pointer', fontSize:14 }}><X size={15} strokeWidth={2.4} /></button>}
                  </div>
                </div>
                <div>
                  <p style={{ fontSize:11, fontWeight:700, color:'var(--purple)', marginBottom:4 }}>סימולציית עולם ישן</p>
                  <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                    <input type="number" className="apple-input" dir="ltr" style={{ fontSize:13 }}
                      value={t._officialGrossPre || ''}
                      onChange={e => set('_officialGrossPre', e.target.value ? Number(e.target.value) : null)}
                      placeholder="שכר טרום..." />
                    {t._officialGrossPre && <button onClick={() => set('_officialGrossPre', null)} style={{ background:'none', border:'none', color:'var(--apple-red)', cursor:'pointer', fontSize:14 }}><X size={15} strokeWidth={2.4} /></button>}
                  </div>
                </div>
              </div>
              {t._officialGross && t._officialGrossPre && (
                <div style={{ background:'rgba(88,86,214,0.1)', borderRadius:10, padding:'8px 12px', fontSize:12, color:'var(--apple-purple)', fontWeight:600 }}>
                  תוספת בית חב"ד: {(Number(t._officialGross) - Number(t._officialGrossPre)).toLocaleString()} ₪
                  <span style={{ fontWeight:400, color:'var(--apple-text2)', marginRight:6 }}>(= אופק − טרום)</span>
                </div>
              )}
            </>) : (
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input type="number" className="apple-input" dir="ltr"
                  value={t._officialGross || ''}
                  onChange={e => set('_officialGross', e.target.value ? Number(e.target.value) : null)}
                  placeholder="שכר משולב..." />
                {t._officialGross && <button onClick={() => set('_officialGross', null)} style={{ background:'none', border:'none', color:'var(--apple-red)', cursor:'pointer', fontSize:16 }}><X size={15} strokeWidth={2.4} /></button>}
              </div>
            )}
          </div>
          )}

          {/* פירוק התשלום — נתון רשמי בלבד */}
          {simComplete(t) ? (
            <div className="apple-section" style={{ background:'var(--ok-bg)', border:'1px solid var(--ok-line)' }}>
              <p style={{ fontSize:11, fontWeight:700, color:'var(--ok)', textAlign:'center', marginBottom:12, letterSpacing:'0.04em' }}>
                פירוק התשלום — לפי הסימולציה הרשמית
              </p>
              {[
                ['עולם ישן — בסיס', emp.base, 'מה שרץ במערכת התשלומים'],
                ...(t.reform === 'ofek' ? [['תוספת בית חב"ד', emp.supplement, 'הפער עד שכר האופק']] : []),
                ['ברוטו לעובדת', emp.gross, null],
                [`הוצאות מעביד`, emp.social,
                  emp.isEstimate ? `אומדן ${emp.pct}%` : 'סכום בפועל מהנהלת החשבונות'],
              ].map(([label, val, note]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10, padding:'5px 0' }}>
                  <span style={{ fontSize:12.5, color:'var(--text2)' }}>
                    {label}
                    {note && <span style={{ fontSize:11, color:'var(--text3)', marginInlineStart:6 }}>{note}</span>}
                  </span>
                  <span className="num" style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{val.toLocaleString('he-IL')} ₪</span>
                </div>
              ))}
              {/* מה בתוך הוצאות המעביד. קודם היה כאן מספר אחד, 40%, שאיש
                  לא יכול היה להצליב מול מה שהנהלת החשבונות מוציאה בפועל. */}
              {emp.isEstimate && (
                <div style={{ marginTop:2, marginBottom:4, paddingInlineStart:12,
                  borderInlineStart:'2px solid var(--ok-line)' }}>
                  {emp.parts.filter(x => x.amount).map(x => (
                    <div key={x.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8, padding:'2px 0' }}>
                      <span style={{ fontSize:11.5, color:'var(--text3)' }}>
                        {x.label}
                        {x.rate && <span style={{ marginInlineStart:5, opacity:.75 }}>{(x.rate * 100).toFixed(2).replace(/\.?0+$/, '')}%</span>}
                      </span>
                      <span className="num" style={{ fontSize:11.5, color:'var(--text3)' }}>{x.amount.toLocaleString('he-IL')} ₪</span>
                    </div>
                  ))}
                  {emp.supplement > 0 && (
                    <p style={{ fontSize:10.5, color:'var(--text3)', marginTop:4, opacity:.8 }}>
                      מזה {emp.employerSupp.toLocaleString('he-IL')} ₪ על תוספת בית חב"ד — היא נושאת מס שכר וביטוח לאומי בלבד
                    </p>
                  )}
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10,
                borderTop:'1px solid var(--ok-line)', marginTop:7, paddingTop:9 }}>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>סה״כ למעסיק</span>
                <span className="num" style={{ fontSize:18, fontWeight:800, color:'var(--purple)' }}>{emp.total.toLocaleString('he-IL')} ₪</span>
              </div>
              <p style={{ fontSize:11, color:'var(--text3)', textAlign:'center', marginTop:8 }}>
                נטו משוער {calcNet(emp.gross).toLocaleString('he-IL')} ₪
              </p>
            </div>
          ) : (
            <div style={{ background:'#FFF3E0', border:'1px dashed #FFB74D', borderRadius:12, padding:16, textAlign:'center' }}>
              <p style={{ fontSize:13, fontWeight:600, color:'#E65100', marginBottom:6 }}>נדרשת סימולציה במחשבון משרד החינוך</p>
              <p style={{ fontSize:12, color:'#999' }}>הזיני את השכר המשולב בשדה למעלה לאחר ביצוע הסימולציה</p>
            </div>
          )}
        </div>

        <div style={{ padding:'16px 24px', borderTop:'1px solid var(--apple-fill2)', display:'flex', gap:8 }}>
          <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ flex:1 }}>ביטול</button>
          <button className="apple-btn apple-btn-blue" onClick={() => {
            if (!t.name.trim()) return alert('יש למלא שם');
            if (!t.schoolId)    return alert('יש לבחור בית ספר');
            onSave(t);
          }} style={{ flex:2 }}>
            {t.id ? 'שמור שינויים' : 'הוספת עובד/ת הוראה'}
          </button>
        </div>
      </div>
      {showScopeChange && (
        <ScopeChangeModal teacher={t} onSave={addScopeChange} onClose={() => setShowScopeChange(false)} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCHOOL MODAL
═══════════════════════════════════════════════════════════════ */
function SchoolModal({ school, onSave, onClose }) {
  const [s, setS] = useState({ ...school });
  // לחיצה כפולה יצרה שני בתי ספר זהים. הכפתור נעול עד שהשמירה חוזרת.
  const [saving, setSaving] = useState(false);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(6px)' }}>
      <div className="apple-card" style={{ width:'100%', maxWidth:360, padding:24 }}>
        <h2 style={{ fontSize:17, fontWeight:700, letterSpacing:'-0.02em', color:'var(--apple-text)', marginBottom:20 }}>
          {s.id ? 'עריכת בית ספר' : 'הוספת בית ספר'}
        </h2>
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
          <input value={s.name || ''} onChange={e => setS(p => ({...p, name: e.target.value}))} placeholder="שם בית הספר *" className="apple-input" />
          <input value={s.city || ''} onChange={e => setS(p => ({...p, city: e.target.value}))} placeholder="עיר / יישוב" className="apple-input" />

          <div>
            <p className="apple-label">מסלול בית הספר</p>
            <div className="apple-seg" style={{ width:'100%' }}>
              {REFORMS.map(r => (
                <button key={r.id} onClick={() => setS(p => ({...p, reform: r.id}))}
                  className={['apple-seg-item', (s.reform || 'ofek') === r.id ? 'active' : ''].join(' ')}>
                  {r.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize:11.5, color:'var(--text3)', marginTop:6, lineHeight:1.5 }}>
              קובע את ברירת המחדל למורות חדשות ואת המחשבון הרשמי שייפתח. אפשר לשנות מסלול למורה בודדת.
            </p>
          </div>
          <div>
            <p className="apple-label">מכסת שעות עובדי הוראה</p>
            <input type="number" min="0" dir="ltr" className="apple-input"
              value={s.hoursQuota ?? ''}
              onChange={e => setS(p => ({ ...p, hoursQuota: e.target.value === '' ? null : Number(e.target.value) }))}
              placeholder="לא הוגדרה" style={{ textAlign:'center' }} />
            <p style={{ fontSize:11.5, color:'var(--text3)', marginTop:6, lineHeight:1.5 }}>
              סך השעות הפרונטליות שמותר להקצות בבית הספר. אי אפשר לשמור מורה שתחרוג מהמכסה.
              מכסה שלא הוגדרה אינה חוסמת.
            </p>
          </div>

          <input value={s.principalEmail || ''} onChange={e => setS(p => ({...p, principalEmail: e.target.value}))} placeholder="מייל מנהלת" dir="ltr" className="apple-input" />
          <input value={s.coordinatorEmail || ''} onChange={e => setS(p => ({...p, coordinatorEmail: e.target.value}))} placeholder="מייל שליח (עותק)" dir="ltr" className="apple-input" />
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ flex:1 }}>ביטול</button>
          <button className="apple-btn apple-btn-blue" disabled={saving}
            onClick={async () => {
              if (!s.name?.trim()) return alert('יש למלא שם בית ספר');
              setSaving(true);
              try { await onSave({ ...s, reform: s.reform || 'ofek' }); } finally { setSaving(false); }
            }}
            style={{ flex:1, opacity: saving ? .6 : 1 }}>{saving ? 'שומר…' : 'שמור'}</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCHOOL REPORT
═══════════════════════════════════════════════════════════════ */
function SchoolReport({ school, teachers, onClose }) {
  const ts = teachers.filter(t => t.schoolId === school.id);
  const tsOfficial  = ts.filter(simComplete);
  const totEmpGross = tsOfficial.reduce((s, t) => s + calcEmployer(t).total, 0);
  const totGross    = tsOfficial.reduce((s, t) => s + calcEmployer(t).gross, 0);
  const pendingCount = ts.filter(isPending).length;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:50, overflowY:'auto' }} dir="rtl">
      <div style={{ maxWidth:1000, margin:'0 auto', background:'var(--apple-surface)', minHeight:'100vh', padding:32 }}>
        <div className="no-print" style={{ display:'flex', justifyContent:'space-between', marginBottom:24 }}>
          <button className="apple-btn apple-btn-ghost" onClick={onClose}><ArrowRight size={15} strokeWidth={2.4} />חזרה</button>
          <button className="apple-btn apple-btn-blue" onClick={() => window.print()}><Printer size={15} strokeWidth={2.2} />הדפסה</button>
        </div>

        <div style={{ borderBottom:'2px solid var(--apple-text)', paddingBottom:16, marginBottom:24 }}>
          <h1 style={{ fontSize:24, fontWeight:800, letterSpacing:'-0.02em', color:'var(--apple-text)', marginBottom:4 }}>דוח שכר עובדי הוראה</h1>
          <h2 style={{ fontSize:17, fontWeight:600, color:'var(--apple-text2)', marginBottom:4 }}>{school.name}{school.city ? ` — ${school.city}` : ''}</h2>
          <p style={{ fontSize:13, color:'var(--apple-text3)' }}>הופק: {new Date().toLocaleDateString('he-IL')}</p>
          {pendingCount > 0 && (
            <div style={{ marginTop:8, display:'inline-flex', alignItems:'center', gap:6, background:'rgba(255,159,10,0.12)', border:'1px solid rgba(255,159,10,0.3)', borderRadius:8, padding:'4px 12px', fontSize:13, fontWeight:600, color:'var(--warn)' }}>
              <Bell size={13} strokeWidth={2.3} style={{ display:'inline', verticalAlign:'-2px', marginInlineEnd:5 }} />
            {pendingCount} שינויים ממתינים לאישור
            </div>
          )}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
          {[
            { label: 'סה"כ עובדי הוראה', val: ts.length },
            { label: 'אופק חדש',   val: ts.filter(t=>t.reform==='ofek').length },
            { label: 'עולם ישן', val: ts.filter(t=>t.reform==='pre').length },
            { label: 'ברוטו למעסיק', val: totEmpGross.toLocaleString()+' ₪' },
          ].map(c => (
            <div key={c.label} className="apple-stat" style={{ textAlign:'center' }}>
              <p className="apple-stat-label">{c.label}</p>
              <p className="apple-stat-value" style={{ fontSize:18 }}>{c.val}</p>
            </div>
          ))}
        </div>

        <table className="apple-table" style={{ fontSize:12, marginBottom:24 }}>
          <thead>
            <tr>
              <th>שם</th><th>ת.ז.</th><th style={{ textAlign:'center' }}>רפורמה</th>
              <th style={{ textAlign:'center' }}>דרגה</th><th style={{ textAlign:'center' }}>ותק</th>
              <th style={{ textAlign:'center' }}>% משרה</th><th style={{ textAlign:'center' }}>פרונטלי</th>
              <th style={{ textAlign:'center' }}>פרטני</th><th style={{ textAlign:'center' }}>שהייה</th>
              <th>תפקיד</th><th style={{ textAlign:'center' }}>מתאריך</th><th style={{ textAlign:'center' }}>עד תאריך</th>
              <th>ברוטו</th><th>הוצאות מעביד</th><th style={{ color:'var(--purple)' }}>ברוטו למעסיק</th>
            </tr>
          </thead>
          <tbody>
            {ts.map(t => {
              const emp     = calcEmployer(t);
              const derived = deriveHours(t);
              const scope   = t.reform === 'ofek' ? (derived?.scopePct || t.scopePct || 100) : (t.scope || 100);
              const grade   = t.reform === 'ofek' ? (t.grade === 'intern' ? 'מתמחה' : `ד${t.grade}`) : (t.degree === 'intern' ? 'מתמחה' : t.degree);
              const pending = isPending(t);
              return (
                <tr key={t.id} style={pending ? { background:'rgba(255,159,10,0.08)' } : {}}>
                  <td style={{ fontWeight:600, color:'var(--text)' }}>{pending && <Bell size={12} strokeWidth={2.4} color="var(--warn)" style={{ display:'inline', verticalAlign:'-1px', marginInlineEnd:5 }} />}{t.name}</td>
                  <td style={{ fontFamily:'monospace', fontSize:11 }}>{t.tzId||'—'}</td>
                  <td style={{ textAlign:'center' }}>{reformLabel(t.reform)}</td>
                  <td style={{ textAlign:'center', fontWeight:700 }}>{grade}</td>
                  <td style={{ textAlign:'center' }}>{t.seniority}</td>
                  <td style={{ textAlign:'center', fontWeight:600, color:'var(--apple-blue)' }}>{scope}%</td>
                  <td style={{ textAlign:'center' }}>{derived ? derived.frontal : (t.frontalHours ?? '—')}</td>
                  <td style={{ textAlign:'center' }}>{derived ? derived.individual : '—'}</td>
                  <td style={{ textAlign:'center' }}>{derived ? derived.presence : '—'}</td>
                  <td style={{ fontSize:11 }}>{t.role!=='none' ? ROLES.find(r=>r.id===t.role)?.label.split('(')[0].trim() : '—'}</td>
                  <td style={{ textAlign:'center' }}>{fmt(t.startDate)}</td>
                  <td style={{ textAlign:'center' }}>{fmt(t.endDate)}</td>
                  <td style={{ fontWeight: t._officialGross ? 700 : 400, color: t._officialGross ? 'var(--apple-green)' : '#bbb' }}>
                    {t._officialGross ? Number(t._officialGross).toLocaleString()+' ₪' : '—'}
                  </td>
                  <td style={{ color:'var(--text2)' }}>{emp.social.toLocaleString('he-IL')} ₪</td>
                  <td style={{ fontWeight:800, color:'var(--apple-purple)' }}>{emp.total.toLocaleString()} ₪</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={12}>סה״כ</td>
              <td style={{ color:'var(--text)' }}>{totGross.toLocaleString('he-IL')} ₪</td>
              <td></td>
              <td style={{ color:'var(--apple-purple)' }}>{totEmpGross.toLocaleString()} ₪</td>
            </tr>
          </tfoot>
        </table>

        {pendingCount > 0 && (
          <div style={{ marginBottom:24, padding:16, background:'rgba(255,159,10,0.08)', border:'1px solid rgba(255,159,10,0.25)', borderRadius:14 }}>
            <h3 style={{ fontWeight:700, color:'var(--warn)', marginBottom:12, fontSize:14, display:'flex', alignItems:'center', gap:6 }}><Bell size={14} strokeWidth={2.3} />שינויים ממתינים לאישור</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {ts.filter(isPending).map(t => (
                <div key={t.id} className="apple-card" style={{ padding:14 }}>
                  <p style={{ fontWeight:700, fontSize:13, color:'var(--apple-text)', marginBottom:6 }}>{t.name}</p>
                  <TeacherDiff t={t} />
                </div>
              ))}
            </div>
          </div>
        )}

        {ts.some(t => t.scopeChanges?.length > 0) && (
          <div style={{ marginBottom:24 }}>
            <h3 style={{ fontWeight:700, fontSize:14, color:'var(--apple-text)', marginBottom:12, paddingBottom:8, borderBottom:'1px solid var(--apple-fill2)' }}>שינויי משרה במהלך השנה</h3>
            <table className="apple-table" style={{ fontSize:12 }}>
              <thead>
                <tr>
                  <th>מורה</th><th style={{ textAlign:'center' }}>תאריך</th>
                  <th style={{ textAlign:'center' }}>% משרה</th><th style={{ textAlign:'center' }}>פרונטלי</th>
                  <th>סיבה</th><th>פירוט</th>
                </tr>
              </thead>
              <tbody>
                {ts.flatMap(t => (t.scopeChanges || []).map(c => ({...c, teacherName: t.name})))
                  .sort((a,b) => a.date.localeCompare(b.date)).map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight:600 }}>{c.teacherName}</td>
                    <td style={{ textAlign:'center' }}>{fmt(c.date)}</td>
                    <td style={{ textAlign:'center', fontWeight:700 }}>{c.scopePct}%</td>
                    <td style={{ textAlign:'center' }}>{c.frontalHours||'—'}</td>
                    <td>{REASON_TYPES.find(r=>r.id===c.reasonType)?.label||'—'}</td>
                    <td style={{ color:'var(--apple-text2)' }}>{c.detail||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop:16, padding:14, background:'var(--apple-fill)', borderRadius:12, fontSize:12, color:'var(--apple-text2)', lineHeight:1.8 }}>
          <strong style={{ color:'var(--text)' }}>מבנה התשלום:</strong> התשלומים רצים במערכת של עולם ישן.
          הפער עד שכר האופק משולם כתוספת בית חב"ד.<br/>
          ברוטו למעסיק = ברוטו לעובדת + פנסיה ופיצויים · קרן השתלמות · מס שכר · ביטוח לאומי · הבראה · ביגוד<br/>
          הסכומים לשורות ללא סימולציה מלאה הם הערכה בלבד
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ABSENCE / MM REPORT
═══════════════════════════════════════════════════════════════ */
function AbsenceReport({ school, teachers, monthLabel, onClose }) {
  const ts = teachers.filter(t => t.schoolId === school.id);
  const withAbsence = ts.filter(t => (t.absenceDays||0) > 0 || (t.mmHours||0) > 0 || (t.monthlyExtras||0) > 0);
  const totAbsence = ts.reduce((s,t) => s + (t.absenceDays||0), 0);
  const totMM      = ts.reduce((s,t) => s + (t.mmHours||0), 0);
  const totExtras  = ts.reduce((s,t) => s + (t.monthlyExtras||0), 0);

  const exportCSV = () => {
    const headers = [
      { key:'name', label:'שם עובדת' }, { key:'tzId', label:'ת.ז.' },
      { key:'absence', label:'ימי היעדרות' }, { key:'sickFiles', label:'אישורי מחלה' },
      { key:'mmHours', label:'שעות ממ"מ' }, { key:'mmFor', label:'במקום מי' },
      { key:'extras', label:'תוספות חודשיות (₪)' },
    ];
    const body = withAbsence.map(t => ({
      name: t.name, tzId: t.tzId || '',
      absence: t.absenceDays || 0,
      sickFiles: (t.sickFiles || []).length,
      mmHours: t.mmHours || 0, mmFor: t.mmFor || '',
      extras: t.monthlyExtras || 0,
    }));
    const footer = { name: 'סה"כ', absence: totAbsence, mmHours: totMM, extras: totExtras };
    downloadCSV(headers, body, `ממ"מ_והעדרויות_${school.name}_${monthLabel || stampToday()}.csv`, footer);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:100, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'24px 16px', overflowY:'auto' }} dir="rtl">
      <div style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:860, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ background:'linear-gradient(135deg, var(--purple), #6A47A8)', borderRadius:'20px 20px 0 0', padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', color:'#fff' }}>
          <div>
            <h2 style={{ fontWeight:800, fontSize:20, marginBottom:2 }}>דוח ממ"מ והעדרויות</h2>
            <p style={{ fontSize:13, opacity:.85 }}>{school.name} — {monthLabel}</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={exportCSV} disabled={withAbsence.length === 0} style={{ background:'rgba(255,255,255,0.18)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:10, padding:'7px 13px', color:'#fff', cursor: withAbsence.length ? 'pointer' : 'not-allowed', opacity: withAbsence.length ? 1 : .5, fontWeight:600, fontSize:13, fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:6 }}><FileSpreadsheet size={14} strokeWidth={2.2} />ייצוא CSV</button>
            <button onClick={() => window.print()} style={{ background:'rgba(255,255,255,0.18)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:10, padding:'7px 13px', color:'#fff', cursor:'pointer', fontWeight:600, fontSize:13, fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:6 }}><Printer size={14} strokeWidth={2.2} />הדפסה</button>
            <button onClick={onClose} title="סגירה" style={{ background:'rgba(255,255,255,0.18)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:10, padding:'8px 10px', color:'#fff', cursor:'pointer', display:'inline-flex' }}><X size={16} strokeWidth={2.4} /></button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, padding:'16px 24px' }}>
          {[
            { label:'סה"כ ימי העדרות', val: totAbsence, color:'var(--danger)' },
            { label:'סה"כ שעות ממ"מ',  val: totMM,      color:'#8e44ad' },
            { label:'סה"כ תוספות',      val: totExtras.toLocaleString()+' ₪', color:'#27ae60' },
          ].map(c => (
            <div key={c.label} style={{ background:'#f9f9f9', borderRadius:12, padding:'12px 16px', textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#888', fontWeight:600, marginBottom:4 }}>{c.label}</div>
              <div style={{ fontSize:22, fontWeight:800, color: c.color }}>{c.val}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ padding:'0 24px 24px', overflowX:'auto' }}>
          {withAbsence.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px', color:'#aaa', fontSize:14 }}>אין העדרויות או ממ"מ לחודש זה</div>
          ) : (
            <table className="apple-table">
              <thead>
                <tr>
                  <th>שם עובדת</th>
                  <th style={{ textAlign:'center', color:'var(--danger)' }}>ימי העדרות</th>
                  <th style={{ textAlign:'center', color:'#8e44ad' }}>שעות ממ"מ</th>
                  <th>במקום מי</th>
                  <th style={{ textAlign:'center', color:'#27ae60' }}>תוספות (₪)</th>
                  <th>קבצי מחלה</th>
                </tr>
              </thead>
              <tbody>
                {withAbsence.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight:600 }}>{t.name}</td>
                    <td style={{ textAlign:'center', fontWeight:700, color: (t.absenceDays||0)>0 ? '#c0392b' : '#ccc' }}>
                      {(t.absenceDays||0) > 0 ? t.absenceDays : '—'}
                    </td>
                    <td style={{ textAlign:'center', fontWeight:700, color: (t.mmHours||0)>0 ? '#8e44ad' : '#ccc' }}>
                      {(t.mmHours||0) > 0 ? t.mmHours : '—'}
                    </td>
                    <td style={{ fontSize:13, color:'#555' }}>{t.mmFor||'—'}</td>
                    <td style={{ textAlign:'center', fontWeight: (t.monthlyExtras||0)>0 ? 700 : 400, color: (t.monthlyExtras||0)>0 ? '#27ae60' : '#ccc' }}>
                      {(t.monthlyExtras||0) > 0 ? Number(t.monthlyExtras).toLocaleString()+' ₪' : '—'}
                    </td>
                    <td style={{ fontSize:12, color:'#888' }}>
                      {(t.sickFiles||[]).length > 0
                        ? <span style={{ color:'var(--danger)', fontWeight:600, display:'inline-flex', alignItems:'center', gap:4 }}><Paperclip size={12} strokeWidth={2.2} />{t.sickFiles.length} קבצים</span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight:700 }}>סה"כ</td>
                  <td style={{ textAlign:'center', fontWeight:800, color:'var(--danger)' }}>{totAbsence}</td>
                  <td style={{ textAlign:'center', fontWeight:800, color:'#8e44ad' }}>{totMM}</td>
                  <td></td>
                  <td style={{ textAlign:'center', fontWeight:800, color:'#27ae60' }}>{totExtras > 0 ? totExtras.toLocaleString()+' ₪' : '—'}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCHOOL DETAIL
═══════════════════════════════════════════════════════════════ */
function SchoolView({ school, teachers, userRole, onBack, onSaveTeacher, onDeleteTeacher, onApproveTeacher, onImportTeachers, activeMonth, fmtMonthFn, isFirstMonth, approvers = [], userId }) {
  const [search, setSearch]           = useState('');
  const [showReport, setShowReport]   = useState(false);
  const [showAbsence, setShowAbsence] = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [fullEdit, setFullEdit]      = useState(null);   // מורה בעריכת פרטים מלאים
  const [details, setDetails]        = useState(null);   // נתוני העסקה לחתימה
  const [linkModal, setLinkModal]    = useState(false);  // קישור אישי למנהלת
  const schoolReform = school.reform || 'ofek';
  const approverName = approverFor(approvers, school.id).name;
  const [editingId, setEditingId]   = useState(null);   // teacher id or 'new'
  const [editData,  setEditData]    = useState(null);
  const ts       = teachers.filter(t => t.schoolId === school.id);
  const filtered = ts
    .filter(t => t.name.includes(search) || (t.tzId || '').includes(search))
    // שורת המנהלת ראשונה — היא ראש הצוות וגם הסעיף הגדול בתקציב
    .sort((a, b) => (isPrincipalRow(b) ? 1 : 0) - (isPrincipalRow(a) ? 1 : 0));
  const tsOfficial = ts.filter(simComplete);
  const totEmp    = tsOfficial.reduce((s, t) => s + calcEmployer(t).total, 0);
  const totGross  = tsOfficial.reduce((s, t) => s + calcEmployer(t).gross, 0);
  const totBase   = tsOfficial.reduce((s, t) => s + calcEmployer(t).base, 0);
  const totChabad = tsOfficial.reduce((s, t) => s + calcEmployer(t).supplement, 0);
  const totExtras = tsOfficial.reduce((s, t) => s + calcEmployer(t).social, 0);
  const totMonthly = ts.reduce((s, t) => s + (Number(t.monthlyExtras) || 0), 0);
  const needsSimCount   = ts.filter(needsSim).length;
  const needsApprCount  = ts.filter(needsApproval).length;
  const isCoord  = userRole === 'coordinator';
  const isPrincipal = userRole === 'principal';

  // מכסת שעות עובדי הוראה — מספר קבוע לבית הספר, נספרות שעות פרונטליות
  const hoursQuota = Number(school.hoursQuota) || null;
  // המכסה נספרת לפי מה שהעובדת מלמדת בפועל. שלוש שעות גמול החינוך של
  // מחנכת בעולם ישן הן מעל המכסה — היא מלמדת 21 ומשולמת על 24.
  const usedHours  = ts.reduce((s, t) => s + (Number(t.frontalHours) || 0), 0);
  const freeHours  = hoursQuota ? hoursQuota - usedHours : null;
  // כמה שעות מותר להקצות לרשומה מסוימת בלי לחרוג — כולל השעות שכבר רשומות לה
  const hoursCeiling = (rec) => {
    if (!hoursQuota) return null;
    const own = Number(ts.find(x => x.id === rec?.id)?.frontalHours) || 0;
    return hoursQuota - usedHours + own;
  };
  // מחזירה הודעת חסימה, או null אם השמירה מותרת
  const hoursBlock = (rec) => {
    const ceiling = hoursCeiling(rec);
    if (ceiling === null) return null;
    const want = Number(rec.frontalHours) || 0;
    if (want <= ceiling) return null;
    return `מכסת השעות של ${school.name} היא ${hoursQuota} שעות, ומתוכן פנויות ${Math.max(0, ceiling)}.\n\n`
      + `הזנת ${want} שעות תחרוג מהמכסה ב-${want - ceiling} שעות.`;
  };

  const exportCSV = () => {
    const headers = [
      { key:'name', label:'שם עובדת' }, { key:'tzId', label:'ת.ז.' }, { key:'email', label:'מייל' },
      { key:'reform', label:'רפורמה' }, { key:'scope', label:'% משרה' }, { key:'degree', label:'תואר' },
      { key:'grade', label:'דרגת אופק' }, { key:'seniority', label:'ותק' }, { key:'frontal', label:'פרונטלי' },
      { key:'temp', label:'שיבוץ' }, { key:'children', label:'ילדים עד 18' },
      { key:'absence', label:'העדרות (ימים)' }, { key:'mmHours', label:'ממ"מ שעות' }, { key:'mmFor', label:'במקום מי' },
      { key:'monthlyExtras', label:'תוספות (₪)' },
      { key:'base', label:'עולם ישן — בסיס (₪)' }, { key:'ofek', label:'אופק חדש (₪)' },
      ...(isPrincipal ? [] : [
        { key:'chabad', label:'תוספת בית חב"ד (₪)' }, { key:'gross', label:'ברוטו (₪)' },
        { key:'social', label:'הוצאות מעביד (₪)' }, { key:'costSource', label:'מקור עלות המעביד' },
        { key:'employer', label:'סה"כ למעסיק (₪)' },
      ]),
      { key:'source', label:'מקור הנתון' },
    ];
    const rows = ts.map(t => {
      const emp     = calcEmployer(t);
      const derived = deriveHours(t);
      const done = simComplete(t);
      return {
        name: t.name,
        tzId: t.tzId || '',
        email: t.email || '',
        reform: reformLabel(t.reform),
        scope: t.reform === 'ofek' ? (derived?.scopePct || t.scopePct || 100) : (t.scope || 100),
        degree: DEGREE_LABELS[t.degree] || t.degree || '',
        grade: t.reform === 'ofek' ? (t.grade === 'intern' ? 'מתמחה' : t.grade) : '',
        seniority: t.seniority ?? '',
        // עולם ישן: אין נגזרת, אבל השעות קיימות ונספרות במכסה
        frontal: derived ? derived.frontal : (t.frontalHours ?? ''),
        temp: t.isTemp ? 'זמני' : 'קבוע',
        children: t.childrenUnder18 || 0,
        absence: t.absenceDays || 0,
        mmHours: t.mmHours || 0,
        mmFor: t.mmFor || '',
        monthlyExtras: t.monthlyExtras || 0,
        base:  done ? emp.base : '',
        ofek:  t.reform === 'ofek' && t._officialGross ? Number(t._officialGross) : '',
        chabad: done ? emp.supplement : '',
        gross: done ? emp.gross : '',
        social: done ? emp.social : '',
        costSource: done ? (emp.isEstimate ? `אומדן ${emp.pct}%` : 'בפועל — הנהלת חשבונות') : '',
        employer: done ? emp.total : '',
        // הדוח לא מסתיר שהמספר של מי שטרם עבר סימולציה הוא אומדן פנימי
        source: done ? 'רשמי'
          : t.reform === 'ofek' && t._officialGross ? 'חסרה סימולציית עולם ישן'
          : 'טרם הורצה סימולציה',
      };
    });
    const footer = {
      name: `סה"כ (${tsOfficial.length} מורות עם סימולציה מלאה)`,
      monthlyExtras: totMonthly,
      base: totBase,
      chabad: totChabad,
      gross: totGross,
      social: totExtras,
      employer: totEmp,
    };
    downloadCSV(headers, rows, `שכר_${school.name}_${activeMonth || stampToday()}.csv`, footer);
  };

  const startEdit = t => { setEditingId(t.id); setEditData({ ...t }); };
  // בלי id. store.saveTeacher בוחר INSERT או UPDATE לפי קיומו, ומזהה
  // מקומי היה שולח אותה למסלול העדכון — על שורה שעוד לא קיימת.
  const startNew  = () => { setEditingId('new'); setEditData({ ...EMPTY_TEACHER, schoolId: school.id, reform: school.reform || 'ofek' }); };
  const cancelEdit = () => { setEditingId(null); setEditData(null); };
  const saveEdit = () => {
    if (!editData.name.trim()) return alert('יש למלא שם');
    const blocked = hoursBlock(editData);
    if (blocked) return alert(blocked);
    onSaveTeacher(editData);
    cancelEdit();
  };
  const setF = (k, v) => setEditData(p => ({ ...p, [k]: v }));

  // שתי עמודות הכסף. איזה שדה נערך תלוי במסלול: במסלול אופק הבסיס הוא
  // סימולציית העולם הישן, ובעולם ישן יש סימולציה אחת שהיא גם הבסיס.
  const moneyEditCells = (v) => {
    const isOfek = v.reform === 'ofek';
    const emp = calcEmployer(v);
    const numCell = (key) => (
      <td><input type="number" className="apple-input" dir="ltr" value={v[key] || ''}
        onChange={e => setF(key, e.target.value ? Number(e.target.value) : null)} placeholder="—"
        style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:90, textAlign:'center' }} /></td>
    );
    return (
      <>
        {isPrincipal
          ? <td style={{ textAlign:'center' }} title="נקבע בסימולציה אצל חשבת השכר">
              {emp.base
                ? <span style={{ fontWeight:700, color:'var(--text)' }}>{emp.base.toLocaleString('he-IL')}</span>
                : <span className="apple-badge badge-orange" style={{ fontWeight:600 }}>נדרשת סימולציה</span>}
            </td>
          : numCell(isOfek ? '_officialGrossPre' : '_officialGross')}
        {isPrincipal || !isOfek
          ? <td style={{ textAlign:'center', color:'var(--text3)' }}>
              {isOfek && v._officialGross ? Number(v._officialGross).toLocaleString('he-IL') : '—'}
            </td>
          : numCell('_officialGross')}
        {!isPrincipal && <td style={{ textAlign:'center', color:'var(--purple)', fontWeight:700 }}>
          {emp.supplement > 0 ? emp.supplement.toLocaleString('he-IL') + ' ₪' : '—'}
        </td>}
        {!isPrincipal && <td style={{ textAlign:'center', fontWeight:700 }}>
          {emp.gross ? emp.gross.toLocaleString('he-IL') : '—'}
        </td>}
        {!isPrincipal && <td style={{ textAlign:'center', color:'var(--text3)' }}>
          {emp.social ? emp.social.toLocaleString('he-IL') : '—'}
        </td>}
        {!isPrincipal && <td style={{ textAlign:'center', color:'var(--text3)' }}>
          {emp.total ? emp.total.toLocaleString('he-IL') : '—'}
        </td>}
      </>
    );
  };

  return (
    <div style={{ minHeight:'100vh' }} dir="rtl">

      {/* ══ Page header ══ */}
      <div className="no-print" style={{ background:'var(--surface)', borderBottom:'1px solid var(--line)' }}>
        <div style={{ maxWidth:1400, margin:'0 auto', padding:'18px 20px 15px' }}>

          <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:15, flexWrap:'wrap' }}>
            {onBack && (
              <button className="apple-btn apple-btn-ghost" onClick={onBack} style={{ minHeight:38, padding:'0 13px', fontSize:13.5 }}>
                <ArrowRight size={15} strokeWidth={2.4} />
                חזרה
              </button>
            )}
            <div style={{ flex:1, minWidth:170 }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                <span className="title-bar" />
                <h1 style={{ fontSize:23, fontWeight:800, color:'var(--text)', letterSpacing:'-0.025em', lineHeight:1.2 }}>{school.name}</h1>
              </div>
              <p style={{ fontSize:13, color:'var(--text3)', marginInlineStart:13 }}>
                {school.city}{school.city ? ' · ' : ''}מסלול ברירת מחדל לעובד/ת הוראה חדש/ה: {reformLabel(school.reform)}
              </p>
              {hoursQuota && (
                <div style={{ marginInlineStart:13, marginTop:8, maxWidth:320 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                    <span style={{ color:'var(--text3)' }}>שעות עובדי הוראה</span>
                    <span style={{ fontWeight:700, color: freeHours < 0 ? 'var(--danger)' : 'var(--text)' }}>
                      {usedHours.toLocaleString('he-IL')} / {hoursQuota.toLocaleString('he-IL')}
                      <span style={{ fontWeight:500, color:'var(--text3)' }}>
                        {' · '}{freeHours < 0 ? `חריגה של ${Math.abs(freeHours)}` : `נותרו ${freeHours}`}
                      </span>
                    </span>
                  </div>
                  <div style={{ height:6, borderRadius:999, background:'var(--fill2)', overflow:'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, Math.round(usedHours / hoursQuota * 100))}%`,
                      height:'100%', borderRadius:999, transition:'width .35s var(--ease-out)',
                      background: freeHours < 0 ? 'var(--danger)'
                        : usedHours / hoursQuota >= 0.9 ? 'var(--warn)' : 'var(--teal)',
                    }} />
                  </div>
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap' }}>
              {needsSimCount > 0 && (
                <span className="apple-badge badge-orange"><Calculator size={12} strokeWidth={2.4} />{needsSimCount} לסימולציה</span>
              )}
              {needsApprCount > 0 && (
                <span className="apple-badge badge-teal"><ClipboardCheck size={12} strokeWidth={2.4} />{needsApprCount} לאישור</span>
              )}
            </div>
          </div>

          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ position:'relative', flex:'1 1 190px', maxWidth:250 }}>
              <Search size={15} strokeWidth={2.2}
                style={{ position:'absolute', insetInlineStart:12, top:'50%', transform:'translateY(-50%)', color:'var(--text3)', pointerEvents:'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} className="apple-input"
                placeholder="חיפוש לפי שם / ת.ז." style={{ fontSize:13.5, minHeight:38, paddingInlineStart:34 }} />
            </div>

            <button className="apple-btn apple-btn-blue" onClick={startNew} style={{ minHeight:38, fontSize:13.5 }}>
              <Plus size={15} strokeWidth={2.6} />
              הוספת עובד/ת הוראה
            </button>
            <button className="apple-btn apple-btn-ghost"
              onClick={() => {
                const err = sendMonthlyEmail(school, teachers, { userRole, monthLabel: fmtMonthFn ? fmtMonthFn(activeMonth) : activeMonth });
                if (err) alert(err);
              }}
              title={(isCoord ? school.principalEmail : school.coordinatorEmail)
                ? `שלח ל: ${isCoord ? school.principalEmail : school.coordinatorEmail}`
                : (isCoord ? 'לא הוגדר מייל מנהלת' : 'לא הוגדר מייל שליח')}
              style={{ minHeight:38, fontSize:13.5 }}>
              <Send size={14} strokeWidth={2.2} />
              {isCoord ? 'שלח לאישור' : 'שלח לשליח'}
            </button>
            {isCoord && (
              <button className="apple-btn apple-btn-ghost" onClick={() => setLinkModal(true)}
                title="מנפיק למנהלת קישור אישי חדש ופותח וואטסאפ עם ההודעה מוכנה"
                style={{ minHeight:38, fontSize:13.5 }}>
                <MessageCircle size={14} strokeWidth={2.2} />
                קישור למנהלת
              </button>
            )}

            <span aria-hidden style={{ width:1, height:22, background:'var(--line)', marginInline:2 }} />

            <button className="apple-btn apple-btn-ghost" onClick={() => setShowReport(true)} style={{ minHeight:38, fontSize:13.5 }}>
              <Printer size={14} strokeWidth={2.2} />
              דוח שכר
            </button>
            <button className="apple-btn apple-btn-ghost" onClick={() => setShowAbsence(true)} style={{ minHeight:38, fontSize:13.5 }}>
              <CalendarClock size={14} strokeWidth={2.2} />
              ממ"מ והעדרויות
            </button>
            <button className="apple-btn apple-btn-ghost" onClick={exportCSV} disabled={ts.length === 0}
              title={ts.length === 0 ? 'אין עובדי הוראה לייצוא' : 'ייצוא הטבלה לקובץ CSV'} style={{ minHeight:38, fontSize:13.5 }}>
              <FileSpreadsheet size={14} strokeWidth={2.2} />
              ייצוא CSV
            </button>
            <button className="apple-btn apple-btn-ghost" onClick={() => downloadTemplate(school.name)} style={{ minHeight:38, fontSize:13.5 }}>
              <Download size={14} strokeWidth={2.2} />
              תבנית
            </button>
            <button className="apple-btn apple-btn-ghost" onClick={() => setShowImport(true)} style={{ minHeight:38, fontSize:13.5 }}>
              <Upload size={14} strokeWidth={2.2} />
              ייבוא
            </button>
          </div>
        </div>
      </div>

      {/* ══ Stat cards ══ */}
      {tsOfficial.length > 0 && (
        <div style={{ maxWidth:1400, margin:'0 auto', padding:'20px 20px 0' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(155px, 1fr))', gap:12 }}>
            {[
              { label:'עובדי הוראה',    val: ts.length.toLocaleString('he-IL'), sub: `${tsOfficial.length} עם סימולציה מלאה` },
              { label:'ברוטו / חודש',   val: totGross.toLocaleString('he-IL') + ' ₪' },
              { label:'ברוטו למעסיק',   val: totEmp.toLocaleString('he-IL') + ' ₪', sub:'כולל תוספות מעסיק' },
              { label:'עלות שנתית',     val: (totEmp*12).toLocaleString('he-IL') + ' ₪', hero:true },
            ].map((c, i) => (
              <div key={c.label} className="apple-stat spring-enter" style={{ animationDelay: `${i*55}ms` }}>
                <p className="apple-stat-label">{c.label}</p>
                <p className={`apple-stat-value ${c.hero ? 'grad-num' : ''}`}>{c.val}</p>
                {c.sub && <p style={{ fontSize:11.5, color:'var(--text3)', marginTop:3 }}>{c.sub}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {isPrincipal && (
        <div style={{ maxWidth:1400, margin:'0 auto', padding:'18px 20px 0' }}>
          <div style={{ background:'var(--teal-100)', border:'1px solid #B8EAF2', borderRadius:14, padding:'11px 14px', display:'flex', gap:9, alignItems:'flex-start' }}>
            <Calculator size={15} strokeWidth={2.2} color="var(--teal-700)" style={{ flexShrink:0, marginTop:2 }} />
            <p style={{ fontSize:12.5, color:'var(--teal-700)', lineHeight:1.6 }}>
              מזיני את פרטי המורה ואת <strong>השעות הפרונטליות</strong> — אחוז המשרה מחושב מהן,
              והשכר נקבע בסימולציה במחשבון הרשמי אצל חשבת השכר.
            </p>
          </div>
        </div>
      )}

      {/* ══ Table ══ */}
      <div style={{ maxWidth:1400, margin:'0 auto', padding:'18px 20px 40px' }}>
        <div className="sheet-wrap">
          <div className="sheet-scroll">
            <table className="apple-table sticky-head" style={{ fontSize:13, minWidth:1330 }}>
            <thead>
              <tr>
                <th>שם עובדת</th>
                <th style={{ textAlign:'center' }}>ת.ז.</th>
                <th>מייל</th>
                <th>טלפון</th>
                <th style={{ textAlign:'center' }}>רפורמה</th>
                <th style={{ textAlign:'center' }}>% משרה</th>
                <th style={{ textAlign:'center' }}>תואר</th>
                <th style={{ textAlign:'center' }}>דרגת אופק</th>
                <th style={{ textAlign:'center' }}>ותק</th>
                <th style={{ textAlign:'center' }}>פרונטלי</th>
                <th style={{ textAlign:'center' }}>גמול תפקיד</th>
                <th style={{ textAlign:'center' }}>שלב</th>
                <th style={{ textAlign:'center' }}>קבוצת גיל</th>
                <th style={{ textAlign:'center' }}>שיבוץ</th>
                <th style={{ textAlign:'center' }}>ילדים</th>
                <th style={{ textAlign:'center' }}>העדרות (ימים)</th>
                <th style={{ textAlign:'center' }}>ממ"מ שעות</th>
                <th style={{ textAlign:'center' }}>במקום מי</th>
                <th style={{ textAlign:'center' }}>תוספות (₪)</th>
                <th style={{ textAlign:'center' }} title="השכר שרץ במערכת התשלומים">עולם ישן — בסיס (₪)</th>
                <th style={{ textAlign:'center' }} title="סימולציית אופק חדש — רק במסלול אופק">אופק חדש (₪)</th>
                {!isPrincipal && <th style={{ textAlign:'center' }} title="הפער בין אופק לעולם הישן">תוספת בית חב"ד</th>}
                {!isPrincipal && <th style={{ textAlign:'center' }}>ברוטו</th>}
                {!isPrincipal && <th style={{ textAlign:'center' }} title={`פנסיה ופיצויים · קרן השתלמות · מס שכר · ביטוח לאומי · הבראה · ביגוד · ~ = אומדן שממתין לסכום מהנהלת החשבונות`}>הוצאות מעביד</th>}
                {!isPrincipal && <th style={{ textAlign:'center', color:'var(--purple)' }}>סה״כ למעסיק</th>}
                <th style={{ width:92 }}></th>
              </tr>
            </thead>
            <tbody>
              {/* New row */}
              {editingId === 'new' && editData && (
                <tr style={{ background:'var(--purple-100)', borderBottom:'2px solid var(--purple)' }}>
                  <td><input className="apple-input" value={editData.name} onChange={e=>setF('name',e.target.value)} placeholder="שם מלא *" style={{ fontSize:12, padding:'4px 8px', borderRadius:6 }} /></td>
                  <td><input className="apple-input" dir="ltr" value={editData.tzId||''} onChange={e=>setF('tzId',e.target.value)} placeholder="ת.ז." style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:90, textAlign:'center' }} /></td>
                  <td><input className="apple-input" value={editData.email||''} onChange={e=>setF('email',e.target.value)} placeholder="מייל" dir="ltr" style={{ fontSize:12, padding:'4px 8px', borderRadius:6 }} /></td>
                  <td><input className="apple-input" value={editData.phone||''} onChange={e=>setF('phone',e.target.value)} placeholder="טלפון" dir="ltr" style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:110 }} /></td>
                  <td style={{ textAlign:'center' }}>
                    <select value={editData.reform} onChange={e=>setF('reform',e.target.value)} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                      {REFORMS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    {/* מוזן ביד. אינו נגזר מהשעות. */}
                    <input type="number" className="apple-input" dir="ltr" min="0" max="200"
                      value={editData.scopePct ?? 100}
                      onChange={e => {
                        const pct = Number(e.target.value);
                        setEditData(p => ({ ...p, scopePct: pct, scope: pct }));
                      }}
                      style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:58, textAlign:'center', fontWeight:700 }} />
                    <span style={{ display:'block', fontSize:10.5, color:'var(--text3)' }}>% משרה</span>
                  </td>
                  <td>
                    <select value={editData.degree||'BA'} onChange={e=>setF('degree',e.target.value)} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                      <option value="intern">מתמחה</option>
                      <option value="unlicensed">לא מוסמך</option>
                      <option value="senior">בכיר</option>
                      <option value="BA">תואר ראשון</option>
                      <option value="MA">תואר שני</option>
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    {editData.reform==='ofek'
                      ? <select value={editData.grade||1} onChange={e=>setF('grade',Number(e.target.value))} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                          {[1,2,3,4,5,6,7,8,9].map(g=><option key={g} value={g}>דרגה {g}</option>)}
                        </select>
                      : <span style={{ color:'var(--text3)' }}>—</span>}
                  </td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.seniority??0} onChange={e=>setF('seniority',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" min="0" value={editData.frontalHours ?? baseFrontalFor(editData)}
                      max={hoursCeiling(editData) ?? 40}
                      onChange={e => {
                        // השעות אינן גוזרות את האחוז. הנוסחה שגזרה אותו
                        // שגתה, ושרה מזינה אותו בעצמה.
                        setEditData(p => ({ ...p, frontalHours: Number(e.target.value) }));
                      }}
                      style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td style={{ textAlign:'center' }}>
                    <select value={editData.role || 'none'} onChange={e=>setF('role',e.target.value)} className="apple-select" style={{ fontSize:11.5, padding:'4px 6px', maxWidth:130 }}>
                      {ROLES.map(r => <option key={r.id} value={r.id}>{r.label.split('(')[0].trim()}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    <select value={editData.level || 'elementary'} onChange={e=>setF('level',e.target.value)} className="apple-select" style={{ fontSize:11.5, padding:'4px 6px' }}>
                      {Object.entries(LEVELS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    <select value={editData.ageGroup || 'none'} onChange={e=>setF('ageGroup',e.target.value)} className="apple-select" style={{ fontSize:11.5, padding:'4px 6px' }}>
                      {Object.entries(AGE_RED).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    <label className="apple-toggle">
                      <input type="checkbox" checked={!!editData.isTemp} onChange={e=>setF('isTemp',e.target.checked)} />
                      <span className="apple-toggle-track"></span>
                    </label>
                  </td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.childrenUnder18??0} onChange={e=>setF('childrenUnder18',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.absenceDays??0} onChange={e=>setF('absenceDays',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.mmHours??0} onChange={e=>setF('mmHours',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input className="apple-input" value={editData.mmFor||''} onChange={e=>setF('mmFor',e.target.value)} placeholder="שם עובד/ת ההוראה" style={{ fontSize:12, padding:'4px 8px', borderRadius:6, minWidth:80 }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.monthlyExtras??0} onChange={e=>setF('monthlyExtras',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:70, textAlign:'center' }} /></td>
                  {moneyEditCells(editData)}
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="apple-btn apple-btn-blue" onClick={saveEdit} style={{ padding:'4px 10px', fontSize:12 }}>שמור</button>
                      <button className="apple-btn apple-btn-ghost" onClick={cancelEdit} style={{ padding:'4px 10px', fontSize:12 }}>ביטול</button>
                    </div>
                  </td>
                </tr>
              )}

              {filtered.length === 0 && editingId !== 'new' ? (
                <tr><td colSpan={15} style={{ textAlign:'center', padding:'40px', color:'var(--apple-text3)' }}>
                  {ts.length === 0 ? 'אין עדיין עובדי הוראה' : 'לא נמצאו תוצאות'}
                </td></tr>
              ) : filtered.map(t => {
                const isEditing = editingId === t.id;
                const d = isEditing ? editData : t;
                const emp     = calcEmployer(t);
                const derived = deriveHours(t);
                const scope   = t.reform === 'ofek' ? (derived?.scopePct || t.scopePct || 100) : (t.scope || 100);
                const degreeLabel = DEGREE_LABELS[t.degree] || t.degree;
                const gradeLabel  = t.reform === 'ofek' ? (t.grade === 'intern' ? 'מתמחה' : `דרגה ${t.grade}`) : '—';
                const isSim  = needsSim(t);
                const isAppr = needsApproval(t);
                const done   = simComplete(t);
                const momBonus = momBonusEligible(t);

                if (isEditing) return (
                  <tr key={t.id} style={{ background:'var(--purple-100)', borderBottom:'2px solid var(--purple)' }}>
                    <td><input className="apple-input" value={d.name} onChange={e=>setF('name',e.target.value)} style={{ fontSize:12, padding:'4px 8px', borderRadius:6 }} /></td>
                    <td><input className="apple-input" dir="ltr" value={d.tzId||''} onChange={e=>setF('tzId',e.target.value)} placeholder="ת.ז." style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:90, textAlign:'center' }} /></td>
                    <td><input className="apple-input" value={d.email||''} onChange={e=>setF('email',e.target.value)} dir="ltr" placeholder="מייל" style={{ fontSize:12, padding:'4px 8px', borderRadius:6 }} /></td>
                    <td><input className="apple-input" value={d.phone||''} onChange={e=>setF('phone',e.target.value)} dir="ltr" placeholder="טלפון" style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:110 }} /></td>
                    <td style={{ textAlign:'center' }}>
                      <select value={d.reform} onChange={e=>setF('reform',e.target.value)} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                        {REFORMS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {/* מוזן ביד. אינו נגזר מהשעות. */}
                      <input type="number" className="apple-input" dir="ltr" min="0" max="200"
                        value={d.scopePct ?? 100}
                        onChange={e => {
                          const pct = Number(e.target.value);
                          setEditData(p => ({ ...p, scopePct: pct, scope: pct }));
                        }}
                        style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:58, textAlign:'center', fontWeight:700 }} />
                      <span style={{ display:'block', fontSize:10.5, color:'var(--text3)' }}>% משרה</span>
                    </td>
                    <td>
                      <select value={d.degree||'BA'} onChange={e=>setF('degree',e.target.value)} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                        <option value="intern">מתמחה</option>
                        <option value="unlicensed">לא מוסמך</option>
                        <option value="senior">בכיר</option>
                        <option value="BA">תואר ראשון</option>
                        <option value="MA">תואר שני</option>
                      </select>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {d.reform==='ofek'
                        ? <select value={d.grade||1} onChange={e=>setF('grade',Number(e.target.value))} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                            {[1,2,3,4,5,6,7,8,9].map(g=><option key={g} value={g}>דרגה {g}</option>)}
                          </select>
                        : <span style={{ color:'var(--text3)' }}>—</span>}
                    </td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.seniority??0} onChange={e=>setF('seniority',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" min="0" value={d.frontalHours ?? baseFrontalFor(d)}
                      max={hoursCeiling(editData) ?? 40}
                      onChange={e => {
                        // השעות אינן גוזרות את האחוז. הנוסחה שגזרה אותו
                        // שגתה, ושרה מזינה אותו בעצמה.
                        setEditData(p => ({ ...p, frontalHours: Number(e.target.value) }));
                      }}
                      style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td style={{ textAlign:'center' }}>
                    <select value={d.role || 'none'} onChange={e=>setF('role',e.target.value)} className="apple-select" style={{ fontSize:11.5, padding:'4px 6px', maxWidth:130 }}>
                      {ROLES.map(r => <option key={r.id} value={r.id}>{r.label.split('(')[0].trim()}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    <select value={d.level || 'elementary'} onChange={e=>setF('level',e.target.value)} className="apple-select" style={{ fontSize:11.5, padding:'4px 6px' }}>
                      {Object.entries(LEVELS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    <select value={d.ageGroup || 'none'} onChange={e=>setF('ageGroup',e.target.value)} className="apple-select" style={{ fontSize:11.5, padding:'4px 6px' }}>
                      {Object.entries(AGE_RED).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                    <td style={{ textAlign:'center' }}>
                      <label className="apple-toggle">
                        <input type="checkbox" checked={!!d.isTemp} onChange={e=>setF('isTemp',e.target.checked)} />
                        <span className="apple-toggle-track"></span>
                      </label>
                    </td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.childrenUnder18??0} onChange={e=>setF('childrenUnder18',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.absenceDays??0} onChange={e=>setF('absenceDays',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.mmHours??0} onChange={e=>setF('mmHours',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input className="apple-input" value={d.mmFor||''} onChange={e=>setF('mmFor',e.target.value)} placeholder="שם עובד/ת ההוראה" style={{ fontSize:12, padding:'4px 8px', borderRadius:6, minWidth:80 }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.monthlyExtras??0} onChange={e=>setF('monthlyExtras',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:70, textAlign:'center' }} /></td>
                    {moneyEditCells(d)}
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="apple-btn apple-btn-blue" onClick={saveEdit} style={{ padding:'4px 10px', fontSize:12 }}>שמור</button>
                        <button className="apple-btn apple-btn-ghost" onClick={cancelEdit} style={{ padding:'4px 10px', fontSize:12 }}>ביטול</button>
                      </div>
                    </td>
                  </tr>
                );

                return (
                  <tr key={t.id} style={{ background: isSim ? 'var(--warn-bg)' : isAppr ? 'var(--teal-100)' : 'var(--surface)' }}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:6, fontWeight:600, color:'var(--text)' }}>
                        {isSim  && <Calculator size={13} strokeWidth={2.4} color="var(--warn)" aria-label="נדרשת סימולציה" />}
                        {isAppr && <ClipboardCheck size={13} strokeWidth={2.4} color="var(--teal-700)" aria-label="ממתין לאישור" />}
                        <span style={{ color: t.name === PRINCIPAL_PLACEHOLDER ? 'var(--text3)' : undefined }}>{t.name}</span>
                        {!hasContact(t) && (
                          <span className="apple-badge badge-orange" style={{ fontSize:10.5, padding:'2px 8px' }}
                            title="בלי טלפון ומייל אי אפשר לשלוח את נתוני ההעסקה לחתימה">
                            חסרים פרטי קשר
                          </span>
                        )}
                        {onLeave(t) && (
                          <span className="apple-badge badge-orange" style={{ fontSize:10.5, padding:'2px 8px' }} title={leaveText(t)}>
                            {leaveLabel(t.leaveType)}{t.leaveFrom ? ` ${fmtDay(t.leaveFrom)}` : ''}
                          </span>
                        )}
                        {isPrincipalRow(t) && (
                          <span className="apple-badge badge-purple" style={{ fontSize:10.5, padding:'2px 8px', cursor:'help' }}
                            title="נוצרה אוטומטית עם פתיחת בית הספר, עם 26 שעות כברירת מחדל — השעות נספרות במכסה. עדכני את שעותיה ואת פרטיה.">
                            מנהלת
                          </span>
                        )}
                        {t._agreedGross && <span className="apple-badge badge-teal" style={{ fontSize:10.5, padding:'2px 8px' }} title="ברוטו מוסכם — לא מסימולציה">שכר מוסכם</span>}
                        {needsNetApproval(t, isFirstMonth) && (
                          <span className="apple-badge badge-orange" style={{ fontSize:10.5, padding:'2px 8px' }}
                            title={`אושר בידי השליח, ממתין לאישור של ${approverName}`}>
                            <ShieldCheck size={10} strokeWidth={2.5} />
                            אצל {approverName}
                          </span>
                        )}
                        {fullyApproved(t, isFirstMonth) && (
                          <span className="apple-badge badge-green" style={{ fontSize:10.5, padding:'2px 8px' }}
                            title="מאושר סופית — אפשר להפיק לה נתוני העסקה לחתימה">
                            <Check size={10} strokeWidth={3} />
                            מאושר
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign:'center', fontFamily:'monospace', fontSize:12, color:'var(--apple-text2)' }}>{t.tzId||'—'}</td>
                    <td style={{ fontSize:12, color:'var(--apple-text3)' }}>{t.email||'—'}</td>
                    <td style={{ fontSize:12, color:'var(--apple-text3)', direction:'ltr', textAlign:'right' }}>{t.phone||'—'}</td>
                    <td style={{ textAlign:'center' }}>
                      <span className={`apple-badge ${t.reform==='ofek' ? 'badge-blue' : 'badge-gray'}`}>
                        {reformLabel(t.reform)}
                      </span>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      <input type="number" min="0" max="200" dir="ltr"
                        key={`pct-${t.id}`}
                        defaultValue={scope}
                        title="אחוז משרה — הקלדה ישירה, נשמר ביציאה מהשדה"
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        onBlur={e => {
                          const pct = Number(e.target.value);
                          if (!Number.isFinite(pct) || pct === scope) return;
                          onSaveTeacher({ ...t, scopePct: pct, scope: pct });
                        }}
                        style={{ width:56, textAlign:'center', fontWeight:700, fontSize:13,
                          border:'1px solid var(--line)', borderRadius:7, padding:'3px 4px',
                          background:'var(--surface)', color:'var(--text)', fontFamily:'inherit' }} />
                    </td>
                    <td style={{ textAlign:'center' }}>{degreeLabel}</td>
                    <td style={{ textAlign:'center', fontWeight:700, color: t.reform==='ofek' ? 'var(--apple-text)' : 'var(--apple-text3)' }}>{gradeLabel}</td>
                    <td style={{ textAlign:'center', color:'var(--apple-text2)' }}>{t.seniority}</td>
                    <td style={{ textAlign:'center' }}>{derived ? derived.frontal : (t.frontalHours ?? '—')}</td>
                    <td style={{ textAlign:'center' }}>
                      <select key={`role-${t.id}`} value={t.role || 'none'}
                        title="גמול תפקיד — נשמר מיד"
                        onClick={e => e.stopPropagation()}
                        onChange={e => onSaveTeacher({ ...t, role: e.target.value })}
                        className="apple-select"
                        style={{ fontSize:11.5, padding:'3px 5px', maxWidth:128,
                          fontWeight: t.role && t.role !== 'none' ? 700 : 400,
                          color: t.role && t.role !== 'none' ? 'var(--text)' : 'var(--text3)' }}>
                        {ROLES.map(r => <option key={r.id} value={r.id}>{r.label.split('(')[0].trim()}{r.pct ? ` — ${r.pct}%` : ''}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign:'center', fontSize:12 }}>{LEVELS[t.level]?.label || '—'}</td>
                    <td style={{ textAlign:'center', fontSize:12 }}>
                      {t.ageGroup && t.ageGroup !== 'none'
                        ? (AGE_RED[t.ageGroup]?.label || t.ageGroup)
                        : <span style={{ color:'var(--text3)' }}>—</span>}
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {t.isTemp
                        ? <span className="apple-badge badge-orange">שיבוץ זמני</span>
                        : <span style={{ color:'var(--text3)' }}>—</span>}
                    </td>
                    <td style={{ textAlign:'center' }}>
                      <input type="number" min="0" max="20" dir="ltr"
                        key={`kids-${t.id}`}
                        defaultValue={t.childrenUnder18 ?? 0}
                        title="ילדים עד 18 — נשמר ביציאה מהשדה"
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        onBlur={e => {
                          const n = Math.max(0, Number(e.target.value) || 0);
                          if (n === (t.childrenUnder18 ?? 0)) return;
                          onSaveTeacher({ ...t, childrenUnder18: n });
                        }}
                        style={{ width:44, textAlign:'center', fontWeight:700, fontSize:13,
                          border:'1px solid var(--line)', borderRadius:7, padding:'3px 4px',
                          background: momBonus ? 'var(--purple-100)' : 'var(--surface)',
                          color:'var(--text)', fontFamily:'inherit' }} />
                      {momBonus && <span style={{ display:'block', fontSize:9.5, color:'var(--purple)', fontWeight:700 }}>אם</span>}
                    </td>
                    <td style={{ textAlign:'center', color: (t.absenceDays||0)>0 ? 'var(--danger)' : 'var(--text3)', fontWeight: (t.absenceDays||0)>0 ? 700 : 400 }}>
                      {(t.absenceDays||0) > 0 ? t.absenceDays : '—'}
                    </td>
                    <td style={{ textAlign:'center', color: (t.mmHours||0)>0 ? 'var(--text)' : 'var(--text3)', fontWeight: (t.mmHours||0)>0 ? 700 : 400 }}>
                      {(t.mmHours||0) > 0 ? t.mmHours : '—'}
                    </td>
                    <td style={{ fontSize:12, color:'var(--apple-text2)' }}>{t.mmFor||'—'}</td>
                    <td style={{ textAlign:'center', color: (t.monthlyExtras||0)>0 ? 'var(--text)' : 'var(--text3)', fontWeight: (t.monthlyExtras||0)>0 ? 700 : 400 }}>
                      {(t.monthlyExtras||0) > 0 ? Number(t.monthlyExtras).toLocaleString('he-IL')+' ₪' : '—'}
                    </td>
                    {/* בסיס — מה שרץ במערכת התשלומים */}
                    <td style={{ textAlign:'center', fontWeight: done ? 700 : 400, color: done ? 'var(--text)' : 'var(--text3)' }}>
                      {emp.base ? emp.base.toLocaleString('he-IL') : '—'}
                    </td>
                    {/* סימולציית אופק — רלוונטית רק למסלול אופק */}
                    <td style={{ textAlign:'center', color:'var(--text2)' }}>
                      {t.reform === 'ofek'
                        ? (t._officialGross ? Number(t._officialGross).toLocaleString('he-IL') : '—')
                        : <span style={{ color:'var(--text3)' }} title="עולם ישן — סימולציה אחת">—</span>}
                    </td>
                    {!isPrincipal && <td style={{ textAlign:'center' }}>
                      {emp.supplement > 0
                        ? <span className="apple-badge badge-purple">{emp.supplement.toLocaleString('he-IL')} ₪</span>
                        : done && t.reform === 'ofek'
                          ? <span style={{ fontSize:11, color:'var(--text3)' }} title="שכר האופק אינו גבוה מהעולם הישן">0</span>
                          : <span style={{ color:'var(--text3)' }}>—</span>}
                    </td>}
                    {!isPrincipal && <td style={{ textAlign:'center', fontWeight: done ? 700 : 400, color: done ? 'var(--text)' : 'var(--text3)' }}>
                      {done ? emp.gross.toLocaleString('he-IL') : '—'}
                    </td>}
                    {!isPrincipal && <td style={{ textAlign:'center', color:'var(--text2)' }}
                      title={done
                        ? (emp.isEstimate
                            ? `אומדן ${emp.pct}% — ${emp.parts.filter(x => x.amount).map(x => `${x.label} ${x.amount.toLocaleString('he-IL')}`).join(' · ')}${emp.supplement ? ` (מזה ${emp.employerSupp.toLocaleString('he-IL')} על התוספת)` : ''}. ממתין לסכום מהנהלת החשבונות.`
                            : `סכום בפועל מהנהלת החשבונות (האומדן היה ${emp.estimate.toLocaleString('he-IL')})`)
                        : undefined}>
                      {done
                        ? <>
                            {emp.isEstimate && <span style={{ color:'var(--warn)', marginInlineEnd:2 }}>~</span>}
                            {emp.social.toLocaleString('he-IL')}
                          </>
                        : '—'}
                    </td>}
                    {!isPrincipal && <td style={{ textAlign:'center', fontWeight:800, color: done ? 'var(--purple)' : 'var(--text3)' }}>
                      {done ? emp.total.toLocaleString('he-IL')+' ₪'
                        : <span className="apple-badge badge-orange" style={{ fontWeight:600 }}>
                            {t.reform === 'ofek' && t._officialGross && !t._officialGrossPre ? 'חסרה סימולציית עולם ישן' : 'נדרשת סימולציה'}
                          </span>}
                    </td>}
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="apple-btn apple-btn-ghost" title="עריכה מהירה בשורה" onClick={() => startEdit(t)} style={{ padding:'0 9px', minHeight:30 }}><Pencil size={13} strokeWidth={2.2} /></button>
                        <button className="apple-btn apple-btn-ghost" title="פרטים מלאים — תפקיד, שלב, קבוצת גיל, שינויי משרה וקבצים" onClick={() => setFullEdit(t)} style={{ padding:'0 9px', minHeight:30 }}><Users size={13} strokeWidth={2.2} /></button>
                        {fullyApproved(t, isFirstMonth) && (
                          <button className="apple-btn apple-btn-ghost" disabled={!hasContact(t)}
                            title={hasContact(t)
                              ? 'נתוני העסקה לחתימת העובדת'
                              : 'חסרים טלפון או מייל — אין לאן לשלוח את נתוני ההעסקה'}
                            onClick={() => setDetails(t)}
                            style={{ padding:'0 9px', minHeight:30, opacity: hasContact(t) ? 1 : .4 }}>
                            <FileText size={13} strokeWidth={2.2} />
                          </button>
                        )}
                        {isCoord && isAppr && onApproveTeacher && (
                          <button className="apple-btn apple-btn-green" title="אישור" onClick={() => onApproveTeacher(t.id)} style={{ padding:'0 9px', minHeight:30 }}><Check size={14} strokeWidth={2.8} /></button>
                        )}
                        {isCoord && onDeleteTeacher && (
                          <button className="apple-btn apple-btn-ghost" onClick={() => { if (window.confirm('למחוק?')) onDeleteTeacher(t.id); }}
                            title="מחיקה" style={{ padding:'0 9px', minHeight:30, color:'var(--danger)' }}><Trash2 size={13} strokeWidth={2.2} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {tsOfficial.length > 0 && !isPrincipal && (
              <tfoot>
                <tr>
                  <td colSpan={14} style={{ fontWeight:700 }}>סה״כ ({tsOfficial.length} מורות עם סימולציה מלאה)</td>
                  <td style={{ textAlign:'center', fontWeight:700 }}>{totMonthly > 0 ? totMonthly.toLocaleString('he-IL') + ' ₪' : '—'}</td>
                  <td style={{ textAlign:'center', fontWeight:700 }}>{totBase.toLocaleString('he-IL')} ₪</td>
                  <td></td>
                  <td style={{ textAlign:'center', fontWeight:700, color:'var(--purple)' }}>{totChabad.toLocaleString('he-IL')} ₪</td>
                  <td style={{ textAlign:'center', fontWeight:700 }}>{totGross.toLocaleString('he-IL')} ₪</td>
                  <td style={{ textAlign:'center', fontWeight:700 }}>{totExtras.toLocaleString('he-IL')} ₪</td>
                  <td style={{ textAlign:'center', fontWeight:800, color:'var(--purple)' }}>{totEmp.toLocaleString('he-IL')} ₪</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
            </table>
          </div>
        </div>
        {isCoord && (
          <MonthDocuments monthKey={activeMonth} schools={[school]} schoolId={school.id}
            userRole={userRole} userId={userId}
            title={`מסמכים מהנהלת החשבונות — ${school.name} · ${fmtMonthFn ? fmtMonthFn(activeMonth) : activeMonth}`} />
        )}
      </div>

      {linkModal && <PrincipalLinkModal school={school} onClose={() => setLinkModal(false)} />}
      {fullEdit && (
        <TeacherModal
          teacher={fullEdit}
          schools={[school]}
          userRole={userRole}
          onSave={t2 => {
            const blocked = hoursBlock(t2);
            if (blocked) return alert(blocked);
            onSaveTeacher(t2);
            setFullEdit(null);
          }}
          onClose={() => setFullEdit(null)}
        />
      )}
      {details && (
        <EmploymentDetails teacher={details} school={school}
          monthLabel={fmtMonthFn ? fmtMonthFn(activeMonth) : activeMonth}
          onClose={() => setDetails(null)} />
      )}
      {showReport  && <SchoolReport   school={school} teachers={teachers} onClose={() => setShowReport(false)} />}
      {showAbsence && <AbsenceReport school={school} teachers={teachers} monthLabel={fmtMonthFn ? fmtMonthFn(activeMonth) : activeMonth} onClose={() => setShowAbsence(false)} />}
      {showImport && (
        <ImportModal
          schoolId={school.id}
          schoolName={school.name}
          onImport={ts => { onImportTeachers(ts.map(x => ({ ...x, reform: x.reform || schoolReform }))); setShowImport(false); }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NETWORK REPORT
═══════════════════════════════════════════════════════════════ */
function ReportView({ schools, teachers }) {
  const rows = schools.map(s => {
    const ts       = teachers.filter(t => t.schoolId === s.id);
    const tsOff    = ts.filter(simComplete);
    const gross    = tsOff.reduce((sum, t) => sum + calcEmployer(t).gross, 0);
    const empTot   = tsOff.reduce((sum, t) => sum + calcEmployer(t).total, 0);
    const pending  = ts.filter(isPending).length;
    const usedHours = ts.reduce((sum, t) => sum + (Number(t.frontalHours) || 0), 0);
    return { ...s, count: ts.length, officialCount: tsOff.length, gross, empTot,
             annual: empTot * 12, pending, usedHours, quota: Number(s.hoursQuota) || null };
  }).sort((a,b) => b.empTot - a.empTot);

  const totGross  = rows.reduce((s,r) => s + r.gross, 0);
  const totEmp    = rows.reduce((s,r) => s + r.empTot, 0);
  const totAnnual = rows.reduce((s,r) => s + r.annual, 0);
  const totCount  = rows.reduce((s,r) => s + r.count, 0);
  const totPending = rows.reduce((s,r) => s + r.pending, 0);
  const totOfficial = rows.reduce((s,r) => s + r.officialCount, 0);
  const totUsedHours = rows.reduce((s,r) => s + r.usedHours, 0);
  const totQuota     = rows.reduce((s,r) => s + (r.quota || 0), 0) || null;

  const exportCSV = () => {
    const headers = [
      { key:'name', label:'בית ספר' }, { key:'city', label:'עיר' },
      { key:'count', label:'עובדי הוראה' }, { key:'officialCount', label:'מתוכן עם סימולציה מלאה' },
      { key:'usedHours', label:'שעות בשימוש' }, { key:'quota', label:'מכסת שעות' },
      { key:'gross', label:'ברוטו / חודש (₪)' }, { key:'empTot', label:'ברוטו למעסיק (₪)' },
      { key:'annual', label:'עלות שנתית (₪)' }, { key:'pending', label:'ממתינים לאישור' },
    ];
    const body = rows.map(r => ({
      name: r.name, city: r.city || '', count: r.count, officialCount: r.officialCount,
      usedHours: r.usedHours, quota: r.quota || '',
      gross: r.gross || '', empTot: r.empTot || '', annual: r.annual || '', pending: r.pending,
    }));
    const footer = {
      name: 'סה"כ רשת', count: totCount, officialCount: totOfficial,
      usedHours: totUsedHours, quota: totQuota || '',
      gross: totGross, empTot: totEmp, annual: totAnnual, pending: totPending,
    };
    downloadCSV(headers, body, `דוח_רשת_${stampToday()}.csv`, footer);
  };

  return (
    <div style={{ minHeight:'100vh' }} dir="rtl">

      {/* Header */}
      <div className="no-print" style={{ background:'var(--surface)', borderBottom:'1px solid var(--line)', padding:'18px 20px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <span className="title-bar" />
            <h1 style={{ fontSize:23, fontWeight:800, color:'var(--text)', letterSpacing:'-0.025em' }}>דוח רשת — סימולציית שכר תשפ״ו</h1>
          </div>
          <p style={{ fontSize:13, color:'var(--text3)', marginTop:2, marginInlineStart:13 }}>{rows.filter(r=>r.count>0).length} בתי ספר · {totCount} מורות</p>
        </div>
        {totPending > 0 && <span className="apple-badge badge-orange"><Bell size={12} strokeWidth={2.3} />{totPending} ממתינים לאישור</span>}
        <button className="apple-btn apple-btn-ghost" onClick={exportCSV} disabled={rows.length === 0} style={{ fontSize:13 }}>
          <FileSpreadsheet size={14} strokeWidth={2.2} />
          ייצוא CSV
        </button>
        <button className="apple-btn apple-btn-ghost" onClick={() => window.print()} style={{ fontSize:13 }}><Printer size={14} strokeWidth={2.2} />הדפסה</button>
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(155px, 1fr))', gap:12, padding:'20px 20px 0' }}>
        {[
          { label:'סה״כ עובדי הוראה',           val: totCount.toLocaleString('he-IL') },
          { label:'בתי ספר פעילים',       val: rows.filter(r=>r.count>0).length.toLocaleString('he-IL') },
          { label:'ברוטו למעסיק / חודש',  val: totEmp.toLocaleString('he-IL')+' ₪' },
          { label:'עלות שנתית',           val: totAnnual.toLocaleString('he-IL')+' ₪', hero:true },
        ].map((c, i) => (
          <div key={c.label} className="apple-stat spring-enter" style={{ animationDelay: `${i*55}ms` }}>
            <p className="apple-stat-label">{c.label}</p>
            <p className={`apple-stat-value ${c.hero ? 'grad-num' : ''}`}>{c.val}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ padding:'20px 20px 40px' }}>
        <div className="sheet-wrap">
          <div className="sheet-scroll" style={{ maxHeight:'none' }}>
          <table className="apple-table">
            <thead>
              <tr>
                <th>בית ספר</th>
                <th>עיר</th>
                <th style={{ textAlign:'center' }}>מורות</th>
                <th style={{ textAlign:'center' }}>שעות / מכסה</th>
                <th style={{ textAlign:'center' }}>ברוטו / חודש</th>
                <th style={{ textAlign:'center' }}>ברוטו למעסיק</th>
                <th style={{ textAlign:'center', color:'var(--apple-purple)' }}>עלות שנתית</th>
                <th style={{ textAlign:'center' }}>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight:700 }}>{r.name}</td>
                  <td style={{ color:'var(--apple-text2)', fontSize:13 }}>{r.city||'—'}</td>
                  <td style={{ textAlign:'center', fontWeight:600 }}>
                    {r.count}
                    {r.count > 0 && r.officialCount < r.count && (
                      <span title="מספר עובדי ההוראה שכבר עברו סימולציה" style={{ fontSize:11, color:'var(--warn)', fontWeight:600, marginInlineStart:5 }}>
                        ({r.officialCount} רשמי)
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign:'center', fontWeight:600,
                    color: r.quota && r.usedHours > r.quota ? 'var(--danger)'
                         : r.quota && r.usedHours / r.quota >= 0.9 ? 'var(--warn)' : 'var(--text2)' }}>
                    {r.quota ? `${r.usedHours} / ${r.quota}` : (r.usedHours || '—')}
                  </td>
                  <td style={{ textAlign:'center', color:'var(--text)', fontWeight:600 }}>{r.gross>0 ? r.gross.toLocaleString('he-IL')+' ₪' : '—'}</td>
                  <td style={{ textAlign:'center', fontWeight:700, color:'var(--text)' }}>{r.empTot>0 ? r.empTot.toLocaleString('he-IL')+' ₪' : '—'}</td>
                  <td style={{ textAlign:'center', fontWeight:800, color:'var(--purple)' }}>{r.annual>0 ? r.annual.toLocaleString('he-IL')+' ₪' : '—'}</td>
                  <td style={{ textAlign:'center' }}>
                    {r.pending > 0
                      ? <span className="apple-badge badge-orange"><Bell size={12} strokeWidth={2.3} />{r.pending}</span>
                      : <span className="apple-badge badge-green"><Check size={12} strokeWidth={2.8} />מעודכן</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ fontWeight:800 }}>סה״כ רשת</td>
                <td style={{ textAlign:'center', fontWeight:700 }}>{totCount}</td>
                <td style={{ textAlign:'center', fontWeight:700 }}>{totUsedHours}{totQuota ? ` / ${totQuota}` : ''}</td>
                <td style={{ textAlign:'center', fontWeight:700, color:'var(--text)' }}>{totGross.toLocaleString('he-IL')} ₪</td>
                <td style={{ textAlign:'center', fontWeight:700, color:'var(--text)' }}>{totEmp.toLocaleString('he-IL')} ₪</td>
                <td style={{ textAlign:'center', fontWeight:800, color:'var(--purple)' }}>{totAnnual.toLocaleString('he-IL')} ₪</td>
                <td style={{ textAlign:'center' }}>{totPending > 0 ? totPending : '—'}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
        <p style={{ fontSize:11, color:'var(--text3)', marginTop:10, padding:'0 4px', lineHeight:1.7 }}>
          התשלומים רצים במערכת של עולם ישן. הפער עד שכר האופק משולם כתוספת בית חב"ד.<br/>
          ברוטו למעסיק = ברוטו לעובדת + פנסיה ופיצויים · קרן השתלמות · מס שכר · ביטוח לאומי · הבראה · ביגוד
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SIMULATOR VIEW — חשבת שכר עורכת סימולציה
═══════════════════════════════════════════════════════════════ */
// שלב הזנה אחד במסך החשבת. הקלקה על השדה מחליפה את המחשבון שמוצג לצידו,
// כדי שהמספר יוקלד מהמסך הנכון.
function SimStep({ n, label, calcLabel, active, onFocus, value, onChange, onEnter, autoFocus, inputRef }) {
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
        <span style={{
          width:18, height:18, borderRadius:'50%', flexShrink:0, fontSize:11, fontWeight:800,
          display:'flex', alignItems:'center', justifyContent:'center',
          background: value ? 'var(--ok)' : active ? 'var(--purple)' : 'var(--fill2)',
          color: (value || active) ? '#fff' : 'var(--text3)',
        }}>{value ? '✓' : n}</span>
        <span style={{ fontSize:12, fontWeight:700, color:'var(--text2)' }}>{label}</span>
        {active && <span style={{ fontSize:10.5, color:'var(--purple)' }}>← {calcLabel}</span>}
      </div>
      <input type="number" className="apple-input" dir="ltr" autoFocus={autoFocus} ref={inputRef}
        placeholder={`שכר משולב מ${calcLabel}`}
        value={value}
        onFocus={onFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
        style={{ fontSize:14, minHeight:38, borderColor: active ? 'var(--purple)' : undefined }} />
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   מסמכים מהנהלת החשבונות

   השכר בפועל רץ במערכת של משרד הנהלת החשבונות, לא כאן. מה שיוצא משם —
   דוח שכר, סיכום עלות מעביד, תלושים — מצורף לחודש שהוא שייך לו, ואם
   הוא של בית ספר אחד, גם לבית הספר. הקבצים בדלי פרטי; כל פתיחה היא
   כתובת חד-פעמית לעשר דקות.

   מנהלות בית ספר אינן רואות את הפאנל: המסמכים מכילים שכר של עובדות
   בשמן, וזה מה שמוסתר מהן בכל מקום אחר.
═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   מעקב מילוי — מי נכנסה, ואצל מי תקוע

   הקישורים נשלחו ואין דרך לדעת מי פתח אותם. בלי המסך הזה הדרך היחידה
   לברר אצל מי תקוע היא לרדוף אחרי כולן בוואטסאפ, ולגלות שרובן כבר
   סיימו. הסדר הוא לפי מי שצריכה תזכורת, לא לפי אלף-בית.
═══════════════════════════════════════════════════════════════ */
function FillProgress({ schools, month, onOpenSchool }) {
  const [rows, setRows] = useState(null);
  const [err,  setErr]  = useState('');

  // ה-effect רק מפעיל; כל setState קורה בתוך הפונקציה האסינכרונית,
  // אחרי await, ולא בגוף ה-effect עצמו.
  const load = useCallback(async () => {
    if (!month) return;
    try {
      // "לפני כמה זמן" מחושב פעם אחת, ברגע הטעינה. חישוב מחדש בכל
      // רינדור הופך את הרינדור ללא-טהור והתצוגה זזה בלי שקרה דבר.
      const at = Date.now();
      const ago = (iso) => {
        if (!iso) return null;
        const mins = Math.round((at - new Date(iso).getTime()) / 60000);
        if (mins < 1)    return 'עכשיו';
        if (mins < 60)   return `לפני ${mins} דק׳`;
        if (mins < 1440) return `לפני ${Math.round(mins / 60)} שע׳`;
        return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
      };
      setRows((await store.schoolProgress(month)).map(r => ({ ...r, ago: ago(r.lastSeen) })));
    }
    catch (e) { setErr(e.message); }
  }, [month]);
  useEffect(() => { let alive = true; (async () => { if (alive) await load(); })(); return () => { alive = false; }; }, [load]);

  if (err)   return <p style={{ fontSize:12.5, color:'var(--danger)' }}>{err}</p>;
  if (!rows) return null;

  const name = id => schools.find(s => s.id === id)?.name || '';

  // מצב לכל בית ספר, ומכאן גם הסדר: מה שדורש פעולה קודם
  const state = (r) => {
    if (!r.hasLink)                return { k: 0, label: 'אין קישור',        tone: 'gray'  };
    if (!r.lastSeen)               return { k: 1, label: 'טרם נכנסה',        tone: 'orange'};
    if (r.teachers === 0)          return { k: 2, label: 'נכנסה, לא הזינה',  tone: 'orange'};
    if (r.missingContact > 0)      return { k: 3, label: `${r.missingContact} בלי פרטי קשר`, tone: 'orange' };
    if (r.simulated < r.teachers)  return { k: 4, label: 'ממתין לחשבת השכר', tone: 'teal'  };
    return                                { k: 5, label: 'מוכן',             tone: 'green' };
  };
  const list = rows.map(r => ({ ...r, st: state(r) })).sort((a, b) => a.st.k - b.st.k || name(a.schoolId).localeCompare(name(b.schoolId), 'he'));

  const waiting = list.filter(r => r.st.k <= 3).length;
  const totalT  = list.reduce((n, r) => n + r.teachers, 0);

  return (
    <div className="apple-card" style={{ padding:'14px 16px', marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:3, flexWrap:'wrap' }}>
        <ClipboardCheck size={15} strokeWidth={2.3} color="var(--purple)" />
        <p style={{ fontSize:13.5, fontWeight:700, color:'var(--text)' }}>מעקב מילוי — {fmtMonth(month)}</p>
        <button onClick={load} title="רענון" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:11.5, padding:0 }}>
          רענון
        </button>
      </div>
      <p style={{ fontSize:11.5, color:'var(--text3)', marginBottom:11 }}>
        {waiting ? `${waiting} בתי ספר ממתינים לך · ` : 'כל בתי הספר סיימו · '}
        {totalT} עובדי הוראה הוזנו
      </p>

      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
        {list.map(r => (
          <button key={r.schoolId} onClick={() => onOpenSchool?.(r.schoolId)}
            style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 10px', background:'var(--fill)',
              border:'none', borderRadius:10, cursor:'pointer', textAlign:'right', fontFamily:'inherit', width:'100%' }}>
            <span className={`apple-badge badge-${r.st.tone}`} style={{ fontSize:10.5, padding:'2px 8px', flexShrink:0, minWidth:96, justifyContent:'center' }}>
              {r.st.label}
            </span>
            <span style={{ flex:1, minWidth:0, fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {name(r.schoolId)}
              {r.principal && <span style={{ fontWeight:400, color:'var(--text3)' }}> · {r.principal}</span>}
            </span>
            <span style={{ fontSize:11.5, color:'var(--text3)', flexShrink:0 }}>
              {r.teachers > 0 && `${r.teachers} עובדים`}
              {r.ago && ` · ${r.ago}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthDocuments({ monthKey, schools = [], schoolId = null, userRole, userId, title }) {
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');
  const [note, setNote] = useState('');
  const [pickSchool, setPickSchool] = useState(schoolId || '');
  const fileRef = useRef(null);
  const canWrite = userRole === 'coordinator' || userRole === 'clerk';

  const load = useCallback(async () => {
    if (!monthKey) return;
    try {
      const all = await store.listDocuments(monthKey);
      // במסך בית ספר: המסמכים שלו, וגם אלה שלא שויכו לאף בית ספר
      setDocs(schoolId ? all.filter(d => !d.schoolId || d.schoolId === schoolId) : all);
    } catch (e) { setErr(e.message); }
  }, [monthKey, schoolId]);
  useEffect(() => { load(); }, [load]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr('');
    try {
      await store.uploadDocument({ monthKey, schoolId: pickSchool || null, note, file });
      setNote('');
      await load();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const open = async (d) => { try { window.open(await store.documentUrl(d), '_blank'); } catch (e) { setErr(e.message); } };
  const del  = async (d) => {
    if (!window.confirm(`למחוק את "${d.fileName}"?`)) return;
    try { await store.deleteDocument(d); await load(); } catch (e) { setErr(e.message); }
  };

  if (!monthKey) return null;
  const schoolName = id => schools.find(x => x.id === id)?.name || '';
  const fmtSize = n => (!n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const fmtWhen = iso => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });

  return (
    <div className="apple-card" style={{ padding: '14px 16px', marginTop: 14 }} dir="rtl">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Paperclip size={15} strokeWidth={2.3} color="var(--purple)" />
        <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
          {title || `מסמכים מהנהלת החשבונות — ${fmtMonth(monthKey)}`}
        </p>
        {docs.length > 0 && <span className="apple-badge badge-purple" style={{ fontSize: 10.5, padding: '2px 8px' }}>{docs.length}</span>}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.6 }}>
        דוח השכר, סיכום עלות מעביד או כל קובץ שיצא ממערכת השכר. גלוי לרשת, לחשבת השכר ולמאשרות — לא למנהלות.
      </p>

      {canWrite && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          {!schoolId && (
            <select className="apple-select" value={pickSchool} onChange={e => setPickSchool(e.target.value)} style={{ fontSize: 12.5, minHeight: 36 }}>
              <option value="">כל בתי הספר</option>
              {schools.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          <input className="apple-input" value={note} onChange={e => setNote(e.target.value)}
            placeholder="הערה (לא חובה)" style={{ fontSize: 12.5, minHeight: 36, flex: '1 1 160px' }} />
          <label className="apple-btn apple-btn-blue" style={{ minHeight: 36, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1 }}>
            <Upload size={14} strokeWidth={2.3} />
            {busy ? 'מעלה…' : 'העלאת קובץ'}
            <input ref={fileRef} type="file" onChange={onPick} disabled={busy} style={{ display: 'none' }}
              accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.png,.jpg,.jpeg" />
          </label>
        </div>
      )}
      {err && <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{err}</p>}

      {docs.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--text3)' }}>אין עדיין מסמכים לחודש הזה.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'var(--fill)', borderRadius: 10 }}>
              <FileText size={15} strokeWidth={2.2} color="var(--text3)" />
              <button onClick={() => open(d)} title="פתיחה"
                style={{ flex: 1, minWidth: 0, textAlign: 'right', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fileName}</p>
                <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {[d.schoolId ? schoolName(d.schoolId) : 'כל בתי הספר', fmtSize(d.size), fmtWhen(d.uploadedAt), d.note].filter(Boolean).join(' · ')}
                </p>
              </button>
              <button onClick={() => open(d)} title="פתיחה" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', display: 'flex', padding: 4 }}>
                <Download size={15} strokeWidth={2.3} />
              </button>
              {(userRole === 'coordinator' || d.uploadedBy === userId) && (
                <button onClick={() => del(d)} title="מחיקה" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', padding: 4 }}>
                  <Trash2 size={15} strokeWidth={2.2} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   קישור אישי למנהלת — מהממשק, לוואטסאפ

   "המערכת מפיקה, את שולחת": הכפתור מנפיק קישור חדש (הקודם מתבטל)
   ופותח וואטסאפ עם ההודעה מוכנה. השליחה עצמה — בלחיצה של שרה, לא של
   המערכת. מנהלת בלי פרופיל עדיין דורשת את scripts/make-link.mjs, כי
   יצירת משתמש דורשת את מפתח השרת שאין לדפדפן.
═══════════════════════════════════════════════════════════════ */
function PrincipalLinkModal({ school, onClose }) {
  const [pr, setPr]   = useState(null);      // המנהלת של בית הספר
  const [st, setSt]   = useState({});        // { loading | error | link, wa }
  const [copied, setCopied] = useState(false);

  // בטעינה — קריאה בלבד. ההנפקה עצמה היא פעולה מפורשת של שרה, לא תוצר
  // לוואי של פתיחת החלון: אפקט שמנפיק קישור רץ פעמיים ב-StrictMode
  // ויצר שני קישורים פעילים, וגם ביטל את הקודם רק מפני שהחלון נפתח.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ps = await store.principalsOfSchool(school.id);
        if (!alive) return;
        if (!ps.length) setSt({ error: 'למנהלת אין עדיין פרופיל במערכת. צרי לה אחד עם scripts/make-link.mjs — ומכאן והלאה הכפתור הזה ינפיק לה קישורים.' });
        else setPr(ps[0]);
      } catch (e) { if (alive) setSt({ error: e.message }); }
    })();
    return () => { alive = false; };
  }, [school]);

  const issue = async () => {
    setSt({ loading: true });
    try {
      const code = await store.issueLink(pr.id);
      const link = `${window.location.origin}/?k=${code}`;
      const first = (pr.fullName || '').split(' ')[0];
      const msg = `שלום ${first}, זה הקישור האישי שלך למערכת שכר המורים — ${school.name}:\n${link}\n\nהקישור אישי; לא להעביר הלאה.`;
      const wa  = pr.phone ? `https://wa.me/${pr.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}` : null;
      setSt({ link, wa });
    } catch (e) { setSt({ error: e.message }); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(st.link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt('העתיקי את הקישור:', st.link); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,11,53,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)' }} dir="rtl" onClick={onClose}>
      <div className="apple-card" style={{ width: '100%', maxWidth: 420, padding: 24 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>קישור אישי — {school.name}</h2>
        {st.error && <p style={{ fontSize: 13, color: 'var(--danger)', lineHeight: 1.6 }}>{st.error}</p>}
        {pr && (
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
            {pr.fullName}{pr.phone ? ` · ${pr.phone.replace('+972', '0')}` : ' · אין טלפון על הפרופיל'}
          </p>
        )}
        {pr && !st.link && (
          <>
            <button className="apple-btn apple-btn-blue" onClick={issue} disabled={st.loading} style={{ width: '100%', minHeight: 42 }}>
              <MessageCircle size={15} strokeWidth={2.3} />
              {st.loading ? 'מנפיק…' : 'הנפקת קישור חדש'}
            </button>
            <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, lineHeight: 1.6 }}>
              הקישור הקודם שלה יבוטל. מי שמחזיק בקישור נכנס בשמה — לשלוח רק לה.
            </p>
          </>
        )}
        {st.link && (
          <>
            <input readOnly value={st.link} dir="ltr" className="apple-input" onFocus={e => e.target.select()}
              style={{ fontSize: 12, marginBottom: 12, fontFamily: 'monospace' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {st.wa && (
                <a href={st.wa} target="_blank" rel="noreferrer" className="apple-btn apple-btn-green" style={{ flex: 1, minHeight: 40, textDecoration: 'none' }}>
                  <MessageCircle size={15} strokeWidth={2.3} />
                  פתיחה בוואטסאפ
                </a>
              )}
              <button className="apple-btn apple-btn-ghost" onClick={copy} style={{ flex: 1, minHeight: 40 }}>
                {copied ? '✓ הועתק' : 'העתקת הקישור'}
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 12, lineHeight: 1.6 }}>
              הקישור הקודם בוטל. {!st.wa && 'כדי לקבל כפתור וואטסאפ, שמרי לה טלפון בפרופיל.'}
            </p>
          </>
        )}
        <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ width: '100%', marginTop: 12 }}>סגירה</button>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   עלות מעביד בפועל — חשבת השכר מקלידה

   האומדן הוא שש שורות לפי החוק; המספר האמיתי מגיע מהנהלת החשבונות
   אחרי שהשכר רץ. עד עכשיו רק השליח יכול היה להקליד אותו, מתוך כרטיס
   המורה — מסך שלחשבת השכר אין. השרת התיר לה את העמודה מההתחלה.
═══════════════════════════════════════════════════════════════ */
function ActualCostPanel({ teachers, schools, onSave }) {
  const [vals,  setVals]  = useState({});   // teacherId → מה שמוקלד
  const [flash, setFlash] = useState({});   // teacherId → נשמר הרגע
  const rows = teachers.filter(simComplete);
  const bySchool = schools
    .map(sc => ({ school: sc, list: rows.filter(t => t.schoolId === sc.id) }))
    .filter(g => g.list.length);
  const missing = rows.filter(t => !t._actualEmployerCost).length;

  const save = async (t) => {
    const raw = vals[t.id] ?? (t._actualEmployerCost || '');
    const n = String(raw).trim() === '' ? null : Math.round(Number(raw));
    if (n !== null && (isNaN(n) || n <= 0)) return alert('עלות המעביד חייבת להיות מספר חיובי');
    const ok = await onSave(t.id, n);
    if (ok) {
      setVals(v => { const x = { ...v }; delete x[t.id]; return x; });
      setFlash(f => ({ ...f, [t.id]: true }));
      setTimeout(() => setFlash(f => { const x = { ...f }; delete x[t.id]; return x; }), 1500);
    }
  };

  if (!rows.length) return (
    <div style={{ textAlign:'center', padding:'48px 16px' }}>
      <p style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>אין עדיין עובדי הוראה עם סימולציה בחודש הזה</p>
      <p style={{ fontSize:12.5, color:'var(--text3)', marginTop:4 }}>עלות בפועל מוזנת אחרי שהשכר חושב.</p>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <p style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6 }}>
        הסכום מהנהלת החשבונות מחליף את האומדן בכל מקום — בדוחות, אצל השליח ואצל המאשרת.
        ריק = חזרה לאומדן. {missing > 0 ? `${missing} ללא עלות בפועל.` : 'לכולן יש עלות בפועל.'}
      </p>
      {bySchool.map(({ school, list }) => (
        <div key={school.id}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--purple)', marginBottom:8, padding:'5px 11px', background:'var(--purple-100)', border:'1px solid #D8CEEF', borderRadius:999, display:'inline-flex', alignItems:'center', gap:6 }}>
            <School size={13} strokeWidth={2.2} />
            {school.name}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {list.map(t => {
              const emp = calcEmployer(t);
              const cur = vals[t.id] ?? (t._actualEmployerCost || '');
              const diff = t._actualEmployerCost ? Math.round((t._actualEmployerCost - emp.estimate) / emp.estimate * 1000) / 10 : null;
              return (
                <div key={t.id} className="apple-card" style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <div style={{ flex:'1 1 150px', minWidth:0 }}>
                    <p style={{ fontSize:13.5, fontWeight:600, color:'var(--text)' }}>{t.name}</p>
                    <p style={{ fontSize:11.5, color:'var(--text3)' }}>
                      אומדן {emp.estimate.toLocaleString('he-IL')} ₪ ({emp.pct}%)
                      {diff !== null && <span style={{ marginInlineStart:6, color: Math.abs(diff) > 10 ? 'var(--warn)' : 'var(--text3)' }}>· בפועל {diff > 0 ? '+' : ''}{diff}%</span>}
                    </p>
                  </div>
                  <input type="number" inputMode="numeric" className="apple-input" dir="ltr" placeholder="עלות בפועל"
                    value={cur}
                    onChange={e => setVals(v => ({ ...v, [t.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(t); } }}
                    style={{ width:130, fontSize:14, minHeight:38, textAlign:'center' }} />
                  <button className="apple-btn apple-btn-blue" onClick={() => save(t)} style={{ minHeight:38, padding:'0 14px' }}>
                    {flash[t.id] ? '✓' : 'שמור'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SimulatorView({ teachers, schools, onSaveGross, onSaveActual, onSaveKids, activeMonth, userRole, userId }) {
  const [calc, setCalc] = useState('ofek');
  const [tab, setTab]   = useState('sim');   // 'sim' | 'cost'
  const costMissing = teachers.filter(t => simComplete(t) && !t._actualEmployerCost).length;
  const [filterSchool, setFilterSchool] = useState('all');
  const [inputs, setInputs] = useState({});    // teacherId → string
  const [saved, setSaved]   = useState({});    // teacherId → true (just saved flash)
  const [preInputs, setPreInputs] = useState({});   // סימולציית עולם ישן, לחישוב תוספת בית חב"ד
  // Enter בשלב 1 החליף את המחשבון אבל השאיר את הסמן במקום, וההקלדה
  // הבאה נדבקה לסוף המספר הראשון. autoFocus אינו עוזר — הוא פועל רק
  // ברגע ההרכבה, והשדה השני כבר מורכב. לכן מעבירים את הסמן במפורש.
  const step1Ref = useRef(null);
  const step2Ref = useRef(null);
  const [activeId, setActiveId] = useState(null);


  // כל המורים שממתינים לסימולציה (שינוי נתונים, אין עדיין שכר רשמי)
  const allMissing = teachers.filter(needsSim);
  // רק מה שממתין החודש. קודם, כשלא נשאר דבר, המונה נפל על כל המורות
  // והציג "0 / 5 הושלמו" רגע אחרי שהחשבת סיימה 5 / 5.
  const total = teachers.filter(isPending).length;
  const done  = teachers.filter(needsApproval).length;

  // Schools that have at least one missing teacher
  const missingSchoolIds = [...new Set(allMissing.map(t => t.schoolId))];

  const filtered = filterSchool === 'all'
    ? allMissing
    : allMissing.filter(t => t.schoolId === filterSchool);

  // Group by school
  const grouped = schools
    .filter(s => filterSchool === 'all' ? missingSchoolIds.includes(s.id) : s.id === filterSchool)
    .map(s => ({ school: s, teachers: filtered.filter(t => t.schoolId === s.id) }))
    .filter(g => g.teachers.length > 0);

  // בחירת מורה בוחרת גם את המחשבון שמתאים למסלול שלה — ההגנה האמיתית
  // מפני הזנת מספר שחושב במחשבון הלא נכון.
  const selectTeacher = (t) => {
    setActiveId(t.id);
    setCalc(calcForTeacher(t));
  };

  // 8100.75 החזיר "invalid input syntax for type integer" גולמי מהמסד,
  // ומינוס — check constraint. אגורות מתעגלות; מינוס נעצר בעברית.
  const clean = v => (v === '' || v == null || isNaN(Number(v))) ? null : Math.round(Number(v));
  const handleSave = (t) => {
    const val = clean(inputs[t.id] ?? t._officialGross);
    if (val === null) return;
    if (val <= 0) return alert('השכר חייב להיות מספר חיובי');
    const pre = clean(preInputs[t.id] ?? t._officialGrossPre);
    if (pre !== null && pre <= 0) return alert('שכר העולם הישן חייב להיות מספר חיובי');
    // מורת אופק לא נשמרת בלי שתי הסימולציות — הפער ביניהן הוא רכיב התשלום.
    // מנהלת פטורה: לה יש סימולציית ניהול אחת שהיא הבסיס במלואו.
    if (t.reform === 'ofek' && !isPrincipalRow(t) && pre === null) return;
    onSaveGross(t.id, val, pre ?? undefined);
    setSaved(prev => ({ ...prev, [t.id]: true }));
    setTimeout(() => setSaved(prev => { const n={...prev}; delete n[t.id]; return n; }), 1500);
    // advance to next in list
    const flat = grouped.flatMap(g => g.teachers);
    const idx  = flat.findIndex(x => x.id === t.id);
    if (idx !== -1 && idx + 1 < flat.length) selectTeacher(flat[idx + 1]);
  };

  const pct = total ? Math.round(done / total * 100) : 100;

  return (
    <div className="sim-split">

      {/* LEFT — simulator iframe */}
      <div className="sim-calc">
        <div style={{ background:'var(--apple-surface)', borderBottom:'1px solid var(--apple-fill2)', padding:'10px 16px', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, fontWeight:600, color:'var(--text3)', marginInlineEnd:4, display:'inline-flex', alignItems:'center', gap:5 }}>
            <Calculator size={13} strokeWidth={2.2} />
            מחשבון רשמי
          </span>
          <div className="apple-seg">
            {CALCULATORS.map(o => (
              <button key={o.id} onClick={() => setCalc(o.id)}
                className={`apple-seg-item${calc === o.id ? ' active' : ''}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <CalculatorFrame key={calc} calcId={calc} />
      </div>

      {/* RIGHT — teacher list */}
      <div className="sim-list">

        {/* Header */}
        <div style={{ background:'var(--apple-surface)', borderBottom:'1px solid var(--apple-fill2)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div className="apple-seg">
              <button onClick={() => setTab('sim')} className={['apple-seg-item', tab === 'sim' ? 'active' : ''].join(' ')} style={{ padding:'5px 11px', fontSize:12.5 }}>
                הזנת שכר רשמי
              </button>
              <button onClick={() => setTab('cost')} className={['apple-seg-item', tab === 'cost' ? 'active' : ''].join(' ')} style={{ padding:'5px 11px', fontSize:12.5 }}>
                עלות מעביד בפועל{costMissing > 0 ? ` (${costMissing})` : ''}
              </button>
            </div>
            {tab === 'sim' && <span style={{ fontSize:12, color:'var(--apple-text2)' }}>{total ? `${done} / ${total} הושלמו` : 'אין ממתינות'}</span>}
          </div>
          {/* Progress bar */}
          <div style={{ background:'var(--fill2)', borderRadius:999, height:6, overflow:'hidden' }}>
            <div style={{ width: pct+'%', background:'linear-gradient(to left, var(--purple), var(--teal))', borderRadius:999, height:6, transition:'width .45s var(--ease-out)' }} />
          </div>
          {tab === 'sim' && (
            <select className="apple-select" style={{ fontSize:13 }}
              value={filterSchool} onChange={e => setFilterSchool(e.target.value)}>
              <option value="all">כל בתי הספר ({allMissing.length} ממתינים)</option>
              {schools.filter(s => missingSchoolIds.includes(s.id)).map(s => (
                <option key={s.id} value={s.id}>{s.name} ({allMissing.filter(t => t.schoolId === s.id).length})</option>
              ))}
            </select>
          )}
        </div>

        {/* Teacher rows */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 12px', display:'flex', flexDirection:'column', gap:16 }}>
          {tab === 'cost' && <ActualCostPanel teachers={teachers} schools={schools} onSave={onSaveActual} />}
          {/* המסמכים הם של הנהלת החשבונות, כמו העלות בפועל. בלשונית
              הסימולציה הם רק גזלו גובה מרשימת העובדות. */}
          {tab === 'cost' && (
            <MonthDocuments monthKey={activeMonth} schools={schools} userRole={userRole} userId={userId} />
          )}
          {tab === 'sim' && grouped.length === 0 && (
            <div style={{ textAlign:'center', padding:'48px 16px' }}>
              <div style={{ width:56, height:56, borderRadius:17, background:'var(--ok-bg)', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Check size={26} strokeWidth={2.4} color="var(--ok)" />
              </div>
              <p style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>כל עובדי ההוראה הוזנו</p>
              <p style={{ fontSize:13, color:'var(--text3)', marginTop:3 }}>אין שכר שממתין לסימולציה</p>
            </div>
          )}
          {tab === 'sim' && grouped.map(({ school, teachers: gTeachers }) => (
            <div key={school.id}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--purple)', marginBottom:8, padding:'5px 11px', background:'var(--purple-100)', border:'1px solid #D8CEEF', borderRadius:999, display:'inline-flex', alignItems:'center', gap:6 }}>
                <School size={13} strokeWidth={2.2} />
                {school.name}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {gTeachers.map(t => {
                  const est = calcGross(t);
                  const isActive = activeId === t.id;
                  const wasSaved = saved[t.id];
                  const isOfek   = t.reform === 'ofek';
                  const dh       = deriveHours(t);   // פרונטלי/פרטני/שהייה — אופק בלבד
                  // רק מורת אופק שאינה מנהלת דורשת שתי סימולציות
                  const needsTwo = isOfek && !isPrincipalRow(t);
                  const preVal   = preInputs[t.id] ?? (t._officialGrossPre || '');
                  const mainVal  = inputs[t.id] ?? (t._officialGross || '');
                  // שלב 2 הוא המחשבון של המורה — למנהלת בית ספר זה אופק ניהול
                  const step2Calc  = calcForTeacher(t);
                  const step2Label = (CALCULATORS.find(c => c.id === step2Calc) || CALCULATORS[0]).label;
                  // בכרטיס פעיל הלחיצה אינה בוחרת מחדש: focus על שדה "עולם
                  // ישן" מגיע לפני click, ו-selectTeacher היה דורס אותו ומחזיר
                  // את המחשבון לאופק — בדיוק השדה שזקוק למחשבון האחר היה
                  // היחיד שאי אפשר להגיע אליו בעכבר.
                  return (
                    <div key={t.id} onClick={() => { if (activeId !== t.id) selectTeacher(t); }}
                      className="apple-card"
                      style={{ padding:'12px 14px', cursor:'pointer', borderRight: isActive ? '3px solid var(--apple-blue)' : '3px solid transparent', boxShadow: isActive ? '0 4px 20px rgba(0,122,255,0.12)' : '' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom: isActive ? 10 : 0 }}>
                        <div>
                          <p style={{ fontWeight:600, fontSize:14, color:'var(--apple-text)', marginBottom:2 }}>{t.name}</p>
                          <p style={{ fontSize:12, color:'var(--apple-text2)' }}>
                            {/* המחשבון של אופק שואל גם דרגת השכלה וגם דרגה
                                באופק, והדרגה שם אפילו נעולה עד שנבחר תואר.
                                קודם הוצגה למורת אופק הדרגה בלבד. */}
                            {isPrincipalRow(t) ? 'ניהול' : reformLabel(t.reform)} · {DEGREE_LABELS[t.degree] || t.degree}
                            {isPrincipalRow(t)
                              ? (nihulLabel(t.nihulGrade) ? ` · דרגת ניהול ${nihulLabel(t.nihulGrade)}` : ' · חסרה דרגת ניהול')
                              : t.reform === 'ofek' ? ` · דרגה ${t.grade}` : ''} · {t.seniority} שנות ותק
                            {(t.childrenUnder18 || 0) > 0 && (
                              <span style={{ color:'var(--purple)', fontWeight:600 }}>
                                {` · ${t.childrenUnder18} ילדים עד 18`}
                                {momBonusEligible(t) ? ` · תוספת אם +${MOM_SCOPE_BONUS} למשרה` : ''}
                              </span>
                            )}
                          </p>
                        </div>
                        <div style={{ textAlign:'left', flexShrink:0 }}>
                          <p style={{ fontSize:11, color:'var(--apple-text3)', marginBottom:1 }}>הערכה</p>
                          {/* למנהלת אין אומדן פנימי: אין בידינו את סולם הניהול,
                              והמספר מגיע מהמחשבון הניהולי בלבד. */}
                          <p style={{ fontSize:13, fontWeight:600, fontFamily:'monospace', color:'var(--apple-text2)' }}>
                            {awaitingSim(t) ? 'לפי המחשבון' : `${est.toLocaleString()} ₪`}
                          </p>
                        </div>
                      </div>
                      {isActive && (
                        <>
                        {/* מה שהמחשבון הרשמי שואל. בלי זה אין לחשבת מסך אחר
                            לפתוח — אין לה גישה לכרטיס המורה ולא לבית הספר. */}
                        <div style={{
                          display:'flex', flexWrap:'wrap', gap:'5px 7px', marginBottom:10, paddingBottom:10,
                          borderBottom:'1px solid var(--line-soft, #EDE8F8)',
                        }}>
                          {[
                            ['% משרה',   `${(isOfek ? dh?.scopePct : null) ?? t.scopePct ?? t.scope ?? 100}%`],
                            // מחנכת בעולם ישן משולמת על שלוש שעות מעל מה
                            // שהיא מלמדת. בלי לומר זאת, המספר במחשבון אינו
                            // מסתדר עם מה שהמנהלת הזינה.
                            ['פרונטלי',  homeroomHours(t)
                              ? `${t.frontalHours ?? 0} ש' + ${homeroomHours(t)} למחנכת`
                              : `${dh?.frontal ?? t.frontalHours ?? 0} ש'`],
                            // פרטני ושהייה נגזרים מהשלב, מקבוצת הגיל ומאחוז
                            // המשרה — המחשבון של אופק שואל את שניהם.
                            ['פרטני',    dh ? `${dh.individual} ש'` : null],
                            ['שהייה',    dh ? `${dh.presence} ש'`   : null],
                            ['שלב',      LEVELS[t.level]?.label],
                            ['גיל',      t.ageGroup && t.ageGroup !== 'none' ? AGE_RED[t.ageGroup]?.label : null],
                            ['גמול',     t.role && t.role !== 'none' ? ROLES.find(r => r.id === t.role)?.label.split('(')[0].trim() : null],
                            // מחשבון הניהול שואל דרגת ניהול ורמת מורכבות —
                            // שני שדות שאין להם מקבילה אצל מורה.
                            ['דרגת ניהול', isPrincipalRow(t) ? (nihulLabel(t.nihulGrade) || 'חסרה') : null],
                            ['מורכבות',    isPrincipalRow(t) ? String(school.murkavut ?? 1) : null],

                            // מחנכת בעולם ישן: המחשבון מטפל בגמול דרך השדה
                            // "כיתת חינוך (תוספת חינוך)", בשווי 3 שעות.
                            // שני דברים נפרדים שמצטברים: שלוש השעות שנכנסות
                            // לאחוז המשרה, וגמול החינוך שנקבע בטופס עצמו —
                            // במקטע "חינוך כיתה", שמקופל בברירת מחדל ומי
                            // שאינו יודע שהוא שם אינו פותח אותו.
                            ['גמול חינוך', t.reform === 'pre' && /^homeroom/.test(t.role || '')
                              ? `${ROLES.find(r => r.id === t.role)?.pct}% — לפתוח "חינוך כיתה" בטופס ולסמן כיתה`
                              : null],
                            // תוספת אם אינה קיימת במחשבון. היא מתווספת
                            // אצלנו על התוצאה, ואין מה להקליד עבורה.
                            ['תוספת אם', momBonusEligible(t)
                              ? `+${MOM_SCOPE_BONUS} נק׳ למשרה — כבר בתוך ה-% למעלה`
                              : null],
                            ['סטטוס',    onLeave(t) ? leaveText(t) : null],
                          ].filter(([, v]) => v).map(([k, v]) => (
                            <span key={k} style={{
                              fontSize:11, padding:'3px 8px', borderRadius:999,
                              background:'var(--fill2, #F0EDF8)', color:'var(--text2, #4A3F6B)',
                              whiteSpace:'nowrap',
                            }}>
                              <span style={{ opacity:.65 }}>{k} </span><b style={{ fontWeight:700 }}>{v}</b>
                            </span>
                          ))}
                          {/* ילדים עד 18 פותחים תוספת אם, והיא משנה את אחוז
                              המשרה שמוקלד למחשבון. צריך לדעת אותם לפני
                              החישוב, ולכן השדה כאן ולא רק בכרטיס העובדת. */}
                          <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11,
                            padding:'2px 8px', borderRadius:999, background:'var(--purple-100, #EDE8F8)',
                            color:'var(--purple, #4B2E83)', whiteSpace:'nowrap' }}
                            onClick={e => e.stopPropagation()}>
                            <span style={{ opacity:.75 }}>ילדים עד 18</span>
                            <input type="number" min="0" max="20" dir="ltr"
                              defaultValue={t.childrenUnder18 ?? 0}
                              onClick={e => e.stopPropagation()}
                              onBlur={e => {
                                const n = Math.max(0, Number(e.target.value) || 0);
                                if (n !== (t.childrenUnder18 ?? 0)) onSaveKids?.(t.id, n);
                              }}
                              style={{ width:38, textAlign:'center', fontWeight:700, fontSize:11.5,
                                border:'1px solid var(--purple, #4B2E83)', borderRadius:6, padding:'1px 3px',
                                background:'#fff', color:'inherit', fontFamily:'inherit' }} />
                            {momBonusEligible(t) && <b style={{ fontWeight:700 }}>+{MOM_SCOPE_BONUS} למשרה</b>}
                          </span>
                        </div>
                        {needsTwo ? (
                          <>
                            {/* שלב 1 — העולם הישן. זה מה שרץ במערכת התשלומים. */}
                            <SimStep
                              n={1} label="עולם ישן — בסיס" calcLabel="מחשבון העולם הישן"
                              active={calc === 'old'} onFocus={() => setCalc('old')}
                              value={preVal}
                              onChange={v => setPreInputs(prev => ({ ...prev, [t.id]: v }))}
                              onEnter={() => { setCalc(step2Calc); step2Ref.current?.focus(); step2Ref.current?.select(); }}
                              autoFocus={!preVal}
                              inputRef={step1Ref}
                            />
                            {/* שלב 2 — האופק. הפער בין השניים הוא רכיב התוספת. */}
                            <SimStep
                              n={2} label={step2Label} calcLabel={`מחשבון ${step2Label}`}
                              active={calc === step2Calc} onFocus={() => setCalc(step2Calc)}
                              value={mainVal}
                              onChange={v => setInputs(prev => ({ ...prev, [t.id]: v }))}
                              onEnter={() => handleSave(t)}
                              autoFocus={!!preVal && !mainVal}
                              inputRef={step2Ref}
                            />
                          </>
                        ) : (
                          <div style={{ marginBottom:8 }}>
                            <p className="apple-label" style={{ marginBottom:4 }}>שכר משולב — מחשבון {step2Label}</p>
                            <input type="number" className="apple-input" dir="ltr" autoFocus
                              placeholder={`שכר משולב ממחשבון ${step2Label}`}
                              value={mainVal}
                              onChange={e => setInputs(prev => ({ ...prev, [t.id]: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && handleSave(t)}
                              style={{ fontSize:14 }} />
                          </div>
                        )}

                        {/* הפער מתעדכן חי מול מה שהוקלד */}
                        {needsTwo && preVal && mainVal && (
                          <div style={{ background:'var(--purple-100)', border:'1px solid #D8CEEF', borderRadius:10, padding:'8px 11px', marginBottom:8, fontSize:12.5 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', color:'var(--text2)' }}>
                              <span>תוספת בית חב"ד</span>
                              <span className="num" style={{ fontWeight:800, color:'var(--purple)' }}>
                                {Math.max(0, Number(mainVal) - Number(preVal)).toLocaleString('he-IL')} ₪
                              </span>
                            </div>
                            {Number(mainVal) < Number(preVal) && (
                              <p style={{ fontSize:11, color:'var(--warn)', marginTop:4 }}>
                                האופק נמוך מהעולם הישן — התוספת 0, והעובדת נשארת עם שכר העולם הישן.
                              </p>
                            )}
                          </div>
                        )}

                        <button className="apple-btn" onClick={() => handleSave(t)}
                          disabled={!mainVal || (needsTwo && !preVal)}
                          title={needsTwo && !preVal ? 'נדרשות שתי הסימולציות' : undefined}
                          style={{
                            width:'100%', fontSize:13.5, minHeight:38,
                            background: wasSaved ? 'var(--ok)' : (mainVal && (!needsTwo || preVal)) ? 'var(--purple)' : 'var(--fill2)',
                            color: (wasSaved || (mainVal && (!needsTwo || preVal))) ? '#fff' : 'var(--text3)',
                          }}>
                          {wasSaved ? <Check size={15} strokeWidth={2.8} /> : 'שמור'}
                        </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop:'1px solid var(--apple-fill2)', background:'var(--apple-surface)', padding:'10px 16px' }}>
          <p style={{ fontSize:12, color:'var(--text3)', textAlign:'center', lineHeight:1.6 }}>
            למורת אופק: קודם עולם ישן, אחריו אופק · Enter עובר לשלב הבא ומהשלב האחרון שומר
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   APP
═══════════════════════════════════════════════════════════════ */
function BackupModal({ schools, months, onClose }) {
  const [done, setDone] = useState('');

  const teacherRecords = Object.values(months).reduce((s, ts) => s + ts.length, 0);
  const monthKeys = Object.keys(months).sort();

  const handleExport = () => {
    setDone('');
    const c = exportBackup(schools, months);
    setDone(`הגיבוי ירד — ${c.schools} בתי ספר, ${c.months} חודשים, ${c.teacherRecords} רשומות עובדי הוראה.`);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(6px)', overflowY:'auto' }} dir="rtl">
      <div className="apple-card spring-enter" style={{ width:'100%', maxWidth:440, padding:24, margin:'auto' }}>

        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:18 }}>
          <div>
            <h2 style={{ fontSize:18, fontWeight:800, letterSpacing:'-0.02em', color:'var(--text)', marginBottom:3 }}>ייצוא נתונים</h2>
            <p style={{ fontSize:12.5, color:'var(--text3)', lineHeight:1.5 }}>הנתונים שמורים בשרת ומשותפים לכל המשתמשות. הייצוא כאן הוא עותק לעיון — לא נדרש לגיבוי.</p>
          </div>
          <button onClick={onClose} title="סגירה" style={{ background:'var(--fill)', border:'none', borderRadius:'50%', width:30, height:30, cursor:'pointer', color:'var(--text3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>

      <div style={{ background:'var(--warn-bg)', border:'1px solid var(--warn-line)', borderRadius:12, padding:'11px 13px', marginBottom:16, display:'flex', gap:9 }}>
        <ShieldAlert size={16} strokeWidth={2.2} color="var(--warn)" style={{ flexShrink:0, marginTop:1 }} />
        <p style={{ fontSize:12.5, color:'var(--warn)', lineHeight:1.6 }}>
          ניקוי היסטוריית הדפדפן או מחיקת נתוני האתר ימחקו את כל תקציב השכר — ואין דרך לשחזר בלי קובץ גיבוי.
        </p>
      </div>

      <div className="apple-section" style={{ marginBottom:14 }}>
        <p style={{ fontSize:12.5, color:'var(--text2)', marginBottom:10, lineHeight:1.6 }}>
          במערכת כרגע: <strong style={{ color:'var(--text)' }}>{schools.length}</strong> בתי ספר ·{' '}
          <strong style={{ color:'var(--text)' }}>{teacherRecords}</strong> רשומות עובדי הוראה ·{' '}
          <strong style={{ color:'var(--text)' }}>{monthKeys.length}</strong> חודשים
          {monthKeys.length > 0 && ` (${fmtMonth(monthKeys[0])} — ${fmtMonth(monthKeys[monthKeys.length-1])})`}
        </p>
        <button className="apple-btn apple-btn-blue" onClick={handleExport} style={{ width:'100%' }}>
          <Download size={15} strokeWidth={2.2} />
          ייצוא גיבוי מלא
        </button>
      </div>

      {done && (
        <div style={{ background:'var(--ok-bg)', border:'1px solid var(--ok-line)', borderRadius:12, padding:'10px 13px', marginTop:14, fontSize:13, color:'var(--ok)', fontWeight:600, display:'flex', gap:7, alignItems:'center' }}>
          <Check size={15} strokeWidth={2.6} />
          {done}
        </div>
      )}

        <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ width:'100%', marginTop:16 }}>סגירה</button>
      </div>
    </div>
  );
}


/* ═════════════════════════════════════════════════════════════
   מסך הקישור האישי

   מנהלת שנכנסת בקישור אינה מחוברת: אין לה session, אין auth.uid(),
   והטבלאות סגורות בפניה. כל מה שהמסך הזה רואה ושומר עובר דרך ארבע
   פונקציות שמאמתות את הקוד בעצמן, ולכן הוא נבנה בנפרד ולא כווריאציה
   של מסך בית הספר — אין לו את מה שמסך בית הספר נשען עליו.

   הקוד חי בכתובת בלבד ואינו נשמר בדפדפן: מי שסוגר את הלשונית צריך
   את הקישור מחדש. זה מכוון — הקישור הוא כל ההגנה.
═════════════════════════════════════════════════════════════ */
function LinkField({ label, value, onChange, type = 'number', hint }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:3, flex:'1 1 96px', minWidth:96 }}>
      <span style={{ fontSize:11, fontWeight:600, color:'var(--text3)' }}>{label}</span>
      <input
        type={type} inputMode={type === 'number' ? 'numeric' : undefined}
        className="apple-input" dir={type === 'text' ? 'rtl' : 'ltr'}
        value={type === 'date' ? String(value ?? '').slice(0, 10) : (value ?? '')} placeholder={hint}
        onChange={e => onChange(type === 'number'
          ? (e.target.value === '' ? null : Number(e.target.value))
          : e.target.value)}
        style={{ fontSize:15, minHeight:42, textAlign: type === 'number' ? 'center' : 'right' }} />
    </label>
  );
}

function LinkSelect({ label, value, onChange, options }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:3, flex:'1 1 120px', minWidth:120 }}>
      <span style={{ fontSize:11, fontWeight:600, color:'var(--text3)' }}>{label}</span>
      <select className="apple-select" value={value ?? ''} onChange={e => onChange(e.target.value)}
        style={{ fontSize:15, minHeight:42 }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/*
  שדות הבסיס שהמנהלת ממלאת. שינוי בכל אחד מהם מבטל את הסימולציה
  ומחזיר את המורה לחשבת השכר — זה נאכף בשרת, וכאן רק נאמר.
*/
function LinkTeacherFields({ draft, apply }) {
  const isOfek = draft.reform === 'ofek';
  return (
    <>
      <div style={{ display:'flex', flexWrap:'wrap', gap:9, marginBottom:9 }}>
        <LinkField label="שם עובד/ת ההוראה" type="text" value={draft.name} onChange={v => apply({ name: v })} hint="שם מלא" />
        <LinkField label="ת.ז." type="text" value={draft.tzId} onChange={v => apply({ tzId: v })} hint="9 ספרות" />
        <LinkField label="טלפון *" type="text" value={draft.phone} onChange={v => apply({ phone: v })} hint="05x-xxxxxxx" />
        <LinkField label="מייל *" type="text" value={draft.email} onChange={v => apply({ email: v })} hint="name@example.com" />
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:9, marginBottom:9 }}>
        <LinkSelect label="מסלול" value={draft.reform} onChange={v => apply({ reform: v })}
          options={REFORMS.map(r => [r.id, r.label])} />
        <LinkSelect label="תואר" value={draft.degree || 'BA'} onChange={v => apply({ degree: v })}
          options={Object.entries(DEGREE_LABELS)} />
        {isOfek && !isPrincipalRow(draft) && (
          <LinkSelect label="דרגה באופק" value={String(draft.grade ?? 1)} onChange={v => apply({ grade: v })}
            options={[1,2,3,4,5,6,7,8,9].map(g => [String(g), `דרגה ${g}`])} />
        )}
        {isPrincipalRow(draft) && (
          <LinkSelect label="דרגת ניהול" value={String(draft.nihulGrade ?? '')}
            onChange={v => apply({ nihulGrade: v ? Number(v) : null })}
            options={[['', 'יש לבחור'], ...NIHUL_GRADES.map(g => [String(g.v), `דרגה ${g.l}`])]} />
        )}
        <LinkField label="ותק בהוראה" value={draft.seniority} onChange={v => apply({ seniority: v })} />
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:9 }}>
        <LinkSelect label="שלב" value={draft.level || 'elementary'} onChange={v => apply({ level: v })}
          options={Object.entries(LEVELS).map(([k, v]) => [k, v.label])} />
        <LinkSelect label="קבוצת גיל" value={draft.ageGroup || 'none'} onChange={v => apply({ ageGroup: v })}
          options={Object.entries(AGE_RED).map(([k, v]) => [k, v.label])} />
        <LinkSelect label="גמול תפקיד" value={draft.gamulRole || draft.role || 'none'}
          onChange={v => apply({ role: v, ...principalDefaults({ ...draft, role: v }) })}
          options={ROLES.map(r => [r.id, r.label.split('(')[0].trim()])} />
        {/* תוספת אם היא רכיב של העולם הישן, אבל המספר עצמו נאסף תמיד:
            מסלול משתנה, וילד שלא נרשם אינו מתגלה אחר כך. */}
        <LinkField label="ילדים עד 18" value={draft.childrenUnder18}
          onChange={v => apply({ childrenUnder18: v })}
          hint={isOfek ? 'למידע' : 'לתוספת אם'} />
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:9, marginTop:9 }}>
        <LinkSelect label="סטטוס" value={draft.leaveType || 'none'}
          onChange={v => apply({ leaveType: v, ...(v === 'none' ? { leaveFrom: null, leaveTo: null } : {}) })}
          options={LEAVE_TYPES.map(x => [x.id, x.label])} />
        {onLeave(draft) && (
          <>
            <LinkField label="מתאריך" type="date" value={draft.leaveFrom} onChange={v => apply({ leaveFrom: v || null })} />
            <LinkField label="עד תאריך" type="date" value={draft.leaveTo} onChange={v => apply({ leaveTo: v || null })} hint="אם ידוע" />
          </>
        )}
      </div>
    </>
  );
}

/* עובד/ת הוראה חדש/ה — הרשימה מתמלאת בידי המנהלת, לא בידי הרשת */
// לשון הפנייה למי שמחזיק בקישור. ברירת המחדל נקבה — זה הרוב ברשת.
const heSaid = (male, f, m) => (male ? m : f);

function LinkNewCard({ schoolReform, onAdd, male }) {
  const blank = { ...EMPTY_TEACHER, reform: schoolReform || 'ofek', frontalHours: null, scopePct: 100, scope: 100 };
  const [open, setOpen]   = useState(false);
  const [draft, setDraft] = useState(blank);
  const [state, setState] = useState('');

  const apply = (patch) => {
    setState('');
    setDraft(prev => {
      // אחוז המשרה אינו נגזר מהשעות. הנוסחה שגזרה אותו שגתה, והרכזת
      // מזינה את האחוזים בעצמה עד שהיא תהיה נכונה.
      return { ...prev, ...patch };
    });
  };

  const add = async () => {
    if (!String(draft.name || '').trim()) { setState('יש למלא שם'); return; }
    if (!String(draft.phone || '').trim()) { setState('יש למלא טלפון — בלעדיו אי אפשר לשלוח את נתוני ההעסקה לחתימה'); return; }
    if (!String(draft.email || '').trim()) { setState('יש למלא מייל — בלעדיו אי אפשר לשלוח את נתוני ההעסקה לחתימה'); return; }
    setState('saving');
    try { await onAdd(draft); setDraft(blank); setOpen(false); setState(''); }
    catch (e) { setState(e.message); }
  };

  if (!open) return (
    <button className="apple-btn apple-btn-ghost" onClick={() => setOpen(true)}
      style={{ width:'100%', minHeight:46, borderStyle:'dashed' }}>
      <Plus size={16} strokeWidth={2.5} />
      הוספת עובד/ת הוראה
    </button>
  );

  return (
    <div className="apple-card" style={{ padding:'14px 15px', border:'1px dashed var(--purple)' }}>
      <p style={{ fontSize:14, fontWeight:700, color:'var(--purple)', marginBottom:10 }}>עובד/ת הוראה חדש/ה</p>
      <LinkTeacherFields draft={draft} apply={apply} />
      <div style={{ display:'flex', flexWrap:'wrap', gap:9, marginTop:9 }}>
        <LinkField label="שעות פרונטליות" value={draft.frontalHours} onChange={v => apply({ frontalHours: v })} />
        <LinkField label="ימי היעדרות"    value={draft.absenceDays}  onChange={v => apply({ absenceDays: v })} />
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:11 }}>
        <button className="apple-btn apple-btn-blue" disabled={state === 'saving'} onClick={add}
          style={{ minHeight:40, paddingInline:20 }}>
          {state === 'saving' ? heSaid(male, 'מוסיפה…', 'מוסיף…') : 'הוספה'}
        </button>
        <button className="apple-btn apple-btn-ghost" onClick={() => { setOpen(false); setDraft(blank); setState(''); }}
          style={{ minHeight:40 }}>ביטול</button>
        {state && state !== 'saving' && <span style={{ fontSize:12, color:'var(--danger)' }}>{state}</span>}
      </div>
    </div>
  );
}

function LinkCard({ teacher, locked, onSave }) {
  const [draft, setDraft] = useState(teacher);
  const [state, setState] = useState('');   // '' | 'saving' | 'saved' | הודעת שגיאה
  useEffect(() => { setDraft(teacher); }, [teacher]);

  const set = (k, v) => apply({ [k]: v });
  // אחוז המשרה אינו נגזר מהשעות. הנוסחה שגזרה אותו שגתה שלוש פעמים —
  // בסיס 26 במקום 30 בעולם ישן, גמול חינוך, תוספת אם — והרכזת מזינה
  // את האחוזים בעצמה עד שתהיה נכונה.
  const apply = (patch) => {
    setState('');
    setDraft(prev => ({ ...prev, ...patch }));
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(teacher);

  const save = async () => {
    if (!String(draft.phone || '').trim()) { setState('יש למלא טלפון'); return; }
    if (!String(draft.email || '').trim()) { setState('יש למלא מייל'); return; }
    setState('saving');
    try {
      // צילום "לפני" — בלעדיו השליח מתבקש לאשר שכר בלי לראות מה זז.
      // במסלול המחובר הצילום נלקח ב-onSaveTeacher; כאן הוא נשכח, ושורה
      // ששונתה דרך הקישור הופיעה אצלו בלי שום סימן שינוי.
      await onSave({ ...draft, _snapshot: teacher._snapshot || snapT(teacher) });
      setState('saved');
      setTimeout(() => setState(x => (x === 'saved' ? '' : x)), 2500);
    } catch (e) { setState(e.message); }
  };

  return (
    <div className="apple-card" style={{ padding:'14px 15px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8, marginBottom:10 }}>
        <p style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{teacher.name}</p>
        <span style={{ fontSize:11.5, color:'var(--text3)' }}>
          {reformLabel(draft.reform)}{draft.scopePct ? ` · ${draft.scopePct}% משרה` : ''}
          {onLeave(teacher) && (
            <span className="apple-badge badge-orange" style={{ fontSize:10.5, padding:'2px 8px', marginInlineStart:6 }}>
              {leaveText(teacher)}
            </span>
          )}
        </span>
      </div>

      <LinkTeacherFields draft={draft} apply={apply} />

      <div style={{ display:'flex', flexWrap:'wrap', gap:9, marginTop:9 }}>
        <LinkField label="שעות פרונטליות" value={draft.frontalHours} onChange={v => apply({ frontalHours: v })} />
        <LinkField label="ימי היעדרות"    value={draft.absenceDays}   onChange={v => set('absenceDays', v)} />
        <LinkField label={'שעות ממ' + '"' + 'מ'} value={draft.mmHours} onChange={v => set('mmHours', v)} />
        <LinkField label="במקום מי" type="text" value={draft.mmFor}   onChange={v => set('mmFor', v)} hint="שם עובד/ת ההוראה" />
        <LinkField label="תוספות החודש"   value={draft.monthlyExtras} onChange={v => set('monthlyExtras', v)} />
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:11 }}>
        <button className="apple-btn apple-btn-blue" disabled={!dirty || locked || state === 'saving'}
          onClick={save} style={{ minHeight:40, paddingInline:20, opacity: (!dirty || locked) ? .45 : 1 }}>
          {state === 'saving' ? 'שומר…' : 'שמירה'}
        </button>
        {state === 'saved' && <span style={{ fontSize:12.5, color:'var(--ok)', fontWeight:600 }}>✓ נשמר</span>}
        {state && state !== 'saving' && state !== 'saved' &&
          <span style={{ fontSize:12, color:'var(--danger)' }}>{state}</span>}
        {!dirty && !state && <span style={{ fontSize:11.5, color:'var(--text3)' }}>אין שינוי</span>}
      </div>
    </div>
  );
}

function LinkView({ code }) {
  const [me,      setMe]      = useState(null);
  const male = me?.gender === 'm';
  const [months,  setMonths]  = useState([]);
  const [month,   setMonth]   = useState('');
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [fatal,   setFatal]   = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const who = await store.linkWhoami(code);
        const ms  = await store.linkMonths(code);
        if (!alive) return;
        setMe(who);
        setMonths(ms);
        setMonth(ms.length ? ms[ms.length - 1].key : '');
        if (!ms.length) setLoading(false);
      } catch (e) { if (alive) { setFatal(e.message); setLoading(false); } }
    })();
    return () => { alive = false; };
  }, [code]);

  useEffect(() => {
    if (!month) return undefined;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await store.linkRows(code, month);
        if (alive) setRows(r);
      } catch (e) {
        if (alive) setFatal(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [code, month]);

  const locked = months.find(m => m.key === month)?.locked;

  const onSave = async (draft) => {
    const saved = await store.linkSaveRow(code, draft);
    if (saved) setRows(rs => rs.map(r => (r.id === saved.id ? saved : r)));
  };
  const onAdd = async (draft) => {
    if (!month) throw new Error('עוד לא נפתח חודש במערכת. פנו לרשת.');
    const added = await store.linkAddRow(code, month, draft);
    if (added) setRows(rs => [...rs, added]);
  };

  if (fatal) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }} dir="rtl">
      <div className="apple-card" style={{ padding:26, maxWidth:380, textAlign:'center' }}>
        <p style={{ fontSize:16, fontWeight:700, color:'var(--danger)', marginBottom:8 }}>{fatal}</p>
        <p style={{ fontSize:13, color:'var(--text3)' }}>פנו לרשת לקבלת קישור חדש.</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }} dir="rtl">
      <header style={{ background:'#fff', borderBottom:'1px solid var(--line)', position:'sticky', top:0, zIndex:20 }}>
        <div style={{ maxWidth:760, margin:'0 auto', padding:'13px 16px' }}>
          {/* לוגו וכותרת: המנהלת מגיעה לכאן מקישור בוואטסאפ, בלי מסך
              התחברות ובלי הקשר. בלעדיהם היא לא יודעת של מי המסך. */}
          <div style={{ display:'flex', alignItems:'center', gap:11, marginBottom:10 }}>
            <img src="/logo-chabad.png" alt="רשת חינוך חב״ד"
              style={{ height:38, width:'auto', objectFit:'contain', flexShrink:0 }} />
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:14.5, fontWeight:800, color:'var(--text)', lineHeight:1.25 }}>מערכת שכר עובדי הוראה</p>
              <p style={{ fontSize:11.5, color:'var(--text3)', lineHeight:1.3 }}>רשת חינוך חב״ד</p>
            </div>
          </div>
          <p style={{ fontSize:16, fontWeight:800, color:'var(--text)' }}>{me?.schoolName || 'טוען…'}</p>
          <p style={{ fontSize:12.5, color:'var(--text3)', marginTop:1 }}>
            {me?.fullName}{me ? ' · הזנת נתוני העסקה' : ''}
          </p>
          {/* חודש אחד, כטקסט. בורר הזמין מילוי לחודש שכבר נסגר, וחשף
              כל חודש שקיים במסד — כולל חודשי בדיקה. */}
          {month && (
            <p style={{ fontSize:12.5, fontWeight:700, color:'var(--purple)', marginTop:8,
              background:'var(--purple-100)', border:'1px solid #D8CEEF', borderRadius:999,
              display:'inline-block', padding:'3px 12px' }}>
              {fmtMonth(month)}
            </p>
          )}
        </div>
      </header>

      <main style={{ maxWidth:760, margin:'0 auto', padding:'16px 16px 40px' }}>
        {locked && (
          <div style={{ background:'var(--warn-bg)', border:'1px solid var(--warn)', borderRadius:12, padding:'11px 14px', marginBottom:14 }}>
            <p style={{ fontSize:13, fontWeight:600, color:'var(--warn)' }}>החודש נעול — אי אפשר לשנות נתונים.</p>
          </div>
        )}

        {loading ? (
          <p style={{ fontSize:14, color:'var(--text3)', textAlign:'center', padding:'40px 0' }}>טוען…</p>
        ) : !rows.length ? (
          <>
            <div className="apple-card" style={{ padding:24, textAlign:'center', marginBottom:12 }}>
              <p style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:6 }}>אין עדיין עובדי הוראה בחודש הזה</p>
              <p style={{ fontSize:13, color:'var(--text3)' }}>
                {heSaid(male, 'הוסיפי', 'הוסף')} את עובדי ההוראה של בית הספר — כולל {heSaid(male, 'את עצמך', 'אותך')}.
                שם, ת.ז., מסלול, ותק ושעות. {heSaid(male, 'הצמדי', 'הצמד')} למספר השעות שאושר בבניית התקציב.
              </p>
            </div>
            {!locked && <LinkNewCard schoolReform={me?.schoolReform} onAdd={onAdd} male={male} />}
          </>
        ) : (
          <>
            <p style={{ fontSize:12.5, color:'var(--text3)', marginBottom:11 }}>
              {rows.length} עובדי הוראה · שינוי בוותק, בדרגה, בתואר או בשעות מחזיר לחישוב שכר מחדש
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
              {rows.map(t => <LinkCard key={t.id} teacher={t} locked={locked} onSave={onSave} />)}
              {!locked && <LinkNewCard schoolReform={me?.schoolReform} onAdd={onAdd} male={male} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  // ?k=<קוד> — מנהלת שנכנסה מהקישור שנשלח אליה בוואטסאפ. נקרא פעם אחת,
  // לפני כל אתחול אחר: המסלול הזה אינו עובר דרך התחברות כלל.
  const [linkCode] = useState(() => new URLSearchParams(window.location.search).get('k') || '');
  const [user,    setUser]    = useState(null);   // הפרופיל: תפקיד, שם, בית ספר
  const [schools, setSchools] = useState([]);
  const [approvers, setApprovers] = useState([]);   // מי מאשרת כל בית ספר
  const [months,  setMonths]  = useState({});
  const [activeMonth, setActiveMonth] = useState(nowMonthKey());
  const [booting, setBooting] = useState(true);
  const [error,   setError]   = useState('');
  const [busy,    setBusy]    = useState(false);

  const [view,          setView]          = useState('schools');
  const [activeSchool,  setActiveSchool]  = useState(null);
  const [schoolModal,   setSchoolModal]   = useState(null);
  const [teacherModal,  setTeacherModal]  = useState(null);
  const [showApproval,  setShowApproval]  = useState(false);
  const [showBackup,    setShowBackup]    = useState(false);

  // כל שינוי נשמר בשרת ואז נטען מחדש. פשוט, ותמיד מסונכרן עם מה שבאמת נשמר.
  const refresh = useCallback(async () => {
    const data = await store.loadAll();
    setSchools(data.schools);
    setApprovers(data.approvers || []);
    setMonths(data.months);
    setActiveMonth(prev => {
      const keys = Object.keys(data.months).sort();
      if (keys.includes(prev)) return prev;
      return keys.length ? keys[keys.length - 1] : nowMonthKey();
    });
    return data;
  }, []);

  // פעולה מול השרת: חוסמת כפילויות, מרעננת, ומציגה שגיאה בעברית
  const run = useCallback(async (fn) => {
    setBusy(true); setError('');
    try {
      await fn();
      await refresh();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  // המאשרת הרשתית נדרשת בחודש הראשון בלבד, ולכן היא נוחתת עליו — לא על
  // החודש הקלנדרי, שבו אין לה מה לעשות ושבו המסך אמר לה "אין צורך".
  const landOnFirstMonth = useCallback((profile, data) => {
    if (profile?.role !== 'network') return;
    const keys = Object.keys(data?.months || {}).sort();
    if (keys.length) setActiveMonth(keys[0]);
  }, []);

  // התחברות קיימת מהפעם הקודמת
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const session = await store.getSession();
        if (!session) { if (alive) setBooting(false); return; }
        const profile = await store.getProfile();
        if (!alive) return;
        setUser(profile);
        setView(profile.role === 'clerk' ? 'calc' : profile.role === 'network' ? 'netapprove' : 'schools');
        const data = await refresh();
        landOnFirstMonth(profile, data);
      } catch (e) {
        // התחברות שהצליחה אבל אין לה פרופיל (בעיקר חשבון גוגל שאינו
        // מוגדר) הותירה session תקוע והחזירה למסך ההתחברות בלי מילה.
        // מנתקים, ומעבירים את ההסבר למסך עצמו.
        await store.signOut().catch(() => {});
        if (alive) setError(e.message);
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => { alive = false; };
  }, [refresh, landOnFirstMonth]);

  const onSignedIn = async (profile) => {
    setUser(profile);
    setView(profile.role === 'clerk' ? 'calc' : profile.role === 'network' ? 'netapprove' : 'schools');
    setBusy(true); setError('');
    try { landOnFirstMonth(profile, await refresh()); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const onSignOut = async () => {
    await store.signOut();
    setUser(null); setSchools([]); setMonths({}); setActiveSchool(null);
  };

  // הקישור עוקף את מסך ההתחברות לגמרי — אין למחזיקה בו session להמתין לו
  if (linkCode) return <LinkView code={linkCode} />;

  if (booting) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }} dir="rtl">
        <p style={{ fontSize:14, color:'var(--text3)', fontWeight:600 }}>טוען…</p>
      </div>
    );
  }

  if (!user) return <LoginScreen onSignedIn={onSignedIn} initialError={error} />;

  const teachers = months[activeMonth] || [];

  const onNetApprove = (ids) => run(() => store.netApprove(ids));

  // ── חודש חדש ──
  const openNewMonth = () => {
    // כשאין עדיין אף חודש, פותחים את החודש הנוכחי ולא את הבא אחריו —
    // אחרת החודש הראשון במערכת מדלג על עצמו.
    const hasAny  = Object.keys(months).length > 0;
    const nextKey = hasAny ? nextMonthKey(activeMonth) : nowMonthKey();
    if (months[nextKey]) { setActiveMonth(nextKey); return; }
    // חודש חדש הוא העתק של הקודם: כל מה שלא השתנה נשאר, כולל
    // הסימולציות — אחרת חשבת השכר מקלידה מחדש כל חודש את אותם
    // מספרים בדיוק. מתאפס רק מה שבאמת שייך לחודש עצמו: היעדרויות,
    // ממ"מ, תוספות והאישורים. השכר בפועל מגיע מהנהלת החשבונות לכל
    // חודש בנפרד, ולכן גם הוא מתאפס.
    const carried = teachers.map(t => ({
      ...t,
      absenceDays: 0, mmHours: 0, mmFor: '', monthlyExtras: 0,
      _actualEmployerCost: null,
      _approved: false, _approvedAt: null,
      _netApproved: false, _netApprovedAt: null, _snapshot: null,
      _changedAt: new Date().toISOString(),
    }));
    run(async () => { await store.openMonth(nextKey, carried); }).then(ok => { if (ok) setActiveMonth(nextKey); });
  };

  const onSaveSchool = (s) => {
    // בית ספר חדש נוצר עם שורת מנהלת בחודש הפעיל. בלי חודש, בית הספר
    // נכתב והשורה נכשלה — בית ספר יתום שלא הופיע ברשימה, ועוד אחד
    // בכל לחיצה נוספת.
    if (!s.id && !Object.keys(months).length) {
      setError('לפני הוספת בית ספר יש ללחוץ "פתיחת המערכת" — בית ספר חדש נוצר עם שורת מנהלת בחודש הפעיל.');
      return Promise.resolve(false);
    }
    return run(async () => {
      const saved = await store.saveSchool(s);
      if (!s.id) await store.saveTeacher(makePrincipalRow(saved), activeMonth);
    }).then(ok => { if (ok) setSchoolModal(null); return ok; });
  };

  const onDeleteSchool = (id) => run(() => store.deleteSchool(id));

  // שינוי בשדה שמשפיע על השכר מבטל את הסימולציה ואת האישור, ושומר
  // צילום "לפני" לשליח. הלוגיקה הזו נשארת בצד הלקוח כי היא נגזרת
  // מהשוואה בין הישן לחדש, והשרת רואה רק את התוצאה.
  const onSaveTeacher = (t) => {
    const now = new Date().toISOString();
    const old = teachers.find(x => x.id === t.id);
    let next = { ...t };
    if (old) {
      if (baseFieldsChanged(t, old)) {
        next._officialGross    = null;
        next._officialGrossPre = null;
        next._changedAt        = now;
        next._approved         = false;
        next._netApproved      = false;
        if (!old._snapshot) next._snapshot = snapT(old);
      }
      // סימולציה שנמחקה אחרי האישור (עריכה מהירה של השליח) מחזירה את
      // השורה לתור — אחרת היא הגיעה לאישור רשתי עם בסיס 0.
      if (simComplete(old) && !simComplete(next)) {
        next._changedAt   = now;
        next._approved    = false;
        next._netApproved = false;
      }
    } else {
      next._changedAt = now;
      next._approved  = false;
    }
    return run(() => store.saveTeacher(next, activeMonth))
      .then(ok => { if (ok) setTeacherModal(null); return ok; });
  };
  const onDeleteTeacher = (id) => run(() => store.deleteTeacher(id));

  const onImportTeachers = (ts) => run(async () => {
    for (const x of ts) await store.saveTeacher({ ...x, id: null, _changedAt: new Date().toISOString() }, activeMonth);
  });

  const onApproveTeacher = (id) => run(async () => {
    await store.approve([id]);
    // האישור סוגר את מחזור השינוי: אין עוד "ממתין", ואין diff להציג
    await store.saveTeacher({ id, _snapshot: null, _changedAt: null }, activeMonth);
  });
  const onApproveAll = () => {
    const ids = teachers.filter(needsApproval).map(t => t.id);
    if (!ids.length) { setShowApproval(false); return; }
    run(async () => {
      await store.approve(ids);
      for (const id of ids) await store.saveTeacher({ id, _snapshot: null, _changedAt: null }, activeMonth);
    }).then(ok => { if (ok) setShowApproval(false); });
  };

  const isCoord = user.role === 'coordinator';
  const isClerk = user.role === 'clerk';
  const isNetApprover = user.role === 'network';
  // האישור הרשתי נדרש בחודש הראשון שנפתח במערכת
  const firstMonthKey = Object.keys(months).sort()[0] || activeMonth;
  const isFirstMonth  = activeMonth === firstMonthKey;
  const netPendingCount = teachers.filter(t => needsNetApproval(t, isFirstMonth)).length;
  // לשליח: כמה אצל מי. "אצל רינה" היה שקר על עפולה ורעננה.
  const netPendingBy = {};
  for (const t of teachers) {
    if (!needsNetApproval(t, isFirstMonth)) continue;
    const who = approverFor(approvers, t.schoolId).name;
    netPendingBy[who] = (netPendingBy[who] || 0) + 1;
  }
  const netPendingTitle = Object.entries(netPendingBy).map(([who, n]) => `${n} אצל ${who}`).join(' · ');
  // למאשרת: מה מחכה לה בחודש הראשון, גם כשהיא עומדת על חודש אחר
  const firstMonthPending = (months[firstMonthKey] || []).filter(t => needsNetApproval(t, true)).length;

  const needsSimCount      = teachers.filter(needsSim).length;
  const needsApprovalCount = teachers.filter(needsApproval).length;
  const sortedMonthKeys    = Object.keys(months).sort();

  // Principal goes directly to their school
  const principalSchool = user.role === 'principal' ? schools.find(s => s.id === user.schoolId) : null;

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }} dir="rtl">

      <header className="app-header no-print">
        <div style={{ maxWidth:1152, margin:'0 auto', padding:'0 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, minHeight:60, flexWrap:'wrap' }}>

          <div onClick={() => isCoord && setView('schools')}
            style={{ display:'flex', alignItems:'center', gap:11, cursor: isCoord ? 'pointer' : 'default', padding:'9px 0' }}>
            <img src="/logo-chabad.png" alt="לוגו רשת" style={{ height:36, width:'auto', objectFit:'contain' }} />
            <div>
              <p style={{ fontWeight:700, fontSize:14.5, color:'var(--text)', letterSpacing:'-0.01em', lineHeight:1.25 }}>מערכת שכר מורים</p>
              <p style={{ fontSize:11.5, color:'var(--text3)', lineHeight:1.3 }}>
                {isCoord ? 'שליח / מנהל רשת' : isClerk ? 'חשבת שכר' : isNetApprover ? `${user.name} · אישור רשתי${user.schoolId ? ' — ' + (schools.find(s => s.id === user.schoolId)?.name || '') : ''}` : `מנהלת: ${principalSchool?.name || ''}`}
                <span style={{ opacity:.55 }}>{` · גרסה ${BUILD}`}</span>
              </p>
            </div>
          </div>

          <div style={{ display:'flex', gap:5, alignItems:'center', flexWrap:'nowrap', overflowX:'auto', maxWidth:'100%', paddingBottom:2 }}>
            {isCoord && view !== 'schools' && (
              <button className="nav-btn" onClick={() => setView('schools')}>
                <ArrowRight size={15} strokeWidth={2.4} />
                ראשי
              </button>
            )}
            {isCoord && (
              <button className={`nav-btn ${view==='report' ? 'active' : ''}`} onClick={() => setView('report')}>
                <BarChart3 size={15} strokeWidth={2.2} />
                דוח רשת
              </button>
            )}
            {(isCoord || isClerk) && (
              <button className={`nav-btn ${view==='calc' ? 'active' : ''}`} onClick={() => setView('calc')} style={{ position:'relative' }}>
                <Calculator size={15} strokeWidth={2.2} />
                סימולציה
                {needsSimCount > 0 && (
                  <span style={{ background:'var(--warn-bg)', color:'var(--warn)', border:'1px solid var(--warn-line)',
                    fontSize:11, fontWeight:700, borderRadius:999, minWidth:19, height:19, padding:'0 5px',
                    display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                    {needsSimCount}
                  </span>
                )}
              </button>
            )}
            {isCoord && (
              <button
                className={`nav-btn ${needsApprovalCount > 0 ? 'active' : ''}`}
                onClick={() => setShowApproval(true)}
                style={needsApprovalCount > 0
                  ? { background:'var(--purple)', color:'#fff', boxShadow:'var(--shadow-btn)' }
                  : undefined}>
                <ClipboardCheck size={15} strokeWidth={2.2} />
                {needsApprovalCount > 0 ? `${needsApprovalCount} לאישור` : 'אישורים'}
              </button>
            )}

            {/* Month selector */}
            <div style={{ display:'flex', alignItems:'center', gap:2, background:'var(--fill)', border:'1px solid var(--line)', borderRadius:11, padding:'3px 4px', flexShrink:0 }}>
              <button title="חודש קודם"
                onClick={() => { const i=sortedMonthKeys.indexOf(activeMonth); if(i>0) setActiveMonth(sortedMonthKeys[i-1]); }}
                style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', display:'flex', padding:4, borderRadius:7 }}>
                <ChevronRight size={15} strokeWidth={2.5} />
              </button>
              {/* שני חצים בלי רשימה — עם עשרה חודשים אין דרך לקפוץ לחודש
                  מסוים, ואין סימן שיש לאן לחזור. */}
              {sortedMonthKeys.length > 1 ? (
                <select value={activeMonth} onChange={e => setActiveMonth(e.target.value)} title="בחירת חודש"
                  style={{ fontSize:12.5, fontWeight:700, color:'var(--text)', background:'none', border:'none',
                    cursor:'pointer', fontFamily:'inherit', textAlign:'center', minWidth:92, appearance:'auto' }}>
                  {sortedMonthKeys.map(k => (
                    <option key={k} value={k}>{fmtMonth(k)}{k === firstMonthKey ? ' · ראשון' : ''}</option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize:12.5, fontWeight:700, color:'var(--text)', minWidth:92, textAlign:'center' }}>{fmtMonth(activeMonth)}</span>
              )}
              <button title="חודש הבא"
                onClick={() => { const i=sortedMonthKeys.indexOf(activeMonth); if(i<sortedMonthKeys.length-1) setActiveMonth(sortedMonthKeys[i+1]); }}
                style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', display:'flex', padding:4, borderRadius:7 }}>
                <ChevronLeft size={15} strokeWidth={2.5} />
              </button>
              {isCoord && sortedMonthKeys.indexOf(activeMonth) === sortedMonthKeys.length-1 && (
                <button onClick={openNewMonth} title="פתיחת חודש חדש"
                  style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:11.5, padding:'4px 9px', background:'var(--teal)',
                    border:'none', borderRadius:8, color:'#fff', cursor:'pointer', fontWeight:700, fontFamily:'inherit', marginInlineStart:2 }}>
                  <Plus size={12} strokeWidth={3} />
                  {Object.keys(months).length ? 'חודש' : 'פתיחת המערכת'}
                </button>
              )}
            </div>

            {isCoord && netPendingCount > 0 && (
              <span className="apple-badge badge-orange" title={netPendingTitle}
                style={{ whiteSpace:'nowrap' }}>
                <ShieldCheck size={12} strokeWidth={2.3} />
                {Object.keys(netPendingBy).length === 1 ? netPendingTitle : `${netPendingCount} באישור רשתי`}
              </span>
            )}

            <button className="nav-btn" onClick={() => setShowBackup(true)} title="גיבוי ושחזור">
              <Database size={15} strokeWidth={2.2} />
              גיבוי
            </button>

            <button className="nav-btn danger" onClick={onSignOut} title="יציאה">
              <LogOut size={15} strokeWidth={2.2} />
              יציאה
            </button>
          </div>
        </div>
      </header>

      {(busy || error) && (
        <div className="no-print" style={{
          position:'sticky', top:62, zIndex:39, padding:'8px 16px', fontSize:13, fontWeight:600,
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          background: error ? 'var(--danger-bg)' : 'var(--teal-100)',
          color: error ? 'var(--danger)' : 'var(--teal-700)',
          borderBottom: `1px solid ${error ? 'var(--danger-line)' : '#B8EAF2'}`,
        }}>
          {error
            ? <><AlertTriangle size={14} strokeWidth={2.3} />{error}
                <button onClick={() => setError('')} className="apple-btn apple-btn-ghost"
                  style={{ minHeight:26, padding:'0 9px', fontSize:12, marginInlineStart:6 }}>סגירה</button></>
            : <>שומר…</>}
        </div>
      )}

      <div className="flex-1">
        {/* Clerk: only SimulatorView */}
        {isNetApprover ? (
          <NetworkApprovalView
            schools={schools}
            approvers={approvers}
            user={user}
            firstMonthKey={firstMonthKey}
            firstMonthLabel={fmtMonth(firstMonthKey)}
            firstMonthPending={firstMonthPending}
            onGoToMonth={setActiveMonth}
            teachers={teachers}
            isFirstMonth={isFirstMonth}
            monthLabel={fmtMonth(activeMonth)}
            onApprove={onNetApprove}
          />
        ) : isClerk ? (
          <SimulatorView
            teachers={teachers}
            schools={schools}
            activeMonth={activeMonth}
            userRole={user.role}
            userId={user.id}
            onSaveGross={(id, gross, grossPre) => run(() => store.saveSimulation(id, gross, grossPre))}
            onSaveActual={(id, amount) => run(() => store.saveActualCost(id, amount))}
            onSaveKids={(id, n) => run(() => store.saveTeacher({ id, childrenUnder18: n }, activeMonth))}
          />
        ) : /* Principal: see only their school */
        !isCoord && principalSchool ? (
          <SchoolView approvers={approvers} userId={user.id}
            school={principalSchool}
            teachers={teachers}
            userRole={user.role}
            onBack={null}
            onSaveTeacher={onSaveTeacher}
            onDeleteTeacher={null}
            onApproveTeacher={null}
            onImportTeachers={onImportTeachers}
            activeMonth={activeMonth}
            fmtMonthFn={fmtMonth}
            isFirstMonth={isFirstMonth}
          />
        ) : view === 'calc' ? (
          <SimulatorView
            teachers={teachers}
            schools={schools}
            activeMonth={activeMonth}
            userRole={user.role}
            userId={user.id}
            onSaveGross={(id, gross, grossPre) => run(() => store.saveSimulation(id, gross, grossPre))}
            onSaveActual={(id, amount) => run(() => store.saveActualCost(id, amount))}
            onSaveKids={(id, n) => run(() => store.saveTeacher({ id, childrenUnder18: n }, activeMonth))}
          />
        ) : view === 'report' ? (
          <ReportView schools={schools} teachers={teachers} />
        ) : view === 'school' && activeSchool ? (
          <SchoolView approvers={approvers} userId={user.id}
            school={activeSchool}
            teachers={teachers}
            userRole={user.role}
            onBack={() => setView('schools')}
            onSaveTeacher={onSaveTeacher}
            onDeleteTeacher={onDeleteTeacher}
            onApproveTeacher={onApproveTeacher}
            onImportTeachers={onImportTeachers}
            activeMonth={activeMonth}
            fmtMonthFn={fmtMonth}
            isFirstMonth={isFirstMonth}
          />
        ) : (
          /* Coordinator: schools list */
          <div style={{ maxWidth:1152, margin:'0 auto', padding:'24px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                  <span className="title-bar" />
                  <h2 style={{ fontSize:23, fontWeight:800, letterSpacing:'-0.025em', color:'var(--text)' }}>בתי הספר</h2>
                </div>
                <p style={{ fontSize:13, color:'var(--text3)', marginInlineStart:13 }}>{schools.length} בתי ספר ברשת</p>
              </div>
              <button className="apple-btn apple-btn-blue" onClick={() => setSchoolModal({ id:'', name:'', city:'', reform:'ofek' })}>
                <Plus size={15} strokeWidth={2.6} />
                הוסף בית ספר
              </button>
            </div>
            {/* מעקב מילוי — ראשון, כי זו השאלה הראשונה של השליח בבוקר */}
            {schools.length > 0 && (
              <FillProgress schools={schools} month={activeMonth}
                onOpenSchool={id => { const sc = schools.find(x => x.id === id); if (sc) { setActiveSchool(sc); setView('school'); } }} />
            )}

            {schools.length === 0 ? (
              <div className="apple-card" style={{ textAlign:'center', padding:'80px 20px' }}>
                <div style={{ width:64, height:64, borderRadius:18, background:'var(--purple-100)', margin:'0 auto 16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <School size={30} strokeWidth={1.8} color="var(--purple)" />
                </div>
                <p style={{ fontWeight:600, fontSize:16, color:'var(--apple-text)', marginBottom:6 }}>אין בתי ספר עדיין</p>
                <p style={{ fontSize:14, color:'var(--apple-text2)' }}>לחצי על "הוסף בית ספר" להתחלה</p>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:16 }}>
                {schools.map(s => {
                  const ts      = teachers.filter(t => t.schoolId === s.id);
                  const empTot  = ts.reduce((sum, t) => sum + calcEmployer(t).total, 0);
                  const simN    = ts.filter(needsSim).length;
                  const apprN   = ts.filter(needsApproval).length;
                  const used    = ts.reduce((sum, t) => sum + (Number(t.frontalHours) || 0), 0);
                  const quota   = Number(s.hoursQuota) || null;
                  const overQuota = quota ? used > quota : false;
                  return (
                    <div key={s.id} className="apple-card"
                      style={{ padding:20, cursor:'pointer', transition:'transform .18s var(--ease-out), box-shadow .18s',
                        borderRight: simN>0 ? '3px solid var(--warn)' : apprN>0 ? '3px solid var(--teal)' : '3px solid transparent' }}
                      onClick={() => { setActiveSchool(s); setView('school'); }}
                      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow='var(--shadow-lg)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='var(--shadow)'; }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                        <div>
                          <h3 style={{ fontWeight:700, fontSize:16, color:'var(--apple-text)', marginBottom:2, letterSpacing:'-0.01em' }}>{s.name}</h3>
                          {s.city && <p style={{ fontSize:13, color:'var(--apple-text2)' }}>{s.city}</p>}
                          <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                            {/* המסלול הוא של המורה, לא של בית הספר. בבית ספר
                                אופק יש גם מורות בעולם ישן, ולכן מוצג התמהיל
                                בפועל; מסלול בית הספר הוא ברירת מחדל בלבד. */}
                            {(() => {
                              const nOfek = ts.filter(t => t.reform === 'ofek').length;
                              const nPre  = ts.length - nOfek;
                              if (!ts.length) return (
                                <span className={`apple-badge ${(s.reform || 'ofek') === 'ofek' ? 'badge-blue' : 'badge-gray'}`}>
                                  ברירת מחדל: {reformLabel(s.reform)}
                                </span>
                              );
                              return (
                                <>
                                  {nOfek > 0 && <span className="apple-badge badge-blue">{nOfek} אופק חדש</span>}
                                  {nPre  > 0 && <span className="apple-badge badge-gray">{nPre} עולם ישן</span>}
                                </>
                              );
                            })()}
                            {simN > 0 && <span className="apple-badge badge-orange">{simN} לסימולציה</span>}
                            {apprN > 0 && <span className="apple-badge badge-teal">{apprN} לאישור</span>}
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:4 }} onClick={e => e.stopPropagation()}>
                          <button className="apple-btn apple-btn-ghost" title="עריכה" onClick={() => setSchoolModal({ ...s })} style={{ padding:'0 10px', minHeight:32 }}><Pencil size={14} strokeWidth={2.2} /></button>
                          <button className="apple-btn apple-btn-ghost" title="מחיקה" onClick={() => { if(window.confirm(`למחוק את ${s.name}?`)) onDeleteSchool(s.id); }} style={{ padding:'0 10px', minHeight:32, color:'var(--danger)' }}><Trash2 size={14} strokeWidth={2.2} /></button>
                        </div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
                        <div style={{ background:'var(--fill)', borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
                          <p style={{ fontSize:11, color:'var(--text2)', marginBottom:2 }}>מורים</p>
                          <p className="num" style={{ fontWeight:800, fontSize:22, color:'var(--text)', letterSpacing:'-0.02em' }}>{ts.length}</p>
                        </div>
                        <div style={{ background:'var(--fill)', borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
                          <p style={{ fontSize:11, color:'var(--text2)', marginBottom:2 }}>שעות</p>
                          <p className="num" style={{ fontWeight:700, fontSize:14, color: overQuota ? 'var(--danger)' : 'var(--text)' }}>
                            {quota ? `${used} / ${quota}` : used || '—'}
                          </p>
                        </div>
                        <div style={{ background:'var(--fill)', borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
                          <p style={{ fontSize:11, color:'var(--text2)', marginBottom:2 }}>למעסיק/חודש</p>
                          <p className="num" style={{ fontWeight:700, fontSize:14, color:'var(--text)', letterSpacing:'-0.01em' }}>{empTot > 0 ? empTot.toLocaleString('he-IL')+' ₪' : '—'}</p>
                        </div>
                      </div>
                      <button className="apple-btn apple-btn-ghost" onClick={e => { e.stopPropagation(); setTeacherModal({ ...EMPTY_TEACHER, schoolId: s.id, reform: s.reform || 'ofek' }); }}
                        style={{ width:'100%', fontSize:13, borderRadius:10, border:'1.5px dashed var(--apple-fill2)' }}>
                        + הוספת עובד/ת הוראה
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showApproval && (
        <ApprovalView
          teachers={teachers}
          schools={schools}
          onApprove={onApproveTeacher}
          onApproveAll={onApproveAll}
          onClose={() => setShowApproval(false)}
        />
      )}
      {schoolModal  && <SchoolModal  school={schoolModal}  onSave={onSaveSchool}  onClose={() => setSchoolModal(null)} />}
      {showBackup && <BackupModal schools={schools} months={months} onClose={() => setShowBackup(false)} />}
      {teacherModal && <TeacherModal teacher={teacherModal} schools={schools} userRole={user.role} onSave={onSaveTeacher} onClose={() => setTeacherModal(null)} />}
    </div>
  );
}
