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
