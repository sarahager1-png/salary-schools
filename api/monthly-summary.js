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
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'שיטה לא נתמכת' });
    const isPost = req.method === 'POST';
    // סגירה ופתיחה מחדש של חודש — רכזת בלבד; מנהל בצפייה אינו כותב דבר
    if (isPost && prof.role !== 'coordinator') return res.status(403).json({ error: 'רק הרכזת סוגרת חודש' });

    const { args, frozen, canClose } = await readAll(sb);

    if (isPost) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const month = String(body.month || '');
      if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'חודש לא תקין' });
      if (body.action === 'reopen') {
        const { error } = await sb.from('month_summary').delete().eq('month_key', month);
        if (error) throw new Error(`month_summary: ${error.message}`);
        return res.status(200).json({ ok: true, month, reopened: true });
      }
      if (body.action !== 'close') return res.status(400).json({ error: 'פעולה לא מוכרת' });
      if (frozen.some(f => f.month_key === month)) return res.status(409).json({ error: 'החודש כבר סגור' });
      // נסגר בדיוק מה שהדף מציג עכשיו — אותו חישוב
      const live = summarize(...args, []).months.find(m => m.key === month);
      if (!live || !live.branches.length) return res.status(400).json({ error: 'אין נתונים לחודש הזה' });
      const { error } = await sb.from('month_summary').insert(live.branches.map(b => ({
        month_key: month, school_id: b.id, data: b, closed_by: userData.user.id })));
      if (error?.code === '23505') return res.status(409).json({ error: 'החודש כבר סגור' });
      if (error) throw new Error(`month_summary: ${error.message}`);
      return res.status(200).json({ ok: true, month, closed: live.branches.length });
    }

    res.setHeader('cache-control', 'no-store');
    return res.status(200).json({ ...summarize(...args, frozen), canClose, fetchedAt: new Date().toISOString() });
  } catch (e) {
    // הפרטים ליומן השרת בלבד — מי שנכנס לצפייה מקבל הודעה כללית
    console.error('monthly-summary', e);
    return res.status(500).json({ error: req.method === 'POST' ? 'הפעולה לא נשמרה. נסי שוב בעוד רגע.' : 'הסיכום החודשי לא נטען. נסו שוב בעוד רגע.' });
  }
}

/* כל הקריאות שהסיכום נשען עליהן — משותף לדף ולסגירה האוטומטית ב-11 בחודש */
export async function readAll(sb) {
  let canClose = true;   // false עד שטבלת החודשים הסגורים קיימת במסד
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
  const [sc, tm, fin, led, mo, snaps, slips, frozen, fixes, attP, attR] = await Promise.all([
    all('schools', '*', 'id'),
    all('teacher_months', '*', 'id'),
    all('school_finance', 'school_id, ministry_budget, network_support, monthly_transfer, teaching_sim', 'school_id'),
    all('school_payment_ledger', 'school_id, month_key, ministry_received, chabad_paid', 'month_key'),
    all('months', 'key, opened_at, locked, closed_at', 'key'),
    all('month_sim_snapshot', 'school_id, month_key, sim_cost, source', 'month_key'),
    // התלושים הם השלמה בלבד — כשל בקריאתם לא מפיל את הדף
    all('payslip_files', 'id, school_id, month_key, employer_cost', 'id').catch(e => { console.error('monthly-summary payslips', e); return []; }),
    // חודשים שנסגרו. לפני שהטבלה קיימת — אין חודש סגור, והדף מחושב חי
    // רק "הטבלה עוד לא קיימת" נחשב כאין חודש סגור; כל כשל אחר מפיל את הבקשה, כדי שחודש סגור לא יוצג בטעות חי
    all('month_summary', 'month_key, school_id, data, closed_at', 'month_key').catch(e => {
      if (/does not exist|schema cache|PGRST205|42P01/i.test(String(e?.message))) { canClose = false; return []; }
      throw e;
    }),
    // תיקוני ברוטו לפי תלושים שעוד לא אושרו — כל עוד הם ממתינים, הסניף מוצג לפי הסימולציה
    all('proposed_fixes', 'id, teacher_month_id, status, patch', 'id'),
    // דוחות נוכחות — שכר שנקבע לפי שעות הדוח. לפני שהטבלאות קיימות: ריק
    all('attendance_people', 'id, name, school_id, active', 'id').catch(() => []),
    all('attendance_reports', 'person_id, month_key, total_hours, submitted_at', 'month_key').catch(() => []),
  ]);
  // ממלאים את מפות המודול כאן, לפני כל חישוב — כמו שהאפליקציה עושה אחרי טעינה
  const nrm = n => String(n || '').replace(/\s+/g, ' ').trim();
  const pBy = new Map(attP.filter(p => p.active !== false).map(p => [p.id, p]));
  emp.ATTENDANCE_STAFF.clear(); emp.ATTENDANCE_HOURS.clear();
  const dupAtt = new Set();
  for (const p of pBy.values()) { const k = `${p.school_id}|${nrm(p.name)}`; if (emp.ATTENDANCE_STAFF.has(k)) dupAtt.add(k); emp.ATTENDANCE_STAFF.add(k); }
  for (const k of dupAtt) emp.ATTENDANCE_STAFF.delete(k);   // שם כפול באותו סניף — לא מחברים לשכר
  for (const r of attR) { const p = pBy.get(r.person_id); if (p && r.submitted_at && !dupAtt.has(`${p.school_id}|${nrm(p.name)}`)) emp.ATTENDANCE_HOURS.set(`${r.month_key}|${p.school_id}|${nrm(p.name)}`, Number(r.total_hours) || 0); }
  return { args: [sc, tm, fin, led, mo, snaps, slips, fixes], frozen, canClose };
}

