/*
  תרגום מורה לבקשה למחשבון הרשמי של משרד החינוך.

  המחשבון אינו מחשב בדפדפן — הוא שולח לשרת. שלושת המחשבונים שאנחנו
  משתמשים בהם הם שלושה טפסים שונים לחלוטין, לא רק שלוש כתובות, וכל
  אחד מהם מקבל את הדרגה בקידוד משלו.

  כל מיפוי כאן נסרק מהאתר עצמו. מה שלא נסרק אינו מנוחש: מורה שאי
  אפשר לתרגם בוודאות חוזרת להזנה ידנית, כי מספר שכר מנוחש גרוע
  לאין ערוך ממספר שחסר.
*/

// ── אופק חדש ─────────────────────────────────────────────────
// DERUG_OFEK הוא התואר. DARGA1 הוא אינדקס לרשימה בחצאי דרגות:
// 1→"1", 2→"1.5", 3→"2" … כלומר דרגה שלמה g היא הערך g*2-1.
const OFEK_DERUG = { intern: '100', BA: '101', MA: '102', senior: '104', unlicensed: '106' };
const ofekDarga  = g => String(Math.max(1, Math.min(17, Math.round(Number(g) || 1) * 2 - 1)));

/*
  ── עולם ישן ─────────────────────────────────────────────────
  רשימת הדרגות כאן היא בת 19 ערכים, ולא תשעה כפי שנראה בסריקה
  חלקית: מתמחים ובלתי מוסמכים נמצאים בסופה. שלא כמו באופק, שבו
  "בלתי מוסמכים" הוא ערך אחד, בעולם הישן הוא מפוצל לארבעה שלבים
  שאינם משתלמים אותו דבר — ולכן אי אפשר לבחור אחד מהם באקראי.
*/
const OLD_DARGA = { MA: '2', BA: '3', senior: '7', intern: '18' };
const OLD_UNLICENSED = { aa: '10', 'a+': '11', a: '12', b: '13' };
const OLD_UNLICENSED_DEFAULT = OLD_UNLICENSED.a;   // שלב א — כל הבלתי מוסמכות ברשת

// ── אופק ניהול ───────────────────────────────────────────────
const NIHUL_DERUG = { BA: '110', MA: '110', senior: '111', unlicensed: '113' };

const clampScope = v => String(Math.max(1, Math.min(200, Math.round(Number(v) || 100))));
// חודש השכר בפורמט של האתר: YYYYMM
export const dateSachar = monthKey => {
  const [y, m] = String(monthKey || '').split('-');
  return Number(y) && Number(m) ? Number(y) * 100 + Number(m) : null;
};

/*
  שלוש הבקשות. כל אחת מחזירה { endpoint, body } או { skip } עם הסיבה
  בעברית — הסיבה מוצגת לחשבת השכר כדי שתדע למה השורה נשארה לה.
*/
export function ofekRequest(t, monthKey) {
  // חטיבה עליונה היא עוז לתמורה — מחשבון אחר, שלא אותר לו endpoint.
  if (t.level === 'high') return { skip: 'חטיבה עליונה — עוז לתמורה. המחשבון הזה אינו ממופה עדיין; הזנה ידנית.' };
  const derug = OFEK_DERUG[t.degree];
  if (!derug) return { skip: `אין במחשבון אופק תואר "${t.degree}"` };
  return {
    endpoint: 'ofek',
    body: {
      DATE_SACHAR: dateSachar(monthKey),
      DERUG_OFEK: derug,
      DARGA1: ofekDarga(t.grade),
      VETEK: String(Math.max(1, Number(t.seniority) || 1)),
      VETEK_ZHL: 0,
      MEKADEM_MISRA_REFORMA: clampScope(t.scopePct ?? t.scope),
      VETEK_YEUTZ: 0, VETEK_NIHUL: 0,
      IS_SHAOT_YEUTZ: 0, MIS_SHAOT_YEUTZ: 0, MIS_SHAOT_YEUTZ_FRONT: 0, MIS_SHAOT_SHVUIYOT: 0,
      KOD_TAFKID_2: 0, KOD_TAFKID_3: 0,
      MEKADEM_HM_NAMUCH: 0, MEKADEM_HM_GAVOHA: 0, MEKADEM_HM_SHILUV: 0,
      KURS_HM: 0, RETZIFUT_MATYA: 0,
      AHUZ_AUTISTIC_PARA: 0, AHUZ_AUTISTIC_HM: 0, AHUZ_BAGRUT: 0,
      OFEK_TAFKID: 0, MEKADEM_HADRACHA: 0, RAKAZ_1: 0, RAKAZ_2: 0,
      GMUL_NIHUL_NIGRAR: 0, GMUL_YIUTZ_NIGRAR: 0, GMUL_MISRA_MECHUNANIM: 0,
      AHUZ_GANENET_AMITA: 0, MIS_HONCHIM: 0,
    },
  };
}

