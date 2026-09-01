/*
  חיבור למסד מצד השרת.

  ה-cron רצות בלי משתמש מחובר, ולכן הן משתמשות במפתח השרת ואינן עוברות
  RLS. זה בסדר כאן ורק כאן: הן פועלות על כל הרשת מטבען, והכניסה אליהן
  חסומה ב-CRON_SECRET.
*/
import { createClient } from '@supabase/supabase-js';

export function db() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('חסרים פרטי החיבור למסד בסביבת השרת');
  return createClient(url, key, { auth: { persistSession: false } });
}

/*
  שער ה-cron. Vercel שולח את הסוד בכותרת Authorization; קריאה ידנית
  יכולה לשלוח אותו גם כפרמטר, כדי שאפשר יהיה להריץ מהדפדפן בבדיקה.
*/
export function guard(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return 'CRON_SECRET אינו מוגדר בשרת';
  const auth = req.headers?.authorization || '';
  const url = new URL(req.url, 'http://x');
  const given = auth.replace(/^Bearer\s+/i, '') || url.searchParams.get('secret') || '';
  return given === secret ? null : 'אין הרשאה';
}

/** חודש השכר הנוכחי, YYYY-MM לפי שעון ישראל */
export function monthKeyNow(offsetMonths = 0) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  now.setMonth(now.getMonth() + offsetMonths);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** החודש שעליו פועלים: מהכתובת אם נמסר (בדיקות והרצה ידנית), אחרת הנוכחי */
export function monthOf(req) {
  const q = new URL(req.url, 'http://x').searchParams.get('month');
  return /^\d{4}-\d{2}$/.test(q || '') ? q : monthKeyNow();
}

/*
  מתי המחזור מתחיל לפעול.

  ספטמבר 2026 אינו חודש רגיל במערכת: בו משולם שכר אוגוסט, והמעבר
  למחזור המתוזמן נקבע לאוקטובר (הוראת שרה, 1.9). בלי השער הזה
  התזכורות היו יוצאות למנהלות בעוד יומיים, על חודש שלא נועד להן.

  CYCLE_START_MONTH ריק = הכול פעיל. זו ברירת המחדל אחרי שהמעבר יושלם.
*/
export function cycleStarted() {
  const from = String(process.env.CYCLE_START_MONTH || '').trim();
  if (!/^\d{4}-\d{2}$/.test(from)) return true;
  return monthKeyNow() >= from;
}

/*
  החודש שמדווחים עליו עכשיו — חודש העבודה שהסתיים.

  בספטמבר משולם שכר אוגוסט (שרה, 1.9): חודש עבודה נסגר, ובחודש שאחריו
  מדווחים עליו, מאשרים ומשלמים. לכן התזכורת ב-3, הסגירה ב-5 והמעבר
  לשכר ב-6 — כולן עוסקות בחודש הקודם, לא בזה שעל הלוח.
*/
export function workMonth(req) {
  const q = new URL(req.url, 'http://x').searchParams.get('month');
  return /^\d{4}-\d{2}$/.test(q || '') ? q : monthKeyNow(-1);
}

/** ה-5 וה-6 של החודש שאחרי חודש העבודה */
export function dueDatesFor(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));            // החודש הבא
  const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return { report: `${k}-05`, submit: `${k}-06` };
}
