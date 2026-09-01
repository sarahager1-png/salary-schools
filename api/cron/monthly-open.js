/*
  פתיחת חודש — ב-1 בחודש.

  מעתיק את שורות החודש הקודם, כולל האישורים: "אין צורך בשינויים לאישור —
  אם לא משתנה, ככה זה" (שרה, 27.8). רק שורה שתשתנה תחזור לאישור, דרך
  מעקב השינויים. מועדי הדיווח נקבעים כאן: ה-5 וה-6.
*/
import { db, guard, monthKeyNow, monthOf, cycleStarted } from '../_lib/db.js';

export default async function handler(req, res) {
  const bad = guard(req);
  if (bad) return res.status(403).json({ error: bad });

  const sb = db();
  const key = monthOf(req);
  if (!cycleStarted(key)) {
    return res.status(200).json({ ok: true, month: key, skipped: 'המחזור עוד לא התחיל בחודש הזה' });
  }
  // החודש שלפניו — נגזר מהמפתח עצמו, כדי שגם הרצה על חודש אחר תעתיק
  // מהמקום הנכון ולא מהחודש הקלנדרי הקודם.
  const [py, pm] = key.split('-').map(Number);
  const prevD = new Date(Date.UTC(py, pm - 2, 1));
  const prev = `${prevD.getUTCFullYear()}-${String(prevD.getUTCMonth() + 1).padStart(2, '0')}`;

  const { data: exists } = await sb.from('months').select('key').eq('key', key).maybeSingle();
  if (exists) return res.status(200).json({ ok: true, month: key, note: 'החודש כבר פתוח' });

  const { error: mErr } = await sb.from('months').insert({
    key,
    opened_at: new Date().toISOString(),
    report_due: `${key}-05`,
    submit_due: `${key}-06`,
  });
  if (mErr) return res.status(500).json({ error: mErr.message });

  const { data: rows } = await sb.from('teacher_months').select('*').eq('month_key', prev);
  const copied = (rows ?? []).map(r => {
    const { id, created_at, updated_at, ...rest } = r;
    return {
      ...rest,
      month_key: key,
      // הדיווח החודשי מתחיל מחדש; האישור והמספרים עוברים כמות שהם
      reported_at: null,
      late_report: false,
      payroll_ready: false,
      absence_days: 0,
      mm_hours: 0,
      mm_for: null,
    };
  });
  if (copied.length) {
    const { error: tErr } = await sb.from('teacher_months').insert(copied);
    if (tErr) return res.status(500).json({ error: tErr.message });
  }
  return res.status(200).json({ ok: true, month: key, copied: copied.length });
}
