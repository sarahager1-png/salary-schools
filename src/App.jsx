import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import * as XLSX from 'xlsx';
import {
  Briefcase, Calculator, School, Check, ArrowLeft, ArrowRight,
  ChevronLeft, ChevronRight, Plus, LogOut, BarChart3, ClipboardCheck,
  Printer, Download, Upload, Send, Pencil, Trash2, X, Search,
  Paperclip, Image as ImageIcon, FileText, AlertTriangle, Lightbulb,
  CalendarClock, Bell, Users, FolderOpen, Database, FileSpreadsheet, ShieldAlert,
  ExternalLink, ShieldCheck, MessageCircle, Percent,
} from 'lucide-react';
import * as store from './lib/store.js';
import './index.css';
// v3 — רשת חינוך חב"ד design system

/* ═══════════════════════════════════════════════════════════════
   SALARY TABLES
═══════════════════════════════════════════════════════════════ */
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
// מעדכנים ביד בכל פריסה. מוצג בכותרת ובמסך הכניסה.
const BUILD = 31;

// אילו בתי ספר משלמים תוספת בית חב"ד — מתעדכן בכל טעינת נתונים.
// payBreakdown נקרא גם ממסכים שאין בהם אובייקט בית ספר ביד.
const CHABAD_SUPP = new Map();
// מי שכבר שובצה לה ממ"מ: מפתחות "חודש|בית ספר|שם" של הנשות שמופיעות
// בשדה "במקום מי" של שורה אחרת. מתעדכן בכל טעינת נתונים.
const MM_REPLACED = new Set();
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
// תוספת אם קיימת בעולם ישן בלבד. באופק אין לה ביטוי בשכר, ולכן מספר
// הילדים נאסף שם כמידע ואינו רכיב שכר.
//
// זכאות: אֵם — ולא כל מי שיש לו ילדים. הזכאות נגזרה ממספר הילדים עד 18
// בלבד, ולכן שלושה גברים ברשת קיבלו אותה על הנייר. gender='f' הוא
// התנאי; שורה בלי מין אינה זכאית עד שייקבע.
const MOM_MIN_SCOPE = 79;
const isMother = t => t.gender === 'f' && (t.childrenUnder18 || 0) > 0;
function momBonusEligible(t) {
  return t.reform === 'pre' && isMother(t) && computedBaseScope(t) > MOM_MIN_SCOPE;
}
// אם שמתחת לסף — לתצוגה בלבד, כדי שיהיה ברור שלא נשכחה אלא לא זכאית
const momUnderThreshold = t =>
  t.reform === 'pre' && isMother(t) && computedBaseScope(t) <= MOM_MIN_SCOPE;
