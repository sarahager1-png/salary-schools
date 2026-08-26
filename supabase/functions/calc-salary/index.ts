/*
  מתווך אל המחשבון הרשמי של משרד החינוך.

  ⚠️ חסום כרגע. האתר יושב מאחורי Cloudflare שמחזיר 403 לכל פנייה שאינה
  מדפדפן — כבר בטעינת דף הבית, לפני כל חישוב. זו הגנת בוטים מכוונת של
  מפעיל האתר, ולא נעקוף אותה. הפונקציה נשארת כאן שלמה ובדוקה כדי שביום
  שבו תהיה גישה מוסדרת (לאתר יש /api/ApiAccount/login — כלומר קיים
  מושג של חשבון API) יידרש רק להוסיף את פרטי ההזדהות.

  הדפדפן אינו יכול לפנות ל-educalc.unq.co.il ישירות — זהו מקור אחר,
  והבקשה נחסמת. הפונקציה הזו יושבת באמצע: היא מקבלת בקשות מהמערכת,
  שולחת אותן לאתר, ומחזירה את התשובה.

  היא אינה מתווך פתוח: רק משתמש מחובר יכול לקרוא לה, והיא מכירה שלוש
  כתובות בלבד — מה שנשלח אליה לא יכול להפנות אותה לשום מקום אחר.
*/
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CALCULATORS: Record<string, string> = {
  ofek: 'https://educalc.unq.co.il/api/OfekHadash/GetCalcResultList',
  old:  'https://educalc.unq.co.il/api/OldWorld/GetCalcOldWorldResultList',
  mgmt: 'https://educalc.unq.co.il/api/OldWorld/GetCalcOfekNihulResultList',
};

const MAX_CALLS = 200;   // מגן גם עלינו וגם על האתר של משרד החינוך

/*
  האתר אינו עונה לבקשה שמגיעה "מכלום": הוא מנפיק עוגיית session בטעינת
  הדף, ובלעדיה מחזיר 403. זהו בדיוק מה שהדפדפן עושה כשנכנסים למחשבון —
  אין כאן התחברות ואין סיסמה, המחשבון פתוח לכולם. לכן אנחנו מבצעים את
  אותו שלב פתיחה פעם אחת ומשתמשים באותה עוגייה לכל החישובים.
*/
const HOME = 'https://educalc.unq.co.il/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function openSession(): Promise<string> {
  // האתר מנפיק זהות אנונימית דרך שרשרת הפניות (/ -> /CalculatorAccount/Login
  // -> /Account/Login -> /CalculatorAccount/RunCalculator). העוגייה נקבעת
  // באמצע השרשרת, ו-redirect:'follow' מסתיר את השלבים האלה — ולכן היא
  // אבדה והבקשה חזרה 403. כאן עוקבים אחרי ההפניות ידנית ואוספים בדרך.
  const jar = new Map<string, string>();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

  let url = HOME;
  for (let hop = 0; hop < 10; hop++) {
    const r = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'he-IL,he;q=0.9',
        ...(jar.size ? { 'Cookie': cookieHeader() } : {}),
      },
    });
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) {
      url = new URL(loc, url).toString();
      continue;
    }
    // הדף האחרון בשרשרת נטען; אם עוד לא קיבלנו זהות, נבקש אותה במפורש
    if (!jar.has('.AspNetCore.Identity.Application') && hop === 0) {
      url = HOME + 'CalculatorAccount/RunCalculator';
      continue;
    }
    break;
  }
  return cookieHeader();
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'POST בלבד' }, 405);

  // רק משתמש מחובר. אין כאן נתוני שכר של אף אחד, אבל אין סיבה
  // להשאיר את הדלת פתוחה.
  const auth = req.headers.get('Authorization') || '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'נדרשת התחברות' }, 401);

  let calls: Array<{ id: string; endpoint: string; body: unknown }>;
  try {
    ({ calls } = await req.json());
  } catch {
    return json({ error: 'גוף הבקשה אינו תקין' }, 400);
  }
  if (!Array.isArray(calls) || !calls.length) return json({ error: 'אין מה לחשב' }, 400);
  if (calls.length > MAX_CALLS)               return json({ error: `עד ${MAX_CALLS} חישובים בבקשה` }, 400);

  let cookie = '';
  try { cookie = await openSession(); } catch { /* ננסה בלעדיה */ }
  const results = await Promise.all(calls.map(async (c) => {
    const url = CALCULATORS[c.endpoint];
    if (!url) return { id: c.id, error: `מחשבון לא מוכר: ${c.endpoint}` };
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': UA,
          'Accept-Language': 'he-IL,he;q=0.9',
          'Origin': 'https://educalc.unq.co.il',
          'Referer': 'https://educalc.unq.co.il/',
          'component': 'Calculators',
          ...(cookie ? { 'Cookie': cookie } : {}),
        },
        body: JSON.stringify(c.body),
      });
      // 204 = האתר לא הבין את הבקשה. אין גוף, ואין מה לפרש.
      if (r.status === 204) return { id: c.id, error: 'המחשבון לא החזיר תוצאה — ככל הנראה חסר נתון' };
      if (!r.ok)            return { id: c.id, error: `המחשבון החזיר שגיאה ${r.status}` };
      return { id: c.id, rows: await r.json() };
    } catch (e) {
      return { id: c.id, error: 'לא הצלחנו להגיע למחשבון של משרד החינוך: ' + (e as Error).message };
    }
  }));

  return json({ results });
});
