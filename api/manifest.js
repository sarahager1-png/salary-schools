/*
  מניפסט ההתקנה למנהלת שנכנסה מהקישור האישי (?k=<קוד>).

  "מערכת המנהלות תוכל להיות מותקנת להם כאפליקציה" (שרה, 4.10.26).
  המניפסט הקבוע נפתח ב-"/" — מסך הכניסה של שרה ושל חשבת השכר. עד עכשיו
  הקוד נשמר במכשיר (localStorage) והאפליקציה המותקנת קראה אותו משם, אבל
  באייפון לאפליקציה שעל מסך הבית יש אחסון נפרד מספארי: היא נפתחה בלי
  הקוד, על מסך הכניסה. כאן start_url נושא את הקוד, והאפליקציה נפתחת
  ישר על בית הספר של המנהלת, בכל מכשיר.

  אין כאן גישה למסד ואין מידע: הקוד כבר נמצא בכתובת שהמנהלת פתחה,
  והוא מאומת בשרת בכל קריאה של המסך עצמו. הקוד רק מוחזר בתוך start_url,
  ורק אם הוא במבנה תקין.
*/
const BASE = {
  name: 'מערכת שכר מורים — רשת חינוך חב"ד',
  short_name: 'שכר מורים',
  description: 'דיווח חודשי, נתוני העסקה ואישורים',
  lang: 'he',
  dir: 'rtl',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#F8F7FB',
  theme_color: '#4B2E83',
  categories: ['business', 'productivity'],
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET בלבד' });
  const k = String(new URL(req.url, 'http://x').searchParams.get('k') || '');
  const ok = /^[A-Za-z0-9_-]{4,100}$/.test(k);
  // הקוד הוא מפתח הכניסה של המנהלת — התשובה אינה נשמרת בשום מטמון משותף
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  return res.status(200).send(JSON.stringify({
    ...BASE,
    start_url: ok ? `/?k=${k}` : '/',
  }));
}
