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
  // "אין מחנכת חטיבה" (שרה, 8.9) — כל 93 השורות ברשת הן יסודי, ואף
  // אחת לא סומנה homeroom2. האפשרות הוסרה מהבורר כדי שלא תיבחר בטעות
  // ותיתן גמול 11.5% במקום 10% (התקלה מ-3.9). המיפוי ב-sim-form.mjs
  // נשאר, כדי ששורה ישנה שתגיע מייבוא לא תישבר.
  // מורה לשילוב (שרה, 8.9) — תפקיד מתאר, בלי גמול תפקיד. אינו נשלח
  // לשון ניטרלית: ברשת מלמדים גם גברים (9 שורות, רובן בעפולה).
  // למחשבון הרשמי כגמול, ולכן אינו משנה את הברוטו.
  { id: 'inclusion',  label: 'מורה לשילוב',                 pct: 0,    min: 0    },
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
  homeroom2:'מחנכת חטיבה · 11.5%',  // הוסר מהבורר; נשאר לתצוגת שורה ישנה
  inclusion:'מורה לשילוב', subject6:'רכזת מקצוע · 6%', subject8:'רכזת מקצוע · 8%',
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

/* ═══════════════════════════════════════════════════════════════
   טבלת מבנה שבוע העבודה הרשמית של אופק חדש — "הטבלה הרשמית מכריעה"
   (הכרעת שרה, 6.9.2026, מחליפה את הטבלאות שחולצו מהנתונים המיובאים
   ב-4.9 ואת הנוסחה הליניארית שעות/26).

   המקור: אגף בכיר כוח-אדם בהוראה, משרד החינוך —
   יסודי: meyda.education.gov.il/files/PortalOvdeyHoraa/POH/ofek-elementry-school-teachers.PDF
   חט"ב:  meyda.education.gov.il/files/PortalOvdeyHoraa/POH/ofek-middle-school-teacher.PDF

   משרה חלקית אינה יחסית: לכל מספר שעות פרונטליות יש שורה עם פרטני,
   שהייה ומקדם משרה. המקדם = סה"כ השעות חלקי בסיס המשרה (36; שעות
   גיל 2 → 34; שעות גיל 4 → 32; אצל אם נספרות גם שהיית האם וההשלמה).
   כל שורה כאן אומתה מול ה-PDF: סה"כ × מכנה = מקדם.

   מבנה שורה: [פרטני, שהייה, מקדם, שהיית-אם?, השלמה-לשהיית-אם?]
   האינדקס במערך = שעות פרונטליות (אינדקס 0 ריק). חצאי שעות אמיתיים.
═══════════════════════════════════════════════════════════════ */
const OFEK_ELEM = {
  // מורה רגילה, עד גיל 50
  base: [null,
    [0, 0, 0.0278], [0, 0, 0.0556], [0, 0, 0.0833], [1, 1, 0.1667], [1, 1, 0.1944],
    [1, 1, 0.2222], [2, 1, 0.2778], [2, 2, 0.3333], [2, 2, 0.3611], [2, 2, 0.3889],
    [2, 2, 0.4167], [2, 2, 0.4444], [2, 3, 0.5],    [3, 2, 0.5278], [3, 3, 0.5833],
    [3, 3, 0.6111], [3, 3, 0.6389], [4, 3, 0.6944], [4, 3, 0.7222], [4, 4, 0.7778],
    [4, 4, 0.8056], [4, 5, 0.8611], [5, 5, 0.9167], [5, 5, 0.9444], [5, 5, 0.9722],
    [5, 5, 1],      [5, 5, 1.0278], [5, 5, 1.0556], [5, 5, 1.0833], [5, 5, 1.1111],
    [5, 5, 1.1389], [5, 5, 1.1667]],
  // שעות גיל 2 (גיל 50–55, וגם 55+ "חדשה" — סעיף 8.4: אין הפחתה נוספת)
  g2: [null,
    [0, 0, 0.0294], [0, 0, 0.0588], [0, 0, 0.0882], [1, 0, 0.1471], [1, 1, 0.2059],
    [1, 1, 0.2353], [2, 1, 0.2941], [2, 2, 0.3529], [2, 2, 0.3824], [2, 2, 0.4118],
    [2, 2, 0.4412], [2, 3, 0.5],    [3, 3, 0.5588], [3, 3, 0.5882], [3, 3, 0.6176],
    [3, 3, 0.6471], [4, 3, 0.7059], [4, 4, 0.7647], [4, 4, 0.7941], [4, 5, 0.8529],
    [5, 5, 0.9118], [5, 5, 0.9412], [5, 5, 0.9706], [5, 5, 1],      [5, 5, 1.0294],
    [5, 5, 1.0588], [5, 5, 1.0882], [5, 5, 1.1176], [5, 5, 1.1471], [5, 5, 1.1765],
    [5, 5, 1.2059], [5, 5, 1.2353]],
  // שעות גיל 4 (גיל 55+ ותיקה)
  g4: [null,
    [0, 0, 0.0313], [0, 0, 0.0625], [0, 0, 0.0938], [1, 1, 0.1875], [1, 1, 0.2188],
    [1, 1, 0.25],   [2, 1, 0.3125], [1, 2, 0.3438], [1, 2, 0.375],  [1, 2, 0.4063],
    [1, 2, 0.4375], [1, 3, 0.5],    [2, 2, 0.5313], [2, 3, 0.5938], [2, 3, 0.625],
    [2, 3, 0.6563], [3, 3, 0.7188], [3, 4, 0.7813], [3, 4, 0.8125], [4, 5, 0.9063],
    [4, 5, 0.9375], [4, 5, 0.9688], [4, 5, 1],      [4, 5, 1.0313], [4, 5, 1.0625],
    [4, 5, 1.0938], [4, 5, 1.125],  [4, 5, 1.1563], [4, 5, 1.1875], [4, 5, 1.2188],
    [4, 5, 1.25],   [4, 5, 1.2813]],
  // משרת אם
  m: [null,
    [0, 0, 0.0278], [0, 0, 0.0556], [0, 0, 0.0833], [1, 0, 0.1389], [1, 1, 0.1944, 1],
    [2, 1, 0.25, 1], [2, 1, 0.2917, 1, 0.5], [2, 1.5, 0.3333, 1.5, 0.5], [2, 2, 0.375, 2, 0.5], [2, 2, 0.4028, 2, 0.5],
    [2, 2, 0.4306, 2, 0.5], [2, 2, 0.4722, 2, 1], [3, 3, 0.5556, 3, 1], [3, 3, 0.5833, 3, 1], [3, 3, 0.6111, 3, 1],
    [3, 3, 0.6389, 3, 1], [4, 3, 0.6944, 3, 1], [4, 3, 0.7222, 3, 1], [4, 3.5, 0.7778, 3.5, 1.5], [4, 3.5, 0.8056, 3.5, 1.5],
    [4, 4, 0.8611, 4, 2], [5, 4, 0.9167, 4, 2], [5, 4, 0.9444, 4, 2], [5, 4, 0.9722, 4, 2], [5, 4, 1, 4, 2],
    [5, 4, 1.0278, 4, 2], [5, 4, 1.0556, 4, 2], [5, 4, 1.0833, 4, 2], [5, 4, 1.1111, 4, 2], [5, 4, 1.1389, 4, 2],
    [5, 4, 1.1667, 4, 2], [5, 4, 1.1944, 4, 2]],
  // משרת אם + שעות גיל 2
  mg2: [null,
    [0, 0, 0.0294], [0, 0, 0.0588], [1, 0, 0.1176], [1, 0, 0.1471], [1, 1, 0.2059, 1],
    [1, 1, 0.2353, 1], [2, 1.5, 0.3235, 1.5, 0.5], [2, 1.5, 0.3529, 1.5, 0.5], [2, 1.5, 0.3824, 1.5, 0.5], [2, 1.5, 0.4118, 1.5, 0.5],
    [2, 2, 0.4706, 2, 1], [2, 3, 0.5294, 3, 1], [3, 3, 0.5882, 3, 1], [3, 3, 0.6176, 3, 1], [3, 3, 0.6471, 3, 1],
    [3, 3, 0.6765, 3, 1], [4, 3.5, 0.7647, 3.5, 1.5], [4, 3.5, 0.7941, 3.5, 1.5], [4, 4, 0.8529, 4, 2], [5, 4, 0.9118, 4, 2],
    [5, 4, 0.9412, 4, 2], [5, 4, 0.9706, 4, 2], [5, 4, 1, 4, 2], [5, 4, 1.0294, 4, 2], [5, 4, 1.0588, 4, 2],
    [5, 4, 1.0882, 4, 2], [5, 4, 1.1176, 4, 2], [5, 4, 1.1471, 4, 2], [5, 4, 1.1765, 4, 2], [5, 4, 1.2059, 4, 2],
    [5, 4, 1.2353, 4, 2], [5, 4, 1.2647, 4, 2]],
  // משרת אם + שעות גיל 4
  mg4: [null,
    [0, 0, 0.0313], [0, 0, 0.0625], [1, 0, 0.125], [1, 0, 0.1563], [1, 1, 0.2188, 1],
    [1, 1, 0.2656, 1, 0.5], [1, 1.5, 0.3125, 1.5, 0.5], [1, 1.5, 0.3438, 1.5, 0.5], [1, 2, 0.3906, 2, 0.5], [1, 2, 0.4219, 2, 0.5],
    [2, 2, 0.5, 2, 1], [3, 2.5, 0.5781, 2.5, 1], [3, 2.5, 0.6094, 2.5, 1], [3, 3, 0.6563, 3, 1], [3, 3, 0.6875, 3, 1],
    [3, 3, 0.7344, 3, 1.5], [3, 3, 0.7813, 3, 2], [3, 4, 0.8438, 4, 2], [4, 4, 0.9063, 4, 2], [4, 4, 0.9375, 4, 2],
    [4, 4, 0.9688, 4, 2], [4, 4, 1, 4, 2], [4, 4, 1.0313, 4, 2], [4, 4, 1.0625, 4, 2], [4, 4, 1.0938, 4, 2],
    [4, 4, 1.125, 4, 2], [4, 4, 1.1563, 4, 2], [4, 4, 1.1875, 4, 2], [4, 4, 1.2188, 4, 2], [4, 4, 1.25, 4, 2],
    [4, 4, 1.2813, 4, 2], [4, 4, 1.3125, 4, 2]],
};
// חט"ב — מורה רגילה בלבד. וריאנטי גיל/אם של חט"ב לא הוזנו עדיין;
// שורה כזו נופלת לגזירה היחסית הישנה, לא לניחוש מהיסודי.
const OFEK_MIDDLE = [null,
  [0, 0, 0.0278], [0, 0, 0.0556], [0, 0, 0.0833], [1, 2, 0.1944], [1, 2, 0.2222],
  [1, 2, 0.25],   [2, 3, 0.3333], [2, 3, 0.3611], [2, 3, 0.3889], [2, 3, 0.4167],
  [2, 4, 0.4722], [2, 4, 0.5],    [2, 5, 0.5556], [3, 5, 0.6111], [3, 6, 0.6667],
  [3, 6, 0.6944], [3, 6, 0.7222], [3, 7, 0.7778], [3, 7, 0.8056], [3, 7, 0.8333],
  [4, 8, 0.9167], [4, 8, 0.9444], [4, 9, 1],      [4, 9, 1.0278], [4, 9, 1.0556],
  [4, 9, 1.0833], [4, 9, 1.1111], [4, 9, 1.1389], [4, 9, 1.1667], [4, 9, 1.1944],
  [4, 9, 1.2222], [4, 9, 1.25]];

