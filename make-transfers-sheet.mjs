/*
  "תארגן לי את קובץ האקסל בהורדות בגוגל שיטס... צבעוני ונח לשימוש"
  (שרה, 23.9).

  הדרך הישירה — יצירת הגיליון דרך Google Sheets API — חסומה: Drive API
  ו-Sheets API כבויים בפרויקט הענן, ואין לי גישה להפעיל אותם. לכן
  הקובץ נבנה כאן כ-.xlsx מעוצב במלואו, ונפתח בגוגל שיטס בגרירה אחת:
  Sheets משמר צבעים, מסגרות, רוחבי עמודות, הקפאה, פורמטים והערות.

  הנוסחאות נשמרות כנוסחאות ולא כמספרים, כדי שהגיליון יהיה כלי ולא
  צילום: שינוי הסכום החודשי המעוגל מעדכן מיד את השנתי ואת הסה"כ.

  העיצוב הולך אחרי המסך במערכת, כדי שהעין תזהה את אותן קבוצות: עלות
  בוורדרד, הכנסות בירקרק, תוצאה בסגלגל, והעמודה שהיא ממלאת בצהוב עם
  מסגרת כתומה — בגיליון אין שדה קלט שמסמן את עצמו.

  הרצה:  node make-transfers-sheet.mjs [נתיב לקובץ .xlsx]
*/
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import ExcelJS from 'file:///C:/tmp/work/pikuach-gh/node_modules/exceljs/lib/exceljs.nodejs.js';

const DOWNLOADS = 'C:/Users/משתמש/Downloads';
const OUT = path.join(DOWNLOADS, 'העברות לסניפים — מסודר.xlsx');

