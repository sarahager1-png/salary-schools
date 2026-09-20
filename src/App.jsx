import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import {
  Briefcase, Calculator, School, Check, ArrowLeft, ArrowRight,
  ChevronLeft, ChevronRight, Plus, LogOut, BarChart3, ClipboardCheck,
  Printer, Download, Upload, Send, Pencil, Trash2, X, Search,
  Paperclip, Image as ImageIcon, FileText, AlertTriangle, Lightbulb,
  CalendarClock, Bell, Users, FolderOpen, Database, FileSpreadsheet, ShieldAlert,
  ExternalLink, ShieldCheck, MessageCircle, Percent, Wallet,
} from 'lucide-react';
import * as store from './lib/store.js';
import { readSheet, parseRows, matchRows } from './lib/slipImport.js';
import { rowIssues } from './lib/dataCheck.js';
import { CreditLine } from './components/CreditLine.jsx';
import './index.css';
// v3 — רשת חינוך חב"ד design system

/* ═══════════════════════════════════════════════════════════════
   SALARY TABLES
═══════════════════════════════════════════════════════════════ */
// מעדכנים ביד בכל פריסה. מוצג בכותרת ובמסך הכניסה.
const BUILD = 38;

// אילו בתי ספר משלמים תוספת בית חב"ד — מתעדכן בכל טעינת נתונים.
// payBreakdown נקרא גם ממסכים שאין בהם אובייקט בית ספר ביד.
import {
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
  JOBS,
  jobLabel,
  isHourlyRow,
  MIN_WAGE_HOUR,
  HOURLY_WEEKS,
  hourlyRateOf,
  hourlyGross,
  EXTRA_ROLE_IDS,
  allRolesOf,
  rolesText,
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
  slipDarga,
  slipScope,
} from './lib/employer.js';

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
  // תפקידים נוספים בשורת ההוראה (שרה, 15.9) — משנים גמול, ולכן בסיס
  { key:'extraRoles',      label:'תפקידים נוספים', base:true,  tracked:true,
    fmt: v => (Array.isArray(v) && v.length ? v.map(id => ROLE_SHORT[id] || id).join(' · ') : 'אין') },
  // סוג המשרה ותעריף לשעה — משרה שעתית (צהרון). שניהם משנים שכר.
  { key:'job',             label:'סוג משרה',       base:true,  tracked:true,  fmt: v => jobLabel(v || 'teaching') },
  { key:'hourlyRate',      label:'תעריף לשעה',     base:true,  tracked:true,  fmt: v => (v ? `${v} ₪` : 'שכר מינימום') },
  { key:'scopePct',        label:'% משרה',         base:true,  tracked:true,  fmt: v => `${v}%` },
  { key:'frontalHours',    label:'שעות פרונטלי',   base:true,  tracked:true },
  { key:'scope',           label:'% משרה',         base:true,  tracked:false, fmt: v => `${v}%` },
  // משפיע על השכר בעולם ישן בלבד — באופק אין לו ביטוי בשכר
  // מין וילדים קובעים את תוספת האם בתלוש (24 שעות לאם = 90%) — בכל
  // המסלולים, כי התלוש נבנה בעולם ישן גם למורת אופק (שרה, 3.9)
  { key:'childrenUnder18', label:'ילדים עד 18',    base: true, tracked:true },
  { key:'gender',          label:'מין',            base: true, tracked:true,
    fmt: v => (v === 'f' ? 'נקבה' : v === 'm' ? 'זכר' : '—') },
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
  // משרה שעתית: שעות × תעריף הם המספר, עד שחשבת השכר מזינה ברוטו מהתלוש
  if (isHourlyRow(t)) return Boolean(t._officialGross) || Number(t.frontalHours) > 0;
  return Boolean(t._officialGross);
};

// סטטוס מורה בזרימת העבודה:
// needs_sim: מנהלת שמרה שינויים, ממתין לסימולציה אצל חשבת שכר
// needs_approval: הנתונים הושלמו, ממתין לאישור שרה
// approved: שרה אישרה
const needsSim      = t => Boolean(!unpaidThisMonth(t) && t._changedAt && !t._approved && !simComplete(t));

// שעות בית הספר מול תקן השעות — כלל אחד לכל המסכים, זהה ל-p_hours_of
// בשרת: שעות פרונטליות של עובדות ההוראה, בלי מנהלת, בלי מי שבחל"ד/חל"ת
// החודש (שרה, 8.9), ובלי מורה לשילוב — "שעות שילוב יורדות גם מהספירה"
// (שרה, 10.9). "חשוב שיהיה כתוב כמה חריגה יש לכל בית ספר, בשעות" (10.9)
// — לכן החריגה היא מספר שעות מפורש, לא רק צבע.
const isInclusionRow = t => (t?.gamulRole || t?.role) === 'inclusion';
// ייעוץ מתומחר בתקציב בנפרד מהשעות לכיתה — מחוץ לתקן (שרה, 15.9, ירושלים)
const isCounselorRow = t => /^counselor/.test(t?.gamulRole || t?.role || '');
// שעות צהרון ומשרה שעתית אינן שעות משרד החינוך — מחוץ למכסה (15.9)
// שעות מחוץ לתקן בשורה: ערך שהוזן גובר; ריק = יועצת כולן, אחרת 0 (שרה, 15.9)
const nonQuotaOf = t => {
  const v = t?.nonQuotaHours;
  if (v !== null && v !== undefined && v !== '') return Number(v) || 0;
  return isCounselorRow(t) ? (Number(t.frontalHours) || 0) : 0;
};
const quotaHoursOf = t => Math.max(0, (Number(t.frontalHours) || 0) - nonQuotaOf(t));
const schoolHours = ts => ts
  .filter(t => !isPrincipalRow(t) && !isInclusionRow(t) && !isHourlyRow(t) && !unpaidThisMonth(t))
  .reduce((a, t) => a + quotaHoursOf(t), 0);
// null = אין תקן; חיובי = מעל התקן; שלילי/אפס = בתוך התקן
const hoursOver = (ts, quota) => {
  const q = Number(quota) || 0;
  return q > 0 ? schoolHours(ts) - q : null;
};
// תצוגת החריגה: "+3 שעות" באדום, "בתקן" בשקט, "—" בלי תקן
const OverHours = ({ over, size = 15.5 }) => (
  over == null ? <span style={{ color:'var(--text3)', fontSize:size }}>—</span>
  : over > 0   ? <span className="num" style={{ color:'var(--danger)', fontWeight:800, fontSize:size }}>+{over} שעות</span>
  :              <span style={{ color:'var(--ok, #2e7d32)', fontWeight:600, fontSize:size }}>בתקן</span>
);
const needsApproval = t => Boolean(t._changedAt && !t._approved && simComplete(t));

// כפתור "חישוב": למורה התוצאה נכנסת לברוטו; למנהלת הברוטו קבוע (אופק
// ניהול / שכר מוסכם) והחישוב הוא התלוש בעולם ישן — "תחשב את תלושי
// המנהלות כמו כל עובדי ההוראה" (שרה, 14.9).
// משרה שעתית אין לה סימולטור — כפתור החישוב אינו מוצג (canCompute)
const canCompute = t => !isHourlyRow(t);
const computeTitle = t => (isPrincipalRow(t)
  ? 'חישוב התלוש בעולם ישן — דרגה+ותק וגמול ניהול; ההפרש עד הברוטו הוא תוספת בית חב"ד'
  : 'חישוב במחשבון משרד החינוך — התוצאה תיכנס לברוטו');
const isPending     = t => Boolean(t._changedAt && !t._approved); // = needsSim || needsApproval

// "יש היעדרויות וצריך סיבה… מילואים, מחלת ילד ואחר" (שרה, 6.9)
const ABSENCE_REASONS = [
  ['sick',       'מחלה'],
  ['child_sick', 'מחלת ילד'],
  ['miluim',     'מילואים'],
  ['maternity',  'חופשת לידה'],
  ['unpaid',     'חופשה ללא תשלום (חל"ת)'],
  ['other',      'אחר'],
];
const reasonLabel = id => (ABSENCE_REASONS.find(([k]) => k === id) || [])[1] || '';
// סיבות שמצריכות צירוף טופס מחלה
const needsSickForm = r => r === 'sick' || r === 'child_sick';
// סיבות שהן יציאה לחופשה — נרשמות גם כסטטוס עם תאריכים
const isLeaveReason = r => r === 'maternity' || r === 'unpaid';
const fmtD = v => (v ? new Date(v).toLocaleDateString('he-IL') : '');

// "אסתר צריכה לראות מי ממלאת מקום ובאיזה תקופה ואת מי מחליפה" (שרה, 3.9):
// שורת מילוי המקום — שיבוץ זמני עם התקופה, במקום מי, שעות ותאריכי הממ"מ.
// ריק כשאין — רוב השורות רגילות והמידע מופיע רק כשהוא קיים.
const subInfo = (t) => {
  const bits = [];
  if (t.isTemp) {
    const from = fmtD(t.startDate), to = fmtD(t.endDate);
    bits.push(`מילוי מקום${from || to ? ` ${from}${from && to ? ' – ' : ''}${to}` : ''}`);
  }
  if (t.mmFor) bits.push(`במקום ${t.mmFor}`);
  if ((t.mmHours || 0) > 0) bits.push(`${t.mmHours} שעות ממ"מ`);
  if (t.mmFrom) {
    bits.push(!t.mmTo || t.mmTo === t.mmFrom
      ? `ב-${fmtD(t.mmFrom)}`
      : `${fmtD(t.mmFrom)} – ${fmtD(t.mmTo)}`);
  }
  return bits.join(' · ');
};

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
  job: 'teaching', hourlyRate: null,   // סוג משרה; תעריף לשעה למשרה שעתית
  extraRoles: [],                      // תפקידים נוספים מעבר לגמול הראשי
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

/* כותרת עמוד אחידה — כל מסך ראשי נפתח באותה צורה: פס-כותרת, h1,
   שורת משנה שאומרת מה המסך, ופעולות העמוד בקצה. העיצוב ב-index.css
   (.page-head) כדי שגודל ומרווח יהיו זהים בכל המסכים. */
function PageHead({ title, subtitle, badge = null, actions = null }) {
  return (
    <div className="page-head">
      <div className="page-head-main">
        <div className="page-head-row">
          <span className="title-bar" />
          <h1>{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

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
        padding:'10px 18px', fontSize:15.5, fontWeight:700, fontFamily:'inherit',
        cursor:'pointer', boxShadow:'0 4px 14px rgba(0,180,204,.35)' }}>
      יש גרסה חדשה — לחצי לרענון
    </button>
  );
}


/* ═══════════════════════════════════════════════════════════════
   התקנה כאפליקציה — "תן אופציה להורדה כאפלקציה" (שרה, 2.9.2026)

   התשתית (manifest, service worker, אייקונים) קיימת ופועלת; מה
   שחסר היה כפתור גלוי. באנדרואיד/כרום הדפדפן מוסר אירוע
   beforeinstallprompt (נתפס ב-index.html לפני שריאקט עולה) —
   לחיצה פותחת את חלון ההתקנה של המערכת. באייפון אין אירוע כזה
   בכלל, ולכן שם הכפתור פותח הסבר קצר: שיתוף ← הוסף למסך הבית.
   בתוך אפליקציה שכבר הותקנה — הכפתור לא מוצג.
═══════════════════════════════════════════════════════════════ */
function InstallAppButton() {
  const [ready, setReady] = useState(() => Boolean(window.__installPrompt));
  const [showIos, setShowIos] = useState(false);

  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const on = () => setReady(true);
    window.addEventListener('install-ready', on);
    return () => window.removeEventListener('install-ready', on);
  }, []);

  if (standalone) return null;
  if (!ready && !isIos) return null;

  const install = async () => {
    if (isIos && !window.__installPrompt) { setShowIos(true); return; }
    const ev = window.__installPrompt;
    if (!ev) return;
    ev.prompt();
    try { await ev.userChoice; } catch { /* ביטלה — לא מציקים */ }
    window.__installPrompt = null;
    setReady(false);
  };

  return (
    <>
      <button type="button" onClick={install}
        className="apple-btn apple-btn-ghost"
        style={{ width:'100%', minHeight:46, fontSize:16.1, fontWeight:600, gap:8, marginTop:10 }}>
        <Download size={16} strokeWidth={2.3} />
        התקנת האפליקציה על המכשיר
      </button>
      {showIos && (
        <div onClick={() => setShowIos(false)}
          style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.5)', zIndex:80,
            display:'flex', alignItems:'flex-end', justifyContent:'center' }} dir="rtl">
          <div onClick={e => e.stopPropagation()}
            style={{ background:'#fff', borderRadius:'18px 18px 0 0', padding:'22px 22px 30px',
              maxWidth:420, width:'100%', boxShadow:'0 -8px 40px rgba(0,0,0,.18)' }}>
            <p style={{ fontSize:17.8, fontWeight:800, marginBottom:10 }}>התקנה באייפון</p>
            <ol style={{ fontSize:16.1, lineHeight:2, paddingInlineStart:20, color:'var(--text2)' }}>
              <li>לוחצים על כפתור השיתוף <span style={{ fontWeight:700 }}>⎋</span> בסרגל של ספארי</li>
              <li>גוללים ובוחרים <b>"הוסף למסך הבית"</b></li>
              <li>מאשרים — והאייקון יופיע כמו כל אפליקציה</li>
            </ol>
            <button className="apple-btn apple-btn-blue" onClick={() => setShowIos(false)}
              style={{ width:'100%', minHeight:44, marginTop:14 }}>הבנתי</button>
          </div>
        </div>
      )}
    </>
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
          <h1 style={{ fontSize:31, fontWeight:800, letterSpacing:'-0.03em', color:'var(--text)', marginBottom:5 }}>מערכת שכר מורים</h1>
          <p style={{ fontSize:16.1, color:'var(--text3)' }}>גני חב"ד — ניהול שכר עובדי ההוראה</p>
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
              padding:'11px 13px', marginBottom:14, fontSize:14.9, color:'var(--ok)', lineHeight:1.7 }}>
              <b>נשלח קישור כניסה ל־{linkSent}</b><br/>
              פתחי אותו <b>מהמכשיר הזה</b>. הקישור תקף לשעה.
            </div>
          )}

          {error && (
            <div style={{ background:'var(--danger-bg)', border:'1px solid var(--danger-line)', borderRadius:12,
              padding:'10px 13px', marginBottom:14, fontSize:14.9, color:'var(--danger)', fontWeight:600 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={busy || !email.trim() || !password}
            className="apple-btn apple-btn-blue"
            style={{ width:'100%', minHeight:48, fontSize:17.8, fontWeight:700 }}>
            {busy ? 'מתחברת…' : 'כניסה למערכת'}
            {!busy && <ArrowLeft size={17} strokeWidth={2.5} />}
          </button>

          <div style={{ display:'flex', alignItems:'center', gap:10, margin:'16px 0 14px' }}>
            <div style={{ flex:1, height:1, background:'var(--line)' }} />
            <span style={{ fontSize:13.2, color:'var(--text3)' }}>או בלי סיסמה</span>
            <div style={{ flex:1, height:1, background:'var(--line)' }} />
          </div>

          <button type="button" onClick={sendLink} disabled={busy || !email.trim()}
            className="apple-btn apple-btn-ghost"
            style={{ width:'100%', minHeight:46, fontSize:16.7, fontWeight:600, gap:8 }}>
            <Send size={16} strokeWidth={2.3} />
            שלחו לי קישור כניסה למייל
          </button>

          <InstallAppButton />

          {hasGoogle && (
            <>
              <div style={{ height:10 }} />
              <button type="button" onClick={google} disabled={busy}
                className="apple-btn apple-btn-ghost"
                style={{ width:'100%', minHeight:48, fontSize:17.2, fontWeight:600, gap:10 }}>
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

        <p style={{ textAlign:'center', fontSize:13.8, color:'var(--text3)', marginTop:18, lineHeight:1.7 }}>
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
        <div key={k} style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', fontSize:13.8 }}>
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
  // משרה שעתית (צהרון): שעות × תעריף. בלי דרגה, מסלול ושלב.
  const rows = isHourlyRow(x) ? [
    ['שם העובדת',        x.name],
    ['תעודת זהות',       x.tzId || '—'],
    ['בית הספר',         school?.name || '—'],
    ['סוג המשרה',        jobLabel(x.job)],
    ['שעות שבועיות',     x.frontalHours || '—'],
    ['תעריף לשעה',       `${hourlyRateOf(x)} ₪${x.hourlyRate ? '' : ' (שכר מינימום)'}`],
    ['אחוז משרה',        `${effectiveScope(x)}%`],
  ] : [
    ['שם העובדת',        x.name],
    ['תעודת זהות',       x.tzId || '—'],
    ['בית הספר',         school?.name || '—'],
    ['מסלול',            reformLabel(x.reform)],
    ...(x.reform === 'ofek' && !isPrincipalRow(x)
      ? [['דרגה באופק', x.grade === 'intern' ? 'מתמחה' : `דרגה ${x.grade}`]] : []),
    ...(isPrincipalRow(x) ? [['תפקיד', 'מנהלת בית ספר']]
      : rolesText(x) ? [[allRolesOf(x).length > 1 ? 'תפקידים' : 'תפקיד', rolesText(x)]] : []),
    ['תואר',             DEGREE_LABELS[x.degree] || x.degree || '—'],
    ['ותק בהוראה',       `${x.seniority || 0} שנים`],
    ['שלב חינוך',        LEVELS[x.level]?.label || '—'],
    ['שעות פרונטליות',   d ? d.frontal : (x.frontalHours || '—')],
    /*
      תיקון ידני גובר על הטבלה הרשמית (שרה, 8.9). מורות טענו שבהסכם
      שלהן רשום מספר אחר — ולכן הוספנו שדות לתיקון, אבל המסמך המשיך
      לחשב מהטבלה והתיקון לא הגיע לנייר שהן חותמות עליו.
    */
    ...(d || x.individualHours != null || x.presenceHours != null
      ? [['שעות פרטניות', x.individualHours ?? d?.individual ?? '—'],
         ['שעות שהייה',   x.presenceHours ?? d?.presence ?? '—']]
      : []),
    ['אחוז משרה',        `${effectiveScope(x)}%`],
    ...(x.isTemp ? [['שיבוץ', `זמני${x.endDate ? ` · עד ${fmt(x.endDate)}` : ''}`]] : []),
  ];
  const pay = [
    ['שכר בסיס',           emp.base],
    ...(emp.supplement ? [['תוספת בית חב"ד', emp.supplement]] : []),
    ['ברוטו חודשי',        emp.gross],
  ];

  return (
    <div className="modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:100, overflowY:'auto', padding:'24px 16px' }} dir="rtl">
      <div className="apple-card modal-card" style={{ maxWidth:640, margin:'0 auto', padding:0 }}>
        <div className="no-print modal-head" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'14px 20px', borderBottom:'1px solid var(--line)', background:'var(--surface)' }}>
          <h2 style={{ fontSize:19.5, fontWeight:800, color:'var(--text)' }}>נתוני העסקה לחתימה</h2>
          <div style={{ display:'flex', gap:8 }}>
            <button className="apple-btn apple-btn-blue" onClick={() => window.print()} style={{ minHeight:36, fontSize:14.9 }}>
              <Printer size={14} strokeWidth={2.2} />
              הדפסה / PDF
            </button>
            <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ minHeight:36, fontSize:14.9 }}>סגירה</button>
          </div>
        </div>

        <div style={{ padding:'24px 28px 28px' }}>
          <div style={{ textAlign:'center', marginBottom:20 }}>
            <img src="/logo-chabad.png" alt="רשת חינוך חב״ד" style={{ height:46, margin:'0 auto 10px', display:'block' }} />
            <h3 style={{ fontSize:21.8, fontWeight:800, color:'var(--text)', letterSpacing:'-0.02em' }}>נתוני העסקה</h3>
            <p style={{ fontSize:14.9, color:'var(--text3)', marginTop:3 }}>{school?.name} · {monthLabel}</p>
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
                <span style={{ fontSize:15.5, color:'var(--text2)', fontWeight: i === pay.length - 1 ? 700 : 400 }}>{k}</span>
                <span className="num" style={{ fontSize: i === pay.length - 1 ? 17 : 14,
                  fontWeight: i === pay.length - 1 ? 800 : 600,
                  color: i === pay.length - 1 ? 'var(--purple)' : 'var(--text)' }}>
                  {v.toLocaleString('he-IL')} ₪
                </span>
              </div>
            ))}
          </div>

          <p style={{ fontSize:14.4, color:'var(--text2)', lineHeight:1.8, marginBottom:20 }}>
            אני החתומה מטה מאשרת שנתוני ההעסקה המפורטים לעיל נכונים, ושהם משקפים את
            תנאי העסקתי ברשת גני חב״ד.
          </p>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            {['חתימת העובדת', 'תאריך'].map(l => (
              <div key={l}>
                <div style={{ borderBottom:'1px solid var(--text3)', height:44 }} />
                <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:5 }}>{l}</p>
              </div>
            ))}
          </div>

          <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:22, lineHeight:1.7, textAlign:'center' }}>
            מסמך פנימי של רשת גני חב״ד. אינו מחליף טופס 101.
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
  // רק מורים שהנתונים הושלמו (יש שכר רשמי) → ממתינים לאישור שרה
  const readyToApprove = teachers.filter(needsApproval);
  // מורים עדיין ממתינים לסימולציה אצל חשבת שכר
  const waitingSim     = teachers.filter(needsSim);

  const bySchool = schools.map(s => ({
    school: s,
    ts: readyToApprove.filter(t => t.schoolId === s.id),
  })).filter(g => g.ts.length > 0);

  return (
    <div className="modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:50, overflowY:'auto', backdropFilter:'blur(6px)' }} dir="rtl">
      <div className="modal-card" style={{ maxWidth:680, margin:'0 auto', background:'var(--apple-bg)', minHeight:'100vh', padding:24 }}>
        {/* Header */}
        <div className="modal-head" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, gap:10, flexWrap:'wrap' }}>
          <div>
            <h2 style={{ fontSize:23, fontWeight:700, letterSpacing:'-0.02em', color:'var(--apple-text)', marginBottom:2 }}>אישור שכר חודשי</h2>
            <p style={{ fontSize:14.9, color:'var(--apple-text2)' }}>{readyToApprove.length} ממתינים לאישורך</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {readyToApprove.length > 0 && (
              <button className="apple-btn apple-btn-green" onClick={onApproveAll} style={{ fontSize:14.9 }}>
                אשר הכל ({readyToApprove.length})
              </button>
            )}
            <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ fontSize:14.9 }}>סגור</button>
          </div>
        </div>

        {/* ממתינים לסימולציה */}
        {waitingSim.length > 0 && (
          <div className="apple-card" style={{ padding:16, marginBottom:16, borderRight:'3px solid var(--apple-orange)' }}>
            <p style={{ fontWeight:600, fontSize:16.1, color:'var(--apple-text)', marginBottom:4 }}>
              {waitingSim.length} עובדי הוראה ממתינים לסימולציה
            </p>
            <p style={{ fontSize:13.8, color:'var(--apple-text2)', marginBottom:10 }}>אחרי שחשבת השכר תזין שכר רשמי, הם יופיעו כאן</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {waitingSim.slice(0, 8).map(t => (
                <span key={t.id} className="apple-badge badge-orange">{t.name}</span>
              ))}
              {waitingSim.length > 8 && <span style={{ fontSize:13.8, color:'var(--apple-text2)' }}>ועוד {waitingSim.length - 8}...</span>}
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
                  <span style={{ background:'var(--apple-blue)', color:'#fff', fontSize:13.2, fontWeight:700, padding:'2px 8px', borderRadius:10 }}>{ts.length}</span>
                  <span style={{ fontWeight:600, fontSize:16.1, color:'var(--apple-text)' }}>{school.name}{school.city ? ` — ${school.city}` : ''}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {ts.map(t => {
                    const emp = calcEmployer(t);
                    return (
                      <div key={t.id} className="apple-card" style={{ padding:16 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                          <div>
                            <p style={{ fontWeight:600, fontSize:17.2, color:'var(--apple-text)', marginBottom:2 }}>{t.name}</p>
                            {t.tzId && <p style={{ fontSize:13.8, color:'var(--apple-text3)', fontFamily:'monospace' }}>{t.tzId}</p>}
                            {t._changedAt && <p style={{ fontSize:13.8, color:'var(--apple-blue)', marginTop:2 }}>שונה: {new Date(t._changedAt).toLocaleDateString('he-IL')}</p>}
                          </div>
                          <div style={{ textAlign:'left' }}>
                            <p style={{ fontSize:13.2, color:'var(--apple-green)', fontWeight:600, marginBottom:2 }}>שכר רשמי</p>
                            <p style={{ fontWeight:700, fontSize:18.4, color:'var(--apple-text)' }}>{emp.gross.toLocaleString()} ₪</p>
                            <p style={{ fontSize:13.2, color:'var(--apple-text3)' }}>למעסיק: {emp.total.toLocaleString()} ₪</p>
                          </div>
                        </div>
                        <div style={{ marginBottom:12 }}><TeacherDiff t={t} /></div>
                        <div style={{ display:'flex', justifyContent:'flex-end' }}>
                          <button className="apple-btn apple-btn-green" onClick={() => onApprove(t.id)} style={{ fontSize:14.9, padding:'7px 16px' }}>
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
        <p style={{ fontSize:13.8, color:'var(--apple-text3)', textAlign:'center', marginTop:32 }}>
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
    <div className="modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(6px)', overflowY:'auto' }}>
      <div className="apple-card modal-card" style={{ width:'100%', maxWidth:360, padding:24 }}>
        <h3 style={{ fontWeight:700, fontSize:19.5, letterSpacing:'-0.01em', color:'var(--apple-text)', marginBottom:20 }}>שינוי משרה — {teacher.name}</h3>
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
                  flex:1, minWidth:0, padding:'5px 4px', borderRadius:8, border:'none', fontSize:13.8, fontWeight:600, cursor:'pointer',
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
                  padding:'10px 14px', borderRadius:10, border:'none', fontSize:16.1, fontWeight: c.reasonType===r.id?600:400,
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
  body += `\n— רשימת עובדי הוראה —\n`;
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
  if (s.includes('שילוב')) return 'inclusion';
  const known = ['homeroom','homeroom1','inclusion','subject6','subject8','team','counselor','counselor2'];
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
  downloadBlob(csv, `עובדי_הוראה_${schoolName || 'בית_ספר'}.csv`, 'text/csv;charset=utf-8;');
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
    <div className="modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, overflowY:'auto' }}>
      <div className="apple-card modal-card" style={{ width:'100%', maxWidth:640, padding:24, margin:'16px auto' }}>
        <div className="modal-head" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ fontWeight:700, fontSize:19.5, color:'var(--apple-text)', letterSpacing:'-0.01em' }}>ייבוא עובדי הוראה — {schoolName}</h2>
          <button onClick={onClose} style={{ background:'var(--apple-fill)', border:'none', borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:16.1, color:'var(--apple-text2)', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={15} strokeWidth={2.4} /></button>
        </div>

        {/* שלב 1 */}
        <div style={{ background:'rgba(0,122,255,0.06)', borderRadius:14, padding:16, marginBottom:12, border:'1px solid rgba(0,122,255,0.15)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div>
              <p style={{ fontWeight:700, fontSize:16.1, color:'var(--apple-blue)', marginBottom:2 }}>שלב 1 — הורד תבנית למילוי</p>
              <p style={{ fontSize:13.8, color:'var(--apple-text2)' }}>קובץ CSV עם כל השדות + שורות לדוגמה</p>
            </div>
            <button className="apple-btn apple-btn-blue" onClick={() => downloadTemplate(schoolName)} style={{ fontSize:14.9, padding:'8px 14px', whiteSpace:'nowrap' }}>⬇️ הורד תבנית</button>
          </div>
          <div style={{ marginTop:10, fontSize:13.8, color:'var(--apple-blue)', background:'rgba(0,122,255,0.08)', borderRadius:10, padding:'8px 12px', lineHeight:1.7 }}>
            שם · ת.ז. · מייל · רפורמה · דרגה · ותק · % משרה · תפקיד · שיבוץ זמני · תאריך התחלה/סיום
          </div>
        </div>

        {/* שלב 2 */}
        <div style={{ background:'var(--apple-fill)', borderRadius:14, padding:16, marginBottom:12 }}>
          <p style={{ fontWeight:700, fontSize:14.9, color:'var(--apple-text2)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.04em' }}>שלב 2 — העלי קובץ</p>
          <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', border:'2px dashed var(--apple-fill2)', borderRadius:12, padding:24, cursor:'pointer', transition:'border-color 0.15s', background:'var(--apple-surface)' }}>
            <FolderOpen size={28} strokeWidth={1.8} color="var(--text3)" style={{ marginBottom:9 }} />
            <span style={{ fontWeight:600, fontSize:16.1, color:'var(--apple-text)' }}>לחצי להעלאת קובץ CSV</span>
            <span style={{ fontSize:13.8, color:'var(--apple-text3)', marginTop:4 }}>או גררי לכאן</span>
            <input type="file" accept=".csv,.txt" onChange={handleFile} style={{ display:'none' }} />
          </label>
          {text && (
            <p style={{ fontSize:13.8, color:'var(--apple-green)', fontWeight:600, textAlign:'center', marginTop:10 }}>
              קובץ נקרא — {text.split('\n').filter(l=>l.trim()).length} שורות
            </p>
          )}
        </div>

        {error && (
          <div style={{ background:'rgba(255,59,48,0.08)', border:'1px solid rgba(255,59,48,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:14.9, color:'var(--apple-red)', fontWeight:600 }}>
            {error}
          </div>
        )}

        {preview ? (
          <div>
            <p style={{ fontWeight:700, fontSize:16.1, color:'var(--apple-text)', marginBottom:10 }}>שלב 3 — אישור: נמצאו {preview.length} עובדי הוראה</p>
            <div style={{ background:'rgba(255,159,10,0.08)', border:'1px solid rgba(255,159,10,0.2)', borderRadius:10, padding:'8px 12px', marginBottom:12, fontSize:13.8, color:'var(--warn)' }}>
              <Lightbulb size={13} strokeWidth={2.2} style={{ display:'inline', verticalAlign:'-2px', marginInlineEnd:4 }} />
            לאחר הייבוא — כנסי לסימולטור והזיני את השכר הרשמי לכל מורה
            </div>
            <div className="table-scroll" style={{ overflowX:'auto', border:'1px solid var(--apple-fill2)', borderRadius:12, maxHeight:220, overflowY:'auto' }}>
              <table className="apple-table" style={{ fontSize:13.8 }}>
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
                      <td style={{ fontFamily:'monospace', fontSize:13.2 }}>{t.tzId||'—'}</td>
                      <td style={{ fontSize:13.2, color:'var(--apple-text2)' }}>{t.email||'—'}</td>
                      <td>{reformLabel(t.reform)}</td>
                      <td>{t.grade==='intern'?'מתמחה':t.grade}</td>
                      <td>{t.seniority}</td>
                      <td>{t.scopePct}%</td>
                      <td style={{ fontSize:13.2 }}>{ROLES.find(r=>r.id===t.role)?.label.split('(')[0].trim()||'—'}</td>
                      <td style={{ textAlign:'center' }}>{t.isTemp?'כן':'—'}</td>
                      <td style={{ fontSize:13.2 }}>{t.startDate||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button className="apple-btn apple-btn-ghost" onClick={() => setPrev(null)} style={{ flex:1, fontSize:16.1 }}><ArrowRight size={15} strokeWidth={2.4} />חזרה</button>
              <button className="apple-btn apple-btn-green" onClick={() => onImport(preview)} style={{ flex:1, fontSize:16.1 }}>ייבא {preview.length} עובדי הוראה<Check size={15} strokeWidth={2.6} /></button>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', gap:8 }}>
            <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ flex:1, fontSize:16.1 }}>ביטול</button>
            <button className="apple-btn apple-btn-blue" onClick={handlePreview} disabled={!text.trim()} style={{ flex:1, fontSize:16.1 }}>תצוגה מקדימה<ArrowLeft size={15} strokeWidth={2.4} /></button>
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
          <span className="apple-btn apple-btn-ghost" style={{ fontSize:13.8, padding:'5px 12px', display:'inline-flex', alignItems:'center', gap:4 }}>
            + הוסף קובץ
          </span>
          <input type="file" style={{ display:'none' }} onChange={handleAdd} />
        </label>
      </div>
      {files.length === 0 ? (
        <p style={{ fontSize:13.8, color:'var(--apple-text3)', textAlign:'center', padding:'12px 0' }}>אין קבצים מצורפים</p>
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
                <p style={{ fontSize:14.9, fontWeight:600, color:'var(--apple-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</p>
                <p style={{ fontSize:13.2, color:'var(--apple-text3)' }}>{new Date(f.uploadedAt).toLocaleDateString('he-IL')}</p>
              </div>
              <button onClick={() => download(f)} style={{ fontSize:13.8, color:'var(--apple-blue)', background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:'4px 8px' }}>הורד</button>
              <button onClick={() => onChange(files.filter(x => x.id !== f.id))} style={{ fontSize:14.9, color:'var(--apple-red)', background:'none', border:'none', cursor:'pointer', padding:'4px 6px' }}><X size={15} strokeWidth={2.4} /></button>
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
    <div className={['fixed inset-0 bg-black/50 z-50 flex', showSimulator ? 'flex-row items-stretch' : 'flex-col items-center justify-start overflow-y-auto p-4 modal-overlay'].join(' ')}>

      {/* טופס — פאנל ימין */}
      <div className={showSimulator ? undefined : 'modal-card'} style={showSimulator
        ? { width:'45%', display:'flex', flexDirection:'column', background:'#fff', overflowY:'auto' }
        : { background:'#fff', borderRadius:18, width:'100%', maxWidth:520, margin:'24px auto', boxShadow:'var(--apple-shadow)' }}>
        <div className="modal-head" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 24px', borderBottom:'0.5px solid var(--apple-fill2)', background:'#fff' }}>
          <h2 style={{ fontSize:19.5, fontWeight:700, letterSpacing:'-0.02em', color:'var(--apple-text)' }}>{t.id ? 'עריכת עובד/ת הוראה' : 'הוספת עובד/ת הוראה'}</h2>
          <button onClick={onClose} style={{ background:'var(--apple-fill)', border:'none', borderRadius:'50%', width:28, height:28, fontSize:16.1, cursor:'pointer', color:'var(--text3)', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={15} strokeWidth={2.4} /></button>
        </div>
        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>

          {/* שם + ת.ז */}
          <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:10 }}>
            <div>
              <p className="apple-label">שם עובד/ת ההוראה</p>
              <input value={t.name} onChange={e => set('name', e.target.value)} placeholder="שם מלא" className="apple-input" />
            </div>
            <div>
              <p className="apple-label">תעודת זהות</p>
              <input value={t.tzId} onChange={e => set('tzId', e.target.value)} placeholder="000000000" dir="ltr" className="apple-input" style={{ fontFamily:'monospace' }} />
            </div>
          </div>

          {/* סוג המשרה — עובדת עם כמה תפקידים = שורה לכל תפקיד (שרה, 15.9) */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <div style={{ flex:'1 1 150px' }}>
              <p className="apple-label">סוג המשרה בשורה הזו</p>
              <select value={t.job || 'teaching'} onChange={e => set('job', e.target.value)} className="apple-select">
                {JOBS.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
              </select>
            </div>
            {isHourlyRow(t) && (
              <>
                <div style={{ flex:'1 1 110px' }}>
                  <p className="apple-label">שעות שבועיות</p>
                  <input type="number" min="0" dir="ltr" className="apple-input" value={t.frontalHours ?? ''}
                    onChange={e => set('frontalHours', e.target.value === '' ? 0 : Number(e.target.value))} />
                </div>
                {userRole !== 'principal' && (
                  <div style={{ flex:'1 1 110px' }}>
                    <p className="apple-label">תעריף לשעה (₪)</p>
                    <input type="number" min="0" dir="ltr" className="apple-input" value={t.hourlyRate ?? ''}
                      placeholder={String(MIN_WAGE_HOUR)}
                      onChange={e => set('hourlyRate', e.target.value === '' ? null : Number(e.target.value))} />
                  </div>
                )}
              </>
            )}
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
                <p style={{ fontWeight:600, fontSize:16.1, color:'var(--apple-text)' }}>שיבוץ זמני (מילוי מקום)</p>
                {t.isTemp && <p style={{ fontSize:13.8, color:'var(--apple-orange)' }}>תאריך סיום — חובה</p>}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:10 }}>
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
            <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:10 }}>
              <div>
                <p className="apple-label">דרגה</p>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:4 }}>
                  {OFEK_GRADES.map(g => (
                    <button key={g.id} onClick={() => set('grade', g.id)} style={{
                      padding:'7px 2px', borderRadius:8, border:'none', fontSize:13.8, fontWeight:700, cursor:'pointer',
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
                      padding:'8px 12px', borderRadius:8, border:'none', fontSize:14.9, fontWeight:600, cursor:'pointer', textAlign:'right',
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
                    padding:'8px 12px', borderRadius:8, border:'none', fontSize:13.8, fontWeight:600, cursor:'pointer', textAlign:'right',
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
                  <span style={{ fontSize:14.9, color:'var(--apple-text2)' }}>אחוז משרה</span>
                  <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{t.scopePct}%</span>
                </div>
                <input type="range" min={1} max={140} value={t.scopePct} onChange={e => syncFromScope(+e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
                <div style={{ display:'flex', gap:4, marginTop:8, flexWrap:'wrap' }}>
                  {[50,67,75,100,112,125,140].map(v => (
                    <button key={v} onClick={() => syncFromScope(v)} style={{
                      flex:1, minWidth:0, padding:'5px 2px', borderRadius:8, border:'none', fontSize:13.2, fontWeight:600, cursor:'pointer',
                      background: t.scopePct===v ? 'var(--apple-blue)' : '#fff',
                      color: t.scopePct===v ? '#fff' : 'var(--apple-text2)',
                    }}>{v}%</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:14.9, color:'var(--apple-text2)' }}>שעות פרונטליות (מ-{baseFrontal})</span>
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
                      <p style={{ fontSize:13.2, color:'var(--apple-text3)', marginBottom:2 }}>{c.label}</p>
                      <p style={{ fontWeight:700, color:'var(--apple-blue)', fontSize:16.1 }}>{c.val}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* שינויי משרה */}
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <p className="apple-label" style={{ marginBottom:0 }}>שינויי משרה</p>
                <button className="apple-btn apple-btn-blue" onClick={() => setShowScopeChange(true)} style={{ fontSize:13.8, padding:'5px 12px' }}>+ הוסף</button>
              </div>
              {sortedChanges.length === 0 ? (
                <p style={{ fontSize:13.8, color:'var(--apple-text3)', textAlign:'center', padding:'8px 0' }}>אין שינויים רשומים</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {sortedChanges.map(c => (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', borderRadius:10, padding:'8px 12px' }}>
                      <div style={{ flex:1, fontSize:13.8 }}>
                        <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{c.scopePct}%</span>
                        {c.frontalHours && <span style={{ color:'var(--apple-text2)' }}> · {c.frontalHours} פר׳</span>}
                        <span style={{ color:'var(--apple-text3)' }}> · {fmt(c.date)}</span>
                        <span style={{ color:'var(--apple-orange)' }}> · {REASON_TYPES.find(r=>r.id===c.reasonType)?.label}</span>
                        {c.detail && <span style={{ color:'var(--apple-text2)' }}> ({c.detail})</span>}
                      </div>
                      <button onClick={() => removeScopeChange(c.id)} style={{ background:'none', border:'none', color:'var(--apple-red)', cursor:'pointer', fontSize:16.1 }}><X size={15} strokeWidth={2.4} /></button>
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
                    padding:'10px 12px', borderRadius:10, border:'none', fontSize:14.9, fontWeight:600, cursor:'pointer',
                    background: t.degree===v ? 'var(--apple-purple)' : 'var(--apple-fill)',
                    color: t.degree===v ? '#fff' : 'var(--apple-text)',
                  }}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:14.9, color:'var(--apple-text2)' }}>אחוז משרה</span>
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
                    <span style={{ fontSize:13.2, color:'var(--text3)' }}>מתאריך</span>
                    <input type="date" className="apple-input" dir="ltr" value={String(t.leaveFrom ?? '').slice(0,10)}
                      onChange={e => set('leaveFrom', e.target.value || null)} />
                  </label>
                  <label style={{ display:'flex', flexDirection:'column', gap:3, flex:'1 1 120px' }}>
                    <span style={{ fontSize:13.2, color:'var(--text3)' }}>עד תאריך (אם ידוע)</span>
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
              <span style={{ fontSize:14.9, color:'var(--apple-text2)' }}>שנות ותק</span>
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
            {!isPrincipalRow(t) && (
              <div style={{ marginTop:8 }}>
                <p className="apple-label">תפקידים נוספים</p>
                <ExtraRoles t={t} onChange={v => set('extraRoles', v)} />
              </div>
            )}
            {!isPrincipalRow(t) && !isHourlyRow(t) && (
              <div style={{ marginTop:8 }}>
                <p className="apple-label">שעות מחוץ לתקן (ייעוץ / שילוב)</p>
                <input type="number" min="0" dir="ltr" className="apple-input" style={{ maxWidth:140 }}
                  value={t.nonQuotaHours ?? ''}
                  placeholder={isCounselorRow(t) ? `כולן (${Number(t.frontalHours) || 0})` : '0'}
                  onChange={e => set('nonQuotaHours', e.target.value === '' ? null : Number(e.target.value))} />
                <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:3 }}>
                  השעות האלה לא נספרות בתקן השעות של בית הספר. השאר נספרות.
                </p>
              </div>
            )}
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
                <p style={{ fontSize:14.9, fontWeight:600, color:'var(--purple)', marginBottom:2 }}>
                  {t.reform === 'pre' ? 'תוספת אם עובדת' : 'ילדים עד גיל 18'}
                </p>
                <p style={{ fontSize:13.8, color:'var(--text2)' }}>
                  {t.reform === 'pre'
                    ? 'ילדים עד גיל 18 (זכאות מ-79% משרה)'
                    : 'באופק: 20 שעות = 76% · 21 = 86% · 22 = 91% · 23 = 94%'}
                </p>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button onClick={() => set('childrenUnder18', Math.max(0, (t.childrenUnder18||0)-1))}
                  style={{ width:28, height:28, borderRadius:'50%', border:'1px solid var(--apple-fill2)', background:'var(--apple-fill)', fontSize:18.4, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>−</button>
                <span style={{ fontWeight:800, fontSize:20.7, color:'var(--apple-purple)', minWidth:20, textAlign:'center' }}>{t.childrenUnder18||0}</span>
                <button onClick={() => set('childrenUnder18', (t.childrenUnder18||0)+1)}
                  style={{ width:28, height:28, borderRadius:'50%', border:'1px solid var(--apple-fill2)', background:'var(--apple-fill)', fontSize:18.4, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>+</button>
              </div>
            </div>
            {momBonusEligible(t) && (
              <p style={{ fontSize:13.8, color:'var(--apple-purple)', fontWeight:600, marginTop:8 }}>
                זכאית לתוספת אם — {t.childrenUnder18} ילדים עד גיל 18
                {` · ${effectiveScope(t)}% משרה — כולל תוספת אם`}
              </p>
            )}
            {t.reform === 'pre' && (t.childrenUnder18||0) > 0 && !momBonusEligible(t) && (
              <p style={{ fontSize:13.8, color:'var(--apple-orange)', marginTop:8 }}>
                {!t.gender ? 'חסר מין — תוספת אם ניתנת לאם בלבד'
                  : t.gender !== 'f' ? 'תוספת אם ניתנת לאם בלבד'
                  : `אחוז משרה ${computedBaseScope(t)}% — התוספת ניתנת מעל ${MOM_MIN_SCOPE}%`}
              </p>
            )}
            {/* מין: הזכאות לתוספת אם נגזרה ממספר הילדים בלבד, ולכן שלושה
                גברים ברשת הופיעו כזכאים. השדה נשאל כאן, ליד הילדים. */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginTop:10 }}>
              <div>
                <p style={{ fontSize:15.5, fontWeight:600, color:'var(--text)' }}>מין</p>
                <p style={{ fontSize:13.8, color:'var(--text2)' }}>קובע את הזכאות לתוספת אם</p>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {[{ v:'f', l:'אישה' }, { v:'m', l:'גבר' }].map(o => (
                  <button key={o.v} onClick={() => set('gender', t.gender === o.v ? null : o.v)}
                    className={`apple-btn ${t.gender === o.v ? 'apple-btn-blue' : 'apple-btn-ghost'}`}
                    style={{ minHeight:32, padding:'0 14px', fontSize:14.4 }}>
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
              <p style={{ fontSize:14.9, fontWeight:600, color:'var(--text2)', marginBottom:4 }}>שכר</p>
              <p style={{ fontSize:13.8, color:'var(--text3)' }}>
                {simComplete(t)
                  ? 'הוזן על ידי חשבת השכר. שינוי בוותק, בדרגה, בתואר או בשעות יחזיר אותה לחישוב מחדש.'
                  : 'ממתין לחשבת השכר.'}
              </p>
            </div>
          ) : (
          <div style={{ background:'rgba(52,199,89,0.08)', borderRadius:14, padding:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <p style={{ fontSize:14.9, fontWeight:600, color:'#1a7a38' }}>שכר משולב מהסימולטור</p>
              <button className="apple-btn apple-btn-green" onClick={() => setShowSimulator(v => !v)} style={{ fontSize:13.8, padding:'6px 12px' }}>
                {showSimulator ? 'סגור' : 'פתח סימולטור'}
              </button>
            </div>
            <p style={{ fontSize:13.8, color:'var(--ok)', marginBottom:10 }}>הריצי את הסימולטור → הכניסי כאן את "השכר המשולב"</p>

            {/* עלות מעביד בפועל — הנהלת החשבונות מחליפה את האומדן */}
            {userRole !== 'principal' && simComplete(t) && (
              <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:12, marginBottom:10 }}>
                <p className="apple-label" style={{ marginBottom:4 }}>עלות מעביד בפועל — הנהלת חשבונות</p>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input type="number" className="apple-input" dir="ltr" style={{ fontSize:15.5 }}
                    value={t._actualEmployerCost || ''}
                    onChange={e => set('_actualEmployerCost', e.target.value ? Number(e.target.value) : null)}
                    placeholder={`אומדן: ${emp.estimate.toLocaleString('he-IL')} ₪`} />
                  {t._actualEmployerCost && <button onClick={() => set('_actualEmployerCost', null)}
                    style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer' }}><X size={15} strokeWidth={2.4} /></button>}
                </div>
                <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:6, lineHeight:1.6 }}>
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
                      placeholder="ברוטו מוסכם" style={{ fontSize:16.1 }} />
                    <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:6, lineHeight:1.6 }}>
                      מחליף את הברוטו ואת הסימולציה. השורה לא תמתין לחשבת השכר.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* אופק חדש — שני שדות. למנהלת סימולציית ניהול אחת. */}
            {isPrincipalRow(t) ? (
              <div>
                <p style={{ fontSize:13.2, fontWeight:700, color:'var(--purple)', marginBottom:4 }}>סימולציית אופק — ניהול</p>
                <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                  <input type="number" className="apple-input" dir="ltr" style={{ fontSize:14.9 }}
                    value={t._officialGross || ''}
                    onChange={e => set('_officialGross', e.target.value ? Number(e.target.value) : null)}
                    placeholder="שכר ניהול..." disabled={!!t._agreedGross} />
                  {t._officialGross && <button onClick={() => set('_officialGross', null)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer' }}><X size={15} strokeWidth={2.4} /></button>}
                </div>
                <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:5 }}>
                  הברוטו של המנהלת. הבסיס בעולם ישן (דרגה+ותק וגמול ניהול) מחושב בלחיצה על "חישוב", וההפרש הוא תוספת בית חב"ד — כמו אצל כל עובדי ההוראה.
                </p>
              </div>
            ) : t.reform === 'ofek' ? (<>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <div>
                  <p style={{ fontSize:13.2, fontWeight:700, color:'#1a7a38', marginBottom:4 }}>סימולציית אופק חדש</p>
                  <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                    <input type="number" className="apple-input" dir="ltr" style={{ fontSize:14.9 }}
                      value={t._officialGross || ''}
                      onChange={e => set('_officialGross', e.target.value ? Number(e.target.value) : null)}
                      placeholder="שכר אופק..." />
                    {t._officialGross && <button onClick={() => set('_officialGross', null)} style={{ background:'none', border:'none', color:'var(--apple-red)', cursor:'pointer', fontSize:16.1 }}><X size={15} strokeWidth={2.4} /></button>}
                  </div>
                </div>
                <div>
                  <p style={{ fontSize:13.2, fontWeight:700, color:'var(--purple)', marginBottom:4 }}>סימולציית עולם ישן</p>
                  <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                    <input type="number" className="apple-input" dir="ltr" style={{ fontSize:14.9 }}
                      value={t._officialGrossPre || ''}
                      onChange={e => set('_officialGrossPre', e.target.value ? Number(e.target.value) : null)}
                      placeholder="שכר טרום..." />
                    {t._officialGrossPre && <button onClick={() => set('_officialGrossPre', null)} style={{ background:'none', border:'none', color:'var(--apple-red)', cursor:'pointer', fontSize:16.1 }}><X size={15} strokeWidth={2.4} /></button>}
                  </div>
                </div>
              </div>
              {t._officialGross && t._officialGrossPre && (
                <div style={{ background:'rgba(88,86,214,0.1)', borderRadius:10, padding:'8px 12px', fontSize:13.8, color:'var(--apple-purple)', fontWeight:600 }}>
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
                {t._officialGross && <button onClick={() => set('_officialGross', null)} style={{ background:'none', border:'none', color:'var(--apple-red)', cursor:'pointer', fontSize:18.4 }}><X size={15} strokeWidth={2.4} /></button>}
              </div>
            )}
          </div>
          )}

          {/* פירוק התשלום — נתון רשמי בלבד */}
          {simComplete(t) ? (
            <div className="apple-section" style={{ background:'var(--ok-bg)', border:'1px solid var(--ok-line)' }}>
              <p style={{ fontSize:13.2, fontWeight:700, color:'var(--ok)', textAlign:'center', marginBottom:12, letterSpacing:'0.04em' }}>
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
                  <span style={{ fontSize:14.4, color:'var(--text2)' }}>
                    {label}
                    {note && <span style={{ fontSize:13.2, color:'var(--text3)', marginInlineStart:6 }}>{note}</span>}
                  </span>
                  <span className="num" style={{ fontSize:16.1, fontWeight:700, color:'var(--text)' }}>{val.toLocaleString('he-IL')} ₪</span>
                </div>
              ))}
              {/* מה בתוך הוצאות המעביד. קודם היה כאן מספר אחד, 40%, שאיש
                  לא יכול היה להצליב מול מה שהנהלת החשבונות מוציאה בפועל. */}
              {emp.isEstimate && (
                <div style={{ marginTop:2, marginBottom:4, paddingInlineStart:12,
                  borderInlineStart:'2px solid var(--ok-line)' }}>
                  {emp.parts.filter(x => x.amount).map(x => (
                    <div key={x.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8, padding:'2px 0' }}>
                      <span style={{ fontSize:13.2, color:'var(--text3)' }}>
                        {x.label}
                        {x.rate && <span style={{ marginInlineStart:5, opacity:.75 }}>{(x.rate * 100).toFixed(2).replace(/\.?0+$/, '')}%</span>}
                      </span>
                      <span className="num" style={{ fontSize:13.2, color:'var(--text3)' }}>{x.amount.toLocaleString('he-IL')} ₪</span>
                    </div>
                  ))}
                  {emp.supplement > 0 && (
                    <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:4, opacity:.8 }}>
                      מזה {emp.employerSupp.toLocaleString('he-IL')} ₪ על תוספת בית חב"ד — היא נושאת מס שכר וביטוח לאומי בלבד
                    </p>
                  )}
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10,
                borderTop:'1px solid var(--ok-line)', marginTop:7, paddingTop:9 }}>
                <span style={{ fontSize:14.9, fontWeight:700, color:'var(--text)' }}>סה״כ למעסיק</span>
                <span className="num" style={{ fontSize:20.7, fontWeight:800, color:'var(--purple)' }}>{emp.total.toLocaleString('he-IL')} ₪</span>
              </div>
              <p style={{ fontSize:13.2, color:'var(--text3)', textAlign:'center', marginTop:8 }}>
                נטו משוער {calcNet(emp.gross).toLocaleString('he-IL')} ₪
              </p>
            </div>
          ) : (
            <div style={{ background:'#FFF3E0', border:'1px dashed #FFB74D', borderRadius:12, padding:16, textAlign:'center' }}>
              <p style={{ fontSize:14.9, fontWeight:600, color:'#E65100', marginBottom:6 }}>נדרשת סימולציה במחשבון משרד החינוך</p>
              <p style={{ fontSize:13.8, color:'#999' }}>הזיני את השכר המשולב בשדה למעלה לאחר ביצוע הסימולציה</p>
            </div>
          )}
        </div>

        {/* במובייל השורה דביקה לתחתית המסך — הטופס ארוך והאגודל קצר */}
        <div className="modal-foot" style={{ padding:'16px 24px', borderTop:'1px solid var(--apple-fill2)', display:'flex', gap:8 }}>
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
    <div className="modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(6px)', overflowY:'auto' }}>
      <div className="apple-card modal-card" style={{ width:'100%', maxWidth:360, padding:24 }}>
        <h2 style={{ fontSize:19.5, fontWeight:700, letterSpacing:'-0.02em', color:'var(--apple-text)', marginBottom:20 }}>
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
            <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:6, lineHeight:1.5 }}>
              קובע את ברירת המחדל לעובדי הוראה חדשים ואת המחשבון הרשמי שייפתח. אפשר לשנות מסלול לעובד/ת הוראה בודד/ת.
            </p>
          </div>
          <div>
            <p className="apple-label">סמל מוסד</p>
            <input type="text" dir="ltr" className="apple-input"
              value={s.semel ?? ''}
              onChange={e => setS(p => ({ ...p, semel: e.target.value || null }))}
              placeholder="למשל 661967" style={{ textAlign:'center' }} />
            <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:6, lineHeight:1.5 }}>
              מוצג לעובד/ת הוראה חדש/ה בהנחיה לפתיחת תיק מקוון במשרד החינוך.
            </p>
          </div>
          <div>
            <p className="apple-label">מכסת שעות עובדי הוראה</p>
            <input type="number" min="0" dir="ltr" className="apple-input"
              value={s.hoursQuota ?? ''}
              onChange={e => setS(p => ({ ...p, hoursQuota: e.target.value === '' ? null : Number(e.target.value) }))}
              placeholder="לא הוגדרה" style={{ textAlign:'center' }} />
            <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:6, lineHeight:1.5 }}>
              סך השעות הפרונטליות שמותר להקצות בבית הספר. אי אפשר לשמור מורה שתחרוג מהמכסה.
              מכסה שלא הוגדרה אינה חוסמת.
            </p>
          </div>

          <input value={s.principalEmail || ''} onChange={e => setS(p => ({...p, principalEmail: e.target.value}))} placeholder="מייל מנהלת" dir="ltr" className="apple-input" />
          <input value={s.coordinatorEmail || ''} onChange={e => setS(p => ({...p, coordinatorEmail: e.target.value}))} placeholder="מייל שליח (עותק)" dir="ltr" className="apple-input" />
        </div>
        <div className="modal-foot modal-foot-bleed" style={{ display:'flex', gap:8 }}>
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
    <div className="print-sheet modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:50, overflowY:'auto' }} dir="rtl">
      <div className="modal-card" style={{ maxWidth:1000, margin:'0 auto', background:'var(--apple-surface)', minHeight:'100vh', padding:32 }}>
        <div className="no-print modal-head" style={{ display:'flex', justifyContent:'space-between', marginBottom:24, gap:8, flexWrap:'wrap' }}>
          <button className="apple-btn apple-btn-ghost" onClick={onClose}><ArrowRight size={15} strokeWidth={2.4} />חזרה</button>
          <div style={{ display:'flex', gap:8 }}>
            <button className="apple-btn apple-btn-ghost" onClick={exportExcel}>הורדה לאקסל</button>
            <button className="apple-btn apple-btn-blue" onClick={() => window.print()}><Printer size={15} strokeWidth={2.2} />הדפסה</button>
          </div>
        </div>

        <div style={{ borderBottom:'2px solid var(--apple-text)', paddingBottom:16, marginBottom:24 }}>
          <h1 style={{ fontSize:27.6, fontWeight:800, letterSpacing:'-0.02em', color:'var(--apple-text)', marginBottom:4 }}>דוח שכר עובדי הוראה</h1>
          <h2 style={{ fontSize:19.5, fontWeight:600, color:'var(--apple-text2)', marginBottom:4 }}>{school.name}{school.city ? ` — ${school.city}` : ''}</h2>
          <p style={{ fontSize:14.9, color:'var(--apple-text3)' }}>הופק: {new Date().toLocaleDateString('he-IL')}</p>
          {pendingCount > 0 && (
            <div style={{ marginTop:8, display:'inline-flex', alignItems:'center', gap:6, background:'rgba(255,159,10,0.12)', border:'1px solid rgba(255,159,10,0.3)', borderRadius:8, padding:'4px 12px', fontSize:14.9, fontWeight:600, color:'var(--warn)' }}>
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
              <p className="apple-stat-value" style={{ fontSize:20.7 }}>{c.val}</p>
            </div>
          ))}
        </div>

        <div className="table-scroll" style={{ marginBottom:24 }}>
        <table className="apple-table sticky-first" style={{ fontSize:13.8 }}>
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
                  <td style={{ fontFamily:'monospace', fontSize:13.2 }}>{t.tzId||'—'}</td>
                  <td style={{ textAlign:'center' }}>{reformLabel(t.reform)}</td>
                  <td style={{ textAlign:'center', fontWeight:700 }}>{grade}</td>
                  <td style={{ textAlign:'center' }}>{t.seniority}</td>
                  <td style={{ textAlign:'center', fontWeight:600, color:'var(--apple-blue)' }}>{scope}%</td>
                  <td style={{ textAlign:'center' }}>{derived ? derived.frontal : (t.frontalHours ?? '—')}</td>
                  <td style={{ textAlign:'center' }}>{derived ? derived.individual : '—'}</td>
                  <td style={{ textAlign:'center' }}>{derived ? derived.presence : '—'}</td>
                  <td style={{ fontSize:13.2 }}>{t.role!=='none' ? ROLES.find(r=>r.id===t.role)?.label.split('(')[0].trim() : '—'}</td>
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
        </div>

        {ts.some(t => t.scopeChanges?.length > 0) && (
          <div style={{ marginBottom:24 }}>
            <h3 style={{ fontWeight:700, fontSize:16.1, color:'var(--apple-text)', marginBottom:12, paddingBottom:8, borderBottom:'1px solid var(--apple-fill2)' }}>שינויי משרה במהלך השנה</h3>
            <div className="table-scroll">
            <table className="apple-table sticky-first" style={{ fontSize:13.8 }}>
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
          </div>
        )}

        <div style={{ marginTop:16, padding:14, background:'var(--apple-fill)', borderRadius:12, fontSize:13.8, color:'var(--apple-text2)', lineHeight:1.8 }}>
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
    <div className="modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:100, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'24px 16px', overflowY:'auto' }} dir="rtl">
      <div className="modal-card" style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:860, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div className="modal-head" style={{ background:'linear-gradient(135deg, var(--purple), #6A47A8)', borderRadius:'20px 20px 0 0', padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', color:'#fff' }}>
          <div>
            <h2 style={{ fontWeight:800, fontSize:23, marginBottom:2 }}>דוח ממ"מ והעדרויות</h2>
            <p style={{ fontSize:14.9, opacity:.85 }}>{school.name} — {monthLabel}</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={exportCSV} disabled={withAbsence.length === 0} style={{ background:'rgba(255,255,255,0.18)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:10, padding:'7px 13px', color:'#fff', cursor: withAbsence.length ? 'pointer' : 'not-allowed', opacity: withAbsence.length ? 1 : .5, fontWeight:600, fontSize:14.9, fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:6 }}><FileSpreadsheet size={14} strokeWidth={2.2} />ייצוא CSV</button>
            <button onClick={() => window.print()} style={{ background:'rgba(255,255,255,0.18)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:10, padding:'7px 13px', color:'#fff', cursor:'pointer', fontWeight:600, fontSize:14.9, fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:6 }}><Printer size={14} strokeWidth={2.2} />הדפסה</button>
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
              <div style={{ fontSize:13.2, color:'#888', fontWeight:600, marginBottom:4 }}>{c.label}</div>
              <div style={{ fontSize:25.3, fontWeight:800, color: c.color }}>{c.val}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="table-scroll" style={{ padding:'0 24px 24px', overflowX:'auto' }}>
          {withAbsence.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px', color:'#aaa', fontSize:16.1 }}>אין העדרויות או ממ"מ לחודש זה</div>
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
                    <td style={{ fontSize:14.9, color:'#555' }}>{t.mmFor||'—'}</td>
                    <td style={{ textAlign:'center', fontWeight: (t.monthlyExtras||0)>0 ? 700 : 400, color: (t.monthlyExtras||0)>0 ? '#27ae60' : '#ccc' }}>
                      {(t.monthlyExtras||0) > 0 ? Number(t.monthlyExtras).toLocaleString()+' ₪' : '—'}
                    </td>
                    <td style={{ fontSize:13.8, color:'#888' }}>
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
        <p style={{ fontSize:15.5, fontWeight:700, color:'var(--text)' }}>
          הדיווח על {fmtMonth(monthKey)}
        </p>
        {reported
          ? <span className="apple-badge badge-green" style={{ fontSize:13.2, padding:'2px 8px' }}>נמסר</span>
          : past
            ? <span className="apple-badge badge-orange" style={{ fontSize:13.2, padding:'2px 8px' }}>אחרי המועד</span>
            : daysLeft != null && <span className="apple-badge badge-purple" style={{ fontSize:13.2, padding:'2px 8px' }}>
                {daysLeft === 0 ? 'היום המועד האחרון' : `נותרו ${daysLeft} ימים`}
              </span>}
      </div>
      <p style={{ fontSize:13.2, color:'var(--text3)', lineHeight:1.6, marginBottom:10 }}>
        העדרויות, מילוי מקום וחופשות לידה — ממלאים אותם במהלך החודש, כשהם קורים.
        {due?.report
          ? ` הדיווח נסגר ב-${String(due.report).split('-').reverse().join('/')}, ומה שיגיע אחריו לא ייכנס לתשלום.`
          : ''}
        {' '}הכפתור למטה הוא ההכרזה שסיימת.
      </p>

      {changed.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:10 }}>
          {changed.map(t => (
            <p key={t.id} style={{ fontSize:13.8, color:'var(--text2)' }}>
              · <b>{t.name}</b>
              {(t.absenceDays || 0) > 0 && ` · ${t.absenceDays} ימי היעדרות`}
              {(t.mmHours || 0) > 0 && ` · ${t.mmHours} ש׳ מילוי מקום${t.mmFor ? ` במקום ${t.mmFor}` : ''}`}
              {t.leaveType && ` · ${leaveLabel(t.leaveType)}`}
            </p>
          ))}
        </div>
      )}

      {err  && <p style={{ fontSize:14.4, color:'var(--danger)', marginBottom:8 }}>{err}</p>}
      {done && (
        <p style={{ fontSize:14.4, color: done === 'late' ? 'var(--warn)' : 'var(--ok)', fontWeight:600, marginBottom:8 }}>
          {done === 'late'
            ? 'הדיווח נמסר אחרי המועד — הוא מסומן, ויעבור לשכר רק באישור מפורש.'
            : 'הדיווח נמסר. תודה.'}
        </p>
      )}

      <button className="apple-btn apple-btn-blue" onClick={send} disabled={busy || reported}
        style={{ minHeight:38, padding:'0 18px', fontSize:14.9, opacity: reported ? .5 : 1 }}>
        {busy ? 'שולח…' : reported ? 'הדיווח נמסר' : changed.length ? 'שליחת הדיווח' : 'אין שינוי החודש — שליחה'}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   תפקידים נוספים — "תוסיף גם אפשרות מספר תפקידים למורה", "תפקיד נוסף
   ברגיל, לא בצהרון" (שרה, 15.9). הגמול הראשי נשאר בבורר שלו; כאן
   תגיות לתפקידים הנוספים, כל אחת עם ×, ובורר "+ תפקיד נוסף".
═══════════════════════════════════════════════════════════════ */
function ExtraRoles({ t, onChange, disabled = false, compact = false }) {
  const main  = t.role || t.gamulRole || 'none';
  const extra = Array.isArray(t.extraRoles) ? t.extraRoles : [];
  const free  = EXTRA_ROLE_IDS.filter(id => id !== main && !extra.includes(id));
  const name  = id => (compact ? (ROLE_SHORT[id] || id) : (ROLES.find(r => r.id === id)?.label.split('(')[0].trim() || id));
  if (isPrincipalRow(t)) return null;
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:4, alignItems:'center', justifyContent: compact ? 'center' : 'flex-start', marginTop: compact ? 4 : 0 }}
      onClick={e => e.stopPropagation()}>
      {extra.map(id => (
        <span key={id} className="apple-badge badge-purple" style={{ fontSize:12.6, padding:'1px 4px 1px 8px', gap:3 }}>
          {name(id)}
          {!disabled && (
            <button type="button" aria-label={`הסרת התפקיד ${name(id)}`}
              onClick={() => onChange(extra.filter(x => x !== id))}
              style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--purple)', padding:'0 3px', display:'inline-flex' }}>
              <X size={11} strokeWidth={2.8} />
            </button>
          )}
        </span>
      ))}
      {!disabled && free.length > 0 && (
        <select className="apple-select" value="" aria-label="הוספת תפקיד נוסף"
          onChange={e => { if (e.target.value) onChange([...extra, e.target.value]); }}
          style={{ fontSize:12.6, padding:'1px 6px', width: compact ? 118 : 'auto', minHeight:0,
            color:'var(--purple)', borderStyle:'dashed' }}>
          <option value="">+ תפקיד נוסף</option>
          {free.map(id => <option key={id} value={id}>{name(id)}</option>)}
        </select>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   צהרון ומשרות שעתיות — חלק משלהן במסך בית הספר

   "תחלק את גני תקוה שורה של צהרון" ו"תוסיף גם אפשרות מספר תפקידים
   למורה" (שרה, 15.9.2026). עובדת עם כמה תפקידים = כמה שורות; שורת
   הצהרון מחזיקה רק מה שנחוץ לשכר שעתי: שעות שבועיות, תעריף לשעה,
   וברוטו מהתלוש כשחשבת השכר מזינה אותו.
═══════════════════════════════════════════════════════════════ */
const nisH = v => (v > 0 ? Math.round(v).toLocaleString('he-IL') + ' ₪' : '—');
const HourlyNum = ({ id, value, onCommit, width = 64, placeholder = '—', title, disabled }) => (
  <input type="number" min="0" dir="ltr" inputMode="decimal" className="apple-input"
    key={`${id}-${value ?? ''}`} defaultValue={value ?? ''} placeholder={placeholder}
    title={title} disabled={disabled} aria-label={title}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    onBlur={e => {
      const v = e.target.value === '' ? null : Number(e.target.value);
      if ((v ?? null) !== (value ?? null)) onCommit(v);
    }}
    style={{ width, textAlign:'center', fontSize:14.4, padding:'3px 6px', fontWeight:700 }} />
);
// מי מזינה תעריף וברוטו: שרה וחשבת השכר. המנהלת — שעות בלבד.
const hourlyRateNote = t => (t.hourlyRate ? '' : `שכר מינימום ${MIN_WAGE_HOUR} ₪`);

function HourlyJobsTable({ rows, school, isCoord, isPrincipal, saveRow, onAdd, onDelete, onApprove, onDetails, onFullEdit, hasSearch }) {
  const totHours = rows.reduce((a, t) => a + (Number(t.frontalHours) || 0), 0);
  const totGross = rows.reduce((a, t) => a + calcEmployer(t).gross, 0);
  const totEmp   = rows.reduce((a, t) => a + calcEmployer(t).total, 0);
  if (!rows.length && hasSearch) return null;
  return (
    <section aria-label="צהרון ומשרות שעתיות" style={{ marginTop:22 }}>
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:10, flexWrap:'wrap', marginBottom:8 }}>
        <div>
          <h3 style={{ fontSize:17.2, fontWeight:800, color:'var(--purple)' }}>
            צהרון ומשרות שעתיות{rows.length ? ` · ${rows.length}` : ''}
          </h3>
          <p style={{ fontSize:13.8, color:'var(--text3)', marginTop:2 }}>
            שעות שבועיות × תעריף לשעה. לא נספר במכסת השעות של {school.name}.
          </p>
        </div>
        <button className="apple-btn apple-btn-ghost" onClick={onAdd} style={{ minHeight:36, fontSize:14.4 }}>
          <Plus size={14} strokeWidth={2.5} />
          הוספת עובד/ת צהרון
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="apple-card" style={{ padding:'16px', textAlign:'center', color:'var(--text3)', fontSize:14.4 }}>
          אין עדיין שורות צהרון.
        </div>
      ) : (
        <div className="sheet-wrap table-scroll">
          <table className="apple-table" style={{ fontSize:14.9 }}>
            <thead>
              <tr>
                <th>שם</th>
                <th style={{ textAlign:'center' }}>סוג משרה</th>
                <th style={{ textAlign:'center' }}>שעות שבועיות</th>
                <th style={{ textAlign:'center' }}>תעריף לשעה (₪)</th>
                <th style={{ textAlign:'center' }} title="ברוטו מהתלוש. ריק = אומדן משעות × תעריף">ברוטו (₪)</th>
                {!isPrincipal && <th style={{ textAlign:'center', color:'var(--purple)' }}>סה״כ למעסיק</th>}
                <th style={{ width:120 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(t => {
                const emp = calcEmployer(t);
                const pb  = payBreakdown(t);
                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight:600 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                        <span>{t.name}</span>
                        {needsApproval(t) && <span className="apple-badge badge-orange" style={{ fontSize:13.2, padding:'2px 8px' }}>לאישור</span>}
                      </div>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      <select className="apple-select" value={t.job} aria-label="סוג משרה"
                        onChange={e => saveRow({ ...t, job: e.target.value })}
                        style={{ fontSize:13.8, padding:'3px 7px', minWidth:96 }}>
                        {JOBS.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      <HourlyNum id={`hh-${t.id}`} value={Number(t.frontalHours) || null} title="שעות שבועיות"
                        onCommit={v => saveRow({ ...t, frontalHours: v || 0 })} />
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {isPrincipal ? (
                        <span>{hourlyRateOf(t)}</span>
                      ) : (
                        <HourlyNum id={`hr-${t.id}`} value={t.hourlyRate ?? null} placeholder={String(MIN_WAGE_HOUR)}
                          title="תעריף לשעה — ריק = שכר מינימום" onCommit={v => saveRow({ ...t, hourlyRate: v })} />
                      )}
                      {!t.hourlyRate && <span style={{ display:'block', fontSize:12.6, color:'var(--text3)' }}>{hourlyRateNote(t)}</span>}
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {isPrincipal ? nisH(emp.gross) : (
                        <HourlyNum id={`hg-${t.id}`} value={t._officialGross ?? null} width={96}
                          placeholder={String(hourlyGross(t) || '₪')} title="ברוטו מהתלוש — ריק = אומדן"
                          onCommit={v => saveRow({ ...t, _officialGross: v })} />
                      )}
                      {pb.hourlyEstimate && emp.gross > 0 && (
                        <span style={{ display:'block', fontSize:12.6, color:'var(--text3)' }}>
                          אומדן · {Math.round((Number(t.frontalHours) || 0) * HOURLY_WEEKS)} שעות בחודש
                        </span>
                      )}
                    </td>
                    {!isPrincipal && <td style={{ textAlign:'center', fontWeight:800, color:'var(--purple)' }}>{nisH(emp.total)}</td>}
                    <td>
                      <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                        <button className="apple-btn apple-btn-ghost" title="פרטים מלאים" aria-label={`פרטים מלאים — ${t.name}`}
                          onClick={() => onFullEdit(t)} style={{ padding:'0 9px', minHeight:30 }}><Pencil size={13} strokeWidth={2.2} /></button>
                        {fullyApproved(t) && hasContact(t) && (
                          <button className="apple-btn apple-btn-ghost" title="נתוני העסקה לחתימה" aria-label={`נתוני העסקה — ${t.name}`}
                            onClick={() => onDetails(t)} style={{ padding:'0 9px', minHeight:30 }}><FileText size={13} strokeWidth={2.2} /></button>
                        )}
                        {isCoord && needsApproval(t) && onApprove && (
                          <button className="apple-btn apple-btn-green" title="אישור" aria-label={`אישור — ${t.name}`}
                            onClick={() => onApprove(t.id)} style={{ padding:'0 9px', minHeight:30 }}><Check size={14} strokeWidth={2.8} /></button>
                        )}
                        {isCoord && onDelete && (
                          <button className="apple-btn apple-btn-ghost" title="מחיקת שורת הצהרון" aria-label={`מחיקת שורת הצהרון — ${t.name}`}
                            onClick={() => { if (window.confirm(`למחוק את שורת ה${jobLabel(t.job)} של ${t.name}?`)) onDelete(t.id); }}
                            style={{ padding:'0 9px', minHeight:30, color:'var(--danger)' }}><Trash2 size={13} strokeWidth={2.2} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ fontWeight:800 }}>סה״כ צהרון</td>
                <td style={{ textAlign:'center', fontWeight:700 }}>{totHours}</td>
                <td></td>
                <td style={{ textAlign:'center', fontWeight:700 }}>{nisH(totGross)}</td>
                {!isPrincipal && <td style={{ textAlign:'center', fontWeight:800, color:'var(--purple)' }}>{nisH(totEmp)}</td>}
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function HourlyJobCard({ t, isCoord, isPrincipal, saveRow, onDelete, onApprove, onDetails, onFullEdit }) {
  const emp = calcEmployer(t);
  return (
    <div className="apple-card mcard" style={{ borderInlineStart:'3px solid var(--purple)' }}>
      <div className="mcard-head">
        <div style={{ minWidth:0 }}>
          <p className="mcard-name">{t.name}</p>
          <div className="mcard-badges">
            <span className="apple-badge badge-purple" style={{ fontSize:12.6, padding:'1px 8px' }}>{jobLabel(t.job)}</span>
          </div>
        </div>
        {needsApproval(t) && <span className="apple-badge badge-orange" style={{ flexShrink:0 }}>לאישור</span>}
      </div>
      <div className="mcard-row">
        <span className="mcard-label">שעות שבועיות</span>
        <HourlyNum id={`mhh-${t.id}`} value={Number(t.frontalHours) || null} width={110} title="שעות שבועיות"
          onCommit={v => saveRow({ ...t, frontalHours: v || 0 })} />
      </div>
      {isPrincipal ? (
        <CardRow label="תעריף לשעה">{hourlyRateOf(t)} ₪</CardRow>
      ) : (
        <div className="mcard-row">
          <span className="mcard-label">תעריף לשעה (₪)</span>
          <HourlyNum id={`mhr-${t.id}`} value={t.hourlyRate ?? null} width={110} placeholder={String(MIN_WAGE_HOUR)}
            title="תעריף לשעה — ריק = שכר מינימום" onCommit={v => saveRow({ ...t, hourlyRate: v })} />
        </div>
      )}
      <CardRow label="ברוטו">{nisH(emp.gross)}</CardRow>
      {!isPrincipal && <CardRow label="סה״כ למעסיק" strong color="var(--purple)">{nisH(emp.total)}</CardRow>}
      <div className="mcard-actions">
        <button className="apple-btn apple-btn-ghost" onClick={() => onFullEdit(t)}>
          <Pencil size={14} strokeWidth={2.2} />
          כל הפרטים
        </button>
        {isCoord && needsApproval(t) && onApprove && (
          <button className="apple-btn apple-btn-green" onClick={() => onApprove(t.id)}>
            <Check size={15} strokeWidth={2.8} />
            אישור
          </button>
        )}
        {fullyApproved(t) && hasContact(t) && (
          <button className="apple-btn apple-btn-ghost" onClick={() => onDetails(t)}>
            <FileText size={14} strokeWidth={2.2} />
            נתוני העסקה
          </button>
        )}
        {isCoord && onDelete && (
          <button className="apple-btn apple-btn-ghost" aria-label={`מחיקת שורת הצהרון — ${t.name}`}
            onClick={() => { if (window.confirm(`למחוק את שורת ה${jobLabel(t.job)} של ${t.name}?`)) onDelete(t.id); }}
            style={{ color:'var(--danger)', flex:'0 0 auto', minWidth:48 }}>
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
        )}
      </div>
    </div>
  );
}

function SchoolView({ school, teachers, userRole, onBack, onSaveTeacher, onDeleteTeacher, onApproveTeacher, onImportTeachers, activeMonth, fmtMonthFn, userId, monthDue, onReportMonth, simState, onCompute }) {
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
  const searched = ts.filter(t => t.name.includes(search) || (t.tzId || '').includes(search));
  // הגיליון הראשי הוא הוראה. צהרון ומשרות שעתיות — בחלק משלהן מתחתיו
  // ("תחלק את גני תקוה שורה של צהרון", שרה 15.9).
  const filtered = searched
    .filter(t => !isHourlyRow(t))
    // שורת המנהלת ראשונה — היא ראש הצוות וגם הסעיף הגדול בתקציב
    .sort((a, b) => (isPrincipalRow(b) ? 1 : 0) - (isPrincipalRow(a) ? 1 : 0));
  const hourlyRows = searched.filter(isHourlyRow).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const addHourlyNew = () => onSaveTeacher({
    ...EMPTY_TEACHER, schoolId: school.id, name: 'עובד/ת צהרון חדש/ה', reform: 'pre', grade: null,
    job: 'tzaharon', frontalHours: 0, scopePct: 0, scope: 0, hourlyRate: null,
  });
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
  // שעות צהרון אינן במכסה
  const usedHours  = schoolHours(ts);   // אותו כלל כמו התקן בשרת: בלי צהרון, שילוב, ייעוץ ומנהלת
  const freeHours  = hoursQuota ? hoursQuota - usedHours : null;
  // כמה שעות מותר להקצות לרשומה מסוימת בלי לחרוג — כולל השעות שכבר רשומות לה
  const hoursCeiling = (rec) => {
    if (!hoursQuota || isHourlyRow(rec)) return null;
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
      name: `סה"כ (${tsOfficial.length} עובדי הוראה עם סימולציה מלאה)`,
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
  const startNew  = () => {
    // במובייל הגיליון מוסתר וההזנה בכרטיסים — שורת-עריכה בטבלה נסתרת
    // הייתה נפתחת אל שום מקום. ההוספה עוברת בדיאלוג המלא, דרך אותו
    // onSaveTeacher ואותה בדיקת מכסה.
    if (window.matchMedia('(max-width: 640px)').matches) {
      setFullEdit({ ...EMPTY_TEACHER, schoolId: school.id, reform: school.reform || 'ofek' });
      return;
    }
    setEditingId('new'); setEditData({ ...EMPTY_TEACHER, schoolId: school.id, reform: school.reform || 'ofek' });
  };
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
        style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:90, textAlign:'center',
                 background: bg || undefined }} /></td>
    );
    // גם למנהלת: "תלוש עולם ישן פלוס תוספת בית חב"ד עם כל הרכיבים" (שרה, 14.9)
    const supplies = schoolPaysSupp(v.schoolId);
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
              <button className="apple-btn apple-btn-ghost" onClick={onBack} style={{ minHeight:38, padding:'0 13px', fontSize:15.5 }}>
                <ArrowRight size={15} strokeWidth={2.4} />
                חזרה
              </button>
            )}
            <div style={{ flex:1, minWidth:170 }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                <span className="title-bar" />
                <h1 style={{ fontSize:26.4, fontWeight:800, color:'var(--text)', letterSpacing:'-0.025em', lineHeight:1.2 }}>{school.name}</h1>
              </div>
              <p style={{ fontSize:14.9, color:'var(--text3)', marginInlineStart:13 }}>
                {school.city}{school.city ? ' · ' : ''}מסלול ברירת מחדל לעובד/ת הוראה חדש/ה: {reformLabel(school.reform)}
              </p>
              {!hoursQuota && extraHours > 0 && (
                <div style={{ marginInlineStart:13, marginTop:8 }}>
                  <span className="apple-badge badge-teal" style={{ fontSize:13.2 }}
                    title="נשמרות בנפרד מהמכסה; כשתוגדר מכסה בסיסית הן יתווספו אליה">
                    +{extraHours} שעות הוראה נוספות — {school.extraHoursNote || 'אושרו'} · נוצלו {usedHours.toLocaleString('he-IL')}
                  </span>
                </div>
              )}
              {hoursQuota && (
                <div style={{ marginInlineStart:13, marginTop:8, maxWidth:320 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13.8, marginBottom:4 }}>
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

          <div className="toolbar-stack" style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ position:'relative', flex:'1 1 190px', maxWidth:250 }}>
              <Search size={15} strokeWidth={2.2}
                style={{ position:'absolute', insetInlineStart:12, top:'50%', transform:'translateY(-50%)', color:'var(--text3)', pointerEvents:'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} className="apple-input"
                placeholder="חיפוש לפי שם / ת.ז." style={{ fontSize:15.5, minHeight:38, paddingInlineStart:34 }} />
            </div>

            <button className="apple-btn apple-btn-blue" onClick={startNew} style={{ minHeight:38, fontSize:15.5 }}>
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
              style={{ minHeight:38, fontSize:15.5 }}>
              <Send size={14} strokeWidth={2.2} />
              {isCoord ? 'שלח לאישור' : 'שלח לשליח'}
            </button>
            {isCoord && (
              <button className="apple-btn apple-btn-ghost" onClick={() => setLinkModal(true)}
                title="מנפיק למנהלת קישור אישי חדש ופותח וואטסאפ עם ההודעה מוכנה"
                style={{ minHeight:38, fontSize:15.5 }}>
                <MessageCircle size={14} strokeWidth={2.2} />
                קישור למנהלת
              </button>
            )}

            <span aria-hidden style={{ width:1, height:22, background:'var(--line)', marginInline:2 }} />

            <button className="apple-btn apple-btn-ghost" onClick={() => setShowReport(true)} style={{ minHeight:38, fontSize:15.5 }}>
              <Printer size={14} strokeWidth={2.2} />
              דוח שכר
            </button>
            <button className="apple-btn apple-btn-ghost" onClick={() => setShowAbsence(true)} style={{ minHeight:38, fontSize:15.5 }}>
              <CalendarClock size={14} strokeWidth={2.2} />
              ממ"מ והעדרויות
            </button>
            <button className="apple-btn apple-btn-ghost" onClick={exportCSV} disabled={ts.length === 0}
              title={ts.length === 0 ? 'אין עובדי הוראה לייצוא' : 'ייצוא הטבלה לקובץ CSV'} style={{ minHeight:38, fontSize:15.5 }}>
              <FileSpreadsheet size={14} strokeWidth={2.2} />
              ייצוא CSV
            </button>
            <button className="apple-btn apple-btn-ghost" onClick={() => downloadTemplate(school.name)} style={{ minHeight:38, fontSize:15.5 }}>
              <Download size={14} strokeWidth={2.2} />
              תבנית
            </button>
            <button className="apple-btn apple-btn-ghost" onClick={() => setShowImport(true)} style={{ minHeight:38, fontSize:15.5 }}>
              <Upload size={14} strokeWidth={2.2} />
              ייבוא
            </button>
          </div>
        </div>
      </div>

      {/* ══ Stat cards ══ */}
      {tsOfficial.length > 0 && (
        <div style={{ maxWidth:1400, margin:'0 auto', padding:'20px 20px 0' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(155px, 1fr))', gridAutoRows:'1fr', gap:12 }}>
            {[
              { label:'עובדי הוראה',    val: ts.length.toLocaleString('he-IL'), sub: `${tsOfficial.length} עם סימולציה מלאה` },
              { label:'ברוטו / חודש',   val: totGross.toLocaleString('he-IL') + ' ₪' },
              { label:'ברוטו למעסיק',   val: totEmp.toLocaleString('he-IL') + ' ₪', sub:'כולל תוספות מעסיק' },
              { label:'עלות שנתית',     val: (totEmp*12).toLocaleString('he-IL') + ' ₪', hero:true },
            ].map((c, i) => (
              <div key={c.label} className="apple-stat spring-enter" style={{ animationDelay: `${i*55}ms` }}>
                <p className="apple-stat-label">{c.label}</p>
                <p className={`apple-stat-value ${c.hero ? 'grad-num' : ''}`}>{c.val}</p>
                {c.sub && <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:3 }}>{c.sub}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {isPrincipal && (
        <div style={{ maxWidth:1400, margin:'0 auto', padding:'18px 20px 0' }}>
          <div style={{ background:'var(--teal-100)', border:'1px solid #B8EAF2', borderRadius:14, padding:'11px 14px', display:'flex', gap:9, alignItems:'flex-start' }}>
            <Calculator size={15} strokeWidth={2.2} color="var(--teal-700)" style={{ flexShrink:0, marginTop:2 }} />
            <p style={{ fontSize:14.4, color:'var(--teal-700)', lineHeight:1.6 }}>
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
            <span style={{ fontSize:14.4, color:'var(--text3)', fontWeight:600 }}>שומר…</span>
          ) : saveState ? (
            <span style={{ fontSize:14.4, color:'var(--ok, #22C55E)', fontWeight:700 }}>
              ✓ נשמר {saveState.toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' })}
            </span>
          ) : null}
          {/* סוגר שדה פתוח — ה-blur מפעיל את השמירה שלו — ומאשר */}
          <button className="apple-btn apple-btn-blue" style={{ minHeight:32, padding:'0 16px', fontSize:14.4 }}
            onClick={() => {
              if (document.activeElement?.tagName === 'INPUT') document.activeElement.blur();
              setSaveState(s2 => s2 === 'saving' ? s2 : new Date());
            }}>
            שמירה
          </button>
          <button className="apple-btn apple-btn-ghost only-desktop" onClick={() => setAllCols(v => !v)}
            style={{ minHeight:32, padding:'0 12px', fontSize:14.4 }}>
            {allCols ? 'תצוגה מצומצמת' : `כל העמודות (${26})`}
          </button>
        </div>
        <div className="sheet-wrap only-desktop">
          <div className="sheet-scroll">
            <table className={`apple-table sticky-head${allCols ? '' : ' compact-cols'}${school.chabadSupp === false ? ' no-supp' : ''}`} style={{ fontSize:14.9, minWidth: allCols ? 1330 : 0 }}>
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
                  <td><input className="apple-input" value={editData.name} onChange={e=>setF('name',e.target.value)} placeholder="שם מלא *" style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6 }} /></td>
                  <td><input className="apple-input" dir="ltr" value={editData.tzId||''} onChange={e=>setF('tzId',e.target.value)} placeholder="ת.ז." style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:90, textAlign:'center' }} /></td>
                  <td><input className="apple-input" value={editData.email||''} onChange={e=>setF('email',e.target.value)} placeholder="מייל" dir="ltr" style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6 }} /></td>
                  <td><input className="apple-input" value={editData.phone||''} onChange={e=>setF('phone',e.target.value)} placeholder="טלפון" dir="ltr" style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:110 }} /></td>
                  <td style={{ textAlign:'center' }}>
                    <select value={editData.reform} onChange={e=>setF('reform',e.target.value)} className="apple-select" style={{ fontSize:13.8, padding:'4px 8px' }}>
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
                      style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:58, textAlign:'center', fontWeight:700 }} />
                    <span style={{ display:'block', fontSize:13.2, color:'var(--text3)' }}>% משרה</span>
                  </td>
                  <td>
                    <select value={editData.degree||'BA'} onChange={e=>setF('degree',e.target.value)} className="apple-select" style={{ fontSize:13.8, padding:'4px 8px' }}>
                      <option value="intern">מתמחה</option>
                      <option value="unlicensed">לא מוסמך</option>
                      <option value="senior">בכיר</option>
                      <option value="BA">תואר ראשון</option>
                      <option value="MA">תואר שני</option>
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    {editData.reform==='ofek'
                      ? <select value={editData.grade||1} onChange={e=>setF('grade',Number(e.target.value))} className="apple-select" style={{ fontSize:13.8, padding:'4px 8px' }}>
                          {[1,2,3,4,5,6,7,8,9].map(g=><option key={g} value={g}>דרגה {g}</option>)}
                        </select>
                      : <span style={{ color:'var(--text3)' }}>—</span>}
                  </td>
                  <td><input type="number" min="1" className="apple-input" dir="ltr" value={editData.seniority??1} onChange={e=>setF('seniority',Math.max(1, Number(e.target.value)||1))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" min="0" value={editData.frontalHours ?? baseFrontalFor(editData)}
                      max={hoursCeiling(editData) ?? 40}
                      onChange={e => {
                        // השעות אינן גוזרות את האחוז. הנוסחה שגזרה אותו
                        // שגתה, ושרה מזינה אותו בעצמה.
                        setEditData(p => ({ ...p, frontalHours: Number(e.target.value) }));
                      }}
                      style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td style={{ textAlign:'center' }}>
                    <select value={editData.role || 'none'} onChange={e=>setF('role',e.target.value)} className="apple-select" style={{ fontSize:13.2, padding:'4px 6px', maxWidth:130 }}>
                      {ROLES.map(r => <option key={r.id} value={r.id}>{r.label.split('(')[0].trim()}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    <select value={editData.level || 'elementary'} onChange={e=>setF('level',e.target.value)} className="apple-select" style={{ fontSize:13.2, padding:'4px 6px' }}>
                      {Object.entries(LEVELS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    <select value={editData.ageGroup || 'none'} onChange={e=>setF('ageGroup',e.target.value)} className="apple-select" style={{ fontSize:13.2, padding:'4px 6px' }}>
                      {Object.entries(AGE_RED).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    <label className="apple-toggle">
                      <input type="checkbox" checked={!!editData.isTemp} onChange={e=>setF('isTemp',e.target.checked)} />
                      <span className="apple-toggle-track"></span>
                    </label>
                  </td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.childrenUnder18??0} onChange={e=>setF('childrenUnder18',Number(e.target.value))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.absenceDays??0} onChange={e=>setF('absenceDays',Number(e.target.value))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.travelDays??0} onChange={e=>setF('travelDays',Number(e.target.value))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.daycareChildren??0} onChange={e=>setF('daycareChildren',Number(e.target.value))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.mmHours??0} onChange={e=>setF('mmHours',Number(e.target.value))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input className="apple-input" value={editData.mmFor||''} onChange={e=>setF('mmFor',e.target.value)} placeholder="שם עובד/ת ההוראה" style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, minWidth:80 }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.monthlyExtras??0} onChange={e=>setF('monthlyExtras',Number(e.target.value))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:70, textAlign:'center' }} /></td>
                  {moneyEditCells(editData)}
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="apple-btn apple-btn-blue" onClick={saveEdit} style={{ padding:'4px 10px', fontSize:13.8 }}>שמור</button>
                      <button className="apple-btn apple-btn-ghost" onClick={cancelEdit} style={{ padding:'4px 10px', fontSize:13.8 }}>ביטול</button>
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
                    <td><input className="apple-input" value={d.name} onChange={e=>setF('name',e.target.value)} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6 }} /></td>
                    <td><input className="apple-input" dir="ltr" value={d.tzId||''} onChange={e=>setF('tzId',e.target.value)} placeholder="ת.ז." style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:90, textAlign:'center' }} /></td>
                    <td><input className="apple-input" value={d.email||''} onChange={e=>setF('email',e.target.value)} dir="ltr" placeholder="מייל" style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6 }} /></td>
                    <td><input className="apple-input" value={d.phone||''} onChange={e=>setF('phone',e.target.value)} dir="ltr" placeholder="טלפון" style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:110 }} /></td>
                    <td style={{ textAlign:'center' }}>
                      <select value={d.reform} onChange={e=>setF('reform',e.target.value)} className="apple-select" style={{ fontSize:13.8, padding:'4px 8px' }}>
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
                        style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:58, textAlign:'center', fontWeight:700 }} />
                      <span style={{ display:'block', fontSize:13.2, color:'var(--text3)' }}>% משרה</span>
                    </td>
                    <td>
                      <select value={d.degree||'BA'} onChange={e=>setF('degree',e.target.value)} className="apple-select" style={{ fontSize:13.8, padding:'4px 8px' }}>
                        <option value="intern">מתמחה</option>
                        <option value="unlicensed">לא מוסמך</option>
                        <option value="senior">בכיר</option>
                        <option value="BA">תואר ראשון</option>
                        <option value="MA">תואר שני</option>
                      </select>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {d.reform==='ofek'
                        ? <select value={d.grade||1} onChange={e=>setF('grade',Number(e.target.value))} className="apple-select" style={{ fontSize:13.8, padding:'4px 8px' }}>
                            {[1,2,3,4,5,6,7,8,9].map(g=><option key={g} value={g}>דרגה {g}</option>)}
                          </select>
                        : <span style={{ color:'var(--text3)' }}>—</span>}
                    </td>
                    <td><input type="number" min="1" className="apple-input" dir="ltr" value={d.seniority??1} onChange={e=>setF('seniority',Math.max(1, Number(e.target.value)||1))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" min="0" value={d.frontalHours ?? baseFrontalFor(d)}
                      max={hoursCeiling(editData) ?? 40}
                      onChange={e => {
                        // השעות אינן גוזרות את האחוז. הנוסחה שגזרה אותו
                        // שגתה, ושרה מזינה אותו בעצמה.
                        setEditData(p => ({ ...p, frontalHours: Number(e.target.value) }));
                      }}
                      style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td style={{ textAlign:'center' }}>
                    <select value={d.role || 'none'} onChange={e=>setF('role',e.target.value)} className="apple-select" style={{ fontSize:13.2, padding:'4px 6px', maxWidth:130 }}>
                      {ROLES.map(r => <option key={r.id} value={r.id}>{r.label.split('(')[0].trim()}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    <select value={d.level || 'elementary'} onChange={e=>setF('level',e.target.value)} className="apple-select" style={{ fontSize:13.2, padding:'4px 6px' }}>
                      {Object.entries(LEVELS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    <select value={d.ageGroup || 'none'} onChange={e=>setF('ageGroup',e.target.value)} className="apple-select" style={{ fontSize:13.2, padding:'4px 6px' }}>
                      {Object.entries(AGE_RED).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                    <td style={{ textAlign:'center' }}>
                      <label className="apple-toggle">
                        <input type="checkbox" checked={!!d.isTemp} onChange={e=>setF('isTemp',e.target.checked)} />
                        <span className="apple-toggle-track"></span>
                      </label>
                    </td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.childrenUnder18??0} onChange={e=>setF('childrenUnder18',Number(e.target.value))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.absenceDays??0} onChange={e=>setF('absenceDays',Number(e.target.value))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.travelDays??0} onChange={e=>setF('travelDays',Number(e.target.value))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.daycareChildren??0} onChange={e=>setF('daycareChildren',Number(e.target.value))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.mmHours??0} onChange={e=>setF('mmHours',Number(e.target.value))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input className="apple-input" value={d.mmFor||''} onChange={e=>setF('mmFor',e.target.value)} placeholder="שם עובד/ת ההוראה" style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, minWidth:80 }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.monthlyExtras??0} onChange={e=>setF('monthlyExtras',Number(e.target.value))} style={{ fontSize:13.8, padding:'4px 8px', borderRadius:6, width:70, textAlign:'center' }} /></td>
                    {moneyEditCells(d)}
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="apple-btn apple-btn-blue" onClick={saveEdit} style={{ padding:'4px 10px', fontSize:13.8 }}>שמור</button>
                        <button className="apple-btn apple-btn-ghost" onClick={cancelEdit} style={{ padding:'4px 10px', fontSize:13.8 }}>ביטול</button>
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
                          <span className="apple-badge badge-orange" style={{ fontSize:13.2, padding:'2px 8px' }}
                            title="בלי טלפון ומייל אי אפשר לשלוח את נתוני ההעסקה לחתימה">
                            חסרים פרטי קשר
                          </span>
                        )}
                        {onLeave(t) && (
                          <span className={`apple-badge ${t.leaveType === 'maternity' && hasSubstitute(t) ? 'badge-teal' : 'badge-orange'}`}
                            style={{ fontSize:13.2, padding:'2px 8px' }} title={leaveText(t)}>
                            {leaveLabel(t.leaveType)}{t.leaveFrom ? ` ${fmtDay(t.leaveFrom)}` : ''}
                            {t.leaveType === 'maternity'
                              ? (hasSubstitute(t) ? ' · שובצה מחליפה — הפרשות בלבד' : ' · השכר נשמר עד שיבוץ')
                              : ''}
                          </span>
                        )}
                        {isPrincipalRow(t) && (
                          <span className="apple-badge badge-purple" style={{ fontSize:13.2, padding:'2px 8px', cursor:'help' }}
                            title="נוצרה אוטומטית עם פתיחת בית הספר, עם 26 שעות כברירת מחדל — השעות נספרות במכסה. עדכני את שעותיה ואת פרטיה.">
                            מנהלת
                          </span>
                        )}
                        {t._agreedGross && <span className="apple-badge badge-teal" style={{ fontSize:13.2, padding:'2px 8px' }} title="ברוטו מוסכם — לא מסימולציה">שכר מוסכם</span>}
                        {fullyApproved(t) && (
                          <span className="apple-badge badge-green" style={{ fontSize:13.2, padding:'2px 8px' }}
                            title="מאושר סופית — אפשר להפיק לה נתוני העסקה לחתימה">
                            <Check size={10} strokeWidth={3} />
                            מאושר
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign:'center', fontFamily:'monospace', fontSize:13.8, color:'var(--apple-text2)' }}>{t.tzId||'—'}</td>
                    <td style={{ fontSize:13.8, color:'var(--apple-text3)' }}>{t.email||'—'}</td>
                    <td style={{ fontSize:13.8, color:'var(--apple-text3)', direction:'ltr', textAlign:'right' }}>{t.phone||'—'}</td>
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
                        style={{ width:68, textAlign:'center', fontWeight:700, fontSize:14.9,
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
                          style={{ display:'block', margin:'3px auto 0', fontSize:13.2, color:'#fff',
                            background:'var(--teal)', border:'none', cursor:'pointer', fontFamily:'inherit',
                            fontWeight:700, padding:'2px 8px', borderRadius:999, whiteSpace:'nowrap' }}>
                          {`תקני ל-${suggestedScope(t)}`}
                        </button>
                      ) : momBonus ? (
                        <span style={{ display:'block', fontSize:13.2, color:'var(--purple)', fontWeight:700, marginTop:2 }}>
                          {`כולל +${MOM_SCOPE_BONUS} אם`}
                        </span>
                      ) : momUnderThreshold(t) ? (
                        <span style={{ display:'block', fontSize:13.2, color:'var(--text3)', marginTop:2 }}
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
                        style={{ fontSize:13.8, padding:'4px 6px', width:150,
                          fontWeight: t.role && t.role !== 'none' ? 700 : 400,
                          color: t.role && t.role !== 'none' ? 'var(--text)' : 'var(--text3)' }}>
                        {ROLES.map(r => <option key={r.id} value={r.id}>{ROLE_SHORT[r.id] || r.label}</option>)}
                      </select>
                      <ExtraRoles t={t} compact onChange={v => saveRow({ ...t, extraRoles: v })} />
                    </td>
                    <td style={{ textAlign:'center', fontSize:13.8 }}>{LEVELS[t.level]?.label || '—'}</td>
                    <td style={{ textAlign:'center', fontSize:13.8 }}>
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
                        style={{ width:44, textAlign:'center', fontWeight:700, fontSize:14.9,
                          border:'1px solid var(--line)', borderRadius:7, padding:'3px 4px',
                          background: momBonus ? 'var(--purple-100)' : 'var(--surface)',
                          color:'var(--text)', fontFamily:'inherit' }} />
                      {momBonus && <span style={{ display:'block', fontSize:13.2, color:'var(--purple)', fontWeight:700 }}>אם</span>}
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
                        style={{ width:124, textAlign:'center', fontSize:13.8,
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
                      <input type="number" min="0" dir="ltr" inputMode="decimal"
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
                        style={{ width:112, textAlign:'center', fontWeight:700, fontSize:14.9,
                          border:'1px solid var(--line)', borderRadius:7, padding:'3px 4px',
                          background:'var(--surface)', color:'var(--text)', fontFamily:'inherit' }} />
                    </td>
                    {!isPrincipal && <td style={{ textAlign:'center' }}>
                      {!schoolPaysSupp(t.schoolId)
                        ? <span style={{ color:'var(--text3)' }} title='בית ספר בלי תוספת בית חב"ד'>—</span>
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
                            style={{ width:102, textAlign:'center', fontWeight:700, fontSize:14.4,
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
                        : <span style={{ fontSize:13.2, color:'var(--text3)' }}>חסר ברוטו</span>}
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
                        {isCoord && onCompute && (
                          simState?.[t.id] === 'pending' || simState?.[t.id] === 'running'
                            ? <span className="apple-badge badge-purple" style={{ alignSelf:'center' }}>מחשב…</span>
                            : <button className="apple-btn apple-btn-ghost" title={computeTitle(t)}
                                onClick={() => onCompute(t)} style={{ padding:'0 9px', minHeight:30 }}>
                                <Calculator size={13} strokeWidth={2.2} />
                              </button>
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
                      title={`${tsOfficial.length} עובדי הוראה עם סימולציה מלאה`}>
                    סה״כ · {tsOfficial.length} עובדי הוראה
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

        {/* ── צהרון ומשרות שעתיות — חלק משלהן מתחת לגיליון ההוראה.
            "תחלק את גני תקוה שורה של צהרון" (שרה, 15.9). שעות שבועיות ×
            תעריף לשעה; לא במכסה ולא בסימולטור. ── */}
        <div className="only-desktop">
          <HourlyJobsTable rows={hourlyRows} school={school} isCoord={isCoord} isPrincipal={isPrincipal}
            saveRow={saveRow} onAdd={addHourlyNew} onDelete={onDeleteTeacher} onApprove={onApproveTeacher}
            onDetails={setDetails} onFullEdit={setFullEdit} hasSearch={Boolean(search)} />
        </div>

        {/* ── מובייל: כרטיס לעובדת במקום גיליון 26 העמודות ("עדיין לא
            נח", שרה 4.9). המספרים שפותחים בשבילם את המסך — שעות, אחוז,
            ברוטו וסה"כ למעסיק — על הכרטיס; הברוטו והתוספת נערכים בו
            ישירות באותו מסלול שמירה של הגיליון (saveRow), וכל שאר
            השדות בדיאלוג העריכה המלא. אף פעולה לא ירדה: עריכה, חישוב,
            אישור, נתוני העסקה ומחיקה — בשורת הפעולות. ── */}
        <div className="only-mobile">
          {filtered.length === 0 ? (
            <div className="apple-card" style={{ textAlign:'center', padding:'36px 16px', color:'var(--text3)', fontSize:15.5 }}>
              {ts.length === 0 ? 'אין עדיין עובדי הוראה' : 'לא נמצאו תוצאות'}
            </div>
          ) : filtered.map(t => {
            const emp     = calcEmployer(t);
            const derived = deriveHours(t);
            const scope   = t.reform === 'ofek' ? (derived?.scopePct || t.scopePct || 100) : (t.scope || 100);
            const isSim   = needsSim(t);
            const isAppr  = needsApproval(t);
            const done    = simComplete(t);
            const supplies = schoolPaysSupp(t.schoolId);   // גם למנהלת (שרה, 14.9)
            return (
              <div key={'m-' + t.id} className="apple-card mcard" style={{
                borderInlineStart: isSim ? '3px solid var(--warn)' : isAppr ? '3px solid var(--teal)' : '3px solid transparent' }}>
                <div className="mcard-head">
                  <div style={{ minWidth:0 }}>
                    <p className="mcard-name" style={{ color: t.name === PRINCIPAL_PLACEHOLDER ? 'var(--text3)' : undefined }}>{t.name}</p>
                    <div className="mcard-badges">
                      <span className={`apple-badge ${t.reform==='ofek' ? 'badge-blue' : 'badge-gray'}`} style={{ fontSize:12.6, padding:'1px 8px' }}>
                        {reformLabel(t.reform)}
                      </span>
                      {isPrincipalRow(t) && <span className="apple-badge badge-purple" style={{ fontSize:12.6, padding:'1px 8px' }}>מנהלת</span>}
                      {onLeave(t) && (
                        <span className={`apple-badge ${t.leaveType === 'maternity' && hasSubstitute(t) ? 'badge-teal' : 'badge-orange'}`}
                          style={{ fontSize:12.6, padding:'1px 8px' }} title={leaveText(t)}>
                          {leaveLabel(t.leaveType)}
                        </span>
                      )}
                      {!hasContact(t) && (
                        <span className="apple-badge badge-orange" style={{ fontSize:12.6, padding:'1px 8px' }}
                          title="בלי טלפון ומייל אי אפשר לשלוח את נתוני ההעסקה לחתימה">חסרים פרטי קשר</span>
                      )}
                      {t._agreedGross && <span className="apple-badge badge-teal" style={{ fontSize:12.6, padding:'1px 8px' }}>שכר מוסכם</span>}
                    </div>
                  </div>
                  {isSim ? <span className="apple-badge badge-orange" style={{ flexShrink:0 }}>חסר ברוטו</span>
                    : isAppr ? <span className="apple-badge badge-teal" style={{ flexShrink:0 }}><ClipboardCheck size={12} strokeWidth={2.4} />לאישור</span>
                    : fullyApproved(t) ? <span className="apple-badge badge-green" style={{ flexShrink:0 }}><Check size={11} strokeWidth={3} />מאושר</span>
                    : null}
                </div>
                <CardRow label="שעות פרונטליות">{derived ? derived.frontal : (t.frontalHours ?? '—')}</CardRow>
                <CardRow label="אחוז משרה">{scope}%</CardRow>
                <div className="mcard-row">
                  <span className="mcard-label">ברוטו (₪)</span>
                  <input type="number" min="0" dir="ltr" inputMode="decimal" className="apple-input"
                    key={`mgross-${t.id}`}
                    defaultValue={t._officialGross || ''}
                    placeholder="—"
                    title="הברוטו לעובדת — נשמר ביציאה מהשדה"
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    onBlur={e => {
                      const v2 = e.target.value === '' ? null : Number(e.target.value);
                      if ((v2 ?? null) === (t._officialGross ?? null)) return;
                      saveRow({ ...t, _officialGross: v2 });
                    }}
                    style={{ width:132, textAlign:'center', fontWeight:700 }} />
                </div>
                {!isPrincipal && supplies && (
                  <div className="mcard-row">
                    <span className="mcard-label">תוספת בית חב"ד (₪)</span>
                    <input type="number" min="0" dir="ltr" inputMode="decimal" className="apple-input"
                      key={`msupp-${t.id}`}
                      defaultValue={t._chabadSupp || ''}
                      placeholder="—"
                      title='תוספת בית חב"ד — לא פנסיונית, נושאת מס שכר וביטוח לאומי'
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      onBlur={e => {
                        const v2 = e.target.value === '' ? null : Number(e.target.value);
                        if ((v2 ?? null) === (t._chabadSupp ?? null)) return;
                        saveRow({ ...t, _chabadSupp: v2 });
                      }}
                      style={{ width:132, textAlign:'center', fontWeight:700, background:'var(--purple-100)' }} />
                  </div>
                )}
                {!isPrincipal && (
                  <CardRow label="סה״כ למעסיק" strong color={done ? 'var(--purple)' : 'var(--text3)'}>
                    {done ? emp.total.toLocaleString('he-IL') + ' ₪' : '—'}
                  </CardRow>
                )}
                <div className="mcard-actions">
                  <button className="apple-btn apple-btn-ghost" onClick={() => setFullEdit(t)}>
                    <Pencil size={14} strokeWidth={2.2} />
                    כל הפרטים
                  </button>
                  {isCoord && isAppr && onApproveTeacher && (
                    <button className="apple-btn apple-btn-green" onClick={() => onApproveTeacher(t.id)}>
                      <Check size={15} strokeWidth={2.8} />
                      אישור
                    </button>
                  )}
                  {isCoord && onCompute && (
                    simState?.[t.id] === 'pending' || simState?.[t.id] === 'running'
                      ? <span className="apple-badge badge-purple" style={{ alignSelf:'center' }}>מחשב…</span>
                      : <button className="apple-btn apple-btn-ghost" title={computeTitle(t)}
                          onClick={() => onCompute(t)}>
                          <Calculator size={14} strokeWidth={2.2} />
                          חישוב
                        </button>
                  )}
                  {fullyApproved(t) && hasContact(t) && (
                    <button className="apple-btn apple-btn-ghost" onClick={() => setDetails(t)}>
                      <FileText size={14} strokeWidth={2.2} />
                      נתוני העסקה
                    </button>
                  )}
                  {isCoord && onDeleteTeacher && (
                    <button className="apple-btn apple-btn-ghost" title="מחיקה"
                      onClick={() => { if (window.confirm('למחוק?')) onDeleteTeacher(t.id); }}
                      style={{ color:'var(--danger)', flex:'0 0 auto', minWidth:48 }}>
                      <Trash2 size={14} strokeWidth={2.2} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {/* צהרון במובייל — כרטיס לכל שורה שעתית, ואחריהם כפתור הוספה */}
          {(hourlyRows.length > 0 || !search) && (
            <p style={{ fontSize:14.4, fontWeight:800, color:'var(--purple)', margin:'14px 2px 6px' }}>
              צהרון ומשרות שעתיות{hourlyRows.length ? ` · ${hourlyRows.length}` : ''}
            </p>
          )}
          {hourlyRows.map(t => (
            <HourlyJobCard key={'mh-' + t.id} t={t} isCoord={isCoord} isPrincipal={isPrincipal}
              saveRow={saveRow} onDelete={onDeleteTeacher} onApprove={onApproveTeacher}
              onDetails={setDetails} onFullEdit={setFullEdit} />
          ))}
          {!search && (
            <button className="apple-btn apple-btn-ghost" onClick={addHourlyNew}
              style={{ width:'100%', minHeight:44, borderStyle:'dashed', marginBottom:12 }}>
              <Plus size={15} strokeWidth={2.5} />
              הוספת עובד/ת צהרון
            </button>
          )}
          {tsOfficial.length > 0 && !isPrincipal && (
            <div className="apple-card mcard" style={{ background:'var(--fill)' }}>
              <p className="mcard-name" style={{ marginBottom:4 }}>סה״כ · {tsOfficial.length} עובדי הוראה</p>
              <CardRow label="ברוטו">{totGross.toLocaleString('he-IL')} ₪</CardRow>
              <CardRow label='תוספת בית חב"ד'>{totChabad.toLocaleString('he-IL')} ₪</CardRow>
              <CardRow label="הוצאות מעביד">{totExtras.toLocaleString('he-IL')} ₪</CardRow>
              <CardRow label="סה״כ למעסיק" strong color="var(--purple)">{totEmp.toLocaleString('he-IL')} ₪</CardRow>
            </div>
          )}
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
/*
  פירוט המשרות של בית ספר אחד, נפתח מתוך שורת הדוח.

  היה קריאה בלבד; "תן לי אפשרות לשנות משרות — כל נתון" (שרה, 2.9)
  פתח אותו לעריכה ישירה: תפקיד, מסלול, ותק, אחוז, שעות וברוטו נשמרים
  ביציאה מהשדה, דרך אותו onSaveTeacher של מסך בית הספר — אותה זרימה,
  אותם אישורים, בלי מסלול צדדי. ההרשאות ממילא נאכפות במסד.
*/
function SchoolPositions({ school, onSaveTeacher, onApprove, simState, onCompute, onDelete }) {
  const ts = [...(school.ts || [])].sort((a, b) => calcEmployer(b).total - calcEmployer(a).total);
  const nis = v => (v > 0 ? Math.round(v).toLocaleString('he-IL') + ' ₪' : '—');
  const status = t => {
    if (needsSim(t))      return { label: 'ממתין לסימולציה', cls: 'badge-orange' };
    if (needsApproval(t)) return { label: 'ממתין לאישור שרה', cls: 'badge-orange' };
    return { label: 'מאושר', cls: 'badge-green' };
  };
  const tot = ts.reduce((a, t) => {
    const e = calcEmployer(t);
    if (simComplete(t)) { a.gross += e.gross; a.total += e.total; }
    if (!isHourlyRow(t)) a.hours += Number(t.frontalHours) || 0;   // צהרון מחוץ לשעות ההוראה
    return a;
  }, { gross: 0, total: 0, hours: 0 });

  return (
    <div style={{ padding:'14px 18px 18px' }}>
      <p style={{ fontSize:13.8, fontWeight:700, color:'var(--text2)', marginBottom:8 }}>
        פירוט המשרות — {school.name} · {ts.length} עובדי הוראה
      </p>
      <div className="sheet-wrap table-scroll">
        <table className="apple-table sticky-first" style={{ fontSize:14.4 }}>
          <thead>
            <tr>
              <th>שם</th>
              <th>תפקיד</th>
              <th style={{ textAlign:'center' }}>מסלול</th>
              <th style={{ textAlign:'center' }}>ותק</th>
              <th style={{ textAlign:'center' }}>אחוז משרה</th>
              <th style={{ textAlign:'center' }}>שעות</th>
              <th style={{ textAlign:'center' }}>ברוטו / חודש</th>
              <th style={{ textAlign:'center' }}>ברוטו למעסיק</th>
              <th style={{ textAlign:'center' }}>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {ts.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign:'center', padding:22, color:'var(--text3)' }}>אין עדיין עובדי הוראה</td></tr>
            )}
            {ts.map(t => {
              const emp = calcEmployer(t);
              const derived = deriveHours(t);
              const scope = t.reform === 'ofek' ? (derived?.scopePct || t.scopePct || 100) : (t.scope || 100);
              const st = status(t);
              const done = simComplete(t);
              return (
                <tr key={t.id}>
                  <td style={{ fontWeight:600 }}>{isPrincipalRow(t) && <Briefcase size={11} strokeWidth={2.4} style={{ display:'inline', verticalAlign:'-1px', marginInlineEnd:4 }} />}{t.name}
                    {isHourlyRow(t) && <span className="apple-badge badge-purple" style={{ fontSize:12.6, padding:'1px 7px', marginInlineStart:6 }}>{jobLabel(t.job)}</span>}</td>
                  <td style={{ color:'var(--text2)' }}>
                    {onSaveTeacher ? (
                      <select className="apple-select" value={t.role || 'none'}
                        onChange={e => onSaveTeacher({ ...t, role: e.target.value })}
                        style={{ fontSize:13.8, padding:'3px 7px', maxWidth:150, minWidth:96 }}>
                        {ROLES.map(r => <option key={r.id} value={r.id}>{r.label.split('(')[0].trim()}</option>)}
                      </select>
                    ) : (rolesText(t) || '—')}
                    {onSaveTeacher && <ExtraRoles t={t} compact onChange={v => onSaveTeacher({ ...t, extraRoles: v })} />}
                  </td>
                  <td style={{ textAlign:'center' }}>
                    {onSaveTeacher ? (
                      <select className="apple-select" value={t.reform}
                        onChange={e => onSaveTeacher({ ...t, reform: e.target.value })}
                        style={{ fontSize:13.8, padding:'3px 7px', minWidth:86 }}>
                        {REFORMS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    ) : reformLabel(t.reform)}
                  </td>
                  <td style={{ textAlign:'center' }}>
                    {onSaveTeacher ? (
                      <input type="number" min="1" dir="ltr" className="apple-input"
                        key={`pos-sen-${t.id}-${t.seniority ?? ''}`}
                        defaultValue={t.seniority ?? 1}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        onBlur={e => { const v = Math.max(1, Number(e.target.value) || 1); if (v !== t.seniority) onSaveTeacher({ ...t, seniority: v }); }}
                        style={{ width:56, textAlign:'center', fontSize:14.4, padding:'3px 6px' }} />
                    ) : (t.seniority ?? '—')}
                  </td>
                  {/* אחוז שלא נקבע ידנית מוצג באפור — 100 הוא ברירת המחדל במסד ולא בהכרח המצב בפועל */}
                  <td style={{ textAlign:'center', fontWeight:600,
                    color: scopeConfirmed(t) ? 'var(--text)' : 'var(--text3)' }}>
                    {onSaveTeacher ? (
                      <span style={{ display:'inline-flex', alignItems:'center', gap:2 }}>
                        <input type="number" min="0" max="200" dir="ltr" className="apple-input"
                          inputMode="decimal" key={`pos-pct-${t.id}-${t.scopePct ?? ''}`}
                          defaultValue={scope}
                          title={scopeConfirmed(t) ? 'אחוז משרה' : 'עדיין ברירת המחדל — הקלדה כאן קובעת אותו'}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          onBlur={e => { const v = Number(e.target.value); if (v > 0 && v !== t.scopePct) onSaveTeacher({ ...t, scopePct: v, scope: v, scopeSetAt: new Date().toISOString() }); }}
                          style={{ width:64, textAlign:'center', fontSize:14.4, padding:'3px 6px' }} />
                        %{!scopeConfirmed(t) && <span title="ברירת מחדל — טרם נקבע אחוז משרה"> *</span>}
                      </span>
                    ) : (<>{scope}%{!scopeConfirmed(t) && <span title="ברירת מחדל — טרם נקבע אחוז משרה"> *</span>}</>)}
                  </td>
                  <td style={{ textAlign:'center' }}>
                    {onSaveTeacher ? (
                      <input type="number" min="0" dir="ltr" className="apple-input"
                        key={`pos-hrs-${t.id}-${t.frontalHours ?? ''}`}
                        defaultValue={Number(t.frontalHours) || ''}
                        placeholder="—"
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        onBlur={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); if (v !== (Number(t.frontalHours) || 0)) onSaveTeacher({ ...t, frontalHours: v }); }}
                        style={{ width:56, textAlign:'center', fontSize:14.4, padding:'3px 6px' }} />
                    ) : (Number(t.frontalHours) || '—')}
                  </td>
                  {/* בלי הזנה מלאה אין ברוטו רשמי, ולכן גם אין מה לסכום */}
                  <td style={{ textAlign:'center', color: done ? 'var(--text)' : 'var(--text3)' }}>
                    {onSaveTeacher && !isPrincipalRow(t) ? (
                      <input type="number" min="0" dir="ltr" className="apple-input"
                        inputMode="decimal" key={`pos-gross-${t.id}-${t._officialGross ?? ''}`}
                        defaultValue={t._officialGross || ''}
                        placeholder="₪"
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if ((v ?? null) !== (t._officialGross ?? null)) onSaveTeacher({ ...t, _officialGross: v }); }}
                        style={{ width:86, textAlign:'center', fontSize:14.4, padding:'3px 6px' }} />
                    ) : (done ? nis(emp.gross) : '—')}
                  </td>
                  <td style={{ textAlign:'center', fontWeight:700, color: done ? 'var(--text)' : 'var(--text3)' }}>{done ? nis(emp.total) : '—'}</td>
                  <td style={{ textAlign:'center', whiteSpace:'nowrap' }}>
                    {/* "אין לי איפה לאשר" (שרה, 3.9) — האישור כאן, איפה שהיא עובדת */}
                    {onApprove && needsApproval(t) ? (
                      <button className="apple-btn apple-btn-green" onClick={() => onApprove(t.id)}
                        style={{ padding:'3px 12px', fontSize:13.8, minHeight:30 }}>
                        <Check size={13} strokeWidth={2.8} />אישור
                      </button>
                    ) : (
                      <span className={`apple-badge ${st.cls}`}>{st.label}</span>
                    )}
                    {onCompute && canCompute(t) && (
                      simState?.[t.id] === 'pending' || simState?.[t.id] === 'running' ? (
                        <span className="apple-badge badge-purple" style={{ marginInlineStart:6 }}>מחשב…</span>
                      ) : (
                        <button className="apple-btn apple-btn-ghost" title={computeTitle(t)}
                          onClick={() => onCompute(t)}
                          style={{ padding:'3px 10px', fontSize:13.8, minHeight:30, marginInlineStart:6 }}>
                          <Calculator size={13} strokeWidth={2.2} />חשב
                        </button>
                      )
                    )}
                    {/* "תן אפשרות מחיקה" (שרה, 3.9) — עם שם מלא באישור, שלא תימחק שכנה */}
                    {onDelete && (
                      <button className="apple-btn apple-btn-ghost" title="מחיקת השורה"
                        onClick={() => { if (window.confirm(`למחוק את ${t.name}?`)) onDelete(t.id); }}
                        style={{ padding:'3px 8px', minHeight:30, marginInlineStart:6, color:'var(--danger)' }}>
                        <Trash2 size={13} strokeWidth={2.2} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {ts.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5} style={{ fontWeight:800 }}>סה״כ {school.name}</td>
                <td style={{ textAlign:'center', fontWeight:700 }}>{tot.hours || '—'}</td>
                <td style={{ textAlign:'center', fontWeight:700 }}>{nis(tot.gross)}</td>
                <td style={{ textAlign:'center', fontWeight:800, color:'var(--purple)' }}>{nis(tot.total)}</td>
                <td style={{ textAlign:'center', fontSize:13.2, color:'var(--text3)' }}>
                  {school.officialCount < school.count ? `${school.count - school.officialCount} ללא סימולציה` : 'הכול רשמי'}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:8, lineHeight:1.7 }}>
        הסכומים נספרים רק עבור משרות שהסימולציה שלהן הושלמה — לכן סה״כ בית הספר כאן זהה לשורה שבדוח.
      </p>
    </div>
  );
}



/* ═══════════════════════════════════════════════════════════════
   עלות הוראה מול תקציב — לעיני שרה בלבד

   "תקציב הכנסות משרד החינוך פחות ייעול פחות הוצאות עלות שכר,
   בדף נפרד לעיני בלבד" (שרה, 2.9.2026).

   תקציב וייעול הם מספרים שנתיים ששרה מקלידה כאן; עלות השכר נמשכת
   מהחודש הפעיל (עלות מעביד בפועל כשהוזנה, אחרת האומדן) ומוכפלת
   ב-12 כדי שההשוואה תהיה שנתי מול שנתי. שני הצדדים מוצגים, כדי
   שיהיה ברור ממה נולד כל מספר.

   ההסתרה אינה רק בקוד: הטבלה school_finance מאחורי RLS של
   coordinator, כך שגם מי שיפתח את ה-API יקבל ריק.
═══════════════════════════════════════════════════════════════ */
/* שורת תווית-ערך בכרטיס מובייל — משותפת לעלות הוראה ולדוח רשת.
   הכרטיסים מחליפים את הטבלאות הרחבות ב-640px ומטה (CSS בלבד). */
function CardRow({ label, strong, color, children }) {
  return (
    <div className={'mcard-row' + (strong ? ' mcard-row-strong' : '')}>
      <span className="mcard-label">{label}</span>
      <span className="mcard-value num" style={color ? { color } : undefined}>{children}</span>
    </div>
  );
}

function TeachingCostView({ schools, teachers, monthKey, onSaveSchool }) {
  const [fin, setFin]     = useState(null);   // null: עוד נטען
  const [err, setErr]     = useState('');
  const [flash, setFlash] = useState(0);
  // "הכנסות מול הוצאות שיהיה מתרחב" (שרה, 3.9) — סגור כברירת מחדל
  const [openInc, setOpenInc] = useState({});
  // "אני צריכה חתכים שונים — חודשי/שנתי" (3.9): מתג אחד לכל הדף
  const [period, setPeriod] = useState('year');
  // עלות מילוי מקום: "לכל בית ספר צריך להיות 5 אחוז מסך הכולל של עלות
  // ההוראה" (שרה, 10.9) — 5% אחד לבית ספר, על עלות ההוראה השנתית המלאה
  // (ברוטו + עלות מעביד, כולל מנהלת). מחליף את הנוסח מ-7.9 (ברוטו הוראה
  // בלבד) ואת הרזרבה למורה ב-calcEmployer שנספרה פעמיים.
  const MM_PCT = 0.05;
  // "היתרה לאחר שכר צריכה להיות בתוספת 10 אחוז ו-5 אחוז מ"מ" (שרה, 15.9):
  // כרית ביטחון של 10% על עלות ההוראה השנתית, בנוסף ל-5% מילוי מקום.
  // שתיהן יחד = הרזרבה שיורדת מהיתרה. זהה ל-BUFFER_PCT ב-api/shalhavot-budget.
  const BUFFER_PCT = 0.10;
  // מדד בכותרת כרטיס: תווית קטנה מעל מספר, רוחב קבוע — הכרטיסים מיושרים
  const Metric = ({ label, val, big }) => (
    <div style={{ minWidth:150, flexShrink:0 }}>
      <p style={{ fontSize:13.2, color:'var(--text3)', fontWeight:600, marginBottom:1 }}>{label}</p>
      <p className="num" style={{ fontSize: big ? 17.8 : 15.5, fontWeight:800,
        color: val == null ? 'var(--text3)' : val < 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)' }}>
        {val == null ? '—' : money(per(val))}
      </p>
    </div>
  );
  // שורות באותו שם (למשל שני מקורות "גיוס קהילתי", או פיצול בנים/בנות)
  // מאוחדות לשורה אחת — "לתקן" (שרה, 3.9)
  const mergeLines = (lines) => {
    const m = new Map();
    for (const x of lines || []) m.set(x.name, (m.get(x.name) || 0) + Number(x.amount || 0));
    return [...m.entries()].map(([name, amount]) => ({ name, amount }));
  };
  // "עלות ההוראה מהתקציב חייב להיות מוסתר כולל הפרש" (שרה, 3.9):
  // התחשיב שלה נחשף רק בלחיצה מפורשת — לא מוצג לכל מי שנכנס לדף.
  const [showSim, setShowSim] = useState(false);
  const per = v => (v == null ? null : (period === 'month' ? v / 12 : v));
  const [pulling, setPulling] = useState(false);

  /*
    משיכה ממבט-רשת: "מערכות תקציב מבט רשת נותנות הכנסות שכר" (שרה,
    2.9). ההתאמה לפי שם מנורמל; מה שלא נמצא — נשאר להקלדה. ערך שכבר
    הוקלד ידנית אינו נדרס — המשיכה ממלאת רק תאים ריקים, כדי שהחלטה
    ידנית של שרה לא תוחלף בשקט במספר של מערכת אחרת.
  */
  const norm = (n) => String(n || '').replace(/["'\u05f4\u05f3־-]/g, '').replace(/\s+/g, ' ').trim();
  const pullFromHub = async () => {
    setPulling(true); setErr('');
    try {
      const hub = await store.fetchHubBudget();
      const byName = new Map(hub.map(h => [norm(h.name), h]));
      /*
        "לא מתעדכן מבט הרשת" (שרה, 2.9): כל ערך שמקורו במשיכה מתרענן
        במשיכה הבאה; רק ערך שהוקלד ידנית (src manual) מוגן מדריסה.
      */
      let filled = 0; const misses = [];
      for (const sc of schools) {
        const h = byName.get(norm(sc.name));
        if (!h) { misses.push(sc.name); continue; }
        const cur = fin?.[sc.id] || {};
        const src = { ...(cur.src || {}) };
        const patch = {};
        const want = { ministryBudget: h.ministry > 0 ? h.ministry : null, yieul: h.yieul, teachingSim: h.teachingSim,
          incomeTotal: h.incomeOther > 0 ? h.incomeOther : null, expensesOther: h.expensesOther > 0 ? h.expensesOther : null,
          networkSupport: h.networkSupport };
        for (const k of ['ministryBudget', 'yieul', 'teachingSim', 'incomeTotal', 'expensesOther', 'networkSupport']) {
          if (src[k] === 'manual') continue;
          // השתתפות הרשת: "הנתונים של רינה הם הצודקים" (שרה, 6.9) — המשיכה
          // ממבט-רשת ממלאת רק תא ריק ולעולם לא מחליפה סכום שכבר רשום כאן.
          if (k === 'networkSupport' && cur[k] != null) continue;
          if (want[k] != null && want[k] !== cur[k]) { patch[k] = want[k]; src[k] = 'hub'; }
        }
        // הפירוט לשורות — עד היום לא נשמר במשיכה, והכרטיסים הציגו רק סכומים
        // basis: התעריף לשעה שבועית שהתקציב מניח — לעמודת "עלות שכר לשעה" (שרה, 10.9)
        const wantDetail = (h.detail || h.teach)
          ? { ...(h.detail || {}), teach: h.teach || null,
              basis: (h.hourRate || h.weeklyHours) ? { hourRate: h.hourRate ?? null, weeklyHours: h.weeklyHours ?? null } : null }
          : null;
        if (wantDetail && JSON.stringify(wantDetail) !== JSON.stringify(cur.detail)) {
          patch.detail = wantDetail;
        }
        if (Object.keys(patch).length) { await save(sc.id, { ...patch, src }); filled++; }
        // תקן השעות מהתקציב — "לא רואה שהתעדכנו השעות" (שרה, 15.9)
        if (h.budgetHours > 0 && h.budgetHours !== Number(sc.hoursQuota) && onSaveSchool) {
          await onSaveSchool({ ...sc, hoursQuota: h.budgetHours });
          filled++;
        }
      }
      // "נשמר" רק כשבאמת נשמר משהו — כשל שקט שמוצג כהצלחה גרוע מכשל
      setErr(misses.length
        ? `לא נמצאו במבט-רשת: ${misses.join(', ')}`
        : (filled === 0 ? 'אין שינויים חדשים במבט-רשת' : ''));
      if (filled > 0) setFlash(Date.now());
    } catch (e) { setErr(e.message); }
    finally { setPulling(false); }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await store.loadFinance();
        if (alive) setFin(Object.fromEntries(rows.map(r => [r.schoolId, r])));
      } catch (e) { if (alive) { setErr(e.message); setFin({}); } }
    })();
    return () => { alive = false; };
  }, []);

  // עלות ההוראה מול תקציב משרד החינוך — הוראה בלבד. צהרון ומשרות
  // שעתיות ממומנים בנפרד ומוצגים כשורה משלהם בכרטיס (15.9).
  const monthlyCost = (sid) => teachers
    .filter(t => t.schoolId === sid && !isHourlyRow(t))
    .reduce((sum, t) => sum + calcEmployer(t).total, 0);
  const hourlyCost = (sid) => teachers
    .filter(t => t.schoolId === sid && isHourlyRow(t))
    .reduce((sum, t) => sum + calcEmployer(t).total, 0);

  const save = async (sid, patch) => {
    const cur = { ...(fin?.[sid] || {}), ...patch };
    setFin(f => ({ ...f, [sid]: cur }));
    try { await store.saveFinance(sid, cur); setErr(''); setFlash(Date.now()); }
    catch (e) { setErr(e.message); }
  };

  const money = v => (v == null || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString('he-IL') + ' ₪');

  const rows = schools.map(sc => {
    const f = fin?.[sc.id] || {};
    const monthly = monthlyCost(sc.id);
    const annual  = monthly * 12;
    const hourlyMonthly = hourlyCost(sc.id);   // צהרון — מחוץ להשוואה מול המשרד
    const mmCost  = annual * MM_PCT;   // 5% מסך עלות ההוראה השנתית
    const bufferCost = annual * BUFFER_PCT;   // 10% כרית ביטחון (שרה, 15.9)
    const reserve = mmCost + bufferCost;       // מה שיורד מהיתרה מעבר לשכר עצמו
    // "תוסיף השתתפות רשת מרינה" (שרה, 3.9) — מצטרפת ליתרה בחיוב,
    // "אין צורך" בייעול (שרה, 3.9): משרד − (שכר + 10% + מ"מ 5%) + השתתפות
    const left = (f.ministryBudget != null)
      ? (f.ministryBudget || 0) - (annual + reserve) + (f.networkSupport || 0)
      : null;
    /*
      "עשיתי סימולציית שכר לפני הסימולציה האמיתית — חשוב לי לדעת מה
      הפער" (שרה, 2.9). הסימולציה שלה ממערכות התקציב מול העלות בפועל:
      חיובי = בפועל זול מהמתוכנן; שלילי = חריגה מהסימולציה.
    */
    // שני הצדדים כוללים מנהלת (הוראת שרה, 3.9) — השוואה מלאה מול מלאה
    const simGap = f.teachingSim != null && monthly > 0 ? f.teachingSim - annual : null;
    // חריגה מתקן השעות, בשעות (שרה, 10.9)
    const ts = teachers.filter(t => t.schoolId === sc.id);
    const hoursOverQ = hoursOver(ts, sc.hoursQuota);
    /*
      "כמה עלות שכר לפי התחשיב שלי לשעה (לא ההפרש)" (שרה, 10.9): שני
      ערכים לשעה שבועית לחודש, זה ליד זה. התחשיב = התעריף שהתקציב מניח
      (נמשך ממבט-רשת ונשמר ב-detail.basis). בפועל = עלות המעביד של עובדות
      ההוראה בלי המנהלת ובלי מי שבחל"ד/חל"ת, חלקי השעות הפרונטליות שלהן.
      באור עקיבא: 700 מול 551 — וזה כל הפער מול הסימולציה, לא חוגים.
    */
    const teaching = ts.filter(t => !isPrincipalRow(t) && !unpaidThisMonth(t));
    const teachHours = teaching.reduce((a, t) => a + (Number(t.frontalHours) || 0), 0);
    const teachCost  = teaching.reduce((a, t) => a + calcEmployer(t).total, 0);
    const perHourActual = teachHours > 0 ? teachCost / teachHours : null;
    const perHourSim    = f.detail?.basis?.hourRate ?? null;
    /*
      "כמה בית חב"ד היה אמור להעביר לפי התחשיב שלי לרשת" (שרה, 10.9):
      עלות ההוראה מהתקציב (כולל מנהלת וייעוץ, אחרי ייעול) פחות הכנסות
      משרד החינוך ופחות השתתפות הרשת. חיובי = מה שנשאר לבית חב"ד לכסות.
      אותה נוסחה כמו gap-per-chabad-house.mjs במערכת התקציב.
    */
    const chabadTransfer = (f.teachingSim != null && f.ministryBudget != null)
      ? f.teachingSim - (f.ministryBudget || 0) - (f.networkSupport || 0)
      : null;
    /*
      "אילו הרשת לא הייתה משתתפת — עלות ההוראה בפועל פלוס 10 אחוז" (שרה,
      14.9): מה שבית חב"ד היה צריך לכסות לבדו. העלות בפועל השנתית ועוד
      10% (במקום 5% המילוי מקום — כרית רחבה יותר), פחות הכנסות משרד
      החינוך, ובלי השתתפות הרשת. חיובי = על בית חב"ד לכסות.
    */
    // "מה עם 10 אחוז נוספים?" (שרה, 15.9) — אותו כלל כמו ביתרה: 10% ביטחון + 5% מ"מ
    const NO_NET_PCT = BUFFER_PCT + MM_PCT;
    const noNetwork = (f.ministryBudget != null && monthly > 0)
      ? annual * (1 + NO_NET_PCT) - (f.ministryBudget || 0)
      : null;
    /*
      "על פי זה יוחלט כמה השלמה הרשת לוקחת על עצמה" (שרה, 14.9): ההחלטה
      עצמה — "הרשת מכסה" — סכום שנתי מול המספר שלמעלה. לצידו: איזה חלק
      זה מהצורך, ומה נשאר לבית חב"ד. ההחלטה נכנסת לחישוב רק בלחיצה
      מפורשת שמעתיקה אותה ל"השתתפות הרשת".
    */
    const cover = f.networkCover;
    const coverPct = (cover != null && noNetwork > 0) ? Math.round(cover / noNetwork * 100) : null;
    const remains  = (cover != null && noNetwork != null) ? noNetwork - cover : null;
    return { sc, f, monthly, hourlyMonthly, annual, mmCost, bufferCost, reserve, left, simGap, hoursOverQ, perHourSim, perHourActual, chabadTransfer,
      noNetwork, cover, coverPct, remains };
  });
  // תצוגת "תחשיב · בפועל" לשעה — אותו רכיב בטבלה ובכרטיס
  const PerHour = ({ sim, actual }) => (
    <span style={{ fontSize:15.5, whiteSpace:'nowrap' }}>
      <span style={{ color:'var(--text2)' }}>תחשיב </span>
      <span className="num" style={{ fontWeight:700 }}>{sim == null ? '—' : Math.round(sim).toLocaleString('he-IL')}</span>
      <span style={{ color:'var(--text3)' }}> · </span>
      <span style={{ color:'var(--text2)' }}>בפועל </span>
      <span className="num" style={{ fontWeight:800, color: actual == null ? 'var(--text3)' : sim != null && actual > sim ? 'var(--danger)' : 'var(--text)' }}>
        {actual == null ? '—' : Math.round(actual).toLocaleString('he-IL')}
      </span>
    </span>
  );
  // סה"כ חריגה ברשת: רק בתי הספר שמעל התקן (מי שמתחת אינו מקזז)
  const totOverHours = rows.reduce((a, r) => a + (r.hoursOverQ > 0 ? r.hoursOverQ : 0), 0);
  const tot = rows.reduce((a, r) => ({
    budget: a.budget + (r.f.ministryBudget || 0),
    yieul:  a.yieul  + (r.f.yieul || 0),
    monthly: a.monthly + r.monthly,
    annual: a.annual + r.annual,
    mm: a.mm + r.reserve,
    left: a.left + (r.left || 0),
    sim: a.sim + (r.f.teachingSim || 0),
    simGap: a.simGap + (r.simGap || 0),
    support: a.support + (r.f.networkSupport || 0),
    noNetwork: a.noNetwork + (r.noNetwork || 0),
    cover: a.cover + (r.cover || 0),
    remains: a.remains + (r.remains ?? r.noNetwork ?? 0),
  }), { budget: 0, yieul: 0, monthly: 0, annual: 0, mm: 0, left: 0, sim: 0, simGap: 0, support: 0, noNetwork: 0, cover: 0, remains: 0 });
  // צבע לסכום שבית חב"ד מכסה: חיובי = נטל על בית חב"ד (אדום), אפס/שלילי = מכוסה
  const coverColor = v => (v == null ? 'var(--text3)' : v > 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)');
  // "הרשת מכסה" → "השתתפות הרשת": ההחלטה נכנסת לחישוב. הקלדה ידנית
  // (src manual) — המשיכה ממבט-רשת לא תדרוס אותה.
  const applyCover = (sid, cover) => save(sid, { networkSupport: Math.round(cover),
    src: { ...((fin?.[sid] || {}).src || {}), networkSupport: 'manual' } });
  // מה שנשאר לבית חב"ד אחרי ההחלטה — או כל הצורך, כשטרם הוחלט
  const Remains = ({ cover, coverPct, remains, noNetwork }) => (
    cover == null
      ? <span style={{ fontSize:13.8, color:'var(--text3)' }}>{noNetwork == null ? '—' : 'טרם הוחלט'}</span>
      : <span style={{ whiteSpace:'nowrap' }}>
          <span className="num" style={{ fontSize:16.1, fontWeight:700, color: coverColor(remains) }}>{money(per(remains))}</span>
          {coverPct != null && <span style={{ fontSize:13.2, color:'var(--text3)', marginInlineStart:5 }}>הרשת {coverPct}%</span>}
        </span>
  );
  // כפתור ההעתקה — מופיע רק כשיש החלטה שעדיין לא נכנסה ל"השתתפות הרשת"
  const ApplyBtn = ({ sid, cover, f }) => (
    cover != null && Math.round(cover) !== Math.round(f.networkSupport || 0)
      ? <button className="apple-btn apple-btn-ghost" onClick={() => applyCover(sid, cover)}
          title='מעתיק את "הרשת מכסה" ל"השתתפות הרשת" — היתרה וכרטיסי בתי הספר יתעדכנו'
          style={{ minHeight:28, padding:'0 9px', fontSize:13.2, marginInlineStart:6, whiteSpace:'nowrap' }}>
          <Check size={12} strokeWidth={2.6} />קבע כהשתתפות
        </button>
      : null
  );

  const TH = ({ children }) => (
    <th style={{ padding:'10px 8px', fontSize:13.8, fontWeight:700, color:'var(--text2)',
      textAlign:'center', whiteSpace:'nowrap' }}>{children}</th>
  );
  const moneyInput = (sid, field, val) => (
    <input type="number" min="0" dir="ltr" className="apple-input"
      inputMode="decimal" key={`fin-${sid}-${field}-${val ?? ''}`}
      defaultValue={val ?? ''}
      placeholder="—"
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      onBlur={e => {
        const v = e.target.value === '' ? null : Number(e.target.value);
        // הקלדה ידנית מסמנת בעלות: המשיכה לא תדרוס אותה יותר
        if (v !== (val ?? null)) save(sid, { [field]: v, src: { ...((fin?.[sid] || {}).src || {}), [field]: 'manual' } });
      }}
      style={{ width:112, textAlign:'center', fontSize:15.5, fontWeight:600, padding:'6px 7px' }} />
  );

  return (
    <div className="page-wrap" style={{ maxWidth:1380 }}>
      <PageHead
        title="עלות הוראה מול תקציב"
        badge={
          <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:13.8, fontWeight:700,
            color:'var(--purple)', background:'var(--purple-100)',
            border:'1px solid #D8CEEF', borderRadius:999, padding:'3px 11px' }}>
            <ShieldCheck size={14} strokeWidth={2.4} />לעינייך בלבד
          </span>
        }
        subtitle="יתרת תקציב משרד החינוך אחרי עלות השכר ומילוי המקום, בתוספת השתתפות הרשת — לכל בית ספר ולרשת כולה."
      />

      {/* סרגל הכלים של המסך — משיכה ממבט-רשת, חתך חודשי/שנתי, והתחשיב */}
      <div className="page-toolbar">
        <button className="apple-btn apple-btn-ghost" onClick={pullFromHub} disabled={pulling}
          title="הכנסות משרד החינוך והייעול שנבחר, מתוך מבט-רשת. ממלא רק תאים ריקים."
          style={{ minHeight:36, fontSize:14.4 }}>
          <Download size={14} strokeWidth={2.2} />
          {pulling ? 'מושך ממבט-רשת…' : 'משיכה ממבט-רשת'}
        </button>
        <div className="apple-seg">
          {[['month', 'חודשי'], ['year', 'שנתי']].map(([v, l]) => (
            <button key={v} onClick={() => setPeriod(v)}
              className={['apple-seg-item', period === v ? 'active' : ''].join(' ')}
              style={{ padding:'5px 16px' }}>{l}</button>
          ))}
        </div>
        <button onClick={() => setShowSim(v => !v)} className="apple-btn"
          style={{ minHeight:36, padding:'0 14px', fontSize:13.8, fontWeight:700, borderRadius:10, cursor:'pointer',
            border:'1px solid var(--line)', background: showSim ? 'var(--purple)' : 'transparent',
            color: showSim ? '#fff' : 'var(--text3)' }}>
          {showSim ? 'הסתרת התחשיב מהתקציב' : 'הצגת התחשיב מהתקציב'}
        </button>
        {flash > 0 && Date.now() - flash < 4000 && (
          <span style={{ fontSize:13.8, color:'var(--ok)', fontWeight:700, marginInlineStart:'auto' }}>נשמר ✓</span>
        )}
      </div>

      {err && (
        <div style={{ background:'var(--danger-bg)', color:'var(--danger)', border:'1px solid var(--danger-line)', borderRadius:10,
          padding:'9px 14px', fontSize:14.9, fontWeight:600, marginBottom:12 }}>{err}</div>
      )}
      <div className="apple-card table-scroll only-desktop" style={{ padding:0, overflowX:'auto' }}>
        <table className="sticky-first" style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1.5px solid var(--line)' }}>
              <TH>בית ספר</TH>
              <TH>הכנסות משרד החינוך + מענק</TH>
              <TH>עלות שכר</TH>
              <TH>תוספת 10% + מ"מ 5%</TH>
              {showSim && <TH>עלות הוראה מהתקציב</TH>}
              {showSim && <TH>הפרש מול השכר בפועל</TH>}
              {showSim && <TH>עלות שכר לשעה שבועית</TH>}
              {showSim && <TH>העברה מבית חב"ד לפי התחשיב</TH>}
              {showSim && <TH>דיוק השתתפות הרשת</TH>}
              <TH>השתתפות הרשת</TH>
              <TH>יתרה לאחר שכר</TH>
              <TH>בלי הרשת · בפועל +10% +5%</TH>
              <TH>הרשת מכסה</TH>
              <TH>נשאר לבית חב"ד</TH>
              <TH>חריגה מתקן השעות</TH>
            </tr>
          </thead>
          <tbody>
            {fin === null ? (
              <tr><td colSpan={showSim ? 15 : 10} style={{ padding:22, textAlign:'center', fontSize:15.5, color:'var(--text3)' }}>טוען…</td></tr>
            ) : rows.map(({ sc, f, monthly, hourlyMonthly, annual, reserve, left, simGap, hoursOverQ, perHourSim, perHourActual, chabadTransfer, noNetwork, cover, coverPct, remains }) => (
              <tr key={sc.id} style={{ borderBottom:'1px solid var(--line)' }}>
                <td style={{ padding:'10px 12px', fontSize:15.5, fontWeight:700, whiteSpace:'nowrap' }}>{sc.name}</td>
                <td style={{ textAlign:'center' }}>{period === 'year'
                  ? moneyInput(sc.id, 'ministryBudget', f.ministryBudget)
                  : <span style={{ fontSize:16.1 }}>{money(per(f.ministryBudget))}</span>}</td>
                <td style={{ textAlign:'center', fontSize:16.1, fontWeight:600 }}>{money(period === 'month' ? monthly : annual)}{hourlyMonthly > 0 && <span style={{ display:'block', fontSize:12.6, fontWeight:500, color:'var(--text3)' }} title="צהרון ומשרות שעתיות — לא נכללים בהשוואה מול משרד החינוך">+ צהרון {money(period === 'month' ? hourlyMonthly : hourlyMonthly * 12)}</span>}</td>
                <td style={{ textAlign:'center', fontSize:16.1, color:'var(--text2)' }}
                  title="כרית ביטחון 10% ומילוי מקום 5%, שניהם על עלות השכר השנתית">{money(per(reserve))}</td>
                {showSim && <td style={{ textAlign:'center', fontSize:16.1, color:'var(--text2)' }}>{f.teachingSim == null ? '—' : money(per(f.teachingSim))}</td>}
                {showSim && <td style={{ textAlign:'center', fontSize:16.1, fontWeight:700,
                  color: simGap == null ? 'var(--text3)' : simGap < 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)' }}>
                  {simGap == null ? '—' : money(per(simGap))}</td>}
                {showSim && <td style={{ textAlign:'center' }}><PerHour sim={perHourSim} actual={perHourActual} /></td>}
                {showSim && <td style={{ textAlign:'center', fontSize:16.1, fontWeight:700,
                  color: chabadTransfer == null ? 'var(--text3)' : chabadTransfer > 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)' }}>
                  {chabadTransfer == null ? '—' : money(per(chabadTransfer))}</td>}
                {/* עמודה ריקה להקלדה — "דיוק השתתפות הרשת" (שרה, 10.9); לא נכנסת לשום חישוב */}
                {showSim && <td style={{ textAlign:'center' }}>{period === 'year'
                  ? moneyInput(sc.id, 'networkSupportAdj', f.networkSupportAdj)
                  : <span style={{ fontSize:16.1 }}>{money(per(f.networkSupportAdj))}</span>}</td>}
                <td style={{ textAlign:'center' }}>{period === 'year'
                  ? moneyInput(sc.id, 'networkSupport', f.networkSupport)
                  : <span style={{ fontSize:16.1 }}>{money(per(f.networkSupport))}</span>}</td>
                <td style={{ textAlign:'center', fontSize:16.7, fontWeight:800,
                  color: left == null ? 'var(--text3)' : left < 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)' }}>
                  {left == null ? '—' : money(per(left))}
                </td>
                <td style={{ textAlign:'center', fontSize:16.1, fontWeight:700, color: coverColor(noNetwork) }}
                  title='מה שבית חב"ד היה מכסה לבדו: עלות ההוראה בפועל ועוד 10% ביטחון ו-5% מילוי מקום, פחות הכנסות משרד החינוך, בלי השתתפות הרשת'>
                  {noNetwork == null ? '—' : money(per(noNetwork))}
                </td>
                <td style={{ textAlign:'center', whiteSpace:'nowrap' }}>
                  {period === 'year'
                    ? <>{moneyInput(sc.id, 'networkCover', f.networkCover)}<ApplyBtn sid={sc.id} cover={cover} f={f} /></>
                    : <span style={{ fontSize:16.1 }}>{money(per(f.networkCover))}</span>}
                </td>
                <td style={{ textAlign:'center' }}><Remains cover={cover} coverPct={coverPct} remains={remains} noNetwork={noNetwork} /></td>
                <td style={{ textAlign:'center' }}><OverHours over={hoursOverQ} size={16.1} /></td>
              </tr>
            ))}
          </tbody>
          {fin !== null && rows.length > 1 && (
            <tfoot>
              <tr style={{ borderTop:'2px solid var(--line)', background:'var(--apple-fill)' }}>
                <td style={{ padding:'11px 12px', fontSize:16.1, fontWeight:800 }}>סה"כ הרשת</td>
                <td style={{ textAlign:'center', fontSize:16.1, fontWeight:700 }}>{money(per(tot.budget))}</td>
                <td style={{ textAlign:'center', fontSize:16.1, fontWeight:700 }}>{money(period === 'month' ? tot.monthly : tot.annual)}</td>
                <td style={{ textAlign:'center', fontSize:16.1, fontWeight:700 }}>{money(per(tot.mm))}</td>
                {showSim && <td style={{ textAlign:'center', fontSize:16.1, fontWeight:700 }}>{money(per(tot.sim))}</td>}
                {showSim && <td style={{ textAlign:'center', fontSize:16.1, fontWeight:700,
                  color: tot.simGap < 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)' }}>{money(per(tot.simGap))}</td>}
                {/* שלוש עמודות התחשיב בלי סיכום — לשעה, העברה ודיוק הן פר בית ספר.
                    בלי התאים האלה שורת הסיכום נדדה שלוש עמודות ימינה. */}
                {showSim && <td /> }
                {showSim && <td /> }
                {showSim && <td /> }
                <td style={{ textAlign:'center', fontSize:16.1, fontWeight:700 }}>{money(per(tot.support))}</td>
                <td style={{ textAlign:'center', fontSize:16.7, fontWeight:800,
                  color: tot.left < 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)' }}>{money(per(tot.left))}</td>
                <td style={{ textAlign:'center', fontSize:16.1, fontWeight:700, color: coverColor(tot.noNetwork) }}>{money(per(tot.noNetwork))}</td>
                <td style={{ textAlign:'center', fontSize:16.1, fontWeight:700 }}>{money(per(tot.cover))}</td>
                <td style={{ textAlign:'center', fontSize:16.1, fontWeight:700, color: coverColor(tot.remains) }}>{money(per(tot.remains))}</td>
                <td style={{ textAlign:'center' }}><OverHours over={totOverHours} size={16.1} /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* מובייל: כרטיס אנכי לכל בית ספר במקום הטבלה הרחבה — אותם נתונים,
          אותם משתנים (rows, tot, per, moneyInput), רק פריסה אחרת.
          moneyInput מרונדר גם כאן וגם בטבלה — שניהם כותבים לאותו state,
          וה-key לפי הערך גורם לשניהם להתרענן יחד אחרי שמירה. */}
      <div className="only-mobile">
        {fin === null ? (
          <div className="apple-card mcard" style={{ padding:22, textAlign:'center', fontSize:15.5, color:'var(--text3)' }}>טוען…</div>
        ) : rows.map(({ sc, f, monthly, hourlyMonthly, annual, reserve, left, simGap, hoursOverQ, perHourSim, perHourActual, chabadTransfer, noNetwork, cover, coverPct, remains }) => (
          <div key={'m-' + sc.id} className="apple-card mcard">
            <p className="mcard-name" style={{ marginBottom:4 }}>{sc.name}</p>
            <CardRow label="הכנסות משרד החינוך + מענק">
              {period === 'year'
                ? moneyInput(sc.id, 'ministryBudget', f.ministryBudget)
                : money(per(f.ministryBudget))}
            </CardRow>
            <CardRow label="עלות שכר">{money(period === 'month' ? monthly : annual)}</CardRow>
            {hourlyMonthly > 0 && (
              <CardRow label="צהרון ומשרות שעתיות (מחוץ להשוואה)" color="var(--text3)">
                {money(period === 'month' ? hourlyMonthly : hourlyMonthly * 12)}
              </CardRow>
            )}
            <CardRow label='תוספת 10% + מ"מ 5%' color="var(--text2)">{money(per(reserve))}</CardRow>
            {showSim && (
              <CardRow label="עלות הוראה מהתקציב" color="var(--text2)">
                {f.teachingSim == null ? '—' : money(per(f.teachingSim))}
              </CardRow>
            )}
            {showSim && (
              <CardRow label="הפרש מול השכר בפועל"
                color={simGap == null ? 'var(--text3)' : simGap < 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)'}>
                {simGap == null ? '—' : money(per(simGap))}
              </CardRow>
            )}
            {showSim && (
              <CardRow label="עלות שכר לשעה שבועית"><PerHour sim={perHourSim} actual={perHourActual} /></CardRow>
            )}
            {showSim && (
              <CardRow label='העברה מבית חב"ד לפי התחשיב'
                color={chabadTransfer == null ? 'var(--text3)' : chabadTransfer > 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)'}>
                {chabadTransfer == null ? '—' : money(per(chabadTransfer))}
              </CardRow>
            )}
            {showSim && (
              <CardRow label="דיוק השתתפות הרשת">
                {period === 'year'
                  ? moneyInput(sc.id, 'networkSupportAdj', f.networkSupportAdj)
                  : money(per(f.networkSupportAdj))}
              </CardRow>
            )}
            <CardRow label="השתתפות הרשת">
              {period === 'year'
                ? moneyInput(sc.id, 'networkSupport', f.networkSupport)
                : money(per(f.networkSupport))}
            </CardRow>
            <CardRow label="יתרה לאחר שכר" strong
              color={left == null ? 'var(--text3)' : left < 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)'}>
              {left == null ? '—' : money(per(left))}
            </CardRow>
            <CardRow label="בלי הרשת · בפועל +10% +5%" color={coverColor(noNetwork)}>
              {noNetwork == null ? '—' : money(per(noNetwork))}
            </CardRow>
            <CardRow label="הרשת מכסה">
              {period === 'year'
                ? <span style={{ display:'inline-flex', alignItems:'center', flexWrap:'wrap', gap:4, justifyContent:'flex-end' }}>
                    {moneyInput(sc.id, 'networkCover', f.networkCover)}<ApplyBtn sid={sc.id} cover={cover} f={f} />
                  </span>
                : money(per(f.networkCover))}
            </CardRow>
            <CardRow label='נשאר לבית חב"ד'><Remains cover={cover} coverPct={coverPct} remains={remains} noNetwork={noNetwork} /></CardRow>
            <CardRow label="חריגה מתקן השעות"><OverHours over={hoursOverQ} /></CardRow>
          </div>
        ))}
        {fin !== null && rows.length > 1 && (
          <div className="apple-card mcard" style={{ background:'var(--fill)' }}>
            <p className="mcard-name" style={{ marginBottom:4 }}>סה"כ הרשת</p>
            <CardRow label="הכנסות משרד החינוך + מענק">{money(per(tot.budget))}</CardRow>
            <CardRow label="עלות שכר">{money(period === 'month' ? tot.monthly : tot.annual)}</CardRow>
            <CardRow label='תוספת 10% + מ"מ 5%' color="var(--text2)">{money(per(tot.mm))}</CardRow>
            {showSim && <CardRow label="עלות הוראה מהתקציב" color="var(--text2)">{money(per(tot.sim))}</CardRow>}
            {showSim && (
              <CardRow label="הפרש מול השכר בפועל"
                color={tot.simGap < 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)'}>
                {money(per(tot.simGap))}
              </CardRow>
            )}
            <CardRow label="השתתפות הרשת">{money(per(tot.support))}</CardRow>
            <CardRow label="יתרה לאחר שכר" strong
              color={tot.left < 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)'}>
              {money(per(tot.left))}
            </CardRow>
            <CardRow label="בלי הרשת · בפועל +10% +5%" color={coverColor(tot.noNetwork)}>{money(per(tot.noNetwork))}</CardRow>
            <CardRow label="הרשת מכסה">{money(per(tot.cover))}</CardRow>
            <CardRow label='נשאר לבית חב"ד' color={coverColor(tot.remains)}>{money(per(tot.remains))}</CardRow>
            <CardRow label="חריגה מתקן השעות"><OverHours over={totOverHours} /></CardRow>
          </div>
        )}
      </div>
      <p style={{ fontSize:13.8, color:'var(--text3)', marginTop:10, lineHeight:1.6 }}>
        תקציב הכנסות משרד החינוך פחות עלות השכר, פחות תוספת ביטחון 10% ומילוי מקום 5% (שניהם על עלות ההוראה השנתית), בתוספת השתתפות הרשת. התקציב שנתי ומוקלד כאן;
        עלות השכר נמשכת מחודש {monthKey || ''} — בפועל כשהוזנה, אחרת האומדן — ומוכפלת ב-12.
        {' '}חל"ת אינו נספר בעלות. שינוי נשמר ביציאה מהשדה.
        {' '}<b>בלי הרשת · בפועל +10% +5%</b> — מה שבית חב"ד היה מכסה לבדו: עלות ההוראה בפועל ועוד 10% ביטחון ו-5% מילוי מקום, פחות הכנסות משרד החינוך, בלי השתתפות הרשת.
        {' '}<b>הרשת מכסה</b> — ההחלטה: כמה מזה הרשת לוקחת על עצמה (שנתי). "קבע כהשתתפות" מעתיק את ההחלטה ל"השתתפות הרשת" והכול מתעדכן.
      </p>

      {/* "לכל בית ספר תעשה הכנסות מול הוצאות ללא עלות הוראה" (שרה, 3.9) —
          התמונה התפעולית מהתקציב במבט-רשת: כל ההכנסות מול כל ההוצאות
          שאינן שכר הוראה וייעוץ. */}
      {/* "תכין כרטיס לכל בית ספר... הפרשי עלות הוראה והפרשי הוצאות עם
          כרטיס מתרחב ומפורט" (שרה, 3.9). שני ההפרשים בכותרת; בפתיחה —
          הפירוט המלא של שני הצדדים. בלי מילוי מקום — "תוריד את כל
          המילויי מקום" (שרה, 3.9). */}
      <h2 className="section-head">כרטיסי בתי הספר</h2>
      <p className="section-sub">הפרשי עלות הוראה והוצאות לכל בית ספר — לחיצה על כרטיס פותחת את הפירוט המלא.</p>
      {fin !== null && rows.map(({ sc, f, monthly, annual, mmCost, bufferCost, reserve }) => {
        const teachIncome = (f.ministryBudget || 0) + (f.networkSupport || 0);
        const teachCost = annual + reserve;
        const teachDiff = (f.ministryBudget != null) ? teachIncome - teachCost : null;
        // צד התפעול
        const incLines = mergeLines(f.detail?.income);
        const expLines = mergeLines(f.detail?.expenses);
        const incSum = incLines.reduce((a, x) => a + x.amount, 0) || (f.incomeTotal || 0);
        const expSum = expLines.reduce((a, x) => a + x.amount, 0) || (f.expensesOther || 0);
        const opDiff = (f.incomeTotal != null || expLines.length) ? incSum - expSum : null;
        if (teachDiff == null && opDiff == null) return null;
        const isOpen = !!openInc['card-' + sc.id];
        const dline = (label, val, bold, neg) => (
          <div style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'4px 0',
            borderBottom: bold ? 'none' : '1px dashed var(--line)', fontSize: bold ? 15.5 : 14.9, fontWeight: bold ? 800 : 400 }}>
            <span>{label}</span><b style={{ whiteSpace:'nowrap', color: neg ? 'var(--danger)' : undefined }}>{neg ? '−' : ''}{money(Math.abs(val))}</b>
          </div>
        );
        const gap = v => v == null ? '—' : money(v);
        const gapColor = v => v == null ? 'var(--text3)' : v < 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)';
        return (
          <div key={'card-' + sc.id} className="apple-card" style={{ padding:'12px 18px', marginBottom:10, cursor:'pointer' }}
            onClick={() => setOpenInc(m => ({ ...m, ['card-' + sc.id]: !m['card-' + sc.id] }))}>
            <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
              <ChevronLeft size={16} strokeWidth={2.4} style={{ color:'var(--text3)', flexShrink:0, transform: isOpen ? 'rotate(-90deg)' : 'none' }} />
              <p style={{ fontSize:16.7, fontWeight:800, flex:'1 1 160px', minWidth:120 }}>{sc.name}</p>
              <Metric label="הפרש עלות הוראה" val={teachDiff} />
              <Metric label="הפרש תקציב נוסף" val={opDiff} />
              <Metric label="סך הכל" val={(teachDiff || 0) + (opDiff || 0)} big />
            </div>
            {isOpen && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:20, marginTop:12 }}>
                <div>
                  <p style={{ fontSize:14.4, fontWeight:800, color:'var(--purple)', marginBottom:4 }}>עלות הוראה · {period === 'month' ? 'חודשי' : 'שנתי'}</p>
                  {/* "הכנסות משרד החינוך 2 שורות" (שרה, 3.9) — משרד ומענק בנפרד */}
                  {f.detail?.teach?.income?.length
                    ? f.detail.teach.income.map((x, i) => <div key={'ti' + i}>{dline(x.name, per(x.amount))}</div>)
                    : dline('הכנסות משרד החינוך + מענק', per(f.ministryBudget || 0))}
                  {f.networkSupport ? dline('השתתפות הרשת', per(f.networkSupport)) : null}
                  {dline('סה"כ הכנסות הוראה', per(teachIncome), true)}
                  <div style={{ height:8 }} />
                  {dline(`שכר הוראה (עובדי הוראה, מנהלת, תוספות)`, per(annual))}
                  {dline('תוספת ביטחון — 10% מעלות ההוראה', per(bufferCost))}
                  {dline('מילוי מקום — 5% מעלות ההוראה', per(mmCost))}
                  {dline('סה"כ הוצאות הוראה', per(teachCost), true)}
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', fontSize:15.5, fontWeight:800,
                    borderTop:'2px solid var(--line)', color: gapColor(teachDiff) }}>
                    <span>הפרש עלות הוראה</span><span>{teachDiff == null ? '—' : money(per(teachDiff))}</span>
                  </div>
                  {/* "תוסיף את עלות ההוראה שחישבתי בתקציב... הוצאות שעות
                      הוראה, ייעוץ" (שרה, 3.9) — התכנון שלה מהתקציב, מול הבפועל */}
                  {showSim && f.detail?.teach?.expenses?.length > 0 && (() => {
                    const simSum = f.detail.teach.expenses.reduce((a, x) => a + x.amount, 0);
                    return (
                      <div style={{ marginTop:12, padding:'10px 12px', background:'var(--apple-fill, #f5f3fa)', borderRadius:10 }}>
                        <p style={{ fontSize:13.8, fontWeight:800, color:'var(--purple)', marginBottom:4 }}>עלות ההוראה שחושבה בתקציב</p>
                        {f.detail.teach.expenses.map((x, i) => <div key={'te' + i}>{dline(x.name, per(x.amount), false, x.amount < 0)}</div>)}
                        {dline('סה"כ מהתקציב', per(simSum), true)}
                        <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:14.4, fontWeight:800,
                          color: gapColor(simSum - annual) }}>
                          <span>הפרש מול השכר בפועל</span><span>{money(per(simSum - annual))}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <p style={{ fontSize:14.4, fontWeight:800, color:'var(--purple)', marginBottom:4 }}>תקציב נוסף · {period === 'month' ? 'חודשי' : 'שנתי'}</p>
                  {incLines.map((x, i) => <div key={'i' + i}>{dline(x.name, per(x.amount))}</div>)}
                  {dline('סה"כ הכנסות', per(incSum), true)}
                  <div style={{ height:8 }} />
                  {expLines.map((x, i) => <div key={'e' + i}>{dline(x.name, per(x.amount))}</div>)}
                  {dline('סה"כ הוצאות', per(expSum), true)}
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', fontSize:15.5, fontWeight:800,
                    borderTop:'2px solid var(--line)', color: gapColor(opDiff) }}>
                    <span>הפרש תקציב נוסף</span><span>{opDiff == null ? '—' : money(per(opDiff))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {fin !== null && (() => {
        // סיכום רשתי — אותם חישובים בדיוק כמו בכרטיסים הבודדים
        let sumTeach = 0, sumOp = 0, any = false;
        for (const { f, annual, reserve } of rows) {
          const ti = (f.ministryBudget || 0) + (f.networkSupport || 0);
          const td = f.ministryBudget != null ? ti - (annual + reserve) : null;
          const il = mergeLines(f.detail?.income), el = mergeLines(f.detail?.expenses);
          const is_ = il.reduce((a, x) => a + x.amount, 0) || (f.incomeTotal || 0);
          const es = el.reduce((a, x) => a + x.amount, 0) || (f.expensesOther || 0);
          const od = (f.incomeTotal != null || el.length) ? is_ - es : null;
          if (td != null || od != null) { any = true; sumTeach += td || 0; sumOp += od || 0; }
        }
        if (!any) return null;
        const gc = v => v < 0 ? 'var(--danger)' : 'var(--ok, #2e7d32)';
        return (
          <div className="apple-card" style={{ padding:'14px 18px', marginBottom:10, background:'var(--apple-fill, #f5f3fa)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
              <p style={{ fontSize:16.7, fontWeight:800, flex:'1 1 160px', minWidth:120, paddingInlineStart:32 }}>סה"כ הרשת</p>
              <Metric label="הפרש עלות הוראה" val={sumTeach} />
              <Metric label="הפרש תקציב נוסף" val={sumOp} />
              <Metric label="סך הכל" val={sumTeach + sumOp} big />
            </div>
          </div>
        );
      })()}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   מסך התלושים — על המסך, לא להורדה ("אלו הורדות", שרה 3.9)

   לכל מורה: הבסיס בעולם ישן (הברוטו פחות תוספת בית חב"ד), נתוני
   התלוש הנגזרים מהשעות, והסה"כ — שהוא בדיוק השכר המאומת. הכול חי
   מהנתונים; שינוי במערכת משתקף כאן מיד. כפתור הדפסה בכל בית ספר.
═══════════════════════════════════════════════════════════════ */
/* ═══ היעדרויות וממ"מ — המבט של שרה ואסתר ═══
   "גם אני וגם אסתר יראו" (שרה, 3.9): מה שהמנהלות מדווחות בדשבורד
   החודשי שבקישור מופיע כאן, לכל הרשת, לקריאה בלבד — התיקון נעשה
   אצל המנהלת, לא כאן. */
function AbsencesView({ schools, teachers, monthKey, fmtMonthFn }) {
  const [onlyReported, setOnlyReported] = useState(true);
  const has = t => (t.absenceDays || 0) > 0 || (t.mmHours || 0) > 0 || t.mmFor
    || onLeave(t) || t.isTemp || t.absenceReason || t.sickFormPath;
  const shown = teachers.filter(t => !onlyReported || has(t));
  const bySchool = schools
    .map(sc => ({ sc, list: shown.filter(t => t.schoolId === sc.id) }))
    .filter(g => g.list.length);
  const totAbs = shown.reduce((s, t) => s + (t.absenceDays || 0), 0);
  const totMM  = shown.reduce((s, t) => s + (t.mmHours || 0), 0);

  const exportCSV = () => {
    const headers = [
      { key:'school', label:'בית ספר' }, { key:'name', label:'שם' },
      { key:'absence', label:'ימי היעדרות' }, { key:'reason', label:'סיבה' },
      { key:'form', label:'טופס מחלה' }, { key:'status', label:'סטטוס' },
      { key:'mmHours', label:'שעות ממ"מ' }, { key:'mmFor', label:'במקום מי' },
      { key:'period', label:'תקופת ממ"מ' },
    ];
    const body = bySchool.flatMap(({ sc, list }) => list.map(t => {
      const replaced = t.mmFor ? teachers.find(x => x.name === t.mmFor) : null;
      const weekly = Boolean(replaced &&
        (replaced.leaveType === 'maternity' || replaced.absenceReason === 'maternity'));
      return {
        school: sc.name, name: t.name, absence: t.absenceDays || 0,
        reason: reasonLabel(t.absenceReason) || '', form: t.sickFormPath ? 'כן' : '',
        status: onLeave(t) ? leaveText(t) : '', mmHours: t.mmHours || 0,
        mmFor: t.mmFor || '',
        period: weekly ? 'שבועי — חל"ד'
          : t.mmFrom ? (!t.mmTo || t.mmTo === t.mmFrom ? fmtD(t.mmFrom) : `${fmtD(t.mmFrom)} - ${fmtD(t.mmTo)}`)
          : t.isTemp ? subInfo(t) : '',
      };
    }));
    downloadCSV(headers, body, `היעדרויות_וממ"מ_${monthKey}.csv`,
      { school:'סה"כ', absence: totAbs, mmHours: totMM });
  };

  return (
    <div className="page-wrap" style={{ maxWidth:1100 }}>
      <PageHead
        title={`היעדרויות וממ"מ · ${fmtMonthFn ? fmtMonthFn(monthKey) : monthKey}`}
        subtitle={`מה שהמנהלות דיווחו החודש: ${totAbs} ימי היעדרות · ${totMM} שעות ממ"מ. התיקון נעשה אצל המנהלת בקישור שלה.`}
        actions={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <div className="apple-seg">
              <button onClick={() => setOnlyReported(true)} className={['apple-seg-item', onlyReported ? 'active' : ''].join(' ')}
                style={{ padding:'5px 11px', fontSize:13.8 }}>עם דיווח</button>
              <button onClick={() => setOnlyReported(false)} className={['apple-seg-item', !onlyReported ? 'active' : ''].join(' ')}
                style={{ padding:'5px 11px', fontSize:13.8 }}>כל העובדות</button>
            </div>
            <button className="apple-btn apple-btn-ghost" onClick={exportCSV} style={{ fontSize:14.4 }}>
              <FileSpreadsheet size={15} strokeWidth={2.2} />
              ייצוא
            </button>
          </div>
        }
      />
      {!bySchool.length ? (
        <div className="apple-card" style={{ textAlign:'center', padding:'56px 20px' }}>
          <p style={{ fontSize:17.2, fontWeight:700, color:'var(--text)' }}>אין דיווחי היעדרות או ממ"מ החודש</p>
          <p style={{ fontSize:14.4, color:'var(--text3)', marginTop:4 }}>מה שהמנהלות ימלאו בדשבורד החודשי יופיע כאן.</p>
        </div>
      ) : bySchool.map(({ sc, list }) => (
        <div key={sc.id} className="apple-card" style={{ padding:'14px 16px', marginBottom:16 }}>
          <p style={{ fontSize:16.7, fontWeight:800, marginBottom:8 }}>{sc.name} · {list.length}</p>
          <div className="table-scroll">
            <table className="apple-table sticky-first" style={{ fontSize:14.9, minWidth:680 }}>
              <thead><tr>
                <th>שם</th>
                <th style={{ textAlign:'center' }}>ימי היעדרות</th>
                <th style={{ textAlign:'center' }}>סיבה</th>
                <th style={{ textAlign:'center' }}>טופס</th>
                <th style={{ textAlign:'center' }}>סטטוס</th>
                <th style={{ textAlign:'center' }}>שעות ממ"מ</th>
                <th>במקום מי</th>
                <th>תקופת ממ"מ</th>
              </tr></thead>
              <tbody>
                {list.map(t => {
                  const replaced = t.mmFor ? list.find(x => x.name === t.mmFor) || teachers.find(x => x.name === t.mmFor) : null;
                  const weekly = Boolean(replaced &&
                    (replaced.leaveType === 'maternity' || replaced.absenceReason === 'maternity'));
                  return (
                  <tr key={t.id}>
                    <td style={{ fontWeight:600 }}>{t.name}</td>
                    <td style={{ textAlign:'center', fontWeight:(t.absenceDays||0)>0 ? 700 : 400,
                      color:(t.absenceDays||0)>0 ? 'var(--danger)' : 'var(--text3)' }}>
                      {(t.absenceDays||0) > 0 ? t.absenceDays : '—'}
                    </td>
                    <td style={{ textAlign:'center' }}>{reasonLabel(t.absenceReason) || '—'}</td>
                    <td style={{ textAlign:'center' }}>
                      {t.sickFormPath ? (
                        <button className="apple-btn apple-btn-ghost" title="פתיחת טופס המחלה"
                          onClick={async () => { try { window.open(await store.sickFormUrl(t.sickFormPath), '_blank'); } catch (e) { alert(e.message); } }}
                          style={{ minHeight:28, padding:'0 9px', fontSize:13.8 }}>📎</button>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {onLeave(t)
                        ? <span className="apple-badge badge-orange">{leaveText(t)}</span>
                        : <span style={{ color:'var(--text3)' }}>—</span>}
                    </td>
                    <td style={{ textAlign:'center', fontWeight:(t.mmHours||0)>0 ? 700 : 400,
                      color:(t.mmHours||0)>0 ? 'var(--purple)' : 'var(--text3)' }}>
                      {(t.mmHours||0) > 0 ? `${t.mmHours}${weekly ? ' שבועי' : ''}` : '—'}
                    </td>
                    <td>{t.mmFor || '—'}</td>
                    <td style={{ fontSize:13.8, color:'var(--apple-orange)' }}>
                      {weekly ? 'שבועי — כל תקופת החל"ד'
                        : t.mmFrom ? (!t.mmTo || t.mmTo === t.mmFrom ? fmtD(t.mmFrom) : `${fmtD(t.mmFrom)} – ${fmtD(t.mmTo)}`)
                        : t.isTemp ? subInfo(t) : '—'}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function SlipsView({ schools, teachers, monthKey, fmtMonthFn, onSaveTeacher, onMarkSlip, onSaveSlipGross }) {
  const money = v => (v == null ? '—' : Math.round(v).toLocaleString('he-IL') + ' ₪');
  /*
    "לא רואים את התלוש רק עלויות" (שרה, 3.9): שורות הרכיבים המלאות —
    כפי שמחשבון המשרד מפיק אותן — נטענות מ-slip_lines, ולחיצה על מורה
    פותחת את התלוש עצמו: שכר משולב, התוספות, ת.שקלית... ועד הברוטו.
  */
  const [lines, setLines] = useState({});
  const [openSlip, setOpenSlip] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await store.listSlipLines(teachers.map(t => t.id));
        if (alive) setLines(m);
      } catch { /* אין הרשאה/רשת — הטבלה עדיין עובדת */ }
    })();
    return () => { alive = false; };
  }, [teachers]);
  const bySchool = schools.map(sc => ({
    sc,
    ts: teachers.filter(t => t.schoolId === sc.id),
  })).filter(x => x.ts.length);

  const rowFor = (t, paysSupp) => {
    if (isPrincipalRow(t)) {
      const bd = payBreakdown(t);
      if (!bd.gross) return { skip: 'אין עדיין שכר מנהלת' };
      // עולם ישן אמיתי כשחושב במחשבון (דרגה+ותק+גמול ניהול, 3.9);
      // עד אז — הפירוק הקבוע (בסיס + 4,700)
      const sl = lines[t.id];
      if (sl?.gross) {
        const supp = Math.max(0, bd.gross - sl.gross);
        return { darga: '—', vetek: t.seniority ?? '—', pct: 100, hours: 40,
          kita: false, base: sl.gross, supp, gross: bd.gross,
          paysSupp: supp > 0, principal: true, principalCalc: true };
      }
      return { darga: '—', vetek: t.seniority ?? '—', pct: 100, hours: 40,
        kita: false, base: bd.base, supp: bd.supplement, gross: bd.gross,
        paysSupp: bd.supplement > 0, principal: true };
    }
    if (t.leaveType === 'maternity') return { skip: 'חל"ד — הפרשות בלבד, אין תלוש' };
    if (t.leaveType === 'unpaid') return { skip: 'חל"ת — אין תלוש' };
    if (!Number(t.frontalHours)) return { skip: '0 שעות — ממתינה לעדכון המנהלת' };
    const gross = Number(t._agreedGross) || Number(t._officialGross) || 0;
    if (!gross) return { skip: 'אין עדיין ברוטו' };
    const supp = paysSupp ? (Number(t._chabadSupp) || 0) : 0;
    /*
      האחוז כאן נגזר מחדש בנוסחת העולם הישן — (שעות + 3 למחנכת) / 30,
      ועוד תוספת אם — ואינו האחוז של אופק שרשום בטבלת המורות. ההצגה
      הוחזרה לכך ב-8.9 אחרי ששרה זיהתה שהפער בין השניים אינו תקלת
      תצוגה אלא סימן לבעיה בסימולציה עצמה: הבסיס בעולם הישן חושב
      באחוז אחד והברוטו באופק באחר.
    */
    const scope = t.reform === 'ofek' ? slipScope(t) : null;
    return {
      darga: slipDarga(t), vetek: t.seniority,
      pct: scope ? scope.total : (t.scope ?? t.scopePct ?? 100),
      hours: scope ? scope.hours : t.frontalHours,
      kita: t.role && /^homeroom/.test(t.role),
      base: gross - supp, supp, gross, paysSupp,
    };
  };

  return (
    <div className="page-wrap" style={{ maxWidth:1180 }}>
      <PageHead
        title={`תלושים · ${fmtMonthFn ? fmtMonthFn(monthKey) : monthKey}`}
        subtitle={'הבסיס בעולם ישן לפי השעות (מחנכת +3 · אם מעל 79% +10), תוספת בית חב"ד שורה קבועה, והסה"כ הוא השכר המאומת. הכול מתעדכן חי מהנתונים.'}
        actions={
          <button className="apple-btn apple-btn-ghost no-print" onClick={() => window.print()} style={{ fontSize:14.9 }}>
            <Printer size={15} strokeWidth={2.2} />הדפסה
          </button>
        }
      />
      {bySchool.map(({ sc, ts }) => {
        const paysSupp = sc.chabadSupp !== false;
        const rows = ts.map(t => ({ t, r: rowFor(t, paysSupp) }));
        const live = rows.filter(x => !x.r.skip);
        const tot = live.reduce((a, x) => ({ base: a.base + x.r.base, supp: a.supp + x.r.supp, gross: a.gross + x.r.gross }),
          { base: 0, supp: 0, gross: 0 });
        return (
          <div key={sc.id} className="apple-card slip-school" style={{ padding:'14px 16px', marginBottom:18 }}>
            <p style={{ fontSize:17.2, fontWeight:800, marginBottom:8 }}>
              {sc.name} · {live.length} תלושים{!paysSupp ? ' · תשלום ישיר (בלי תוספת)' : ''}
            </p>
            <div className="table-scroll only-desktop">
              <table className="apple-table sticky-first" style={{ fontSize:14.9, minWidth:960 }}>
                <thead><tr>
                  <th>שם</th>
                  <th style={{ textAlign:'center' }}>דרגה</th>
                  <th style={{ textAlign:'center' }}>תואר</th>
                  <th style={{ textAlign:'center' }}>ותק</th>
                  <th style={{ textAlign:'center' }} title="קובע את תוספת האם: 24 שעות לאם = 90%">מין</th>
                  <th style={{ textAlign:'center' }}>ילדים עד 18</th>
                  <th style={{ textAlign:'center' }}>שעות לתלוש</th>
                  <th style={{ textAlign:'center' }}>אחוז</th>
                  <th style={{ textAlign:'center' }}>גמול חינוך</th>
                  <th style={{ textAlign:'center' }}>בסיס עולם ישן</th>
                  <th style={{ textAlign:'center' }}>תוספת בית חב"ד</th>
                  <th style={{ textAlign:'center' }}>ברוטו לתשלום</th>
                  <th style={{ textAlign:'center' }} title="הברוטו שיצא בתלוש בפועל — נרשם לצד המספר של המערכת, לא במקומו">יצא בתלוש</th>
                  <th style={{ textAlign:'center' }} title="וי — התלוש לחודש הזה כבר הוצא">תלוש הוצא</th>
                </tr></thead>
                <tbody>
                  {rows.map(({ t, r }) => r.skip ? (
                    <tr key={t.id} style={{ color:'var(--text3)' }}>
                      <td style={{ fontWeight:600 }}>
                        {t.name}
                        {subInfo(t) && <p style={{ fontSize:12.6, fontWeight:600, color:'var(--apple-orange)' }}>{subInfo(t)}</p>}
                      </td>
                      <td colSpan={13} style={{ fontSize:13.8 }}>{r.skip}</td>
                    </tr>
                  ) : (
                    <tr key={t.id} onClick={() => (lines[t.id] || r.principal) && setOpenSlip({ t, r })}
                      style={{ cursor: (lines[t.id] || r.principal) ? 'pointer' : 'default' }}
                      title={(lines[t.id] || r.principal) ? 'לחיצה פותחת את התלוש המלא' : 'התלוש המפורט בהכנה — יופיע בסיום החישוב'}>
                      <td style={{ fontWeight:600 }}>
                        {r.principal && <Briefcase size={12} strokeWidth={2.4} style={{ display:'inline', verticalAlign:'-1px', marginInlineEnd:4 }} />}
                        {t.name}
                        {(lines[t.id] || r.principal) && <FileText size={12} strokeWidth={2.2} style={{ display:'inline', verticalAlign:'-1px', marginInlineStart:5, color:'var(--purple)' }} />}
                        {subInfo(t) && <p style={{ fontSize:12.6, fontWeight:600, color:'var(--apple-orange)' }}>{subInfo(t)}</p>}
                      </td>
                      <td style={{ textAlign:'center' }}>{r.darga || '—'}</td>
                      <td style={{ textAlign:'center' }}>{DEGREE_LABELS[t.degree] || t.degree || '—'}</td>
                      <td style={{ textAlign:'center' }}>{r.vetek}</td>
                      <td style={{ textAlign:'center' }} onClick={e => e.stopPropagation()}>
                        {onSaveTeacher ? (
                          <select className="apple-select" value={t.gender || ''}
                            onChange={e => onSaveTeacher({ ...t, gender: e.target.value || null })}
                            style={{ fontSize:13.8, padding:'3px 6px', minWidth:64,
                              background: t.gender ? undefined : 'var(--warn-bg, #FFF6E5)' }}>
                            <option value="">—</option>
                            <option value="f">נקבה</option>
                            <option value="m">זכר</option>
                          </select>
                        ) : (t.gender === 'f' ? 'נקבה' : t.gender === 'm' ? 'זכר' : '—')}
                      </td>
                      <td style={{ textAlign:'center' }} onClick={e => e.stopPropagation()}>
                        {onSaveTeacher ? (
                          <input type="number" min="0" dir="ltr" className="apple-input" inputMode="numeric"
                            key={`slip-kids-${t.id}-${t.childrenUnder18 ?? ''}`}
                            defaultValue={t.childrenUnder18 ?? ''}
                            placeholder="—"
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (t.childrenUnder18 ?? null)) onSaveTeacher({ ...t, childrenUnder18: v }); }}
                            style={{ width:52, textAlign:'center', fontSize:14.4, padding:'3px 5px' }} />
                        ) : (t.childrenUnder18 ?? '—')}
                      </td>
                      <td style={{ textAlign:'center' }}>{r.hours}</td>
                      <td style={{ textAlign:'center', fontWeight:600 }}>{r.pct}%</td>
                      <td style={{ textAlign:'center' }}>{r.kita ? '✓' : ''}</td>
                      <td style={{ textAlign:'center' }}>{money(r.base)}</td>
                      <td style={{ textAlign:'center' }}>{r.paysSupp ? money(r.supp) : '—'}</td>
                      <td style={{ textAlign:'center', fontWeight:800 }}>{money(r.gross)}</td>
                      <td style={{ textAlign:'center' }} onClick={e => e.stopPropagation()}>
                        {onSaveSlipGross ? (
                          <input type="number" min="0" dir="ltr" className="apple-input" inputMode="numeric"
                            key={`slip-gross-${t.id}-${t._slipGross ?? ''}`}
                            defaultValue={t._slipGross ?? ''}
                            placeholder="—"
                            title="מה שיצא בתלוש בפועל — לא נוגע בברוטו של המערכת"
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            onBlur={e => {
                              const v = e.target.value === '' ? null : Math.round(Number(e.target.value));
                              if (v !== (t._slipGross ?? null)) onSaveSlipGross(t.id, v);
                            }}
                            style={{ width:86, textAlign:'center', fontSize:14.4, padding:'3px 5px', fontWeight:700,
                              background: t._slipGross && Math.abs(t._slipGross - r.gross) > 1 ? 'var(--warn-bg)' : undefined }} />
                        ) : (t._slipGross ? money(t._slipGross) : '—')}
                      </td>
                      <td style={{ textAlign:'center' }} onClick={e => e.stopPropagation()}>
                        {onMarkSlip ? (
                          <button className="apple-btn apple-btn-ghost"
                            title={t._slipIssuedAt
                              ? `הוצא ${new Date(t._slipIssuedAt).toLocaleDateString('he-IL')} — לחיצה מבטלת`
                              : 'סימון שהתלוש הוצא'}
                            onClick={() => onMarkSlip(t.id, !t._slipIssuedAt)}
                            style={{ minHeight:30, padding:'0 10px', fontWeight:800,
                              color: t._slipIssuedAt ? 'var(--ok)' : 'var(--text3)' }}>
                            {t._slipIssuedAt ? '✓' : '◻'}
                          </button>
                        ) : (t._slipIssuedAt ? '✓' : '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ background:'var(--apple-fill)', fontWeight:800 }}>
                  <td colSpan={9}>סה"כ {sc.name}</td>
                  <td style={{ textAlign:'center' }}>{money(tot.base)}</td>
                  <td style={{ textAlign:'center' }}>{money(tot.supp)}</td>
                  <td style={{ textAlign:'center' }}>{money(tot.gross)}</td>
                  <td style={{ textAlign:'center' }}>
                    {(() => { const s = live.reduce((a, x) => a + (Number(x.t._slipGross) || 0), 0); return s ? money(s) : '—'; })()}
                  </td>
                  <td style={{ textAlign:'center' }}>{live.filter(x => x.t._slipIssuedAt).length}/{live.length}</td>
                </tr></tfoot>
              </table>
            </div>

            {/* ── מובייל: בלוק לתלוש במקום טבלת 14 העמודות. אותם נתונים
                ואותן פעולות — סימון "הוצא", "יצא בתלוש", מין וילדים —
                והתלוש המלא נפתח בכפתור מפורש במקום בלחיצה על השם. ── */}
            <div className="only-mobile">
              {rows.map(({ t, r }) => r.skip ? (
                <div key={'m-' + t.id} className="slipm">
                  <p style={{ fontWeight:700, fontSize:15.5, color:'var(--text2)' }}>{t.name}</p>
                  {subInfo(t) && <p style={{ fontSize:12.6, fontWeight:600, color:'var(--apple-orange)' }}>{subInfo(t)}</p>}
                  <p style={{ fontSize:13.8, color:'var(--text3)' }}>{r.skip}</p>
                </div>
              ) : (
                <div key={'m-' + t.id} className="slipm">
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
                    <div style={{ minWidth:0 }}>
                      <p style={{ fontWeight:800, fontSize:16.1, color:'var(--text)' }}>
                        {r.principal && <Briefcase size={13} strokeWidth={2.4} style={{ display:'inline', verticalAlign:'-1px', marginInlineEnd:4 }} />}
                        {t.name}
                      </p>
                      <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:1 }}>
                        {r.darga && r.darga !== '—' ? `דרגה ${r.darga} · ` : ''}
                        ותק {r.vetek} · {r.hours} שעות · {r.pct}%{r.kita ? ' · גמול חינוך' : ''}
                      </p>
                      {subInfo(t) && <p style={{ fontSize:12.6, fontWeight:600, color:'var(--apple-orange)' }}>{subInfo(t)}</p>}
                    </div>
                    {onMarkSlip ? (
                      <button className="apple-btn apple-btn-ghost"
                        title={t._slipIssuedAt
                          ? `הוצא ${new Date(t._slipIssuedAt).toLocaleDateString('he-IL')} — לחיצה מבטלת`
                          : 'סימון שהתלוש הוצא'}
                        onClick={() => onMarkSlip(t.id, !t._slipIssuedAt)}
                        style={{ flexShrink:0, fontSize:13.8, fontWeight:700,
                          color: t._slipIssuedAt ? 'var(--ok)' : 'var(--text3)' }}>
                        {t._slipIssuedAt ? '✓ הוצא' : 'סימון הוצא'}
                      </button>
                    ) : (t._slipIssuedAt ? <span style={{ color:'var(--ok)', fontWeight:800 }}>✓</span> : null)}
                  </div>
                  <CardRow label="בסיס עולם ישן">{money(r.base)}</CardRow>
                  {paysSupp && <CardRow label='תוספת בית חב"ד'>{r.paysSupp ? money(r.supp) : '—'}</CardRow>}
                  <CardRow label="ברוטו לתשלום" strong>{money(r.gross)}</CardRow>
                  <div className="mcard-row">
                    <span className="mcard-label" title="הברוטו שיצא בתלוש בפועל — נרשם לצד המספר של המערכת, לא במקומו">יצא בתלוש (₪)</span>
                    {onSaveSlipGross ? (
                      <input type="number" min="0" dir="ltr" className="apple-input" inputMode="numeric"
                        key={`m-slip-gross-${t.id}-${t._slipGross ?? ''}`}
                        defaultValue={t._slipGross ?? ''}
                        placeholder="—"
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        onBlur={e => {
                          const v = e.target.value === '' ? null : Math.round(Number(e.target.value));
                          if (v !== (t._slipGross ?? null)) onSaveSlipGross(t.id, v);
                        }}
                        style={{ width:132, textAlign:'center', fontWeight:700,
                          background: t._slipGross && Math.abs(t._slipGross - r.gross) > 1 ? 'var(--warn-bg)' : undefined }} />
                    ) : <span className="mcard-value num">{t._slipGross ? money(t._slipGross) : '—'}</span>}
                  </div>
                  {onSaveTeacher && (
                    <div style={{ display:'flex', gap:10, padding:'8px 0', borderTop:'1px dashed var(--line-soft)' }}>
                      <label style={{ flex:1 }}>
                        <span className="mcard-label" style={{ display:'block', marginBottom:3 }} title="קובע את תוספת האם: 24 שעות לאם = 90%">מין</span>
                        <select className="apple-select" value={t.gender || ''}
                          onChange={e => onSaveTeacher({ ...t, gender: e.target.value || null })}
                          style={{ fontSize:14.4, background: t.gender ? undefined : 'var(--warn-bg, #FFF6E5)' }}>
                          <option value="">—</option>
                          <option value="f">נקבה</option>
                          <option value="m">זכר</option>
                        </select>
                      </label>
                      <label style={{ flex:1 }}>
                        <span className="mcard-label" style={{ display:'block', marginBottom:3 }}>ילדים עד 18</span>
                        <input type="number" min="0" dir="ltr" className="apple-input" inputMode="numeric"
                          key={`m-slip-kids-${t.id}-${t.childrenUnder18 ?? ''}`}
                          defaultValue={t.childrenUnder18 ?? ''}
                          placeholder="—"
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (t.childrenUnder18 ?? null)) onSaveTeacher({ ...t, childrenUnder18: v }); }}
                          style={{ textAlign:'center', fontSize:14.4 }} />
                      </label>
                    </div>
                  )}
                  {(lines[t.id] || r.principal) && (
                    <button className="apple-btn apple-btn-ghost" onClick={() => setOpenSlip({ t, r })}
                      style={{ width:'100%', marginTop:6, fontSize:14.4 }}>
                      <FileText size={14} strokeWidth={2.2} />
                      התלוש המלא
                    </button>
                  )}
                </div>
              ))}
              <div className="slipm" style={{ background:'var(--fill)', borderRadius:12, padding:'10px 12px', marginTop:10, borderTop:'none' }}>
                <p style={{ fontWeight:800, fontSize:15.5, marginBottom:2 }}>סה"כ {sc.name}</p>
                <CardRow label="בסיס עולם ישן">{money(tot.base)}</CardRow>
                {paysSupp && <CardRow label='תוספת בית חב"ד'>{money(tot.supp)}</CardRow>}
                <CardRow label="ברוטו לתשלום" strong>{money(tot.gross)}</CardRow>
                <CardRow label="תלושים הוצאו">{live.filter(x => x.t._slipIssuedAt).length}/{live.length}</CardRow>
              </div>
            </div>
          </div>
        );
      })}
      <p className="no-print" style={{ fontSize:13.8, color:'var(--text3)' }}>
        ההפרשות: פנסיה וקרן השתלמות על הבסיס בלבד; על התוספת מס שכר וביטוח לאומי בלבד.
        לחיצה על שם עם סמל 📄 פותחת את התלוש המלא.
      </p>
      {openSlip && (() => {
        const { t, r } = openSlip;
        const sl = lines[t.id];
        return (
          <div onClick={() => setOpenSlip(null)} className="print-sheet modal-overlay"
            style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.5)', zIndex:70, overflowY:'auto' }} dir="rtl">
            <div onClick={e => e.stopPropagation()} className="modal-card"
              style={{ maxWidth:560, margin:'26px auto', background:'#fff', borderRadius:14, padding:'22px 26px' }}>
              <div className="no-print" style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                <button className="apple-btn apple-btn-blue" onClick={() => window.print()} style={{ fontSize:14.4 }}>
                  <Printer size={14} strokeWidth={2.2} />הדפסה
                </button>
                <button className="apple-btn apple-btn-ghost" onClick={() => setOpenSlip(null)}>סגירה</button>
              </div>
              <div style={{ textAlign:'center', borderBottom:'2px solid var(--text)', paddingBottom:8, marginBottom:10 }}>
                <p style={{ fontSize:18.4, fontWeight:800 }}>תלוש שכר · {fmtMonthFn ? fmtMonthFn(monthKey) : monthKey}</p>
                <p style={{ fontSize:15.5, fontWeight:600 }}>{t.name}</p>
                {r.principal ? (
                  <p style={{ fontSize:13.8, color:'var(--text2)', fontWeight:600 }}>
                    מנהל/ת בית ספר · 40 שעות שבועיות · משרה מלאה{r.principalCalc ? ' · עולם ישן + גמול ניהול' : ''}
                  </p>
                ) : (<>
                <p style={{ fontSize:13.8, color:'var(--text2)', fontWeight:600 }}>
                  {t.frontalHours} שעות פרונטליות{r.kita ? ' + 3 שעות חינוך (מחנכת)' : ''} = {r.hours} שעות
                </p>
                <p style={{ fontSize:13.8, color:'var(--text2)', fontWeight:600 }}>
                  אחוז משרה עולם ישן: {r.hours}/30 = {r.pct}%
                </p>
                <p style={{ fontSize:13.2, color:'var(--text3)' }}>
                  דרגה {r.darga} · ותק {r.vetek}{r.kita ? ' · גמול חינוך' : ''}
                </p>
                </>)}
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14.4 }}>
                <thead><tr style={{ borderBottom:'1px solid var(--line)', color:'var(--text3)', fontSize:13.2 }}>
                  <th style={{ textAlign:'right', padding:'3px 4px' }}>סמל</th>
                  <th style={{ textAlign:'right', padding:'3px 4px' }}>רכיב</th>
                  <th style={{ textAlign:'left', padding:'3px 4px' }}>סכום</th>
                </tr></thead>
                <tbody>
                  {r.principal && !r.principalCalc && (
                    <tr style={{ borderBottom:'1px solid var(--line)' }}>
                      <td style={{ padding:'4px', color:'var(--text3)', fontSize:13.2 }}></td>
                      <td style={{ padding:'4px' }}>שכר מנהל/ת בית ספר</td>
                      <td style={{ padding:'4px', textAlign:'left', direction:'ltr' }}>{Number(r.base).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  )}
                  {(sl?.lines || []).map((ln, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid var(--line)' }}>
                      <td style={{ padding:'4px', color:'var(--text3)', fontSize:13.2 }}>{ln.code}</td>
                      <td style={{ padding:'4px' }}>{ln.label}</td>
                      <td style={{ padding:'4px', textAlign:'left', direction:'ltr' }}>{Number(ln.amount).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  {(!r.principal || r.principalCalc) && (
                  <tr style={{ borderBottom:'1px solid var(--line)', fontWeight:700 }}>
                    <td style={{ padding:'4px' }}></td>
                    <td style={{ padding:'4px' }}>סה"כ עולם ישן</td>
                    <td style={{ padding:'4px', textAlign:'left', direction:'ltr' }}>{Number(sl?.gross || 0).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  )}
                  {r.paysSupp && (
                    <tr style={{ borderBottom:'1px solid var(--line)' }}>
                      <td style={{ padding:'4px' }}></td>
                      <td style={{ padding:'4px' }}>תוספת בית חב"ד <span style={{ fontSize:13.2, color:'var(--text3)' }}>(שורה קבועה — ללא נלוות)</span></td>
                      <td style={{ padding:'4px', textAlign:'left', direction:'ltr' }}>{(r.principal ? r.supp : Math.max(0, r.gross - (sl?.gross || 0))).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  )}
                  <tr style={{ fontWeight:800, fontSize:15.5, background:'var(--apple-fill)' }}>
                    <td style={{ padding:'6px 4px' }}></td>
                    <td style={{ padding:'6px 4px' }}>ברוטו לתשלום</td>
                    <td style={{ padding:'6px 4px', textAlign:'left', direction:'ltr' }}>{Number(r.paysSupp ? r.gross : (sl?.gross || r.gross)).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
              <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:10 }}>
                הרכיבים כפי שמפיק מחשבון משרד החינוך לנתוני התלוש · הופק ממערכת השכר, רשת גני חב"ד
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ReportView({ schools, teachers, onSaveTeacher, onApprove, simState, onCompute, onDelete }) {
  // לחיצה על שורת בית ספר פותחת את פירוט המשרות שלו. פתוח אחד בכל רגע —
  // הדוח נועד להשוואה בין בתי ספר, לא לקריאה של כולם במקביל.
  const [openSchool, setOpenSchool] = useState(null);
  const rows = schools.map(s => {
    const ts       = teachers.filter(t => t.schoolId === s.id);
    const tsOff    = ts.filter(simComplete);
    const gross    = tsOff.reduce((sum, t) => sum + calcEmployer(t).gross, 0);
    const empTot   = tsOff.reduce((sum, t) => sum + calcEmployer(t).total, 0);
    const pending  = ts.filter(isPending).length;
    const usedHours = schoolHours(ts);   // בלי מנהלת וחל"ד/חל"ת — כמו במסך האישור
    const quota     = Number(s.hoursQuota) || null;
    return { ...s, ts, count: ts.length, officialCount: tsOff.length, gross, empTot,
             annual: empTot * 12, pending, usedHours, quota,
             overHours: quota ? usedHours - quota : null };
  }).sort((a,b) => b.empTot - a.empTot);

  const totGross  = rows.reduce((s,r) => s + r.gross, 0);
  const totEmp    = rows.reduce((s,r) => s + r.empTot, 0);
  const totAnnual = rows.reduce((s,r) => s + r.annual, 0);
  const totCount  = rows.reduce((s,r) => s + r.count, 0);
  const totPending = rows.reduce((s,r) => s + r.pending, 0);
  const totOfficial = rows.reduce((s,r) => s + r.officialCount, 0);
  const totUsedHours = rows.reduce((s,r) => s + r.usedHours, 0);
  const totQuota     = rows.reduce((s,r) => s + (r.quota || 0), 0) || null;
  const totOverHours = rows.reduce((s,r) => s + (r.overHours > 0 ? r.overHours : 0), 0);

  const exportCSV = () => {
    const headers = [
      { key:'name', label:'בית ספר' }, { key:'city', label:'עיר' },
      { key:'count', label:'עובדי הוראה' }, { key:'officialCount', label:'מתוכן עם סימולציה מלאה' },
      { key:'usedHours', label:'שעות בשימוש' }, { key:'quota', label:'מכסת שעות' },
      { key:'overHours', label:'חריגה מהתקן (שעות)' },
      { key:'gross', label:'ברוטו / חודש (₪)' }, { key:'empTot', label:'ברוטו למעסיק (₪)' },
      { key:'annual', label:'עלות שנתית (₪)' }, { key:'pending', label:'ממתינים לאישור' },
    ];
    const body = rows.map(r => ({
      name: r.name, city: r.city || '', count: r.count, officialCount: r.officialCount,
      usedHours: r.usedHours, quota: r.quota || '',
      overHours: r.overHours > 0 ? r.overHours : '',
      gross: r.gross || '', empTot: r.empTot || '', annual: r.annual || '', pending: r.pending,
    }));
    const footer = {
      name: 'סה"כ רשת', count: totCount, officialCount: totOfficial,
      usedHours: totUsedHours, quota: totQuota || '', overHours: totOverHours || '',
      gross: totGross, empTot: totEmp, annual: totAnnual, pending: totPending,
    };
    downloadCSV(headers, body, `דוח_רשת_${stampToday()}.csv`, footer);
  };

  return (
    <div className="page-wrap" style={{ maxWidth:1400 }} dir="rtl">

      <div className="no-print">
        <PageHead
          title="דוח רשת — סימולציית שכר תשפ״ו"
          subtitle={`עלות השכר בכל הרשת, בית ספר מול בית ספר · ${rows.filter(r=>r.count>0).length} בתי ספר · ${totCount} עובדי הוראה`}
          actions={
            <>
              {totPending > 0 && <span className="apple-badge badge-orange"><Bell size={12} strokeWidth={2.3} />{totPending} ממתינים לאישור</span>}
              <button className="apple-btn apple-btn-ghost" onClick={exportCSV} disabled={rows.length === 0} style={{ fontSize:14.9 }}>
                <FileSpreadsheet size={14} strokeWidth={2.2} />
                ייצוא CSV
              </button>
              <button className="apple-btn apple-btn-ghost" onClick={() => window.print()} style={{ fontSize:14.9 }}><Printer size={14} strokeWidth={2.2} />הדפסה</button>
            </>
          }
        />
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(155px, 1fr))', gridAutoRows:'1fr', gap:12, marginBottom:20 }}>
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
      <div>
        <div className="sheet-wrap only-desktop">
          <div className="sheet-scroll" style={{ maxHeight:'none' }}>
          <table className="apple-table sticky-first">
            <thead>
              <tr>
                <th>בית ספר</th>
                <th>עיר</th>
                <th style={{ textAlign:'center' }}>עובדי הוראה</th>
                <th style={{ textAlign:'center' }}>שעות / מכסה</th>
                <th style={{ textAlign:'center' }}>חריגה</th>
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
                  <td style={{ color:'var(--apple-text2)', fontSize:14.9 }}>{r.city||'—'}</td>
                  <td style={{ textAlign:'center', fontWeight:600 }}>
                    {r.count}
                    {r.count > 0 && r.officialCount < r.count && (
                      <span title="מספר עובדי ההוראה שכבר עברו סימולציה" style={{ fontSize:13.2, color:'var(--warn)', fontWeight:600, marginInlineStart:5 }}>
                        ({r.officialCount} רשמי)
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign:'center', fontWeight:600,
                    color: r.quota && r.usedHours > r.quota ? 'var(--danger)'
                         : r.quota && r.usedHours / r.quota >= 0.9 ? 'var(--warn)' : 'var(--text2)' }}>
                    {r.quota ? `${r.usedHours} / ${r.quota}` : (r.usedHours || '—')}
                  </td>
                  <td style={{ textAlign:'center' }}><OverHours over={r.overHours} size={14.9} /></td>
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
                      <SchoolPositions onSaveTeacher={onSaveTeacher} onApprove={onApprove} simState={simState} onCompute={onCompute} onDelete={onDelete} school={r} />
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

        {/* מובייל: כרטיס לכל בית ספר במקום הטבלה הרחבה — אותם נתונים
            (rows), לחיצה פותחת את פירוט המשרות כמו בשורת הטבלה. */}
        <div className="only-mobile">
          {rows.map(r => (
            <div key={'m-' + r.id} className="apple-card mcard"
              onClick={() => r.count > 0 && setOpenSchool(openSchool === r.id ? null : r.id)}
              style={{ cursor: r.count > 0 ? 'pointer' : 'default' }}>
              <div className="mcard-head">
                <div style={{ minWidth:0 }}>
                  <p className="mcard-name">
                    {r.count > 0 && (
                      <ChevronLeft size={14} strokeWidth={2.6} color="var(--purple)"
                        style={{ display:'inline', verticalAlign:'-2px', marginInlineEnd:5,
                                 transform: openSchool === r.id ? 'rotate(-90deg)' : 'none', transition:'transform .15s' }} />
                    )}
                    {r.name}
                  </p>
                  {r.city && <p style={{ fontSize:13.8, color:'var(--text3)' }}>{r.city}</p>}
                </div>
                {r.pending > 0
                  ? <span className="apple-badge badge-orange"><Bell size={12} strokeWidth={2.3} />{r.pending}</span>
                  : <span className="apple-badge badge-green"><Check size={12} strokeWidth={2.8} />מעודכן</span>}
              </div>
              <CardRow label="עובדי הוראה">
                {r.count}
                {r.count > 0 && r.officialCount < r.count && (
                  <span style={{ fontSize:13.2, color:'var(--warn)', fontWeight:600, marginInlineStart:5 }}>
                    ({r.officialCount} רשמי)
                  </span>
                )}
              </CardRow>
              <CardRow label="שעות / מכסה"
                color={r.quota && r.usedHours > r.quota ? 'var(--danger)'
                     : r.quota && r.usedHours / r.quota >= 0.9 ? 'var(--warn)' : 'var(--text2)'}>
                {r.quota ? `${r.usedHours} / ${r.quota}` : (r.usedHours || '—')}
              </CardRow>
              <CardRow label="חריגה מהתקן"><OverHours over={r.overHours} size={14.9} /></CardRow>
              <CardRow label="ברוטו / חודש">{r.gross > 0 ? r.gross.toLocaleString('he-IL') + ' ₪' : '—'}</CardRow>
              <CardRow label="ברוטו למעסיק">{r.empTot > 0 ? r.empTot.toLocaleString('he-IL') + ' ₪' : '—'}</CardRow>
              <CardRow label="עלות שנתית" strong color="var(--purple)">
                {r.annual > 0 ? r.annual.toLocaleString('he-IL') + ' ₪' : '—'}
              </CardRow>
              {openSchool === r.id && (
                <div onClick={e => e.stopPropagation()}
                  style={{ margin:'8px -16px -10px', background:'var(--bg)', borderTop:'1px solid var(--line)', cursor:'default' }}>
                  <SchoolPositions onSaveTeacher={onSaveTeacher} onApprove={onApprove} simState={simState} onCompute={onCompute} onDelete={onDelete} school={r} />
                </div>
              )}
            </div>
          ))}
          <div className="apple-card mcard" style={{ background:'var(--fill)' }}>
            <p className="mcard-name" style={{ marginBottom:4 }}>סה״כ רשת</p>
            <CardRow label="עובדי הוראה">{totCount}</CardRow>
            <CardRow label="שעות / מכסה">{totUsedHours}{totQuota ? ` / ${totQuota}` : ''}</CardRow>
            <CardRow label="ברוטו / חודש">{totGross.toLocaleString('he-IL')} ₪</CardRow>
            <CardRow label="ברוטו למעסיק">{totEmp.toLocaleString('he-IL')} ₪</CardRow>
            <CardRow label="עלות שנתית" strong color="var(--purple)">{totAnnual.toLocaleString('he-IL')} ₪</CardRow>
            {totPending > 0 && <CardRow label="ממתינים לאישור" color="var(--warn)">{totPending}</CardRow>}
          </div>
        </div>
        <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:10, padding:'0 4px', lineHeight:1.7 }}>
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
          width:18, height:18, borderRadius:'50%', flexShrink:0, fontSize:13.2, fontWeight:800,
          display:'flex', alignItems:'center', justifyContent:'center',
          background: value ? 'var(--ok)' : active ? 'var(--purple)' : 'var(--fill2)',
          color: (value || active) ? '#fff' : 'var(--text3)',
        }}>{value ? '✓' : n}</span>
        <span style={{ fontSize:13.8, fontWeight:700, color:'var(--text2)' }}>{label}</span>
        {active && <span style={{ fontSize:13.2, color:'var(--purple)' }}>← {calcLabel}</span>}
      </div>
      <input type="number" className="apple-input" dir="ltr" autoFocus={autoFocus} ref={inputRef}
        placeholder={`שכר משולב מ${calcLabel}`}
        value={value}
        onFocus={onFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
        style={{ fontSize:16.1, minHeight:38, borderColor: active ? 'var(--purple)' : undefined }} />
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
  /*
    "נעלם לי עמוד חשוב — כל בתי הספר" (שרה, 4.9): שמונה שורות המעקב
    דחפו את כרטיסי בתי הספר אל מתחת לקצה המסך. המעקב מקופל לשורת
    סיכום; נפתח בלחיצה — או לבד כשיש ממתינים. ה-hook כאן למעלה,
    לפני ה-return המוקדם — אחרת React מפיל את הדף (שגיאה #310).
  */
  const [openList, setOpenList] = useState(false);

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

  if (err)   return <p style={{ fontSize:14.4, color:'var(--danger)' }}>{err}</p>;
  if (!rows) return <p style={{ padding:20, fontSize:15.5, color:'var(--text3)' }}>טוען…</p>;

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

  const showList = openList || waiting > 0;

  return (
    <div className="apple-card" style={{ padding:'14px 16px', marginBottom:14 }}>
      <div onClick={() => setOpenList(v => !v)}
        style={{ display:'flex', alignItems:'center', gap:9, flexWrap:'wrap', cursor:'pointer' }}>
        <ChevronLeft size={15} strokeWidth={2.4} style={{ color:'var(--text3)', transform: showList ? 'rotate(-90deg)' : 'none', transition:'transform .15s' }} />
        <ClipboardCheck size={15} strokeWidth={2.3} color="var(--purple)" />
        <p style={{ fontSize:15.5, fontWeight:700, color:'var(--text)' }}>מעקב מילוי — {fmtMonth(month)}</p>
        <span style={{ fontSize:13.2, color: waiting ? '#E65100' : 'var(--text3)', fontWeight: waiting ? 700 : 400 }}>
          {waiting ? `${waiting} ממתינים לך` : 'כל בתי הספר סיימו'} · {totalT} הוזנו
        </span>
        <button onClick={e => { e.stopPropagation(); load(); }} title="רענון"
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:13.2, padding:0, marginInlineStart:'auto' }}>
          רענון
        </button>
      </div>

      {showList && (
      <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:11 }}>
        {list.map(r => (
          <button key={r.schoolId} onClick={() => onOpenSchool?.(r.schoolId)} className="fill-row"
            style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 10px', background:'var(--fill)',
              border:'none', borderRadius:10, cursor:'pointer', textAlign:'right', fontFamily:'inherit', width:'100%' }}>
            <span className={`apple-badge badge-${r.st.tone}`} style={{ fontSize:13.2, padding:'2px 8px', flexShrink:0, minWidth:96, justifyContent:'center' }}>
              {r.st.label}
            </span>
            <span className="fill-name" style={{ flex:1, minWidth:0, fontSize:14.9, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {name(r.schoolId)}
              {r.principal && <span style={{ fontWeight:400, color:'var(--text3)' }}> · {r.principal}</span>}
            </span>
            <span style={{ fontSize:13.2, color:'var(--text3)', flexShrink:0 }}>
              {r.teachers > 0 && `${r.teachers} עובדים`}
              {r.ago && ` · ${r.ago}`}
            </span>
          </button>
        ))}
      </div>
      )}
    </div>
  );
}

function MonthDocuments({ monthKey, schools = [], schoolId = null, userRole, userId, title }) {
  // null = עוד לא נטען. "אין עדיין מסמכים" בזמן טעינה הוא מצב-ריק
  // שקרי — מהסוג שכבר שיקר פעם בפורטל (הבודקת, 2.9).
  const [docs, setDocs] = useState(null);
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
        <p style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>
          {title || `מסמכים מהנהלת החשבונות — ${fmtMonth(monthKey)}`}
        </p>
        {(docs?.length ?? 0) > 0 && <span className="apple-badge badge-purple" style={{ fontSize: 13.2, padding: '2px 8px' }}>{docs.length}</span>}
      </div>
      <p style={{ fontSize: 13.2, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.6 }}>
        דוח השכר, סיכום עלות מעביד או כל קובץ שיצא ממערכת השכר. גלוי לרשת, לחשבת השכר ולמאשרות — לא למנהלות.
      </p>

      {canWrite && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          {!schoolId && (
            <select className="apple-select" value={pickSchool} onChange={e => setPickSchool(e.target.value)} style={{ fontSize: 14.4, minHeight: 36 }}>
              <option value="">כל בתי הספר</option>
              {schools.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          <input className="apple-input" value={note} onChange={e => setNote(e.target.value)}
            placeholder="הערה (לא חובה)" style={{ fontSize: 14.4, minHeight: 36, flex: '1 1 160px' }} />
          <label className="apple-btn apple-btn-blue" style={{ minHeight: 36, fontSize: 14.4, cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1 }}>
            <Upload size={14} strokeWidth={2.3} />
            {busy ? 'מעלה…' : 'העלאת קובץ'}
            <input ref={fileRef} type="file" onChange={onPick} disabled={busy} style={{ display: 'none' }}
              accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.png,.jpg,.jpeg" />
          </label>
        </div>
      )}
      {err && <p style={{ fontSize: 13.8, color: 'var(--danger)', marginBottom: 8 }}>{err}</p>}

      {docs === null ? (
        <p style={{ fontSize: 15.5, color: 'var(--text3)' }}>טוען…</p>
      ) : docs.length === 0 ? (
        <p style={{ fontSize: 14.4, color: 'var(--text3)' }}>אין עדיין מסמכים לחודש הזה.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'var(--fill)', borderRadius: 10 }}>
              <FileText size={15} strokeWidth={2.2} color="var(--text3)" />
              <button onClick={() => open(d)} title="פתיחה"
                style={{ flex: 1, minWidth: 0, textAlign: 'right', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                <p style={{ fontSize: 14.9, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fileName}</p>
                <p style={{ fontSize: 13.2, color: 'var(--text3)' }}>
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
      const msg = `שלום ${first}, זה הקישור האישי שלך למערכת השכר של עובדי ההוראה — ${school.name}:\n${link}\n\nהקישור אישי; לא להעביר הלאה.`;
      const wa  = pr.phone ? `https://wa.me/${pr.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}` : null;
      setSt({ link, wa });
    } catch (e) { setSt({ error: e.message }); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(st.link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt('העתיקי את הקישור:', st.link); }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(26,11,53,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)', overflowY: 'auto' }} dir="rtl" onClick={onClose}>
      <div className="apple-card modal-card" style={{ width: '100%', maxWidth: 420, padding: 24 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 19.5, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>קישור אישי — {school.name}</h2>
        {st.error && <p style={{ fontSize: 14.9, color: 'var(--danger)', lineHeight: 1.6 }}>{st.error}</p>}
        {pr && (
          <p style={{ fontSize: 14.9, color: 'var(--text2)', marginBottom: 12 }}>
            {pr.fullName}{pr.phone ? ` · ${pr.phone.replace('+972', '0')}` : ' · אין טלפון על הפרופיל'}
          </p>
        )}
        {pr && !st.link && (
          <>
            <button className="apple-btn apple-btn-blue" onClick={issue} disabled={st.loading} style={{ width: '100%', minHeight: 42 }}>
              <MessageCircle size={15} strokeWidth={2.3} />
              {st.loading ? 'מנפיק…' : 'הנפקת קישור חדש'}
            </button>
            <p style={{ fontSize: 13.2, color: 'var(--text3)', marginTop: 10, lineHeight: 1.6 }}>
              הקישור הקודם שלה יבוטל. מי שמחזיק בקישור נכנס בשמה — לשלוח רק לה.
            </p>
          </>
        )}
        {st.link && (
          <>
            <input readOnly value={st.link} dir="ltr" className="apple-input" onFocus={e => e.target.select()}
              style={{ fontSize: 13.8, marginBottom: 12, fontFamily: 'monospace' }} />
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
            <p style={{ fontSize: 13.2, color: 'var(--text3)', marginTop: 12, lineHeight: 1.6 }}>
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
      <p style={{ fontSize:16.1, fontWeight:700, color:'var(--text)' }}>אין עדיין עובדי הוראה עם סימולציה בחודש הזה</p>
      <p style={{ fontSize:14.4, color:'var(--text3)', marginTop:4 }}>עלות בפועל מוזנת אחרי שהשכר חושב.</p>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <p style={{ fontSize:13.8, color:'var(--text3)', lineHeight:1.6 }}>
        הסכום מהנהלת החשבונות מחליף את האומדן בכל מקום — בדוחות, אצל השליח ואצל המאשרת.
        ריק = חזרה לאומדן. {missing > 0 ? `${missing} ללא עלות בפועל.` : 'לכולן יש עלות בפועל.'}
      </p>
      {bySchool.map(({ school, list }) => (
        <div key={school.id}>
          <div style={{ fontSize:13.8, fontWeight:700, color:'var(--purple)', marginBottom:8, padding:'5px 11px', background:'var(--purple-100)', border:'1px solid #D8CEEF', borderRadius:999, display:'inline-flex', alignItems:'center', gap:6 }}>
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
                    <p style={{ fontSize:15.5, fontWeight:600, color:'var(--text)' }}>
                      {t.name}
                      {subInfo(t) && (
                        <span style={{ fontWeight:600, fontSize:12.6, color:'var(--apple-orange)' }}>{` · ${subInfo(t)}`}</span>
                      )}
                    </p>
                    <p style={{ fontSize:13.2, color:'var(--text3)' }}>
                      אומדן {emp.estimate.toLocaleString('he-IL')} ₪ ({emp.pct}%)
                      {diff !== null && <span style={{ marginInlineStart:6, color: Math.abs(diff) > 10 ? 'var(--warn)' : 'var(--text3)' }}>· בפועל {diff > 0 ? '+' : ''}{diff}%</span>}
                    </p>
                  </div>
                  <input type="number" inputMode="numeric" className="apple-input" dir="ltr" placeholder="עלות בפועל"
                    value={cur}
                    onChange={e => setVals(v => ({ ...v, [t.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(t); } }}
                    style={{ width:130, fontSize:16.1, minHeight:38, textAlign:'center' }} />
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
   ייבוא תלוש — קובץ מהנהלת החשבונות במקום הקלדה שורה-שורה

   "תן לה להעלות מסמך והמערכת תתעדכן" (שרה, 7.9). החשבת בוחרת קובץ,
   רואה מה זוהה ומה לא, ורק אז מאשרת. שום דבר לא נכתב לפני הלחיצה.
   הפענוח וההצלבה ב-lib/slipImport.js; הכתיבה ב-store.importSlip.
═══════════════════════════════════════════════════════════════ */
function SlipImportPanel({ teachers, schools, monthKey, onImport }) {
  const [pickSchool, setPickSchool] = useState('');
  const [file, setFile]   = useState(null);
  const [res, setRes]     = useState(null);   // תוצאת ההצלבה, לפני כתיבה
  const [err, setErr]     = useState('');
  const [busy, setBusy]   = useState(false);
  const [done, setDone]   = useState(null);   // כמה נכתבו
  const fileRef = useRef(null);
  const money = v => (v == null ? '—' : Math.round(v).toLocaleString('he-IL') + ' ₪');

  const onPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(''); setDone(null); setRes(null); setFile(f);
    try {
      const buf = await f.arrayBuffer();
      const { rows, mode } = parseRows(readSheet(buf), schools.map(s => s.name));
      if (!rows.length) throw new Error('לא נמצאו בקובץ שורות עם שם ומספרים');
      const m = matchRows(rows, teachers.filter(t => !unpaidThisMonth(t)), { schoolId: pickSchool || null });
      setRes({ ...m, mode, rows: rows.length });
    } catch (ex) { setErr(ex.message); setFile(null); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  const writable = res ? res.matched.filter(m => m.gross != null || m.actual != null) : [];
  const apply = async () => {
    if (!writable.length) return;
    setBusy(true);
    const ok = await onImport(writable.map(m => ({ id: m.teacher.id, name: m.teacher.name, gross: m.gross, actual: m.actual })), file,
      `ייבוא תלוש: ${writable.length} שורות עודכנו`);
    setBusy(false);
    if (ok) { setDone(writable.length); setRes(null); setFile(null); }
  };

  const howLabel = { tz: 'לפי ת.ז.', name: 'לפי שם', 'name-partial': 'לפי שם, חלקי' };
  const [showAllMissing, setShowAllMissing] = useState(false);
  // "בלי שורה בקובץ" — רק מבתי הספר שהקובץ נוגע בהם. קובץ של בית ספר
  // אחד מול "כל בתי הספר" הציף 87 שמות שאינם עניינו.
  const missing = (() => {
    if (!res) return [];
    const touched = new Set(res.matched.map(m => m.teacher.schoolId));
    const list = touched.size ? res.unmatchedTeachers.filter(t => touched.has(t.schoolId)) : res.unmatchedTeachers;
    return list;
  })();
  const num = v => <span style={{ whiteSpace:'nowrap' }}>{money(v)}</span>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <p style={{ fontSize:13.8, color:'var(--text3)', lineHeight:1.6 }}>
        קובץ מרכז מהנהלת החשבונות — אקסל או CSV, עם או בלי כותרות. המערכת מזהה שם, ברוטו ועלות מעביד,
        מצליבה מול עובדות {fmtMonth(monthKey)} ומראה מה נמצא. הברוטו והעלות נכתבים רק אחרי אישור.
      </p>

      <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
        <select className="apple-select" value={pickSchool} onChange={e => { setPickSchool(e.target.value); setRes(null); }} style={{ fontSize:14.4, minHeight:36 }}>
          <option value="">כל בתי הספר</option>
          {schools.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <label className="apple-btn apple-btn-blue" style={{ minHeight:36, fontSize:14.4, cursor:'pointer' }}>
          <FileSpreadsheet size={14} strokeWidth={2.3} />
          {file ? file.name : 'בחירת קובץ'}
          <input ref={fileRef} type="file" onChange={onPick} style={{ display:'none' }} accept=".xlsx,.xls,.csv" />
        </label>
      </div>
      {err && <p style={{ fontSize:13.8, color:'var(--danger)' }}>{err}</p>}
      {done != null && (
        <div className="apple-card" style={{ padding:'12px 14px', background:'var(--ok-bg)', display:'flex', gap:8, alignItems:'center' }}>
          <Check size={16} strokeWidth={2.4} color="var(--ok)" />
          <p style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>{done} שורות עודכנו. הברוטו והעלות בפועל מופיעים עכשיו בכל הדוחות.</p>
        </div>
      )}

      {res && (
        <>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
            <span className="apple-badge badge-purple" style={{ fontSize:13.2 }}>{res.matched.length} הוצלבו מתוך {res.rows}</span>
            {res.unmatchedRows.length > 0 && <span className="apple-badge" style={{ fontSize:13.2, background:'#FFF9EF', border:'1px solid #F3E3C2', color:'#B4650A' }}>{res.unmatchedRows.length} בקובץ בלי עובדת</span>}
            {missing.length > 0 && <span className="apple-badge" style={{ fontSize:13.2 }}>{missing.length} עובדות בלי שורה בקובץ</span>}
            {res.mode === 'guess' && <span style={{ fontSize:13.2, color:'var(--text3)' }}>בלי כותרות — העמודות זוהו לפי המספרים, בדקי שהברוטו נכון</span>}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {res.matched.map(m => {
              const skip = m.gross == null && m.actual == null;
              const jump = m.prevGross && m.gross ? Math.round((m.gross / m.prevGross - 1) * 100) : null;
              return (
                <div key={m.teacher.id} className="apple-card" style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', opacity: skip ? .55 : 1 }}>
                  <div style={{ flex:'1 1 170px', minWidth:0 }}>
                    <p style={{ fontSize:15.5, fontWeight:600, color:'var(--text)' }}>
                      {m.teacher.name}
                      <span style={{ fontWeight:500, fontSize:12.6, color:'var(--text3)', marginInlineStart:6 }}>{howLabel[m.how]}{m.how !== 'tz' && m.row.name !== m.teacher.name ? ` · בקובץ: ${m.row.name}` : ''}</span>
                    </p>
                    <p style={{ fontSize:13.2, color:'var(--text3)' }}>
                      {skip ? (m.left ? 'ברוטו 0 בקובץ — עזבה? לא מעדכנים' : 'אין ברוטו בשורה — לא מעדכנים')
                        : <>ברוטו {num(m.prevGross)} ← <b style={{ color:'var(--text)', whiteSpace:'nowrap' }}>{money(m.gross)}</b>
                            {jump != null && Math.abs(jump) >= 10 && <span style={{ color:'#B4650A', marginInlineStart:6 }}>{jump > 0 ? '+' : ''}{jump}%</span>}
                            {m.actual != null && <> · <span style={{ whiteSpace:'nowrap' }}>עלות מעל הברוטו <b style={{ color:'var(--text)' }}>{money(m.actual)}</b></span></>}</>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {res.unmatchedRows.length > 0 && (
            <div className="apple-card" style={{ padding:'10px 12px' }}>
              <p style={{ fontSize:13.8, fontWeight:700, color:'var(--text)', marginBottom:4 }}>בקובץ, בלי עובדת תואמת בחודש</p>
              <p style={{ fontSize:13.2, color:'var(--text3)', lineHeight:1.7 }}>
                {res.unmatchedRows.map(r => `${r.name}${r.gross ? ` (${money(r.gross)})` : ''}`).join(' · ')}
              </p>
              <p style={{ fontSize:12.6, color:'var(--text3)', marginTop:4 }}>שם שכתוב אחרת במערכת, או עובדת שאינה בחודש הזה. אפשר לתקן את השם בכרטיס העובדת ולייבא שוב.</p>
            </div>
          )}
          {missing.length > 0 && (
            <div className="apple-card" style={{ padding:'10px 12px' }}>
              <p style={{ fontSize:13.8, fontWeight:700, color:'var(--text)', marginBottom:4 }}>
                במערכת, בלי שורה בקובץ <span style={{ fontWeight:500, color:'var(--text3)' }}>· {missing.length}</span>
              </p>
              <p style={{ fontSize:13.2, color:'var(--text3)', lineHeight:1.7 }}>
                {(showAllMissing ? missing : missing.slice(0, 12)).map(t => t.name).join(' · ')}
                {missing.length > 12 && !showAllMissing && (
                  <button onClick={() => setShowAllMissing(true)} style={{ background:'none', border:'none', color:'var(--purple)', fontWeight:600, fontSize:13.2, cursor:'pointer', padding:0, marginInlineStart:6 }}>
                    ועוד {missing.length - 12}
                  </button>
                )}
              </p>
            </div>
          )}

          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <button className="apple-btn apple-btn-blue" onClick={apply} disabled={busy || !writable.length} style={{ minHeight:44, padding:'0 18px', fontSize:15.5, flex:'1 1 220px' }}>
              {busy ? 'מעדכנת…' : `עדכון ${writable.length} עובדות`}
            </button>
            <button className="apple-btn apple-btn-ghost" onClick={() => { setRes(null); setFile(null); }} disabled={busy} style={{ minHeight:44 }}>ביטול</button>
            <span style={{ fontSize:12.6, color:'var(--text3)', flexBasis:'100%' }}>הקובץ נשמר גם במסמכי החודש.</span>
          </div>
        </>
      )}
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
  const [q, setQ] = useState('');

  /*
    "תן לי אפשרות לשנות עכשיו את אחוזי המשרה" (שרה, 8.9). "כל העובדות"
    סינן isPending — ומכיוון ש-83 מ-85 השורות כבר מאושרות, המצב הזה
    הציג עובדת אחת ונראה שבור. אחוז משרה אינו נעול אחרי אישור: שינוי
    שלו מחזיר את השורה לאישור מחדש דרך הטריגר, וזה בדיוק הרצוי.
  */
  const missing = teachers.filter(scopeMissing);
  const all = teachers.filter(t => !isPrincipalRow(t) && !unpaidThisMonth(t));
  const term = q.trim();
  const rows = (showAll ? all : missing)
    .filter(t => !term || String(t.name || '').includes(term) || String(t.tzId || '').includes(term));
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
      <p style={{ fontSize:17.2, fontWeight:700, color:'var(--text)' }}>כל אחוזי המשרה נקבעו</p>
      <p style={{ fontSize:14.9, color:'var(--text3)', marginTop:3 }}>אפשר לעבור להזנת השכר הרשמי</p>
      {!showAll && (
        <button className="apple-btn apple-btn-ghost" onClick={() => setShowAll(true)}
          style={{ marginTop:14, minHeight:36, fontSize:14.4 }}>
          לשינוי אחוז שכבר נקבע
        </button>
      )}
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
        <p style={{ fontSize:13.8, color:'var(--text3)', lineHeight:1.6, flex:'1 1 220px' }}>
          {showAll
            ? `${rows.length} עובדות — כולל מי שאחוזה כבר נקבע ומי שכבר אושרה. הקלדה דורסת את הקיים.`
            : `${rows.length} עובדות שאחוז המשרה שלהן עדיין ברירת המחדל — 100 שאיש לא בחר.`}
          {' '}הקלדה כאן לפני הסימולציה; אחריה היא מוחקת את השכר שהוזן{showAll ? ' ומחזירה את השורה לאישור' : ''}.
        </p>
        <div className="apple-seg" style={{ flexShrink:0 }}>
          <button onClick={() => setShowAll(false)}
            className={['apple-seg-item', !showAll ? 'active' : ''].join(' ')}
            style={{ padding:'5px 11px', fontSize:13.8 }}>
            {`ממתינות (${missing.length})`}
          </button>
          <button onClick={() => setShowAll(true)}
            className={['apple-seg-item', showAll ? 'active' : ''].join(' ')}
            style={{ padding:'5px 11px', fontSize:13.8 }}>
            {`כל העובדות (${all.length})`}
          </button>
        </div>
      </div>
      {showAll && (
        <div style={{ position:'relative' }}>
          <Search size={15} strokeWidth={2.2} color="var(--text3)"
            style={{ position:'absolute', insetInlineStart:11, top:'50%', transform:'translateY(-50%)' }} />
          <input className="apple-input" value={q} onChange={e => setQ(e.target.value)}
            placeholder="חיפוש לפי שם או ת.ז."
            style={{ width:'100%', minHeight:40, fontSize:15.5, paddingInlineStart:34 }} />
        </div>
      )}
      {bySchool.map(({ school, list }) => (
        <div key={school.id}>
          <div style={{ fontSize:13.8, fontWeight:700, color:'var(--purple)', marginBottom:8, padding:'5px 11px', background:'var(--purple-100)', border:'1px solid #D8CEEF', borderRadius:999, display:'inline-flex', alignItems:'center', gap:6 }}>
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
                  <p style={{ fontSize:15.5, fontWeight:600, color:'var(--text)', marginBottom:2 }}>
                    {t.name}
                    <span style={{ fontWeight:400, fontSize:13.2, color:'var(--text3)' }}>
                      {' · '}{reformLabel(t.reform)}
                      {` · ${DEGREE_LABELS[t.degree] || t.degree || 'בלי תואר'}`}
                      {` · ${t.seniority ?? 1} שנות ותק`}
                      {hasSim && <span style={{ color:'var(--warn)', fontWeight:700 }}> · יש סימולציה — שינוי יאפס אותה</span>}
                    </span>
                  </p>
                  {/* הגמול משנה את האחוז — מחנכת מקבלת 3 שעות מעליו, ושאר
                      הגמולים אחוז מהשכר. בלי לראות אותו אי אפשר להחליט. */}
                  <p style={{ fontSize:13.2, color:'var(--text3)', marginBottom:4 }}>
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
                      <span style={{ fontSize:13.2, color: t.gender ? 'var(--text3)' : 'var(--warn)', fontWeight: t.gender ? 400 : 700 }}>
                        {`${t.childrenUnder18} ילדים עד 18 · `}
                        {t.gender === 'f' ? 'אֵם' : t.gender === 'm' ? 'גבר — אין תוספת אם' : 'מי היא?'}
                        {t.gender === 'f' && isOfek ? ' — רלוונטי לאחוז בעולם הישן' : ''}
                        {!t.gender ? ' בלי זה אין תוספת אם' : ''}
                      </span>
                      {[{ v:'f', l:'אישה' }, { v:'m', l:'גבר' }].map(o => (
                        <button key={o.v} onClick={() => saveGender(t, o.v)}
                          className={`apple-btn ${t.gender === o.v ? 'apple-btn-blue' : 'apple-btn-ghost'}`}
                          style={{ minHeight:28, padding:'0 11px', fontSize:13.2 }}>
                          {o.l}
                        </button>
                      ))}
                      {flash[`${t.id}|gender`] && <span style={{ fontSize:13.2, color:'var(--ok)', fontWeight:700 }}>✓</span>}
                    </div>
                  )}
                  {fields.map(f => {
                    const key = `${t.id}|${f.which}`;
                    const cur = vals[key] ?? '';
                    return (
                      <div key={f.which} style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginTop:6 }}>
                        <div style={{ flex:'1 1 150px', minWidth:0 }}>
                          <p style={{ fontSize:13.8, fontWeight:600, color: f.done ? 'var(--text2)' : 'var(--warn)' }}>
                            {f.label}
                            {f.done && <span style={{ color:'var(--ok)', fontWeight:700 }}>{` · ${f.now}%`}</span>}
                            {flash[key] && <span style={{ marginInlineStart:6, fontSize:13.2, color:'var(--ok)', fontWeight:700 }}>✓ נקבע</span>}
                          </p>
                          <p style={{ fontSize:13.2, color:'var(--text3)' }}>{f.hint}</p>
                        </div>
                        <input type="number" inputMode="numeric" className="apple-input" dir="ltr" placeholder="%"
                          value={cur}
                          onChange={e => setVals(v => ({ ...v, [key]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(t, f.which, cur); } }}
                          style={{ width:82, fontSize:16.1, minHeight:36, textAlign:'center' }} />
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
                            style={{ minHeight:36, padding:'0 11px', fontSize:13.8 }}>
                            {`לפי השעות · ${f.sugg}%`}
                          </button>
                        )}
                        <button className="apple-btn apple-btn-ghost" onClick={() => save(t, f.which, 100)}
                          style={{ minHeight:36, padding:'0 11px', fontSize:13.8 }}>
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

  // מצבי טעינה ושגיאה יושבים באותה מעטפת עמוד — המסך לא קופץ כשהרשימה מגיעה
  if (err || !rows) return (
    <div className="page-wrap" style={{ maxWidth:820 }} dir="rtl">
      <PageHead title="התראות" />
      <p style={{ fontSize:14.9, color: err ? 'var(--danger)' : 'var(--text3)', padding:'8px 0' }}>
        {err || 'טוען…'}
      </p>
    </div>
  );

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
    <div className="fade-in page-wrap" style={{ maxWidth:820 }} dir="rtl">
      <PageHead
        title="התראות"
        subtitle="כל התראה שהמערכת הפיקה נשמרת כאן, גם אחרי שנשלחה בוואטסאפ. הוואטסאפ נעלם בין הודעות; זה נשאר."
      />

      <div className="apple-seg" style={{ marginBottom:14 }}>
        <button onClick={() => setTab('mine')} className={['apple-seg-item', tab === 'mine' ? 'active' : ''].join(' ')}
          style={{ padding:'6px 13px', fontSize:14.9 }}>
          אליי{unread ? ` (${unread})` : ''}
        </button>
        <button onClick={() => setTab('sent')} className={['apple-seg-item', tab === 'sent' ? 'active' : ''].join(' ')}
          style={{ padding:'6px 13px', fontSize:14.9 }}>
          מה שנשלח ({sent.length})
        </button>
      </div>

      {list.length === 0 && (
        <p style={{ fontSize:14.9, color:'var(--text3)', textAlign:'center', padding:'40px 0' }}>
          {tab === 'mine' ? 'אין התראות' : 'טרם נשלחו הודעות'}
        </p>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {list.map(n => (
          <div key={n.id} className="apple-card" onClick={() => markRead(n)}
            style={{ padding:'12px 14px', cursor: n.readAt || tab !== 'mine' ? 'default' : 'pointer',
                     borderRight: !n.readAt && tab === 'mine' ? '3px solid var(--purple)' : '3px solid transparent' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
              <span style={{ fontSize:14.9, fontWeight:700, color:'var(--text)' }}>
                {KIND_LABEL[n.kind] || n.kind}
              </span>
              {tab === 'sent' && (
                <span className={`apple-badge badge-${n.status === 'sent' ? 'green' : n.status === 'failed' ? 'orange' : 'purple'}`}
                  style={{ fontSize:13.2, padding:'2px 8px' }}>
                  {n.status === 'sent' ? 'נשלח' : n.status === 'failed' ? 'נכשל' : 'ממתין'} · {n.toName || ''}
                </span>
              )}
              <span style={{ fontSize:13.2, color:'var(--text3)', marginInlineStart:'auto' }}>{when(n.createdAt)}</span>
            </div>
            <p style={{ fontSize:14.4, color:'var(--text2)', whiteSpace:'pre-wrap', lineHeight:1.6 }}>{n.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── בקשת טפסים מעובדי ההוראה ────────────────────────────────────────
   "לאחר אישור שלי תשלח לכל המורות הודעה על מילוי טפסים — 101, נתוני
   העסקה, הסכם. רק מי שתשלח תקבל שכר בחודש הבא" (שרה, 1.9), ובלחיצה
   ולא באוטומציה. לכן הכפתור כאן, ליד האישורים, ולא ב-cron.
*/
function FormsRequest({ teachers, monthKey }) {
  const [busy, setBusy] = useState(false);
  const [res,  setRes]  = useState(null);
  const [err,  setErr]  = useState('');

  const approved = teachers.filter(t => t._approved && !unpaidThisMonth(t) && t.name);
  if (!approved.length) return null;

  const send = async () => {
    setBusy(true); setErr(''); setRes(null);
    try { setRes(await store.requestTeacherForms(monthKey)); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="apple-card" style={{ padding:'12px 14px', marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <Send size={15} strokeWidth={2.3} color="var(--purple)" />
        <div style={{ flex:'1 1 220px', minWidth:0 }}>
          <p style={{ fontSize:14.4, fontWeight:700, color:'var(--text)' }}>בקשת טפסים מעובדי ההוראה</p>
          <p style={{ fontSize:13.2, color:'var(--text3)', lineHeight:1.6 }}>
            טופס 101, נתוני העסקה והסכם — קישור אישי לכל אחת.
            {` ${approved.length} עובדי הוראה שאושרו החודש.`} רק מי שישלים/תשלים — השכר בחודש הבא ישולם.
          </p>
        </div>
        <button className="apple-btn apple-btn-blue" onClick={send} disabled={busy}
          style={{ minHeight:38, padding:'0 16px', fontSize:14.4 }}>
          {busy ? 'שולח…' : 'שליחה לעובדי ההוראה'}
        </button>
      </div>
      {err && <p style={{ fontSize:13.2, color:'var(--danger)', marginTop:8 }}>{err}</p>}
      {res && (
        <p style={{ fontSize:13.2, marginTop:8, color: res.queued ? 'var(--ok)' : 'var(--text3)', fontWeight:600 }}>
          {res.queued ? `${res.queued} הודעות נשלחות` : 'לא נשלחו הודעות חדשות'}
          {res.done ? ` · ${res.done} כבר השלימו` : ''}
          {res.noPhone ? ` · ${res.noPhone} בלי נייד — לא ניתן לשלוח אליהן` : ''}
        </p>
      )}
    </div>
  );
}

/*
  מסירת התלושים — "כשחשבת שכר מסיימת לכתוב תלושים תהיה לה אפשרות
  להודיע לי, וכשאסיים לעבור אכתוב לה שאושר" (שרה, 4.9).
  שתי חותמות על החודש; ההודעות יוצאות בוואטסאפ דרך תור המערכת.
*/
function SlipsHandoff({ monthKey, role }) {
  const [st, setSt]   = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(() => store.monthHandoff(monthKey).then(setSt).catch(e => setErr(e.message)), [monthKey]);
  useEffect(() => { load(); }, [load]);
  if (!st) return null;
  const act = async a => {
    setBusy(true); setErr('');
    try { await store.slipsHandoff(monthKey, a); await load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const fmt = iso => new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  const card = (bg, line, children) => (
    <div className="apple-card" style={{ padding: '12px 14px', marginBottom: 14, background: bg, borderColor: line }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{children}</div>
      {err && <p style={{ fontSize: 13.2, color: 'var(--danger)', marginTop: 6 }}>{err}</p>}
    </div>
  );
  if (role === 'clerk') {
    if (st.approvedAt) return card('#E8F5E9', '#A5D6A7', <>
      <Check size={15} strokeWidth={2.6} color="#2e7d32" />
      <p style={{ fontSize: 14.4, fontWeight: 700, color: '#2e7d32' }}>שרה עברה על התלושים ואישרה ✓ ({fmt(st.approvedAt)})</p>
    </>);
    if (st.doneAt) return card('var(--fill)', 'var(--line)', <>
      <p style={{ fontSize: 14.4, color: 'var(--text2)' }}>הודעת לשרה שהתלושים מוכנים ({fmt(st.doneAt)}) — ממתין לאישורה.</p>
      <button className="apple-btn apple-btn-ghost" disabled={busy} onClick={() => act('done')}
        style={{ minHeight: 34, padding: '0 12px', fontSize: 13.8 }}>שליחת תזכורת</button>
    </>);
    return card('var(--purple-100, #F3EFFB)', 'var(--line)', <>
      <Send size={15} strokeWidth={2.3} color="var(--purple)" />
      <p style={{ flex: '1 1 220px', fontSize: 14.4, fontWeight: 600 }}>סיימת להזין את התלושים לחודש הזה?</p>
      <button className="apple-btn apple-btn-blue" disabled={busy} onClick={() => act('done')}
        style={{ minHeight: 40, padding: '0 16px', fontSize: 14.4 }}>
        {busy ? 'שולח…' : 'סיימתי — הודעה לשרה'}
      </button>
    </>);
  }
  // שרה: מוצג רק כשהחשבת סימנה סיום
  if (!st.doneAt) return null;
  if (st.approvedAt) return card('#E8F5E9', '#A5D6A7', <>
    <Check size={15} strokeWidth={2.6} color="#2e7d32" />
    <p style={{ fontSize: 14.4, fontWeight: 700, color: '#2e7d32' }}>תלושי החודש אושרו ({fmt(st.approvedAt)}) — נשלחה הודעה לחשבת.</p>
  </>);
  return card('var(--warn-bg)', '#FFB74D', <>
    <Bell size={15} strokeWidth={2.3} color="#E65100" />
    <p style={{ flex: '1 1 240px', fontSize: 14.4, fontWeight: 700, color: '#E65100' }}>
      חשבת השכר סיימה להזין את התלושים ({fmt(st.doneAt)}) — לעבור ולאשר.
    </p>
    <button className="apple-btn apple-btn-green" disabled={busy} onClick={() => act('approve')}
      style={{ minHeight: 40, padding: '0 16px', fontSize: 14.4 }}>
      {busy ? 'שולח…' : 'עברתי — אושר, הודעה לחשבת'}
    </button>
  </>);
}

/* ═══════════════════════════════════════════════════════════════
   תלושים מול תחשיב — כיול תעריף השעה מהתלושים האמיתיים

   "כשראיתי תלושים של אסתר בפועל היה נראה אחרת… כן, במסך נפרד" (שרה, 15.9).
   המודל (calcEmployer) מנפח ב-5%–10% מול תלושי מזכרת בתיה: פנסיה 14.83%
   וקה"ש 8.4% על כולן, בעוד שבתלוש 12.5% על בסיס נמוך יותר וקה"ש רק לחלק.
   לכן התעריף לתקציב נגזר כאן מהתלושים כשיש, ומהמודל רק כשאין.

   לכל בית ספר: עלות ההוראה לחודש (בלי מנהלת, בלי חל"ת) לפי המודל ולפי
   התלושים, השעות הפעילות, העלות לשעה שבועית בשני המקורות, ומה שיוצא
   ממנה לתקציב: ש"ש לכיתה (שעות ÷ כיתות) ותעריף עם 10% + 5% מ"מ, מול מה
   שרשום היום במערכת התקציב. התלושים נכנסים דרך שולחן השכר ← ייבוא תלוש.
═══════════════════════════════════════════════════════════════ */
function CalibrationView({ schools, teachers, monthKey }) {
  const PROT = 0.15;   // 10% ביטחון + 5% מילוי מקום — כמו BUFFER_PCT + MM_PCT
  const [hub, setHub]   = useState(null);   // null: עוד נטען
  const [err, setErr]   = useState('');
  const [open, setOpen] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      try { const h = await store.fetchHubBudget(); if (alive) setHub(h); }
      catch (e) { if (alive) { setErr(e.message); setHub([]); } }
    })();
    return () => { alive = false; };
  }, [monthKey]);

  const norm = n => String(n || '').replace(/["'״׳־-]/g, '').replace(/\s+/g, ' ')
    .replace(/^(בית חינוך|שלהבות)\s+/, '').replace(/גני תקווה/, 'גני תקוה').trim();
  const money = v => (v == null || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString('he-IL') + ' ₪');
  const num   = v => (v == null || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString('he-IL'));
  const pct   = v => (v == null ? '' : `${v > 0 ? '+' : ''}${v}%`);

  const raw = schools.map(sc => {
    // עובדות הוראה בלבד, בלי מנהלת ובלי מי שבחל"ד/חל"ת — כמו "עלות שכר לשעה"
    // בדף עלות ההוראה: מכיילים לפי מי שמלמדת בפועל, עלות מול שעות.
    const ts = teachers.filter(t => t.schoolId === sc.id && !isPrincipalRow(t) && !unpaidThisMonth(t));
    const list = ts.map(t => {
      const model = calcEmployer({ ...t, _actualEmployerCost: null }).total;
      const slip  = t._actualEmployerCost ? calcEmployer(t).total : null;
      return { t, hours: Number(t.frontalHours) || 0, model, slip,
        diff: slip != null && model ? Math.round((slip - model) / model * 1000) / 10 : null };
    });
    const hours    = list.reduce((a, x) => a + x.hours, 0);
    const modelSum = list.reduce((a, x) => a + x.model, 0);
    const withSlip = list.filter(x => x.slip != null);
    const slipSum  = withSlip.reduce((a, x) => a + x.slip, 0);
    const modelOfSlipped = withSlip.reduce((a, x) => a + x.model, 0);
    const coverage = list.length ? withSlip.length / list.length : 0;
    return { sc, list, hours, modelSum, withSlip, slipSum, modelOfSlipped, coverage };
  }).filter(r => r.list.length);

  /*
    "לפי מה שלמדת ממזכרת בתיה… הכל במערכת?" (שרה, 15.9): מקדם כיול רשתי —
    כל התלושים שיובאו חלקי המודל של אותן עובדות. בית ספר בלי תלושים
    מוצג לפי המודל × המקדם ("מכויל"), עד שיגיעו התלושים שלו. עם תלושי
    מזכרת בלבד המקדם היה 0.95.
  */
  const slipAll  = raw.reduce((a, r) => a + r.slipSum, 0);
  const modelAll = raw.reduce((a, r) => a + r.modelOfSlipped, 0);
  const kFactor  = modelAll > 0 ? slipAll / modelAll : null;
  const kTeachers = raw.reduce((a, r) => a + r.withSlip.length, 0);

  const rows = raw.map(({ sc, list, hours, modelSum, withSlip, slipSum, modelOfSlipped, coverage }) => {
    // הבסיס לכיול: תלושים כשיש לכולן; חלקי = תלושים למי שיש + מודל מכויל לשאר;
    // בלי תלושים = מודל × המקדם הרשתי (או המודל עצמו כשעוד אין תלושים בכלל)
    const k = kFactor ?? 1;
    const basisSum = withSlip.length ? slipSum + (modelSum - modelOfSlipped) * k : modelSum * k;
    const basisKind = coverage === 1 ? 'slip' : withSlip.length ? 'mixed' : kFactor != null ? 'calibrated' : 'model';
    const h = (hub || []).find(x => norm(x.name) === norm(sc.name)) || null;
    const classes = h?.classCount || 0;
    const hpc = classes && hours ? Math.round(hours / classes) : null;
    const annual = basisSum * 12;
    const rate = classes && hpc ? Math.round(annual * (1 + PROT) / (hpc * 12 * classes)) : null;
    const budgetAnnual = h?.hourRate && h?.weeklyHours && classes ? h.hourRate * h.weeklyHours * 12 * classes : null;
    return { sc, list, hours, modelSum, slipSum, withSlip: withSlip.length, coverage, basisSum, basisKind,
      perHourModel: hours ? modelSum / hours : null,
      perHourSlip: hours && basisKind !== 'model' ? basisSum / hours : null,
      schoolDiff: withSlip.length && modelOfSlipped ? Math.round((slipSum - modelOfSlipped) / modelOfSlipped * 1000) / 10 : null,
      classes, hpc, rate, annualProt: annual * (1 + PROT), budgetRate: h?.hourRate ?? null, budgetHours: h?.weeklyHours ?? null, budgetAnnual };
  });

  const tot = rows.reduce((a, r) => ({ hours: a.hours + r.hours, model: a.model + r.modelSum, basis: a.basis + r.basisSum,
    n: a.n + r.list.length, slips: a.slips + r.withSlip }), { hours: 0, model: 0, basis: 0, n: 0, slips: 0 });

  const TH = ({ children }) => (
    <th style={{ padding:'10px 8px', fontSize:13.8, fontWeight:700, color:'var(--text2)', textAlign:'center', whiteSpace:'nowrap' }}>{children}</th>
  );
  const kindLabel = k => k === 'slip' ? 'תלושים' : k === 'mixed' ? 'תלושים חלקי' : k === 'calibrated' ? `מכויל ×${kFactor.toFixed(2)}` : 'מודל';
  const kindColor = k => k === 'slip' ? 'var(--ok, #2e7d32)' : k === 'mixed' ? 'var(--apple-orange)' : k === 'calibrated' ? 'var(--purple)' : 'var(--text3)';
  const Basis = ({ r }) => (
    <span style={{ fontSize:12.6, fontWeight:700, color: kindColor(r.basisKind) }}>
      {kindLabel(r.basisKind)}{r.basisKind === 'slip' || r.basisKind === 'mixed' ? ` ${r.withSlip}/${r.list.length}` : ''}
    </span>
  );

  return (
    <div className="page-wrap fade-in" style={{ maxWidth:1380 }} dir="rtl">
      <PageHead
        title={`תלושים מול תחשיב · ${fmtMonth(monthKey)}`}
        badge={
          <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:13.8, fontWeight:700,
            color:'var(--purple)', background:'var(--purple-100)', border:'1px solid #D8CEEF', borderRadius:999, padding:'3px 11px' }}>
            <ShieldCheck size={14} strokeWidth={2.4} />לעינייך בלבד
          </span>
        }
        subtitle="עלות ההוראה לפי התלושים האמיתיים מול המודל, ומה שיוצא ממנה לתקציב: שעות לכיתה ותעריף לשעה עם 10% + 5% מילוי מקום."
      />
      {err && (
        <div style={{ background:'var(--danger-bg)', color:'var(--danger)', border:'1px solid var(--danger-line)', borderRadius:10,
          padding:'9px 14px', fontSize:14.9, fontWeight:600, marginBottom:12 }}>{err}</div>
      )}
      <p style={{ fontSize:13.8, color:'var(--text3)', lineHeight:1.6, marginBottom:12 }}>
        תלושים נכנסים דרך <b>שולחן השכר ← ייבוא תלוש</b> (קובץ דו"ח עלות עבודה מתוכנת השכר).
        {' '}{tot.n ? `${tot.slips} מתוך ${tot.n} עובדות הוראה עם תלוש.` : ''}
        {kFactor != null
          ? <> <b>מקדם כיול רשתי ×{kFactor.toFixed(3)}</b> — סך התלושים חלקי המודל של אותן {kTeachers} עובדות. בית ספר בלי תלושים מוצג לפי המודל × המקדם ("מכויל"), עד שייבאו לו תלושים.</>
          : ' עדיין אין תלושים במערכת — הכול לפי המודל, והתעריפים הם אומדן. ברגע שמייבאים תלוש ראשון, כל בתי הספר מתכיילים לפיו.'}
      </p>

      <div className="apple-card table-scroll only-desktop" style={{ padding:0, overflowX:'auto' }}>
        <table className="sticky-first" style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1.5px solid var(--line)' }}>
              <TH>בית ספר</TH>
              <TH>מורות</TH>
              <TH>ש"ש</TH>
              <TH>עלות הוראה לחודש · מודל</TH>
              <TH>עלות הוראה לחודש · תלושים / מכויל</TH>
              <TH>תלושים מול מודל</TH>
              <TH>לשעה · מודל</TH>
              <TH>לשעה · תלושים / מכויל</TH>
              <TH>כיתות</TH>
              <TH>ש"ש לכיתה</TH>
              <TH>תעריף +15%</TH>
              <TH>היום בתקציב</TH>
              <TH>הוראה שנתי +15%</TH>
              <TH>היום בתקציב</TH>
            </tr>
          </thead>
          <tbody>
            {hub === null ? (
              <tr><td colSpan={14} style={{ padding:22, textAlign:'center', fontSize:15.5, color:'var(--text3)' }}>טוען…</td></tr>
            ) : rows.map(r => (
              <Fragment key={r.sc.id}>
                <tr style={{ borderBottom:'1px solid var(--line)', cursor:'pointer' }}
                  onClick={() => setOpen(o => ({ ...o, [r.sc.id]: !o[r.sc.id] }))}>
                  <td style={{ padding:'10px 12px', fontSize:15.5, fontWeight:700, whiteSpace:'nowrap' }}>
                    <ChevronLeft size={14} strokeWidth={2.4} style={{ color:'var(--text3)', transform: open[r.sc.id] ? 'rotate(-90deg)' : 'none', marginInlineEnd:4 }} />
                    {r.sc.name}
                  </td>
                  <td style={{ textAlign:'center', fontSize:15.5 }}>{r.list.length}</td>
                  <td style={{ textAlign:'center', fontSize:15.5 }}>{r.hours}</td>
                  <td style={{ textAlign:'center', fontSize:15.5, color:'var(--text2)' }}>{money(r.modelSum)}</td>
                  <td style={{ textAlign:'center', fontSize:15.5, fontWeight:700 }}>
                    {r.basisKind !== 'model' ? money(r.basisSum) : '—'}<br /><Basis r={r} />
                  </td>
                  <td style={{ textAlign:'center', fontSize:15.5, fontWeight:700,
                    color: r.schoolDiff == null ? 'var(--text3)' : Math.abs(r.schoolDiff) > 10 ? 'var(--warn)' : 'var(--text)' }}>
                    {r.schoolDiff == null ? '—' : pct(r.schoolDiff)}
                  </td>
                  <td style={{ textAlign:'center', fontSize:15.5, color:'var(--text2)' }}>{num(r.perHourModel)}</td>
                  <td style={{ textAlign:'center', fontSize:15.5, fontWeight:700 }}>{r.basisKind !== 'model' ? num(r.perHourSlip) : '—'}</td>
                  <td style={{ textAlign:'center', fontSize:15.5 }}>{r.classes || '—'}</td>
                  <td style={{ textAlign:'center', fontSize:15.5 }}>{r.hpc ?? '—'}</td>
                  <td style={{ textAlign:'center', fontSize:16.1, fontWeight:800, color: r.basisKind === 'slip' ? 'var(--ok, #2e7d32)' : 'var(--text)' }}>
                    {r.rate ?? '—'}
                  </td>
                  <td style={{ textAlign:'center', fontSize:15.5, color:'var(--text2)', whiteSpace:'nowrap' }}>
                    {r.budgetRate ? `${r.budgetRate} × ${r.budgetHours}` : '—'}
                  </td>
                  <td style={{ textAlign:'center', fontSize:15.5, fontWeight:700 }}>{r.classes ? money(r.annualProt) : '—'}</td>
                  <td style={{ textAlign:'center', fontSize:15.5, color: r.budgetAnnual != null && r.classes && r.budgetAnnual < r.annualProt ? 'var(--danger)' : 'var(--text2)' }}>
                    {money(r.budgetAnnual)}
                  </td>
                </tr>
                {open[r.sc.id] && (
                  <tr style={{ background:'var(--apple-fill, #f5f3fa)' }}>
                    <td colSpan={14} style={{ padding:'8px 18px 12px' }}>
                      <table style={{ width:'100%', maxWidth:760, borderCollapse:'collapse' }}>
                        <thead><tr>
                          <TH>עובדת הוראה</TH><TH>ש"ש</TH><TH>מודל</TH><TH>תלוש</TH><TH>הפרש</TH>
                        </tr></thead>
                        <tbody>
                          {r.list.map(x => (
                            <tr key={x.t.id} style={{ borderTop:'1px dashed var(--line)' }}>
                              <td style={{ padding:'6px 8px', fontSize:14.4, fontWeight:600 }}>{x.t.name}{subInfo(x.t) ? <span style={{ color:'var(--apple-orange)', fontSize:12.6 }}>{` · ${subInfo(x.t)}`}</span> : null}</td>
                              <td style={{ textAlign:'center', fontSize:14.4 }}>{x.hours}</td>
                              <td style={{ textAlign:'center', fontSize:14.4, color:'var(--text2)' }}>{money(x.model)}</td>
                              <td style={{ textAlign:'center', fontSize:14.4, fontWeight:700 }}>{x.slip == null ? '—' : money(x.slip)}</td>
                              <td style={{ textAlign:'center', fontSize:14.4, color: x.diff == null ? 'var(--text3)' : Math.abs(x.diff) > 10 ? 'var(--warn)' : 'var(--text)' }}>{x.diff == null ? '—' : pct(x.diff)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          {hub !== null && rows.length > 1 && (
            <tfoot>
              <tr style={{ borderTop:'2px solid var(--line)', background:'var(--apple-fill)' }}>
                <td style={{ padding:'11px 12px', fontSize:16.1, fontWeight:800 }}>סה"כ הרשת</td>
                <td style={{ textAlign:'center', fontSize:15.5, fontWeight:700 }}>{tot.n}</td>
                <td style={{ textAlign:'center', fontSize:15.5, fontWeight:700 }}>{tot.hours}</td>
                <td style={{ textAlign:'center', fontSize:15.5, fontWeight:700 }}>{money(tot.model)}</td>
                <td style={{ textAlign:'center', fontSize:15.5, fontWeight:700 }}>{tot.slips ? money(tot.basis) : '—'}</td>
                <td />
                <td style={{ textAlign:'center', fontSize:15.5, fontWeight:700 }}>{tot.hours ? num(tot.model / tot.hours) : '—'}</td>
                <td style={{ textAlign:'center', fontSize:15.5, fontWeight:700 }}>{tot.slips && tot.hours ? num(tot.basis / tot.hours) : '—'}</td>
                <td colSpan={6} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="only-mobile">
        {hub === null ? (
          <div className="apple-card mcard" style={{ padding:22, textAlign:'center', fontSize:15.5, color:'var(--text3)' }}>טוען…</div>
        ) : rows.map(r => (
          <div key={'m-' + r.sc.id} className="apple-card mcard">
            <p className="mcard-name" style={{ marginBottom:4 }}>{r.sc.name} <Basis r={r} /></p>
            <CardRow label='מורות · ש"ש'>{r.list.length} · {r.hours}</CardRow>
            <CardRow label="עלות הוראה לחודש · מודל" color="var(--text2)">{money(r.modelSum)}</CardRow>
            <CardRow label="עלות הוראה לחודש · תלושים" strong>{r.basisKind !== 'model' ? money(r.basisSum) : '—'}</CardRow>
            <CardRow label="תלושים מול מודל">{r.schoolDiff == null ? '—' : pct(r.schoolDiff)}</CardRow>
            <CardRow label="לשעה · מודל / תלושים">{num(r.perHourModel)} / {r.basisKind !== 'model' ? num(r.perHourSlip) : '—'}</CardRow>
            <CardRow label='כיתות · ש"ש לכיתה'>{r.classes || '—'} · {r.hpc ?? '—'}</CardRow>
            <CardRow label="תעריף +15%" strong color={r.basisKind === 'slip' ? 'var(--ok, #2e7d32)' : undefined}>{r.rate ?? '—'}</CardRow>
            <CardRow label="היום בתקציב">{r.budgetRate ? `${r.budgetRate} × ${r.budgetHours}` : '—'}</CardRow>
            <CardRow label="הוראה שנתי +15% / בתקציב">{r.classes ? money(r.annualProt) : '—'} / {money(r.budgetAnnual)}</CardRow>
          </div>
        ))}
      </div>
      <p style={{ fontSize:13.8, color:'var(--text3)', marginTop:10, lineHeight:1.6 }}>
        <b>תלושים</b> — עלות המעביד מהתלוש (ברוטו + הפרשות) למי שיובא לה תלוש; לשאר המודל. <b>לשעה</b> — עלות ההוראה החודשית חלקי השעות
        השבועיות הפעילות. <b>ש"ש לכיתה</b> — השעות הפעילות חלקי מספר הכיתות במבט-רשת, מעוגל. <b>תעריף +15%</b> — עלות ההוראה השנתית
        × 1.15 חלקי (ש"ש לכיתה × 12 × כיתות): המספר להזין ב"תעריף שעת הוראה בפועל" במערכת התקציב, יחד עם ש"ש לכיתה.
        ירוק = נגזר מתלושים מלאים.
      </p>
    </div>
  );
}

function PayrollDesk({ teachers, schools, onSavePayroll, onSaveActual, onSaveScope, onImportSlip,
                       activeMonth, userRole, userId }) {
  const isClerk = userRole === 'clerk';
  const canSetScope = userRole === 'coordinator';
  const scopeTodo = canSetScope ? teachers.filter(scopeMissing).length : 0;
  const [tab, setTab] = useState(isClerk ? 'entry' : (scopeTodo ? 'scope' : 'entry'));

  const rows = teachers.filter(t => !unpaidThisMonth(t));
  const missingGross = rows.filter(t => !simComplete(t)).length;
  const missingCost  = rows.filter(t => simComplete(t) && !t._actualEmployerCost).length;

  return (
    <div className="fade-in page-wrap" style={{ maxWidth:1400 }} dir="rtl">
      <PageHead
        title={`שולחן השכר · ${fmtMonth(activeMonth)}`}
        subtitle={isClerk
          ? 'הזנת ברוטו ותוספת בית חב"ד, עלות מעביד בפועל, ותלושי החודש.'
          : 'אחוזי משרה, הזנת שכר, עלות מעביד בפועל, ומסמכי החודש.'}
      />
      <SlipsHandoff monthKey={activeMonth} role={userRole} />
      {/* לשוניות באותו גודל גם כשהן נשברות לשתי שורות */}
      <div className="apple-seg even-grid" style={{ marginBottom:14, gap:2 }}>
        {canSetScope && (
          <button onClick={() => setTab('scope')} className={['apple-seg-item', tab === 'scope' ? 'active' : ''].join(' ')}
            style={{ padding:'6px 13px', fontSize:14.9 }}>
            <Percent size={12} strokeWidth={2.6} style={{ marginInlineEnd:4 }} />
            אחוזי משרה{scopeTodo > 0 ? ` (${scopeTodo})` : ''}
          </button>
        )}
        <button onClick={() => setTab('entry')} className={['apple-seg-item', tab === 'entry' ? 'active' : ''].join(' ')}
          style={{ padding:'6px 13px', fontSize:14.9 }}>
          הזנת שכר{missingGross > 0 ? ` (${missingGross})` : ''}
        </button>
        <button onClick={() => setTab('cost')} className={['apple-seg-item', tab === 'cost' ? 'active' : ''].join(' ')}
          style={{ padding:'6px 13px', fontSize:14.9 }}>
          עלות מעביד בפועל{missingCost > 0 ? ` (${missingCost})` : ''}
        </button>
        <button onClick={() => setTab('import')} className={['apple-seg-item', tab === 'import' ? 'active' : ''].join(' ')}
          style={{ padding:'6px 13px', fontSize:14.9 }}>
          ייבוא תלוש
        </button>
        <button onClick={() => setTab('docs')} className={['apple-seg-item', tab === 'docs' ? 'active' : ''].join(' ')}
          style={{ padding:'6px 13px', fontSize:14.9 }}>
          תלושים ומסמכים
        </button>
      </div>

      {/* בקשת הטפסים מהמורות — פעולה של שרה אחרי האישור, לא אוטומציה */}
      {canSetScope && <FormsRequest teachers={teachers} monthKey={activeMonth} />}

      {tab === 'scope' && canSetScope && <ScopePanel teachers={teachers} schools={schools} onSave={onSaveScope} />}
      {tab === 'entry' && <PayrollEntry teachers={rows} schools={schools} onSave={onSavePayroll} />}
      {tab === 'cost'  && <ActualCostPanel teachers={teachers} schools={schools} onSave={onSaveActual} />}
      {tab === 'import' && <SlipImportPanel teachers={teachers} schools={schools} monthKey={activeMonth} onImport={onImportSlip} />}
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
    <p style={{ fontSize:14.9, color:'var(--text3)', textAlign:'center', padding:'48px 16px' }}>
      אין עובדות בחודש הזה
    </p>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
        <p style={{ fontSize:13.8, color:'var(--text3)', lineHeight:1.6, flex:'1 1 240px' }}>
          הברוטו שאת מזינה הוא מה שרץ בתשלומים. תוספת בית חב"ד היא החלק שאינו
          פנסיוני ואינו נושא קרן השתלמות — הוא נושא מס שכר וביטוח לאומי בלבד.
        </p>
        <div className="apple-seg" style={{ flexShrink:0 }}>
          <button onClick={() => setOnlyMissing(true)} className={['apple-seg-item', onlyMissing ? 'active' : ''].join(' ')}
            style={{ padding:'5px 11px', fontSize:13.8 }}>ממתינות</button>
          <button onClick={() => setOnlyMissing(false)} className={['apple-seg-item', !onlyMissing ? 'active' : ''].join(' ')}
            style={{ padding:'5px 11px', fontSize:13.8 }}>כל העובדות</button>
        </div>
      </div>
      {err && <p style={{ fontSize:14.4, color:'var(--danger)' }}>{err}</p>}

      {bySchool.length === 0 && (
        <div style={{ textAlign:'center', padding:'48px 16px' }}>
          <div style={{ width:56, height:56, borderRadius:17, background:'var(--ok-bg)', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Check size={26} strokeWidth={2.4} color="var(--ok)" />
          </div>
          <p style={{ fontSize:17.2, fontWeight:700, color:'var(--text)' }}>כל הברוטו הוזן</p>
        </div>
      )}

      {bySchool.map(({ school, list }) => (
        <div key={school.id}>
          <div style={{ fontSize:13.8, fontWeight:700, color:'var(--purple)', marginBottom:8, padding:'5px 11px', background:'var(--purple-100)', border:'1px solid #D8CEEF', borderRadius:999, display:'inline-flex', alignItems:'center', gap:6 }}>
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
                  <p style={{ fontSize:15.5, fontWeight:600, color:'var(--text)' }}>
                    {t.name}
                    <span style={{ fontWeight:400, fontSize:13.2, color:'var(--text3)' }}>
                      {` · ${reformLabel(t.reform)} · ${DEGREE_LABELS[t.degree] || t.degree || '—'}`}
                      {` · ותק ${t.seniority ?? 1} · ${effectiveScope(t)}% משרה`}
                      {t.role && t.role !== 'none' ? ` · ${ROLE_SHORT[t.role] || t.role}` : ''}
                    </span>
                    {subInfo(t) && (
                      <span style={{ fontWeight:600, fontSize:13.2, color:'var(--apple-orange)' }}>{` · ${subInfo(t)}`}</span>
                    )}
                    {flash[t.id] && <span style={{ marginInlineStart:6, fontSize:13.2, color:'var(--ok)', fontWeight:700 }}>✓ נשמר</span>}
                  </p>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginTop:6 }}>
                    <label style={{ fontSize:13.2, color:'var(--text3)' }}>
                      ברוטו
                      <input type="number" min="0" dir="ltr" className="apple-input"
                        value={gCur}
                        onChange={e => setVals(v => ({ ...v, [`${t.id}|gross`]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        onBlur={e => { const n = num(e.target.value); if (n !== (t._officialGross ?? null)) save(t, { gross: n }); }}
                        style={{ width:104, minHeight:36, textAlign:'center', fontWeight:700, marginInlineStart:6 }} />
                    </label>
                    {!noSupp && (
                      <label style={{ fontSize:13.2, color:'var(--text3)' }}>
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
                      <span style={{ fontSize:13.2, color:'var(--text3)' }}>
                        {`עלות מעביד לפי הנוסחה: ${emp.estimate.toLocaleString('he-IL')} ₪ (${emp.pct}%)`}
                        {` · סה״כ ${emp.total.toLocaleString('he-IL')} ₪`}
                      </span>
                    )}
                    {busy === t.id && <span style={{ fontSize:13.2, color:'var(--text3)' }}>שומר…</span>}
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
    <div className="modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(6px)', overflowY:'auto' }} dir="rtl">
      <div className="apple-card spring-enter modal-card" style={{ width:'100%', maxWidth:440, padding:24, margin:'auto' }}>

        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:18 }}>
          <div>
            <h2 style={{ fontSize:20.7, fontWeight:800, letterSpacing:'-0.02em', color:'var(--text)', marginBottom:3 }}>ייצוא נתונים</h2>
            <p style={{ fontSize:14.4, color:'var(--text3)', lineHeight:1.5 }}>הנתונים שמורים בשרת ומשותפים לכל המשתמשות. הייצוא כאן הוא עותק לעיון — לא נדרש לגיבוי.</p>
          </div>
          <button onClick={onClose} title="סגירה" style={{ background:'var(--fill)', border:'none', borderRadius:'50%', width:30, height:30, cursor:'pointer', color:'var(--text3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>

      <div style={{ background:'var(--warn-bg)', border:'1px solid var(--warn-line)', borderRadius:12, padding:'11px 13px', marginBottom:16, display:'flex', gap:9 }}>
        <ShieldAlert size={16} strokeWidth={2.2} color="var(--warn)" style={{ flexShrink:0, marginTop:1 }} />
        <p style={{ fontSize:14.4, color:'var(--warn)', lineHeight:1.6 }}>
          ניקוי היסטוריית הדפדפן או מחיקת נתוני האתר ימחקו את כל תקציב השכר — ואין דרך לשחזר בלי קובץ גיבוי.
        </p>
      </div>

      <div className="apple-section" style={{ marginBottom:14 }}>
        <p style={{ fontSize:14.4, color:'var(--text2)', marginBottom:10, lineHeight:1.6 }}>
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
        <div style={{ background:'var(--ok-bg)', border:'1px solid var(--ok-line)', borderRadius:12, padding:'10px 13px', marginTop:14, fontSize:14.9, color:'var(--ok)', fontWeight:600, display:'flex', gap:7, alignItems:'center' }}>
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
function LinkField({ label, value, onChange, type = 'number', hint, inputMode }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:3, flex:'1 1 96px', minWidth:96 }}>
      <span style={{ fontSize:13.2, fontWeight:600, color:'var(--text3)' }}>{label}</span>
      <input
        type={type} inputMode={inputMode ?? (type === 'number' ? 'numeric' : undefined)}
        className="apple-input" dir={type === 'text' ? 'rtl' : 'ltr'}
        value={type === 'date' ? String(value ?? '').slice(0, 10) : (value ?? '')} placeholder={hint}
        onChange={e => onChange(type === 'number'
          ? (e.target.value === '' ? null : Number(e.target.value))
          : e.target.value)}
        style={{ fontSize:17.2, minHeight:42, textAlign: type === 'number' ? 'center' : 'right' }} />
    </label>
  );
}

function LinkSelect({ label, value, onChange, options }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:3, flex:'1 1 120px', minWidth:120 }}>
      <span style={{ fontSize:13.2, fontWeight:600, color:'var(--text3)' }}>{label}</span>
      <select className="apple-select" value={value ?? ''} onChange={e => onChange(e.target.value)}
        style={{ fontSize:17.2, minHeight:42 }}>
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
        <LinkField label="ת.ז." type="text" inputMode="numeric" value={draft.tzId} onChange={v => apply({ tzId: v })} hint="9 ספרות" />
        <LinkField label="טלפון *" type="tel" value={draft.phone} onChange={v => apply({ phone: v })} hint="05x-xxxxxxx" />
        <LinkField label="מייל *" type="email" value={draft.email} onChange={v => apply({ email: v })} hint="name@example.com" />
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
      {/*
        פרטני ושהייה — באופק בלבד (שרה, 8.9). ברירת המחדל היא הטבלה
        הרשמית של משרד החינוך, והמספר ממנה מוצג כרמז בשדה. מי שמקלידה
        מספר — הוא גובר; מחיקה מחזירה לטבלה. כך תיקון ידני לא נמחק
        כששעות משתנות, ושורה שלא נגעו בה ממשיכה לעקוב אחרי הטבלה.
      */}
      {isOfek && !isPrincipalRow(draft) && (() => {
        const d = (() => { try { return deriveHours({ ...draft, gamulRole: draft.role || draft.gamulRole }); }
                           catch { return null; } })();
        const hint = n => (n === null || n === undefined ? 'לפי הטבלה' : `לפי הטבלה: ${n}`);
        // שהייה בלבד. בטבלת האם עמודת השהייה ועמודת "שהיית אם" מחזיקות
        // את אותו מספר, וחיבורן הכפיל אותה (שרה, 8.9).
        const pres = d ? d.presence : null;
        return (
          <div style={{ display:'flex', flexWrap:'wrap', gap:9, marginBottom:9 }}>
            <LinkField label="שעות פרטניות" value={draft.individualHours ?? ''}
              onChange={v => apply({ individualHours: v === '' ? null : v })}
              hint={hint(d?.individual)} />
            <LinkField label="שעות שהייה" value={draft.presenceHours ?? ''}
              onChange={v => apply({ presenceHours: v === '' ? null : v })}
              hint={hint(pres)} />
          </div>
        );
      })()}
      <div style={{ display:'flex', flexWrap:'wrap', gap:9 }}>
        <LinkSelect label="שלב" value={draft.level || 'elementary'} onChange={v => apply({ level: v })}
          options={Object.entries(LEVELS).map(([k, v]) => [k, v.label])} />
        <LinkSelect label="קבוצת גיל" value={draft.ageGroup || 'none'} onChange={v => apply({ ageGroup: v })}
          options={Object.entries(AGE_RED).map(([k, v]) => [k, v.label])} />
        <LinkSelect label="גמול תפקיד" value={draft.gamulRole || draft.role || 'none'}
          onChange={v => apply({ role: v, extraRoles: (draft.extraRoles || []).filter(x => x !== v),
                                  ...principalDefaults({ ...draft, role: v }) })}
          options={ROLES.map(r => [r.id, r.label.split('(')[0].trim()])} />
        {!isPrincipalRow(draft) && (
          <div style={{ flex:'1 1 100%' }}>
            <p style={{ fontSize:13.8, fontWeight:600, color:'var(--text2)', marginBottom:4 }}>תפקידים נוספים</p>
            <ExtraRoles t={draft} onChange={v => apply({ extraRoles: v })} />
          </div>
        )}
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
      <p style={{ fontSize:16.1, fontWeight:700, color:'var(--purple)', marginBottom:10 }}>עובד/ת הוראה חדש/ה</p>
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
        {state && state !== 'saving' && <span style={{ fontSize:13.8, color:'var(--danger)' }}>{state}</span>}
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
        <p style={{ fontSize:17.2, fontWeight:700, color:'var(--text)' }}>{teacher.name}</p>
        <span style={{ fontSize:13.2, color:'var(--text3)' }}>
          {reformLabel(draft.reform)}{draft.scopePct ? ` · ${draft.scopePct}% משרה` : ''}
          {onLeave(teacher) && (
            <span className="apple-badge badge-orange" style={{ fontSize:13.2, padding:'2px 8px', marginInlineStart:6 }}>
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
        {state === 'saved' && <span style={{ fontSize:14.4, color:'var(--ok)', fontWeight:600 }}>✓ נשמר</span>}
        {state && state !== 'saving' && state !== 'saved' &&
          <span style={{ fontSize:13.8, color:'var(--danger)' }}>{state}</span>}
        {!dirty && !state && <span style={{ fontSize:13.2, color:'var(--text3)' }}>אין שינוי</span>}
      </div>
    </div>
  );
}

/* ═══ דיווח חודשי — היעדרויות ומילויי מקום ═══
   "רוצה להכין דשבורד למנהלות למילוי העדרויות ומילויי מקום חודשיים"
   (שרה, 3.9). מסך ממוקד בתוך הקישור האישי: המנהלת רואה סיכום על כל
   מורה ומזינה רק את נתוני החודש — היעדרויות, ממ"מ וסטטוס. נתוני
   ההעסקה נשארים בטאב שלהם. שרה ואסתר רואות את אותם דיווחים במסך
   "היעדרויות וממ"מ" שבמערכת. */
/*
  "לא טוב — תן רשימה נפתחת, כל היעדרות המנהלת תחפש ותוסיף. במקביל
  תפתח לה רשימה לממלאת מקום" (שרה, 6.9): במקום כרטיס לכל מורה —
  שני טפסי הוספה עם חיפוש ברשימת עובדות ההוראה של בית הספר, ולמטה
  רק מה שדווח החודש. "במקום מי" הוא בחירה מהרשימה, לא טקסט חופשי.
*/
/* ═══════════════════════════════════════════════════════════════
   אישור נתונים — המנהלת עוברת שורה-שורה, מתקנת, ומתחייבת על השעות

   "כל נתון שיבדקו ויערכו במידת הצורך" (שרה, 8.9). לכן זה אינו כפתור
   אחד: כל עובדת נפתחת, נבדקת ומסומנת בנפרד, והאישור הסופי נחסם בשרת
   עד שכולן סומנו. שורה ששונתה יורדת מהסימון ומחכה לבדיקה חוזרת.

   ההצהרה ומספר השעות נבנים בשרת — המסך רק מציג אותם.
═══════════════════════════════════════════════════════════════ */
// מחנכת בעולם ישן מקבלת 3 שעות גמול מעל מה שהיא מלמדת
const isPreHomeroomRow = t => t?.reform === 'pre' && /^homeroom/.test(t?.gamulRole || t?.role || '');

function LinkApproval({ rows, code, onSave, onAdd, schoolReform, schoolName, male, quota, locked = false }) {
  const [ap,    setAp]    = useState(null);
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState('');
  const [open,  setOpen]  = useState(null);   // איזו שורה פתוחה לעריכה
  const [name,  setName]  = useState('');
  const [note,  setNote]  = useState('');

  const load = useCallback(async () => {
    try { setAp(await store.linkApproval(code)); } catch (e) { setErr(e.message); }
  }, [code]);
  useEffect(() => { load(); }, [load, rows]);

  const checked = new Set(ap?.checked || []);
  const hours = schoolHours(rows);
  const over = quota > 0 && hours > quota;
  const done = rows.filter(t => checked.has(t.id)).length;
  const all  = rows.length;
  const approved = Boolean(ap?.approved_at);

  const toggle = async (t) => {
    setErr('');
    try { setAp(await store.linkCheckRow(code, t.id, !checked.has(t.id))); }
    catch (e) { setErr(e.message); }
  };

  const approve = async () => {
    if (!name.trim()) { setErr('יש למלא את שמך'); return; }
    // מעל התקן — נדרש נימוק. השרת חוסם גם הוא; כאן זו רק ההודעה המוקדמת.
    if (over && !note.trim()) { setErr('השעות מעל תקן בית הספר — יש לכתוב מה הסיבה לחריגה'); return; }
    setBusy(true); setErr('');
    try { setAp(await store.linkApproveData(code, name.trim(), note)); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (approved) return (
    <div className="apple-card" style={{ padding:'18px 17px', background:'var(--ok-bg)', border:'1px solid #CBE9D6' }}>
      <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:8 }}>
        <Check size={19} strokeWidth={2.5} color="var(--ok)" />
        <p style={{ fontSize:17.2, fontWeight:700, color:'var(--text)' }}>הנתונים אושרו</p>
      </div>
      <p style={{ fontSize:14.9, color:'var(--text)', lineHeight:1.7 }}>{ap.declaration}</p>
      <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:8 }}>
        {ap.approved_by} · {new Date(ap.approved_at).toLocaleString('he-IL', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })}
        {ap.note ? ` · ${ap.note}` : ''}
      </p>
      <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:9, lineHeight:1.6 }}>
        כל שינוי בנתונים יבטל את האישור ויבקש לעבור שוב על השורה ששונתה.
      </p>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
      {ap?.revoked_at && (
        <div className="apple-card" style={{ padding:'11px 13px', background:'#FFF9EF', border:'1px solid #F3E3C2' }}>
          <p style={{ fontSize:14.4, color:'#B4650A', lineHeight:1.6 }}>
            האישור בוטל אחרי שינוי{ap.revoked_rows ? ` אצל ${ap.revoked_rows}` : ''}. יש לעבור על השורה שוב ולאשר מחדש.
          </p>
        </div>
      )}

      <div className="apple-card" style={{ padding:'13px 15px' }}>
        <p style={{ fontSize:14.4, color:'var(--text)', lineHeight:1.7 }}>
          לפנייך הנתונים שהוזנו מ{schoolName ? schoolName : 'בית הספר'}. <b>אין כאן שכר ואין חישוב.</b>{' '}
          {male ? 'יש לפתוח כל עובד, לוודא שהפרטים נכונים, לתקן אם צריך — ולסמן שנבדק.' : 'יש לפתוח כל עובדת, לוודא שהפרטים נכונים, לתקן אם צריך — ולסמן שנבדקה.'}
        </p>
        <div style={{ display:'flex', alignItems:'center', gap:9, marginTop:10 }}>
          <div style={{ flex:1, height:7, background:'#EFEBF7', borderRadius:20, overflow:'hidden' }}>
            <div style={{ width:`${all ? done / all * 100 : 0}%`, height:'100%', borderRadius:20,
              background:'linear-gradient(270deg,var(--purple),#00B4CC)', transition:'width .25s' }} />
          </div>
          <span style={{ fontSize:13.8, fontWeight:700, color:'var(--purple)', whiteSpace:'nowrap' }}>{done} / {all}</span>
        </div>
      </div>

      {rows.map(t => {
        const { issues, hard } = rowIssues(t);
        const isOpen = open === t.id;
        const ok = checked.has(t.id);
        return (
          <div key={t.id} className="apple-card"
            style={{ padding:'12px 14px', borderColor: ok ? '#CBE9D6' : hard ? '#F3E3C2' : 'var(--line)',
                     background: ok ? '#FBFEFC' : hard ? '#FFFDF8' : '#fff' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <button onClick={() => toggle(t)} aria-label={ok ? 'בטלי סימון' : 'סמני שנבדקה'}
                style={{ width:26, height:26, borderRadius:8, flexShrink:0, cursor:'pointer',
                  border:`1.5px solid ${ok ? 'var(--ok)' : '#C9C2DC'}`, background: ok ? 'var(--ok)' : '#fff',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                {ok && <Check size={15} strokeWidth={3} color="#fff" />}
              </button>
              <div style={{ flex:'1 1 140px', minWidth:0 }}>
                <p style={{ fontSize:16.1, fontWeight:700, color:'var(--text)' }}>{t.name}</p>
                <p style={{ fontSize:13.2, color:'var(--text3)' }}>
                  {reformLabel(t.reform)} · {t.frontalHours ?? '—'} שעות
                  {isPreHomeroomRow(t) ? ` · עם גמול ${Number(t.frontalHours || 0) + 3}` : ''}
                  {t.scopePct ? ` · ${t.scopePct}%` : ''}
                  {t.reform === 'ofek' && !isPrincipalRow(t) && (() => {
                    const d = (() => { try { return deriveHours({ ...t, gamulRole: t.role || t.gamulRole }); }
                                       catch { return null; } })();
                    const ind = t.individualHours ?? d?.individual;
                    const pre = t.presenceHours ?? d?.presence ?? null;
                    return (ind ?? pre) != null ? ` · פרטני ${ind ?? '—'} · שהייה ${pre ?? '—'}` : '';
                  })()}
                </p>
              </div>
              <button className="apple-btn apple-btn-ghost" onClick={() => setOpen(isOpen ? null : t.id)}
                style={{ minHeight:36, fontSize:14.4 }}>{isOpen ? 'סגירה' : 'פרטים ותיקון'}</button>
            </div>

            {hard > 0 && !isOpen && (
              <p style={{ fontSize:13.2, color:'#B4650A', marginTop:7, lineHeight:1.6 }}>
                {issues.filter(x => !x.soft).map(x => x.why).join(' · ')}
              </p>
            )}
            {hard === 0 && issues.length > 0 && !isOpen && (
              <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:7 }}>{issues.map(x => x.why).join(' · ')}</p>
            )}

            {isOpen && (
              <div style={{ marginTop:11, paddingTop:11, borderTop:'1px solid var(--line)' }}>
                <LinkCard teacher={t} locked={locked} onSave={onSave} />
              </div>
            )}
          </div>
        );
      })}

      {/*
        "איפה מוסיפים עובד או עובדת חסרה" (שרה, 8.9). המסך הזה הוא
        הרגע שבו מתגלה מי חסרה — עוברים שורה-שורה — ולכן ההוספה חייבת
        להיות כאן ולא רק בטאב השני. שורה שנוספת נכנסת לרשימה כלא-נבדקה,
        ולכן האישור הסופי לא נסגר בלעדיה.
      */}
      {onAdd && (
        <div>
          <p style={{ fontSize:13.8, color:'var(--text3)', marginBottom:7, lineHeight:1.6 }}>
            חסרה עובדת ברשימה? אפשר להוסיף אותה כאן, והיא תצטרף לבדיקה.
          </p>
          <LinkNewCard schoolReform={schoolReform} onAdd={onAdd} male={male} />
        </div>
      )}

      {/*
        תקן השעות (שרה, 8.9): "מי שיש פחות אל תציין, רק מי שיש יותר;
        אם תוסיף ותגע בגג תציין". שקט כל עוד מתחת לתקן — ומופיע ברגע
        שנוגעים בו, כדי שההוספה במסך הזה לא תעבור אותו בלי לשים לב.
      */}
      {quota > 0 && hours >= quota && (
        <div className="apple-card" style={{ padding:'12px 14px',
          background: hours > quota ? '#FFF9EF' : 'var(--surface)',
          border: `1px solid ${hours > quota ? '#F3E3C2' : 'var(--line)'}` }}>
          <p style={{ fontSize:14.9, fontWeight:700, color: hours > quota ? '#B4650A' : 'var(--text)' }}>
            {hours > quota
              ? `חריגה מתקן השעות — ${hours - quota} שעות מעל התקן`
              : 'הגעת בדיוק לתקן השעות'}
          </p>
          <p style={{ fontSize:13.8, color: hours > quota ? '#7A4A08' : 'var(--text3)', marginTop:3, lineHeight:1.6 }}>
            תקן בית הספר {quota} שעות שבועיות, ורשומות {hours}.
            {hours > quota ? ' כדי לאשר יש לכתוב בהערה מה הסיבה לחריגה, או להוריד שעות.' : ' הוספת שעות תעבור את התקן.'}
          </p>
        </div>
      )}

      <div className="apple-card" style={{ padding:'15px 16px' }}>
        <p style={{ fontSize:15.5, fontWeight:700, color:'var(--text)', marginBottom:7 }}>אישור סופי</p>
        <p style={{ fontSize:14.4, color:'var(--text)', lineHeight:1.75, background:'var(--surface)',
          border:'1px solid var(--line)', borderRadius:9, padding:'10px 12px' }}>
          {male ? 'אני מאשר' : 'אני מאשרת'} שהפרטים נכונים ומעודכנים, ושזהו מספר השעות לשנה זו —{' '}
          <b style={{ color:'var(--purple)' }}>{hours} שעות שבועיות</b> — ולא אחרוג מכך.
        </p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:9, marginTop:11 }}>
          <input className="apple-input" value={name} onChange={e => setName(e.target.value)}
            placeholder="שמי המלא" style={{ flex:'1 1 160px', minHeight:42, fontSize:15.5 }} />
          <input className="apple-input" value={note} onChange={e => setNote(e.target.value)}
            placeholder={over ? 'הסיבה לחריגה מהתקן — חובה' : 'הערה (לא חובה)'}
            style={{ flex:'1 1 160px', minHeight:42, fontSize:15.5,
              borderColor: over && !note.trim() ? '#E8A33D' : undefined }} />
        </div>
        {err && <p style={{ fontSize:13.8, color:'var(--danger)', marginTop:8 }}>{err}</p>}
        <button className="apple-btn apple-btn-blue" onClick={approve}
          disabled={busy || done < all || !all || (over && !note.trim())}
          style={{ width:'100%', minHeight:48, fontSize:16.1, marginTop:11 }}>
          {busy ? 'שולחת…'
            : done < all ? `נותרו ${all - done} עובדות לבדיקה`
            : (over && !note.trim()) ? 'יש לכתוב את הסיבה לחריגה'
            : 'מאשרת ושולחת'}
        </button>
      </div>
    </div>
  );
}

function LinkMonthlyReport({ rows, locked, onSave, code }) {
  const byName = (n) => rows.find(t => t.name === String(n || '').trim());

  // ── טופס היעדרות ──
  const [absName,  setAbsName]  = useState('');
  const [absDraft, setAbsDraft] = useState({});
  const [absState, setAbsState] = useState('');
  const [uploading, setUploading] = useState(false);
  const absT = byName(absName);

  // ── טופס מילוי מקום ──
  const [subName,  setSubName]  = useState('');
  const [subFor,   setSubFor]   = useState('');
  const [subHours, setSubHours] = useState('');
  const [subMode,  setSubMode]  = useState('day');   // יומי | לתקופה
  const [subFrom,  setSubFrom]  = useState('');
  const [subTo,    setSubTo]    = useState('');
  const [subState, setSubState] = useState('');
  const subT = byName(subName);

  const reason = absDraft.absenceReason ?? absT?.absenceReason ?? '';

  const attachFile = async (file) => {
    if (!file || !absT) return;
    setUploading(true); setAbsState('');
    try {
      const path = await store.linkUploadSickForm(code, absT.id, file);
      setAbsDraft(m => ({ ...m, sickFormPath: path }));
    } catch (e) { setAbsState(e.message); }
    finally { setUploading(false); }
  };

  const saveAbs = async () => {
    if (!absT) { setAbsState('בחרי עובדת הוראה מהרשימה'); return; }
    if (!reason) { setAbsState('בחרי סיבה להיעדרות'); return; }
    if (isLeaveReason(reason) && !(absDraft.leaveFrom ?? absT.leaveFrom)) {
      setAbsState('יש למלא מאיזה תאריך'); return;
    }
    setAbsState('saving');
    try {
      /*
        חופשת לידה וחל"ת הן גם סטטוס עם תאריכים — התלוש והאוטומציות
        מסתכלים על leaveType. שאר הסיבות משאירות את המורה "עובדת".
      */
      const leave = isLeaveReason(reason)
        ? { leaveType: reason === 'maternity' ? 'maternity' : 'unpaid',
            leaveFrom: absDraft.leaveFrom ?? absT.leaveFrom,
            leaveTo:   absDraft.leaveTo   ?? absT.leaveTo }
        : { leaveType: 'none', leaveFrom: null, leaveTo: null };
      await onSave({ ...absT, ...absDraft, absenceReason: reason, ...leave,
        _snapshot: absT._snapshot || snapT(absT) });
      setAbsName(''); setAbsDraft({}); setAbsState('saved');
      setTimeout(() => setAbsState(s => (s === 'saved' ? '' : s)), 2500);
    } catch (e) { setAbsState(e.message); }
  };

  const saveSub = async (maternitySub) => {
    if (!subT) { setSubState('בחרי מי מילאה מקום — מהרשימה'); return; }
    if (!byName(subFor)) { setSubState('בחרי במקום מי — מהרשימה'); return; }
    const h = Number(subHours);
    if (!h || h <= 0) { setSubState(maternitySub ? 'כמה שעות שבועיות?' : 'כמה שעות מילאה מקום?'); return; }
    if (!maternitySub) {
      if (!subFrom) { setSubState(subMode === 'day' ? 'באיזה תאריך?' : 'מאיזה תאריך?'); return; }
      if (subMode === 'period' && !subTo) { setSubState('עד איזה תאריך?'); return; }
    }
    setSubState('saving');
    try {
      // ממ"מ לחל"ד: שעות שבועיות בלי תאריכים (שרה, 6.9)
      await onSave({ ...subT, mmHours: h, mmFor: String(subFor).trim(),
        mmFrom: maternitySub ? null : subFrom,
        mmTo:   maternitySub ? null : (subMode === 'day' ? subFrom : subTo),
        _snapshot: subT._snapshot || snapT(subT) });
      setSubName(''); setSubFor(''); setSubHours(''); setSubFrom(''); setSubTo('');
      setSubState('saved');
      setTimeout(() => setSubState(s => (s === 'saved' ? '' : s)), 2500);
    } catch (e) { setSubState(e.message); }
  };

  // עריכת דיווח קיים — מחזירה אותו לטפסים למעלה עם הערכים הנוכחיים
  const editReport = (t) => {
    if ((t.absenceDays || 0) > 0 || onLeave(t) || t.absenceReason) {
      setAbsName(t.name);
      setAbsDraft({ absenceDays: t.absenceDays, absenceReason: t.absenceReason || '',
        leaveFrom: t.leaveFrom, leaveTo: t.leaveTo, sickFormPath: t.sickFormPath });
    }
    if ((t.mmHours || 0) > 0 || t.mmFor) {
      setSubName(t.name); setSubFor(t.mmFor || ''); setSubHours(t.mmHours || '');
      setSubMode(t.mmFrom && t.mmTo && t.mmTo !== t.mmFrom ? 'period' : 'day');
      setSubFrom(t.mmFrom || ''); setSubTo(t.mmTo || '');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // "מחיקת דיווח" — ממצא הבדיקה: לא הייתה דרך לבטל דיווח שגוי מהטופס
  const deleteReport = async (t) => {
    if (!window.confirm(`למחוק את הדיווח של ${t.name} לחודש הזה?`)) return;
    await onSave({ ...t,
      absenceDays: 0, absenceReason: null, sickFormPath: null,
      leaveType: 'none', leaveFrom: null, leaveTo: null,
      mmHours: 0, mmFor: '', mmFrom: null, mmTo: null,
      _snapshot: t._snapshot || snapT(t) });
  };

  const reported = rows.filter(t =>
    (t.absenceDays || 0) > 0 || (t.mmHours || 0) > 0 || t.mmFor || onLeave(t) || t.absenceReason);
  const totAbs = rows.reduce((s, t) => s + (t.absenceDays || 0), 0);
  const totMM  = rows.reduce((s, t) => s + (t.mmHours || 0), 0);

  const inputStyle = { minHeight:42, fontSize:16.1 };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* הסיכום למעלה — מה שכבר דווח החודש, במבט אחד */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
        {[
          { label:'ימי היעדרות', val: totAbs,           color:'var(--danger)' },
          { label:'שעות ממ"מ',   val: totMM,            color:'var(--purple)' },
          { label:'בחופשה',      val: rows.filter(onLeave).length, color:'var(--warn)' },
        ].map(x => (
          <div key={x.label} className="apple-card" style={{ padding:'10px 8px', textAlign:'center' }}>
            <p className="num" style={{ fontWeight:800, fontSize:23, color: x.val ? x.color : 'var(--text3)' }}>{x.val}</p>
            <p style={{ fontSize:13.2, color:'var(--text2)' }}>{x.label}</p>
          </div>
        ))}
      </div>

      {/* הרשימה המשותפת לשני הטפסים — חיפוש לפי הקלדה */}
      <datalist id="school-teachers">
        {rows.map(t => <option key={t.id} value={t.name} />)}
      </datalist>

      {/* ── דיווח היעדרות ── */}
      <div className="apple-card" style={{ padding:'14px 15px' }}>
        <p style={{ fontSize:16.7, fontWeight:800, color:'var(--danger)', marginBottom:9 }}>דיווח היעדרות</p>
        <input list="school-teachers" className="apple-input" style={{ ...inputStyle, width:'100%' }}
          placeholder="חפשי שם עובדת הוראה…" value={absName}
          onChange={e => { setAbsName(e.target.value); setAbsState(''); }} />
        {absT && (
          <>
            <div style={{ display:'flex', flexWrap:'wrap', gap:9, marginTop:10 }}>
              <LinkSelect label="סיבה" value={reason}
                onChange={v => setAbsDraft(m => ({ ...m, absenceReason: v }))}
                options={[['', 'בחרי סיבה…'], ...ABSENCE_REASONS.map(([k, l]) => [k, l])]} />
              {/* חל"ד/חל"ת נמדדות בתאריכים; שאר הסיבות — בימים */}
              {!isLeaveReason(reason) && (
                <LinkField label="ימי היעדרות" value={absDraft.absenceDays ?? absT.absenceDays}
                  onChange={v => setAbsDraft(m => ({ ...m, absenceDays: v }))} />
              )}
              {isLeaveReason(reason) && (
                <>
                  <LinkField label="מתאריך" type="date" value={absDraft.leaveFrom ?? absT.leaveFrom}
                    onChange={v => setAbsDraft(m => ({ ...m, leaveFrom: v || null }))} />
                  <LinkField label="עד תאריך" type="date" value={absDraft.leaveTo ?? absT.leaveTo}
                    onChange={v => setAbsDraft(m => ({ ...m, leaveTo: v || null }))} hint="אם ידוע" />
                </>
              )}
            </div>
            {/* טופס מחלה — למחלה ולמחלת ילד */}
            {needsSickForm(reason) && (
              <div style={{ marginTop:9, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <label className="apple-btn apple-btn-ghost" style={{ minHeight:40, paddingInline:14, cursor:'pointer' }}>
                  📎 {uploading ? 'מעלה…' : (absDraft.sickFormPath || absT.sickFormPath) ? 'החלפת טופס המחלה' : 'צירוף טופס מחלה'}
                  <input type="file" accept="image/*,application/pdf" hidden
                    onChange={e => { attachFile(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {(absDraft.sickFormPath || absT.sickFormPath) && !uploading &&
                  <span style={{ fontSize:14.4, color:'var(--ok)', fontWeight:600 }}>✓ טופס מצורף</span>}
              </div>
            )}
          </>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:10 }}>
          <button className="apple-btn apple-btn-blue" disabled={locked || absState === 'saving' || uploading || !absT}
            onClick={saveAbs} style={{ minHeight:40, paddingInline:20, opacity: (locked || !absT) ? .45 : 1 }}>
            {absState === 'saving' ? 'שומרת…' : 'הוספת היעדרות'}
          </button>
          {absState === 'saved' && <span style={{ fontSize:14.4, color:'var(--ok)', fontWeight:600 }}>✓ נשמר</span>}
          {absState && !['saving','saved'].includes(absState) &&
            <span style={{ fontSize:13.8, color:'var(--danger)' }}>{absState}</span>}
        </div>
      </div>

      {/* ── מילוי מקום ── */}
      {(() => {
        const replaced = byName(subFor);
        /*
          "ממ"מ לחופשת לידה זה שעות שבועיות, בלי צורך לדווח כל התקופה
          של חל"ד" (שרה, 6.9): כשהמוחלפת בחל"ד — השעות שבועיות ואין
          תאריכים. מזוהה מהסטטוס של המוחלפת, בלי שאלה נוספת.
        */
        const maternitySub = Boolean(replaced &&
          (replaced.leaveType === 'maternity' || replaced.absenceReason === 'maternity'));
        return (
          <div className="apple-card" style={{ padding:'14px 15px' }}>
            <p style={{ fontSize:16.7, fontWeight:800, color:'var(--purple)', marginBottom:9 }}>מילוי מקום</p>
            <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              <input list="school-teachers" className="apple-input" style={{ ...inputStyle, width:'100%' }}
                placeholder="מי מילאה מקום…" value={subName}
                onChange={e => { setSubName(e.target.value); setSubState(''); }} />
              <input list="school-teachers" className="apple-input" style={{ ...inputStyle, width:'100%' }}
                placeholder="במקום מי…" value={subFor}
                onChange={e => { setSubFor(e.target.value); setSubState(''); }} />
              {maternitySub ? (
                <>
                  <LinkField label="שעות שבועיות" value={subHours} onChange={v => setSubHours(v)} />
                  <p style={{ fontSize:13.8, color:'var(--purple)', fontWeight:600 }}>
                    מילוי מקום לחופשת לידה — מדווחים שעות שבועיות בלבד, בלי תאריכים.
                  </p>
                </>
              ) : (
                <>
                  <div className="apple-seg" style={{ alignSelf:'flex-start' }}>
                    <button onClick={() => setSubMode('day')} className={['apple-seg-item', subMode === 'day' ? 'active' : ''].join(' ')}
                      style={{ padding:'6px 13px', fontSize:14.4 }}>יומי</button>
                    <button onClick={() => setSubMode('period')} className={['apple-seg-item', subMode === 'period' ? 'active' : ''].join(' ')}
                      style={{ padding:'6px 13px', fontSize:14.4 }}>לתקופה</button>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:9 }}>
                    <LinkField label={subMode === 'day' ? 'תאריך' : 'מתאריך'} type="date" value={subFrom}
                      onChange={v => setSubFrom(v)} />
                    {subMode === 'period' && (
                      <LinkField label="עד תאריך" type="date" value={subTo} onChange={v => setSubTo(v)} />
                    )}
                    <LinkField label={'שעות ממ' + '"' + 'מ'} value={subHours} onChange={v => setSubHours(v)} />
                  </div>
                </>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:10 }}>
              <button className="apple-btn apple-btn-blue" disabled={locked || subState === 'saving' || !subT}
                onClick={() => saveSub(maternitySub)} style={{ minHeight:40, paddingInline:20, opacity: (locked || !subT) ? .45 : 1 }}>
                {subState === 'saving' ? 'שומרת…' : 'הוספת מילוי מקום'}
              </button>
              {subState === 'saved' && <span style={{ fontSize:14.4, color:'var(--ok)', fontWeight:600 }}>✓ נשמר</span>}
              {subState && !['saving','saved'].includes(subState) &&
                <span style={{ fontSize:13.8, color:'var(--danger)' }}>{subState}</span>}
            </div>
          </div>
        );
      })()}

      {/* ── מה שדווח החודש ── */}
      <p style={{ fontSize:14.9, fontWeight:700, color:'var(--text2)', marginTop:2 }}>
        {reported.length ? `דווח החודש (${reported.length})` : 'עוד לא דווח דבר החודש'}
      </p>
      {reported.map(t => (
        <div key={t.id} className="apple-card"
          style={{ padding:'11px 14px', borderRight:'3px solid var(--purple)',
            display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <div>
            <p style={{ fontSize:15.5, fontWeight:700, color:'var(--text)' }}>{t.name}</p>
            <p style={{ fontSize:13.2, color:'var(--text3)' }}>
              {(() => {
                const replaced = byName(t.mmFor);
                const weekly = Boolean(replaced &&
                  (replaced.leaveType === 'maternity' || replaced.absenceReason === 'maternity'));
                return [
                  (t.absenceDays || 0) > 0 ? `${t.absenceDays} ימי היעדרות` : '',
                  t.absenceReason ? reasonLabel(t.absenceReason) : '',
                  t.sickFormPath ? '📎 טופס מצורף' : '',
                  onLeave(t) ? leaveText(t) : '',
                  (t.mmHours || 0) > 0 ? `${t.mmHours} שעות ממ"מ${weekly ? ' שבועיות' : ''}` : '',
                  t.mmFor ? `במקום ${t.mmFor}${weekly ? ' (חל"ד)' : ''}` : '',
                  t.mmFrom ? (!t.mmTo || t.mmTo === t.mmFrom ? `ב-${fmtD(t.mmFrom)}` : `${fmtD(t.mmFrom)} – ${fmtD(t.mmTo)}`) : '',
                ].filter(Boolean).join(' · ');
              })()}
            </p>
          </div>
          {!locked && (
            <div style={{ display:'flex', gap:6 }}>
              <button className="apple-btn apple-btn-ghost" onClick={() => editReport(t)}
                style={{ minHeight:34, paddingInline:12, fontSize:13.8 }}>עדכון</button>
              <button className="apple-btn apple-btn-ghost" onClick={() => deleteReport(t)}
                style={{ minHeight:34, paddingInline:12, fontSize:13.8, color:'var(--danger)' }}>מחיקה</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ═══ קליטת עובדת הוראה — קישור אישי ═══ */
// שנת המס של הטופס. הטופס הרשמי נושא שנה, ומי שממלאת אותו בינואר
// ממלאת על השנה החדשה — לכן הוא נגזר ולא מוקלד.
const TAX_YEAR = new Date().getFullYear();
const OB_DEADLINE = 'יום שלישי, 8.9.2026';

// חתימה מצוירת באצבע או בעכבר
/* ═══════════════════════════════════════════════════════════════
   טופס 101 להדפסה — במבנה הרשמי

   מה שהמורה מילאה על המסך, מסודר כפי שהטופס הרשמי מסודר, עם החתימה
   שלה מוטבעת. זה המסמך שנשמר בתיק ומוצג בביקורת ניכויים.

   שדה שלא מולא נשאר ריק ומסומן בקו — לא ממציאים ולא משלימים. טופס
   שמופיע בו נתון שאיש לא מסר גרוע מטופס חסר.

   מספר תיק הניכויים של הרשת אינו במערכת, ולכן הוא מוצג כשדה ריק
   למילוי ידני. ניחוש שלו היה הופך את המסמך לשקר.
═══════════════════════════════════════════════════════════════ */
// תא בטופס המודפס: תווית קטנה וערך על קו. ריק נשאר ריק — לא ממציאים.
const F101Field = ({ label, value, w = '1 1 150px' }) => (
  <div style={{ flex: w, minWidth: 0 }}>
    <p style={{ fontSize: 9, color: '#555' }}>{label}</p>
    <p style={{ fontSize: 12, fontWeight: 600, borderBottom: '1px solid #999', minHeight: 18, paddingBottom: 1 }}>
      {value || ' '}
    </p>
  </div>
);

function Form101Print({ row, onClose }) {
  const [sig, setSig] = useState(null);
  const f = row.form101 || {};

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!row.signature_path) return;
      try { const u = await store.obDownload(row.signature_path); if (alive) setSig(u); } catch { /* חתימה חסרה — המסמך עדיין תקף להדפסה */ }
    })();
    return () => { alive = false; };
  }, [row.signature_path]);

  const day = d => (d ? String(d).split('-').reverse().join('/') : '');
  const yn = v => (v === 'yes' ? 'כן' : v === 'no' ? 'לא' : '');
  const CREDITS = [
    ['creditResident', 'תושב/ת ישראל'], ['creditNewImmigrant', 'עולה חדש/ה'],
    ['creditSoldier', 'חייל/ת משוחרר/ת'], ['creditDegree', 'תואר אקדמי / לימודי מקצוע'],
    ['creditSingleParent', 'הורה יחיד'], ['creditDisabled', 'ילד נטול יכולת'],
    ['creditAlimony', 'תשלום מזונות'], ['creditSettlement', 'תושב/ת יישוב מזכה'],
  ];

  return (
    <div className="print-sheet modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:80, overflowY:'auto' }} dir="rtl">
      <div className="modal-card" style={{ maxWidth:820, margin:'20px auto', background:'#fff', padding:'26px 30px', borderRadius:8 }}>
        <div className="no-print modal-head" style={{ display:'flex', justifyContent:'space-between', marginBottom:16, gap:8, flexWrap:'wrap', background:'#fff' }}>
          <button className="apple-btn apple-btn-blue" onClick={() => window.print()}>
            <Printer size={15} strokeWidth={2.2} />הדפסה / שמירה כ-PDF
          </button>
          <button className="apple-btn apple-btn-ghost" onClick={onClose}>סגירה</button>
        </div>

        <div style={{ textAlign:'center', borderBottom:'2px solid #000', paddingBottom:6, marginBottom:10 }}>
          <p style={{ fontSize:15, fontWeight:800 }}>טופס 101 — כרטיס עובד</p>
          <p style={{ fontSize:11 }}>הצהרה לצורך חישוב מס הכנסה · שנת המס {row.form101_signed_at ? new Date(row.form101_signed_at).getFullYear() : TAX_YEAR}</p>
        </div>

        <p style={{ fontSize:11, fontWeight:800, background:'#eee', padding:'3px 6px', margin:'10px 0 6px' }}>א · פרטי המעסיק</p>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <F101Field label="שם המעסיק" value='רשת גני חב"ד' w="1 1 220px" />
          <F101Field label="מספר תיק ניכויים" value="" />
        </div>

        <p style={{ fontSize:11, fontWeight:800, background:'#eee', padding:'3px 6px', margin:'10px 0 6px' }}>ב · פרטי העובד/ת</p>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <F101Field label="שם משפחה" value={f.lastName} />
          <F101Field label="שם פרטי" value={f.firstName} />
          <F101Field label="מספר זהות" value={f.tz || row.tz_id} />
          <F101Field label="תאריך לידה" value={day(f.birth)} />
          <F101Field label="תאריך עלייה" value={day(f.aliyaDate)} />
          <F101Field label="מין" value={f.sex === 'm' ? 'זכר' : f.sex === 'f' ? 'נקבה' : ''} />
          <F101Field label="מצב משפחתי" value={f.marital} />
          <F101Field label="רחוב ומספר" value={f.address} w="1 1 220px" />
          <F101Field label="יישוב" value={f.city} />
          <F101Field label="מיקוד" value={f.zip} />
          <F101Field label="טלפון" value={f.phone || row.phone} />
          <F101Field label='דוא"ל' value={f.email} w="1 1 200px" />
          <F101Field label="תושב/ת ישראל" value={f.resident === 'no' ? 'לא' : 'כן'} />
        </div>

        {f.marital === 'נשואה' && (<>
          <p style={{ fontSize:11, fontWeight:800, background:'#eee', padding:'3px 6px', margin:'10px 0 6px' }}>ג · פרטי בן/בת הזוג</p>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <F101Field label="שם מלא" value={f.spouseName} w="1 1 220px" />
            <F101Field label="מספר זהות" value={f.spouseTz} />
            <F101Field label="תאריך לידה" value={day(f.spouseBirth)} />
            <F101Field label="יש הכנסה" value={yn(f.spouseIncome)} />
          </div>
        </>)}

        <p style={{ fontSize:11, fontWeight:800, background:'#eee', padding:'3px 6px', margin:'10px 0 6px' }}>ד · ילדים</p>
        {(f.children || []).length === 0
          ? <p style={{ fontSize:11, color:'#555' }}>לא דווחו ילדים.</p>
          : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead><tr style={{ background:'#f3f3f3' }}>
                <th style={{ border:'1px solid #bbb', padding:3 }}>שם</th>
                <th style={{ border:'1px solid #bbb', padding:3 }}>מספר זהות</th>
                <th style={{ border:'1px solid #bbb', padding:3 }}>תאריך לידה</th>
                <th style={{ border:'1px solid #bbb', padding:3 }}>בחזקתי</th>
              </tr></thead>
              <tbody>
                {(f.children || []).map((c, i) => (
                  <tr key={i}>
                    <td style={{ border:'1px solid #bbb', padding:3 }}>{c.name || ''}</td>
                    <td style={{ border:'1px solid #bbb', padding:3, direction:'ltr', textAlign:'center' }}>{c.tz || ''}</td>
                    <td style={{ border:'1px solid #bbb', padding:3, textAlign:'center' }}>{day(c.birth)}</td>
                    <td style={{ border:'1px solid #bbb', padding:3, textAlign:'center' }}>{c.custody === false ? 'לא' : 'כן'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        <p style={{ fontSize:11, fontWeight:800, background:'#eee', padding:'3px 6px', margin:'10px 0 6px' }}>ה · הכנסות</p>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <F101Field label="זו הכנסתי היחידה" value={f.otherIncome === 'no' ? 'כן' : f.otherIncome === 'yes' ? 'לא' : ''} />
          <F101Field label="מעסיק נוסף" value={f.otherEmployer} w="1 1 200px" />
          <F101Field label="סוג ההכנסה הנוספת" value={f.otherKind} />
          <F101Field label='עבד/ה בעבר ברשת גני חב"ד' value={f.workedBefore === 'yes' ? 'כן' : f.workedBefore === 'no' ? 'לא' : ''} />
          <F101Field label="קרן פנסיה" value={f.pensionFund} w="1 1 180px" />
        </div>

        <p style={{ fontSize:11, fontWeight:800, background:'#eee', padding:'3px 6px', margin:'10px 0 6px' }}>ו · בקשה לנקודות זיכוי</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 16px', fontSize:11 }}>
          {CREDITS.map(([k, l]) => (
            <span key={k} style={{ flex:'0 0 45%' }}>{f[k] ? '☒' : '☐'} {l}</span>
          ))}
        </div>

        <p style={{ fontSize:11, fontWeight:800, background:'#eee', padding:'3px 6px', margin:'10px 0 6px' }}>ז · הצהרה וחתימה</p>
        <p style={{ fontSize:11, lineHeight:1.6 }}>
          אני מצהיר/ה כי הפרטים שמסרתי בטופס זה מלאים ונכונים, וידוע לי שמסירת פרטים לא נכונים
          היא עבירה על פקודת מס הכנסה.
        </p>
        <div style={{ display:'flex', gap:24, alignItems:'flex-end', marginTop:10 }}>
          <div style={{ flex:'0 0 200px' }}>
            <p style={{ fontSize:9, color:'#555' }}>חתימה</p>
            {sig
              ? <img src={sig} alt="חתימה" style={{ height:56, borderBottom:'1px solid #999', display:'block' }} />
              : <div style={{ height:56, borderBottom:'1px solid #999' }} />}
          </div>
          <F101Field label="תאריך החתימה" value={row.form101_signed_at ? day(String(row.form101_signed_at).slice(0, 10)) : ''} />
        </div>

        <p style={{ fontSize:9, color:'#666', marginTop:14, borderTop:'1px solid #ccc', paddingTop:6 }}>
          הופק ממערכת השכר של רשת גני חב"ד. הנתונים נמסרו וניחתמו דיגיטלית בידי העובד/ת
          {row.form101_signed_at ? ` בתאריך ${day(String(row.form101_signed_at).slice(0, 10))}` : ''}.
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   תיק המסמכים של עובד/ת — פאנל צד, לא חלון קופץ.

   "אני רוצה צפיה בכל טופס עם אפשרות שמירה" ואז "החלון מסתיר את
   הטפסים" (שרה, 6.9): המסמך מוצג בצד שמאל, הטבלה נשארת גלויה מימין,
   ולחיצה על כל ✓ או שם אחר מחליפה את התוכן בלי לסגור. הקובץ יורד
   כ-objectURL מקומי; שם הקובץ לשמירה נבנה מהעובד/ת והמסמך, לא
   מהנתיב הפנימי.
═══════════════════════════════════════════════════════════════ */
const OB_DOCS = [
  ['form101_file_path',       'טופס 101 סרוק'],
  ['id_doc_path',             'צילום תעודת זהות'],
  ['salary_form_path',        'טופס נתוני שכר'],
  ['ministry_file_path',      'אסמכתת תיק משרד החינוך'],
  ['police_doc_path',         'אישור משטרה'],
  ['tax_coord_path',          'אישור תיאום מס'],
  ['bank_doc_path',           'אישור ניהול חשבון'],
  ['contract_signature_path', 'חתימה על החוזה'],
];
const OB_PANEL_W = 'min(520px, 100vw)';
function ObPanel({ row, path, label, onSelect, onClose, onPrint101 }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const docs = OB_DOCS.filter(([k]) => row[k]);
  const ext = p => (String(p || '').split('.').pop() || 'bin').toLowerCase();
  const cur = path ? ext(path) : '';
  const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(cur);
  const isPdf = cur === 'pdf';

  useEffect(() => {
    setUrl(null); setErr('');
    if (!path) return undefined;
    let alive = true; let made = null;
    (async () => {
      try { const u = await store.obDownload(path); made = u; if (alive) setUrl(u); else URL.revokeObjectURL(u); }
      catch (e) { if (alive) setErr(e.message || 'הורדת הקובץ נכשלה'); }
    })();
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [path]);

  const fname = (p, l) => `${row.name} - ${l}.${ext(p)}`;
  const save = async (p, l) => {
    const u = (p === path && url) ? url : await store.obDownload(p);
    const a = document.createElement('a'); a.href = u; a.download = fname(p, l); a.click();
    if (u !== url) setTimeout(() => URL.revokeObjectURL(u), 30000);
  };
  const openTab = async (p) => {
    // הכרטיסייה נפתחת בסינכרון עם הלחיצה — אחרת חוסם החלונות הקופצים עוצר אותה
    const w = window.open('', '_blank');
    try { w.location = (p === path && url) ? url : await store.obDownload(p); } catch (e) { w.close(); alert(e.message); }
  };
  const saveAll = async () => {
    setBusy('מוריד…');
    try { for (const [k, l] of docs) { await save(row[k], l); await new Promise(r => setTimeout(r, 400)); } }
    catch (e) { alert(e.message); }
    setBusy('');
  };
  const b = row.bank || {};
  const bankLine = `${row.name}: בנק ${b.bank || '—'}, סניף ${b.branch || '—'}, חשבון ${b.account || '—'}, ע"ש ${b.owner || row.name}`;
  const copyBank = () => { navigator.clipboard.writeText(bankLine); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const rowBtn = { minHeight:30, padding:'0 8px', fontSize:13.2 };

  return (
    <aside dir="rtl" style={{ position:'fixed', top:0, bottom:0, left:0, width:OB_PANEL_W, zIndex:80,
      background:'var(--bg)', borderInlineStart:'1px solid var(--fill)', boxShadow:'0 0 28px rgba(26,11,53,0.18)',
      display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'12px 14px 8px', borderBottom:'1px solid var(--fill)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <div style={{ minWidth:0 }}>
          <p style={{ fontWeight:800, fontSize:16.5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{row.name}</p>
          <p style={{ fontSize:12.7, color:'var(--text3)' }}>{row.schools?.name || ''}{row.phone ? ` · ${row.phone}` : ''}</p>
        </div>
        <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ minHeight:32, flexShrink:0 }}><X size={14} /> סגירה</button>
      </div>

      {/* רשימת המסמכים — קומפקטית, כדי שהתצוגה למטה תקבל את רוב הגובה */}
      <div style={{ padding:'6px 14px', borderBottom:'1px solid var(--fill)', maxHeight:'42vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'6px 0' }}>
          <span style={{ fontSize:14.4, fontWeight:600 }}>טופס 101</span>
          {row.form101_signed_at
            ? <button className="apple-btn apple-btn-ghost" onClick={onPrint101} style={rowBtn}><Printer size={13} /> צפייה / PDF</button>
            : <span style={{ fontSize:12.7, color:'var(--text3)' }}>טרם נחתם</span>}
        </div>
        {docs.map(([k, l]) => {
          const active = row[k] === path;
          return (
            <div key={k} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'5px 6px', margin:'0 -6px',
              borderRadius:8, background: active ? '#F3EEFB' : 'transparent' }}>
              <button onClick={() => onSelect(row[k], l)} title="הצגה בפאנל"
                style={{ background:'none', border:0, cursor:'pointer', padding:0, font:'inherit', fontSize:14.4, fontWeight: active ? 800 : 600, color: active ? '#4A3A8A' : 'inherit', textAlign:'start' }}>
                {l}<span style={{ color:'var(--text3)', fontWeight:400, fontSize:12 }}> · {ext(row[k]).toUpperCase()}</span>
              </button>
              <span style={{ display:'flex', gap:3, flexShrink:0 }}>
                <button className="apple-btn apple-btn-ghost" onClick={() => openTab(row[k])} title="במציג של הדפדפן" style={rowBtn}><ExternalLink size={13} /></button>
                <button className="apple-btn apple-btn-ghost" onClick={() => save(row[k], l).catch(e => alert(e.message))} title="שמירה" style={rowBtn}><Download size={13} /></button>
              </span>
            </div>
          );
        })}
        {!docs.length && <p style={{ fontSize:13.2, color:'var(--text3)', padding:'5px 0' }}>עוד לא הועלו קבצים.</p>}
        {row.bank_saved_at && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'6px 0', fontSize:13.8 }}>
            <span><span style={{ fontWeight:600 }}>בנק:</span> <span dir="ltr">{b.bank || '—'} · {b.branch || '—'} · {b.account || '—'}</span>{b.owner && b.owner !== row.name ? <span style={{ color:'var(--text3)' }}> · ע"ש {b.owner}</span> : null}</span>
            <button className="apple-btn apple-btn-ghost" onClick={copyBank} style={rowBtn}>{copied ? 'הועתק ✓' : 'העתקה'}</button>
          </div>
        )}
        {docs.length > 0 && (
          <button className="apple-btn apple-btn-ghost" onClick={saveAll} disabled={!!busy} style={{ ...rowBtn, marginTop:4, width:'100%' }}>
            <Download size={13} /> {busy || `הורדת הכול (${docs.length})`}
          </button>
        )}
      </div>

      {/* התצוגה — מקבלת את שאר הגובה */}
      <div style={{ flex:1, minHeight:0, background:'var(--fill)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'auto' }}>
        {!path ? <p style={{ color:'var(--text3)', fontSize:14.4, padding:20, textAlign:'center' }}>בחרי מסמך מהרשימה — יוצג כאן.</p> :
         err ? <p style={{ color:'#C62828', padding:20, fontSize:14.4 }}>{err}</p> :
         !url ? <p style={{ color:'var(--text3)', padding:20 }}>טוען…</p> :
         isImg ? <img src={url} alt={label} style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} /> :
         isPdf ? <iframe title={label} src={url} style={{ width:'100%', height:'100%', border:0, background:'#fff' }} /> :
         <p style={{ padding:20, fontSize:14.4 }}>אין תצוגה מקדימה ל-{cur.toUpperCase()} — "שמירה" תוריד אותו.</p>}
      </div>
      {path && url && (
        <div style={{ padding:'8px 14px', borderTop:'1px solid var(--fill)', display:'flex', gap:8 }}>
          <a className="apple-btn apple-btn-blue" href={url} download={fname(path, label)} style={{ flex:1, minHeight:34, textDecoration:'none', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <Download size={14} /> שמירה — {label}
          </a>
          <button className="apple-btn apple-btn-ghost" onClick={() => window.open(url, '_blank')} title="במציג של הדפדפן" style={{ minHeight:34 }}><ExternalLink size={14} /></button>
        </div>
      )}
    </aside>
  );
}

// dataURL של החתימה → File להעלאה (החתימה נקלטת כמחרוזת סינכרונית)
function dataUrlToFile(dataUrl, name) {
  const [head, b64] = String(dataUrl).split(',');
  const mime = (head.match(/:(.*?);/) || [])[1] || 'image/png';
  const bin = atob(b64 || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

function SignaturePad({ onChange }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const pos = e => {
    /*
      הבאפר 400×140 אבל ה-CSS במובייל צר יותר — בלי תרגום קנה מידה
      הקו נרשם מוסט מהאצבע (נמדד: יחס 1.25 באייפון). מתרגמים תמיד.
    */
    const r = ref.current.getBoundingClientRect();
    const p2 = e.touches ? e.touches[0] : e;
    return {
      x: (p2.clientX - r.left) * (ref.current.width / r.width),
      y: (p2.clientY - r.top) * (ref.current.height / r.height),
    };
  };
  const start = e => { drawing.current = true; const c = ref.current.getContext('2d'); const { x, y } = pos(e); c.beginPath(); c.moveTo(x, y); e.preventDefault(); };
  const move  = e => { if (!drawing.current) return; const c = ref.current.getContext('2d');
    c.lineWidth = 2.2; c.lineCap = 'round'; c.strokeStyle = '#1A0B35';
    const { x, y } = pos(e); c.lineTo(x, y); c.stroke(); dirty.current = true; e.preventDefault(); };
  /*
    קליטה סינכרונית (toDataURL) ולא toBlob האסינכרוני: מורה שחתמה ומיד
    לחצה "שליחה" קיבלה "יש לחתום" כי ה-blob עוד לא הוחזר (מרוץ, נמדד
    6.9). toDataURL מחזיר מחרוזת מיד — אין חלון שבו החתימה "לא נקלטה".
    onTouchCancel נוסף: בנייד המערכת מבטלת מגע לפעמים בלי touchend.
  */
  const end = () => { if (drawing.current && dirty.current) onChange(ref.current.toDataURL('image/png')); drawing.current = false; };
  const clear = () => { const c = ref.current.getContext('2d'); c.clearRect(0, 0, 400, 140); dirty.current = false; onChange(null); };
  return (
    <div>
      <canvas ref={ref} width={400} height={140}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}
        style={{ width:'100%', maxWidth:400, height:140, background:'#fff', border:'2px dashed var(--line)', borderRadius:12, touchAction:'none', display:'block' }} />
      <button type="button" onClick={clear} className="apple-btn apple-btn-ghost" style={{ marginTop:6, minHeight:30, padding:'0 12px', fontSize:13.8 }}>ניקוי חתימה</button>
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
        <p style={{ fontWeight:700, fontSize:16.1, color:'var(--text)' }}>{label}</p>
        <p style={{ fontSize:13.8, color:'var(--text3)' }}>{busy ? 'מעלה…' : done ? 'הועלה ✓ — אפשר להחליף' : hint}</p>
      </div>
    </label>
  );
}


/* ═══════════════════════════════════════════════════════════════
   הסכם ההעסקה — מרונדר ומלא, לחתימה דיגיטלית (שרה, 3.9.2026)

   "הודעה בדבר פירוט תנאי עבודה / עובדי הוראה" של רשת גני חב"ד
   בארה"ק, במבנה המסמך שמסרה שרה: תקופת החוזה 1.9.26–30.8.27,
   הפרטים והשעות נמשכים מהשורה; למנהלים — 40 שעות. הכול מוצג
   למורה לפני החתימה, והחתימה נטבעת על אותו מסמך.
═══════════════════════════════════════════════════════════════ */
const CONTRACT_FROM = '01.09.2026';
const CONTRACT_TO   = '31.08.2027';
function ContractDoc({ me, form, sigUrl }) {
  const isPrincipal = me.gamul_role === 'principal';
  const hours = isPrincipal ? 40 : (Number(me.frontal_hours) || '____');
  const roleLabel = isPrincipal ? 'מנהל/ת בית ספר' : 'עובד/ת הוראה';
  const Sec = ({ n, children }) => (
    <p style={{ fontSize:14.9, margin:'7px 0', lineHeight:1.65 }}><b>{n}.</b> {children}</p>
  );
  // "חסר דגשים" (שרה, 3.9): הפרטים שמולאו אוטומטית מובלטים על רקע רך
  const Hl = ({ dir, children }) => (
    <b dir={dir} style={{ background:'#F3EEFB', color:'#4A3A8A', padding:'1px 7px',
      borderRadius:6, fontWeight:800, boxDecorationBreak:'clone', WebkitBoxDecorationBreak:'clone' }}>{children}</b>
  );
  const cell = { border:'1px solid #cbc3e3', padding:'5px 7px', textAlign:'center', fontSize:13.2 };
  const head = { ...cell, background:'#EDE8F8', fontWeight:700 };
  // במובייל הטבלאות גוללות בתוך עצמן — העמוד לעולם לא זז הצידה
  const Twrap = ({ children }) => (
    <div style={{ overflowX:'auto', margin:'8px 0' }}>
      <table style={{ width:'100%', minWidth:420, borderCollapse:'collapse' }}>{children}</table>
    </div>
  );
  return (
    <div style={{ background:'#fff', border:'1px solid var(--line)', borderRadius:12, padding:'16px clamp(10px, 4vw, 22px)', margin:'10px 0' }}>
      <p style={{ textAlign:'center', fontSize:17.2, fontWeight:800, textDecoration:'underline', marginBottom:12 }}>
        הודעה בדבר פירוט תנאי עבודה / עובדי הוראה
      </p>
      <Sec n="1">שם המעסיקה: <b>רשת גני חב"ד</b> · אישיות משפטית: ע.ר. 58-0141-026 ·
        מען: ת.ד 271 כפר חב"ד (להלן — "המעסיקה")<br/>
        שם העובד/ת: <Hl>{me.name}</Hl> · מס' זהות: <Hl dir="ltr">{form.tz || me.tz_id || '____'}</Hl> ·
        כתובת: <Hl>{[form.address, form.city].filter(Boolean).join(', ') || '____'}</Hl></Sec>
      <Sec n="2">תאריך תחילת העבודה: <Hl>{CONTRACT_FROM}</Hl> ·
        תקופת החוזה מיום <Hl>{CONTRACT_FROM}</Hl> עד יום <Hl>{CONTRACT_TO}</Hl><br/>
        סיבת קציבת תקופת העבודה: חוסר יציבות כלכלית</Sec>
      <Sec n="3">תפקידו/ה העיקרי של העובד/ת: <Hl>{roleLabel}</Hl> · <Hl>{me.school_name}</Hl></Sec>
      <Sec n="4">הממונה הישיר/ה של העובד/ת: {isPrincipal
        ? <Hl>הנהלת הרשת</Hl>
        : <Hl>מנהל/ת בית הספר{me.principal_name ? ` — ${me.principal_name}` : ''}</Hl>}</Sec>
      <Sec n="5">הבסיס שלפיו משולם השכר: משכורת חודשית</Sec>
      <Sec n="6">שכר עבודתו/ה של העובד/ת נקבע על פי דירוג, בהתאם לטופס נתוני ההעסקה
        <b> מפורטל עובדי הוראה של משרד החינוך</b>.</Sec>
      <Twrap>
        <thead>
          <tr><th style={head} colSpan={2}>תשלומים קבועים</th></tr>
          <tr><th style={head}>סוג התשלום</th><th style={head}>מועד התשלום</th></tr>
        </thead>
        <tbody>
          <tr><td style={cell}>שכר בסיס ותוספות על פי התקנות</td><td style={cell}>9 לחודש</td></tr>
          <tr><td style={cell}>נסיעות</td><td style={cell}>9 לחודש</td></tr>
          <tr><td style={cell}>הבראה חודשית</td><td style={cell}>9 לחודש</td></tr>
          <tr><td style={cell}>ביגוד חודשית (לעובדי הוראה ומינהל בלבד)</td><td style={cell}>9 לחודש</td></tr>
        </tbody>
      </Twrap>
      <Sec n="7">אורכו של שבוע העבודה הרגיל של העובד/ת: {(() => {
        if (isPrincipal) return <Hl>40 שעות</Hl>;
        const fh = Number(me.frontal_hours) || 0;
        if (me.reform === 'ofek' && fh > 0) {
          // הפירוט פרונטלי/פרטני/שהייה — רק לעובדות אופק (שרה, 3.9)
          // מין, ילדים וגיל קובעים את עמודת הטבלה הרשמית (אם / שעות גיל) —
          // בלעדיהם ההסכם הציג לאם את עמודת המורה הרגילה (שרה, 6.9)
          const d = deriveHours({ reform: 'ofek', level: me.level, frontalHours: me.frontal_hours,
            scopePct: me.scope_pct, scope: me.scope_pct,
            gender: me.gender, childrenUnder18: me.children_under_18, ageGroup: me.age_group });
          // תיקון ידני של המנהלת גובר על הטבלה — זה מה שהמורה חותמת עליו
          const ind = me.individual_hours ?? d?.individual ?? 0;
          const pres = me.presence_hours ?? d?.presence ?? 0;
          return <Hl>{fh} שעות פרונטליות + {ind} שעות פרטניות + {pres} שעות שהייה = {fh + ind + pres} שעות</Hl>;
        }
        // עולם ישן: פרונטליות בלבד; מחנכת — בתוספת 3 שעות חינוך
        if (fh > 0 && (me.gamul_role || '').startsWith('homeroom'))
          return <Hl>{fh} שעות פרונטליות + 3 שעות חינוך = {fh + 3} שעות</Hl>;
        return <Hl>{hours} שעות פרונטליות</Hl>;
      })()}</Sec>
      <Sec n="8">תשלומים בעבור תנאים סוציאליים שהעובד/ת זכאי/ת להם:</Sec>
      <Twrap>
        <thead>
          <tr>
            <th style={head}>סוג התשלום</th><th style={head}>הגוף המקבל ושם התוכנית</th>
            <th style={head}>הפרשת העובד/ת</th><th style={head}>הפרשת המעסיקה</th><th style={head}>תחילת התשלום</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={cell}>פנסיה</td><td style={cell}>קרן פנסיה ברירת מחדל</td><td style={cell}>6%</td><td style={cell}>7%</td><td style={cell}>תחילת העסקה</td></tr>
          <tr><td style={cell}>קרן השתלמות</td><td style={cell}>קרן השתלמות של עובדי הוראה</td><td style={cell}>4.2%</td><td style={cell}>8.4%</td><td style={cell}>תחילת העסקה</td></tr>
        </tbody>
      </Twrap>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginTop:16, gap:20 }}>
        <div>
          <p style={{ fontSize:13.2, color:'var(--text3)' }}>תאריך</p>
          <p style={{ fontSize:14.9, fontWeight:600, borderBottom:'1px solid #999', paddingBottom:2 }}>
            {new Date().toLocaleDateString('he-IL')}
          </p>
        </div>
        <div style={{ flex:'0 0 190px' }}>
          <p style={{ fontSize:13.2, color:'var(--text3)' }}>חתימת העובד/ת</p>
          {sigUrl
            ? <img src={sigUrl} alt="חתימה" style={{ height:52, borderBottom:'1px solid #999', display:'block' }} />
            : <div style={{ height:52, borderBottom:'1px solid #999' }} />}
        </div>
      </div>
    </div>
  );
}

function OnboardingView({ code }) {
  const [me, setMe] = useState(null);
  const [state, setState] = useState('loading');
  const [form, setForm] = useState({});
  const [sig, setSig] = useState(null);
  const [contractSig, setContractSig] = useState(null);
  const [bank, setBank] = useState({});
  // "עשתה טעות ולא יכולה לתקן" (שרה, 15.9): פרטי בנק שנשמרו ניתנים לעריכה
  const [editBank, setEditBank] = useState(false);
  const [bankChanged, setBankChanged] = useState(false);
  const [contractUrl, setContractUrl] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await store.obWhoami(code);
      if (!d) { setState('bad'); return; }
      setMe(d); setForm(f => ({ ...(d.form101 || {}), ...f })); setState('ok');
      // ההסכם מרונדר באפליקציה — אין PDF להוריד
    } catch { setState('bad'); }
  }, [code]);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  /*
    "תוכל למלא שלב שלב וכל אחד יישמר?" (שרה, 3.9) — כן: טיוטת ה-101
    נשמרת מעצמה שנייה וחצי אחרי כל שינוי. סגרה באמצע — ממשיכה מאותה
    נקודה. שאר השלבים (קבצים, בנק, הסכם) ממילא נשמרים מיד.
  */
  const draftTimer = useRef(null);
  useEffect(() => {
    if (state !== 'ok' || me?.form101_signed || !Object.keys(form).length) return undefined;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      // ת.ז. נשמרת גם לעמודה עצמה, לא רק בתוך הטופס — ההצלבה עם תלוש
      // הנהלת החשבונות קוראת את tz_id (שרה, 8.9). קצרה מדי = לא נשלחת.
      const tzPatch = String(form.tz ?? '').replace(/\D/g, '');
      store.obSave(code, { form101: form, ...(tzPatch.length >= 5 ? { tz_id: tzPatch } : {}) })
        .catch(() => { /* רשת רגעית — הניסיון הבא ישמור */ });
    }, 1500);
    return () => clearTimeout(draftTimer.current);
  }, [form, state, me?.form101_signed, code]);

  if (state === 'loading') return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }} dir="rtl"><p style={{ color:'var(--text3)' }}>טוען…</p></div>;
  if (state === 'bad') return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center' }} dir="rtl"><p style={{ fontWeight:700 }}>הקישור אינו תקף. פני לשרה הגר.</p></div>;

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  /*
    ת.ז. — מה שהוקלד גובר על מה שבמסד. form.tz הוא undefined עד
    ההקלדה הראשונה, ולכן `??` (ולא `||`) — כדי שמחיקה מלאה של השדה
    תישאר ריקה ולא תקפוץ בחזרה לערך הישן באמצע הקלדה.
  */
  const tz = form.tz ?? me.tz_id ?? '';
  // אסמכתת התיק ירדה: "אם יש נתוני שכר אז יש תיק במשרד" (שרה, 3.9).
  // אישור משטרה — חובה לגברים בלבד (חוק למניעת העסקה של עברייני מין).
  const isMale = me.gender === 'm';
  // "יש גם גברים" (שרה, 6.9): לשון הפנייה עוקבת אחרי המין שסומן בטופס
  // עצמו, ולפני שסומן — אחרי הרישום במערכת. ברירת המחדל נשארת נקבה.
  const male101 = (form.sex || (isMale ? 'm' : 'f')) === 'm';
  const pick = male101 ? 'בחר' : 'בחרי';
  const steps = [
    me.form101_signed, me.has_id_doc, me.has_salary_form,
    isMale ? me.has_police_doc : null,
    me.bank_saved,                                       // פרטי בנק — בלעדיהם אין לאן להעביר
    me.contract_available ? me.contract_signed : null,   // null = עוד לא זמין
  ];
  const doneCount = steps.filter(x => x === true).length;
  const totalSteps = steps.filter(x => x !== null).length;

  const sign101 = async () => {
    for (const [k, l] of [['firstName','שם פרטי'], ['lastName','שם משפחה'], ['birth','תאריך לידה'],
                          ['address','רחוב ומספר'], ['city','יישוב'], ['phone','טלפון'],
                          ['marital','מצב משפחתי'], ['otherIncome','האם זו הכנסתך היחידה']]) {
      if (!String(form[k] ?? '').trim()) { setMsg(`יש למלא ${l}`); return; }
    }
    if (!form.declare) { setMsg('יש לאשר את ההצהרה'); return; }
    if (!sig) { setMsg('יש לחתום במסגרת החתימה'); return; }
    setMsg('');
    const path = await store.obUpload(code, 'signature', dataUrlToFile(sig, 'signature.png'));
    await store.obSave(code, { form101: form, sign101: true, signature_path: path });
    await load();
  };
  /*
    פרטי בנק. בלעדיהם השכר אינו יכול לצאת, וזה היה השלב היחיד שנשאר
    מחוץ לקליטה המקוונת — הפרטים נמסרו בנייר או בוואטסאפ.

    מספר חשבון שהוקלד בטעות מעביר כסף לאדם אחר, ולכן האישור (צ׳ק מבוטל
    או אישור ניהול חשבון) אינו קישוט: הוא הראיה שמולה בודקים.
  */
  const saveBank = async () => {
    for (const [k, l] of [['bank','שם הבנק'], ['branch','מספר סניף'], ['account','מספר חשבון']]) {
      if (!String(bank[k] ?? '').trim()) { setMsg(`יש למלא ${l}`); return; }
    }
    setMsg('');
    await store.obSave(code, { bank: { ...bank, owner: (bank.owner || me.name) } });
    // פרטים ששונו אחרי שכבר צורף אישור — האישור הישן כבר לא מתאים להם
    if (editBank && me.has_bank_doc) setBankChanged(true);
    setEditBank(false);
    await load();
  };

  const upload = slotKey => async f => {
    const path = await store.obUpload(code, slotKey, f);
    await store.obSave(code, { [slotKey + '_path']: path });
    await load();
  };
  const signContract = async () => {
    if (!contractSig) { setMsg('יש לחתום במסגרת החתימה על החוזה'); return; }
    const path = await store.obUpload(code, 'contract-signature', dataUrlToFile(contractSig, 'contract-sig.png'));
    await store.obSave(code, { contract_signature_path: path, sign_contract: true });
    await load();
  };

  // הילדים הם רשימה ולא מספר: הטופס הרשמי מבקש שם, ת.ז. ותאריך לידה
  // לכל אחד, והם שקובעים את נקודות הזיכוי.
  const setChild = (i, k, v) => setForm(p => {
    const kids = [...(p.children || [])];
    kids[i] = { ...kids[i], [k]: v };
    return { ...p, children: kids };
  });
  const addChild = () => setForm(p => ({ ...p, children: [...(p.children || []), { custody: true }] }));
  const removeChild = i => setForm(p => ({ ...p, children: (p.children || []).filter((_, j) => j !== i) }));

  const field = (k, label, type = 'text', dir2) => (
    <div key={k} style={{ flex:'1 1 150px' }}>
      <p className="apple-label">{label}</p>
      <input type={type} dir={dir2} value={form[k] || ''} onChange={e => setF(k, e.target.value)} className="apple-input" style={{ width:'100%' }} />
    </div>
  );

  return (
    <div className="ob-page pb-safe-bottom" style={{ minHeight:'100vh', background:'var(--bg)', paddingBottom:60 }} dir="rtl">
      {/* "תוריד את הלוגו של הרשת, תכתוב בגדול רשת גני חב"ד" (שרה, 3.9) */}
      <header className="app-header"><div style={{ maxWidth:640, margin:'0 auto', padding:'12px 16px', display:'flex', alignItems:'center', gap:14 }}>
        <div>
          <p style={{ fontWeight:800, fontSize:21.8, letterSpacing:'-0.02em', color:'var(--purple)' }}>רשת גני חב"ד</p>
          <p style={{ fontWeight:700, fontSize:14.9 }}>קליטת עובד/ת הוראה
            <span style={{ fontWeight:400, color:'var(--text3)' }}> · {me.name} · {me.school_name}</span></p>
        </div>
      </div></header>

      <div style={{ maxWidth:640, margin:'0 auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
        {/* דדליין */}
        <div style={{ background:'var(--warn-bg)', border:'1px solid #FFB74D', borderRadius:12, padding:'10px 14px' }}>
          <p style={{ fontSize:14.9, fontWeight:700, color:'#E65100' }}>להשלמה עד {OB_DEADLINE}</p>
          <p style={{ fontSize:13.8, color:'#E65100' }}>רק מי שישלים/תשלים את כל השלבים עד למועד יקבל/תקבל משכורת על חודש ספטמבר.</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1, height:8, background:'var(--fill)', borderRadius:99 }}>
            <div style={{ width:(totalSteps ? Math.round(doneCount / totalSteps * 100) : 0) + '%', height:'100%', background:'var(--teal)', borderRadius:99, transition:'width .3s' }} />
          </div>
          {/* dir=ltr — בלעדיו "0 / 5" מתהפך ל"5 / 0" בהקשר העברי (ממצא QA) */}
          <span dir="ltr" style={{ fontSize:14.4, fontWeight:700, color:'var(--text2)' }}>{doneCount} / {totalSteps}</span>
        </div>

        {/* ── שלב 1: טופס 101 ── */}
        <div className="apple-card" style={{ padding:18 }}>
          <p style={{ fontWeight:800, fontSize:18.4, marginBottom:2 }}>1 · טופס 101 — כרטיס עובד</p>
          {me.form101_signed ? (
            <p style={{ color:'var(--ok)', fontWeight:700, fontSize:15.5, marginTop:6 }}>✓ מולא ונחתם. תודה!</p>
          ) : (<>
            <p style={{ fontSize:14.4, color:'var(--text3)', marginBottom:12 }}>
              שנת המס {TAX_YEAR} · המעסיקה: רשת גני חב"ד
            </p>

            {/* ── ב. פרטי העובדת ── */}
            <p style={{ fontWeight:700, fontSize:15.5, color:'var(--purple)', margin:'6px 0 8px' }}>פרטים אישיים</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
              {field('lastName','שם משפחה')}
              {field('firstName','שם פרטי')}
              {/*
                ת.ז. ניתנת לתיקון (שרה, 8.9). קודם היה כאן
                value={me.tz_id || form.tz} — כלומר מה שבמסד גבר על מה
                שהוקלד, וכל הקלדה נבלעה בלי הודעה. עכשיו ההקלדה גוברת,
                והמסד הוא רק נקודת הפתיחה. הערך נשמר גם ל-tz_id עצמו
                (ob_save, מיגרציה 20260908090000) כי ההצלבה עם תלוש
                הנהלת החשבונות נשענת על ת.ז. לפני השם.
              */}
              <div style={{ flex:'1 1 150px' }}><p className="apple-label">מספר זהות</p>
                <input value={tz} onChange={e => setF('tz', e.target.value.replace(/\D/g, '').slice(0, 9))}
                  className="apple-input" dir="ltr" inputMode="numeric" style={{ width:'100%' }} />
                {tz && tz.length < 5 && (
                  <p style={{ fontSize:12.6, color:'#B4650A', marginTop:3 }}>מספר זהות קצר מדי</p>
                )}</div>
              {field('birth','תאריך לידה','date')}
              {field('aliyaDate','תאריך עלייה — אם עלית','date')}
              <div style={{ flex:'1 1 130px' }}><p className="apple-label">מין</p>
                <select value={form.sex || 'f'} onChange={e => setF('sex', e.target.value)} className="apple-select" style={{ width:'100%' }}>
                  <option value="f">נקבה</option><option value="m">זכר</option>
                </select></div>
              <div style={{ flex:'1 1 150px' }}><p className="apple-label">מצב משפחתי</p>
                <select value={form.marital || ''} onChange={e => setF('marital', e.target.value)} className="apple-select" style={{ width:'100%' }}>
                  <option value="">{pick}</option>
                  {(male101 ? ['רווק', 'נשוי', 'גרוש', 'אלמן', 'פרוד']
                            : ['רווקה', 'נשואה', 'גרושה', 'אלמנה', 'פרודה'])
                    .map(o => <option key={o}>{o}</option>)}
                </select></div>
              {field('address','רחוב ומספר')}
              {field('city','יישוב')}
              {field('zip','מיקוד','text','ltr')}
              {field('phone','טלפון','tel','ltr')}
              {field('email','דוא"ל','email','ltr')}
              <div style={{ flex:'1 1 100%' }}><p className="apple-label">תושבות</p>
                <select value={form.resident || 'yes'} onChange={e => setF('resident', e.target.value)} className="apple-select" style={{ width:'100%' }}>
                  <option value="yes">{male101 ? 'תושב ישראל' : 'תושבת ישראל'}</option>
                  <option value="no">{male101 ? 'אינני תושב ישראל' : 'אינני תושבת ישראל'}</option>
                </select></div>
            </div>

            {/* ── ג. בן/בת הזוג ── (נשואה או נשוי — הערך נשמר לפי הלשון שנבחרה) */}
            {/^נשו/.test(form.marital || '') && (<>
              <p style={{ fontWeight:700, fontSize:15.5, color:'var(--purple)', margin:'14px 0 8px' }}>פרטי בן/בת הזוג</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                {field('spouseName','שם מלא')}
                {field('spouseTz','מספר זהות','text','ltr')}
                {field('spouseBirth','תאריך לידה','date')}
                <div style={{ flex:'1 1 100%' }}><p className="apple-label">האם יש לו/ה הכנסה?</p>
                  <select value={form.spouseIncome || ''} onChange={e => setF('spouseIncome', e.target.value)} className="apple-select" style={{ width:'100%' }}>
                    <option value="">{pick}</option><option value="yes">כן</option><option value="no">לא</option>
                  </select></div>
              </div>
            </>)}

            {/* ── ד. ילדים ── */}
            <p style={{ fontWeight:700, fontSize:15.5, color:'var(--purple)', margin:'14px 0 4px' }}>ילדים עד גיל 18</p>
            <p style={{ fontSize:13.2, color:'var(--text3)', marginBottom:8 }}>
              הם קובעים נקודות זיכוי. יש למלא שורה לכל ילד/ה.
            </p>
            {(form.children || []).map((c, i) => (
              <div key={i} style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'flex-end', marginBottom:8 }}>
                <div style={{ flex:'1 1 130px' }}><p className="apple-label">שם</p>
                  <input value={c.name || ''} className="apple-input" style={{ width:'100%' }}
                    onChange={e => setChild(i, 'name', e.target.value)} /></div>
                <div style={{ flex:'1 1 120px' }}><p className="apple-label">מספר זהות</p>
                  <input value={c.tz || ''} className="apple-input" dir="ltr" inputMode="numeric" style={{ width:'100%' }}
                    onChange={e => setChild(i, 'tz', e.target.value)} /></div>
                <div style={{ flex:'1 1 130px' }}><p className="apple-label">תאריך לידה</p>
                  <input type="date" value={c.birth || ''} className="apple-input" style={{ width:'100%' }}
                    onChange={e => setChild(i, 'birth', e.target.value)} /></div>
                <label style={{ fontSize:13.8, display:'flex', alignItems:'center', gap:5, paddingBottom:9 }}>
                  <input type="checkbox" checked={c.custody !== false}
                    onChange={e => setChild(i, 'custody', e.target.checked)} />
                  בחזקתי
                </label>
                <button className="apple-btn apple-btn-ghost" onClick={() => removeChild(i)}
                  style={{ minHeight:36, padding:'0 10px', color:'var(--danger)' }}>הסרה</button>
              </div>
            ))}
            <button className="apple-btn apple-btn-ghost" onClick={addChild} style={{ minHeight:36, fontSize:13.8 }}>
              + הוספת ילד/ה
            </button>

            {/* ── ה. הכנסות ── */}
            <p style={{ fontWeight:700, fontSize:15.5, color:'var(--purple)', margin:'14px 0 8px' }}>הכנסות</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
              <div style={{ flex:'1 1 100%' }}><p className="apple-label">האם זו הכנסתך היחידה?</p>
                <select value={form.otherIncome || ''} onChange={e => setF('otherIncome', e.target.value)} className="apple-select" style={{ width:'100%' }}>
                  <option value="">{pick}</option>
                  <option value="no">{`כן — זו הכנסתי היחידה, ${male101 ? 'מבקש' : 'מבקשת'} חישוב מס רגיל`}</option>
                  <option value="yes">לא — יש לי הכנסה נוספת, אמציא תיאום מס</option>
                </select></div>
              {form.otherIncome === 'yes' && (<>
                {field('otherEmployer','שם המעסיק הנוסף')}
                <div style={{ flex:'1 1 150px' }}><p className="apple-label">סוג ההכנסה הנוספת</p>
                  <select value={form.otherKind || ''} onChange={e => setF('otherKind', e.target.value)} className="apple-select" style={{ width:'100%' }}>
                    <option value="">{pick}</option><option>משכורת</option><option>קצבה</option>
                    <option>מלגה</option><option>עסק</option><option>אחר</option>
                  </select></div>
                <p style={{ flex:'1 1 100%', fontSize:13.2, color:'#E65100', fontWeight:600 }}>
                  {male101 ? 'שים לב' : 'שימי לב'}: בהמשך העמוד יש להעלות אישור תיאום מס.
                </p>
              </>)}
            </div>

            {/* ── עבודה קודמת ברשת וקרן פנסיה (שרה, 3.9) ── */}
            <p style={{ fontWeight:700, fontSize:15.5, color:'var(--purple)', margin:'14px 0 8px' }}>קרן פנסיה</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
              <div style={{ flex:'1 1 100%' }}><p className="apple-label">האם עבדת בעבר ברשת גני חב"ד?</p>
                <select value={form.workedBefore || ''} onChange={e => setF('workedBefore', e.target.value)} className="apple-select" style={{ width:'100%' }}>
                  <option value="">{pick}</option>
                  <option value="yes">כן — עבדתי בעבר ברשת גני חב"ד</option>
                  <option value="no">לא — זו העסקתי הראשונה ברשת</option>
                </select></div>
              {form.workedBefore === 'no' && field('pensionFund', 'שם קרן הפנסיה שלך')}
            </div>

            {/* ── ו. נקודות זיכוי ── */}
            <p style={{ fontWeight:700, fontSize:15.5, color:'var(--purple)', margin:'14px 0 4px' }}>בקשה לנקודות זיכוי</p>
            <p style={{ fontSize:13.2, color:'var(--text3)', marginBottom:8 }}>
              {male101 ? 'סמן את מה שחל עליך. לכל סעיף שתסמן' : 'סמני את מה שחל עלייך. לכל סעיף שתסמני'} יש לצרף אסמכתה.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[
                ['creditResident', male101 ? 'תושב ישראל' : 'תושבת ישראל'],
                ['creditNewImmigrant', male101 ? 'עולה חדש' : 'עולה חדשה'],
                ['creditSoldier', male101 ? 'חייל משוחרר / שירות לאומי' : 'חיילת משוחררת / שירות לאומי'],
                ['creditDegree', 'סיום תואר אקדמי או לימודי מקצוע'],
                ['creditSingleParent', 'הורה יחיד'],
                ['creditDisabled', 'ילד נטול יכולת'],
                ['creditAlimony', 'תשלום מזונות'],
                ['creditSettlement', male101 ? 'תושב יישוב מזכה' : 'תושבת יישוב מזכה'],
              ].map(([k, l]) => (
                <label key={k} style={{ display:'flex', gap:8, alignItems:'center', fontSize:14.4, color:'var(--text2)' }}>
                  <input type="checkbox" checked={!!form[k]} onChange={e => setF(k, e.target.checked)} />
                  {l}
                </label>
              ))}
            </div>

            <label style={{ display:'flex', gap:8, alignItems:'flex-start', marginTop:12, fontSize:14.4, color:'var(--text2)' }}>
              <input type="checkbox" checked={!!form.declare} onChange={e => setF('declare', e.target.checked)} style={{ marginTop:2 }} />
              <span>אני {male101 ? 'מצהיר' : 'מצהירה'} כי הפרטים שמסרתי בטופס זה מלאים ונכונים, וידוע לי שמסירת פרטים לא נכונים היא עבירה על פקודת מס הכנסה.</span>
            </label>
            <p className="apple-label" style={{ marginTop:12 }}>חתימה (בתוך המסגרת, באצבע או בעכבר)</p>
            <SignaturePad onChange={setSig} />
            {msg && <p style={{ color:'var(--danger)', fontSize:14.4, fontWeight:600, marginTop:8 }}>{msg}</p>}
            <button className="apple-btn apple-btn-blue" onClick={() => sign101().catch(e => setMsg(e.message))} style={{ marginTop:12, width:'100%', minHeight:44 }}>
              חתימה ושליחת טופס 101
            </button>
          </>)}
        </div>

        {/* ── שלבים 2–4: העלאות ── */}
        <ObUpload label="2 · צילום תעודת זהות" hint={male101 ? 'צלם או העלה קובץ' : 'צלמי או העלי קובץ'} done={me.has_id_doc} onFile={upload('id_doc')} />
        <ObUpload label="3 · טופס נתוני שכר — משרד החינוך" hint="הטופס מהפורטל של משרד החינוך" done={me.has_salary_form} onFile={upload('salary_form')} />
        {/* "אם אין פרטים במשרד החינוך יש לפתוח תיק מקוון על שם סמל המוסד" (שרה, 3.9) */}
        {!me.has_salary_form && (
          <p style={{ fontSize:13.2, color:'var(--text3)', lineHeight:1.7, margin:'-6px 4px 0' }}>
            אין לך עדיין פרטים בפורטל עובדי הוראה של משרד החינוך? יש לפתוח <b>תיק מקוון</b> בפורטל
            על שם סמל המוסד{me.school_semel ? <> — <b dir="ltr">{me.school_semel}</b> ({me.school_name})</> : ' (את הסמל מקבלים ממנהלת בית הספר)'},
            ולאחר הפתיחה להוריד משם את טופס נתוני השכר ולהעלות כאן.
          </p>
        )}
        {me.gender === 'm' && (
          <ObUpload label="4 · אישור משטרה — היעדר עבירות מין (חובה לגברים)"
            hint="לפי החוק למניעת העסקה של עברייני מין במוסדות חינוך"
            done={me.has_police_doc} onFile={upload('police_doc')} />
        )}
        {form.otherIncome === 'yes' && (
          <ObUpload label="אישור תיאום מס (חובה למי שיש עבודה נוספת)"
            hint="את האישור מפיקים באתר רשות המסים או אצל רואה החשבון"
            done={me.has_tax_coord} onFile={upload('tax_coord')} />
        )}
        <ObUpload label="טופס 101 חתום מוכן (רשות)"
          hint="רק אם כבר מילאת 101 בנייר — אפשר להעלות במקום למלא כאן"
          done={me.has_form101_file} onFile={upload('form101_file')} />

        {/* ── שלב 5: פרטי בנק ── */}
        <div className="apple-card" style={{ padding:18 }}>
          <p style={{ fontWeight:800, fontSize:18.4, marginBottom:2 }}>5 · פרטי חשבון בנק</p>
          {me.bank_saved && !editBank ? (
            <>
              <p style={{ color:'var(--ok)', fontWeight:700, fontSize:15.5, marginTop:6 }}>
                ✓ נשמרו · {me.bank?.bank} סניף {me.bank?.branch} · חשבון {me.bank?.account}
              </p>
              {!me.has_bank_doc && (
                <p style={{ fontSize:13.8, color:'var(--warn)', marginTop:6 }}>
                  נותר לצרף אישור ניהול חשבון או צ׳ק מבוטל.
                </p>
              )}
              {bankChanged && me.has_bank_doc && (
                <p style={{ fontSize:13.8, color:'var(--warn)', marginTop:6 }}>
                  הפרטים עודכנו — {male101 ? 'העלה' : 'העלי'} אישור ניהול חשבון או צ׳ק מבוטל חדש שמתאים להם (בשלב 6).
                </p>
              )}
              <button className="apple-btn apple-btn-ghost"
                onClick={() => { setBank({ ...(me.bank || {}) }); setMsg(''); setEditBank(true); }}
                style={{ marginTop:10, minHeight:40, padding:'0 16px', fontSize:15 }}>
                עריכת פרטי החשבון
              </button>
            </>
          ) : (<>
            <p style={{ fontSize:14.4, color:'var(--text3)', marginBottom:12 }}>
              לחשבון הזה תועבר המשכורת. יש להקליד בדיוק כפי שמופיע באישור מהבנק.
            </p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
              <div style={{ flex:'1 1 150px' }}><p className="apple-label">שם הבנק</p>
                <input value={bank.bank || ''} onChange={e => setBank(b => ({ ...b, bank: e.target.value }))}
                  className="apple-input" style={{ width:'100%' }} /></div>
              <div style={{ flex:'1 1 110px' }}><p className="apple-label">מספר סניף</p>
                <input value={bank.branch || ''} onChange={e => setBank(b => ({ ...b, branch: e.target.value }))}
                  className="apple-input" dir="ltr" inputMode="numeric" style={{ width:'100%' }} /></div>
              <div style={{ flex:'1 1 160px' }}><p className="apple-label">מספר חשבון</p>
                <input value={bank.account || ''} onChange={e => setBank(b => ({ ...b, account: e.target.value }))}
                  className="apple-input" dir="ltr" inputMode="numeric" style={{ width:'100%' }} /></div>
              <div style={{ flex:'1 1 100%' }}><p className="apple-label">בעל/ת החשבון — אם אינו על שמך</p>
                <input value={bank.owner || ''} onChange={e => setBank(b => ({ ...b, owner: e.target.value }))}
                  placeholder={me.name} className="apple-input" style={{ width:'100%' }} /></div>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:12 }}>
              <button className="apple-btn apple-btn-blue" onClick={saveBank}
                style={{ minHeight:42, padding:'0 20px', fontSize:15.5 }}>
                שמירת פרטי החשבון
              </button>
              {editBank && (
                <button className="apple-btn apple-btn-ghost" onClick={() => { setEditBank(false); setMsg(''); }}
                  style={{ minHeight:42, padding:'0 16px', fontSize:15.5 }}>
                  ביטול
                </button>
              )}
            </div>
          </>)}
        </div>
        <ObUpload label="6 · אישור ניהול חשבון או צ׳ק מבוטל" hint="הראיה לפרטי החשבון — בלעדיה לא מעבירים"
          done={me.has_bank_doc} onFile={upload('bank_doc')} />

        {/* ── שלב 7: חוזה ── */}
        <div className="apple-card" style={{ padding:18 }}>
          <p style={{ fontWeight:800, fontSize:18.4 }}>7 · חוזה העסקה</p>
          {!me.contract_available ? (
            <p style={{ fontSize:14.9, color:'var(--text3)', marginTop:6 }}>החוזה יעלה בקרוב — {male101 ? 'תקבל' : 'תקבלי'} הודעה כשיהיה מוכן לחתימה.</p>
          ) : me.contract_signed ? (
            <div>
              <p style={{ color:'var(--ok)', fontWeight:700, fontSize:15.5, marginTop:6 }}>✓ נחתם. תודה!</p>
              <ContractDoc me={me} form={form} sigUrl={contractUrl} />
            </div>
          ) : (<>
            <ContractDoc me={me} form={form} sigUrl={null} />
            <p className="apple-label">חתימה על החוזה</p>
            <SignaturePad onChange={setContractSig} />
            <button className="apple-btn apple-btn-blue" onClick={() => signContract().catch(e => setMsg(e.message))} style={{ marginTop:10, width:'100%', minHeight:44 }}>
              {isMale ? 'קראתי ואני חותם על החוזה' : 'קראתי ואני חותמת על החוזה'}
            </button>
          </>)}
        </div>

        <p style={{ fontSize:13.2, color:'var(--text3)', textAlign:'center' }}>שאלות? שרה הגר · רשת גני חב"ד</p>
      </div>
    </div>
  );
}

/* ═══ לוח קליטה — לשליחה: מי השלימה מה, קישורים וחוזה ═══ */
// readOnly: חשבת השכר רואה הכול ופותחת כל מסמך, אך אינה יוצרת קישורים ואינה מעלה חוזה
/* ═══════════════════════════════════════════════════════════════
   כתב קבלה וסילוק — קישור אישי ?r=<קוד> (שרה, 20.9.2026)

   "הסכם לעפולה... תשלח לכל העובדים של עפולה ממערכת השכר, תן אופציה
   לחתימה דיגיטלית, תן אופציה להעלאה למי שלא חתם. מיועד רק למי שהועסק
   במוסד עד שנה שעברה." + "אם לא מועסק שיעשה וי — לא עבדתי במוסד
   בשנים קודמות."

   נוסח הסעיפים הוא נוסח המסמך שמסרה שרה, מילה במילה — מסמך משפטי לא
   מנסחים מחדש.

   אישור עורך הדין: "זה לא של הרשת, שיבחר כרצונו" + "חייב חותמת עורך
   דין" (שרה, 20.9). כל עובד בוחר עו"ד בעצמו: אחרי חתימת העובד נפתח
   קישור נפרד ?rl=<קוד> שהוא מעביר לעורך הדין, ושם — שם מלא, מס'
   רישיון, חתימה וצילום חותמת (חובה). המסמך מושלם רק כששניהם חתמו.
═══════════════════════════════════════════════════════════════ */
const RL_NOTICE = 'ללא הסכם חתום זה, לצערנו לא נוכל לקבל אתכם למצבת העובדים.';
const RL_BLANK_PDF = '/ktav-kabala-vesilluk.pdf';
const rlDay = d => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');

function ReleaseDoc({ v, sigUrl, signedAt, lawyer }) {
  const Hl = ({ dir, children }) => (
    <b dir={dir} style={{ background:'#F3EEFB', color:'#4A3A8A', padding:'1px 7px', borderRadius:6,
      fontWeight:800, boxDecorationBreak:'clone', WebkitBoxDecorationBreak:'clone' }}>{children || '________'}</b>
  );
  const Sec = ({ n, children }) => (
    <p style={{ fontSize:14.9, margin:'8px 0', lineHeight:1.7 }}><b>{n}.</b> {children}</p>
  );
  return (
    <div className="release-doc" style={{ background:'#fff', border:'1px solid var(--line)', borderRadius:12, padding:'16px clamp(10px, 4vw, 26px)', color:'#111' }}>
      <p style={{ fontSize:13.2, textAlign:'right' }}>ב"ה</p>
      <p style={{ textAlign:'center', fontSize:18.4, fontWeight:800, textDecoration:'underline', margin:'4px 0 14px' }}>כתב קבלה וסילוק</p>
      <p style={{ fontSize:14.9, lineHeight:1.7 }}>
        אני הח"מ <Hl>{v.name}</Hl> מס' זהות <Hl dir="ltr">{v.tz}</Hl> מאשר/ת מרצוני החופשי ובידיעת כל זכויותיי כדלקמן:
      </p>
      <Sec n="1">עבדתי בעמותת "<Hl>{v.employerName}</Hl>" (ע"ר) (מס' עמותה <Hl dir="ltr">{v.employerNum}</Hl>) (להלן: "המעסיק")
        החל מיום <Hl dir="ltr">{rlDay(v.from)}</Hl> ועד ליום <Hl dir="ltr">{rlDay(v.to)}</Hl> (להלן: "תקופת העבודה").</Sec>
      <Sec n="2">הועסקתי אצל המעסיק בתפקיד <Hl>{v.role}</Hl> ב<Hl>{v.workplace}</Hl> הנמצא ב<Hl>{v.place}</Hl>.</Sec>
      <Sec n="3">הנני מצהיר/ה ומאשר/ת, כי עם סיום עבודתי אצל המעביד, נערך לי גמר חשבון, וכן קיבלתי מכתבי שחרור
        לקרנות הפנסיה ו/או לקופות הגמל ו/או ביטוחי המנהלים בהן הופקדו כספי פיצויי הפיטורים והתגמולים לזכותי.</Sec>
      <Sec n="4">הנני מאשר/ת כי המעסיק העביר לידי דף חשבון המפרט אופן חישוב הכספים להם הייתי זכאי ממנו, לפי הרכיבים השונים.</Sec>
      <Sec n="5">הנני מאשר/ת כי המעסיק נתן לי הזדמנות לברר את כל הזכויות המגיעות לי.</Sec>
      <Sec n="6">הנני מאשר/ת בזאת כי לעניין זכות ל- דמי הבראה, פיצויי פיטורין, הפרש שכר, תמורת שעות נוספות ו/או חג ו/או שבת,
        פדיון חופשה, ימי חופשה, קיבלתי את כל המגיע לי ואין ולא יהיו לי טענות כלשהם.</Sec>
      <Sec n="7">הנני מאשר/ת כי קראתי את כתב הקבלה והסילוק, הוסבר לי תוכנו, הבנתי את תוכנו ואני מסכים לכל האמור בו.</Sec>
      <Sec n="8">אני מאשר/ת כי תשלומים אלו מהווים סילוק מלא סופי ומוחלט של כל חובות המעסיק כלפי בגין יחסי עובד ומעביד
        שהיו בינינו במשך כל תקופת עבודתי אצל המעסיק. אין לי ולא תהיינה לי כל תביעות או טענות כלשהן כנגד המעסיק
        בכל הנוגע והקשור ליחסי העבודה שהיו בינינו.</Sec>
      <p style={{ fontSize:14.9, marginTop:14 }}>ולראיה באתי על החתום: שם ושם משפחה: <Hl>{v.name}</Hl></p>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginTop:14, gap:20, breakInside:'avoid' }}>
        <div>
          <p style={{ fontSize:13.2, color:'#666' }}>תאריך</p>
          <p dir="ltr" style={{ fontSize:14.9, fontWeight:600, borderBottom:'1px solid #999', paddingBottom:2 }}>
            {(signedAt ? new Date(signedAt) : new Date()).toLocaleDateString('he-IL')}
          </p>
        </div>
        <div style={{ flex:'0 0 190px' }}>
          <p style={{ fontSize:13.2, color:'#666' }}>חתימה</p>
          {sigUrl
            ? <img src={sigUrl} alt="חתימה" style={{ height:56, borderBottom:'1px solid #999', display:'block' }} />
            : <div style={{ height:56, borderBottom:'1px solid #999' }} />}
        </div>
      </div>
      {signedAt && (
        <p style={{ fontSize:12.6, color:'#555', marginTop:12 }}>
          נחתם דיגיטלית בקישור אישי · <span dir="ltr">{new Date(signedAt).toLocaleString('he-IL')}</span>
        </p>
      )}
      {/* אישור עורך הדין — כנוסח המקור; ריק עד שעורך הדין חותם */}
      <div style={{ borderTop:'1px solid #ccc', marginTop:16, paddingTop:12, breakInside:'avoid' }}>
        <p style={{ fontSize:14.9, lineHeight:1.7 }}>
          אני, עו"ד <Hl>{lawyer?.name}</Hl> מ.ר. <Hl dir="ltr">{lawyer?.license}</Hl> מאשר כי העובד חתם בפני על המסמך
          לאחר שקרא והבין את תוכנו מרצונו החופשי.
        </p>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginTop:10, gap:14, flexWrap:'wrap' }}>
          <div>
            <p style={{ fontSize:13.2, color:'#666' }}>תאריך</p>
            <p dir="ltr" style={{ fontSize:14.9, fontWeight:600, borderBottom:'1px solid #999', paddingBottom:2, minWidth:90, minHeight:22 }}>
              {lawyer?.signedAt ? new Date(lawyer.signedAt).toLocaleDateString('he-IL') : ''}
            </p>
          </div>
          <div style={{ flex:'0 0 130px' }}>
            <p style={{ fontSize:13.2, color:'#666' }}>חותמת</p>
            {lawyer?.stamp
              ? <img src={lawyer.stamp} alt="חותמת עורך הדין" style={{ maxHeight:70, maxWidth:130, display:'block' }} />
              : <div style={{ height:56, borderBottom:'1px solid #999' }} />}
          </div>
          <div style={{ flex:'0 0 170px' }}>
            <p style={{ fontSize:13.2, color:'#666' }}>חתימת עורך הדין</p>
            {lawyer?.sig
              ? <img src={lawyer.sig} alt="חתימת עורך הדין" style={{ height:56, borderBottom:'1px solid #999', display:'block' }} />
              : <div style={{ height:56, borderBottom:'1px solid #999' }} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ספרת ביקורת של ת"ז — המסמך נחתם פעם אחת, וטעות הקלדה אינה ניתנת לתיקון אחר כך
const tzValid = raw => {
  const t = String(raw).replace(/\D/g, '').padStart(9, '0');
  if (t.length !== 9 || /^0+$/.test(t)) return false;
  return [...t].reduce((sum, ch, i) => { const x = Number(ch) * ((i % 2) + 1); return sum + (x > 9 ? x - 9 : x); }, 0) % 10 === 0;
};

// מסך ביניים (טעינה / שגיאה) — גם הוא נושא ב"ה, ומבדיל בין קישור לא תקף לתקלת רשת
const RlNote = ({ children, onRetry }) => (
  <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, padding:24, textAlign:'center', position:'relative' }} dir="rtl">
    <p style={{ position:'absolute', top:12, right:16, fontSize:12.6, color:'var(--text3)' }}>ב"ה</p>
    <p style={{ fontWeight:700, lineHeight:1.6 }}>{children}</p>
    {onRetry && <button className="apple-btn apple-btn-blue" onClick={onRetry} style={{ minHeight:46, padding:'0 22px' }}>ניסיון נוסף</button>}
  </div>
);

// העתקה עם גיבוי: בדפדפן הפנימי של וואטסאפ ובדפדפנים ישנים clipboard אינו זמין
const rlCopy = async text => {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { window.prompt('העתיקו את הקישור:', text); return false; }
};

// הערכים שמוצגים במסמך: מה שהצוות קבע גובר, ומה שחסר — מה שהעובד מילא
const rlValues = (me, form) => {
  const d = me.doc || {};
  return {
    name: me.name, tz: form.tz ?? me.tz_id ?? '',
    employerName: d.employer_name || form.employerName || '',
    employerNum: d.employer_num || form.employerNum || '',
    // ערך שהצוות קבע נעול — השרת (rl_sign) אוכף את אותו כלל, כך שהמסך והמסמך החתום זהים
    from: d.from_date || form.from || '', to: d.to_date || form.to || '',
    role: d.role || form.role || '',
    workplace: d.workplace || me.school_name, place: d.place || '',
  };
};

function ReleaseView({ code }) {
  const [me, setMe] = useState(null);
  const [state, setState] = useState('loading');
  const [mode, setMode] = useState('digital');
  const [form, setForm] = useState({});
  const [agree, setAgree] = useState(false);
  const [sig, setSig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [askNa, setAskNa] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await store.rlWhoami(code);
      if (!d) { setState('bad'); return; }
      setMe(d); setState('ok');
      // תקלת רשת רגעית אינה "קישור לא תקף" — ומי שכבר בתוך העמוד נשאר בו
    } catch { setState(prev => (prev === 'ok' ? 'ok' : 'error')); }
  }, [code]);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  if (state === 'loading') return <RlNote>טוען…</RlNote>;
  if (state === 'error') return <RlNote onRetry={() => { setState('loading'); load(); }}>בעיית תקשורת — לא הצלחנו לטעון את הדף. בדקו את החיבור לאינטרנט ונסו שוב.</RlNote>;
  if (state === 'bad') return <RlNote>הקישור אינו תקף. יש לפנות להנהלת בית הספר.</RlNote>;

  const v = rlValues(me, form);
  const d = me.doc || {};
  const setF = (k, val) => setForm(p => ({ ...p, [k]: val }));
  const run = async fn => {
    setBusy(true); setMsg('');
    try { await fn(); await load(); }
    catch (e) { setMsg(e.message || 'משהו השתבש, נסו שוב'); }
    finally { setBusy(false); }
  };

  // הודעת החסר מביאה את השדה עצמו למרכז המסך — בנייד ההודעה בתחתית והשדה למעלה
  const miss = (id, m) => { setMsg(m); const el = document.getElementById(id); el?.scrollIntoView({ block:'center', behavior:'smooth' }); el?.focus?.({ preventScroll:true }); };
  const sign = () => {
    if (busy) return;
    const tz = String(v.tz).replace(/\D/g, '');
    if (tz.length < 8) return miss('rl-tz', 'יש למלא מספר זהות מלא');
    if (!tzValid(tz)) return miss('rl-tz', 'מספר הזהות אינו תקין — כדאי לבדוק שוב את הספרות');
    for (const [val, l, id] of [[v.role, 'תפקיד', 'rl-role'], [v.from, 'תאריך תחילת העבודה', 'rl-from'], [v.to, 'תאריך סיום העבודה', 'rl-to'], [v.employerName, 'שם העמותה', 'rl-employerName']]) {
      if (!String(val ?? '').trim()) return miss(id, `יש למלא ${l}`);
    }
    if (v.from > v.to) return miss('rl-from', 'תאריך הסיום קודם לתאריך ההתחלה');
    if (v.from > new Date().toISOString().slice(0, 10)) return miss('rl-from', 'תאריך תחילת העבודה הוא בעתיד');
    if (!agree) return miss('rl-agree', 'יש לאשר שקראת והבנת את המסמך');
    if (!sig) return miss('rl-sigpad', 'יש לחתום במסגרת החתימה');
    run(async () => {
      const path = await store.rlUploadFile(code, 'signature', dataUrlToFile(sig, 'signature.png'));
      // נשמר המסמך כפי שנחתם — כל הערכים, גם אלה שהצוות קבע
      await store.rlSign(code, { ...v, tz }, path, sig);
    });
  };
  const upload = file => {
    if (file.size > 10 * 1024 * 1024) { setMsg('הקובץ גדול מדי — עד 10MB. אפשר לצלם שוב באיכות רגילה.'); return Promise.resolve(); }
    return run(async () => {
      const path = await store.rlUploadFile(code, 'signed-form', file);
      await store.rlRegisterUpload(code, path);
    });
  };

  const finished = me.signed || me.uploaded;
  const lawyerUrl = `${window.location.origin}/?rl=${me.lawyer_code || ''}`;
  const field = (k, label, type = 'text', val, locked = false) => (
    <div style={{ flex:'1 1 150px' }}><label htmlFor={'rl-' + k} className="apple-label" style={{ display:'block' }}>{label}</label>
      {locked
        ? <p id={'rl-' + k} dir={type === 'date' ? 'ltr' : undefined} style={{ fontWeight:700, fontSize:16.1, padding:'10px 2px', textAlign:'right' }}>{type === 'date' ? rlDay(val) : val}</p>
        : <input id={'rl-' + k} type={type} value={val ?? ''} onChange={e => setF(k, e.target.value)} aria-required="true"
            className="apple-input" style={{ width:'100%' }} dir={type === 'date' ? 'ltr' : undefined} />}</div>
  );

  return (
    <div className="ob-page pb-safe-bottom" style={{ minHeight:'100vh', background:'var(--bg)', paddingBottom:60 }} dir="rtl">
      <header className="app-header"><div style={{ maxWidth:680, margin:'0 auto', padding:'12px 16px' }}>
        <p style={{ fontSize:12.6, color:'var(--text3)' }}>ב"ה</p>
        <p style={{ fontWeight:800, fontSize:21.8, letterSpacing:'-0.02em', color:'var(--purple)' }}>{me.school_name}</p>
        <p style={{ fontWeight:700, fontSize:14.9 }}>כתב קבלה וסילוק
          <span style={{ fontWeight:400, color:'var(--text3)' }}> · {me.name}</span></p>
      </div></header>

      <div style={{ maxWidth:680, margin:'0 auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
        {finished ? (
          <div className="apple-card" style={{ padding:22, textAlign:'center' }}>
            {/* V ירוק רק כשבאמת נגמר: חתימה בלי אישור עו"ד היא חצי דרך, והמסך אומר זאת */}
            <div style={{ width:54, height:54, borderRadius:'50%', background: me.signed && !me.lawyer_signed ? 'var(--warn-bg)' : 'var(--ok-bg)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px' }}>
              {me.signed && !me.lawyer_signed
                ? <AlertTriangle size={26} strokeWidth={2.4} color="#B4650A" />
                : <Check size={28} strokeWidth={2.6} color="var(--ok)" />}
            </div>
            <p style={{ fontWeight:800, fontSize:19.5 }}>{!me.signed ? 'הטופס החתום התקבל' : me.lawyer_signed ? 'המסמך נחתם ואושר' : 'חתמת — נשאר אישור עורך דין'}</p>
            <p style={{ fontSize:14.9, color:'var(--text3)', marginTop:4 }}>
              <span dir="ltr">{new Date(me.signed_at || me.uploaded_at).toLocaleString('he-IL')}</span>{me.signed && me.lawyer_signed && ' · תודה רבה, אין צורך בפעולה נוספת.'}{!me.signed && ' · הטופס ייבדק בהנהלה.'}
            </p>
            {me.signed && (me.lawyer_signed ? (
              <p style={{ fontSize:15.5, fontWeight:700, color:'var(--ok)', marginTop:12 }}>
                ✓ אישור עורך הדין התקבל{me.lawyer_name ? ` — עו"ד ${me.lawyer_name}` : ''}. המסמך הושלם.
              </p>
            ) : (
              <div style={{ marginTop:16, textAlign:'right', background:'var(--warn-bg)', border:'1px solid #FFB74D', borderRadius:12, padding:'14px 16px' }}>
                <p style={{ fontWeight:800, fontSize:16.7, color:'#8A4B00' }}>נשאר שלב אחד: אישור עורך דין</p>
                <p style={{ fontSize:14.4, color:'#8A4B00', lineHeight:1.6, margin:'4px 0 12px' }}>
                  עורך דין לבחירתך מאשר שחתמת בפניו — שם, מספר רישיון, חתימה וחותמת. בלי האישור המסמך אינו שלם.
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <a className="apple-btn apple-btn-blue" style={{ minHeight:46, textDecoration:'none' }} target="_blank" rel="noreferrer"
                    href={'https://wa.me/?text=' + encodeURIComponent('שלום, אבקש לאשר את חתימתי על כתב קבלה וסילוק (' + me.name + ').\nהאישור בקישור — שם, מס\' רישיון, חתימה וחותמת:\n' + lawyerUrl)}>
                    <MessageCircle size={16} strokeWidth={2.2} />שליחת הקישור לעורך הדין בוואטסאפ
                  </a>
                  <button className="apple-btn apple-btn-ghost" style={{ minHeight:44 }}
                    onClick={async () => { if (await rlCopy(lawyerUrl)) setMsg('הקישור הועתק'); }}>
                    העתקת הקישור
                  </button>
                  <a className="apple-btn apple-btn-ghost" style={{ minHeight:44, textDecoration:'none' }} href={lawyerUrl}>
                    עורך הדין נמצא לידי — יחתום בטלפון הזה
                  </a>
                </div>
                {msg && <p style={{ fontSize:13.8, fontWeight:700, color:'#8A4B00', marginTop:8 }}>{msg}</p>}
              </div>
            ))}
            {!me.signed && (
              <div style={{ marginTop:14 }}>
                <ObUpload label="החלפת הקובץ" hint="אם הצילום לא יצא ברור — אפשר להעלות שוב" done onFile={upload} />
                {msg && <p role="alert" style={{ color:'var(--danger)', fontWeight:700, fontSize:14.9, marginTop:8 }}>{msg}</p>}
              </div>
            )}
          </div>
        ) : me.not_employed ? (
          <div className="apple-card" style={{ padding:22, textAlign:'center' }}>
            <div style={{ width:54, height:54, borderRadius:'50%', background:'var(--ok-bg)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px' }}>
              <Check size={28} strokeWidth={2.6} color="var(--ok)" />
            </div>
            <p style={{ fontWeight:800, fontSize:19.5 }}>ההצהרה התקבלה</p>
            <p style={{ fontSize:14.9, color:'var(--text2)', marginTop:4 }}>סימנת: לא עבדתי ב{me.school_name} בשנים קודמות. אין צורך בחתימה על המסמך.</p>
            <button className="apple-btn apple-btn-ghost" disabled={busy} style={{ marginTop:14 }}
              onClick={() => run(() => store.rlNotEmployed(code, false))}>סימנתי בטעות — כן עבדתי במוסד</button>
          </div>
        ) : (<>
          <div style={{ background:'var(--warn-bg)', border:'1px solid #FFB74D', borderRadius:12, padding:'12px 14px' }}>
            <p style={{ fontSize:14.9, color:'#8A4B00', lineHeight:1.6 }}>
              המסמך מיועד למי שהועסק/ה במוסד עד שנת הלימודים הקודמת.
            </p>
            <p style={{ fontSize:15.5, fontWeight:800, color:'#B23C00', marginTop:4 }}>{RL_NOTICE}</p>
          </div>

          {/* "אם לא מועסק שיעשה וי" (שרה, 20.9) — עובד חדש מצהיר ופטור מהחתימה */}
          {/* האישור בתוך הדף ולא ב-window.confirm: בדפדפן הפנימי של וואטסאפ ובאפליקציה מותקנת החלון הזה לא תמיד נפתח */}
          <div className="apple-card" style={{ padding:'14px 16px' }}>
            <label style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}>
              <input type="checkbox" checked={askNa} disabled={busy} onChange={e => setAskNa(e.target.checked)} style={{ width:22, height:22, flexShrink:0 }} />
              <div>
                <p style={{ fontWeight:700, fontSize:16.1 }}>לא עבדתי ב{me.school_name} בשנים קודמות</p>
                <p style={{ fontSize:13.8, color:'var(--text2)' }}>מי שהתחיל/ה לעבוד השנה מסמן/ת כאן — בלי חתימה על המסמך</p>
              </div>
            </label>
            {askNa && (
              <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
                <button className="apple-btn apple-btn-blue" disabled={busy} style={{ minHeight:46, flex:'1 1 180px' }}
                  onClick={() => run(() => store.rlNotEmployed(code, true))}>{busy ? 'שומר…' : 'כן — לא עבדתי כאן קודם'}</button>
                <button className="apple-btn apple-btn-ghost" disabled={busy} style={{ minHeight:46, flex:'1 1 120px' }} onClick={() => setAskNa(false)}>ביטול</button>
              </div>
            )}
            {askNa && msg && <p role="alert" style={{ color:'var(--danger)', fontWeight:700, fontSize:14.9, marginTop:8 }}>{msg}</p>}
          </div>

          {/* העובד יודע על עורך הדין לפני שהוא חותם, לא אחרי — והאישור הוא "חתם בפניי" */}
          <div style={{ background:'var(--fill)', border:'1px solid var(--line)', borderRadius:12, padding:'12px 14px' }}>
            <p style={{ fontWeight:800, fontSize:15.5, color:'var(--purple)' }}>שימו לב: החתימה נעשית מול עורך דין</p>
            <p style={{ fontSize:14.4, color:'var(--text2)', lineHeight:1.6, marginTop:2 }}>
              על המסמך חותמים בנוכחות עורך דין לבחירתכם. מיד אחרי החתימה שלכם עורך הדין ממלא שם, מספר רישיון, חתימה וחותמת —
              בטלפון הזה, או בקישור שתשלחו לו. בלי אישור עורך דין המסמך אינו שלם.
            </p>
          </div>

          <div className="apple-seg" style={{ width:'100%' }}>
            <button onClick={() => { setMode('digital'); setMsg(''); }} className={['apple-seg-item', mode === 'digital' ? 'active' : ''].join(' ')} style={{ flex:1 }}>
              חתימה דיגיטלית
            </button>
            <button onClick={() => { setMode('upload'); setMsg(''); }} className={['apple-seg-item', mode === 'upload' ? 'active' : ''].join(' ')} style={{ flex:1 }}>
              העלאת טופס חתום
            </button>
          </div>

          {mode === 'digital' ? (
            <div className="apple-card" style={{ padding:18 }}>
              <p style={{ fontWeight:800, fontSize:18.4, marginBottom:10 }}>1 · הפרטים שלך</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                <div style={{ flex:'1 1 150px' }}><label htmlFor="rl-tz" className="apple-label" style={{ display:'block' }}>מספר זהות</label>
                  <input id="rl-tz" value={v.tz} onChange={e => setF('tz', e.target.value.replace(/\D/g, '').slice(0, 9))} aria-required="true"
                    className="apple-input" dir="ltr" inputMode="numeric" style={{ width:'100%' }} /></div>
                {field('role', 'התפקיד במוסד', 'text', v.role, !!d.role)}
                {field('from', 'תחילת העבודה במוסד', 'date', v.from, !!d.from_date)}
                {field('to', 'סיום תקופת העבודה', 'date', v.to, !!d.to_date)}
                {!d.employer_name && field('employerName', 'שם העמותה שהעסיקה אותך', 'text', form.employerName)}
                {!d.employer_num && field('employerNum', 'מספר העמותה — אם ידוע', 'text', form.employerNum)}
              </div>

              <p style={{ fontWeight:800, fontSize:18.4, margin:'18px 0 8px' }}>2 · קריאת המסמך</p>
              <ReleaseDoc v={v} sigUrl={sig} />

              <p style={{ fontWeight:800, fontSize:18.4, margin:'18px 0 8px' }}>3 · אישור וחתימה</p>
              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', marginBottom:12 }}>
                <input id="rl-agree" type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ width:20, height:20, marginTop:2, flexShrink:0 }} />
                <span style={{ fontSize:14.9, lineHeight:1.6 }}>קראתי את כתב הקבלה והסילוק, הבנתי את תוכנו ואני חותם/ת עליו מרצוני החופשי.</span>
              </label>
              <p className="apple-label">חתימה — באצבע או בעכבר</p>
              <div id="rl-sigpad" tabIndex={-1} role="group" aria-label="מסגרת החתימה — חותמים באצבע או בעכבר"><SignaturePad onChange={setSig} /></div>
              {msg && <p role="alert" style={{ color:'var(--danger)', fontWeight:700, fontSize:14.9, marginTop:10 }}>{msg}</p>}
              <button className="apple-btn apple-btn-blue" onClick={sign} disabled={busy} style={{ width:'100%', marginTop:14, minHeight:48, fontSize:16.1 }}>
                {busy ? 'שומר…' : 'חתימה ושליחה'}
              </button>
            </div>
          ) : (
            <div className="apple-card" style={{ padding:18, display:'flex', flexDirection:'column', gap:12 }}>
              <p style={{ fontWeight:800, fontSize:18.4 }}>חתימה ידנית והעלאה</p>
              <p style={{ fontSize:14.9, color:'var(--text2)', lineHeight:1.6 }}>
                מורידים את הטופס, מדפיסים, ממלאים וחותמים בפני עורך דין לבחירתכם — הוא מאשר בחתימה ובחותמת — ואז מצלמים ומעלים כאן.
              </p>
              <a href={RL_BLANK_PDF} target="_blank" rel="noreferrer" download="כתב קבלה וסילוק.pdf"
                className="apple-btn apple-btn-ghost" style={{ minHeight:44, textDecoration:'none' }}>
                <Download size={16} strokeWidth={2.2} />הורדת הטופס להדפסה
              </a>
              <ObUpload label="העלאת הטופס החתום" hint="צילום ברור או קובץ PDF" done={false} onFile={upload} />
              {msg && <p role="alert" style={{ color:'var(--danger)', fontWeight:700, fontSize:14.9 }}>{msg}</p>}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

/*
  צילום החותמת מוקטן בדפדפן: הוא נשמר בשורה עצמה כ-data URL, ותמונת טלפון
  מלאה (כמה MB) הייתה חורגת מהמגבלה. רקע לבן — חותמת על PNG שקוף יוצאת
  שחורה ב-JPEG.
*/
const shrinkImage = (file, max = 700) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.85));
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('לא הצלחנו לקרוא את התמונה — נסו צילום רגיל (JPG)')); };
  img.src = url;
});

const rlLawyerOf = r => (r.lawyer_signed_at ? { name: r.lawyer_name, license: r.lawyer_license,
  sig: r.lawyer_signature_data, stamp: r.lawyer_stamp_data, signedAt: r.lawyer_signed_at } : undefined);

// עמוד עורך הדין — ?rl=<קוד>. נפתח רק אחרי שהעובד חתם; אישור אחד בלבד.
function LawyerView({ code }) {
  const [doc, setDoc] = useState(null);
  const [state, setState] = useState('loading');
  const [name, setName] = useState('');
  const [license, setLicense] = useState('');
  const [sig, setSig] = useState(null);
  const [stamp, setStamp] = useState(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try { const d = await store.rlLawyerView(code); if (!d) { setState('bad'); return; } setDoc(d); setState('ok'); }
    catch { setState(prev => (prev === 'ok' ? 'ok' : 'error')); }
  }, [code]);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  if (state === 'loading') return <RlNote>טוען…</RlNote>;
  if (state === 'error') return <RlNote onRetry={() => { setState('loading'); load(); }}>בעיית תקשורת — לא הצלחנו לטעון את הדף. בדקו את החיבור לאינטרנט ונסו שוב.</RlNote>;
  if (state === 'bad') return <RlNote>העובד/ת עדיין לא חתם/ה על המסמך, או שהקישור אינו תקף. אפשר לחזור לקישור הזה אחרי החתימה.</RlNote>;

  const done = !!doc.lawyer_signed_at;
  const miss = (id, m) => { setMsg(m); const el = document.getElementById(id); el?.scrollIntoView({ block:'center', behavior:'smooth' }); el?.focus?.({ preventScroll:true }); };
  const submit = async () => {
    if (busy) return;
    if (name.trim().length < 3) return miss('rl-lname', 'יש למלא שם מלא');
    if (license.replace(/\D/g, '').length < 3) return miss('rl-llic', 'יש למלא מספר רישיון');
    if (!stamp) return miss('rl-stamp', 'יש לצרף צילום של חותמת עורך הדין');
    if (!agree) return miss('rl-lagree', 'יש לאשר את ההצהרה');
    if (!sig) return miss('rl-lsigpad', 'יש לחתום במסגרת החתימה');
    setBusy(true); setMsg('');
    try { await store.rlLawyerSign(code, name.trim(), license.trim(), sig, stamp); await load(); }
    catch (e) { setMsg(e.message || 'משהו השתבש, נסו שוב'); }
    finally { setBusy(false); }
  };
  const live = done ? rlLawyerOf(doc) : { name, license, sig, stamp };

  return (
    <div className="ob-page pb-safe-bottom" style={{ minHeight:'100vh', background:'var(--bg)', paddingBottom:60 }} dir="rtl">
      <header className="app-header"><div style={{ maxWidth:680, margin:'0 auto', padding:'12px 16px' }}>
        <p style={{ fontSize:12.6, color:'var(--text3)' }}>ב"ה</p>
        <p style={{ fontWeight:800, fontSize:21.8, letterSpacing:'-0.02em', color:'var(--purple)' }}>אישור עורך דין</p>
        <p style={{ fontWeight:700, fontSize:14.9 }}>כתב קבלה וסילוק
          <span style={{ fontWeight:400, color:'var(--text3)' }}> · {doc.name} · {doc.school_name}</span></p>
      </div></header>

      <div style={{ maxWidth:680, margin:'0 auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
        {done && (
          <div className="apple-card" style={{ padding:20, textAlign:'center' }}>
            <div style={{ width:54, height:54, borderRadius:'50%', background:'var(--ok-bg)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px' }}>
              <Check size={28} strokeWidth={2.6} color="var(--ok)" />
            </div>
            <p style={{ fontWeight:800, fontSize:19.5 }}>האישור התקבל — המסמך הושלם</p>
            <p style={{ fontSize:14.9, color:'var(--text3)', marginTop:4 }}>תודה רבה. אין צורך בפעולה נוספת.</p>
          </div>
        )}
        <ReleaseDoc v={{ ...(doc.fields || {}), name: doc.fields?.name || doc.name }} sigUrl={doc.signature_data} signedAt={doc.signed_at} lawyer={live} />

        {!done && (
          <div className="apple-card" style={{ padding:18 }}>
            <p style={{ fontWeight:800, fontSize:18.4, marginBottom:10 }}>פרטי עורך הדין</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
              <div style={{ flex:'1 1 200px' }}><label htmlFor="rl-lname" className="apple-label" style={{ display:'block' }}>שם מלא</label>
                <input id="rl-lname" aria-required="true" value={name} onChange={e => setName(e.target.value)} className="apple-input" style={{ width:'100%' }} /></div>
              <div style={{ flex:'1 1 140px' }}><label htmlFor="rl-llic" className="apple-label" style={{ display:'block' }}>מספר רישיון (מ.ר.)</label>
                <input id="rl-llic" aria-required="true" value={license} onChange={e => setLicense(e.target.value.replace(/[^\d/-]/g, '').slice(0, 12))} className="apple-input" dir="ltr" inputMode="numeric" style={{ width:'100%' }} /></div>
            </div>

            <p className="apple-label" style={{ marginTop:14 }}>חותמת עורך הדין — חובה</p>
            <div id="rl-stamp" tabIndex={-1} />
            <ObUpload label={stamp ? 'החותמת צורפה' : 'צילום החותמת'} hint="מטביעים את החותמת על דף לבן, מצלמים מקרוב ומעלים את הצילום" done={!!stamp}
              onFile={async f => { try { setStamp(await shrinkImage(f)); setMsg(''); } catch (e) { setMsg(e.message); } }} />
            {stamp && <img src={stamp} alt="החותמת שצורפה" style={{ maxHeight:90, marginTop:8, border:'1px solid var(--line)', borderRadius:8 }} />}

            <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', margin:'16px 0 12px' }}>
              <input id="rl-lagree" type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ width:20, height:20, marginTop:2, flexShrink:0 }} />
              <span style={{ fontSize:14.9, lineHeight:1.6 }}>אני מאשר/ת כי העובד/ת חתם/ה בפניי על המסמך לאחר שקרא/ה והבין/ה את תוכנו, מרצונו/ה החופשי.</span>
            </label>
            <p className="apple-label">חתימת עורך הדין — באצבע או בעכבר</p>
            <div id="rl-lsigpad" tabIndex={-1} role="group" aria-label="מסגרת החתימה של עורך הדין"><SignaturePad onChange={setSig} /></div>
            {msg && <p role="alert" style={{ color:'var(--danger)', fontWeight:700, fontSize:14.9, marginTop:10 }}>{msg}</p>}
            <button className="apple-btn apple-btn-blue" onClick={submit} disabled={busy} style={{ width:'100%', marginTop:14, minHeight:48, fontSize:16.1 }}>
              {busy ? 'שומר…' : 'אישור וחתימה'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// המסמך החתום — לצפייה, להדפסה ולשמירה כ-PDF
function ReleasePrint({ row, onClose }) {
  const [sig, setSig] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (row.signature_data) { setSig(row.signature_data); return; }
      if (!row.signature_path) return;
      try { const u = await store.releaseFileUrl(row.signature_path); if (alive) setSig(u); } catch { /* בלי חתימה המסמך עדיין מוצג */ }
    })();
    return () => { alive = false; };
  }, [row.signature_path, row.signature_data]);
  // בהדפסה נשאר המכתב לבדו: בלי זה נדפסים גם מסך המעקב והדשבורד שמאחוריו
  useEffect(() => { document.body.classList.add('rl-printing'); return () => document.body.classList.remove('rl-printing'); }, []);
  const v = row.fields || {};
  return createPortal(
    <div className="print-sheet release-print modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:80, overflowY:'auto' }} dir="rtl">
      <div className="modal-card" style={{ maxWidth:760, margin:'20px auto', background:'#fff', padding:'22px 26px', borderRadius:8 }}>
        <div className="no-print modal-head" style={{ display:'flex', justifyContent:'space-between', marginBottom:14, gap:8, flexWrap:'wrap', background:'#fff' }}>
          <button className="apple-btn apple-btn-blue" onClick={() => window.print()}>
            <Printer size={15} strokeWidth={2.2} />הדפסה / שמירה כ-PDF
          </button>
          <button className="apple-btn apple-btn-ghost" onClick={onClose}>סגירה</button>
        </div>
        <ReleaseDoc v={{ ...v, name: v.name || row.name }} sigUrl={sig} signedAt={row.signed_at} lawyer={rlLawyerOf(row)} />
        <p style={{ fontSize:11.5, color:'#666', marginTop:8 }}>
          חתימת העובד נרשמה מכתובת IP <span dir="ltr">{row.sign_meta?.ip || '—'}</span>
          {row.lawyer_meta && <> · אישור עורך הדין ניתן מקוון, מכתובת IP <span dir="ltr">{row.lawyer_meta.ip || '—'}</span></>}
        </p>
      </div>
    </div>,
    document.body
  );
}

function ReleaseAdmin({ schools, activeMonth, onClose, readOnly = false }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');
  const [printRow, setPrintRow] = useState(null);
  // טופס ההקמה: בית ספר → עובדים לבחירה → פרטי המסמך הקבועים
  const [setup, setSetup] = useState(null);

  const load = useCallback(async () => { try { setRows(await store.listReleaseLetters()); } catch (e) { setRows([]); alert(e.message); } }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  // טופס שהועלה אינו "הושלם" עד ששרה בדקה אותו: הוא צילום, ואיש לא וידא שיש בו חתימה, עו"ד וחותמת
  const statusOf = r => r.signed_at ? (r.lawyer_signed_at ? 'signed' : 'lawyer') : r.upload_path ? (r.upload_verified_at ? 'verified' : 'uploaded') : r.not_employed_at ? 'na' : 'wait';
  const isDone = r => ['signed', 'verified', 'na'].includes(statusOf(r));
  const LBL = { signed:'הושלם — נחתם ואושר ע"י עו"ד', lawyer:'נחתם — ממתין לאישור עו"ד', uploaded:'הועלה טופס — ממתין לבדיקה שלך', verified:'הושלם — הטופס נבדק ואושר', na:'לא עבד/ה בשנים קודמות', wait:'ממתין' };
  const CLR = { signed:'var(--ok)', lawyer:'#B4650A', uploaded:'#B4650A', verified:'var(--ok)', na:'var(--text2)', wait:'#B4650A' };

  const openSetup = async schoolId => {
    if (busy) return;
    const s = schools.find(x => x.id === schoolId);
    setBusy('טוען עובדים…');
    try {
      const people = await store.releaseCandidates(schoolId, activeMonth);
      const have = new Set((rows || []).filter(r => r.school_id === schoolId).map(r => r.tz_id || r.name));
      setSetup({ schoolId, people: people.filter(p => !have.has(p.tz_id || p.name)), picked: new Set(),
        doc: { employer_name:'', employer_num:'', workplace: s?.name || '', place: s?.city || '', from_date:'', to_date:'2026-08-31', role:'' } });
    } catch (e) { alert(e.message); }
    setBusy('');
  };
  const create = async () => {
    if (busy) return;
    const people = setup.people.filter(p => setup.picked.has(p.tz_id || p.name));
    if (!people.length) { alert('לא נבחרו עובדים'); return; }
    setBusy('יוצר קישורים…');
    try {
      const doc = Object.fromEntries(Object.entries(setup.doc).filter(([, val]) => String(val).trim()));
      const n = await store.createReleaseLetters(setup.schoolId, people, doc);
      setSetup(null); await load(); alert(`נוצרו ${n} קישורים. השליחה — בכפתור "שליחה בוואטסאפ".`);
    } catch (e) { alert(e.message); }
    setBusy('');
  };
  const send = async (list, reminder) => {
    if (busy) return;
    // תזכורת הולכת גם למי שחתם ועדיין מחכה לעורך דין — הוא לא "השלים"
    const lawyerWait = list.filter(r => statusOf(r) === 'lawyer');
    const waiting = list.filter(r => statusOf(r) === 'wait').concat(reminder ? lawyerWait : []);
    if (!waiting.length) {
      alert(lawyerWait.length ? `אין ממתינים לחתימה. ${lawyerWait.length} חתמו ומחכים לאישור עו"ד — "תזכורת לממתינים" תזכיר להם.` : 'אין למי לשלוח — כולם השלימו');
      return;
    }
    if (!window.confirm(`${reminder ? 'תזכורת' : 'שליחת הקישור'} בוואטסאפ ל-${waiting.length} עובדים. לשלוח?`)) return;
    setBusy('מכניס לתור השליחה…');
    try {
      const r = await store.sendReleaseLetters(waiting.map(x => x.id), { reminder });
      alert(`נכנסו לתור: ${r.queued}` + (r.dup ? ` · כבר נשלח בעבר: ${r.dup}` : '') + (r.noPhone ? ` · בלי נייד: ${r.noPhone}` : ''));
    } catch (e) { alert(e.message); }
    setBusy('');
  };
  const copy = async r => {
    if (await rlCopy(`${window.location.origin}/?r=${r.code}`)) { setCopied(r.id); setTimeout(() => setCopied(''), 1500); }
  };
  const verifyUpload = async (r, on) => {
    if (busy) return;
    setBusy('שומר…');
    try { await store.rlVerifyUpload(r.id, on); await load(); } catch (e) { alert(e.message); }
    setBusy('');
  };
  const openFile = async path => {
    try { window.open(await store.releaseFileUrl(path), '_blank', 'noopener'); } catch (e) { alert(e.message); }
  };

  const bySchool = {};
  for (const r of rows || []) (bySchool[r.schools?.name || '—'] ??= []).push(r);
  const setDoc = (k, val) => setSetup(s => ({ ...s, doc: { ...s.doc, [k]: val } }));
  const toggle = key => setSetup(s => { const p = new Set(s.picked); if (p.has(key)) p.delete(key); else p.add(key); return { ...s, picked: p }; });

  return (<>
    <div className="modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:70, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:16, overflowY:'auto' }} onClick={onClose}>
      <div className="apple-card modal-card" onClick={e => e.stopPropagation()} style={{ width:'100%', maxWidth:820, padding:22, marginTop:20 }} dir="rtl">
        <div className="modal-head" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap', marginBottom:4 }}>
          <div>
            <p style={{ fontWeight:800, fontSize:20.7 }}>כתב קבלה וסילוק</p>
            <p style={{ fontSize:14.4, color:'var(--text3)' }}>לעובדים שהועסקו במוסד עד שנה שעברה · חתימה דיגיטלית או העלאת טופס חתום</p>
          </div>
          <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ minHeight:36 }}>סגירה</button>
        </div>
        {busy && <p style={{ fontSize:14.4, color:'var(--text3)' }}>{busy}</p>}

        {!readOnly && !setup && (
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', margin:'12px 0' }}>
            <span style={{ fontSize:14.4, fontWeight:700 }}>הוספת עובדים מבית ספר:</span>
            <div className="even-grid" style={{ flex:'1 1 100%', minWidth:0 }}>
            {schools.map(s => (
              <button key={s.id} className="apple-btn apple-btn-ghost" disabled={!!busy} onClick={() => openSetup(s.id)} style={{ minHeight:32, padding:'4px 12px', fontSize:13.8, lineHeight:1.25 }}>{s.name}</button>
            ))}
            </div>
          </div>
        )}

        {setup && (
          <div style={{ background:'var(--fill)', borderRadius:12, padding:16, margin:'12px 0' }}>
            <p style={{ fontWeight:800, fontSize:16.1, marginBottom:8 }}>{schools.find(s => s.id === setup.schoolId)?.name} — למי המסמך מיועד?</p>
            {!setup.people.length ? <p style={{ fontSize:14.4, color:'var(--text3)' }}>לכל עובדי בית הספר כבר יש קישור.</p> : (<>
              <button className="apple-btn apple-btn-ghost" style={{ minHeight:30, padding:'0 12px', fontSize:13.2, marginBottom:8 }}
                onClick={() => setSetup(s => ({ ...s, picked: new Set(s.picked.size === s.people.length ? [] : s.people.map(p => p.tz_id || p.name)) }))}>
                {setup.picked.size === setup.people.length ? 'ניקוי הבחירה' : 'בחירת כולם'}
              </button>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(210px, 1fr))', gridAutoRows:'1fr', gap:6 }}>
                {setup.people.map(p => { const key = p.tz_id || p.name; return (
                  <label key={key} style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', borderRadius:10, padding:'8px 10px', cursor:'pointer', fontSize:14.4 }}>
                    <input type="checkbox" checked={setup.picked.has(key)} onChange={() => toggle(key)} style={{ width:18, height:18 }} />
                    <span style={{ fontWeight:600 }}>{p.name}</span>
                    {!p.phone && <span style={{ color:'#B4650A', fontSize:12.6 }}>אין נייד</span>}
                  </label>
                ); })}
              </div>
              <p style={{ fontWeight:700, fontSize:14.9, margin:'14px 0 6px' }}>פרטי המסמך — מה שיישאר ריק, העובד ימלא בעצמו</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                {[['employer_name','שם העמותה המעסיקה (הקודמת)'], ['employer_num','מס׳ עמותה'], ['workplace','שם המוסד'], ['place','יישוב'], ['role','תפקיד (אם אחיד לכולם)']].map(([k, l]) => (
                  <div key={k} style={{ flex:'1 1 180px' }}><p className="apple-label">{l}</p>
                    <input value={setup.doc[k]} onChange={e => setDoc(k, e.target.value)} className="apple-input" style={{ width:'100%' }} /></div>
                ))}
                {[['from_date','תחילת העבודה (אם אחיד)'], ['to_date','סיום תקופת העבודה']].map(([k, l]) => (
                  <div key={k} style={{ flex:'1 1 150px' }}><p className="apple-label">{l}</p>
                    <input type="date" dir="ltr" value={setup.doc[k]} onChange={e => setDoc(k, e.target.value)} className="apple-input" style={{ width:'100%' }} /></div>
                ))}
              </div>
            </>)}
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              {!!setup.people.length && <button className="apple-btn apple-btn-blue" disabled={!!busy} onClick={create} style={{ minHeight:38 }}>יצירת קישורים ל-{setup.picked.size} עובדים</button>}
              <button className="apple-btn apple-btn-ghost" onClick={() => setSetup(null)} style={{ minHeight:38 }}>ביטול</button>
            </div>
          </div>
        )}

        {rows === null ? <p style={{ color:'var(--text3)', padding:20 }}>טוען…</p> :
         !rows.length ? (!setup && <p style={{ textAlign:'center', padding:'26px 10px', color:'var(--text3)' }}>עדיין לא נוצרו קישורים. בוחרים בית ספר למעלה.</p>) :
         Object.entries(bySchool).map(([sn, list]) => (
          <div key={sn} style={{ marginTop:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap', marginBottom:6 }}>
              <p style={{ fontSize:13.8, fontWeight:700, color:'var(--purple)' }}>
                {sn} · {list.filter(isDone).length}/{list.length} הושלמו</p>
              {!readOnly && (
                <div style={{ display:'flex', gap:6 }}>
                  <button className="apple-btn apple-btn-blue" disabled={!!busy} onClick={() => send(list, false)} style={{ minHeight:32, padding:'0 12px', fontSize:13.8 }}>
                    <Send size={13} strokeWidth={2.2} />שליחה בוואטסאפ</button>
                  <button className="apple-btn apple-btn-ghost" disabled={!!busy} onClick={() => send(list, true)} style={{ minHeight:32, padding:'0 12px', fontSize:13.8 }}>תזכורת לממתינים</button>
                </div>
              )}
            </div>
            <div className="table-scroll">
              <table className="apple-table sticky-first" style={{ fontSize:13.8 }}>
                <thead><tr><th>עובד/ת</th><th>מצב</th><th>מתי</th><th style={{ textAlign:'center' }}>מסמך</th><th style={{ textAlign:'center' }}>קישור</th></tr></thead>
                <tbody>
                  {list.map(r => { const st = statusOf(r); const when = r.lawyer_signed_at || r.signed_at || r.upload_verified_at || r.uploaded_at || r.not_employed_at; return (
                    <tr key={r.id}>
                      <td style={{ fontWeight:600 }}>{r.name}<span style={{ color:'var(--text3)', fontWeight:400 }}>{r.phone ? ` · ${r.phone}` : ' · אין טלפון'}</span></td>
                      <td style={{ fontWeight:700, color: CLR[st] }}>{LBL[st]}
                        {/* אישור עו"ד מקוון אינו מאומת; אותה כתובת כמו העובד שווה מבט נוסף */}
                        {st === 'signed' && r.sign_meta?.ip && r.sign_meta.ip === r.lawyer_meta?.ip && (
                          <span style={{ display:'block', fontWeight:400, fontSize:12.6, color:'var(--text3)' }}>אישור העו"ד ניתן מאותה רשת כמו העובד</span>
                        )}
                      </td>
                      <td dir="ltr" style={{ textAlign:'right', color:'var(--text3)', whiteSpace:'nowrap' }}>{when ? new Date(when).toLocaleDateString('he-IL') : ''}</td>
                      <td style={{ textAlign:'center', whiteSpace:'nowrap' }}>
                        {r.signed_at && <button className="apple-btn apple-btn-ghost" onClick={() => setPrintRow(r)} style={{ minHeight:28, padding:'0 10px', fontSize:13.2 }}>צפייה והדפסה</button>}
                        {r.upload_path && <button className="apple-btn apple-btn-ghost" onClick={() => openFile(r.upload_path)} style={{ minHeight:28, padding:'0 10px', fontSize:13.2, marginInlineStart:4 }}>
                          <Paperclip size={13} strokeWidth={2.2} />הקובץ שהועלה</button>}
                        {!readOnly && st === 'uploaded' && <button className="apple-btn apple-btn-blue" disabled={!!busy} onClick={() => verifyUpload(r, true)}
                          title="בדקתי: חתימת העובד, אישור עורך דין וחותמת" style={{ minHeight:28, padding:'0 10px', fontSize:13.2, marginInlineStart:4 }}>בדקתי — תקין</button>}
                        {!readOnly && st === 'verified' && <button className="apple-btn apple-btn-ghost" disabled={!!busy} onClick={() => verifyUpload(r, false)}
                          style={{ minHeight:28, padding:'0 10px', fontSize:13.2, marginInlineStart:4 }}>ביטול האישור</button>}
                        {!r.signed_at && !r.upload_path && <span style={{ color:'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ textAlign:'center' }}>
                        {/* הקישור הוא מפתח החתימה — רק מי שמנהלת את התהליך מעתיקה אותו */}
                        {readOnly ? <span style={{ color:'var(--text3)' }}>—</span> : (
                          <button className="apple-btn apple-btn-ghost" onClick={() => copy(r)} style={{ minHeight:28, padding:'0 10px', fontSize:13.2 }}>
                            {copied === r.id ? 'הועתק ✓' : 'העתקה'}</button>
                        )}
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
    {printRow && <ReleasePrint row={printRow} onClose={() => setPrintRow(null)} />}
  </>);
}

function OnboardingAdmin({ activeMonth, onClose, readOnly = false }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');
  const [print101, setPrint101] = useState(null);   // הטופס הרשמי להדפסה
  // תיק המסמכים בפאנל צד: {row, path?, label?} — הטבלה נשארת גלויה לצידו
  const [panel, setPanel] = useState(null);

  const load = useCallback(async () => setRows(await store.listOnboarding()), []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const makeLinks = async () => {
    setBusy('יוצר קישורים…');
    try { const n = await store.createOnboardingLinks(activeMonth); setBusy(''); await load();
      alert(n ? `נוצרו ${n} קישורים חדשים` : 'לכל העובדים כבר יש קישור'); }
    catch (e) { setBusy(''); alert(e.message); }
  };
  const uploadContract = async f => {
    setBusy('מעלה חוזה…');
    try { await store.uploadContract(f); setBusy(''); alert('החוזה הועלה — יופיע אצל כל העובדים לחתימה'); }
    catch (e) { setBusy(''); alert(e.message); }
  };
  const copy = (code, name) => {
    navigator.clipboard.writeText(`${window.location.origin}/?f=${code}`);
    setCopied(name); setTimeout(() => setCopied(''), 1500);
  };

  const bySchool = {};
  for (const r of rows || []) (bySchool[r.schools?.name || '—'] ??= []).push(r);
  const doneOf = r => [r.form101_signed_at, r.id_doc_path, r.salary_form_path, r.bank_saved_at, r.bank_doc_path, r.contract_signed_at].filter(Boolean).length;
  const total = (rows || []).length;
  const complete = (rows || []).filter(r => doneOf(r) >= 5).length;

  /*
    חלונות הצפייה מרונדרים מחוץ לשכבת הקליטה: ה-backdropFilter שלה הופך
    אותה ל-containing block, ו-position:fixed שבתוכה נמדד ממנה ולא מהמסך —
    "נפתח למעלה" (שרה, 6.9): מי שגללה לתחתית הרשימה ראתה את החלון בראשה.
  */
  return (<>
    <div className="modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(26,11,53,0.45)', zIndex:70, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:16,
        paddingLeft: panel ? `calc(${OB_PANEL_W} + 16px)` : 16,   // הטבלה זזה ימינה ונשארת גלויה ליד הפאנל
        overflowY:'auto', backdropFilter:'blur(6px)' }} onClick={onClose}>
      <div className="apple-card modal-card" onClick={e => e.stopPropagation()} style={{ width:'100%', maxWidth:860, padding:22, marginTop:20 }} dir="rtl">
        <div className="modal-head" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap', marginBottom:4 }}>
          <div>
            {/* "יש גם גברים" (שרה, 6.9) — לשון כוללת בכל מסך הקליטה */}
            <p style={{ fontWeight:800, fontSize:20.7 }}>קליטת עובדים — טופס 101, מסמכים וחוזה</p>
            <p style={{ fontSize:14.4, color:'var(--text3)' }}>דדליין: {OB_DEADLINE} · הושלמו {complete} / {total}</p>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {!readOnly && (
              <>
                <button className="apple-btn apple-btn-blue" onClick={makeLinks} style={{ minHeight:36, fontSize:14.4 }}>
                  יצירת קישורים לכל העובדים
                </button>
                <label className="apple-btn apple-btn-ghost" style={{ minHeight:36, fontSize:14.4, cursor:'pointer' }}>
                  <Upload size={14} /> העלאת החוזה (PDF)
                  <input type="file" accept="application/pdf" style={{ display:'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadContract(f); }} />
                </label>
              </>
            )}
            <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ minHeight:36 }}>סגירה</button>
          </div>
        </div>
        {busy && <p style={{ fontSize:14.4, color:'var(--text3)' }}>{busy}</p>}

        {rows === null ? <p style={{ color:'var(--text3)', padding:20 }}>טוען…</p> :
         !rows.length ? (
          <div style={{ textAlign:'center', padding:'30px 10px' }}>
            <p style={{ fontWeight:700 }}>אין עדיין קישורי קליטה</p>
            <p style={{ fontSize:14.4, color:'var(--text3)' }}>
              {readOnly
                ? 'הקישורים טרם נוצרו. כשייווצרו, הטפסים והמסמכים יופיעו כאן.'
                : `לחיצה על "יצירת קישורים" תפיק קישור אישי לכל עובד/ת בכל בתי הספר, מתוך חודש ${fmtMonth(activeMonth)}.`}
            </p>
          </div>
        ) : Object.entries(bySchool).map(([sn, list]) => (
          <div key={sn} style={{ marginTop:14 }}>
            {/* אותו סף כמו בכותרת למעלה — doneOf סופר 6 פריטים לכל היותר, והשוואה ל-7 הציגה תמיד 0 */}
            <p style={{ fontSize:13.8, fontWeight:700, color:'var(--purple)', marginBottom:6 }}>{sn} · {list.filter(r => doneOf(r) >= 5).length}/{list.length} הושלמו</p>
            <div className="table-scroll">
              <table className="apple-table sticky-first" style={{ fontSize:13.8 }}>
                <thead><tr>
                  <th>עובד/ת</th><th style={{ textAlign:'center' }}>101</th><th style={{ textAlign:'center' }}>ת.ז.</th>
                  <th style={{ textAlign:'center' }}>נתוני שכר</th><th style={{ textAlign:'center' }}>תיק משה"ח</th>
                  <th style={{ textAlign:'center' }} title="אישור היעדר עבירות מין — גברים בלבד">משטרה</th>
                  <th style={{ textAlign:'center' }} title="פרטי חשבון הבנק">בנק</th>
                  <th style={{ textAlign:'center' }} title="אישור ניהול חשבון או צ׳ק מבוטל">אישור</th>
                  <th style={{ textAlign:'center' }}>חוזה</th><th style={{ textAlign:'center' }}>קישור</th>
                </tr></thead>
                <tbody>
                  {list.map(r => {
                    // ✓ לחיץ פותח את המסמך עצמו לצפייה ושמירה; בלי open — ✓ דומם
                    const C = (ok, open, title) => !ok
                      ? <span style={{ color:'var(--text3)' }}>—</span>
                      : open
                        ? <button onClick={open} title={title || 'צפייה ושמירה'}
                            style={{ background:'none', border:0, cursor:'pointer', padding:3, lineHeight:0, borderRadius:6 }}>
                            <Check size={15} strokeWidth={2.6} color="var(--ok)" />
                          </button>
                        : <Check size={15} strokeWidth={2.6} color="var(--ok)" />;
                    const doc = (path, label) => () => setPanel({ row: r, path, label });
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight:600 }}>
                          {/* השם פותח את תיק המסמכים המלא — "תחשוב על יעילות" (שרה, 6.9) */}
                          <button onClick={() => setPanel({ row: r })} title="תיק המסמכים — כל המסמכים ברשימה אחת"
                            style={{ background:'none', border:0, cursor:'pointer', padding:0, font:'inherit', fontWeight:600, color:'var(--purple)', display:'inline-flex', alignItems:'center', gap:5 }}>
                            <FolderOpen size={14} strokeWidth={2.2} />{r.name}
                          </button>
                          <span style={{ color:'var(--text3)', fontWeight:400 }}>{r.phone ? ` · ${r.phone}` : ' · אין טלפון'}</span>
                        </td>
                        <td style={{ textAlign:'center', whiteSpace:'nowrap' }}>
                          {C(r.form101_signed_at, () => setPrint101(r), 'טופס 101 — צפייה, הדפסה ושמירה כ-PDF')}
                          {r.form101_file_path && (
                            <button onClick={doc(r.form101_file_path, 'טופס 101 סרוק')} title="טופס 101 סרוק שהועלה"
                              style={{ background:'none', border:0, cursor:'pointer', padding:3, lineHeight:0 }}>
                              <Paperclip size={13} strokeWidth={2.2} color="var(--text3)" />
                            </button>
                          )}
                        </td>
                        <td style={{ textAlign:'center' }}>{C(r.id_doc_path, doc(r.id_doc_path, 'צילום תעודת זהות'))}</td>
                        <td style={{ textAlign:'center' }}>{C(r.salary_form_path, doc(r.salary_form_path, 'טופס נתוני שכר'))}</td>
                        <td style={{ textAlign:'center' }}>{C(r.ministry_file_path, doc(r.ministry_file_path, 'אסמכתת תיק משרד החינוך'))}</td>
                        <td style={{ textAlign:'center' }}>{C(r.police_doc_path, doc(r.police_doc_path, 'אישור משטרה'))}</td>
                        <td style={{ textAlign:'center' }}>{C(r.bank_saved_at, () => setPanel({ row: r }), 'פרטי חשבון הבנק')}</td>
                        <td style={{ textAlign:'center' }}>{C(r.bank_doc_path, doc(r.bank_doc_path, 'אישור ניהול חשבון'))}</td>
                        <td style={{ textAlign:'center' }}>{C(r.contract_signed_at, r.contract_signature_path ? doc(r.contract_signature_path, 'חתימה על החוזה') : null, 'החתימה על החוזה')}</td>
                        <td style={{ textAlign:'center', whiteSpace:'nowrap' }}>
                          <button className="apple-btn apple-btn-ghost" onClick={() => copy(r.code, r.name)} style={{ minHeight:28, padding:'0 10px', fontSize:13.2 }}>
                            {copied === r.name ? 'הועתק ✓' : 'העתקה'}
                          </button>
                          {/* הטופס במבנה הרשמי — זה מה שנשמר בתיק ומוצג בביקורת */}
                          {r.form101_signed_at && (
                            <button className="apple-btn apple-btn-ghost" onClick={() => setPrint101(r)}
                              title="טופס 101 במבנה הרשמי, להדפסה או לשמירה כ-PDF"
                              style={{ minHeight:28, padding:'0 10px', fontSize:13.2, marginInlineStart:4 }}>
                              101
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <p style={{ fontSize:13.2, color:'var(--text3)', marginTop:14 }}>
          לחיצה על שם או על ✓ פותחת את המסמכים בפאנל בצד — הטבלה נשארת גלויה ·
          השליחה בוואטסאפ נעשית דרך scripts/send-onboarding.mjs — הרצה יבשה קודם, שליחה רק באישורך.
        </p>
      </div>
    </div>
    {print101 && <Form101Print row={print101} onClose={() => setPrint101(null)} />}
    {panel && <ObPanel row={panel.row} path={panel.path} label={panel.label}
      onSelect={(path, label) => setPanel(p => ({ ...p, path, label }))}
      onClose={() => setPanel(null)}
      onPrint101={() => setPrint101(panel.row)} />}
  </>);
}

function LinkView({ code }) {
  const [me,      setMe]      = useState(null);
  const male = me?.gender === 'm';
  const [months,  setMonths]  = useState([]);
  const [month,   setMonth]   = useState('');
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [fatal,   setFatal]   = useState('');
  /*
    "מסך הפניה לא דיווח חודשי אלא נתוני העסקה" (שרה, 8.9). הקישור נפתח
    על נתוני ההעסקה, כי זו העבודה שהמנהלת נשלחת אליה; הדיווח החודשי
    נשאר טאב לצידו. `?t=` מאפשר להפנות ישירות לטאב מסוים — הודעת
    האישור מפנה ל-approve.
  */
  const [tab,     setTab]     = useState(() => {
    const t = new URLSearchParams(window.location.search).get('t') || '';
    return ['report', 'cards', 'approve'].includes(t) ? t : 'cards';
  });

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

  const monthRow = months.find(m => m.key === month);
  const locked   = monthRow?.locked;
  // "תנעל ב-10 לחודש לשינויים תמיד" (שרה, 10.9): מ-lock_due — ה-10 בחודש
  // שאחרי חודש העבודה — השרת דוחה כל שמירה מהקישור. כאן רק מספרים למנהלת
  // מראש עד מתי אפשר, ואחרי כן למה הכפתורים כבויים.
  const lockDue  = monthRow?.lockDue || null;
  const fmtDay   = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : '');
  const dayBefore = iso => {
    if (!iso) return '';
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return fmtDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

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
        <p style={{ fontSize:18.4, fontWeight:700, color:'var(--danger)', marginBottom:8 }}>{fatal}</p>
        <p style={{ fontSize:14.9, color:'var(--text3)' }}>פנו לרשת לקבלת קישור חדש.</p>
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
              <p style={{ fontSize:16.7, fontWeight:800, color:'var(--text)', lineHeight:1.25 }}>מערכת שכר עובדי הוראה</p>
              <p style={{ fontSize:13.2, color:'var(--text3)', lineHeight:1.3 }}>רשת חינוך חב״ד</p>
            </div>
          </div>
          <p style={{ fontSize:18.4, fontWeight:800, color:'var(--text)' }}>{me?.schoolName || 'טוען…'}</p>
          <p style={{ fontSize:14.4, color:'var(--text3)', marginTop:1 }}>
            {me?.fullName}{me ? ' · הזנת נתוני העסקה' : ''}
          </p>
          {/* חודש אחד, כטקסט. בורר הזמין מילוי לחודש שכבר נסגר, וחשף
              כל חודש שקיים במסד — כולל חודשי בדיקה. */}
          {month && (
            <p style={{ fontSize:14.4, fontWeight:700, color:'var(--purple)', marginTop:8,
              background:'var(--purple-100)', border:'1px solid #D8CEEF', borderRadius:999,
              display:'inline-block', padding:'3px 12px' }}>
              {fmtMonth(month)}
            </p>
          )}
        </div>
      </header>

      <main className="pb-safe-bottom" style={{ maxWidth:760, margin:'0 auto', padding:'16px 16px 40px' }}>
        {locked ? (
          <div style={{ background:'var(--warn-bg)', border:'1px solid var(--warn)', borderRadius:12, padding:'11px 14px', marginBottom:14 }}>
            <p style={{ fontSize:14.9, fontWeight:600, color:'var(--warn)' }}>
              החודש נעול לשינויים{lockDue ? ` מ-${fmtDay(lockDue)}` : ''}. הנתונים הועברו לשכר.
            </p>
            <p style={{ fontSize:13.8, color:'var(--text3)', marginTop:4, lineHeight:1.6 }}>
              אפשר לצפות בכל הנתונים. תיקון יתקבל בחודש הבא, או בפנייה לרשת.
            </p>
          </div>
        ) : lockDue ? (
          <p style={{ fontSize:13.8, color:'var(--text3)', marginBottom:12, lineHeight:1.6 }}>
            אפשר לעדכן עד {dayBefore(lockDue)}. ב-{fmtDay(lockDue)} החודש ננעל לשינויים.
          </p>
        ) : null}

        {loading ? (
          <p style={{ fontSize:16.1, color:'var(--text3)', textAlign:'center', padding:'40px 0' }}>טוען…</p>
        ) : !rows.length ? (
          <>
            <div className="apple-card" style={{ padding:24, textAlign:'center', marginBottom:12 }}>
              <p style={{ fontSize:17.2, fontWeight:700, color:'var(--text)', marginBottom:6 }}>אין עדיין עובדי הוראה בחודש הזה</p>
              <p style={{ fontSize:14.9, color:'var(--text3)' }}>
                {heSaid(male, 'הוסיפי', 'הוסף')} את עובדי ההוראה של בית הספר — כולל {heSaid(male, 'את עצמך', 'אותך')}.
                שם, ת.ז., מסלול, ותק ושעות. {heSaid(male, 'הצמדי', 'הצמד')} למספר השעות שאושר בבניית התקציב.
              </p>
            </div>
            {!locked && <LinkNewCard schoolReform={me?.schoolReform} onAdd={onAdd} male={male} />}
          </>
        ) : (
          <>
            {/* שלושה טאבים אינם נכנסים ל-390px. הרצועה גוללת בתוך עצמה
                ולא דוחפת את העמוד, והכותרת הראשונה קוצרה. */}
            <div className="apple-seg" style={{ marginBottom:12, maxWidth:'100%', overflowX:'auto',
                 flexWrap:'nowrap', WebkitOverflowScrolling:'touch' }}>
              <button onClick={() => setTab('report')} className={['apple-seg-item', tab === 'report' ? 'active' : ''].join(' ')}
                style={{ padding:'7px 14px', fontSize:14.9, whiteSpace:'nowrap' }}>
                דיווח חודשי
              </button>
              <button onClick={() => setTab('cards')} className={['apple-seg-item', tab === 'cards' ? 'active' : ''].join(' ')}
                style={{ padding:'7px 14px', fontSize:14.9, whiteSpace:'nowrap' }}>
                נתוני העסקה
              </button>
              <button onClick={() => setTab('approve')} className={['apple-seg-item', tab === 'approve' ? 'active' : ''].join(' ')}
                style={{ padding:'7px 14px', fontSize:14.9, whiteSpace:'nowrap' }}>
                אישור נתונים
              </button>
            </div>
            {tab === 'approve' ? (
              <LinkApproval rows={rows} code={code} onSave={onSave} onAdd={locked ? null : onAdd} locked={!!locked}
                schoolReform={me?.schoolReform} schoolName={me?.schoolName} male={male}
                quota={me?.hoursQuota} />
            ) : tab === 'report' ? (
              <LinkMonthlyReport rows={rows} locked={locked} onSave={onSave} code={code} />
            ) : (
              <>
                <p style={{ fontSize:14.4, color:'var(--text3)', marginBottom:11 }}>
                  {rows.length} עובדי הוראה · שינוי בוותק, בדרגה, בתואר או בשעות מחזיר לחישוב שכר מחדש
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
                  {rows.map(t => <LinkCard key={t.id} teacher={t} locked={locked} onSave={onSave} />)}
                  {!locked && <LinkNewCard schoolReform={me?.schoolReform} onAdd={onAdd} male={male} />}
                </div>
              </>
            )}
            {/* המנהלות עובדות מהטלפון — ההתקנה מוצעת גם כאן, לא רק בכניסה */}
            <div style={{ maxWidth:420, margin:'18px auto 0' }}><InstallAppButton /></div>
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  // ?k=<קוד> — מנהלת שנכנסה מהקישור שנשלח אליה בוואטסאפ. נקרא פעם אחת,
  // לפני כל אתחול אחר: המסלול הזה אינו עובר דרך התחברות כלל.
  /*
    "אפשר שהקישור שלהם ירד כאפליקציה?" (שרה, 3.9). אפליקציה מותקנת
    נפתחת ב-start_url — "/" בלי ?k — והמנהלת הייתה נוחתת על מסך
    ההתחברות במקום על הדשבורד שלה. לכן הקוד נשמר במכשיר בפתיחת
    קישור, ובהפעלה כאפליקציה (standalone בלבד — בדפדפן רגיל "/"
    נשאר מסך הכניסה של שרה ואסתר) הוא נטען משם.
  */
  const [linkCode] = useState(() => {
    const k = new URLSearchParams(window.location.search).get('k') || '';
    try {
      if (k) { localStorage.setItem('linkCode', k); return k; }
      const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
        || window.navigator.standalone === true;
      // מי שמחוברת (שרה/אסתר) גוברת על קוד שמור — אחרת התקנה במכשיר
      // שפעם נפתח בו קישור של מנהלת הייתה דורסת את מסך הכניסה שלהן
      const signedIn = Object.keys(localStorage).some(x => x.startsWith('sb-') && x.includes('auth-token'));
      return standalone && !signedIn ? (localStorage.getItem('linkCode') || '') : '';
    } catch { return k; }
  });
  const [obCode2] = useState(() => new URLSearchParams(window.location.search).get('f') || '');
  const [rlCode] = useState(() => new URLSearchParams(window.location.search).get('r') || '');
  const [lawyerCode] = useState(() => new URLSearchParams(window.location.search).get('rl') || '');
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
  const [showRelease,   setShowRelease]   = useState(false);

  // הניווט העליון גולל אופקית במובייל — הלשונית הפעילה נגררת אל תוך
  // שדה הראייה, אחרת מעבר מסך משאיר את הסימון מחוץ למסך בלי עדות.
  useEffect(() => {
    const el = document.querySelector('.app-header .nav-btn.active');
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [view]);

  // כל שינוי נשמר בשרת ואז נטען מחדש. פשוט, ותמיד מסונכרן עם מה שבאמת נשמר.
  const refresh = useCallback(async () => {
    const data = await store.loadAll();
    setSchools(data.schools);
    for (const sc of (data.schools || [])) CHABAD_SUPP.set(sc.id, sc.chabadSupp !== false);
    setMonths(data.months);
    setDue(data.due || {});
    MM_REPLACED.clear();
    MATERNITY_LEAVES.clear();
    for (const [mk, rows2] of Object.entries(data.months || {}))
      for (const r2 of rows2 || []) {
        if (String(r2.mmFor || '').trim()) MM_REPLACED.add(mmKey(mk, r2.schoolId, r2.mmFor));
        if (r2.leaveType === 'maternity') MATERNITY_LEAVES.add(mmKey(mk, r2.schoolId, r2.name));
      }
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

  /*
    "אין לי איפה לחשב" (שרה, 3.9). הלחיצה שולחת בקשה; sim-watcher
    שרץ על המחשב במשרד מריץ את מחשבון משרד החינוך וכותב תוצאה;
    כאן — הדפדפן של שרה — התוצאה נקלטת, נשמרת לברוטו בהרשאות שלה,
    והבקשה נמחקת. השרת לא נוגע בשכר.
  */
  const [simState, setSimState] = useState({});
  const onCompute = async (t) => {
    try {
      await store.requestSim(t.id);
      setSimState(m => ({ ...m, [t.id]: 'pending' }));
    } catch (e) { setError(e.message); }
  };
  useEffect(() => {
    if (user?.role !== 'coordinator') return undefined;
    let alive = true;
    const tick = async () => {
      let reqs;
      try {
        reqs = await store.openSimRequests();
      } catch { return; /* רשת רגעית — הסבב הבא ידביק */ }
      if (!alive) return;
      const st = {};
      let needsRefresh = false;
      for (const r of reqs) {
        // כל בקשה בטיפול משלה: כשל בשמירה של אחת לא מדלג על ניקוי
        // הספינרים של כל השאר (הבאג של "תקוע לנצח", 6.9).
        try {
          if (r.status === 'done') {
            // השורה מחפשׂת בכל החודשים, לא רק בפעיל — חישוב של חודש אחר
            // נשמר גם הוא ולא נזרק (הברוטו אבד כשהיה מסונן ל-activeMonth).
            let row = null, rowMonth = activeMonth;
            for (const [mk, list] of Object.entries(months)) {
              const hit = list.find(x => x.id === r.teacher_month_id);
              if (hit) { row = hit; rowMonth = mk; break; }
            }
            /*
              מנהלת: התוצאה היא העולם הישן (התלוש נכתב ל-slip_lines), והברוטו
              הקבוע שלה נשאר. מה שנשמר הוא תוספת בית חב"ד = ברוטו − עולם ישן,
              כדי שמסך בית הספר, עלות המעביד והתלוש יראו אותו מספר.
              שכר מוסכם/שווה לברוטו — התוספת נגזרת ממנו; אפס נשמר כאפס.
            */
            if (r.result_gross != null && row && isPrincipalRow(row)) {
              const gross = Number(row._agreedGross) || Number(row._officialGross) || 0;
              const supp = gross ? Math.max(0, Math.round(gross - r.result_gross)) : null;
              // אפס מפורש = "הכול בסיס" (חני אסולין, שרה 9.9) — חישוב חוזר לא דורס אותו
              if (supp != null && row._chabadSupp !== 0 && supp !== (row._chabadSupp ?? null)) {
                await store.saveTeacher({ id: row.id, _chabadSupp: supp }, rowMonth);
              }
            } else if (r.result_gross != null && row && row._officialGross !== r.result_gross) {
              await store.saveTeacher({ id: row.id, _officialGross: r.result_gross }, rowMonth);
            }
            needsRefresh = true;
            await store.deleteSimRequest(r.id);
          } else if (r.status === 'failed') {
            setError('החישוב נכשל: ' + (r.error || 'סיבה לא ידועה'));
            await store.deleteSimRequest(r.id);
          } else {
            st[r.teacher_month_id] = r.status;
          }
        } catch { /* בקשה בודדת נכשלה — לא נועלים את המסך בגללה */ }
      }
      if (alive) setSimState(st);        // תמיד — הספינרים מתנקים לפי המצב האמיתי
      if (alive && needsRefresh) { try { await refresh(); } catch { /* הסבב הבא */ } }
    };
    const iv = setInterval(tick, 7000);
    tick();
    return () => { alive = false; clearInterval(iv); };
  }, [user?.role, months, activeMonth]);

  const onSignOut = async () => {
    await store.signOut();
    setUser(null); setSchools([]); setMonths({}); setActiveSchool(null);
  };

  // הקישור עוקף את מסך ההתחברות לגמרי — אין למחזיקה בו session להמתין לו
  if (lawyerCode) return <LawyerView code={lawyerCode} />;
  if (rlCode) return <ReleaseView code={rlCode} />;
  if (obCode2) return <OnboardingView code={obCode2} />;
  if (linkCode) return <LinkView code={linkCode} />;

  if (booting) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }} dir="rtl">
        <p style={{ fontSize:16.1, color:'var(--text3)', fontWeight:600 }}>טוען…</p>
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
      /*
        שינוי בנתון שמשפיע על השכר מחזיר את השורה לאישור — אבל אינו
        מוחק עוד את הברוטו.

        בעולם הסימולטור זה היה נכון: המספר חושב מהנתונים, ולכן שינוי
        בהם פסל אותו. מעכשיו חשבת השכר מזינה את המספר ומכירה את התלוש,
        וגם מתקנת ותק ודרגה בעצמה — מחיקת הברוטו שלה בגלל תיקון שהיא
        עשתה הייתה מוחקת את עבודתה שלה.

        האישור כן נופל: זו בדיוק "חריגה שקופצת לבדיקה".
      */
      if (baseFieldsChanged(t, old)) {
        next._changedAt   = now;
        next._approved    = false;
        next._netApproved = false;
        if (!old._snapshot) next._snapshot = snapT(old);
        /*
          "חושב לא נכון — מייד עלה לאישור וחושב מחדש" (שרה, 3.9):
          שינוי נתון שכר לא רק מפיל את האישור — הוא שולח מעצמו בקשת
          חישוב לתור. המספר הטרי נכנס לברוטו, והשורה ממתינה לאישורה.
          נשלח רק כשיש מה להריץ: לא בחופשה, ויש שעות — או מנהלת, שאצלה
          השעות אינן קלט (100% תמיד) והחישוב הוא התלוש בעולם ישן.
        */
        if (user?.role === 'coordinator' && t.id && (next.leaveType ?? 'none') === 'none'
            && canCompute(next)
            && (isPrincipalRow(next) || Number(next.frontalHours) > 0)) {
          store.requestSim(t.id)
            .then(() => setSimState(m => ({ ...m, [t.id]: 'pending' })))
            .catch(() => { /* התור לא זמין — הכפתור הידני עדיין שם */ });
        }
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
        <div style={{ maxWidth:1400, margin:'0 auto', padding:'0 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, minHeight:60, flexWrap:'wrap' }}>

          <div onClick={() => isCoord && setView('schools')}
            style={{ display:'flex', alignItems:'center', gap:11, cursor: isCoord ? 'pointer' : 'default', padding:'9px 0' }}>
            <img src="/logo-chabad.png" alt="לוגו רשת" style={{ height:36, width:'auto', objectFit:'contain' }} />
            <div>
              <p style={{ fontWeight:700, fontSize:16.7, color:'var(--text)', letterSpacing:'-0.01em', lineHeight:1.25 }}>מערכת שכר מורים</p>
              <p style={{ fontSize:13.2, color:'var(--text3)', lineHeight:1.3 }}>
                {isCoord ? 'שליח / מנהל רשת' : isClerk ? 'חשבת שכר' : `מנהלת: ${principalSchool?.name || ''}`}
                <span style={{ opacity:.55 }}>{` · גרסה ${BUILD}`}</span>
              </p>
            </div>
          </div>

          <div className="nav-scroll" style={{ display:'flex', gap:5, alignItems:'center', flexWrap:'nowrap', overflowX:'auto', maxWidth:'100%', paddingBottom:2 }}>
            {/* הסרגל מקובץ לפי זרימת העבודה: עבודה שוטפת (סימולציה,
                אישורים, תלושים) · ניתוח (דוח רשת, עלות הוראה) · ניהול
                (קליטה, התראות) · מערכת (חודש, גיבוי, יציאה). מפריד דק
                בין קבוצה לקבוצה. */}
            {isCoord && view !== 'schools' && (
              <>
                <button className="nav-btn" onClick={() => setView('schools')}>
                  <ArrowRight size={15} strokeWidth={2.4} />
                  ראשי
                </button>
                <span className="nav-sep" />
              </>
            )}

            {/* ── עבודה שוטפת ── */}
            {(isCoord || isClerk) && (
              <button className={`nav-btn ${view==='calc' ? 'active' : ''}`} onClick={() => setView('calc')} style={{ position:'relative' }}>
                <Calculator size={15} strokeWidth={2.2} />
                סימולציה
                {needsSimCount > 0 && (
                  <span style={{ background:'var(--warn-bg)', color:'var(--warn)', border:'1px solid var(--warn-line)',
                    fontSize:13.2, fontWeight:700, borderRadius:999, minWidth:19, height:19, padding:'0 5px',
                    display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                    {needsSimCount}
                  </span>
                )}
              </button>
            )}
            {/* "תשתף את אסתר גם באישורים של המורים" (שרה, 3.9) — האישורים
                ועלות ההוראה נפתחו גם לחשבת השכר */}
            {(isCoord || isClerk) && (
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
            {(isCoord || isClerk) && (
              <button className={`nav-btn ${view==='slips' ? 'active' : ''}`} onClick={() => setView('slips')}>
                <FileText size={15} strokeWidth={2.2} />
                תלושים
              </button>
            )}
            {(isCoord || isClerk) && (
              <button className={`nav-btn ${view==='mm' ? 'active' : ''}`} onClick={() => setView('mm')}>
                <CalendarClock size={15} strokeWidth={2.2} />
                היעדרויות
              </button>
            )}
            {(isCoord || isClerk) && <span className="nav-sep" />}

            {/* ── ניתוח ── */}
            {isCoord && (
              <button className={`nav-btn ${view==='report' ? 'active' : ''}`} onClick={() => setView('report')}>
                <BarChart3 size={15} strokeWidth={2.2} />
                דוח רשת
              </button>
            )}
            {(isCoord || isClerk) && (
              <button className={`nav-btn ${view==='finance' ? 'active' : ''}`} onClick={() => setView('finance')}>
                <Wallet size={15} strokeWidth={2.2} />
                עלות הוראה
              </button>
            )}
            {(isCoord || isClerk) && (
              <button className={`nav-btn ${view==='calibration' ? 'active' : ''}`} onClick={() => setView('calibration')}>
                <Percent size={15} strokeWidth={2.2} />
                תלושים מול תחשיב
              </button>
            )}
            {isCoord && <span className="nav-sep" />}

            {/* ── ניהול ── */}
            {/* "גם אסתר תראה את הטפסים" (שרה, 10.9) — טפסי 101, המסמכים
                והחוזים פתוחים לחשבת לצפייה; יצירת קישורים והעלאת חוזה נשארו של שרה */}
            {(isCoord || isClerk) && (
              <button className="nav-btn" onClick={() => setShowOnboarding(true)}>
                <FileText size={15} strokeWidth={2.2} />
                קליטה
              </button>
            )}
            {/* כתב קבלה וסילוק לוותיקים (שרה, 20.9) — אסתר רואה, רק שרה יוצרת ושולחת */}
            {(isCoord || isClerk) && (
              <button className="nav-btn" onClick={() => setShowRelease(true)}>
                <ClipboardCheck size={15} strokeWidth={2.2} />
                כתבי סילוק
              </button>
            )}
            {/* מה שהמערכת אמרה ולמי — הוואטסאפ נבלע בין הודעות, זה נשאר */}
            {(isCoord || isClerk) && (
              <button className={`nav-btn ${view==='alerts' ? 'active' : ''}`} onClick={() => setView('alerts')}>
                <Bell size={15} strokeWidth={2.2} />
                התראות
              </button>
            )}
            {(isCoord || isClerk) && <span className="nav-sep" />}

            {/* ── מערכת ── */}

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
                  style={{ fontSize:14.4, fontWeight:700, color:'var(--text)', background:'none', border:'none',
                    cursor:'pointer', fontFamily:'inherit', textAlign:'center', minWidth:92, appearance:'auto' }}>
                  {sortedMonthKeys.map(k => (
                    <option key={k} value={k}>{fmtMonth(k)}{k === firstMonthKey ? ' · ראשון' : ''}</option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize:14.4, fontWeight:700, color:'var(--text)', minWidth:92, textAlign:'center' }}>{fmtMonth(activeMonth)}</span>
              )}
              <button title="חודש הבא"
                onClick={() => { const i=sortedMonthKeys.indexOf(activeMonth); if(i<sortedMonthKeys.length-1) setActiveMonth(sortedMonthKeys[i+1]); }}
                style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', display:'flex', padding:4, borderRadius:7 }}>
                <ChevronLeft size={15} strokeWidth={2.5} />
              </button>
              {isCoord && sortedMonthKeys.indexOf(activeMonth) === sortedMonthKeys.length-1 && (
                <button onClick={openNewMonth} title="פתיחת חודש חדש"
                  style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:13.2, padding:'4px 9px', background:'var(--teal)',
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
          position:'sticky', top:62, zIndex:39, padding:'8px 16px', fontSize:14.9, fontWeight:600,
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          background: error ? 'var(--danger-bg)' : 'var(--teal-100)',
          color: error ? 'var(--danger)' : 'var(--teal-700)',
          borderBottom: `1px solid ${error ? 'var(--danger-line)' : '#B8EAF2'}`,
        }}>
          {error
            ? <><AlertTriangle size={14} strokeWidth={2.3} />{error}
                <button onClick={() => setError('')} className="apple-btn apple-btn-ghost"
                  style={{ minHeight:26, padding:'0 9px', fontSize:13.8, marginInlineStart:6 }}>סגירה</button></>
            : <>שומר…</>}
        </div>
      )}

      <div className="flex-1">
        {/* לחשבת יש כפתורי תלושים/התראות בניווט, אבל הענף הזה רונדר תמיד
            לפניהם — הכפתורים היו מתים (ממצא QA, 3.9). עכשיו הם עוברים. */}
        {isClerk && view !== 'slips' && view !== 'alerts' && view !== 'finance' && view !== 'mm' && view !== 'calibration' ? (
          <PayrollDesk
            teachers={teachers}
            schools={schools}
            activeMonth={activeMonth}
            userRole={user.role}
            userId={user.id}
            onSavePayroll={(id, patch) => run(() => store.savePayroll(id, patch))}
            onSaveActual={(id, amount) => run(() => store.saveActualCost(id, amount))}
            onImportSlip={(items, file, note) => run(async () => {
              await store.importSlip(items);
              // הקובץ עצמו נשמר במסמכי החודש — שיהיה ברור מאיפה המספרים
              if (file) await store.uploadDocument({ monthKey: activeMonth, schoolId: null, note, file }).catch(() => {});
            })}
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
            onImportSlip={(items, file, note) => run(async () => {
              await store.importSlip(items);
              // הקובץ עצמו נשמר במסמכי החודש — שיהיה ברור מאיפה המספרים
              if (file) await store.uploadDocument({ monthKey: activeMonth, schoolId: null, note, file }).catch(() => {});
            })}
            onSaveScope={(id, which, val) => run(() => store.saveTeacher(
              which === 'gender' ? { id, gender: val }
                : { id, scopePct: val, scopeSetAt: new Date().toISOString() }, activeMonth))}
          />
        ) : view === 'alerts' ? (
          <NotificationsView />
        ) : view === 'report' ? (
          <ReportView schools={schools} teachers={teachers} onSaveTeacher={onSaveTeacher} onApprove={onApproveTeacher} simState={simState} onCompute={onCompute} onDelete={onDeleteTeacher} />
        ) : view === 'finance' && (user.role === 'coordinator' || user.role === 'clerk') ? (
          <TeachingCostView schools={schools} teachers={teachers} monthKey={activeMonth} onSaveSchool={onSaveSchool} />
        ) : view === 'calibration' && (user.role === 'coordinator' || user.role === 'clerk') ? (
          <CalibrationView schools={schools} teachers={teachers} monthKey={activeMonth} />
        ) : view === 'mm' && (user.role === 'coordinator' || user.role === 'clerk') ? (
          <AbsencesView schools={schools} teachers={teachers} monthKey={activeMonth} fmtMonthFn={fmtMonth} />
        ) : view === 'slips' ? (
          <SlipsView schools={schools} teachers={teachers} monthKey={activeMonth} fmtMonthFn={fmtMonth}
            onSaveTeacher={user.role === 'coordinator' ? onSaveTeacher : null}
            onMarkSlip={(user.role === 'coordinator' || user.role === 'clerk')
              ? (id, issued) => run(() => store.markSlipIssued(id, issued)) : null}
            onSaveSlipGross={(user.role === 'coordinator' || user.role === 'clerk')
              ? (id, amount) => run(() => store.saveSlipGross(id, amount)) : null} />
        ) : view === 'school' && activeSchool ? (
          <SchoolView userId={user.id}
            school={activeSchool}
            teachers={teachers}
            userRole={user.role}
            onBack={() => setView('schools')}
            onSaveTeacher={onSaveTeacher}
            onDeleteTeacher={onDeleteTeacher}
            onApproveTeacher={onApproveTeacher}
            simState={simState}
            onCompute={onCompute}
            onImportTeachers={onImportTeachers}
            activeMonth={activeMonth}
            fmtMonthFn={fmtMonth}
          />
        ) : (
          /* Coordinator: schools list */
          <div className="page-wrap" style={{ maxWidth:1152 }}>
            <PageHead
              title="בתי הספר"
              subtitle={`${schools.length} בתי ספר ברשת · חודש ${fmtMonth(activeMonth)}`}
              actions={
                <button className="apple-btn apple-btn-blue" onClick={() => setSchoolModal({ id:'', name:'', city:'', reform:'ofek' })}>
                  <Plus size={15} strokeWidth={2.6} />
                  הוסף בית ספר
                </button>
              }
            />
            {/* מעקב מילוי — ראשון, כי זו השאלה הראשונה של השליח בבוקר */}
            {schools.length > 0 && (<>
              <SlipsHandoff monthKey={activeMonth} role="coordinator" />
              <FillProgress schools={schools} month={activeMonth}
                onOpenSchool={id => { const sc = schools.find(x => x.id === id); if (sc) { setActiveSchool(sc); setView('school'); } }} />
            </>)}

            {schools.length === 0 ? (
              <div className="apple-card" style={{ textAlign:'center', padding:'80px 20px' }}>
                <div style={{ width:64, height:64, borderRadius:18, background:'var(--purple-100)', margin:'0 auto 16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <School size={30} strokeWidth={1.8} color="var(--purple)" />
                </div>
                <p style={{ fontWeight:600, fontSize:18.4, color:'var(--apple-text)', marginBottom:6 }}>אין בתי ספר עדיין</p>
                <p style={{ fontSize:16.1, color:'var(--apple-text2)' }}>לחצי על "הוסף בית ספר" להתחלה</p>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gridAutoRows:'1fr', gap:16 }}>
                {schools.map(s => {
                  const ts      = teachers.filter(t => t.schoolId === s.id);
                  const empTot  = ts.reduce((sum, t) => sum + calcEmployer(t).total, 0);
                  const simN    = ts.filter(needsSim).length;
                  const apprN   = ts.filter(needsApproval).length;
                  const used    = schoolHours(ts);   // בלי מנהלת וחל"ד/חל"ת — כמו במסך האישור
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
                          <h3 style={{ fontWeight:700, fontSize:18.4, color:'var(--apple-text)', marginBottom:2, letterSpacing:'-0.01em' }}>{s.name}</h3>
                          {s.city && <p style={{ fontSize:14.9, color:'var(--apple-text2)' }}>{s.city}</p>}
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
                      <div className="sc-stats" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
                        <div style={{ background:'var(--fill)', borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
                          <p style={{ fontSize:13.2, color:'var(--text2)', marginBottom:2 }}>עובדי הוראה</p>
                          <p className="num" style={{ fontWeight:800, fontSize:25.3, color:'var(--text)', letterSpacing:'-0.02em' }}>{ts.length}</p>
                        </div>
                        <div style={{ background:'var(--fill)', borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
                          <p style={{ fontSize:13.2, color:'var(--text2)', marginBottom:2 }}>שעות</p>
                          <p className="num" style={{ fontWeight:700, fontSize:16.1, color: overQuota ? 'var(--danger)' : 'var(--text)' }}>
                            {quota ? `${used} / ${quota}` : used || '—'}
                          </p>
                          {overQuota && (
                            <p className="num" style={{ fontSize:12.6, fontWeight:800, color:'var(--danger)', marginTop:1 }}>
                              +{used - quota} שעות מעל התקן
                            </p>
                          )}
                        </div>
                        <div className="sc-money" style={{ background:'var(--fill)', borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
                          <p style={{ fontSize:13.2, color:'var(--text2)', marginBottom:2 }}>למעסיק/חודש</p>
                          <p className="num" style={{ fontWeight:700, fontSize:16.1, color:'var(--text)', letterSpacing:'-0.01em' }}>{empTot > 0 ? empTot.toLocaleString('he-IL')+' ₪' : '—'}</p>
                        </div>
                      </div>
                      <button className="apple-btn apple-btn-ghost" onClick={e => { e.stopPropagation(); setTeacherModal({ ...EMPTY_TEACHER, schoolId: s.id, reform: s.reform || 'ofek' }); }}
                        style={{ width:'100%', fontSize:14.9, borderRadius:10, border:'1.5px dashed var(--apple-fill2)' }}>
                        + הוספת עובד/ת הוראה
                      </button>
                      {/* במובייל כל הכרטיס לחיץ אבל שום דבר לא אומר זאת —
                          כפתור כניסה מפורש. בדסקטופ יש hover, והוא מוסתר. */}
                      <div className="only-mobile" style={{ marginTop:8 }}>
                        <button className="apple-btn apple-btn-blue" style={{ width:'100%' }}
                          onClick={e => { e.stopPropagation(); setActiveSchool(s); setView('school'); }}>
                          כניסה לבית הספר
                          <ChevronLeft size={15} strokeWidth={2.4} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* שורת הקרדיט — פעם אחת, בתחתית המעטפת, בכל מסך אחרי התחברות */}
      <footer className="no-print" style={{ marginTop:'auto' }}>
        <CreditLine className="px-4 pt-6 pb-[calc(1rem+env(safe-area-inset-bottom))]" />
      </footer>

      {showApproval && (
        <ApprovalView
          teachers={teachers}
          schools={schools}
          onApprove={onApproveTeacher}
          onApproveAll={onApproveAll}
          onClose={() => setShowApproval(false)}
        />
      )}
      {showRelease && <ReleaseAdmin schools={schools} activeMonth={activeMonth} readOnly={user.role !== 'coordinator'} onClose={() => setShowRelease(false)} />}
      {showOnboarding && <OnboardingAdmin activeMonth={activeMonth} readOnly={user.role === 'clerk'} onClose={() => setShowOnboarding(false)} />}
      {schoolModal  && <SchoolModal  school={schoolModal}  onSave={onSaveSchool}  onClose={() => setSchoolModal(null)} />}
      {showBackup && <BackupModal schools={schools} months={months} onClose={() => setShowBackup(false)} />}
      {teacherModal && <TeacherModal teacher={teacherModal} schools={schools} userRole={user.role} onSave={onSaveTeacher} onClose={() => setTeacherModal(null)} />}
    </div>
  );
}