/* החישוב עצמו — מיוצא, כדי שסקריפט בדיקה ישווה אותו מול המסך של שרה */
export function summarize(schools, rows, finance, ledger, monthsRows, snapshots, slips, fixes, frozen) {
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
  const keys = [...new Set([...(monthsRows || []).map(m => m.key), ...rows.map(r => r.month_key), ...(slips || []).map(p => p.month_key)])].sort();
  // הכיול באפליקציה נקבע לפי החודש האחרון, ומשמש את כל החודשים
  const last = [...new Set(rows.map(r => r.month_key))].sort().pop() || keys[keys.length - 1];
  applyCalib(rows.filter(r => r.month_key === last), toTeacher);

  const finBy = new Map((finance || []).map(f => [f.school_id, f]));
  const ledBy = new Map((ledger || []).map(l => [`${l.month_key}|${l.school_id}`, l]));
  const moBy  = new Map((monthsRows || []).map(m => [m.key, m]));
  // תלושים בפועל לסניף ולחודש — לסניף שעוד לא הוזן למערכת באותו חודש (קרית ביאליק, 9/2026)
  const slipBy = new Map();
  for (const p of (slips || [])) {
    const k = `${p.month_key}|${p.school_id}`, o = slipBy.get(k) || { n: 0, cost: 0 };
    if (!Number(p.employer_cost)) continue;
    o.n++; o.cost += Number(p.employer_cost); slipBy.set(k, o);
  }

  const months = keys.map(key => {
    const mrows = rows.filter(r => r.month_key === key);
    const branches = [];
    for (const s of schools) {
      if (s.pays_salary === false) continue;
      const allTs = mrows.filter(r => r.school_id === s.id).map(toTeacher);
      const ts = allTs.filter(t => !emp.isHourlyRow(t));
      // שכר צהרון ומשרות שעתיות: הרשת משלמת, אין מולו הכנסה ממשרד החינוך — כולו על הסניף (שרה, 6.10, גני תקוה)
      const hourly = allTs.filter(t => emp.isHourlyRow(t)).reduce((a, t) => a + emp.calcEmployer(t).total, 0);
      let cost = ts.reduce((a, t) => a + emp.calcEmployer(t).total, 0);
      // סניף בלי שורות שכר בחודש: אם הגיעו תלושים, העלות היא סכום התלושים; אחרת אינו בדף
      const sl = !allTs.length ? slipBy.get(`${key}|${s.id}`) : null;
      if (sl) cost = sl.cost;
      if (!cost) continue;
      const f = finBy.get(s.id) || {};
      const paid = ts.filter(t => !emp.unpaidThisMonth(t));
      const ministry = n(f.ministry_budget) == null ? null : n(f.ministry_budget) / 12;
      const support  = (n(f.network_support) || 0) / 12;
      // "כן, 20 אחוז על הכל" (שרה, 7.10.26): הכרית מחושבת גם על המשרות השעתיות (צהרון, מנהלה), לא רק על ההוראה
      const add20 = (cost + hourly) * TRANSFER_PCT;
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
        // התחשיב הראשוני מהתקציב לחודש (לא מוצג בדף; נשמר להשוואה)
        budgetPlan: n(f.teaching_sim) == null ? null : Math.round(n(f.teaching_sim) / 12),
        plan: null,   // מתמלא למטה: העלות לפי מחשבון המשרד
        hourly: Math.round(hourly),
        staff: sl ? sl.n : paid.length, withActual: sl ? sl.n : paid.filter(t => Number(t._actualEmployerCost)).length,
        fromSlips: !!sl,
      });
    }
    const m = moBy.get(key) || {};
    return { key, locked: !!m.locked, closedAt: m.closed_at || null, branches };
  });
  /*
    "הסימולציה הראשונה שלי… העלות לפי מחשבון המשרד" (שרה, 6.10). היעד שמולו
    בודקים חריגה הוא העלות שהמערכת חישבה לכל עובדת מהמחשבון הרשמי, לפני
    שהגיעו התלושים: אותו ברוטו, עלות המעביד לפי המודל, בלי עלות בפועל מקובץ
    ובלי הכיול שנלמד מהתלושים (הכיול עצמו נגזר מהם, ולכן אינו "לפני").
  */
  emp.setCalib([], 1);
  for (const mo of months) {
    const mrows = rows.filter(r => r.month_key === mo.key);
    for (const b of mo.branches) {
      const ts = mrows.filter(r => r.school_id === b.id).map(toTeacher).filter(t => !emp.isHourlyRow(t));
      b.plan = Math.round(ts.reduce((a, t) => a + emp.calcEmployer({ ...t, _actualEmployerCost: null }).total, 0)) || null;
      /*
        "את עלות הנהלה והצהרון תגלם בשכר התוכנן" (שרה, 7.10): המשרות השעתיות לפי
        התכנון — שעות המשרה כפול התעריף — בלי דוח הנוכחות של החודש (מפתח חודש
        שאינו קיים מנתק את הדוח), ובלי עלות בפועל. מוחזר בנפרד; הדף מחבר.
      */
      const hs = mrows.filter(r => r.school_id === b.id).map(toTeacher).filter(t => emp.isHourlyRow(t));
      b.planHourly = Math.round(hs.reduce((a, t) => a + emp.calcEmployer({ ...t, _actualEmployerCost: null, monthKey: '__plan__' }).total, 0));
      b.planSource = 'live';   // מחושב עכשיו מהנתונים הנוכחיים — עוד לא צולם
    }
  }
  // צילום שנשמר גובר על החישוב החי: זו הסימולציה כפי שהייתה לפני התלושים
  const snapBy = new Map((snapshots || []).map(x => [`${x.month_key}|${x.school_id}`, x]));
  for (const mo of months) for (const b of mo.branches) {
    const sn = snapBy.get(`${mo.key}|${b.id}`);
    if (sn) { b.plan = Math.round(Number(sn.sim_cost)); b.planSource = sn.source; }
  }
  /*
    "למה חסר?" (שרה, 6.10): סניף שמוצג לפי התלושים כי עוד לא הוזן למערכת באותו
    חודש (קרית ביאליק, 9/2026) — אין לו סימולציה לחודש הזה. במקומה מוצגת
    הסימולציה הראשונה שנעשתה לו: זו של החודש הראשון שבו הוא במערכת.
  */
  for (let i = 0; i < months.length; i++) for (const b of months[i].branches) {
    if (!b.fromSlips || b.plan != null) continue;
    for (let j = i + 1; j < months.length; j++) {
      const nx = months[j].branches.find(x => x.id === b.id && x.plan != null && !x.fromSlips);
      if (nx) { b.plan = nx.plan; b.planHourly = nx.planHourly; b.planSource = 'first-sim'; b.planFrom = months[j].key; break; }
    }
  }
  /*
    "תשאיר סימולציה כל עוד לא עודכנו התלושים" (שרה, 6.10.26). סניף שיש לו
    תיקוני ברוטו לפי תלושים שעוד לא אושרו — העלות שלו בחודש הזה היא עדיין
    לא "בפועל": חלק מהשורות לפי התלוש וחלק לפי המחשבון. עד שהתיקונים
    מאושרים, הסניף מוצג לפי הסימולציה, ומסומן כך.
  */
  const rowBy = new Map(rows.map(r => [r.id, r]));
  const waiting = new Map();   // "חודש|סניף" → מספר התיקונים הממתינים
  for (const f of (fixes || [])) {
    if (f.status !== 'pending' || !f.patch || (f.patch._slipGross == null && f.patch._officialGross == null)) continue;
    const r = rowBy.get(f.teacher_month_id);
    if (!r) continue;
    const k = `${r.month_key}|${r.school_id}`;
    waiting.set(k, (waiting.get(k) || 0) + 1);
  }
  for (const mo of months) for (const b of mo.branches) {
    const w = waiting.get(`${mo.key}|${b.id}`);
    if (!w || b.plan == null || b.fromSlips) continue;
    b.simOnly = true; b.pendingFixes = w; b.systemCost = b.cost;
    b.cost = b.plan; b.add20 = Math.round((b.cost + (b.hourly || 0)) * TRANSFER_PCT); b.costWith20 = b.cost + b.add20;
    if (b.ministry != null) {
      b.gap = Math.round(b.cost + b.add20 - b.ministry - b.support);
      if (b.agreed == null) b.due = b.gap;
    }
  }

  /*
    חודש סגור: השורות כפי שנשמרו ברגע הסגירה, ולא החישוב החי. מה שנרשם
    אחר כך בתקבולים (משרד החינוך, העברת הסניף) ושם הסניף — מהנתונים הנוכחיים.
  */
  const frBy = new Map();
  for (const f of (frozen || [])) { if (!frBy.has(f.month_key)) frBy.set(f.month_key, []); frBy.get(f.month_key).push(f); }
  const scBy = new Map(schools.map(x => [x.id, x]));
  for (const mo of months) {
    const fr = frBy.get(mo.key);
    if (!fr) continue;
    mo.frozenAt = fr.map(f => f.closed_at).sort()[0];
    mo.branches = fr.map(f => {
      const l = ledBy.get(`${mo.key}|${f.school_id}`) || {};
      return { ...f.data, id: f.school_id, name: scBy.get(f.school_id)?.name || f.data.name,
        ministryReceived: n(l.ministry_received) ?? f.data.ministryReceived ?? null,
        chabadPaid: n(l.chabad_paid) ?? f.data.chabadPaid ?? null };
    });
  }
  return { months };
}
