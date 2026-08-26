import { useState, useEffect } from 'react';
import {
  Briefcase, Calculator, School, Check, ArrowLeft, ArrowRight,
  ChevronLeft, ChevronRight, Plus, LogOut, BarChart3, ClipboardCheck,
  Printer, Download, Upload, Send, Pencil, Trash2, X, Search,
  Paperclip, Image as ImageIcon, FileText, AlertTriangle, Lightbulb,
  CalendarClock, Bell, Users, FolderOpen, Database, FileSpreadsheet, ShieldAlert,
  ExternalLink, ShieldCheck,
} from 'lucide-react';
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
const calcUrl = id => CALC_BASE + (CALCULATORS.find(c => c.id === id) || CALCULATORS[0]).route;
// מסלול המורה -> המחשבון שמתאים לו
const calcForReform = reform => (reform === 'pre' ? 'old' : 'ofek');
// למנהלת בית ספר יש מחשבון נפרד — אופק ניהול
const calcForTeacher = t => (isPrincipalRow(t) ? 'mgmt' : calcForReform(t?.reform));

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
  return { scopePct: t.scopePct || 100, frontalHours: t.frontalHours || 26 };
}
// אחוז המשרה בפועל. עורך הטבלה כותב scopePct גם לעולם ישן, אבל רשומות
// ותיקות נשמרו ב-scope בלבד — ולכן שתיהן נקראות כאן.
function effectiveScope(t) {
  if (t.reform === 'ofek') return currentScope(t).scopePct || 100;
  return t.scope ?? t.scopePct ?? 100;
}
// תוספת אם עובדת קיימת בעולם ישן בלבד. באופק חדש אין לה ביטוי בשכר,
// ולכן מספר הילדים נאסף שם כמידע ואינו רכיב שכר.
// זכאות בעולם ישן: ילד אחד ומעלה עד גיל 18, בהיקף משרה 79% ומעלה.
function momBonusEligible(t) {
  return t.reform === 'pre' && (t.childrenUnder18 || 0) > 0 && effectiveScope(t) >= 79;
}
function calcGross(t) {
  if (t._officialGross) return Number(t._officialGross);
  const base  = calcBase(t);
  const role  = calcRoleSupp(base, t.role);
  const scope = effectiveScope(t);
  return Math.round((base + role) * scope / 100);
}
function calcNet(gross) { return Math.round(gross * 0.735); }
// אחוז המשרה נגזר מהשעות הפרונטליות ומהשלב, אחרי הפחתת הגיל.
// המנהלת מזינה שעות — האחוז מחושב, לא מוקלד.
function baseFrontalFor(t) {
  const lvl = LEVELS[t.level] || LEVELS.elementary;
  const agR = AGE_RED[t.ageGroup] || AGE_RED.none;
  return lvl.frontal - agR.f;
}
function scopeFromFrontal(t, hours) {
  const bf = baseFrontalFor(t);
  if (!bf) return t.scopePct ?? 100;
  return Math.round((Number(hours) || 0) / bf * 100);
}

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
// הוצאות המעביד מעל הברוטו. ביגוד והבראה כלולים בשיעור הזה ואינם מתווספים מעליו.
const EMPLOYER_RATE  = 0.40;   // על בסיס העולם הישן
const CHABAD_RATE    = 0.30;   // על רכיב תוספת בית חב"ד (מינימום)
const EMPLOYER_PCT   = Math.round(EMPLOYER_RATE * 100);   // לתצוגה
const CHABAD_PCT     = Math.round(CHABAD_RATE * 100);

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
  if (t.reform !== 'ofek') return { base: ofek, supplement: 0, gross: ofek };
  // אם האופק יוצא נמוך מהעולם הישן, העובדת נשארת עם העולם הישן
  const supplement = Math.max(0, ofek - old);
  return { base: old, supplement, gross: old + supplement };
}

