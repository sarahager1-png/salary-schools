/*
  גשר למבט-רשת — הכנסות וייעול לכל בית ספר, לדף עלות ההוראה.

  "מערכות תקציב מבט רשת נותנות הכנסות שכר" (שרה, 2.9). הפונקציה
  network-budget של מבט-רשת כבר מסכמת לכל בית ספר את ההכנסות ואת
  הייעול שנבחר; כאן רק מגשרים אליה. קוד הגישה שלה נשאר בצד השרת —
  בדפדפן הוא היה גלוי לכל מי שפותחת את הקבצים.

  מי רשאי: coordinator בלבד, מאומת מול טוקן ההתחברות האמיתי —
  אותה הרשאה שמסתירה את דף עלות ההוראה עצמו.

  הייעול נספר רק כשבמבט-רשת נבחר בפועל (saved) — ייעול מוצע שאיש לא
  אישר אינו חיסכון, וזו בדיוק המלכודת של "טרם נבחר ייעול".
*/
import { createClient } from '@supabase/supabase-js';
import { db } from './_lib/db.js';

const HUB_URL = 'https://ogkwvrerolofujhydhsl.supabase.co/functions/v1/network-budget';

export default async function handler(req, res) {
  try {
    const token = (req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'חסר טוקן התחברות' });

    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const anon = createClient(url, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: userData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !userData?.user) return res.status(401).json({ error: 'ההתחברות אינה תקפה' });

    const { data: prof } = await db().from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (prof?.role !== 'coordinator') return res.status(403).json({ error: 'הדף הזה של שרה בלבד' });

    const code = process.env.HUB_ACCESS_CODE;
    if (!code) return res.status(500).json({ error: 'HUB_ACCESS_CODE אינו מוגדר בשרת' });

    const r = await fetch(HUB_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!r.ok) return res.status(502).json({ error: `מבט-רשת החזיר ${r.status}` });
    const data = await r.json();

    const mapped = (data.schools || []).filter(s => !s.empty && !s.error).map(s => {
      const inc = s.income || {};
      // "מענק לתלמיד זה הכנסות עלות הוראה" (שרה, 3.9): משרד + מענק,
      // ובפירוט — "הכנסות משרד החינוך 2 שורות".
      const ministry = (inc.ministry || 0) + (inc.grant || 0);
      const teachingBudget = (s.expenses?.teaching || 0) + (s.principalMonthly || 0) * 12;
      const counseling = s.expenses?.counselingCost || 0;
      return {
        name: s.name,
        ministry,
        // עלות ההוראה שחישבה שרה בתקציב, בפירוט שביקשה (3.9):
        // הכנסות 2 שורות; הוצאות — שעות הוראה, ייעוץ.
        teach: {
          income: [
            { name: 'תקציב משרד החינוך', amount: inc.ministry || 0 },
            { name: 'מענק לתלמיד', amount: inc.grant || 0 },
          ].filter(x => x.amount > 0),
          expenses: [
            { name: 'שעות הוראה (כולל מנהלת)', amount: teachingBudget },
            { name: 'ייעוץ', amount: counseling },
          ].filter(x => x.amount > 0),
        },
        incomeTotal: inc.total || 0,
        // "לאשקלון אין ייעול" (שרה, 2.9): אפס אינו ייעול — רק סכום
        // חיובי שנבחר בפועל נחשב; אחרת התא נשאר ריק.
        yieul: s.efficiency?.saved === true && (s.efficiency?.total || 0) > 0 ? s.efficiency.total : null,
        /*
          לטבלת הכנסות/הוצאות (שרה, 3.9): "משרד החינוך זה הכנסות עלות
          הוראה" — ולכן כאן ההכנסות בלי המשרד (מענק, שכ"ל/תל"ן, מקורות
          נוספים). "הוצאות עלות הוראה זה שכר מורים מנהלת ויועצת" —
          ולכן ההוצאות בלי הוראה ובלי ייעוץ.
        */
        incomeOther: Math.max(0, (inc.total || 0) - ministry),
        // הפירוט לשורות ("יהיו מפורטים"): הכנסות בלי משרד ומענק, הוצאות בלי שכר הוראה
        detail: {
          income: [
            { name: 'שכר לימוד ותל"ן (גבייה 80%)', amount: (inc.perStudent || 0) + (inc.talan || 0) },
            ...(inc.sources || []).map(x => ({ name: x.name, amount: Number(x.amount || 0) })),
          ].filter(x => x.amount > 0),
          expenses: [
            { name: 'חוגים', amount: s.expenses?.clubsExpense || 0 },
            { name: 'הוצאות פר תלמיד', amount: s.expenses?.studentExp || 0 },
            { name: 'התמקצעות', amount: s.expenses?.profDev || 0 },
            ...Object.entries(s.expenses?.byCategory || {}).map(([name, amount]) => ({ name, amount: Number(amount || 0) })),
          ].filter(x => x.amount > 0),
        },
        expensesOther: Math.max(0, (s.expenses?.total || 0) - (s.expenses?.teaching || 0) - (s.expenses?.counselingCost || 0)),
        // הסימולציה של שרה במערכת התקציב: עלות ההוראה המתוכננת, שנתית.
        // "עלות הוראה חייב לכלול מנהלת" (שרה, 3.9) — שכר המנהלת מהתקציב
        // מצורף, כך שההשוואה מול הבפועל (שגם הוא כולל מנהלת) היא אחד-לאחד.
        // "הוצאות שעות הוראה, ייעוץ" (שרה, 3.9) — הסימולציה שלה מהתקציב
        // היא סכום שתי השורות, כדי שהסה"כ יתאים לפירוט.
        teachingSim: s.expenses?.teaching > 0 ? teachingBudget + counseling : null,
      };
    });
    /*
      "תאחד את רעננה" (שרה, 2.9): במבט-רשת בית חינוך רעננה מפוצל
      ל"בנים" ו"בנות", ובמערכת השכר הוא אחד. כל פיצול מגדרי כזה מסוכם
      לשם הבסיס — תקציב מחובר, ייעול מחובר (null רק כשאף צד לא בחר).
    */
    const byBase = new Map();
    for (const s of mapped) {
      const base = s.name.replace(/\s*-\s*(בנים|בנות)\s*$/, '');
      const cur = byBase.get(base);
      if (!cur) { byBase.set(base, { ...s, name: base }); continue; }
      cur.ministry += s.ministry;
      cur.incomeTotal += s.incomeTotal;
      cur.teachingSim = (cur.teachingSim == null && s.teachingSim == null) ? null : (cur.teachingSim || 0) + (s.teachingSim || 0);
      cur.expensesOther = (cur.expensesOther || 0) + (s.expensesOther || 0);
      cur.incomeOther = (cur.incomeOther || 0) + (s.incomeOther || 0);
      if (s.detail) cur.detail = {
        income: [...(cur.detail?.income || []), ...s.detail.income],
        expenses: [...(cur.detail?.expenses || []), ...s.detail.expenses],
      };
      // פיצול בנים/בנות: שורות עלות ההוראה מאוחדות לפי שם השורה
      if (s.teach) {
        const mergeLines = (a = [], b = []) => {
          const m = new Map(a.map(x => [x.name, { ...x }]));
          for (const x of b) m.set(x.name, { name: x.name, amount: (m.get(x.name)?.amount || 0) + x.amount });
          return [...m.values()].filter(x => x.amount > 0);
        };
        cur.teach = {
          income: mergeLines(cur.teach?.income, s.teach.income),
          expenses: mergeLines(cur.teach?.expenses, s.teach.expenses),
        };
      }
      cur.yieul = (cur.yieul == null && s.yieul == null) ? null : (cur.yieul || 0) + (s.yieul || 0);
    }
    return res.status(200).json({ schools: [...byBase.values()], fetchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'שגיאה בשרת' });
  }
}
