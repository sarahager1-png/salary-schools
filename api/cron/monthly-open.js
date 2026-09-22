/*
  פתיחת חודש — ב-1 בחודש.

  מעתיק את שורות החודש הקודם, כולל האישורים: "אין צורך בשינויים לאישור —
  אם לא משתנה, ככה זה" (שרה, 27.8). רק שורה שתשתנה תחזור לאישור, דרך
  מעקב השינויים. מועדי הדיווח נקבעים כאן: ה-20 בחודש, וה-6 בחודש שאחריו.
*/
import { db, guard, monthKeyNow, monthOf, cycleStarted, dueDatesFor } from '../_lib/db.js';

export default async function handler(req, res) {
  const bad = guard(req);
  if (bad) return res.status(403).json({ error: bad });

  const sb = db();
  const key = monthOf(req);
  if (!cycleStarted()) {
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
    // הדיווח על חודש העבודה מגיע בחודש שאחריו
    report_due: dueDatesFor(key).report,
    submit_due: dueDatesFor(key).submit,
    lock_due:   dueDatesFor(key).lock,
  });
  if (mErr) return res.status(500).json({ error: mErr.message });

  const { data: rows } = await sb.from('teacher_months').select('*').eq('month_key', prev);
  /*
    חל"ד שנגמרה (תאריך החזרה עד תחילת החודש החדש) — העובדת חוזרת לסטטוס
    רגיל. ומחליפת חל"ד שומרת את "במקום מי" כל עוד הנעדרת עדיין בחופשה:
    בלי זה, ב-1 בחודש כל מחליפה נמחקה והנעדרת חזרה להיספר בשכר מלא
    ("חני בלוי חזרה ב-15.9", שרה 22.9.26). מילוי מקום שוטף (שעות) מתאפס.
  */
  const firstDay = `${key}-01`;
  const ended = r => r.leave_type === 'maternity' && r.leave_to && String(r.leave_to).slice(0, 10) <= firstDay;
  const stillOnLeave = new Set((rows ?? [])
    .filter(r => r.leave_type === 'maternity' && !ended(r))
    .map(r => `${r.school_id}|${String(r.name || '').trim()}`));
  const copied = (rows ?? []).map(r => {
    const { id, created_at, updated_at, ...rest } = r;
    const coversLeave = r.mm_for && stillOnLeave.has(`${r.school_id}|${String(r.mm_for).trim()}`);
    return {
      ...rest,
      month_key: key,
      // הדיווח החודשי מתחיל מחדש; האישור והמספרים עוברים כמות שהם
      reported_at: null,
      late_report: false,
      payroll_ready: false,
      absence_days: 0,
      mm_hours: 0,
      mm_for: coversLeave ? r.mm_for : null,
      ...(ended(r) ? { leave_type: 'none', leave_from: null, leave_to: null } : {}),
    };
  });
  if (copied.length) {
    const { error: tErr } = await sb.from('teacher_months').insert(copied);
    if (tErr) return res.status(500).json({ error: tErr.message });
  }
  return res.status(200).json({ ok: true, month: key, copied: copied.length });
}