// איזו עמודת טבלה חלה על המורה: גיל ואמהוּת. age55n מקבלת את עמודת
// שעות גיל 2 — סעיף 8.4 בחוזר: אין הפחתה נוספת מעבר לזו של גיל 50.
const ofekVariantKey = t => {
  const g = t.ageGroup === 'age50' || t.ageGroup === 'age55n' ? 'g2'
          : t.ageGroup === 'age55' ? 'g4' : '';
  return (isMother(t) ? 'm' : '') + g || 'base';
};
// השורה הרשמית של המורה לפי שעותיה הפרונטליות; null כשאין טבלה מוזנת
// (חטיבה עם גיל/אם, עליון, מעל 32 שעות) — ואז נופלים לגזירה הישנה.
function ofekOfficialRow(t, frontalHours) {
  if (t.reform !== 'ofek') return null;
  const f = Math.round(Number(frontalHours));
  if (!f || f < 1 || f > 32) return null;
  const level = t.level || 'elementary';
  if (level === 'elementary') return OFEK_ELEM[ofekVariantKey(t)]?.[f] || null;
  if (level === 'middle' && ofekVariantKey(t) === 'base') return OFEK_MIDDLE[f] || null;
  return null;
}
// אחוז המשרה הרשמי כמספר שלם — scope_pct במסד הוא integer, ולכן
// 0.9167 מוצע כ-92 (העיגול הקרוב, לא חיתוך). ההצעה עדיין מחכה ללחיצה.
const ofekOfficialScope = t => {
  const row = ofekOfficialRow(t, t.frontalHours);
  return row ? Math.round(row[2] * 100) : null;
};
// שמות היסטוריים — נשמרים כדי לא לשבור יבוא; שניהם קוראים מהטבלה הרשמית
const ofekTableScope = t => (t.reform === 'ofek' && !isMother(t) ? ofekOfficialScope(t) : null);
const ofekMomScope   = t => (t.reform === 'ofek' &&  isMother(t) ? ofekOfficialScope(t) : null);
// מפה ישנה לאם (שעות→אחוז) — מיוצאת עדיין; נבנית מהעמודה הרשמית
const OFEK_MOM_SCOPE = Object.fromEntries(
  OFEK_ELEM.m.map((r, f) => (r ? [f, Math.round(r[2] * 100)] : null)).filter(Boolean));

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
  const cur     = scopeOverride || currentScope(t);
  const frontal = cur.frontalHours || Math.round(baseFrontal * (cur.scopePct || 0) / 100);
  /*
    "הטבלה הרשמית מכריעה" (שרה, 6.9): פרטני ושהייה נקראים מהשורה
    הרשמית של משרד החינוך, לא נגזרים יחסית. הגזירה היחסית הטעתה —
    13 שעות הציגו 3 פרטני במקום 2, 18 הציגו 3 במקום 4.
  */
  const row = ofekOfficialRow(t, frontal);
  if (row) {
    return {
      scopePct: cur.scopePct || Math.round(row[2] * 100),
      frontal, individual: row[0], presence: row[1],
      /*
        שהיית אם — **אותו מספר** שכבר יושב ב-presence, לא תוספת עליו.
        חיבור השניים הכפיל את השהייה (שרה, 8.9: "השהייה לא מתאים
        בכלל הוא כפול"). נשאר לתצוגה בלבד; מי שמציג שהייה — presence.
      */
      momPresence: row[3] || 0,
      officialCoef: row[2],                    // המקדם הרשמי, 4 ספרות
    };
  }
  // אין שורה מוזנת (חטיבה עם גיל/אם, עליון, מעל 32 שעות) — הגזירה
  // היחסית הישנה, מסומנת כלא-רשמית
  const scopePct   = cur.scopePct || Math.round((frontal / baseFrontal) * 100);
  const individual = Math.round(baseIndividual * scopePct / 100);
  const presence   = Math.round(lvl.presence   * scopePct / 100);
  return { scopePct, frontal, individual, presence, momPresence: 0, officialCoef: null };
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
  /*
    נסיעות ומעונות נכנסים לבסיס של מס שכר וביטוח לאומי, אך לא לפנסיה
    ולקרן ההשתלמות — הם החזר הוצאות ולא שכר.

    תוספת בית חב"ד אינה נכנסת לשום בסיס: **"לתוספת אין עלויות נוספות"**
    (שרה, 8.9). קודם היא נשאה מס שכר וביטוח לאומי, ולפני כן 30% מלאים.
    היא כולה מכיס הרשת, בלי הפרשות ובלי מסים מעליה.
  */
  const wage = base + biguud + havraah + travel + daycare;
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

