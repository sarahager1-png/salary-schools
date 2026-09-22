/*
  ייבוא תלוש מרכז — קובץ מהנהלת החשבונות הופך לעדכון ברוטו ועלות מעביד.

  הקובץ שאסתר מקבלת ממערכת השכר אינו אחיד: לפעמים עם שורת כותרות
  (שם, ברוטו, עלות מעביד…), לפעמים בלי — כמו הצילום של רמת ישי (7.9):
  מספר עובד, שם עם תווית בית הספר ("רמת ישי-884"), ברוטו, חמישה רכיבי
  מעביד, וסה"כ. לכן הזיהוי הוא בשני שלבים: כותרות אם יש, ואם אין —
  היגיון על המספרים: הגדול בשורה הוא עלות המעביד, והגדול שאחריו הוא
  הברוטו (הברוטו תמיד הרכיב הגדול ביותר בתוך העלות).

  ההצלבה מול המורות: ת.ז. קודם, ואם אין — שם. שמות בתלוש כתובים "משפחה
  פרטי" ובמערכת "פרטי משפחה", עם או בלי שם שני ("וולוסוב חיה" מול "חיה
  מושקא וולוסוב"), ולכן משווים קבוצות מילים ולא מחרוזות. הלקח מרמת ישי
  [project-salary-last-year-baseline]: השוואה לפי מחרוזת שם נכשלת.

  הכול JS טהור — נבדק ב-node בלי דפדפן.
*/
import * as XLSX from 'xlsx';

const HEADERS = {
  name:  ['שם', 'שם עובד', 'שם העובד', 'שם עובדת', 'שם מלא', 'עובד'],
  tz:    ['ת.ז', 'ת.ז.', 'תז', 'תעודת זהות', 'מספר זהות', 'ת"ז', 'ת״ז'],
  gross: ['ברוטו', 'שכר ברוטו', 'סה"כ ברוטו', 'ברוטו לתשלום', 'שכר'],
  cost:  ['עלות מעביד', 'עלות למעביד', 'סה"כ עלות', 'עלות כוללת', 'סה"כ למעסיק', 'עלות'],
};

const clean = s => String(s ?? '').replace(/[‎‏‪-‮]/g, '').trim();
const toNum = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = clean(v).replace(/[,\s₪]/g, '');
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
};
const isHebrew = s => /[א-ת]/.test(s);

