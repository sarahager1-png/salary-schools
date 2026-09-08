/*
  בדיקת תקינות של נתוני העסקה — מקור אחד למסך המנהלת ולדף ההדפסה.

  הבדיקה אינה "מלא או ריק". השדות האלה מוקלדים ביד, ולכן נכנס אליהם
  מה שלא צריך: ת.ז. שהיא בעצם שם משפחה, ת.ז. שהיא מספר טלפון, טלפון
  בלי ה-0 בהתחלה. **שדה מלא ושגוי מסוכן מריק** — הוא נראה תקין ואיש
  לא בודק אותו, והוא מגיע לתלוש.

  הפונקציות מקבלות ערך גולמי ומחזירות { ok, value, why }:
  value הוא הצורה המנוקה להצגה, why הוא ההסבר בעברית כשלא תקין.
*/
const digits = v => String(v ?? '').replace(/\D/g, '');

export function checkTz(v) {
  if (!v) return { ok: false, why: 'ת.ז. חסרה', value: '' };
  const raw = String(v).trim();
  const d = digits(raw);
  if (/[א-ת]/.test(raw)) return { ok: false, why: `ת.ז. מכילה טקסט (${raw})`, value: raw };
  if (d.length === 10 && d.startsWith('0')) return { ok: false, why: `בשדה ת.ז. הוקלד מספר טלפון (${raw})`, value: raw };
  if (d.length < 5 || d.length > 9) return { ok: false, why: `ת.ז. באורך ${d.length} ספרות (${raw})`, value: raw };
  return { ok: true, value: d };
}

export function checkPhone(v) {
  if (!v) return { ok: false, why: 'טלפון חסר', value: '' };
  const raw = String(v).trim();
  const d = digits(raw).replace(/^972/, '0');
  if (!/^0\d{9}$/.test(d)) return { ok: false, why: `טלפון לא תקין (${raw})`, value: raw };
  return { ok: true, value: d.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3') };
}

export function checkEmail(v) {
  if (!v) return { ok: false, why: 'מייל חסר', value: '' };
  const raw = String(v).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return { ok: false, why: `מייל לא תקין (${raw})`, value: raw };
  return { ok: true, value: raw };
}

/*
  כל הבעיות של שורה אחת, לפי סדר החומרה: מזהים קודם (הם שוברים הצלבה
  מול התלוש), ואחריהם השדות שמשנים שכר. "מין" נשאר בסוף ומסומן כרך —
  הוא חסר אצל עובדות שלמות ואינו שגיאה של המנהלת.
*/
export function rowIssues(t) {
  const out = [];
  const tz = checkTz(t.tzId ?? t.tz_id);
  const ph = checkPhone(t.phone);
  const em = checkEmail(t.email);
  if (!tz.ok) out.push({ field: 'tzId', label: 'ת.ז.', why: tz.why, soft: false });
  if (!ph.ok) out.push({ field: 'phone', label: 'טלפון', why: ph.why, soft: false });
  if (!em.ok) out.push({ field: 'email', label: 'מייל', why: em.why, soft: false });
  const hours = Number(t.frontalHours ?? t.frontal_hours);
  if (!hours) out.push({ field: 'frontalHours', label: 'שעות', why: 'לא נרשמו שעות פרונטליות', soft: false });
  if (!(t.gender)) out.push({ field: 'gender', label: 'מין', why: 'מין לא סומן — דרוש לחישוב תוספת אם', soft: true });
  return { issues: out, hard: out.filter(x => !x.soft).length, tz, ph, em };
}

export const cleanTz = v => digits(v).slice(0, 9);