export function oldRequest(t, monthKey) {
  // בלתי מוסמך מפוצל בעולם הישן לארבעה שלבים בשכר שונה. ברשת כולן
  // בשלב א, ולכן זו ברירת המחדל; unlicensedStage גובר עליה אם ייקבע
  // אחרת למורה מסוימת.
  const darga = t.degree === 'unlicensed'
    ? (OLD_UNLICENSED[t.unlicensedStage] || OLD_UNLICENSED_DEFAULT)
    : OLD_DARGA[t.degree];
  if (!darga) return { skip: `אין במחשבון העולם הישן תואר "${DEGREE_HE[t.degree] || t.degree}"` };
  return {
    endpoint: 'old',
    body: {
      DATE_SACHAR: dateSachar(monthKey),
      DARGA: darga,
      VETEK: String(Math.max(1, Number(t.seniority) || 1)),
      VETEK_ZHL: 0, YEHIDOT_HISH: 0,
      MEKADEM_MISRA: clampScope(t.scopePct ?? t.scope),
      MEKADEM_MISRA_OZ: 100,
      KEFEL_TOAR: 0, VETEK_YEUTZ: 0, VETEK_NIHUL: 0, VETEK_HADRACHA: 0,
      KOD_TAFKID_1: 0, AHUZ_NIHUL: 0,
      MIS_KITOT_YESODI: 0, MIS_KITOT_YESODI_HM: 0, MIS_KITOT_AL_YESOAI: 0, MIS_KITOT_AL_YES_HM: 0,
      MIS_SHAOT_YEUTZ: 0, AHUZ_YEUTZ: 0, KITAT_CHINUCH: 0,
      MEKADEM_HM_NAMUCH: 0, MEKADEM_HM_GAVOHA: 0, MEKADEM_MATYA: 0, KURS_HM: 0,
      AHUZ_PITUL: 0, AHUZ_BAGRUT: 0, MEKADEM_SEMINAR: 0, DARGAT_KIDUM: 0,
      AHUZ_HADRACHA_SEMINAR: 0, AHUZ_RIKUZ_SEMINAR: 0, DARGAT_MARTZE: 0,
      MEKADEM_HADRACHA: 0, AHUZ_RIKUZ: 0,
      HEV: 700, OZ_TMURA: 0, MIS_KITOT_SMINAR: 0, MEKADEM_HM_MATYA: 0,
      KOD_TAFKID_3: 0, MIS_KITOT: 0, SUG_MOSAD: 0, AHUZ_BITACHON: 0, IHUD_MAS: 0, MEKADEM_HM: 0,
    },
  };
}

// מנהלת. רמת מורכבות 1 בכל בתי הספר של הרשת.
// דרגת הניהול היא א..ד ואינה זהה לדרגת האופק של מורה, ולכן היא נלקחת
// מ-nihulGrade אם נשמרה, וברירת המחדל היא א.
export function nihulRequest(t, monthKey) {
  const derug = NIHUL_DERUG[t.degree];
  if (!derug) return { skip: `אין במחשבון הניהול תואר "${DEGREE_HE[t.degree] || t.degree}"` };
  return {
    endpoint: 'mgmt',
    body: {
      DATE_SACHAR: dateSachar(monthKey),
      TAFKID_NIHUL1: '1',
      DERUG: derug,
      DARGA_OFEK: String(Math.max(1, Math.min(7, Number(t.nihulGrade) || 1))),
      ACHUZ_TOS_ISHIT: '',
      RAMAT_MURKAVUT: '1',
      MEKADEM_MISRA1: clampScope(t.scopePct ?? t.scope),
      MEKADEM_MATYA: '',
    },
  };
}

const DEGREE_HE = { intern:'מתמחה', unlicensed:'לא מוסמך', senior:'בכיר', BA:'תואר ראשון', MA:'תואר שני' };

/*
  התשובה היא רשימת רכיבי שכר. "ברוטו כללי" (סמל 9999) הוא הסכום, אבל
  מה שנכנס אצלנו לשדה הוא השכר המשולב — הרכיב הראשון — כי זה מה
  שהחשבת מקלידה היום. שניהם מוחזרים.
*/
export function readResult(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const num = x => Math.round(Number(x?.Scum) || 0);
  const bruto   = rows.find(r => r.Semel === 9999 || /ברוטו כללי/.test(r.Teur || ''));
  const meshulv = rows.find(r => /משולב/.test(r.Teur || ''));
  if (!meshulv && !bruto) return null;
  return {
    meshulav: num(meshulv || bruto),
    bruto: num(bruto || meshulv),
    components: rows.map(r => ({ label: r.Teur, amount: num(r) })),
  };
}
