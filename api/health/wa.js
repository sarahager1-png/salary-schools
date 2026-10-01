/*
  נקודת בריאות לקו הוואטסאפ — לבדיקת הבוקר (wa-health.mjs --endpoints).

  פרטי הקו שמורים ב-Vercel ואי אפשר לקרוא אותם מבחוץ, ולכן הבדיקה נעשית
  מתוך המערכת: קריאה אחת ל-getStateInstance (קריאה בלבד, לא שולחת דבר
  ולא נוגעת בתור). הנקודה ציבורית בכוונה (בלי guard של CRON_SECRET), ולכן:
    • GET בלבד; כל מתודה אחרת נענית ב-405 עוד לפני שנקראים פרטי הקו.
    • התשובה היא רק { configured, state } — בלי מזהה קו, טוקן, כתובת,
      שם מערכת או שעה.
    • state הוא ערך מרשימה סגורה; כל דבר אחר ש-Green API מחזיר הופך ל-"unknown".
    • פנייה אנונימית לא מפעילה קריאה ל-Green API בכל בקשה: התשובה (גם תשובת
      כשל) נשמרת 60 שניות בזיכרון הפונקציה וב-CDN, ובקשות שמגיעות יחד חולקות
      קריאה אחת. Green API מתיר ל-getStateInstance בקשה אחת בשנייה לכל קו.

  תמיד 200 ל-GET: "לא מוגדר" ו"לא נגיש" הם תשובות, לא שגיאות.
    configured:false        — אין משתני GREEN_API_* בסביבה
    state:"authorized"      — הקו מחובר
    state:"notAuthorized"   — המכשיר נותק (צריך לסרוק QR מחדש)
    state:"starting" / "sleepMode" / "blocked" / "yellowCard" — כפי ש-Green API מדווח
    state:"unknown"         — Green API ענה 200 עם ערך שאינו ברשימה
    state:"unreachable"     — Green API לא ענה בתוך 8 שניות / שגיאת רשת / הפניה
    state:"http_<קוד>"      — Green API ענה בשגיאה (401 = טוקן לא תקין, 429 = מגבלת קצב)
*/
import { credentials } from '../_lib/whatsapp.js';

const TIMEOUT_MS = 8000;
const CACHE_MS = 60_000;
const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=30';
const KNOWN_STATES = new Set(['authorized', 'notAuthorized', 'starting', 'sleepMode', 'blocked', 'yellowCard']);

/* רק ערך מהרשימה הסגורה יוצא החוצה; כל דבר אחר (כולל טקסט חופשי מהספק) → "unknown" */
function knownState(value) {
  return typeof value === 'string' && KNOWN_STATES.has(value) ? value : 'unknown';
}

/*
  אותם פרטים שנתיב השליחה משתמש בהם (credentials), אחרי ניקוי: credentials()
  לא מסיר רווחים או ירידת שורה שנדבקו לערך ב-Vercel. הניקוי נעשה כאן בלבד,
  כדי לא לשנות את נתיב השליחה.
*/
function lineCredentials() {
  const c = credentials();
  if (!c) return null;
  const id = String(c.id).trim();
  const token = String(c.token).trim();
  const base = String(c.base).trim().replace(/\/+$/, '') || 'https://api.green-api.com';
  return id && token ? { id, token, base } : null;
}

async function checkLine() {
  try {
    const c = lineCredentials();
    if (!c) return { configured: false, state: null };
    const r = await fetch(`${c.base}/waInstance${c.id}/getStateInstance/${c.token}`, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return { configured: true, state: `http_${r.status}` };
    const data = await r.json().catch(() => null);
    const reported = typeof data === 'object' && data !== null ? data.stateInstance : undefined;
    return { configured: true, state: knownState(reported) };
  } catch {
    // בכוונה בלי יומן: הודעת השגיאה והכתובת כוללות את הטוקן של הקו
    return { configured: true, state: 'unreachable' };
  }
}

/*
  מטמון ברמת המודול: תשובה אחת ל-60 שניות לכל מופע של הפונקציה, ובקשות
  שמגיעות בזמן שהבדיקה בדרך מחכות לאותה הבטחה במקום לפתוח קריאה נוספת.
*/
let cached = null;
let inFlight = null;

function getHealth() {
  if (cached && Date.now() < cached.expires) return Promise.resolve(cached.value);
  if (!inFlight) {
    inFlight = checkLine()
      .then((value) => {
        cached = { value, expires: Date.now() + CACHE_MS };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const health = await getHealth();
  res.setHeader('Cache-Control', CACHE_CONTROL);
  return res.status(200).json(health);
}