/* ── מקור הנתונים: הקובץ שהורד אחרון, או נתיב שנמסר ── */
function newestTransfersFile() {
  const files = fs.readdirSync(DOWNLOADS)
    .filter(f => /^העברות_לסניפים.*\.xlsx$/.test(f) && !f.startsWith('~$'))
    .map(f => ({ f, t: fs.statSync(path.join(DOWNLOADS, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error('לא נמצא קובץ "העברות_לסניפים…xlsx" בתיקיית ההורדות');
  return path.join(DOWNLOADS, files[0].f);
}

const src = process.argv[2] || newestTransfersFile();
console.log('מקור:', src);
const srcWb = XLSX.read(fs.readFileSync(src));
const aoa = XLSX.utils.sheet_to_json(srcWb.Sheets[srcWb.SheetNames[0]], { header: 1 });
if (!aoa.length) throw new Error('הקובץ ריק');

const header  = aoa[0].map(x => String(x ?? ''));
const body    = aoa.slice(1).filter(r => r.length && String(r[0] ?? '').trim());
const isTotal = r => /^סה["״]כ/.test(String(r[0] ?? ''));
const rows    = body.filter(r => !isTotal(r));
console.log(`${rows.length} סניפים, ${header.length} עמודות`);

/*
  עמודת "הערה" נשמטת: היא חוזרת על אותו משפט בכל שורה, וזה רעש בגיליון
  עבודה. מה שהיא אומרת נאמר ממילא בצבע העמודה ובהערה שעליה.
*/
const iNote = header.findIndex(h => h.trim() === 'הערה');
const keep  = header.map((_, i) => i).filter(i => i !== iNote);
const H = keep.map(i => header[i]);
const R = rows.map(r => keep.map(i => r[i]));

const col = name => H.findIndex(h => h.replace(/\s+/g, ' ').includes(name));
const iAnnual = col('עלות הוראה לשנה');
const iAdd20  = col('תוספת 20%');
const iCost   = col('סה"כ עלות');
const iMinist = col('משרד החינוך');
const iSupp   = col('מענק רשת');
const iGap    = col('פער מחושב');
const iMonth  = col('להעברה · לחודש');
const iYear   = col('להעברה · לשנה');

const A = n => { let s = '', x = n + 1; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); } return s; };

/* ── בנייה ── */
const wb = new ExcelJS.Workbook();
wb.creator = 'מערכת שכר מורים — רשת חינוך חב"ד';
const ws = wb.addWorksheet('העברות לסניפים', {
  views: [{ rightToLeft: true, state: 'frozen', xSplit: 1, ySplit: 3, zoomScale: 100 }],
  pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
});

const nCols = H.length;
const PURPLE = 'FF5B3E96';
const money = '#,##0\\ "₪"';

// שורה 1: כותרת. שורה 2: תת-כותרת. שורה 3: כותרות העמודות.
ws.mergeCells(1, 1, 1, nCols);
ws.getCell(1, 1).value = 'העברות לסניפים — רשת חינוך חב"ד';
ws.mergeCells(2, 1, 2, nCols);
ws.getCell(2, 1).value = `עלות ההוראה השנתית ועוד 20%, מול תקציב משרד החינוך ומענק הרשת · נכון ל־${new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}`;
ws.getRow(3).values = H;

const HEAD_ROW = 3, FIRST = 4;
R.forEach((r, i) => {
  const row = FIRST + i;
  const v = [...r];
  // נוסחאות במקום מספרים קפואים — הגיליון מחשב את עצמו
  if (iAdd20 > 0 && iAnnual >= 0) v[iAdd20] = { formula: `${A(iAnnual)}${row}*0.2` };
  if (iCost  > 0)                 v[iCost]  = { formula: `${A(iAnnual)}${row}+${A(iAdd20)}${row}` };
  if (iGap   > 0)                 v[iGap]   = { formula: `${A(iCost)}${row}-${A(iMinist)}${row}-${A(iSupp)}${row}` };
  if (iYear  > 0)                 v[iYear]  = { formula: `${A(iMonth)}${row}*12` };
  ws.getRow(row).values = v;
});

const TOTAL = FIRST + R.length;
const totalVals = [`סה"כ · ${R.length} סניפים`];
for (let c = 1; c < nCols; c++) totalVals[c] = { formula: `SUM(${A(c)}${FIRST}:${A(c)}${TOTAL - 1})` };
ws.getRow(TOTAL).values = totalVals;

/* ── עיצוב ── */
const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: 'FFE6E6EA' } };

// כותרת ותת-כותרת
const t1 = ws.getCell(1, 1);
t1.fill = fill(PURPLE);
t1.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
t1.alignment = { horizontal: 'center', vertical: 'middle' };
ws.getRow(1).height = 32;
const t2 = ws.getCell(2, 1);
t2.fill = fill('FFF3EFFA');
t2.font = { name: 'Calibri', size: 10, color: { argb: 'FF6B6B70' } };
t2.alignment = { horizontal: 'center', vertical: 'middle' };
ws.getRow(2).height = 22;

// כותרות העמודות
const hr = ws.getRow(HEAD_ROW);
hr.height = 42;
for (let c = 1; c <= nCols; c++) {
  const cell = hr.getCell(c);
  cell.fill = fill('FFF3EFFA');
  cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF4A3480' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = { bottom: { style: 'medium', color: { argb: 'FFC9BCE6' } } };
}

// צבע לפי קבוצת העמודות — אותה חלוקה כמו במסך
const groupFill = i => {
  if (i === 0) return null;
  if (i === iMinist || i === iSupp) return 'FFEFF9F1';   // הכנסות — ירקרק
  if (i === iMonth) return 'FFFFF9E0';                    // למילוי — צהבהב
  if (i >= iGap && iGap > 0) return 'FFF6F3FB';           // תוצאה — סגלגל
  return 'FFFEF2F2';                                      // עלות — ורדרד
};

for (let i = 0; i < R.length; i++) {
  const row = ws.getRow(FIRST + i);
  row.height = 22;
  for (let c = 1; c <= nCols; c++) {
    const cell = row.getCell(c);
    const g = groupFill(c - 1);
    if (g) cell.fill = fill(g);
    cell.border = { top: thin, bottom: thin, left: thin, right: thin };
    if (c === 1) {
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      cell.numFmt = money;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      const strong = (c - 1) === iCost || (c - 1) === iMonth || (c - 1) === iYear;
      cell.font = { name: 'Calibri', size: 11, bold: strong };
    }
  }
}

// שורת הסה"כ
const tr = ws.getRow(TOTAL);
tr.height = 26;
for (let c = 1; c <= nCols; c++) {
  const cell = tr.getCell(c);
  cell.fill = fill('FFEAE6F7');
  cell.font = { name: 'Calibri', size: 11, bold: true };
  cell.alignment = { horizontal: c === 1 ? 'right' : 'center', vertical: 'middle' };
  if (c > 1) cell.numFmt = money;
  cell.border = { top: { style: 'medium', color: { argb: 'FFC9BCE6' } }, bottom: thin, left: thin, right: thin };
}

/*
  העמודה שהיא ממלאת — מסגרת כתומה מסביב לכל הטור, והערה בכותרת.
  בלי סימון כזה, מי שפותח את הגיליון אינו יודע מה מותר לו לשנות.
*/
if (iMonth > 0) {
  const c = iMonth + 1;
  const orange = { style: 'medium', color: { argb: 'FFE59D1B' } };
  for (let row = HEAD_ROW; row <= TOTAL; row++) {
    const cell = ws.getCell(row, c);
    const b = { ...(cell.border || {}) };
    b.left = orange; b.right = orange;
    if (row === HEAD_ROW) b.top = orange;
    if (row === TOTAL)    b.bottom = orange;
    cell.border = b;
  }
  ws.getCell(HEAD_ROW, c).note = 'העמודה למילוי: הסכום החודשי המעוגל שסוכם עם הסניף.\nשינוי כאן מעדכן מיד את "להעברה · לשנה" ואת שורת הסה"כ.';
}

// רוחב עמודות
ws.getColumn(1).width = 26;
for (let c = 2; c <= nCols; c++) ws.getColumn(c).width = 16;

// מסנן על שורת הכותרות — מיון לפי כל עמודה בלחיצה
ws.autoFilter = { from: { row: HEAD_ROW, column: 1 }, to: { row: TOTAL - 1, column: nCols } };

// הפער המחושב: אדום כשיש מה להעביר, ירוק כשיש עודף
if (iGap > 0) {
  const ref = `${A(iGap)}${FIRST}:${A(iGap)}${TOTAL}`;
  ws.addConditionalFormatting({
    ref,
    rules: [
      { type: 'cellIs', operator: 'greaterThan', formulae: ['0'], priority: 1,
        style: { font: { color: { argb: 'FFB3261E' }, bold: true } } },
      { type: 'cellIs', operator: 'lessThanOrEqual', formulae: ['0'], priority: 2,
        style: { font: { color: { argb: 'FF2E7D32' }, bold: true } } },
    ],
  });
}

/* ── גיליון שני: המקרא, כדי שהצבעים יסבירו את עצמם ── */
const gs = wb.addWorksheet('מקרא', { views: [{ rightToLeft: true }] });
gs.getColumn(1).width = 4;
gs.getColumn(2).width = 28;
gs.getColumn(3).width = 78;
gs.mergeCells(1, 1, 1, 3);
gs.getCell(1, 1).value = 'מקרא — איך לקרוא את הטבלה';
gs.getCell(1, 1).fill = fill(PURPLE);
gs.getCell(1, 1).font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
gs.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
gs.getRow(1).height = 30;

const legend = [
  ['FFFEF2F2', 'עלות', 'עלות ההוראה השנתית בפועל של כל עובדי ההוראה — מורות, מנהלת, ייעוץ ושילוב — ועוד תוספת 20% למילוי מקום וכרית ביטחון.'],
  ['FFEFF9F1', 'הכנסות', 'תקציב משרד החינוך (כולל המענק לתלמיד) ומענק הרשת. הכנסות נוספות והוצאות שאינן שכר אינן נכנסות לטבלה הזאת.'],
  ['FFF6F3FB', 'תוצאה', 'הפער המחושב: סה"כ העלות פחות תקציב משרד החינוך ופחות מענק הרשת. אדום = על הסניף להעביר. ירוק = עודף, אין מה להעביר.'],
  ['FFFFF9E0', 'למילוי', 'הסכום החודשי המעוגל שסוכם עם הסניף. זו העמודה היחידה שממלאים — השנתי שלצדה וכל שורת הסה"כ מתעדכנים ממנה לבד.'],
];
legend.forEach(([argb, name, text], i) => {
  const row = 3 + i * 2;
  gs.getCell(row, 1).fill = fill(argb);
  gs.getCell(row, 1).border = { top: thin, bottom: thin, left: thin, right: thin };
  gs.getCell(row, 2).value = name;
  gs.getCell(row, 2).font = { size: 12, bold: true };
  gs.getCell(row, 2).alignment = { horizontal: 'right', vertical: 'middle' };
  gs.getCell(row, 3).value = text;
  gs.getCell(row, 3).font = { size: 10.5, color: { argb: 'FF44444A' } };
  gs.getCell(row, 3).alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
  gs.getRow(row).height = 34;
});

const noteRow = 3 + legend.length * 2 + 1;
gs.mergeCells(noteRow, 2, noteRow, 3);
gs.getCell(noteRow, 2).value =
  'הטבלה מחשבת את עצמה: התוספת, הסה"כ, הפער והסכום השנתי הם נוסחאות. ' +
  'בגיליון מופיעים רק סניפים שהרשת משלמת בהם שכר ושהוזנו בהם עובדות.';
gs.getCell(noteRow, 2).font = { size: 10.5, italic: true, color: { argb: 'FF6B6B70' } };
gs.getCell(noteRow, 2).alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
gs.getRow(noteRow).height = 34;

await wb.xlsx.writeFile(OUT);
console.log('\nנוצר:', OUT);
console.log(`${R.length} סניפים · ${nCols} עמודות · שורת סה"כ בשורה ${TOTAL}`);