/*
  כמה מהעלות נגרר מרכיב התוספת בלבד — **אפס** (שרה, 8.9):
  "לתוספת אין עלויות נוספות". הפונקציה נשארת כדי שהקוראים שלה לא
  יישברו, ומחזירה 0 במפורש ולא בשקט.
*/
function supplementCost(/* base, supplement, biguud, havraah */) {
  return 0;
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
    /*
      התוספת של מנהלת הייתה 4,700 קבוע (שרה, 2.9) — מספר אחד לכולן,
      שהתעלם ממה שהוזן. מ-9.9 הוא ברירת מחדל בלבד: כשנקבע ערך לשורה
      הוא גובר, כי הבסיס האמיתי נמדד לכל מנהלת בנפרד במחשבון העולם
      הישן (9,527 עד 12,498, לפי ותק ומספר כיתות).

      0 הוא ערך לגיטימי ומשמעותו "הכול בסיס": פנסיה וקרן השתלמות חלות
      על הבסיס בלבד, ולכן כך נרשמת מנהלת שהוסכם איתה שהכול מופרש —
      חני אסולין (שרה, 9.9). לכן הבדיקה היא על null ולא על falsy.
    */
    // supp0 כבר המיר null ל-0, ולכן קוראים את השדה הגולמי כדי להבחין
    // בין "לא נקבע" (ברירת מחדל 4,700) לבין 0 שנקבע במפורש.
    const raw = t._chabadSupp;
    const set = raw !== null && raw !== undefined && raw !== '';
    const psupp = !schoolPaysSupp(t.schoolId) ? 0
      : Math.min(set ? Math.max(0, Number(raw) || 0) : PRINCIPAL_CHABAD_SUPP, gross);
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

  /*
    רצפת תקצוב: העלות למעסיק לא יורדת מ-135% מהברוטו. הרצפה היא רשת
    ביטחון בלבד — החישוב המפורט למעלה הוא שעובד, והוא הוכיח את עצמו
    מול שלוש מדידות עצמאיות של עלות מעביד בפועל:
      · דו"ח עלות עבודה 9/25, קטמון (שלהבות ירושלים)  — 34.7%
      · תלוש מרכז רמת ישי, שנה שעברה                   — 29.4%
      · טבלת אסתר למזכרת בתיה, תשפ"ז                    — 28.6%
    בכל השלוש הברוטו כולל כבר הבראה וביגוד, ולכן ההשוואה נעשית מול
    המפורט על אותו בסיס.

    ההיסטוריה: 140% (שרה, 29.8) → 150% (7.9, מהצלבת רמת ישי) → 135%
    (שרה, 9.9). ה-150% פיצה על ברוטו מתוכנן שיצא נמוך מהתלוש, וזה
    התיקון הלא נכון: הברוטו מתוקן בייבוא של חשבת השכר, לא במקדם.
  */
  const FLOOR_RATE = 0.35;
  const floorGap = Math.max(0, Math.round(gross * FLOOR_RATE) - itemized);
  if (floorGap > 0) {
    parts.push({
      key: 'floor',
      label: 'השלמה ל-135% (נסיעות, מעונות ותוספות שטרם פורטו)',
      rate: null, on: null, amount: floorGap,
    });
  }
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

  // רזרבת מילוי מקום: 5% מעלות ההוראה המתוכננת (ברוטו + הוצאות מעביד),
  // הוראת שרה 7.9. זה תכנון, לא תשלום — ולכן, כמו רצפת ה-150%, היא
  // שורה נפרדת שמצטמצמת מעצמה ככל שמדווחות שעות מילוי מקום בפועל על
  // השורה הזו, ונעלמת לגמרי ברגע שהנהלת החשבונות מקלידה עלות בפועל.
  const MM_RESERVE_RATE = 0.05;
  const mmReserve = Math.max(0,
    Math.round((gross + itemized + floorGap) * MM_RESERVE_RATE) - mmPay);
  if (mmReserve > 0) parts.push({ key: 'mmReserve',
    label: 'רזרבת מילוי מקום (5% מעלות ההוראה המתוכננת)',
    rate: MM_RESERVE_RATE, on: null, amount: mmReserve });
  const estimate = itemized + floorGap + mmReserve;

  const employerSupp = supplementCost(base, supplement, extras.biguud, extras.havraah);
  const employerBase = estimate - employerSupp;
  const actual   = Number(t._actualEmployerCost) || 0;
  const social   = actual || estimate;
  return {
    gross, base, mom, supplement, employerBase, employerSupp, social,
    estimate, isEstimate: !actual, mmPay,
    total: gross + social + mmPay,
    parts,                                    // הפירוט המלא, שורה לכל רכיב
    // השיעור בפועל, מעל הברוטו לעובדת. עם רצפת ה-135% ורזרבת המ"מ הוא לא יורד מ-41.75%,
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