// עשר נקודות על אחוז המשרה. הן כבר בתוך האחוז הרשום — ראי effectiveScope.
const MOM_SCOPE_BONUS = 10;
// בסיס אחוז המשרה מהשעות: 30 שעות = משרה מלאה בעולם ישן, 26 באופק
// (יסודי). מחנכת בעולם ישן מקבלת 3 שעות מעל מה שהיא מלמדת. תוספת
// האם אינה כאן — היא מעל הבסיס, ב-effectiveScope.
// אומת מול ההקלדות הידניות של שרה, 27.8: שבע מתוך תשע עד עיגול.
function computedBaseScope(t) {
  // מנהלת: תמיד 100% — 40 שעות ניהול, לא נוסחת הוראה
  if (isPrincipalRow(t)) return 100;
  const hr = t.reform === 'pre' && /^homeroom/.test(t.role || t.gamulRole || '') ? HOMEROOM_HOURS_PRE : 0;
  const full = t.reform === 'pre' ? PRE_FRONTAL : (LEVELS[t.level]?.frontal || 26);
  const h = Number(t.frontalHours) || 0;
  return full ? Math.round((h + hr) / full * 100) : 100;
}
const momScopeBonus = t => (momBonusEligible(t) ? MOM_SCOPE_BONUS : 0);
/*
  ההצעה שמוצגת ככפתור — מה שבאמת מוקלד למחשבון: הבסיס מהשעות, ועוד
  תוספת האם כשהיא מגיעה. האחוז שנשמר הוא הסופי, ולכן ההצעה חייבת
  להיות סופית גם היא. אין כאן מילוי אוטומטי; ההצעה מחכה ללחיצה.
*/
const suggestedScope = t => computedBaseScope(t) + momScopeBonus(t);
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

  // מנהלת: מספר אחד, תשלום ישיר — אין תוספת בית חב"ד. באופק המספר קבוע
  // (19,087), וכל מה שמעבר לו על פי הסכם מראש שנרשם כשכר מוסכם.
  if (isPrincipalRow(t)) {
    const gross = agreed || gross0 || (t.reform === 'ofek' ? PRINCIPAL_OFEK_GROSS : 0);
    return { base: gross, mom: 0, supplement: 0, gross, agreed: !!agreed };
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
  return {
    gross, base, mom, supplement, employerBase, employerSupp, social,
    estimate, isEstimate: !actual,
    total: gross + social,
    parts,                                    // הפירוט המלא, שורה לכל רכיב
    // השיעור בפועל, מעל הברוטו לעובדת. עם רצפת ה-140% הוא לא יורד מ-40%,
    // ועולה מעליה במורה שרוב שכרה בסיס (פנסיה וקרן חלות על הבסיס בלבד).
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

/*
  יש לשורה מספר.

  קודם זה נקרא "סימולציה מלאה" ודרש אחת או שתי סימולציות מהמחשבון
  הרשמי. מעכשיו התנאי אחד: חשבת השכר הזינה ברוטו. שכר מוסכם גובר,
  ומנהלת באופק מכוסה במספר הקבוע.
*/
const simComplete = t => {
  if (t._agreedGross) return true;
  if (isPrincipalRow(t)) return Boolean(t._officialGross) || t.reform === 'ofek';
  return Boolean(t._officialGross);
};

// סטטוס מורה בזרימת העבודה:
// needs_sim: מנהלת שמרה שינויים, ממתין לסימולציה אצל חשבת שכר
// needs_approval: הסימולציות הושלמו, ממתין לאישור שליח
// approved: השליח אישר
const needsSim      = t => Boolean(!unpaidThisMonth(t) && t._changedAt && !t._approved && !simComplete(t));
const needsApproval = t => Boolean(t._changedAt && !t._approved && simComplete(t));
const isPending     = t => Boolean(t._changedAt && !t._approved); // = needsSim || needsApproval

// אחוז המשרה נקבע ביד, אחרי שהמנהלת מילאה שם ושעות. במסד הוא NOT NULL
// DEFAULT 100, ולכן שורה שאיש לא נגע בה נראית בדיוק כמו משרה מלאה —
// וזה מה שנכנס לסימולציה ולהבראה ולביגוד. scopeSetAt הוא החותמת שנרשמת
// ברגע שמישהי מקלידה. אחוז שאינו 100 נספר גם הוא כנקבע: אין דרך אחרת
// שהוא הגיע לשם, וזה חוסך מילוי לאחור של רשומות ותיקות.
const scopeConfirmed = t =>
  Boolean(t.scopeSetAt) || (t.scopePct ?? t.scope ?? 100) !== 100;
/*
  מי שממתינה לקביעת אחוז. מנהלת בית ספר תמיד 100% — 40 שעות ניהול.

  עד 1.9 היו כאן שני אחוזים, כי סימולציית הבסיס של מורת אופק רצה בעולם
  הישן ודרשה אחוז משלה. הסימולציות ירדו, והפער בין המסלולים הוא מספר
  שחשבת השכר מזינה — ולכן נשאר אחוז אחד.
*/
const scopeMissing = t =>
  isPending(t) && !isPrincipalRow(t) && !scopeConfirmed(t);

/*
  אישור אחד, של שרה.

  עד 1.9 היה שלב שני — אישור רשתי בחודש הראשון, אצל רינה אלהרר. שרה
  הכריעה שהוא יורד: "רינה לא מאשרת, רק אני". השורה עוברת לשכר ברגע
  שהיא אישרה אותה, ולא ממתינה לאיש.

  העמודות net_approved* נשארות במסד עם ההיסטוריה של החודש הראשון, ואינן
  נקראות עוד. הן יימחקו במיגרציה נפרדת אחרי חודש עבודה תקין.

  שורה מאושרת שהסימולציה שלה נמחקה אחרי האישור אינה עוברת הלאה: בלי
  מספר אין מה לחתום עליו, והמאשרת ראתה "בסיס 0" ו-818 ₪.
*/
const fullyApproved = (t) => Boolean(t._approved && simComplete(t));

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
  // אין ותק 0 — שנה ראשונה בהוראה היא 1, וה-CHECK במסד דוחה אפס
  seniority: 1, frontalHours: 26, scopePct: 100, scope: 100,
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
  travelDays: 0,         // ימי עבודה בפועל — לחישוב נסיעות
  daycareChildren: 0,    // ילדים עד גיל 5 — לתוספת מעונות
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
    reform: 'ofek',
    nihulGrade: 1,
    scopePct: 100, scope: 100, frontalHours: 40,
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

// פס "גרסה חדשה" — משווה את הבנדל שבאוויר לזה שנטען
function UpdateBanner() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const current = document.querySelector('script[src*="assets/index-"]')?.getAttribute('src');
    if (!current) return;
    let stop = false;
    const check = async () => {
      try {
        const html = await fetch('/?u=' + Date.now(), { cache: 'no-store' }).then(r => r.text());
        const m = html.match(/assets\/index-[^"']+\.js/);
        if (!stop && m && !current.includes(m[0])) setStale(true);
      } catch { /* אין רשת — ננסה שוב */ }
    };
    const iv = setInterval(check, 60000);
    window.addEventListener('focus', check);
    return () => { stop = true; clearInterval(iv); window.removeEventListener('focus', check); };
  }, []);
  if (!stale) return null;
  return (
    <button onClick={() => {
        if (document.activeElement?.tagName === 'INPUT') document.activeElement.blur();
        setTimeout(() => window.location.reload(), 400);
      }}
      style={{ position:'fixed', bottom:16, insetInlineStart:16, zIndex:99,
        background:'var(--teal)', color:'#fff', border:'none', borderRadius:12,
        padding:'10px 18px', fontSize:13.5, fontWeight:700, fontFamily:'inherit',
        cursor:'pointer', boxShadow:'0 4px 14px rgba(0,180,204,.35)' }}>
      יש גרסה חדשה — לחצי לרענון
    </button>
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
  const totGross = ts.reduce((s,t) => s + calcEmployer(t).gross, 0);
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

// קובץ .xlsx אמיתי — לא CSV. אקסל בהגדרות עברית מפריד בנקודה-פסיק, ולכן
// קובץ מופרד בפסיקים נפתח אצלו כעמודה אחת. גיליון בינארי עוקף את הבעיה
// לגמרי, שומר עברית, ומאפשר רוחבי עמודות וכיוון מימין לשמאל.
function downloadXLSX(headers, rows, filename, footer, sheetName = 'דוח') {
  const aoa = [headers.map(h => h.label)];
  rows.forEach(r => aoa.push(headers.map(h => r[h.key] ?? '')));
  if (footer) aoa.push(headers.map(h => footer[h.key] ?? ''));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(9, Math.min(24, h.label.length + 6)) }));

  const wb = XLSX.utils.book_new();
  // כיוון מימין לשמאל נשמר ברמת החוברת; ברמת הגיליון בלבד הוא לא נכתב לקובץ
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(buf, filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

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
            <input type="range" min={1} max={40} value={Math.max(1, t.seniority || 1)} onChange={e => set('seniority', +e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
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
                {` · ${effectiveScope(t)}% משרה — כולל תוספת אם`}
              </p>
            )}
            {t.reform === 'pre' && (t.childrenUnder18||0) > 0 && !momBonusEligible(t) && (
              <p style={{ fontSize:12, color:'var(--apple-orange)', marginTop:8 }}>
                {!t.gender ? 'חסר מין — תוספת אם ניתנת לאם בלבד'
                  : t.gender !== 'f' ? 'תוספת אם ניתנת לאם בלבד'
                  : `אחוז משרה ${computedBaseScope(t)}% — התוספת ניתנת מעל ${MOM_MIN_SCOPE}%`}
              </p>
            )}
            {/* מין: הזכאות לתוספת אם נגזרה ממספר הילדים בלבד, ולכן שלושה
                גברים ברשת הופיעו כזכאים. השדה נשאל כאן, ליד הילדים. */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginTop:10 }}>
              <div>
                <p style={{ fontSize:13.5, fontWeight:600, color:'var(--text)' }}>מין</p>
                <p style={{ fontSize:12, color:'var(--text2)' }}>קובע את הזכאות לתוספת אם</p>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {[{ v:'f', l:'אישה' }, { v:'m', l:'גבר' }].map(o => (
                  <button key={o.v} onClick={() => set('gender', t.gender === o.v ? null : o.v)}
                    className={`apple-btn ${t.gender === o.v ? 'apple-btn-blue' : 'apple-btn-ghost'}`}
                    style={{ minHeight:32, padding:'0 14px', fontSize:12.5 }}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
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

  // אותן עמודות שבטבלה, באותו סדר — כדי שהקובץ והנייר יראו אותו דבר
  const exportExcel = () => {
    const headers = [
      { key:'name', label:'שם' }, { key:'tz', label:'ת.ז.' }, { key:'reform', label:'רפורמה' },
      { key:'grade', label:'דרגה' }, { key:'seniority', label:'ותק' }, { key:'scope', label:'% משרה' },
      { key:'frontal', label:'פרונטלי' }, { key:'individual', label:'פרטני' }, { key:'presence', label:'שהייה' },
      { key:'role', label:'תפקיד' }, { key:'from', label:'מתאריך' }, { key:'to', label:'עד תאריך' },
      { key:'gross', label:'ברוטו' }, { key:'social', label:'הוצאות מעביד' }, { key:'total', label:'ברוטו למעסיק' },
    ];
    const rows = ts.map(t => {
      const emp = calcEmployer(t);
      const derived = deriveHours(t);
      return {
        name: t.name,
        tz: t.tzId || '',
        reform: reformLabel(t.reform),
        grade: t.reform === 'ofek' ? (t.grade === 'intern' ? 'מתמחה' : `ד${t.grade}`) : (t.degree === 'intern' ? 'מתמחה' : t.degree),
        seniority: t.seniority,
        scope: (t.reform === 'ofek' ? (derived?.scopePct || t.scopePct || 100) : (t.scope || 100)) + '%',
        frontal: derived ? derived.frontal : (t.frontalHours ?? ''),
        individual: derived ? derived.individual : '',
        presence: derived ? derived.presence : '',
        role: t.role !== 'none' ? (ROLES.find(r => r.id === t.role)?.label.split('(')[0].trim() || '') : '',
        from: fmt(t.startDate), to: fmt(t.endDate),
        gross: t._officialGross ? Math.round(Number(t._officialGross)) : '',
        social: Math.round(emp.social),
        total: Math.round(emp.total),
      };
    });
    const footer = { name: 'סה"כ', gross: Math.round(totGross), total: Math.round(totEmpGross) };
    downloadXLSX(headers, rows, `דוח_שכר_${school.name}_${stampToday()}.xlsx`, footer, 'דוח שכר');
  };

  return (
    <div className="print-sheet" style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:50, overflowY:'auto' }} dir="rtl">
      <div style={{ maxWidth:1000, margin:'0 auto', background:'var(--apple-surface)', minHeight:'100vh', padding:32 }}>
        <div className="no-print" style={{ display:'flex', justifyContent:'space-between', marginBottom:24 }}>
          <button className="apple-btn apple-btn-ghost" onClick={onClose}><ArrowRight size={15} strokeWidth={2.4} />חזרה</button>
          <div style={{ display:'flex', gap:8 }}>
            <button className="apple-btn apple-btn-ghost" onClick={exportExcel}>הורדה לאקסל</button>
            <button className="apple-btn apple-btn-blue" onClick={() => window.print()}><Printer size={15} strokeWidth={2.2} />הדפסה</button>
          </div>
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
/* ═══════════════════════════════════════════════════════════════
   הדיווח החודשי של המנהלת

   מה שהמנהלת מדווחת כל חודש: מי נעדרה, מי מילאה מקום, ומי יצאה לחל"ד.
   שלושת אלה כבר היו שדות בשורה — מה שחסר היה הרגע שבו היא אומרת
   "סיימתי". בלעדיו אין דרך לדעת אם בית ספר שקט כי אין שינויים או כי
   איש לא נגע בו, ואוטומציית ה-5 הייתה מסמנת את כולן כמאחרות.

   "אין שינוי החודש" הוא התשובה הנכונה לרוב בתי הספר ברוב החודשים,
   ולכן הוא כפתור ולא חוסר-מעש.
═══════════════════════════════════════════════════════════════ */
function ReportMonth({ school, teachers, monthKey, due, onReport }) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');
  const [done, setDone] = useState(null);

  const rows = teachers.filter(t => !unpaidThisMonth(t));
  const reported = rows.length > 0 && rows.every(t => t._reportedAt);
  const dueDate = due?.report ? new Date(due.report + 'T23:59:59') : null;
  const daysLeft = dueDate ? Math.ceil((dueDate - new Date()) / 86400000) : null;
  const past = dueDate ? new Date() > dueDate : false;

  const send = async () => {
    setBusy(true); setErr('');
    try {
      const r = await onReport(school.id, monthKey);
      setDone(r?.late ? 'late' : 'ok');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const changed = rows.filter(t => (t.absenceDays || 0) > 0 || (t.mmHours || 0) > 0 || t.leaveType);

  return (
    <div className="apple-card" style={{ padding:'14px 16px', marginBottom:14 }} dir="rtl">
      <div style={{ display:'flex', alignItems:'center', gap:9, flexWrap:'wrap', marginBottom:4 }}>
        <CalendarClock size={15} strokeWidth={2.3} color="var(--purple)" />
        <p style={{ fontSize:13.5, fontWeight:700, color:'var(--text)' }}>הדיווח החודשי — {fmtMonth(monthKey)}</p>
        {reported
          ? <span className="apple-badge badge-green" style={{ fontSize:10.5, padding:'2px 8px' }}>נמסר</span>
          : past
            ? <span className="apple-badge badge-orange" style={{ fontSize:10.5, padding:'2px 8px' }}>אחרי המועד</span>
            : daysLeft != null && <span className="apple-badge badge-purple" style={{ fontSize:10.5, padding:'2px 8px' }}>
                {daysLeft === 0 ? 'היום המועד האחרון' : `נותרו ${daysLeft} ימים`}
              </span>}
      </div>
      <p style={{ fontSize:11.5, color:'var(--text3)', lineHeight:1.6, marginBottom:10 }}>
        העדרויות, מילוי מקום וחופשות לידה. {due?.report
          ? `המועד האחרון ${String(due.report).split('-').reverse().join('/')} — דיווח שיגיע אחריו לא ייכנס לשכר החודש.`
          : ''}
      </p>

      {changed.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:10 }}>
          {changed.map(t => (
            <p key={t.id} style={{ fontSize:12, color:'var(--text2)' }}>
              · <b>{t.name}</b>
              {(t.absenceDays || 0) > 0 && ` · ${t.absenceDays} ימי היעדרות`}
              {(t.mmHours || 0) > 0 && ` · ${t.mmHours} ש׳ מילוי מקום${t.mmFor ? ` במקום ${t.mmFor}` : ''}`}
              {t.leaveType && ` · ${leaveLabel(t.leaveType)}`}
            </p>
          ))}
        </div>
      )}

      {err  && <p style={{ fontSize:12.5, color:'var(--danger)', marginBottom:8 }}>{err}</p>}
      {done && (
        <p style={{ fontSize:12.5, color: done === 'late' ? 'var(--warn)' : 'var(--ok)', fontWeight:600, marginBottom:8 }}>
          {done === 'late'
            ? 'הדיווח נמסר אחרי המועד — הוא מסומן, ויעבור לשכר רק באישור מפורש.'
            : 'הדיווח נמסר. תודה.'}
        </p>
      )}

      <button className="apple-btn apple-btn-blue" onClick={send} disabled={busy || reported}
        style={{ minHeight:38, padding:'0 18px', fontSize:13, opacity: reported ? .5 : 1 }}>
        {busy ? 'שולח…' : reported ? 'הדיווח נמסר' : changed.length ? 'שליחת הדיווח' : 'אין שינוי החודש — שליחה'}
      </button>
    </div>
  );
}

function SchoolView({ school, teachers, userRole, onBack, onSaveTeacher, onDeleteTeacher, onApproveTeacher, onImportTeachers, activeMonth, fmtMonthFn, userId, monthDue, onReportMonth }) {
  const [search, setSearch]           = useState('');
  const [showReport, setShowReport]   = useState(false);
  const [showAbsence, setShowAbsence] = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [fullEdit, setFullEdit]      = useState(null);   // מורה בעריכת פרטים מלאים
  const [details, setDetails]        = useState(null);   // נתוני העסקה לחתימה
  const [linkModal, setLinkModal]    = useState(false);  // קישור אישי למנהלת
  const schoolReform = school.reform || 'ofek';
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
  // המכסה האפקטיבית: המכסה + שעות נוספות שאושרו (רמת ישי: +12 על
  // חיבור כיתות ג'-ד'). התוספת נשמרת בנפרד כדי שהסיבה לא תלך לאיבוד.
  const baseQuota  = Number(school.hoursQuota) || null;
  const extraHours = Number(school.extraHours) || 0;
  const hoursQuota = baseQuota !== null ? baseQuota + extraHours : (extraHours ? null : null);
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

  // תצוגת עמודות: מצומצמת כברירת מחדל — 26 עמודות לא נכנסות במסך
  const [allCols, setAllCols] = useState(false);
  // חיווי שמירה: ההקלדות נשמרות ביציאה מכל שדה, אבל בלי סימן חי
  // אי אפשר לדעת שהן נקלטו. saveRow עוטף כל שמירה ומדווח.
  const [saveState, setSaveState] = useState(null);   // null | 'saving' | Date
  const saveRow = async (patch) => {
    setSaveState('saving');
    const ok = await onSaveTeacher(patch);
    setSaveState(ok === false ? null : new Date());
    return ok;
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
  /*
    תאי הכסף בשורת העריכה — ארבעה, כמספר עמודות הכסף בטבלה:
    ברוטו, תוספת בית חב"ד, הוצאות מעביד וסה״כ. שני הראשונים נערכים
    (שדות של חשבת השכר), שני האחרונים מחושבים.

    עד 1.9 היו כאן שישה, כי הברוטו היה מפוצל לשתי סימולציות. כל תא
    שנוסף או ירד כאן חייב להתאים למספר העמודות בכותרת — אחרת כל השורה
    מוסטת, וזה קרה.
  */
  const moneyEditCells = (v) => {
    const emp = calcEmployer(v);
    const numCell = (key, bg) => (
      <td><input type="number" className="apple-input" dir="ltr" value={v[key] || ''}
        onChange={e => setF(key, e.target.value ? Number(e.target.value) : null)} placeholder="—"
        style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:90, textAlign:'center',
                 background: bg || undefined }} /></td>
    );
    const supplies = !isPrincipalRow(v) && schoolPaysSupp(v.schoolId);
    return (
      <>
        {numCell('_officialGross')}
        {!isPrincipal && (supplies
          ? numCell('_chabadSupp', 'var(--purple-100)')
          : <td style={{ textAlign:'center', color:'var(--text3)' }}>—</td>)}
        {!isPrincipal && <td style={{ textAlign:'center', color:'var(--text3)' }}>
          {emp.social ? emp.social.toLocaleString('he-IL') : '—'}
        </td>}
        {!isPrincipal && <td style={{ textAlign:'center', fontWeight:700, color:'var(--purple)' }}>
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
              {!hoursQuota && extraHours > 0 && (
                <div style={{ marginInlineStart:13, marginTop:8 }}>
                  <span className="apple-badge badge-teal" style={{ fontSize:11.5 }}
                    title="נשמרות בנפרד מהמכסה; כשתוגדר מכסה בסיסית הן יתווספו אליה">
                    +{extraHours} שעות הוראה נוספות — {school.extraHoursNote || 'אושרו'} · נוצלו {usedHours.toLocaleString('he-IL')}
                  </span>
                </div>
              )}
              {hoursQuota && (
                <div style={{ marginInlineStart:13, marginTop:8, maxWidth:320 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                    <span style={{ color:'var(--text3)' }}>שעות עובדי הוראה{extraHours ? ` (כולל +${extraHours} — ${school.extraHoursNote || 'שעות נוספות'})` : ''}</span>
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
                <span className="apple-badge badge-gray" title="שורות שעדיין אין בהן ברוטו — מקלידים בעמודות הכסף">{needsSimCount} חסרות ברוטו</span>
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
        {/* הדיווח החודשי — למנהלת בלבד, בראש המסך שלה ולא בתחתיתו */}
        {isPrincipal && onReportMonth && (
          <ReportMonth school={school} teachers={ts} monthKey={activeMonth}
            due={monthDue} onReport={onReportMonth} />
        )}
        {/* 26 עמודות לא נכנסות במסך. בתצוגה המצומצמת נשארות רק אלה
            שההזנה השוטפת צריכה; ההסתרה ב-CSS לפי מיקום, כותרת ותא יחד. */}
        <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:10, marginBottom:8 }}>
          {saveState === 'saving' ? (
            <span style={{ fontSize:12.5, color:'var(--text3)', fontWeight:600 }}>שומר…</span>
          ) : saveState ? (
            <span style={{ fontSize:12.5, color:'var(--ok, #22C55E)', fontWeight:700 }}>
              ✓ נשמר {saveState.toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' })}
            </span>
          ) : null}
          {/* סוגר שדה פתוח — ה-blur מפעיל את השמירה שלו — ומאשר */}
          <button className="apple-btn apple-btn-blue" style={{ minHeight:32, padding:'0 16px', fontSize:12.5 }}
            onClick={() => {
              if (document.activeElement?.tagName === 'INPUT') document.activeElement.blur();
              setSaveState(s2 => s2 === 'saving' ? s2 : new Date());
            }}>
            שמירה
          </button>
          <button className="apple-btn apple-btn-ghost" onClick={() => setAllCols(v => !v)}
            style={{ minHeight:32, padding:'0 12px', fontSize:12.5 }}>
            {allCols ? 'תצוגה מצומצמת' : `כל העמודות (${26})`}
          </button>
        </div>
        <div className="sheet-wrap">
          <div className="sheet-scroll">
            <table className={`apple-table sticky-head${allCols ? '' : ' compact-cols'}${school.chabadSupp === false ? ' no-supp' : ''}`} style={{ fontSize:13, minWidth: allCols ? 1330 : 0 }}>
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
                <th style={{ textAlign:'center' }}>ימי נסיעה</th>
                <th style={{ textAlign:'center' }}>ילדים עד 5</th>
                <th style={{ textAlign:'center' }}>ממ"מ שעות</th>
                <th style={{ textAlign:'center' }}>במקום מי</th>
                <th style={{ textAlign:'center' }}>תוספות (₪)</th>
                <th style={{ textAlign:'center' }} title="הברוטו שחשבת השכר הזינה — מה שרץ במערכת התשלומים">ברוטו (₪)</th>
                {!isPrincipal && <th style={{ textAlign:'center' }} title='החלק שאינו פנסיוני — מוזן בידי חשבת השכר'>תוספת בית חב"ד</th>}
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
                  <td><input type="number" min="1" className="apple-input" dir="ltr" value={editData.seniority??1} onChange={e=>setF('seniority',Math.max(1, Number(e.target.value)||1))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
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
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.travelDays??0} onChange={e=>setF('travelDays',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.daycareChildren??0} onChange={e=>setF('daycareChildren',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
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
                <tr><td colSpan={26} style={{ textAlign:'center', padding:'40px', color:'var(--apple-text3)' }}>
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
                    <td><input type="number" min="1" className="apple-input" dir="ltr" value={d.seniority??1} onChange={e=>setF('seniority',Math.max(1, Number(e.target.value)||1))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
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
                    <td><input type="number" className="apple-input" dir="ltr" value={d.travelDays??0} onChange={e=>setF('travelDays',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.daycareChildren??0} onChange={e=>setF('daycareChildren',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
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
                  <tr key={t.id} style={{ background:
                    isSim ? 'var(--warn-bg)'
                    : isAppr ? 'var(--teal-100)'
                    : t.reform === 'ofek' ? '#EDF3FE'   /* אופק חדש — כחלחל, להבחנה מעולם ישן */
                    : 'var(--surface)' }}>
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
                          <span className={`apple-badge ${t.leaveType === 'maternity' && hasSubstitute(t) ? 'badge-teal' : 'badge-orange'}`}
                            style={{ fontSize:10.5, padding:'2px 8px' }} title={leaveText(t)}>
                            {leaveLabel(t.leaveType)}{t.leaveFrom ? ` ${fmtDay(t.leaveFrom)}` : ''}
                            {t.leaveType === 'maternity'
                              ? (hasSubstitute(t) ? ' · שובצה מחליפה — הפרשות בלבד' : ' · השכר נשמר עד שיבוץ')
                              : ''}
                          </span>
                        )}
                        {isPrincipalRow(t) && (
                          <span className="apple-badge badge-purple" style={{ fontSize:10.5, padding:'2px 8px', cursor:'help' }}
                            title="נוצרה אוטומטית עם פתיחת בית הספר, עם 26 שעות כברירת מחדל — השעות נספרות במכסה. עדכני את שעותיה ואת פרטיה.">
                            מנהלת
                          </span>
                        )}
                        {t._agreedGross && <span className="apple-badge badge-teal" style={{ fontSize:10.5, padding:'2px 8px' }} title="ברוטו מוסכם — לא מסימולציה">שכר מוסכם</span>}
                        {fullyApproved(t) && (
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
                        title={scopeConfirmed(t)
                          ? 'אחוז משרה — הקלדה ישירה, נשמר ביציאה מהשדה'
                          : 'עדיין ברירת המחדל — אחוז המשרה טרם נקבע. הקלדה כאן קובעת אותו.'}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        onBlur={e => {
                          const pct = Number(e.target.value);
                          if (!Number.isFinite(pct) || pct === scope) return;
                          saveRow({ ...t, scopePct: pct, scope: pct, scopeSetAt: new Date().toISOString() });
                        }}
                        style={{ width:56, textAlign:'center', fontWeight:700, fontSize:13,
                          border:`1px solid ${scopeConfirmed(t) ? 'var(--line)' : 'var(--warn)'}`, borderRadius:7, padding:'3px 4px',
                          background: scopeConfirmed(t) ? 'var(--surface)' : 'var(--warn-bg)',
                          color:'var(--text)', fontFamily:'inherit' }} />
                      {/* שורת עזר אחת: הצעה ליישור לפי הנוסחה, ותוצאת האם.
                          כשהשדה כבר תואם — רק תוצאת האם, בלי רעש. */}
                      {t.reform === 'pre' && !isPrincipalRow(t)
                        && suggestedScope(t) !== (t.scope ?? t.scopePct ?? 100) ? (
                        <button
                          title="לפי הנוסחה: שעות (ועוד 3 למחנכת בעולם ישן) חלקי 30, או 26 באופק. לחיצה מיישרת, ותוספת האם מעל."
                          onClick={e => { e.stopPropagation(); const v = suggestedScope(t); saveRow({ ...t, scopePct: v, scope: v, scopeSetAt: new Date().toISOString() }); }}
                          style={{ display:'block', margin:'3px auto 0', fontSize:10.5, color:'#fff',
                            background:'var(--teal)', border:'none', cursor:'pointer', fontFamily:'inherit',
                            fontWeight:700, padding:'2px 8px', borderRadius:999, whiteSpace:'nowrap' }}>
                          {`תקני ל-${suggestedScope(t)}`}
                        </button>
                      ) : momBonus ? (
                        <span style={{ display:'block', fontSize:10, color:'var(--purple)', fontWeight:700, marginTop:2 }}>
                          {`כולל +${MOM_SCOPE_BONUS} אם`}
                        </span>
                      ) : momUnderThreshold(t) ? (
                        <span style={{ display:'block', fontSize:10, color:'var(--text3)', marginTop:2 }}
                          title={`תוספת אם ניתנת ממשרה של ${MOM_MIN_SCOPE}% ומעלה`}>
                          {`אם · מתחת ל-${MOM_MIN_SCOPE}%`}
                        </span>
                      ) : null}
                    </td>
                    <td style={{ textAlign:'center' }}>{degreeLabel}</td>
                    <td style={{ textAlign:'center', fontWeight:700, color: t.reform==='ofek' ? 'var(--apple-text)' : 'var(--apple-text3)' }}>{gradeLabel}</td>
                    <td style={{ textAlign:'center', color:'var(--apple-text2)' }}>{t.seniority}</td>
                    <td style={{ textAlign:'center' }}>{derived ? derived.frontal : (t.frontalHours ?? '—')}</td>
                    <td style={{ textAlign:'center' }}>
                      <select key={`role-${t.id}`} value={t.role || 'none'}
                        title="גמול תפקיד — נשמר מיד"
                        onClick={e => e.stopPropagation()}
                        onChange={e => saveRow({ ...t, role: e.target.value })}
                        className="apple-select"
                        style={{ fontSize:12, padding:'4px 6px', width:150,
                          fontWeight: t.role && t.role !== 'none' ? 700 : 400,
                          color: t.role && t.role !== 'none' ? 'var(--text)' : 'var(--text3)' }}>
                        {ROLES.map(r => <option key={r.id} value={r.id}>{ROLE_SHORT[r.id] || r.label}</option>)}
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
                          saveRow({ ...t, childrenUnder18: n });
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
                    {/* נסיעות ומעונות — התאים חסרו בשורת התצוגה בזמן שהכותרות
                        כבר היו שם, וכל מה שמשמאלם הוצג עמודה אחת מוקדם מדי:
                        "הוצאות מעביד" ו"סה״כ למעסיק" נשארו ריקות. */}
                    <td style={{ textAlign:'center', color: (t.travelDays||0)>0 ? 'var(--text)' : 'var(--text3)', fontWeight: (t.travelDays||0)>0 ? 700 : 400 }}
                        title={(t.travelDays||0) > 0 ? `נסיעות: ${calcReimb(t).travel.toLocaleString('he-IL')} ₪` : undefined}>
                      {(t.travelDays||0) > 0 ? t.travelDays : '—'}
                    </td>
                    <td style={{ textAlign:'center', color: (t.daycareChildren||0)>0 ? 'var(--text)' : 'var(--text3)', fontWeight: (t.daycareChildren||0)>0 ? 700 : 400 }}
                        title={(t.daycareChildren||0) > 0 ? `מעונות: ${calcReimb(t).daycare.toLocaleString('he-IL')} ₪` : undefined}>
                      {(t.daycareChildren||0) > 0 ? t.daycareChildren : '—'}
                    </td>
                    <td style={{ textAlign:'center', color: (t.mmHours||0)>0 ? 'var(--text)' : 'var(--text3)', fontWeight: (t.mmHours||0)>0 ? 700 : 400 }}>
                      {(t.mmHours||0) > 0 ? t.mmHours : '—'}
                    </td>
                    <td style={{ textAlign:'center' }}>
                      <input type="text" key={`mmf-${t.id}`}
                        defaultValue={t.mmFor || ''}
                        placeholder="במקום מי"
                        title='שם העובדת שממלאים את מקומה — מפעיל את מצב החל"ד שלה'
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        onBlur={e => {
                          const v2 = e.target.value.trim();
                          if (v2 === (t.mmFor || '')) return;
                          saveRow({ ...t, mmFor: v2 });
                        }}
                        style={{ width:110, textAlign:'center', fontSize:12,
                          border:'1px solid var(--line)', borderRadius:7, padding:'3px 5px',
                          background:'var(--surface)', color:'var(--text)', fontFamily:'inherit' }} />
                    </td>
                    <td style={{ textAlign:'center', color: (t.monthlyExtras||0)>0 ? 'var(--text)' : 'var(--text3)', fontWeight: (t.monthlyExtras||0)>0 ? 700 : 400 }}>
                      {(t.monthlyExtras||0) > 0 ? Number(t.monthlyExtras).toLocaleString('he-IL')+' ₪' : '—'}
                    </td>
                    {/* ברוטו — מה שחשבת השכר הזינה. עד 1.9 היו כאן שתי
                        עמודות, סימולציית עולם ישן וסימולציית אופק, והפער
                        ביניהן היה תוספת בית חב"ד. הסימולציות ירדו. */}
                    <td style={{ textAlign:'center' }}>
                      <input type="number" min="0" dir="ltr"
                        key={`gross-${t.id}`}
                        defaultValue={t._officialGross || ''}
                        placeholder="₪"
                        title="הברוטו לעובדת — נשמר ביציאה מהשדה"
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        onBlur={e => {
                          const v2 = e.target.value === '' ? null : Number(e.target.value);
                          if ((v2 ?? null) === (t._officialGross ?? null)) return;
                          saveRow({ ...t, _officialGross: v2 });
                        }}
                        style={{ width:92, textAlign:'center', fontWeight:700, fontSize:13,
                          border:'1px solid var(--line)', borderRadius:7, padding:'3px 4px',
                          background:'var(--surface)', color:'var(--text)', fontFamily:'inherit' }} />
                    </td>
                    {!isPrincipal && <td style={{ textAlign:'center' }}>
                      {isPrincipalRow(t) || !schoolPaysSupp(t.schoolId)
                        ? <span style={{ color:'var(--text3)' }}
                            title={isPrincipalRow(t) ? 'מנהלת — תשלום ישיר' : 'בית ספר בלי תוספת בית חב"ד'}>—</span>
                        : <input type="number" min="0" dir="ltr"
                            key={`supp-${t.id}`}
                            defaultValue={t._chabadSupp || ''}
                            placeholder="₪"
                            title='תוספת בית חב"ד — לא פנסיונית, נושאת מס שכר וביטוח לאומי'
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            onBlur={e => {
                              const v2 = e.target.value === '' ? null : Number(e.target.value);
                              if ((v2 ?? null) === (t._chabadSupp ?? null)) return;
                              saveRow({ ...t, _chabadSupp: v2 });
                            }}
                            style={{ width:84, textAlign:'center', fontWeight:700, fontSize:12.5,
                              border:'1px solid var(--line)', borderRadius:7, padding:'3px 4px',
                              background:'var(--purple-100)', color:'var(--text)', fontFamily:'inherit' }} />}
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
                        : <span style={{ fontSize:11.5, color:'var(--text3)' }}>
                            {t.reform === 'ofek' && t._officialGross && !t._officialGrossPre ? 'חסר עולם ישן' : 'חסר ברוטו'}
                          </span>}
                    </td>}
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="apple-btn apple-btn-ghost" title="עריכה מהירה בשורה" onClick={() => startEdit(t)} style={{ padding:'0 9px', minHeight:30 }}><Pencil size={13} strokeWidth={2.2} /></button>
                        <button className="apple-btn apple-btn-ghost" title="פרטים מלאים — תפקיד, שלב, קבוצת גיל, שינויי משרה וקבצים" onClick={() => setFullEdit(t)} style={{ padding:'0 9px', minHeight:30 }}><Users size={13} strokeWidth={2.2} /></button>
                        {fullyApproved(t) && (
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
                {/* שורת הסיכום נבנית תא-תא ולא ב-colSpan אחד גדול. שתי סיבות:
                    ה-colSpan היה 14 בזמן שהטבלה מונה 26 עמודות, ולכן כל סכום
                    ישב ארבע עמודות ימינה — "הוצאות מעביד" ו"סה״כ למעסיק"
                    נשארו ריקות לגמרי; וההסתרה בתצוגה המצומצמת היא לפי מיקום
                    התא, ותא מתפרש אחד אינו יכול להיעלם עם העמודה שלו. */}
                <tr>
                  <td style={{ fontWeight:700, whiteSpace:'nowrap' }}
                      title={`${tsOfficial.length} מורות עם סימולציה מלאה`}>
                    סה״כ · {tsOfficial.length} מורות
                  </td>
                  {/* 26 עמודות: 1 שם, 19 ריקות, ואז תוספות · ברוטו ·
                      תוספת בית חב"ד · הוצאות מעביד · סה״כ · כפתורים */}
                  {Array.from({ length: 19 }, (_, i) => <td key={`pad${i}`}></td>)}
                  <td style={{ textAlign:'center', fontWeight:700 }}>{totMonthly > 0 ? totMonthly.toLocaleString('he-IL') + ' ₪' : '—'}</td>
                  <td style={{ textAlign:'center', fontWeight:700 }}>{totGross.toLocaleString('he-IL')} ₪</td>
                  <td style={{ textAlign:'center', fontWeight:700, color:'var(--purple)' }}>{totChabad.toLocaleString('he-IL')} ₪</td>
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
// פירוט המשרות של בית ספר אחד, נפתח מתוך שורת הדוח. קריאה בלבד —
// כל שינוי נעשה במסך בית הספר עצמו, שם יושבות ההרשאות והזרימה.
function SchoolPositions({ school }) {
  const ts = [...(school.ts || [])].sort((a, b) => calcEmployer(b).total - calcEmployer(a).total);
  const nis = v => (v > 0 ? Math.round(v).toLocaleString('he-IL') + ' ₪' : '—');
  const status = t => {
    if (needsSim(t))      return { label: 'ממתין לסימולציה', cls: 'badge-orange' };
    if (needsApproval(t)) return { label: 'ממתין לאישור השליח', cls: 'badge-orange' };
    return { label: 'מאושר', cls: 'badge-green' };
  };
  const tot = ts.reduce((a, t) => {
    const e = calcEmployer(t);
    if (simComplete(t)) { a.gross += e.gross; a.total += e.total; }
    a.hours += Number(t.frontalHours) || 0;
    return a;
  }, { gross: 0, total: 0, hours: 0 });

  return (
    <div style={{ padding:'14px 18px 18px' }}>
      <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', marginBottom:8 }}>
        פירוט המשרות — {school.name} · {ts.length} עובדי הוראה
      </p>
      <div className="sheet-wrap">
        <table className="apple-table" style={{ fontSize:12.5 }}>
          <thead>
            <tr>
              <th>שם</th>
              <th>תפקיד</th>
              <th style={{ textAlign:'center' }}>מסלול</th>
              <th style={{ textAlign:'center' }}>אחוז משרה</th>
              <th style={{ textAlign:'center' }}>שעות</th>
              <th style={{ textAlign:'center' }}>ברוטו / חודש</th>
              <th style={{ textAlign:'center' }}>ברוטו למעסיק</th>
              <th style={{ textAlign:'center' }}>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {ts.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign:'center', padding:22, color:'var(--text3)' }}>אין עדיין עובדי הוראה</td></tr>
            )}
            {ts.map(t => {
              const emp = calcEmployer(t);
              const derived = deriveHours(t);
              const scope = t.reform === 'ofek' ? (derived?.scopePct || t.scopePct || 100) : (t.scope || 100);
              const st = status(t);
              const done = simComplete(t);
              return (
                <tr key={t.id}>
                  <td style={{ fontWeight:600 }}>{isPrincipalRow(t) && <Briefcase size={11} strokeWidth={2.4} style={{ display:'inline', verticalAlign:'-1px', marginInlineEnd:4 }} />}{t.name}</td>
                  <td style={{ color:'var(--text2)' }}>{t.role && t.role !== 'none' ? (ROLES.find(x => x.id === t.role)?.label.split('(')[0].trim() || '—') : '—'}</td>
                  <td style={{ textAlign:'center' }}>{reformLabel(t.reform)}</td>
                  {/* אחוז שלא נקבע ידנית מוצג באפור — 100 הוא ברירת המחדל במסד ולא בהכרח המצב בפועל */}
                  <td style={{ textAlign:'center', fontWeight:600,
                    color: scopeConfirmed(t) ? 'var(--text)' : 'var(--text3)' }}>
                    {scope}%{!scopeConfirmed(t) && <span title="ברירת מחדל — טרם נקבע אחוז משרה"> *</span>}
                  </td>
                  <td style={{ textAlign:'center' }}>{Number(t.frontalHours) || '—'}</td>
                  {/* בלי סימולציה מלאה אין ברוטו רשמי, ולכן גם אין מה לסכום */}
                  <td style={{ textAlign:'center', color: done ? 'var(--text)' : 'var(--text3)' }}>{done ? nis(emp.gross) : '—'}</td>
                  <td style={{ textAlign:'center', fontWeight:700, color: done ? 'var(--text)' : 'var(--text3)' }}>{done ? nis(emp.total) : '—'}</td>
                  <td style={{ textAlign:'center' }}><span className={`apple-badge ${st.cls}`}>{st.label}</span></td>
                </tr>
              );
            })}
          </tbody>
          {ts.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} style={{ fontWeight:800 }}>סה״כ {school.name}</td>
                <td style={{ textAlign:'center', fontWeight:700 }}>{tot.hours || '—'}</td>
                <td style={{ textAlign:'center', fontWeight:700 }}>{nis(tot.gross)}</td>
                <td style={{ textAlign:'center', fontWeight:800, color:'var(--purple)' }}>{nis(tot.total)}</td>
                <td style={{ textAlign:'center', fontSize:11, color:'var(--text3)' }}>
                  {school.officialCount < school.count ? `${school.count - school.officialCount} ללא סימולציה` : 'הכול רשמי'}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p style={{ fontSize:11, color:'var(--text3)', marginTop:8, lineHeight:1.7 }}>
        הסכומים נספרים רק עבור משרות שהסימולציה שלהן הושלמה — לכן סה״כ בית הספר כאן זהה לשורה שבדוח.
      </p>
    </div>
  );
}


function ReportView({ schools, teachers }) {
  // לחיצה על שורת בית ספר פותחת את פירוט המשרות שלו. פתוח אחד בכל רגע —
  // הדוח נועד להשוואה בין בתי ספר, לא לקריאה של כולם במקביל.
  const [openSchool, setOpenSchool] = useState(null);
  const rows = schools.map(s => {
    const ts       = teachers.filter(t => t.schoolId === s.id);
    const tsOff    = ts.filter(simComplete);
    const gross    = tsOff.reduce((sum, t) => sum + calcEmployer(t).gross, 0);
    const empTot   = tsOff.reduce((sum, t) => sum + calcEmployer(t).total, 0);
    const pending  = ts.filter(isPending).length;
    const usedHours = ts.reduce((sum, t) => sum + (Number(t.frontalHours) || 0), 0);
    return { ...s, ts, count: ts.length, officialCount: tsOff.length, gross, empTot,
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
                <Fragment key={r.id}>
                <tr onClick={() => r.count > 0 && setOpenSchool(openSchool === r.id ? null : r.id)}
                    style={{ cursor: r.count > 0 ? 'pointer' : 'default',
                             background: openSchool === r.id ? 'var(--purple-100)' : undefined }}
                    title={r.count > 0 ? 'לפירוט המשרות' : ''}>
                  <td style={{ fontWeight:700 }}>
                    {r.count > 0 && (
                      <ChevronLeft size={13} strokeWidth={2.6} color="var(--purple)"
                        style={{ display:'inline', verticalAlign:'-2px', marginInlineEnd:5,
                                 transform: openSchool === r.id ? 'rotate(-90deg)' : 'none', transition:'transform .15s' }} />
                    )}
                    {r.name}
                  </td>
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
                {openSchool === r.id && (
                  <tr>
                    <td colSpan={8} style={{ padding:0, background:'var(--bg)' }}>
                      <SchoolPositions school={r} />
                    </td>
                  </tr>
                )}
                </Fragment>
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
    // שורות בטבלה גוברות על "מתי נכנסה": מי שהזינה — נכנסה, גם אם אין לכך
    // חותמת. קישור שהונפק מחדש מתחיל בלי היסטוריה, ובלי התנאי הזה בית ספר
    // שכבר סיים קופץ לראש הרשימה כאילו לא נגע.
    if (!r.hasLink)                return { k: 0, label: 'אין קישור',        tone: 'gray'  };
    if (!r.lastSeen && !r.teachers)return { k: 1, label: 'טרם נכנסה',        tone: 'orange'};
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

/* ═══════════════════════════════════════════════════════════════
   שלב ראשון — אחוזי משרה

   המנהלת מזינה שם, ת.ז., שעות ודרגה. את אחוז המשרה קובעת שרה, ביד,
   אחרי שהשורות מגיעות — ואין נוסחה שגוזרת אותו (היא הוסרה ב-27.8 אחרי
   שלוש טעויות באותו יום). עד שהאחוז נקבע העמודה מראה 100, וזה נראה
   בדיוק כמו משרה מלאה שנבחרה.

   למה זה חייב לקרות לפני הסימולציה ולא אחריה: אחוז משרה הוא אחד
   מהשדות שמאפסים סימולציה קיימת. מי שתקליד אחוז אחרי שהחשבת הזינה
   שכר — תמחק לה את העבודה.

   המסך מציג את מה שידוע — שעות, מסלול, מכסת משרה מלאה — ומחכה
   למספר. אין כאן מילוי אוטומטי; "לפי השעות" הוא כפתור, לא ברירת מחדל.
═══════════════════════════════════════════════════════════════ */
function ScopePanel({ teachers, schools, onSave }) {
  const [vals,  setVals]  = useState({});   // teacherId → מה שמוקלד
  const [flash, setFlash] = useState({});   // teacherId → נקבע הרגע
  /*
    ברירת המחדל היא מי שחסרה — זו העבודה שממתינה. אבל אחוז שנקבע אינו
    נעול: מספר משתנה, נכנס שגוי, או מתברר אחרת אחרי הסימולציה. במצב
    "כל העובדות" כל השורות פתוחות לשינוי, עם מה שרשום בהן היום.
  */
  const [showAll, setShowAll] = useState(false);

  const missing = teachers.filter(scopeMissing);
  const rows = showAll
    ? teachers.filter(t => isPending(t) && !isPrincipalRow(t))
    : missing;
  const bySchool = schools
    .map(sc => ({ school: sc, list: rows.filter(t => t.schoolId === sc.id) }))
    .filter(g => g.list.length);

  /*
    מין — נשאל כאן ולא במסך אחר. תוספת אם משנה את האחוז שמוקלד למחשבון,
    ובלי לדעת מי אֵם אי אפשר להציע אותו. השדה היה ריק אצל כולן, ולכן
    ההצעה יצאה בלי התוספת גם למי שזכאית.
  */
  const saveGender = async (t, g) => {
    const ok = await onSave(t.id, 'gender', t.gender === g ? null : g);
    if (ok !== false) {
      setFlash(f => ({ ...f, [`${t.id}|gender`]: true }));
      setTimeout(() => setFlash(f => { const x = { ...f }; delete x[`${t.id}|gender`]; return x; }), 1500);
    }
  };

  const save = async (t, which, pct) => {
    const n = Math.round(Number(pct));
    if (!Number.isFinite(n) || n <= 0 || n > 200) return alert('אחוז משרה חייב להיות מספר בין 1 ל-200');
    const ok = await onSave(t.id, which, n);
    if (ok !== false) {
      setVals(v => { const x = { ...v }; delete x[`${t.id}|${which}`]; return x; });
      setFlash(f => ({ ...f, [`${t.id}|${which}`]: true }));
      setTimeout(() => setFlash(f => { const x = { ...f }; delete x[`${t.id}|${which}`]; return x; }), 1500);
    }
  };

  if (!rows.length) return (
    <div style={{ textAlign:'center', padding:'48px 16px' }}>
      <div style={{ width:56, height:56, borderRadius:17, background:'var(--ok-bg)', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Check size={26} strokeWidth={2.4} color="var(--ok)" />
      </div>
      <p style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>כל אחוזי המשרה נקבעו</p>
      <p style={{ fontSize:13, color:'var(--text3)', marginTop:3 }}>אפשר לעבור להזנת השכר הרשמי</p>
      {!showAll && (
        <button className="apple-btn apple-btn-ghost" onClick={() => setShowAll(true)}
          style={{ marginTop:14, minHeight:36, fontSize:12.5 }}>
          לשינוי אחוז שכבר נקבע
        </button>
      )}
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
        <p style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6, flex:'1 1 220px' }}>
          {showAll
            ? `${rows.length} עובדות — כולל מי שאחוזה כבר נקבע. הקלדה דורסת את הקיים.`
            : `${rows.length} עובדות שאחוז המשרה שלהן עדיין ברירת המחדל — 100 שאיש לא בחר.`}
          {' '}הקלדה כאן לפני הסימולציה; אחריה היא מוחקת את השכר שהוזן.
        </p>
        <div className="apple-seg" style={{ flexShrink:0 }}>
          <button onClick={() => setShowAll(false)}
            className={['apple-seg-item', !showAll ? 'active' : ''].join(' ')}
            style={{ padding:'5px 11px', fontSize:12 }}>
            {`ממתינות (${missing.length})`}
          </button>
          <button onClick={() => setShowAll(true)}
            className={['apple-seg-item', showAll ? 'active' : ''].join(' ')}
            style={{ padding:'5px 11px', fontSize:12 }}>
            כל העובדות
          </button>
        </div>
      </div>
      {bySchool.map(({ school, list }) => (
        <div key={school.id}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--purple)', marginBottom:8, padding:'5px 11px', background:'var(--purple-100)', border:'1px solid #D8CEEF', borderRadius:999, display:'inline-flex', alignItems:'center', gap:6 }}>
            <School size={13} strokeWidth={2.2} />
            {school.name} · {list.length}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {list.map(t => {
              const isOfek = t.reform === 'ofek';
              const hr     = homeroomHours(t);
              const hasSim = Boolean(t._officialGross || t._officialGrossPre);
              /*
                שדה אחד לכל מסלול שהמורה שייכת אליו. מורת עולם ישן — אחד.
                מורת אופק — שניים, ולא אותו מספר: דבורי גלפרין היא 91%
                באופק ו-103% בעולם הישן. הפער בין שתי הסימולציות הוא
                תוספת בית חב"ד, ולכן שדה הבסיס אינו פחות חשוב מהאחר.
              */
              const fields = [
                { which:'ofek', label:'אחוז משרה', done: scopeConfirmed(t),
                  now: t.scopePct ?? t.scope, sugg: suggestedScope(t),
                  hint: isOfek
                    ? `${t.frontalHours || 0} ש׳ מתוך ${baseFrontalFor(t)}`
                    : `${t.frontalHours || 0} ש׳${hr > 0 ? ` + ${hr} חינוך` : ''} מתוך ${PRE_FRONTAL}` },
              ];
              return (
                <div key={t.id} className="apple-card" style={{ padding:'10px 12px' }}>
                  <p style={{ fontSize:13.5, fontWeight:600, color:'var(--text)', marginBottom:2 }}>
                    {t.name}
                    <span style={{ fontWeight:400, fontSize:11.5, color:'var(--text3)' }}>
                      {' · '}{reformLabel(t.reform)}
                      {` · ${DEGREE_LABELS[t.degree] || t.degree || 'בלי תואר'}`}
                      {` · ${t.seniority ?? 1} שנות ותק`}
                      {hasSim && <span style={{ color:'var(--warn)', fontWeight:700 }}> · יש סימולציה — שינוי יאפס אותה</span>}
                    </span>
                  </p>
                  {/* הגמול משנה את האחוז — מחנכת מקבלת 3 שעות מעליו, ושאר
                      הגמולים אחוז מהשכר. בלי לראות אותו אי אפשר להחליט. */}
                  <p style={{ fontSize:11.5, color:'var(--text3)', marginBottom:4 }}>
                    {t.role && t.role !== 'none'
                      ? <span style={{ color:'var(--purple)', fontWeight:600 }}>{ROLE_SHORT[t.role] || t.role}</span>
                      : <span>ללא גמול תפקיד</span>}
                    {isOfek && t.grade ? ` · דרגה ${t.grade}` : ''}
                    {t.level && LEVELS[t.level] ? ` · ${LEVELS[t.level].label}` : ''}
                  </p>
                  {/* מספר הילדים והמין — לכל מורה עם ילדים, בשני המסלולים.
                      קודם הוצג לעולם ישן בלבד, וכל השורות עם ילדים ברשימה
                      היו מורות אופק — כך שהשאלה לא נראתה לאיש. גם למורת
                      אופק זה נחוץ: סימולציית הבסיס שלה היא עולם ישן, ושם
                      תוספת אם קיימת. */}
                  {(t.childrenUnder18 || 0) > 0 && (
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:4 }}>
                      <span style={{ fontSize:11.5, color: t.gender ? 'var(--text3)' : 'var(--warn)', fontWeight: t.gender ? 400 : 700 }}>
                        {`${t.childrenUnder18} ילדים עד 18 · `}
                        {t.gender === 'f' ? 'אֵם' : t.gender === 'm' ? 'גבר — אין תוספת אם' : 'מי היא?'}
                        {t.gender === 'f' && isOfek ? ' — רלוונטי לאחוז בעולם הישן' : ''}
                        {!t.gender ? ' בלי זה אין תוספת אם' : ''}
                      </span>
                      {[{ v:'f', l:'אישה' }, { v:'m', l:'גבר' }].map(o => (
                        <button key={o.v} onClick={() => saveGender(t, o.v)}
                          className={`apple-btn ${t.gender === o.v ? 'apple-btn-blue' : 'apple-btn-ghost'}`}
                          style={{ minHeight:28, padding:'0 11px', fontSize:11.5 }}>
                          {o.l}
                        </button>
                      ))}
                      {flash[`${t.id}|gender`] && <span style={{ fontSize:11, color:'var(--ok)', fontWeight:700 }}>✓</span>}
                    </div>
                  )}
                  {fields.map(f => {
                    const key = `${t.id}|${f.which}`;
                    const cur = vals[key] ?? '';
                    return (
                      <div key={f.which} style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginTop:6 }}>
                        <div style={{ flex:'1 1 150px', minWidth:0 }}>
                          <p style={{ fontSize:12, fontWeight:600, color: f.done ? 'var(--text2)' : 'var(--warn)' }}>
                            {f.label}
                            {f.done && <span style={{ color:'var(--ok)', fontWeight:700 }}>{` · ${f.now}%`}</span>}
                            {flash[key] && <span style={{ marginInlineStart:6, fontSize:11, color:'var(--ok)', fontWeight:700 }}>✓ נקבע</span>}
                          </p>
                          <p style={{ fontSize:11, color:'var(--text3)' }}>{f.hint}</p>
                        </div>
                        <input type="number" inputMode="numeric" className="apple-input" dir="ltr" placeholder="%"
                          value={cur}
                          onChange={e => setVals(v => ({ ...v, [key]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(t, f.which, cur); } }}
                          style={{ width:82, fontSize:14, minHeight:36, textAlign:'center' }} />
                        <button className="apple-btn apple-btn-blue" onClick={() => save(t, f.which, cur)}
                          disabled={String(cur).trim() === ''}
                          style={{ minHeight:36, padding:'0 13px', opacity: String(cur).trim() === '' ? .45 : 1 }}>
                          שמור
                        </button>
                        {/* הצעה, לא ברירת מחדל. לעולם הישן של מורת אופק אין
                            נוסחה — האחוז שם אינו נגזר מהשעות, ולכן אין כפתור. */}
                        {f.sugg != null && (
                          <button className="apple-btn apple-btn-ghost" onClick={() => save(t, f.which, f.sugg)}
                            title="מחושב מהשעות שהמנהלת הזינה. אפשר להתעלם ולהקליד מספר אחר."
                            style={{ minHeight:36, padding:'0 11px', fontSize:12 }}>
                            {`לפי השעות · ${f.sugg}%`}
                          </button>
                        )}
                        <button className="apple-btn apple-btn-ghost" onClick={() => save(t, f.which, 100)}
                          style={{ minHeight:36, padding:'0 11px', fontSize:12 }}>
                          100%
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}

          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   שולחן השכר — חשבת השכר ושרה, מסך אחד ושתי לשוניות לכל אחת

   החליף את מסך הסימולציה. שם היה iframe של המחשבון הרשמי, שתי עמודות
   ברוטו והרצה ידנית; מתוך 28 הסימולציות שנבדקו מול המחשבון 8 התאימו,
   והפערים היו בקלט. שרה הכריעה שהכיוון שגוי: הפער בין המסלולים אינו
   עניינה, וחשבת השכר מזינה ברוטו ועלות מעביד.

   שרה רואה כאן את אחוזי המשרה שהיא קובעת. חשבת השכר רואה את ההזנה
   ואת המסמכים. אף אחת לא רואה את הלשונית של השנייה — לא כדי להסתיר,
   אלא כי שמירה שם הייתה נחסמת בשרת ממילא.
═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   התראות

   הקו ששולח את הוואטסאפ רשום על הנייד של שרה, ולכן הודעה אליה אינה
   יכולה להגיע — וואטסאפ אינו מוסר ממספר אל עצמו. שתי הודעות חל"ד
   אמיתיות הוכיחו זאת: הן נרשמו "נשלחו" ונחתו בצ'אט "הודעות לעצמי".

   לכן ההתראות שלה נשארות כאן. מה שיצא באמת למנהלות ולחשבת מוצג לצידן,
   עם הסטטוס — כדי שיהיה מקום אחד שאומר מה המערכת אמרה ולמי.
═══════════════════════════════════════════════════════════════ */
function NotificationsView() {
  const [rows, setRows] = useState(null);
  const [err,  setErr]  = useState('');
  const [tab,  setTab]  = useState('mine');

  // כל setState קורה אחרי await ולא בגוף האפקט — אפקט שקורא setState
  // ישירות רץ פעמיים ב-StrictMode ומרנדר מחדש בלי סיבה.
  const load = useCallback(async () => {
    try { setRows(await store.listNotifications()); }
    catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { let alive = true; (async () => { if (alive) await load(); })(); return () => { alive = false; }; }, [load]);

  if (err)   return <p style={{ padding:20, color:'var(--danger)', fontSize:13 }}>{err}</p>;
  if (!rows) return null;

  const mine = rows.filter(n => n.channel === 'inapp');
  const sent = rows.filter(n => n.channel !== 'inapp');
  const list = tab === 'mine' ? mine : sent;
  const unread = mine.filter(n => !n.readAt).length;

  const KIND_LABEL = {
    report_due_summary: 'סיכום ה-5 בחודש',
    payroll_cutoff:     'סגירת ה-6 — מי לא עברה לשכר',
    maternity_alert:    'חופשת לידה',
    report_reminder:    'תזכורת דיווח',
    test_line:          'בדיקת קו',
  };
  const when = iso => new Date(iso).toLocaleString('he-IL', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });

  const markRead = async (n) => {
    if (n.readAt) return;
    try { await store.markNotificationRead(n.id); await load(); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="fade-in" style={{ maxWidth:820, margin:'0 auto', padding:'18px 20px 40px' }} dir="rtl">
      <div className="apple-seg" style={{ marginBottom:14 }}>
        <button onClick={() => setTab('mine')} className={['apple-seg-item', tab === 'mine' ? 'active' : ''].join(' ')}
          style={{ padding:'6px 13px', fontSize:13 }}>
          אליי{unread ? ` (${unread})` : ''}
        </button>
        <button onClick={() => setTab('sent')} className={['apple-seg-item', tab === 'sent' ? 'active' : ''].join(' ')}
          style={{ padding:'6px 13px', fontSize:13 }}>
          מה שנשלח ({sent.length})
        </button>
      </div>

      {tab === 'mine' && (
        <p style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6, marginBottom:12 }}>
          כאן נשמרת כל התראה שהמערכת הפיקה, גם אחרי שהיא נשלחה בוואטסאפ.
          הוואטסאפ נעלם בין הודעות; זה נשאר.
        </p>
      )}

      {list.length === 0 && (
        <p style={{ fontSize:13, color:'var(--text3)', textAlign:'center', padding:'40px 0' }}>
          {tab === 'mine' ? 'אין התראות' : 'טרם נשלחו הודעות'}
        </p>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {list.map(n => (
          <div key={n.id} className="apple-card" onClick={() => markRead(n)}
            style={{ padding:'12px 14px', cursor: n.readAt || tab !== 'mine' ? 'default' : 'pointer',
                     borderRight: !n.readAt && tab === 'mine' ? '3px solid var(--purple)' : '3px solid transparent' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>
                {KIND_LABEL[n.kind] || n.kind}
              </span>
              {tab === 'sent' && (
                <span className={`apple-badge badge-${n.status === 'sent' ? 'green' : n.status === 'failed' ? 'orange' : 'purple'}`}
                  style={{ fontSize:10.5, padding:'2px 8px' }}>
                  {n.status === 'sent' ? 'נשלח' : n.status === 'failed' ? 'נכשל' : 'ממתין'} · {n.toName || ''}
                </span>
              )}
              <span style={{ fontSize:11, color:'var(--text3)', marginInlineStart:'auto' }}>{when(n.createdAt)}</span>
            </div>
            <p style={{ fontSize:12.5, color:'var(--text2)', whiteSpace:'pre-wrap', lineHeight:1.6 }}>{n.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayrollDesk({ teachers, schools, onSavePayroll, onSaveActual, onSaveScope,
                       activeMonth, userRole, userId }) {
  const isClerk = userRole === 'clerk';
  const canSetScope = userRole === 'coordinator';
  const scopeTodo = canSetScope ? teachers.filter(scopeMissing).length : 0;
  const [tab, setTab] = useState(isClerk ? 'entry' : (scopeTodo ? 'scope' : 'entry'));

  const rows = teachers.filter(t => !unpaidThisMonth(t));
  const missingGross = rows.filter(t => !simComplete(t)).length;
  const missingCost  = rows.filter(t => simComplete(t) && !t._actualEmployerCost).length;

  return (
    <div className="fade-in" style={{ maxWidth:1400, margin:'0 auto', padding:'18px 20px 40px' }} dir="rtl">
      <div className="apple-seg" style={{ marginBottom:14, flexWrap:'wrap' }}>
        {canSetScope && (
          <button onClick={() => setTab('scope')} className={['apple-seg-item', tab === 'scope' ? 'active' : ''].join(' ')}
            style={{ padding:'6px 13px', fontSize:13 }}>
            <Percent size={12} strokeWidth={2.6} style={{ marginInlineEnd:4 }} />
            אחוזי משרה{scopeTodo > 0 ? ` (${scopeTodo})` : ''}
          </button>
        )}
        <button onClick={() => setTab('entry')} className={['apple-seg-item', tab === 'entry' ? 'active' : ''].join(' ')}
          style={{ padding:'6px 13px', fontSize:13 }}>
          הזנת שכר{missingGross > 0 ? ` (${missingGross})` : ''}
        </button>
        <button onClick={() => setTab('cost')} className={['apple-seg-item', tab === 'cost' ? 'active' : ''].join(' ')}
          style={{ padding:'6px 13px', fontSize:13 }}>
          עלות מעביד בפועל{missingCost > 0 ? ` (${missingCost})` : ''}
        </button>
        <button onClick={() => setTab('docs')} className={['apple-seg-item', tab === 'docs' ? 'active' : ''].join(' ')}
          style={{ padding:'6px 13px', fontSize:13 }}>
          תלושים ומסמכים
        </button>
      </div>

      {tab === 'scope' && canSetScope && <ScopePanel teachers={teachers} schools={schools} onSave={onSaveScope} />}
      {tab === 'entry' && <PayrollEntry teachers={rows} schools={schools} onSave={onSavePayroll} />}
      {tab === 'cost'  && <ActualCostPanel teachers={teachers} schools={schools} onSave={onSaveActual} />}
      {tab === 'docs'  && (
        <MonthDocuments monthKey={activeMonth} schools={schools} userRole={userRole} userId={userId} />
      )}
    </div>
  );
}

/* ── הזנת הברוטו ותוספת בית חב"ד ────────────────────────────────
   שתי עמודות בלבד, ולצידן מה שהמערכת יודעת: אחוז המשרה שנקבע והאומדן
   שלנו לעלות המעביד. האומדן מוצג כדי שיהיה במה להשוות, לא כדי להחליף.
*/
function PayrollEntry({ teachers, schools, onSave }) {
  const [vals,  setVals]  = useState({});
  const [flash, setFlash] = useState({});
  const [busy,  setBusy]  = useState(null);
  const [err,   setErr]   = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);

  const shown = teachers.filter(t => !onlyMissing || !simComplete(t));
  const bySchool = schools
    .map(sc => ({ school: sc, list: shown.filter(t => t.schoolId === sc.id) }))
    .filter(g => g.list.length);

  const save = async (t, patch) => {
    setBusy(t.id); setErr('');
    try {
      const ok = await onSave(t.id, patch);
      if (ok !== false) {
        setVals(v => { const x = { ...v }; delete x[`${t.id}|gross`]; delete x[`${t.id}|supp`]; return x; });
        setFlash(f => ({ ...f, [t.id]: true }));
        setTimeout(() => setFlash(f => { const x = { ...f }; delete x[t.id]; return x; }), 1500);
      }
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const num = v => (String(v).trim() === '' ? null : Math.round(Number(v)));

  if (!teachers.length) return (
    <p style={{ fontSize:13, color:'var(--text3)', textAlign:'center', padding:'48px 16px' }}>
      אין עובדות בחודש הזה
    </p>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
        <p style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6, flex:'1 1 240px' }}>
          הברוטו שאת מזינה הוא מה שרץ בתשלומים. תוספת בית חב"ד היא החלק שאינו
          פנסיוני ואינו נושא קרן השתלמות — הוא נושא מס שכר וביטוח לאומי בלבד.
        </p>
        <div className="apple-seg" style={{ flexShrink:0 }}>
          <button onClick={() => setOnlyMissing(true)} className={['apple-seg-item', onlyMissing ? 'active' : ''].join(' ')}
            style={{ padding:'5px 11px', fontSize:12 }}>ממתינות</button>
          <button onClick={() => setOnlyMissing(false)} className={['apple-seg-item', !onlyMissing ? 'active' : ''].join(' ')}
            style={{ padding:'5px 11px', fontSize:12 }}>כל העובדות</button>
        </div>
      </div>
      {err && <p style={{ fontSize:12.5, color:'var(--danger)' }}>{err}</p>}

      {bySchool.length === 0 && (
        <div style={{ textAlign:'center', padding:'48px 16px' }}>
          <div style={{ width:56, height:56, borderRadius:17, background:'var(--ok-bg)', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Check size={26} strokeWidth={2.4} color="var(--ok)" />
          </div>
          <p style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>כל הברוטו הוזן</p>
        </div>
      )}

      {bySchool.map(({ school, list }) => (
        <div key={school.id}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--purple)', marginBottom:8, padding:'5px 11px', background:'var(--purple-100)', border:'1px solid #D8CEEF', borderRadius:999, display:'inline-flex', alignItems:'center', gap:6 }}>
            <School size={13} strokeWidth={2.2} />
            {school.name}
            {school.chabadSupp === false && <span style={{ fontWeight:400 }}> · בלי תוספת בית חב"ד</span>}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {list.map(t => {
              const emp = calcEmployer(t);
              const gCur = vals[`${t.id}|gross`] ?? (t._officialGross ?? '');
              const sCur = vals[`${t.id}|supp`]  ?? (t._chabadSupp ?? '');
              const noSupp = school.chabadSupp === false || isPrincipalRow(t);
              return (
                <div key={t.id} className="apple-card" style={{ padding:'10px 12px' }}>
                  <p style={{ fontSize:13.5, fontWeight:600, color:'var(--text)' }}>
                    {t.name}
                    <span style={{ fontWeight:400, fontSize:11.5, color:'var(--text3)' }}>
                      {` · ${reformLabel(t.reform)} · ${DEGREE_LABELS[t.degree] || t.degree || '—'}`}
                      {` · ותק ${t.seniority ?? 1} · ${effectiveScope(t)}% משרה`}
                      {t.role && t.role !== 'none' ? ` · ${ROLE_SHORT[t.role] || t.role}` : ''}
                    </span>
                    {flash[t.id] && <span style={{ marginInlineStart:6, fontSize:11.5, color:'var(--ok)', fontWeight:700 }}>✓ נשמר</span>}
                  </p>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginTop:6 }}>
                    <label style={{ fontSize:11.5, color:'var(--text3)' }}>
                      ברוטו
                      <input type="number" min="0" dir="ltr" className="apple-input"
                        value={gCur}
                        onChange={e => setVals(v => ({ ...v, [`${t.id}|gross`]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        onBlur={e => { const n = num(e.target.value); if (n !== (t._officialGross ?? null)) save(t, { gross: n }); }}
                        style={{ width:104, minHeight:36, textAlign:'center', fontWeight:700, marginInlineStart:6 }} />
                    </label>
                    {!noSupp && (
                      <label style={{ fontSize:11.5, color:'var(--text3)' }}>
                        תוספת בית חב"ד
                        <input type="number" min="0" dir="ltr" className="apple-input"
                          value={sCur}
                          onChange={e => setVals(v => ({ ...v, [`${t.id}|supp`]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          onBlur={e => { const n = num(e.target.value); if (n !== (t._chabadSupp ?? null)) save(t, { chabadSupp: n }); }}
                          style={{ width:96, minHeight:36, textAlign:'center', fontWeight:700, marginInlineStart:6,
                                   background:'var(--purple-100)' }} />
                      </label>
                    )}
                    {simComplete(t) && (
                      <span style={{ fontSize:11.5, color:'var(--text3)' }}>
                        {`עלות מעביד לפי הנוסחה: ${emp.estimate.toLocaleString('he-IL')} ₪ (${emp.pct}%)`}
                        {` · סה״כ ${emp.total.toLocaleString('he-IL')} ₪`}
                      </span>
                    )}
                    {busy === t.id && <span style={{ fontSize:11.5, color:'var(--text3)' }}>שומר…</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
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
        <LinkField label="ימי נסיעה"      value={draft.travelDays}    onChange={v => set('travelDays', v)} hint="ימי עבודה בפועל" />
        <LinkField label="ילדים עד גיל 5" value={draft.daycareChildren} onChange={v => set('daycareChildren', v)} hint="לתוספת מעונות, עד שניים" />
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

/* ═══ קליטת עובדת הוראה — קישור אישי ═══ */
const OB_DEADLINE = 'יום ראשון, 6.9.2026';

// חתימה מצוירת באצבע או בעכבר
function SignaturePad({ onChange }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const pos = e => {
    const r = ref.current.getBoundingClientRect();
    const p2 = e.touches ? e.touches[0] : e;
    return { x: p2.clientX - r.left, y: p2.clientY - r.top };
  };
  const start = e => { drawing.current = true; const c = ref.current.getContext('2d'); const { x, y } = pos(e); c.beginPath(); c.moveTo(x, y); e.preventDefault(); };
  const move  = e => { if (!drawing.current) return; const c = ref.current.getContext('2d');
    c.lineWidth = 2.2; c.lineCap = 'round'; c.strokeStyle = '#1A0B35';
    const { x, y } = pos(e); c.lineTo(x, y); c.stroke(); dirty.current = true; e.preventDefault(); };
  const end = () => { if (drawing.current && dirty.current) ref.current.toBlob(b => onChange(b), 'image/png'); drawing.current = false; };
  const clear = () => { const c = ref.current.getContext('2d'); c.clearRect(0, 0, 400, 140); dirty.current = false; onChange(null); };
  return (
    <div>
      <canvas ref={ref} width={400} height={140}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        style={{ width:'100%', maxWidth:400, height:140, background:'#fff', border:'2px dashed var(--line)', borderRadius:12, touchAction:'none', display:'block' }} />
      <button type="button" onClick={clear} className="apple-btn apple-btn-ghost" style={{ marginTop:6, minHeight:30, padding:'0 12px', fontSize:12 }}>ניקוי חתימה</button>
    </div>
  );
}

function ObUpload({ label, hint, done, onFile }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="apple-card" style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', cursor:'pointer', border: done ? '1.5px solid var(--ok)' : '1.5px dashed var(--line)' }}>
      <input type="file" accept="image/*,.pdf" style={{ display:'none' }}
        onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); try { await onFile(f); } finally { setBusy(false); } }} />
      <div style={{ width:40, height:40, borderRadius:12, background: done ? 'var(--ok-bg)' : 'var(--purple-100)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        {done ? <Check size={20} strokeWidth={2.6} color="var(--ok)" /> : <Upload size={18} strokeWidth={2.2} color="var(--purple)" />}
      </div>
      <div style={{ flex:1 }}>
        <p style={{ fontWeight:700, fontSize:14, color:'var(--text)' }}>{label}</p>
        <p style={{ fontSize:12, color:'var(--text3)' }}>{busy ? 'מעלה…' : done ? 'הועלה ✓ — אפשר להחליף' : hint}</p>
      </div>
    </label>
  );
}

function OnboardingView({ code }) {
  const [me, setMe] = useState(null);
  const [state, setState] = useState('loading');
  const [form, setForm] = useState({});
  const [sig, setSig] = useState(null);
  const [contractSig, setContractSig] = useState(null);
  const [contractUrl, setContractUrl] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await store.obWhoami(code);
      if (!d) { setState('bad'); return; }
      setMe(d); setForm(f => ({ ...(d.form101 || {}), ...f })); setState('ok');
      if (d.contract_available) store.obDownload('contract/contract.pdf').then(setContractUrl).catch(() => {});
    } catch { setState('bad'); }
  }, [code]);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  if (state === 'loading') return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }} dir="rtl"><p style={{ color:'var(--text3)' }}>טוען…</p></div>;
  if (state === 'bad') return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center' }} dir="rtl"><p style={{ fontWeight:700 }}>הקישור אינו תקף. פני לשרה הגר.</p></div>;

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const steps = [
    me.form101_signed, me.has_id_doc, me.has_salary_form, me.has_ministry_file,
    me.contract_available ? me.contract_signed : null,   // null = עוד לא זמין
  ];
  const doneCount = steps.filter(x => x === true).length;
  const totalSteps = steps.filter(x => x !== null).length;

  const sign101 = async () => {
    for (const [k, l] of [['firstName','שם פרטי'], ['lastName','שם משפחה'], ['birth','תאריך לידה'], ['address','כתובת'], ['city','עיר'], ['marital','מצב משפחתי'], ['otherIncome','הכנסה נוספת']]) {
      if (!String(form[k] ?? '').trim()) { setMsg(`יש למלא ${l}`); return; }
    }
    if (!form.declare) { setMsg('יש לאשר את ההצהרה'); return; }
    if (!sig) { setMsg('יש לחתום במסגרת החתימה'); return; }
    setMsg('');
    const path = await store.obUpload(code, 'signature', new File([sig], 'signature.png', { type:'image/png' }));
    await store.obSave(code, { form101: form, sign101: true, signature_path: path });
    await load();
  };
  const upload = slotKey => async f => {
    const path = await store.obUpload(code, slotKey, f);
    await store.obSave(code, { [slotKey + '_path']: path });
    await load();
  };
  const signContract = async () => {
    if (!contractSig) { setMsg('יש לחתום במסגרת החתימה על החוזה'); return; }
    const path = await store.obUpload(code, 'contract-signature', new File([contractSig], 'contract-sig.png', { type:'image/png' }));
    await store.obSave(code, { contract_signature_path: path, sign_contract: true });
    await load();
  };

  const field = (k, label, type = 'text', dir2) => (
    <div key={k} style={{ flex:'1 1 150px' }}>
      <p className="apple-label">{label}</p>
      <input type={type} dir={dir2} value={form[k] || ''} onChange={e => setF(k, e.target.value)} className="apple-input" style={{ width:'100%' }} />
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', paddingBottom:60 }} dir="rtl">
      <header className="app-header"><div style={{ maxWidth:640, margin:'0 auto', padding:'12px 16px', display:'flex', alignItems:'center', gap:11 }}>
        <img src="/logo-chabad.png" alt="לוגו" style={{ height:34 }} />
        <div><p style={{ fontWeight:700, fontSize:14.5 }}>קליטת עובדת הוראה</p>
        <p style={{ fontSize:11.5, color:'var(--text3)' }}>{me.name} · {me.school_name}</p></div>
      </div></header>

      <div style={{ maxWidth:640, margin:'0 auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
        {/* דדליין */}
        <div style={{ background:'var(--warn-bg)', border:'1px solid #FFB74D', borderRadius:12, padding:'10px 14px' }}>
          <p style={{ fontSize:13, fontWeight:700, color:'#E65100' }}>להשלמה עד {OB_DEADLINE}</p>
          <p style={{ fontSize:12, color:'#E65100' }}>רק מי שתשלים את כל השלבים עד למועד תקבל משכורת על חודש ספטמבר.</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1, height:8, background:'var(--fill)', borderRadius:99 }}>
            <div style={{ width:(totalSteps ? Math.round(doneCount / totalSteps * 100) : 0) + '%', height:'100%', background:'var(--teal)', borderRadius:99, transition:'width .3s' }} />
          </div>
          <span style={{ fontSize:12.5, fontWeight:700, color:'var(--text2)' }}>{doneCount} / {totalSteps}</span>
        </div>

        {/* ── שלב 1: טופס 101 ── */}
        <div className="apple-card" style={{ padding:18 }}>
          <p style={{ fontWeight:800, fontSize:16, marginBottom:2 }}>1 · טופס 101 — כרטיס עובד</p>
          {me.form101_signed ? (
            <p style={{ color:'var(--ok)', fontWeight:700, fontSize:13.5, marginTop:6 }}>✓ מולא ונחתם. תודה!</p>
          ) : (<>
            <p style={{ fontSize:12.5, color:'var(--text3)', marginBottom:12 }}>שנת המס 2026 · המעסיקה: רשת חינוך חב"ד</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
              {field('firstName','שם פרטי')}
              {field('lastName','שם משפחה')}
              <div style={{ flex:'1 1 150px' }}><p className="apple-label">ת.ז.</p>
                <input value={me.tz_id || form.tz || ''} onChange={e => setF('tz', e.target.value)} className="apple-input" dir="ltr" style={{ width:'100%' }} /></div>
              {field('birth','תאריך לידה','date')}
              {field('address','רחוב ומספר')}
              {field('city','עיר')}
              <div style={{ flex:'1 1 150px' }}><p className="apple-label">מצב משפחתי</p>
                <select value={form.marital || ''} onChange={e => setF('marital', e.target.value)} className="apple-select" style={{ width:'100%' }}>
                  <option value="">בחרי</option><option>רווקה</option><option>נשואה</option><option>גרושה</option><option>אלמנה</option>
                </select></div>
              {field('kids','ילדים עד גיל 18','number','ltr')}
              <div style={{ flex:'1 1 100%' }}><p className="apple-label">הכנסה נוספת ממעסיק אחר?</p>
                <select value={form.otherIncome || ''} onChange={e => setF('otherIncome', e.target.value)} className="apple-select" style={{ width:'100%' }}>
                  <option value="">בחרי</option>
                  <option value="no">אין — זו הכנסתי היחידה, מבקשת חישוב מס רגיל</option>
                  <option value="yes">יש — אמציא תיאום מס</option>
                </select></div>
            </div>
            <label style={{ display:'flex', gap:8, alignItems:'flex-start', marginTop:12, fontSize:12.5, color:'var(--text2)' }}>
              <input type="checkbox" checked={!!form.declare} onChange={e => setF('declare', e.target.checked)} style={{ marginTop:2 }} />
              <span>אני מצהירה כי הפרטים שמסרתי בטופס זה מלאים ונכונים, וידוע לי שמסירת פרטים לא נכונים היא עבירה על פקודת מס הכנסה.</span>
            </label>
            <p className="apple-label" style={{ marginTop:12 }}>חתימה (בתוך המסגרת, באצבע או בעכבר)</p>
            <SignaturePad onChange={setSig} />
            {msg && <p style={{ color:'var(--danger)', fontSize:12.5, fontWeight:600, marginTop:8 }}>{msg}</p>}
            <button className="apple-btn apple-btn-blue" onClick={() => sign101().catch(e => setMsg(e.message))} style={{ marginTop:12, width:'100%', minHeight:44 }}>
              חתימה ושליחת טופס 101
            </button>
          </>)}
        </div>

        {/* ── שלבים 2–4: העלאות ── */}
        <ObUpload label="2 · צילום תעודת זהות" hint="צלמי או העלי קובץ" done={me.has_id_doc} onFile={upload('id_doc')} />
        <ObUpload label="3 · טופס נתוני שכר — משרד החינוך" hint="הטופס מהפורטל של משרד החינוך" done={me.has_salary_form} onFile={upload('salary_form')} />
        <ObUpload label="4 · אסמכתת תיק במשרד החינוך (חובה)" hint="אישור קיום תיק עובד הוראה" done={me.has_ministry_file} onFile={upload('ministry_file')} />

        {/* ── שלב 5: חוזה ── */}
        <div className="apple-card" style={{ padding:18 }}>
          <p style={{ fontWeight:800, fontSize:16 }}>5 · חוזה העסקה</p>
          {!me.contract_available ? (
            <p style={{ fontSize:13, color:'var(--text3)', marginTop:6 }}>החוזה יעלה בקרוב — תקבלי הודעה כשיהיה מוכן לחתימה.</p>
          ) : me.contract_signed ? (
            <p style={{ color:'var(--ok)', fontWeight:700, fontSize:13.5, marginTop:6 }}>✓ נחתם. תודה!</p>
          ) : (<>
            {contractUrl && <a href={contractUrl} target="_blank" rel="noreferrer" className="apple-btn apple-btn-ghost" style={{ margin:'10px 0', textDecoration:'none' }}>
              <ExternalLink size={14} /> פתיחת החוזה לקריאה</a>}
            <p className="apple-label">חתימה על החוזה</p>
            <SignaturePad onChange={setContractSig} />
            <button className="apple-btn apple-btn-blue" onClick={() => signContract().catch(e => setMsg(e.message))} style={{ marginTop:10, width:'100%', minHeight:44 }}>
              קראתי ואני חותמת על החוזה
            </button>
          </>)}
        </div>

        <p style={{ fontSize:11.5, color:'var(--text3)', textAlign:'center' }}>שאלות? שרה הגר · רשת חינוך חב"ד</p>
      </div>
    </div>
  );
}

/* ═══ לוח קליטה — לשליחה: מי השלימה מה, קישורים וחוזה ═══ */
function OnboardingAdmin({ activeMonth, onClose }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => setRows(await store.listOnboarding()), []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const makeLinks = async () => {
    setBusy('יוצר קישורים…');
    try { const n = await store.createOnboardingLinks(activeMonth); setBusy(''); await load();
      alert(n ? `נוצרו ${n} קישורים חדשים` : 'לכל העובדות כבר יש קישור'); }
    catch (e) { setBusy(''); alert(e.message); }
  };
  const uploadContract = async f => {
    setBusy('מעלה חוזה…');
    try { await store.uploadContract(f); setBusy(''); alert('החוזה הועלה — יופיע אצל כל העובדות לחתימה'); }
    catch (e) { setBusy(''); alert(e.message); }
  };
  const copy = (code, name) => {
    navigator.clipboard.writeText(`${window.location.origin}/?f=${code}`);
    setCopied(name); setTimeout(() => setCopied(''), 1500);
  };

  const bySchool = {};
  for (const r of rows || []) (bySchool[r.schools?.name || '—'] ??= []).push(r);
  const doneOf = r => [r.form101_signed_at, r.id_doc_path, r.salary_form_path, r.ministry_file_path, r.contract_signed_at].filter(Boolean).length;
  const total = (rows || []).length;
  const complete = (rows || []).filter(r => doneOf(r) >= 5).length;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:70, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:16, overflowY:'auto', backdropFilter:'blur(6px)' }} onClick={onClose}>
      <div className="apple-card" onClick={e => e.stopPropagation()} style={{ width:'100%', maxWidth:860, padding:22, marginTop:20 }} dir="rtl">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap', marginBottom:4 }}>
          <div>
            <p style={{ fontWeight:800, fontSize:18 }}>קליטת עובדות — טופס 101, מסמכים וחוזה</p>
            <p style={{ fontSize:12.5, color:'var(--text3)' }}>דדליין: {OB_DEADLINE} · הושלמו {complete} / {total}</p>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button className="apple-btn apple-btn-blue" onClick={makeLinks} style={{ minHeight:36, fontSize:12.5 }}>
              יצירת קישורים לכל העובדות
            </button>
            <label className="apple-btn apple-btn-ghost" style={{ minHeight:36, fontSize:12.5, cursor:'pointer' }}>
              <Upload size={14} /> העלאת החוזה (PDF)
              <input type="file" accept="application/pdf" style={{ display:'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadContract(f); }} />
            </label>
            <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ minHeight:36 }}>סגירה</button>
          </div>
        </div>
        {busy && <p style={{ fontSize:12.5, color:'var(--text3)' }}>{busy}</p>}

        {rows === null ? <p style={{ color:'var(--text3)', padding:20 }}>טוען…</p> :
         !rows.length ? (
          <div style={{ textAlign:'center', padding:'30px 10px' }}>
            <p style={{ fontWeight:700 }}>אין עדיין קישורי קליטה</p>
            <p style={{ fontSize:12.5, color:'var(--text3)' }}>לחיצה על "יצירת קישורים" תפיק קישור אישי לכל עובדת בכל בתי הספר, מתוך חודש {fmtMonth(activeMonth)}.</p>
          </div>
        ) : Object.entries(bySchool).map(([sn, list]) => (
          <div key={sn} style={{ marginTop:14 }}>
            <p style={{ fontSize:12, fontWeight:700, color:'var(--purple)', marginBottom:6 }}>{sn} · {list.filter(r => doneOf(r) >= 5).length}/{list.length} הושלמו</p>
            <div style={{ overflowX:'auto' }}>
              <table className="apple-table" style={{ fontSize:12 }}>
                <thead><tr>
                  <th>עובדת</th><th style={{ textAlign:'center' }}>101</th><th style={{ textAlign:'center' }}>ת.ז.</th>
                  <th style={{ textAlign:'center' }}>נתוני שכר</th><th style={{ textAlign:'center' }}>תיק משה"ח</th>
                  <th style={{ textAlign:'center' }}>חוזה</th><th style={{ textAlign:'center' }}>קישור</th>
                </tr></thead>
                <tbody>
                  {list.map(r => {
                    const C = ok => ok
                      ? <Check size={15} strokeWidth={2.6} color="var(--ok)" />
                      : <span style={{ color:'var(--text3)' }}>—</span>;
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight:600 }}>{r.name}<span style={{ color:'var(--text3)', fontWeight:400 }}>{r.phone ? ` · ${r.phone}` : ' · אין טלפון'}</span></td>
                        <td style={{ textAlign:'center' }}>{C(r.form101_signed_at)}</td>
                        <td style={{ textAlign:'center' }}>{C(r.id_doc_path)}</td>
                        <td style={{ textAlign:'center' }}>{C(r.salary_form_path)}</td>
                        <td style={{ textAlign:'center' }}>{C(r.ministry_file_path)}</td>
                        <td style={{ textAlign:'center' }}>{C(r.contract_signed_at)}</td>
                        <td style={{ textAlign:'center' }}>
                          <button className="apple-btn apple-btn-ghost" onClick={() => copy(r.code, r.name)} style={{ minHeight:28, padding:'0 10px', fontSize:11.5 }}>
                            {copied === r.name ? 'הועתק ✓' : 'העתקה'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <p style={{ fontSize:11.5, color:'var(--text3)', marginTop:14 }}>
          השליחה בוואטסאפ נעשית דרך scripts/send-onboarding.mjs — הרצה יבשה קודם, שליחה רק באישורך.
        </p>
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
  const [obCode2] = useState(() => new URLSearchParams(window.location.search).get('f') || '');
  const [user,    setUser]    = useState(null);   // הפרופיל: תפקיד, שם, בית ספר
  const [schools, setSchools] = useState([]);
  const [months,  setMonths]  = useState({});
  // מועדי הדיווח לכל חודש — מסך הדיווח של המנהלת סופר לפיהם
  const [due,     setDue]     = useState({});
  const [activeMonth, setActiveMonth] = useState(nowMonthKey());
  const [booting, setBooting] = useState(true);
  const [error,   setError]   = useState('');
  const [busy,    setBusy]    = useState(false);

  /*
    ?v=calc בכתובת פותח ישר את מסך הסימולציה, ובתוכו את שלב אחוזי המשרה
    כשעוד חסרים. בלי זה אין דרך לשלוח קישור למסך מסוים — המצב חי בזיכרון
    בלבד, וכל קישור נחת בעמוד הבית. ערך שאינו מוכר מתעלמים ממנו.
  */
  const [view,          setView]          = useState(() => {
    const v = new URLSearchParams(window.location.search).get('v');
    return ['schools', 'calc', 'report', 'alerts'].includes(v) ? v : 'schools';
  });
  const [activeSchool,  setActiveSchool]  = useState(null);
  const [schoolModal,   setSchoolModal]   = useState(null);
  const [teacherModal,  setTeacherModal]  = useState(null);
  const [showApproval,  setShowApproval]  = useState(false);
  const [showBackup,    setShowBackup]    = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // כל שינוי נשמר בשרת ואז נטען מחדש. פשוט, ותמיד מסונכרן עם מה שבאמת נשמר.
  const refresh = useCallback(async () => {
    const data = await store.loadAll();
    setSchools(data.schools);
    for (const sc of (data.schools || [])) CHABAD_SUPP.set(sc.id, sc.chabadSupp !== false);
    setMonths(data.months);
    setDue(data.due || {});
    MM_REPLACED.clear();
    for (const [mk, rows2] of Object.entries(data.months || {}))
      for (const r2 of rows2 || [])
        if (String(r2.mmFor || '').trim()) MM_REPLACED.add(mmKey(mk, r2.schoolId, r2.mmFor));
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
        // מי שהגיעה עם ?v= בכתובת ביקשה מסך מסוים — לא דורסים אותה
        if (!new URLSearchParams(window.location.search).get('v')) {
          setView(profile.role === 'clerk' ? 'calc' : 'schools');
        }
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
    // מי שהגיעה עם ?v= בכתובת ביקשה מסך מסוים — לא דורסים אותה
    if (!new URLSearchParams(window.location.search).get('v')) {
      setView(profile.role === 'clerk' ? 'calc' : 'schools');
    }
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
  if (obCode2) return <OnboardingView code={obCode2} />;
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
      absenceDays: 0, mmHours: 0, mmFor: '', monthlyExtras: 0, travelDays: 0, daycareChildren: 0,
      _actualEmployerCost: null,
      // האישור עובר עם השורה: מה שלא השתנה אינו חוזר לאישור.
      // שינוי אמיתי מאפס אותו ממילא דרך מעקב השינויים.
      _snapshot: null,
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

  // החודש הראשון מסומן בבורר החודשים — זה כל תפקידו מעכשיו
  const firstMonthKey = Object.keys(months).sort()[0] || activeMonth;
  const needsSimCount      = teachers.filter(needsSim).length;
  const needsApprovalCount = teachers.filter(needsApproval).length;
  const sortedMonthKeys    = Object.keys(months).sort();

  // Principal goes directly to their school
  const principalSchool = user.role === 'principal' ? schools.find(s => s.id === user.schoolId) : null;

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }} dir="rtl">
      <UpdateBanner />

      <header className="app-header no-print">
        <div style={{ maxWidth:1152, margin:'0 auto', padding:'0 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, minHeight:60, flexWrap:'wrap' }}>

          <div onClick={() => isCoord && setView('schools')}
            style={{ display:'flex', alignItems:'center', gap:11, cursor: isCoord ? 'pointer' : 'default', padding:'9px 0' }}>
            <img src="/logo-chabad.png" alt="לוגו רשת" style={{ height:36, width:'auto', objectFit:'contain' }} />
            <div>
              <p style={{ fontWeight:700, fontSize:14.5, color:'var(--text)', letterSpacing:'-0.01em', lineHeight:1.25 }}>מערכת שכר מורים</p>
              <p style={{ fontSize:11.5, color:'var(--text3)', lineHeight:1.3 }}>
                {isCoord ? 'שליח / מנהל רשת' : isClerk ? 'חשבת שכר' : `מנהלת: ${principalSchool?.name || ''}`}
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
            {/* מה שהמערכת אמרה ולמי — הוואטסאפ נבלע בין הודעות, זה נשאר */}
            {(isCoord || isClerk) && (
              <button className={`nav-btn ${view==='alerts' ? 'active' : ''}`} onClick={() => setView('alerts')}>
                <Bell size={15} strokeWidth={2.2} />
                התראות
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
            {isCoord && (
              <button className="nav-btn" onClick={() => setShowOnboarding(true)}>
                <FileText size={15} strokeWidth={2.2} />
                קליטה
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
        {isClerk ? (
          <PayrollDesk
            teachers={teachers}
            schools={schools}
            activeMonth={activeMonth}
            userRole={user.role}
            userId={user.id}
            onSavePayroll={(id, patch) => run(() => store.savePayroll(id, patch))}
            onSaveActual={(id, amount) => run(() => store.saveActualCost(id, amount))}
            onSaveScope={(id, which, val) => run(() => store.saveTeacher(
              which === 'gender' ? { id, gender: val }
                : { id, scopePct: val, scopeSetAt: new Date().toISOString() }, activeMonth))}
          />
        ) : /* Principal: see only their school */
        !isCoord && principalSchool ? (
          <SchoolView userId={user.id}
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
            monthDue={due[activeMonth]}
            onReportMonth={(schoolId, key) =>
              store.reportMonth(schoolId, key).then(async r => { await refresh(); return r; })}
          />
        ) : view === 'calc' ? (
          <PayrollDesk
            teachers={teachers}
            schools={schools}
            activeMonth={activeMonth}
            userRole={user.role}
            userId={user.id}
            onSavePayroll={(id, patch) => run(() => store.savePayroll(id, patch))}
            onSaveActual={(id, amount) => run(() => store.saveActualCost(id, amount))}
            onSaveScope={(id, which, val) => run(() => store.saveTeacher(
              which === 'gender' ? { id, gender: val }
                : { id, scopePct: val, scopeSetAt: new Date().toISOString() }, activeMonth))}
          />
        ) : view === 'alerts' ? (
          <NotificationsView />
        ) : view === 'report' ? (
          <ReportView schools={schools} teachers={teachers} />
        ) : view === 'school' && activeSchool ? (
          <SchoolView userId={user.id}
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
      {showOnboarding && <OnboardingAdmin activeMonth={activeMonth} onClose={() => setShowOnboarding(false)} />}
      {schoolModal  && <SchoolModal  school={schoolModal}  onSave={onSaveSchool}  onClose={() => setSchoolModal(null)} />}
      {showBackup && <BackupModal schools={schools} months={months} onClose={() => setShowBackup(false)} />}
      {teacherModal && <TeacherModal teacher={teacherModal} schools={schools} userRole={user.role} onSave={onSaveTeacher} onClose={() => setTeacherModal(null)} />}
    </div>
  );
}
