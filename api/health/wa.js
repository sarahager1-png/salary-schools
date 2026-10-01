/*
  נקודת בריאות לקו הוואטסאפ — לבדיקת הבוקר (wa-health.mjs --endpoints).

  פרטי הקו שמורים ב-Vercel ואי אפשר לקרוא אותם מבחוץ, ולכן הבדיקה נעשית
  מתוך המערכת: קריאה אחת ל-getStateInstance (קריאה בלבד, לא שולחת דבר
  ולא נוגעת בתור). הנקודה ציבורית בכוונה (בלי guard של CRON_SECRET), ולכן
  היא מחזירה רק מצב — בלי מזהה קו, בלי טוקן ובלי כתובת.

  תמיד 200: "לא מוגדר" ו"לא נגיש" הם תשובות, לא שגיאות.
    configured:false        — אין משתני GREEN_API_* בסביבה
    state:"authorized"      — הקו מחובר
    state:"notAuthorized"   — המכשיר נותק (צריך לסרוק QR מחדש)
    state:"unreachable"     — Green API לא ענה בתוך 8 שניות / שגיאת רשת
    state:"http_<קוד>"      — Green API ענה בשגיאה (401 = טוקן לא תקין)
*/
import { credentials } from '../_lib/whatsapp.js';

const SYSTEM = 'salary-schools';
const TIMEOUT_MS = 8000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const checkedAt = new Date().toISOString();
  const c = credentials();
  if (!c) {
    return res.status(200).json({ system: SYSTEM, configured: false, state: null, checkedAt });
  }

  let state;
  try {
    const r = await fetch(`${c.base}/waInstance${c.id}/getStateInstance/${c.token}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r.ok) {
      const data = await r.json().catch(() => null);
      state = data?.stateInstance ?? 'unknown';
    } else {
      state = `http_${r.status}`;
    }
  } catch {
    state = 'unreachable';
  }

  return res.status(200).json({ system: SYSTEM, configured: true, state, checkedAt });
}