// ברוטו למעסיק = בסיס + 40% · תוספת + 30%.
// זהו אומדן. כשהנהלת החשבונות מזינה את עלות המעביד בפועל, היא גוברת.
function calcEmployer(t) {
  const { base, supplement, gross } = payBreakdown(t);
  const employerBase = Math.round(base * EMPLOYER_RATE);
  const employerSupp = Math.round(supplement * CHABAD_RATE);
  const estimate = employerBase + employerSupp;
  const actual   = Number(t._actualEmployerCost) || 0;
  const social   = actual || estimate;
  return {
    gross, base, supplement, employerBase, employerSupp, social,
    estimate, isEstimate: !actual,
    total: gross + social,
    // לצורכי מידע בלבד — כמה מתוך העלות הם ביגוד והבראה. לא מתווסף לסכום.
    extras: calcExtras(t),
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
const needsNetApproval = (t, isFirstMonth) =>
  Boolean(isFirstMonth && t._approved && !t._netApproved);
const fullyApproved = (t, isFirstMonth) =>
  Boolean(t._approved && (!isFirstMonth || t._netApproved));

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
const load  = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const loadObj = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const save  = (k, d) => {
  try {
    localStorage.setItem(k, JSON.stringify(d));
    return true;
  } catch (e) {
    // QuotaExceededError או מצב פרטי — עד היום זה נבלע והמסך הציג "נשמר" בזמן שהדיסק לא עודכן.
    alert('השמירה נכשלה — ייתכן שאחסון הדפדפן מלא.\n\nאל תסגרי את החלון לפני שייצאת גיבוי.\n\n(' + (e && e.name ? e.name : 'שגיאה לא ידועה') + ')');
    return false;
  }
};
const uid   = () => Math.random().toString(36).slice(2, 10);

// Month helpers
const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const toMonthKey   = (y, m) => `${y}-${String(m).padStart(2,'0')}`;
const nowMonthKey  = () => { const d=new Date(); return toMonthKey(d.getFullYear(), d.getMonth()+1); };
const fmtMonth     = k => { if (!k) return ''; const [y,m]=k.split('-'); return `${MONTH_NAMES[Number(m)-1]} ${y}`; };
const nextMonthKey = k => { const [y,m]=k.split('-').map(Number); return m===12 ? toMonthKey(y+1,1) : toMonthKey(y,m+1); };

// Base fields — if changed, simulation clears for that month

const EMPTY_TEACHER = {
  id: '', schoolId: '', tzId: '', name: '', email: '',
  reform: 'ofek', level: 'elementary', grade: 1, degree: 'BA',
  seniority: 0, frontalHours: 26, scopePct: 100, scope: 100,
  role: 'none', ageGroup: 'none',
  isTemp: false, startDate: '', endDate: '', scopeChanges: [],
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
    id: uid(),
    schoolId: school.id,
    name: PRINCIPAL_PLACEHOLDER,
    role: PRINCIPAL_ROLE,
    reform: school.reform || 'ofek',
    _changedAt: new Date().toISOString(),
    _approved: false,
  };
}
// משלים שורת מנהלת לכל בית ספר שאין לו אחת בחודש הנתון
function withPrincipalRows(schools, teachers) {
  const missing = schools.filter(s => !teachers.some(t => t.schoolId === s.id && isPrincipalRow(t)));
  return missing.length ? [...teachers, ...missing.map(makePrincipalRow)] : teachers;
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

// מחזיר { schools, months } או זורק שגיאה עם הסבר בעברית
function parseBackup(text) {
  let d;
  try { d = JSON.parse(text); }
  catch { throw new Error('הקובץ אינו JSON תקין. ודאי שבחרת קובץ גיבוי שיצא מהמערכת.'); }
  if (!d || typeof d !== 'object') throw new Error('הקובץ ריק או פגום.');
  if (d.app !== 'salary-schools') throw new Error('זה לא קובץ גיבוי של מערכת השכר.');
  if (d.version > BACKUP_VERSION) throw new Error(`הגיבוי נוצר בגרסה חדשה יותר (${d.version}). עדכני את המערכת לפני השחזור.`);
  if (!Array.isArray(d.schools)) throw new Error('חסרה רשימת בתי הספר בקובץ.');
  if (!d.months || typeof d.months !== 'object' || Array.isArray(d.months)) throw new Error('חסרים נתוני החודשים בקובץ.');
  for (const [k, v] of Object.entries(d.months)) {
    if (!/^\d{4}-\d{2}$/.test(k)) throw new Error(`מפתח חודש לא תקין בקובץ: "${k}"`);
    if (!Array.isArray(v)) throw new Error(`נתוני החודש ${k} פגומים.`);
  }
  return { schools: d.schools, months: d.months, exportedAt: d.exportedAt };
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
  // האתר הוא SPA, וקישור עמוק ישיר ל-OfekNihul נופל חזרה לרשימת המחשבונים
  // ומציג את מחשבון אופק חדש. לכן טוענים קודם את הרשימה ורק אז מנווטים
  // ב-hash — בדיוק כמו לחיצה על הקישור בתוך האתר.
  const [src, setSrc] = useState(CALC_HOME);

  // הקומפוננטה ממופתחת ב-key לפי calcId בצד הקורא, ולכן החלפת מחשבון
  // מרכיבה אותה מחדש והמצב חוזר ל-loading בלי setState בתוך effect.
  useEffect(() => {
    // האתר מפנה את עצמו לרשימת המחשבונים בסיום האתחול, ולכן ניווט מוקדם
    // מדי נדרס. ממתינים שיתייצב ורק אז משנים את ה-hash.
    const route = setTimeout(() => { setSrc(url); setState('ready'); }, 3500);
    const slow  = setTimeout(() => setState(s => (s === 'loading' ? 'slow' : s)), 14000);
    return () => { clearTimeout(route); clearTimeout(slow); };
  }, [url]);

  return (
    <div style={{ position:'relative', flex:1, minHeight:0, ...style }}>
      <iframe
        src={src}
        onLoad={() => { if (src !== CALC_HOME) setState('ready'); }}
        style={{ width:'100%', height:'100%', border:'none', display:'block' }}
        title="מחשבון שכר רשמי — משרד החינוך"
        allow="fullscreen"
      />
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

function LoginScreen({ schools, onLogin }) {
  const [role, setRole] = useState('coordinator');
  const [schoolId, setSchoolId] = useState('');
  const canLogin = role !== 'principal' || schoolId;

  const ROLES_INFO = [
    { v: 'coordinator', Icon: Briefcase,  label: 'שליח / מנהל רשת', desc: 'אישור שינויים ודוחות' },
    { v: 'clerk',       Icon: Calculator, label: 'חשבת שכר',        desc: 'סימולציה והכנת שכר' },
    { v: 'principal',   Icon: School,     label: 'מנהלת בית ספר',   desc: 'עדכון נתוני מורים' },
    { v: 'network',     Icon: ShieldCheck, label: NETWORK_APPROVER,  desc: 'אישור רשתי בחודש הראשון' },
  ];

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'32px 18px' }} dir="rtl">
      <div style={{ width:'100%', maxWidth:440 }} className="spring-enter">

        <div style={{ textAlign:'center', marginBottom:26 }}>
          <img src="/logo-chabad.png" alt="רשת חינוך חב״ד"
            style={{ height:56, width:'auto', objectFit:'contain', margin:'0 auto 16px', display:'block' }} />
          <h1 style={{ fontSize:27, fontWeight:800, letterSpacing:'-0.03em', color:'var(--text)', marginBottom:5 }}>מערכת שכר מורים</h1>
          <p style={{ fontSize:14, color:'var(--text3)' }}>ניהול תקציב שכר — רשת בתי הספר</p>
        </div>

        <div className="apple-card" style={{ padding:'24px 22px' }}>
          <p className="apple-label" style={{ marginBottom:10 }}>כניסה בתור</p>

          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:18 }}>
            {ROLES_INFO.map(({ v, Icon, label, desc }) => {
              const isActive = role === v;
              return (
                <button key={v} onClick={() => { setRole(v); setSchoolId(''); }}
                  style={{
                    display:'flex', alignItems:'center', gap:13, padding:'13px 14px',
                    borderRadius:14, cursor:'pointer', textAlign:'right', width:'100%',
                    fontFamily:'inherit',
                    transition:'background .15s, border-color .15s, box-shadow .15s',
                    border: isActive ? '1.5px solid var(--purple)' : '1px solid var(--line)',
                    background: isActive ? 'var(--purple-100)' : 'var(--surface)',
                    boxShadow: isActive ? '0 2px 10px rgba(75,46,131,.12)' : 'none',
                  }}>
                  <span style={{
                    width:38, height:38, borderRadius:11, flexShrink:0,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    background: isActive ? 'var(--purple)' : 'var(--fill)',
                    color: isActive ? '#fff' : 'var(--text3)', transition:'background .15s',
                  }}>
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <span style={{ flex:1, minWidth:0 }}>
                    <span style={{ display:'block', fontWeight:700, fontSize:15, color:'var(--text)', marginBottom:1 }}>{label}</span>
                    <span style={{ display:'block', fontSize:12.5, color:'var(--text3)' }}>{desc}</span>
                  </span>
                  {isActive && <Check size={17} strokeWidth={3} color="var(--purple)" />}
                </button>
              );
            })}
          </div>

          {role === 'principal' && (
            <div style={{ marginBottom:16 }} className="fade-in">
              <p className="apple-label">בית הספר שלי</p>
              <select value={schoolId} onChange={e => setSchoolId(e.target.value)} className="apple-select">
                <option value="">— בחרי בית ספר —</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <button disabled={!canLogin} onClick={() => onLogin({ role, schoolId })}
            className="apple-btn apple-btn-blue"
            style={{ width:'100%', minHeight:48, fontSize:15.5, fontWeight:700 }}>
            כניסה למערכת
            <ArrowLeft size={17} strokeWidth={2.5} />
          </button>
        </div>

        <p style={{ textAlign:'center', fontSize:12, color:'var(--text3)', marginTop:18 }}>רשת חינוך חב״ד</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TEACHER DIFF
═══════════════════════════════════════════════════════════════ */
function TeacherDiff({ t }) {
  const diffs = diffT(t);
  const isNew = !t._snapshot;
  if (isNew) return <span className="apple-badge badge-blue">מורה חדש/ה</span>;
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
function NetworkApprovalView({ schools, teachers, isFirstMonth, monthLabel, onApprove }) {
  const [openSchool, setOpenSchool] = useState(null);

  const waiting = teachers.filter(t => needsNetApproval(t, isFirstMonth));
  const grouped = schools
    .map(s => ({ school: s, list: waiting.filter(t => t.schoolId === s.id) }))
    .filter(g => g.list.length > 0);
  const totalCost = waiting.reduce((s, t) => s + calcEmployer(t).total, 0);

  const confirmAnd = (list, what) => {
    if (!list.length) return;
    const cost = list.reduce((s, t) => s + calcEmployer(t).total, 0);
    const ok = window.confirm(
      `אישור ${what}\n\n${list.length} עובדות · עלות מעסיק ${cost.toLocaleString('he-IL')} ₪ לחודש\n\n`
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
                ? `${waiting.length} עובדות ממתינות · עלות מעסיק ${totalCost.toLocaleString('he-IL')} ₪ לחודש`
                : 'הכול מאושר'}
            </p>
          </div>
          {waiting.length > 0 && (
            <button className="apple-btn apple-btn-blue" onClick={() => confirmAnd(waiting, 'כל הרשת')}>
              <ShieldCheck size={15} strokeWidth={2.3} />
              אישור כל הרשת
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
                    {list.length} עובדות · {cost.toLocaleString('he-IL')} ₪ לחודש · {open ? 'הסתר' : 'הצג פירוט'}
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
                            <td style={{ textAlign:'center', fontWeight:800, color:'var(--purple)' }}>
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
                </div>
              )}
            </div>
          );
        })}

        <p style={{ fontSize:11.5, color:'var(--text3)', marginTop:14, lineHeight:1.7 }}>
          הסימון ~ מציין שעלות המעסיק היא אומדן שממתין לסכום מהנהלת החשבונות.
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
function buildEmailBody(school, teachers) {
  const ts  = teachers.filter(t => t.schoolId === school.id);
  const now = new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  const totGross = ts.reduce((s,t) => s + calcGross(t), 0);
  const totEmp   = ts.reduce((s,t) => s + calcEmployer(t).total, 0);
  const pending  = ts.filter(isPending);

  let body = `דוח שכר חודשי — ${school.name}\nתאריך: ${now}\n\n`;
  body += `סה"כ מורים: ${ts.length}\nברוטו: ${totGross.toLocaleString()} ₪\nברוטו למעסיק: ${totEmp.toLocaleString()} ₪\n`;
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

function sendMonthlyEmail(school, teachers) {
  const subject = encodeURIComponent(`דוח שכר חודשי — ${school.name}`);
  const body    = encodeURIComponent(buildEmailBody(school, teachers));
  const to      = school.principalEmail || '';
  const cc      = school.coordinatorEmail ? `&cc=${encodeURIComponent(school.coordinatorEmail)}` : '';
  window.open(`mailto:${to}?subject=${subject}${cc}&body=${body}`);
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
  const note1 = '# הנחיות מילוי: מלאי שורה אחת לכל מורה. אל תמחקי את שורת הכותרת.';
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
  const set = (k, v) => setT(p => ({ ...p, [k]: v }));


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
          <h2 style={{ fontSize:17, fontWeight:700, letterSpacing:'-0.02em', color:'var(--apple-text)' }}>{t.id ? 'עריכת מורה' : 'הוספת מורה'}</h2>
          <button onClick={onClose} style={{ background:'var(--apple-fill)', border:'none', borderRadius:'50%', width:28, height:28, fontSize:14, cursor:'pointer', color:'var(--text3)', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={15} strokeWidth={2.4} /></button>
        </div>
        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>

          {/* שם + ת.ז */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p className="apple-label">שם המורה</p>
              <input value={t.name} onChange={e => set('name', e.target.value)} placeholder="שם מלא" className="apple-input" />
            </div>
            <div>
              <p className="apple-label">תעודת זהות</p>
              <input value={t.tzId} onChange={e => set('tzId', e.target.value)} placeholder="000000000" dir="ltr" className="apple-input" style={{ fontFamily:'monospace' }} />
            </div>
          </div>

          {/* מייל */}
          <div>
            <p className="apple-label">מייל המורה</p>
            <input value={t.email || ''} onChange={e => set('email', e.target.value)} placeholder="teacher@school.edu" dir="ltr" className="apple-input" />
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
              <input type="range" min={1} max={140} value={t.scope} onChange={e => set('scope', +e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
            </div>
          </>)}

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
              </p>
            )}
            {t.reform === 'pre' && (t.childrenUnder18||0) > 0 && !momBonusEligible(t) && (
              <p style={{ fontSize:12, color:'var(--apple-orange)', marginTop:8 }}>
                אחוז משרה נמוך מ-79% — אין זכאות לתוספת אם
              </p>
            )}
          </div>

          {/* שכר מהסימולטור הרשמי */}
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
                  בחודש הראשון העלות היא אומדן לפי {EMPLOYER_PCT}% על הבסיס ו-{CHABAD_PCT}% על התוספת.
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
                [`הוצאות מעביד`, emp.social, emp.isEstimate
                  ? `אומדן — ${EMPLOYER_PCT}% על הבסיס${emp.supplement ? ` · ${CHABAD_PCT}% על התוספת` : ''}`
                  : 'סכום בפועל מהנהלת החשבונות'],
              ].map(([label, val, note]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10, padding:'5px 0' }}>
                  <span style={{ fontSize:12.5, color:'var(--text2)' }}>
                    {label}
                    {note && <span style={{ fontSize:11, color:'var(--text3)', marginInlineStart:6 }}>{note}</span>}
                  </span>
                  <span className="num" style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{val.toLocaleString('he-IL')} ₪</span>
                </div>
              ))}
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
            {t.id ? 'שמור שינויים' : 'הוסף מורה'}
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
          <button className="apple-btn apple-btn-blue" onClick={() => { if (!s.name?.trim()) return; onSave({ ...s, reform: s.reform || 'ofek' }); }} style={{ flex:1 }}>שמור</button>
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
          <h1 style={{ fontSize:24, fontWeight:800, letterSpacing:'-0.02em', color:'var(--apple-text)', marginBottom:4 }}>דוח שכר מורים</h1>
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
            { label: 'סה"כ מורים', val: ts.length },
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
                  <td style={{ textAlign:'center' }}>{derived ? derived.frontal : '—'}</td>
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
          ברוטו למעסיק = בסיס + {EMPLOYER_PCT}% · תוספת בית חב"ד + {CHABAD_PCT}% (כולל ביגוד והבראה)<br/>
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
function SchoolView({ school, teachers, userRole, onBack, onSaveTeacher, onDeleteTeacher, onApproveTeacher, onImportTeachers, activeMonth, fmtMonthFn, isFirstMonth }) {
  const [search, setSearch]           = useState('');
  const [showReport, setShowReport]   = useState(false);
  const [showAbsence, setShowAbsence] = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [fullEdit, setFullEdit]      = useState(null);   // מורה בעריכת פרטים מלאים
  const [details, setDetails]        = useState(null);   // נתוני העסקה לחתימה
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
  const hoursQuota = Number(school.hoursQuota) || null;
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
        frontal: derived ? derived.frontal : '',
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
        costSource: done ? (emp.isEstimate ? `אומדן ${EMPLOYER_PCT}%/${CHABAD_PCT}%` : 'בפועל — הנהלת חשבונות') : '',
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
  const startNew  = () => { setEditingId('new'); setEditData({ ...EMPTY_TEACHER, schoolId: school.id, reform: school.reform || 'ofek', id: uid() }); };
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
                {school.city}{school.city ? ' · ' : ''}מסלול {reformLabel(school.reform)}
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
              הוסף מורה
            </button>
            <button className="apple-btn apple-btn-ghost" onClick={() => sendMonthlyEmail(school, teachers)}
              title={school.principalEmail ? `שלח ל: ${school.principalEmail}` : 'הגדר מייל מנהלת'}
              style={{ minHeight:38, fontSize:13.5 }}>
              <Send size={14} strokeWidth={2.2} />
              {isCoord ? 'שלח לאישור' : 'שלח לשליח'}
            </button>

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
              title={ts.length === 0 ? 'אין מורות לייצוא' : 'ייצוא הטבלה לקובץ CSV'} style={{ minHeight:38, fontSize:13.5 }}>
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
              { label:'מורות',          val: ts.length.toLocaleString('he-IL'), sub: `${tsOfficial.length} עם סימולציה מלאה` },
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
                <th style={{ textAlign:'center' }}>רפורמה</th>
                <th style={{ textAlign:'center' }}>% משרה</th>
                <th style={{ textAlign:'center' }}>תואר</th>
                <th style={{ textAlign:'center' }}>דרגת אופק</th>
                <th style={{ textAlign:'center' }}>ותק</th>
                <th style={{ textAlign:'center' }}>פרונטלי</th>
                <th style={{ textAlign:'center' }}>שיבוץ</th>
                <th style={{ textAlign:'center' }}>ילדים</th>
                <th style={{ textAlign:'center' }}>העדרות (ימים)</th>
                <th style={{ textAlign:'center' }}>ממ"מ שעות</th>
                <th style={{ textAlign:'center' }}>במקום מי</th>
                <th style={{ textAlign:'center' }}>תוספות (₪)</th>
                <th style={{ textAlign:'center' }} title="השכר שרץ במערכת התשלומים">עולם ישן — בסיס (₪)</th>
                <th style={{ textAlign:'center' }} title="סימולציית אופק חדש — רק למורות אופק">אופק חדש (₪)</th>
                {!isPrincipal && <th style={{ textAlign:'center' }} title="הפער בין אופק לעולם הישן">תוספת בית חב"ד</th>}
                {!isPrincipal && <th style={{ textAlign:'center' }}>ברוטו</th>}
                {!isPrincipal && <th style={{ textAlign:'center' }} title={`${EMPLOYER_PCT}% על הבסיס · ${CHABAD_PCT}% על התוספת · ~ = אומדן שממתין לסכום מהנהלת החשבונות`}>הוצאות מעביד</th>}
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
                  <td style={{ textAlign:'center' }}>
                    <select value={editData.reform} onChange={e=>setF('reform',e.target.value)} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                      {REFORMS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    {/* נגזר מהשעות הפרונטליות — לא מוקלד */}
                    <span style={{ fontWeight:700, color:'var(--text)' }}>{editData.scopePct ?? 100}%</span>
                    <span style={{ display:'block', fontSize:10.5, color:'var(--text3)' }}>מחושב</span>
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
                  <td><input type="number" className="apple-input" dir="ltr" min="0" value={editData.frontalHours??26}
                      max={hoursCeiling(editData) ?? 40}
                      onChange={e => {
                        const hrs = Number(e.target.value);
                        // השעות הן הקלט; אחוז המשרה נגזר מהן ומהשלב, אחרי הפחתת גיל
                        const pct = scopeFromFrontal({ ...editData, frontalHours: hrs }, hrs);
                        // scope הוא שדה העולם הישן; שומרים את שניהם כדי שלא ייפרדו
                        setEditData(p => ({ ...p, frontalHours: hrs, scopePct: pct, scope: pct }));
                      }}
                      style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td style={{ textAlign:'center' }}>
                    <label className="apple-toggle">
                      <input type="checkbox" checked={!!editData.isTemp} onChange={e=>setF('isTemp',e.target.checked)} />
                      <span className="apple-toggle-track"></span>
                    </label>
                  </td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.childrenUnder18??0} onChange={e=>setF('childrenUnder18',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.absenceDays??0} onChange={e=>setF('absenceDays',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.mmHours??0} onChange={e=>setF('mmHours',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input className="apple-input" value={editData.mmFor||''} onChange={e=>setF('mmFor',e.target.value)} placeholder="שם המורה" style={{ fontSize:12, padding:'4px 8px', borderRadius:6, minWidth:80 }} /></td>
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
                  {ts.length === 0 ? 'אין מורות עדיין — לחצי על "+ הוסף מורה"' : 'לא נמצאו תוצאות'}
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
                    <td style={{ textAlign:'center' }}>
                      <select value={d.reform} onChange={e=>setF('reform',e.target.value)} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                        {REFORMS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign:'center' }}>
                    {/* נגזר מהשעות הפרונטליות — לא מוקלד */}
                    <span style={{ fontWeight:700, color:'var(--text)' }}>{d.scopePct ?? 100}%</span>
                    <span style={{ display:'block', fontSize:10.5, color:'var(--text3)' }}>מחושב</span>
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
                    <td><input type="number" className="apple-input" dir="ltr" min="0" value={d.frontalHours??26}
                      max={hoursCeiling(editData) ?? 40}
                      onChange={e => {
                        const hrs = Number(e.target.value);
                        // השעות הן הקלט; אחוז המשרה נגזר מהן ומהשלב, אחרי הפחתת גיל
                        const pct = scopeFromFrontal({ ...editData, frontalHours: hrs }, hrs);
                        // scope הוא שדה העולם הישן; שומרים את שניהם כדי שלא ייפרדו
                        setEditData(p => ({ ...p, frontalHours: hrs, scopePct: pct, scope: pct }));
                      }}
                      style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td style={{ textAlign:'center' }}>
                      <label className="apple-toggle">
                        <input type="checkbox" checked={!!d.isTemp} onChange={e=>setF('isTemp',e.target.checked)} />
                        <span className="apple-toggle-track"></span>
                      </label>
                    </td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.childrenUnder18??0} onChange={e=>setF('childrenUnder18',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.absenceDays??0} onChange={e=>setF('absenceDays',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.mmHours??0} onChange={e=>setF('mmHours',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input className="apple-input" value={d.mmFor||''} onChange={e=>setF('mmFor',e.target.value)} placeholder="שם המורה" style={{ fontSize:12, padding:'4px 8px', borderRadius:6, minWidth:80 }} /></td>
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
                        {isPrincipalRow(t) && <span className="apple-badge badge-purple" style={{ fontSize:10.5, padding:'2px 8px' }}>מנהלת</span>}
                        {t._agreedGross && <span className="apple-badge badge-teal" style={{ fontSize:10.5, padding:'2px 8px' }} title="ברוטו מוסכם — לא מסימולציה">שכר מוסכם</span>}
                        {needsNetApproval(t, isFirstMonth) && (
                          <span className="apple-badge badge-orange" style={{ fontSize:10.5, padding:'2px 8px' }}
                            title={`אושר בידי השליח, ממתין לאישור של ${NETWORK_APPROVER}`}>
                            <ShieldCheck size={10} strokeWidth={2.5} />
                            אצל {NETWORK_APPROVER}
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
                    <td style={{ textAlign:'center' }}>
                      <span className={`apple-badge ${t.reform==='ofek' ? 'badge-blue' : 'badge-gray'}`}>
                        {reformLabel(t.reform)}
                      </span>
                    </td>
                    <td style={{ textAlign:'center', fontWeight:600, color:'var(--text)' }}>{scope}%</td>
                    <td style={{ textAlign:'center' }}>{degreeLabel}</td>
                    <td style={{ textAlign:'center', fontWeight:700, color: t.reform==='ofek' ? 'var(--apple-text)' : 'var(--apple-text3)' }}>{gradeLabel}</td>
                    <td style={{ textAlign:'center', color:'var(--apple-text2)' }}>{t.seniority}</td>
                    <td style={{ textAlign:'center' }}>{derived ? derived.frontal : '—'}</td>
                    <td style={{ textAlign:'center' }}>
                      {t.isTemp
                        ? <span className="apple-badge badge-orange">שיבוץ זמני</span>
                        : <span style={{ color:'var(--text3)' }}>—</span>}
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {momBonus
                        ? <span className="apple-badge badge-purple" title="זכאית לתוספת אם עובדת"><Check size={11} strokeWidth={3} />{t.childrenUnder18}</span>
                        : (t.childrenUnder18||0) > 0
                          ? (t.reform === 'pre'
                              ? <span style={{ fontSize:11, color:'var(--text3)' }}>לא זכאית</span>
                              : <span style={{ color:'var(--text2)' }} title="באופק חדש אינה רכיב שכר">{t.childrenUnder18}</span>)
                          : <span style={{ color:'var(--text3)' }}>—</span>}
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
                            ? `אומדן: ${emp.employerBase.toLocaleString('he-IL')} על הבסיס · ${emp.employerSupp.toLocaleString('he-IL')} על התוספת. ממתין לסכום מהנהלת החשבונות.`
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
                          <button className="apple-btn apple-btn-ghost" title="נתוני העסקה לחתימת העובדת"
                            onClick={() => setDetails(t)} style={{ padding:'0 9px', minHeight:30 }}>
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
      </div>

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
      { key:'count', label:'מורות' }, { key:'officialCount', label:'מתוכן עם סימולציה מלאה' },
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
          { label:'סה״כ מורות',           val: totCount.toLocaleString('he-IL') },
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
                      <span title="מספר המורות שכבר עברו סימולציה" style={{ fontSize:11, color:'var(--warn)', fontWeight:600, marginInlineStart:5 }}>
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
          ברוטו למעסיק = בסיס + {EMPLOYER_PCT}% · תוספת בית חב"ד + {CHABAD_PCT}% · ביגוד והבראה כלולים בשיעורים האלה
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
function SimStep({ n, label, calcLabel, active, onFocus, value, onChange, onEnter, autoFocus }) {
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
      <input type="number" className="apple-input" dir="ltr" autoFocus={autoFocus}
        placeholder={`שכר משולב מ${calcLabel}`}
        value={value}
        onFocus={onFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
        style={{ fontSize:14, minHeight:38, borderColor: active ? 'var(--purple)' : undefined }} />
    </div>
  );
}

function SimulatorView({ teachers, schools, onSaveGross }) {
  const [calc, setCalc] = useState('ofek');
  const [filterSchool, setFilterSchool] = useState('all');
  const [inputs, setInputs] = useState({});    // teacherId → string
  const [saved, setSaved]   = useState({});    // teacherId → true (just saved flash)
  const [preInputs, setPreInputs] = useState({});   // סימולציית עולם ישן, לחישוב תוספת בית חב"ד
  const [activeId, setActiveId] = useState(null);


  // כל המורים שממתינים לסימולציה (שינוי נתונים, אין עדיין שכר רשמי)
  const allMissing = teachers.filter(needsSim);
  const total = teachers.filter(isPending).length || teachers.length;
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

  const handleSave = (t) => {
    const val = inputs[t.id] ?? t._officialGross;
    if (!val || isNaN(Number(val))) return;
    const pre = preInputs[t.id] ?? t._officialGrossPre;
    // מורת אופק לא נשמרת בלי שתי הסימולציות — הפער ביניהן הוא רכיב התשלום.
    // מנהלת פטורה: לה יש סימולציית ניהול אחת שהיא הבסיס במלואו.
    if (t.reform === 'ofek' && !isPrincipalRow(t) && (!pre || isNaN(Number(pre)))) return;
    onSaveGross(t.id, Number(val), pre && !isNaN(Number(pre)) ? Number(pre) : undefined);
    setSaved(prev => ({ ...prev, [t.id]: true }));
    setTimeout(() => setSaved(prev => { const n={...prev}; delete n[t.id]; return n; }), 1500);
    // advance to next in list
    const flat = grouped.flatMap(g => g.teachers);
    const idx  = flat.findIndex(x => x.id === t.id);
    if (idx !== -1 && idx + 1 < flat.length) selectTeacher(flat[idx + 1]);
  };

  const pct = total > 0 ? Math.round(done / total * 100) : 100;

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
            <h2 style={{ fontWeight:700, fontSize:15, color:'var(--apple-text)', letterSpacing:'-0.01em' }}>הזנת שכר רשמי</h2>
            <span style={{ fontSize:12, color:'var(--apple-text2)' }}>{done} / {total} הושלמו</span>
          </div>
          {/* Progress bar */}
          <div style={{ background:'var(--fill2)', borderRadius:999, height:6, overflow:'hidden' }}>
            <div style={{ width: pct+'%', background:'linear-gradient(to left, var(--purple), var(--teal))', borderRadius:999, height:6, transition:'width .45s var(--ease-out)' }} />
          </div>
          <select className="apple-select" style={{ fontSize:13 }}
            value={filterSchool} onChange={e => setFilterSchool(e.target.value)}>
            <option value="all">כל בתי הספר ({allMissing.length} ממתינים)</option>
            {schools.filter(s => missingSchoolIds.includes(s.id)).map(s => (
              <option key={s.id} value={s.id}>{s.name} ({allMissing.filter(t => t.schoolId === s.id).length})</option>
            ))}
          </select>
        </div>

        {/* Teacher rows */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 12px', display:'flex', flexDirection:'column', gap:16 }}>
          {grouped.length === 0 && (
            <div style={{ textAlign:'center', padding:'48px 16px' }}>
              <div style={{ width:56, height:56, borderRadius:17, background:'var(--ok-bg)', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Check size={26} strokeWidth={2.4} color="var(--ok)" />
              </div>
              <p style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>כל המורים הוזנו</p>
              <p style={{ fontSize:13, color:'var(--text3)', marginTop:3 }}>אין שכר שממתין לסימולציה</p>
            </div>
          )}
          {grouped.map(({ school, teachers: gTeachers }) => (
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
                  // רק מורת אופק שאינה מנהלת דורשת שתי סימולציות
                  const needsTwo = isOfek && !isPrincipalRow(t);
                  const preVal   = preInputs[t.id] ?? (t._officialGrossPre || '');
                  const mainVal  = inputs[t.id] ?? (t._officialGross || '');
                  // שלב 2 הוא המחשבון של המורה — למנהלת בית ספר זה אופק ניהול
                  const step2Calc  = calcForTeacher(t);
                  const step2Label = (CALCULATORS.find(c => c.id === step2Calc) || CALCULATORS[0]).label;
                  return (
                    <div key={t.id} onClick={() => selectTeacher(t)}
                      className="apple-card"
                      style={{ padding:'12px 14px', cursor:'pointer', borderRight: isActive ? '3px solid var(--apple-blue)' : '3px solid transparent', boxShadow: isActive ? '0 4px 20px rgba(0,122,255,0.12)' : '' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom: isActive ? 10 : 0 }}>
                        <div>
                          <p style={{ fontWeight:600, fontSize:14, color:'var(--apple-text)', marginBottom:2 }}>{t.name}</p>
                          <p style={{ fontSize:12, color:'var(--apple-text2)' }}>
                            {reformLabel(t.reform)} · {t.reform === 'ofek' ? `דרגה ${t.grade}` : (DEGREE_LABELS[t.degree] || t.degree)} · {t.seniority} שנות ותק
                          </p>
                        </div>
                        <div style={{ textAlign:'left', flexShrink:0 }}>
                          <p style={{ fontSize:11, color:'var(--apple-text3)', marginBottom:1 }}>הערכה</p>
                          <p style={{ fontSize:13, fontWeight:600, fontFamily:'monospace', color:'var(--apple-text2)' }}>{est.toLocaleString()} ₪</p>
                        </div>
                      </div>
                      {isActive && (
                        <>
                        {needsTwo ? (
                          <>
                            {/* שלב 1 — העולם הישן. זה מה שרץ במערכת התשלומים. */}
                            <SimStep
                              n={1} label="עולם ישן — בסיס" calcLabel="מחשבון העולם הישן"
                              active={calc === 'old'} onFocus={() => setCalc('old')}
                              value={preVal}
                              onChange={v => setPreInputs(prev => ({ ...prev, [t.id]: v }))}
                              onEnter={() => setCalc(step2Calc)}
                              autoFocus={!preVal}
                            />
                            {/* שלב 2 — האופק. הפער בין השניים הוא רכיב התוספת. */}
                            <SimStep
                              n={2} label={step2Label} calcLabel={`מחשבון ${step2Label}`}
                              active={calc === step2Calc} onFocus={() => setCalc(step2Calc)}
                              value={mainVal}
                              onChange={v => setInputs(prev => ({ ...prev, [t.id]: v }))}
                              onEnter={() => handleSave(t)}
                              autoFocus={!!preVal && !mainVal}
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
function BackupModal({ schools, months, onRestore, onClose }) {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const [done, setDone]   = useState('');

  const teacherRecords = Object.values(months).reduce((s, ts) => s + ts.length, 0);
  const monthKeys = Object.keys(months).sort();

  const handleExport = () => {
    setError(''); setDone('');
    const c = exportBackup(schools, months);
    setDone(`הגיבוי ירד — ${c.schools} בתי ספר, ${c.months} חודשים, ${c.teacherRecords} רשומות מורים.`);
  };

  const handleFile = e => {
    const f = e.target.files?.[0];
    e.target.value = '';           // כדי שבחירת אותו קובץ שוב תפעיל onChange
    if (!f) return;
    setError(''); setDone(''); setBusy(true);
    const r = new FileReader();
    r.onerror = () => { setBusy(false); setError('קריאת הקובץ נכשלה.'); };
    r.onload = () => {
      setBusy(false);
      let parsed;
      try { parsed = parseBackup(String(r.result)); }
      catch (err) { setError(err.message); return; }

      const nTeachers = Object.values(parsed.months).reduce((s, ts) => s + ts.length, 0);
      const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('he-IL') : 'לא ידוע';
      const ok = window.confirm(
        `שחזור יחליף את כל הנתונים הקיימים במערכת.\n\n` +
        `הגיבוי: ${parsed.schools.length} בתי ספר · ${Object.keys(parsed.months).length} חודשים · ${nTeachers} רשומות מורים\n` +
        `נוצר ב: ${when}\n\n` +
        `הנתונים הנוכחיים (${schools.length} בתי ספר, ${teacherRecords} רשומות) יימחקו.\n\n` +
        `להמשיך?`
      );
      if (!ok) return;
      onRestore(parsed.schools, parsed.months);
    };
    r.readAsText(f, 'utf-8');
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(6px)', overflowY:'auto' }} dir="rtl">
      <div className="apple-card spring-enter" style={{ width:'100%', maxWidth:440, padding:24, margin:'auto' }}>

        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:18 }}>
          <div>
            <h2 style={{ fontSize:18, fontWeight:800, letterSpacing:'-0.02em', color:'var(--text)', marginBottom:3 }}>גיבוי ושחזור</h2>
            <p style={{ fontSize:12.5, color:'var(--text3)', lineHeight:1.5 }}>כל נתוני המערכת שמורים בדפדפן הזה בלבד — ייצאי גיבוי באופן קבוע</p>
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
          <strong style={{ color:'var(--text)' }}>{teacherRecords}</strong> רשומות מורים ·{' '}
          <strong style={{ color:'var(--text)' }}>{monthKeys.length}</strong> חודשים
          {monthKeys.length > 0 && ` (${fmtMonth(monthKeys[0])} — ${fmtMonth(monthKeys[monthKeys.length-1])})`}
        </p>
        <button className="apple-btn apple-btn-blue" onClick={handleExport} style={{ width:'100%' }}>
          <Download size={15} strokeWidth={2.2} />
          ייצוא גיבוי מלא
        </button>
      </div>

      <div className="apple-section">
        <p className="apple-label">שחזור מקובץ גיבוי</p>
        <label style={{ cursor: busy ? 'wait' : 'pointer', display:'block' }}>
          <span className="apple-btn apple-btn-ghost" style={{ width:'100%' }}>
            <Upload size={15} strokeWidth={2.2} />
            {busy ? 'קורא קובץ…' : 'בחרי קובץ גיבוי'}
          </span>
          <input type="file" accept=".json,application/json" onChange={handleFile} style={{ display:'none' }} disabled={busy} />
        </label>
        <p style={{ fontSize:11.5, color:'var(--text3)', marginTop:8, lineHeight:1.6 }}>
          השחזור מחליף את כל הנתונים הקיימים. תוצג אזהרה לפני הביצוע.
        </p>
      </div>

      {error && (
        <div style={{ background:'var(--danger-bg)', border:'1px solid var(--danger-line)', borderRadius:12, padding:'10px 13px', marginTop:14, fontSize:13, color:'var(--danger)', fontWeight:600 }}>
          {error}
        </div>
      )}
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

export default function App() {
  const [schools,  setSchools]  = useState(() => {
    const saved = load(LS_SCHOOLS);
    if (saved.length > 0) {
      if (localStorage.getItem(LS_REFORM_FIX)) return saved;
      const fixed = saved.map(s => (OLD_WORLD_NAMES.includes(s.name) && s.reform !== 'pre')
        ? { ...s, reform: 'pre' } : s);
      try { localStorage.setItem(LS_REFORM_FIX, '1'); } catch { /* לא קריטי */ }
      if (fixed.some((s, i) => s !== saved[i])) { save(LS_SCHOOLS, fixed); return fixed; }
      return saved;
    }
    // זריעה חד-פעמית בלבד — אם מחקת את כולם, הם לא יחזרו
    if (localStorage.getItem(LS_SEEDED)) return saved;
    const seeded = DEFAULT_SCHOOLS.map(s => ({ ...s, id: uid() }));
    if (save(LS_SCHOOLS, seeded)) {
      try { localStorage.setItem(LS_SEEDED, '1'); localStorage.setItem(LS_REFORM_FIX, '1'); } catch { /* לא קריטי */ }
      return seeded;
    }
    return saved;
  });
  // months: { '2025-09': [teacher,...], ... }  — migrate from legacy if needed
  const [months, setMonths] = useState(() => {
    const saved = loadObj(LS_MONTHS);
    let base = (saved && Object.keys(saved).length > 0) ? saved : null;
    if (!base) {
      // migrate legacy flat teachers
      const legacy = load(LS_TEACHERS);
      base = legacy.length > 0 ? { [nowMonthKey()]: legacy } : {};
    }
    // השלמה חד-פעמית: בית ספר שאין לו שורת מנהלת בחודש האחרון מקבל אחת.
    // רץ כאן ולא ב-effect כדי לא לגרום לרינדור נוסף מיד אחרי הטעינה.
    if (!localStorage.getItem(LS_PRINCIPAL_ROWS)) {
      const allSchools = load(LS_SCHOOLS);
      if (allSchools.length) {
        const keys = Object.keys(base).sort();
        const mk = keys.length ? keys[keys.length - 1] : nowMonthKey();
        const filled = withPrincipalRows(allSchools, base[mk] || []);
        if (filled !== (base[mk] || [])) {
          base = { ...base, [mk]: filled };
          save(LS_MONTHS, base);
        }
        try { localStorage.setItem(LS_PRINCIPAL_ROWS, '1'); } catch { /* לא קריטי */ }
      }
    }
    return base;
  });

  const [activeMonth, setActiveMonth] = useState(() => {
    const saved = loadObj(LS_MONTHS);
    const keys = Object.keys(saved || {}).sort();
    return keys.length > 0 ? keys[keys.length - 1] : nowMonthKey();
  });

  const [user,          setUser]          = useState(null);
  const [view,          setView]          = useState('schools');
  const [activeSchool,  setActiveSchool]  = useState(null);
  const [schoolModal,   setSchoolModal]   = useState(null);
  const [teacherModal,  setTeacherModal]  = useState(null);
  const [showApproval,  setShowApproval]  = useState(false);
  const [showBackup,    setShowBackup]    = useState(false);

  const teachers = months[activeMonth] || [];

  // שומרים קודם, ורק אם הכתיבה הצליחה מעדכנים את ה-state.
  const persistS  = s  => { if (save(LS_SCHOOLS, s)) setSchools(s); };
  const persistMT = (mk, ts) => {
    const newMonths = { ...months, [mk]: ts };
    if (save(LS_MONTHS, newMonths)) setMonths(newMonths);
  };
  const persistT  = ts => persistMT(activeMonth, ts);

  if (!user) return <LoginScreen schools={schools} onLogin={u => {
    setUser(u);
    setView(u.role === 'clerk' ? 'calc' : 'schools');
  }} />;

  const isCoord = user.role === 'coordinator';
  const isClerk = user.role === 'clerk';
  const isNetApprover = user.role === 'network';
  // האישור הרשתי נדרש בחודש הראשון שנפתח במערכת
  const firstMonthKey = Object.keys(months).sort()[0] || activeMonth;
  const isFirstMonth  = activeMonth === firstMonthKey;
  const netPendingCount = teachers.filter(t => needsNetApproval(t, isFirstMonth)).length;

  const onNetApprove = (ids) => {
    const now = new Date().toISOString();
    const set = new Set(ids);
    persistT(teachers.map(t => set.has(t.id) ? { ...t, _netApproved: true, _netApprovedAt: now } : t));
  };
  const needsSimCount      = teachers.filter(needsSim).length;
  const needsApprovalCount = teachers.filter(needsApproval).length;
  const sortedMonthKeys = Object.keys(months).sort();

  // Open a new month — copy teachers from current, reset monthly fields
  const openNewMonth = () => {
    const now = new Date().toISOString();
    const nextKey = nextMonthKey(activeMonth);
    if (months[nextKey]) { setActiveMonth(nextKey); return; }
    // _files חייב להתאפס יחד עם sickFiles — אחרת כל קובץ base64 מועתק לכל חודש חדש
    // ומכסת ה-localStorage נגמרת תוך שנה.
    // חודש חדש מתחיל בלי שכר רשמי: בלי איפוס _officialGross הטבלה הציגה את
    // שכר החודש הקודם כשכר החודש הזה, והמורים לא הופיעו באף רשימת עבודה.
    const MONTHLY_RESET = { absenceDays:0, sickFiles:[], _files:[], mmHours:0, mmFor:'', monthlyExtras:0,
                             _officialGross:null, _officialGrossPre:null, _agreedGross:null,
                             _actualEmployerCost:null, _netApproved:false, _netApprovedAt:null,
                             _approved:false, _approvedAt:null, _snapshot:null };
    const nextTeachers = teachers.map(t => ({ ...t, ...MONTHLY_RESET, _changedAt: now }));
    persistMT(nextKey, nextTeachers);
    setActiveMonth(nextKey);
  };

  const onSaveSchool = s => {
    if (s.id) {
      persistS(schools.map(x => x.id === s.id ? s : x));
    } else {
      const created = { ...s, id: uid() };
      persistS([...schools, created]);
      persistT([...teachers, makePrincipalRow(created)]);
    }
    setSchoolModal(null);
  };
  const onDeleteSchool = id => {
    persistS(schools.filter(s => s.id !== id));
    persistT(teachers.filter(t => t.schoolId !== id));
  };

  const onSaveTeacher = t => {
    const now = new Date().toISOString();
    const old = teachers.find(x => x.id === t.id);
    let updated = { ...t };

    if (old) {
      // If base salary fields changed → clear simulation for this month
      const baseChanged = baseFieldsChanged(t, old);
      if (baseChanged) {
        updated._officialGross    = null;
        updated._officialGrossPre = null;
        updated._changedAt        = now;
        updated._approved         = false;
        if (!old._snapshot) updated._snapshot = snapT(old);
      }
    } else {
      updated._changedAt = now;
      updated._approved  = false;
    }

    // startNew מקצה id מראש, ולכן אי אפשר להסתמך על t.id כדי לזהות רשומה חדשה —
    // חייבים לבדוק אם היא באמת קיימת ברשימה, אחרת ה-map מחזיר עותק זהה והמורה נעלמת בשקט.
    const exists = teachers.some(x => x.id === t.id);
    persistT(exists
      ? teachers.map(x => x.id === t.id ? updated : x)
      : [...teachers, { ...updated, id: t.id || uid() }]
    );
    setTeacherModal(null);
  };

  const onDeleteTeacher  = id => persistT(teachers.filter(t => t.id !== id));
  const onImportTeachers = ts => {
    const now = new Date().toISOString();
    const withIds = ts.map(t => ({ ...t, id: uid(), _changedAt: now, _approved: false }));
    persistT([...teachers, ...withIds]);
  };

  const onApproveTeacher = id => {
    const now = new Date().toISOString();
    persistT(teachers.map(t => t.id === id
      ? { ...t, _snapshot: null, _changedAt: null, _approved: true, _approvedAt: now }
      : t
    ));
  };
  // רק מורות שיש להן שכר רשמי וממתינות לאישור. קודם זה עבר על כל מורי
  // הרשת — כולל מי שלא שינה דבר וכולל מי שטרם עברה סימולציה, שנעלמה
  // אחרי הפעולה מכל רשימות העבודה.
  const onApproveAll = () => {
    const now = new Date().toISOString();
    persistT(teachers.map(t => needsApproval(t)
      ? { ...t, _snapshot: null, _changedAt: null, _approved: true, _approvedAt: now }
      : t));
    setShowApproval(false);
  };

  const onRestoreBackup = (nextSchools, nextMonths) => {
    if (!save(LS_SCHOOLS, nextSchools)) return;
    if (!save(LS_MONTHS, nextMonths)) return;
    setSchools(nextSchools);
    setMonths(nextMonths);
    const keys = Object.keys(nextMonths).sort();
    setActiveMonth(keys.length ? keys[keys.length - 1] : nowMonthKey());
    setActiveSchool(null);
    setView(user.role === 'clerk' ? 'calc' : 'schools');
    setShowBackup(false);
    alert('השחזור הושלם.');
  };

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
                {isCoord ? 'שליח / מנהל רשת' : isClerk ? 'חשבת שכר' : isNetApprover ? `${NETWORK_APPROVER} · אישור רשתי` : `מנהלת: ${principalSchool?.name || ''}`}
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
              <span style={{ fontSize:12.5, fontWeight:700, color:'var(--text)', minWidth:92, textAlign:'center' }}>{fmtMonth(activeMonth)}</span>
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
                  חודש
                </button>
              )}
            </div>

            {isCoord && netPendingCount > 0 && (
              <span className="apple-badge badge-orange" title={`ממתינות לאישור של ${NETWORK_APPROVER}`}
                style={{ whiteSpace:'nowrap' }}>
                <ShieldCheck size={12} strokeWidth={2.3} />
                {netPendingCount} אצל {NETWORK_APPROVER}
              </span>
            )}

            <button className="nav-btn" onClick={() => setShowBackup(true)} title="גיבוי ושחזור">
              <Database size={15} strokeWidth={2.2} />
              גיבוי
            </button>

            <button className="nav-btn danger" onClick={() => setUser(null)} title="יציאה">
              <LogOut size={15} strokeWidth={2.2} />
              יציאה
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1">
        {/* Clerk: only SimulatorView */}
        {isNetApprover ? (
          <NetworkApprovalView
            schools={schools}
            teachers={teachers}
            isFirstMonth={isFirstMonth}
            monthLabel={fmtMonth(activeMonth)}
            onApprove={onNetApprove}
          />
        ) : isClerk ? (
          <SimulatorView
            teachers={teachers}
            schools={schools}
            onSaveGross={(id, gross, grossPre) => persistT(teachers.map(t => t.id === id
              ? { ...t, _officialGross: gross, ...(grossPre === undefined ? {} : { _officialGrossPre: grossPre }) }
              : t))}
          />
        ) : /* Principal: see only their school */
        !isCoord && principalSchool ? (
          <SchoolView
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
            onSaveGross={(id, gross, grossPre) => persistT(teachers.map(t => t.id === id
              ? { ...t, _officialGross: gross, ...(grossPre === undefined ? {} : { _officialGrossPre: grossPre }) }
              : t))}
          />
        ) : view === 'report' ? (
          <ReportView schools={schools} teachers={teachers} />
        ) : view === 'school' && activeSchool ? (
          <SchoolView
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
                            <span className={`apple-badge ${(s.reform || 'ofek') === 'ofek' ? 'badge-blue' : 'badge-gray'}`}>
                              {reformLabel(s.reform)}
                            </span>
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
                        + הוסף מורה
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
      {showBackup && <BackupModal schools={schools} months={months} onRestore={onRestoreBackup} onClose={() => setShowBackup(false)} />}
      {teacherModal && <TeacherModal teacher={teacherModal} schools={schools} userRole={user.role} onSave={onSaveTeacher} onClose={() => setTeacherModal(null)} />}
    </div>
  );
}
