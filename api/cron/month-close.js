/*
  סגירת חודש — ב-11 בחודש.

  "סוגרים חודש ב-11 לחודש" (שרה, 6.10.26). ב-11 נשמרת תמונת המצב של חודש
  השכר שהסתיים (ב-11 באוקטובר — ספטמבר), לכל סניף, כפי שהיא מוצגת באותו
  רגע. מכאן הדף מציג את החודש מהשמור, ותיקון מאוחר בנתוני השכר אינו משנה
  אותו. חודש שכבר נסגר ידנית אינו נדרס. שרה יכולה לפתוח מחדש מהדף.
*/
import { db, guard, monthKeyNow } from '../_lib/db.js';
import { readAll, summarize } from '../monthly-summary.js';

export default async function handler(req, res) {
  const bad = guard(req);
  if (bad) return res.status(403).json({ error: bad });
  try {
    const q = new URL(req.url, 'http://x').searchParams.get('month');
    const month = /^\d{4}-\d{2}$/.test(q || '') ? q : monthKeyNow(-1);
    const sb = db();
    const { args, frozen, canClose } = await readAll(sb);
    if (!canClose) return res.status(200).json({ ok: true, month, skipped: 'טבלת החודשים הסגורים עוד לא קיימת' });
    if (frozen.some(f => f.month_key === month)) return res.status(200).json({ ok: true, month, skipped: 'החודש כבר סגור' });
    const live = summarize(...args, []).months.find(m => m.key === month);
    if (!live || !live.branches.length) return res.status(200).json({ ok: true, month, skipped: 'אין נתונים לחודש' });
    const { error } = await sb.from('month_summary').insert(live.branches.map(b => ({ month_key: month, school_id: b.id, data: b })));
    if (error?.code === '23505') return res.status(200).json({ ok: true, month, skipped: 'החודש כבר סגור' });
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true, month, closed: live.branches.length });
  } catch (e) {
    console.error('month-close', e);
    return res.status(500).json({ error: 'סגירת החודש נכשלה' });
  }
}
