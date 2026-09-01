/*
  חל"ד — התראה מיידית.

  "חל"ד המערכת תתריע מיידית" (שרה, 1.9). רצה כל שעה ולא פעם בחודש:
  חופשת לידה אינה ממתינה למועד דיווח, והשכר, המחליפה וההפרשות תלויים
  בה. מדווחת רק על מה שנוסף מאז הריצה הקודמת.
*/
import { db, guard, monthKeyNow, monthOf } from '../_lib/db.js';

const KIND = 'maternity_alert';

export default async function handler(req, res) {
  const bad = guard(req);
  if (bad) return res.status(403).json({ error: bad });

  const sb = db();
  const key = monthOf(req);
  const { data: rows } = await sb.from('teacher_months')
    .select('id, name, leave_from, leave_to, mm_for, schools!inner(name)')
    .eq('month_key', key)
    .eq('leave_type', 'maternity');
  const all = rows ?? [];
  if (!all.length) return res.status(200).json({ ok: true, note: 'אין חל"ד החודש' });

  // מי שכבר דווחה — לפי מזהה השורה, כדי שלא נתריע פעמיים על אותה עובדת
  const { data: sentRows } = await sb.from('notifications')
    .select('teacher_id').eq('kind', KIND).eq('month_key', key);
  const sent = new Set((sentRows ?? []).map(n => n.teacher_id));
  const fresh = all.filter(r => !sent.has(r.id));
  if (!fresh.length) return res.status(200).json({ ok: true, note: 'כל החל"ד כבר דווחו' });

  const admin = process.env.ADMIN_PHONE;
  if (!admin) return res.status(200).json({ ok: true, note: 'אין ADMIN_PHONE', fresh: fresh.length });

  const day = d => (d ? String(d).split('-').reverse().join('/') : '—');
  const queue = fresh.map(r => ({
    kind: KIND, to_phone: admin, to_name: 'שרה הגר', month_key: key, teacher_id: r.id,
    body: `חופשת לידה — ${r.name}\n${r.schools?.name ?? ''}\nמ-${day(r.leave_from)} עד ${day(r.leave_to)}\n` +
          (r.mm_for ? 'שובצה מחליפה.' : 'טרם שובצה מחליפה — עד שתשובץ השכר נשאר מלא בתקציב.'),
  }));
  const { error } = await sb.from('notifications').insert(queue);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, month: key, queued: queue.length });
}
