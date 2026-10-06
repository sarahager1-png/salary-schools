/*
  השורה התחתונה לחודש — לדף המנהל.

  "המנהל רוצה לראות כל חודש מה קורה, שורה תחתונה"; "כניסה שלו לצפייה"
  (שרה, 6.10). הדף מציג לכל חודש ולכל סניף: עלות ההוראה ועוד 20%, הכנסות
  משרד החינוך, מענק הרשת, הפער, ומה סוכם שהסניף מעביר.

  למה בשרת ולא בדפדפן: חישוב העלות דורש את שורות השכר של כל עובדת. מי
  שנכנס לצפייה אינו אמור לקבל אותן — רק סכום לסניף. לכן השרת קורא,
  מחשב באותו מודול של האפליקציה (src/lib/employer.js), ומחזיר סכומים
  בלבד: בלי שמות ובלי שורות אישיות.

  מי רשאי: רכזת (שרה) ומנהל בצפייה (director), מאומתים מול טוקן ההתחברות.
  קריאה בלבד — הנקודה הזאת אינה כותבת דבר.
*/
import { createClient } from '@supabase/supabase-js';
import * as emp from '../src/lib/employer.js';
import { db } from './_lib/db.js';
import { applyCalib } from './school-costs.js';
// אותו תרגום שדות של האפליקציה — לא העתק חלקי
import { rowToTeacher as toTeacher } from '../src/lib/teacherFields.js';

// אותה תוספת כמו בטבלת ההעברות לסניפים (TRANSFER_PCT ב-App.jsx)
const TRANSFER_PCT = 0.20;
const ALLOWED = new Set(['coordinator', 'director']);
const n = v => (v == null ? null : Number(v));

export default async function handler(req, res) {
  try {
    const token = (req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'חסר טוקן התחברות' });
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const anon = createClient(url, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: userData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !userData?.user) return res.status(401).json({ error: 'ההתחברות אינה תקפה' });
    const sb = db();
    const { data: prof } = await sb.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (!ALLOWED.has(prof?.role)) return res.status(403).json({ error: 'אין הרשאה לדף הזה' });

    /*
      קריאה בעמודים: Supabase מחזיר לכל היותר 1,000 שורות בקריאה, בלי
      שגיאה. שורות השכר גדלות בכ-120 בחודש, ובלי העמודים הסיכום היה
      מתחיל לחסר בשקט אחרי כמה חודשים.
    */
    const all = async (table, cols, order) => {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from(table).select(cols).order(order).range(from, from + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        out.push(...(data || []));
        if (!data || data.length < 1000) return out;
      }
    };
    const [sc, tm, fin, led, mo] = await Promise.all([
      all('schools', '*', 'id'),
      all('teacher_months', '*', 'id'),
      all('school_finance', 'school_id, ministry_budget, network_support, monthly_transfer, teaching_sim', 'school_id'),
      all('school_payment_ledger', 'school_id, month_key, ministry_received, chabad_paid', 'month_key'),
      all('months', 'key, opened_at, locked, closed_at', 'key'),
    ]);

    res.setHeader('cache-control', 'no-store');
    return res.status(200).json({ ...summarize(sc, tm, fin, led, mo), fetchedAt: new Date().toISOString() });
  } catch (e) {
    // הפרטים ליומן השרת בלבד — מי שנכנס לצפייה מקבל הודעה כללית
    console.error('monthly-summary', e);
    return res.status(500).json({ error: 'הסיכום החודשי לא נטען. נסו שוב בעוד רגע.' });
  }
}

/* החישוב עצמו — מיוצא, כדי שסקריפט בדיקה ישווה אותו מול המסך של שרה */
export function summarize(schools, rows, finance, ledger, monthsRows) {
  schools = schools || []; rows = rows || [];
  // מצב המודול — כמו שהאפליקציה ממלאת אותו אחרי טעינה
  emp.CHABAD_SUPP.clear();
  for (const s of schools) emp.CHABAD_SUPP.set(s.id, s.chabad_supp !== false);
  emp.MM_REPLACED.clear();
  emp.MATERNITY_LEAVES.clear();
  for (const r of rows) {
    if (String(r.mm_for || '').trim()) emp.MM_REPLACED.add(`${r.month_key}|${r.school_id}|${String(r.mm_for).trim()}`);
    if (r.leave_type === 'maternity') emp.MATERNITY_LEAVES.add(`${r.month_key}|${r.school_id}|${String(r.name).trim()}`);
  }
  const keys = [...new Set([...(monthsRows || []).map(m => m.key), ...rows.map(r => r.month_key)])].sort();
  // הכיול באפליקציה נקבע לפי החודש האחרון, ומשמש את כל החודשים
  const last = keys[keys.length - 1];
  applyCalib(rows.filter(r => r.month_key === last), toTeacher);

  const finBy = new Map((finance || []).map(f => [f.school_id, f]));
  const ledBy = new Map((ledger || []).map(l => [`${l.month_key}|${l.school_id}`, l]));
  const moBy  = new Map((monthsRows || []).map(m => [m.key, m]));

  const months = keys.map(key => {
    const mrows = rows.filter(r => r.month_key === key);
    const branches = [];
    for (const s of schools) {
      if (s.pays_salary === false) continue;
      const allTs = mrows.filter(r => r.school_id === s.id).map(toTeacher);
      const ts = allTs.filter(t => !emp.isHourlyRow(t));
      // שכר צהרון ומשרות שעתיות: הרשת משלמת, אין מולו הכנסה ממשרד החינוך — כולו על הסניף (שרה, 6.10, גני תקוה)
      const hourly = allTs.filter(t => emp.isHourlyRow(t)).reduce((a, t) => a + emp.calcEmployer(t).total, 0);
      const cost = ts.reduce((a, t) => a + emp.calcEmployer(t).total, 0);
      // סניף בלי עובדות בחודש — אין עלות בפועל, ולכן אינו בדף (כמו בטבלת ההעברות)
      if (!cost) continue;
      const f = finBy.get(s.id) || {};
      const paid = ts.filter(t => !emp.unpaidThisMonth(t));
      const ministry = n(f.ministry_budget) == null ? null : n(f.ministry_budget) / 12;
      const support  = (n(f.network_support) || 0) / 12;
      const add20 = cost * TRANSFER_PCT;
      const gap = ministry == null ? null : cost + add20 - ministry - support;
      const agreed = n(f.monthly_transfer);
      const l = ledBy.get(`${key}|${s.id}`) || {};
      branches.push({
        id: s.id, name: s.name,
        cost: Math.round(cost), add20: Math.round(add20), costWith20: Math.round(cost + add20),
        ministry: ministry == null ? null : Math.round(ministry), support: Math.round(support),
        gap: gap == null ? null : Math.round(gap),
        agreed, due: agreed ?? (gap == null ? null : Math.round(gap)),
        ministryReceived: n(l.ministry_received), chabadPaid: n(l.chabad_paid),
        // התחשיב הראשוני מהתקציב לחודש — היעד שמולו בודקים חריגה (בלי 20%)
        plan: n(f.teaching_sim) == null ? null : Math.round(n(f.teaching_sim) / 12),
        hourly: Math.round(hourly),
        staff: paid.length, withActual: paid.filter(t => Number(t._actualEmployerCost)).length,
      });
    }
    const m = moBy.get(key) || {};
    return { key, locked: !!m.locked, closedAt: m.closed_at || null, branches };
  });
  return { months };
}