// "וולוסוב שיינירמת ישי-884" → "וולוסוב שייני". תווית בית הספר נדבקת
// לשם בייצוא, עם או בלי רווח; מזהים אותה לפי "-מספר" בסוף.
function stripSchoolTag(name, schoolNames = []) {
  let s = clean(name).replace(/\s*[-–]\s*\d{2,5}\s*$/, '');
  for (const sc of schoolNames) {
    const short = clean(sc).replace(/^(שלהבות|בית חינוך)\s+/, '');
    if (short && s.endsWith(short)) s = s.slice(0, -short.length);
    if (sc && s.endsWith(clean(sc))) s = s.slice(0, -clean(sc).length);
  }
  return s.replace(/[״"'’]/g, '').replace(/\s+/g, ' ').trim();
}
/*
  שם קודם בתוכנת השכר ← השם במערכת. עובדת שהתחתנה נשארת בתלוש בשם
  הנעורים: "אורנשטיין יעל" היא יעל ליפשיץ, אשקלון (שרה, 22.9). ההחלפה
  על השם המלא בלבד, כדי שרחל אורנשטיין (מזכרת בתיה) לא תיגרר.
  "מור יוסף היא אטיאס לפני הנישואין" — חני מור יוסף, רעננה (שרה, 22.9).
*/
const ALIASES = {
  'אורנשטיין יעל': 'ליפשיץ יעל',
  'אטיאס חני': 'מור יוסף חני',
  'אטיאס חנה': 'מור יוסף חני',
};
const words = s => { const n = stripSchoolTag(s); return (ALIASES[n] || n).split(' ').filter(w => w.length > 1); };

/*
  מילה תואמת מילה גם בהבדל של אות אחת: "ויינטרוב"/"וינטרוב", "נסים"/"ניסים",
  וכינוי מול שם מלא בהבדל של סיומת: "דבורי"/"דבורה". תלושי מזכרת בתיה
  (15.9) נפלו על שלושת אלה. רק במילים של 4 אותיות ומעלה, כדי ש"חיה"
  לא תתאים ל"חנה".
*/
function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
/*
  כינויים בני שלוש אותיות, שאינם נתפסים בהבדל של אות אחת (שם שומרים
  על 4 אותיות ומעלה): בתלוש "אלבוים חנה", במערכת "חני אלבוים".
  תלושי אשקלון (22.9) נפלו על זה — אסולין, אלבוים ואלבז.
*/
const NICK = [['חני', 'חנה']];
const isNick = (x, y) => NICK.some(([a, b]) => (x === a && y === b) || (x === b && y === a));
const wordMatch = (x, y) => x === y || isNick(x, y) || (x.length >= 4 && y.length >= 4 && editDistance(x, y) <= 1);

// שתי קבוצות מילים מתאימות אם הקטנה מוכלת בגדולה (שם שני חסר) —
// אבל לפחות שתי מילים משותפות, כדי ש"חיה" לבדה לא תתאים לשתי חיות.
function nameScore(a, b) {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  const common = [...A].filter(w => [...B].some(v => wordMatch(w, v))).length;
  if (common === A.size && common === B.size) return 3;          // זהות
  if (common >= 2 && (common === A.size || common === B.size)) return 2; // הכלה
  return 0;
}

/* קריאת הקובץ — מחזירה מטריצה של תאים (שורה ראשונה ייתכן שהיא כותרות) */
export function readSheet(data) {
  const wb = XLSX.read(data, { type: data instanceof ArrayBuffer ? 'array' : 'binary' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

/* זיהוי עמודות — לפי כותרות אם יש */
function headerIndex(row) {
  const idx = {};
  row.forEach((cell, i) => {
    const h = clean(cell).replace(/[״"'’]/g, '"');
    for (const key of Object.keys(HEADERS)) {
      if (idx[key] === undefined && HEADERS[key].some(x => h === x || h.startsWith(x + ' '))) idx[key] = i;
    }
  });
  return idx.name !== undefined && (idx.gross !== undefined || idx.cost !== undefined) ? idx : null;
}

/*
  שורות הקובץ → רשומות {name, tz, gross, cost}. cost הוא עלות המעביד
  הכוללת כפי שהיא בתלוש (ברוטו + הפרשות), לא החלק שמעל הברוטו.
*/
export function parseRows(matrix, schoolNames = []) {
  if (!matrix?.length) return { rows: [], mode: 'empty' };
  const head = headerIndex(matrix[0]);
  const out = [];
  if (head) {
    for (const r of matrix.slice(1)) {
      const name = stripSchoolTag(r[head.name], schoolNames);
      if (!isHebrew(name)) continue;
      out.push({ name, tz: head.tz !== undefined ? clean(r[head.tz]).replace(/\D/g, '') : '',
                 gross: head.gross !== undefined ? toNum(r[head.gross]) : null,
                 cost:  head.cost  !== undefined ? toNum(r[head.cost])  : null });
    }
    return { rows: out, mode: 'headers' };
  }
  /*
    בלי כותרות. העמודות קבועות לאורך הקובץ, ולכן מסיקים אותן מכל
    השורות יחד ולא שורה-שורה: עמודת העלות היא זו שהיא הגדולה ברוב
    השורות, עמודת הברוטו — השנייה בגודלה ברוב השורות. מספר העובד
    (שלם, ייחודי לכל שורה) יוצא מהמשחק לפני כן, אחרת בעובדת קטנה הוא
    גדול מהעלות שלה. ברוטו 0 נשאר 0 — זו עובדת שעזבה, לא חסר נתון.
  */
  const rows = matrix.filter(r => r.some(c => isHebrew(clean(c))));
  if (!rows.length) return { rows: [], mode: 'empty' };
  const width = Math.max(...rows.map(r => r.length));
  const col = j => rows.map(r => toNum(r[j]));
  const nameCol = (() => {
    let best = -1, n = 0;
    for (let j = 0; j < width; j++) {
      const c = rows.filter(r => { const s = clean(r[j]); return isHebrew(s) && s.replace(/[\d\s\-–]/g, '').length >= 3; }).length;
      if (c > n) { n = c; best = j; }
    }
    return best;
  })();
  const numeric = [];
  for (let j = 0; j < width; j++) {
    if (j === nameCol) continue;
    const v = col(j);
    if (v.filter(x => x !== null).length >= rows.length * 0.6) numeric.push(j);
  }
  const isId = j => {
    const v = col(j).filter(x => x !== null);
    return v.length >= 3 && v.every(x => Number.isInteger(x) && x >= 0 && x < 1e7) && new Set(v).size === v.length
      && v.every(x => x < 1e7);
  };
  const tzCol = numeric.find(j => col(j).filter(x => x !== null).every(x => /^\d{7,9}$/.test(String(x))) && isId(j));
  // מספר עובד: עמודת מזהים שצמודה לשם או יושבת בקצה הטבלה
  const edge = j => j === Math.min(...numeric) || j === Math.max(...numeric);
  const cand = numeric.filter(j => j !== tzCol && !(isId(j) && (Math.abs(j - nameCol) === 1 || edge(j))));
  const sum = j => col(j).reduce((a, x) => a + (x || 0), 0);
  // עלות המעביד היא תמיד הגדולה בשורה — ולכן גם סכום העמודה הגדול ביותר
  const costCol = cand.slice().sort((a, b) => sum(b) - sum(a))[0];
  // הברוטו: הרכיב הגדול ביותר בתוך העלות — 30%–97% ממנה ברוב השורות
  const ratioOk = j => {
    const pairs = rows.map(r => [toNum(r[j]), toNum(r[costCol])]).filter(([g, c]) => g > 0 && c > 0);
    return pairs.length && pairs.filter(([g, c]) => g / c >= 0.3 && g / c <= 0.97).length >= pairs.length * 0.7;
  };
  const grossCol = cand.filter(j => j !== costCol && ratioOk(j)).sort((a, b) => sum(b) - sum(a))[0];
  for (const r of rows) {
    const name = stripSchoolTag(r[nameCol], schoolNames);
    if (!isHebrew(name)) continue;
    out.push({ name, tz: tzCol !== undefined ? clean(r[tzCol]).replace(/\D/g, '') : '',
               gross: grossCol !== undefined ? toNum(r[grossCol]) : null,
               cost:  costCol  !== undefined ? toNum(r[costCol])  : null });
  }
  return { rows: out, mode: 'guess' };
}

/*
  הצלבה מול מורות החודש. teachers: [{id, name, tzId, schoolId, _officialGross,
  _actualEmployerCost}]. מחזירה matched / unmatchedRows / unmatchedTeachers.
  כל התאמה נושאת את מה שיכתב: gross (ברוטו) ו-actual (עלות מעל הברוטו).
*/
export function matchRows(rows, teachers, { schoolId = null } = {}) {
  // עובדת עם כמה תפקידים = כמה שורות; התלוש אחד. שורת ההוראה קודמת,
  // כדי שהברוטו מהתלוש יתיישב עליה ולא על שורת הצהרון.
  const pool = teachers.filter(t => !schoolId || t.schoolId === schoolId)
    .sort((a, b) => (a.job && a.job !== 'teaching' ? 1 : 0) - (b.job && b.job !== 'teaching' ? 1 : 0));
  const used = new Set();
  const matched = [], unmatchedRows = [];
  for (const r of rows) {
    let t = null, how = '';
    if (r.tz) {
      t = pool.find(x => !used.has(x.id) && String(x.tzId || '').replace(/\D/g, '') === r.tz);
      if (t) how = 'tz';
    }
    if (!t) {
      const scored = pool.filter(x => !used.has(x.id))
        .map(x => ({ x, s: nameScore(r.name, x.name) })).filter(z => z.s > 0)
        .sort((a, b) => b.s - a.s);
      // התאמה אחת ברורה בלבד — שתי מועמדות באותו ציון = לא מחליטים
      if (scored.length && (scored.length === 1 || scored[0].s > scored[1].s)) {
        t = scored[0].x; how = scored[0].s === 3 ? 'name' : 'name-partial';
      }
    }
    if (!t) { unmatchedRows.push(r); continue; }
    used.add(t.id);
    const gross  = r.gross != null && r.gross > 0 ? Math.round(r.gross) : null;
    const actual = r.cost != null && gross != null && r.cost > gross ? Math.round(r.cost - gross) : null;
    matched.push({ teacher: t, row: r, how, gross, actual,
      prevGross: t._officialGross ?? null, prevActual: t._actualEmployerCost ?? null,
      left: gross === 0 || (r.gross === 0 && r.cost != null) });
  }
  const unmatchedTeachers = pool.filter(t => !used.has(t.id));
  return { matched, unmatchedRows, unmatchedTeachers };
}
