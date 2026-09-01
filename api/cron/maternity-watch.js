/*
  חל"ד — התראה מיידית.

  "חל"ד המערכת תתריע מיידית" (שרה, 1.9). רצה כל שעה ולא פעם בחודש:
  חופשת לידה אינה ממתינה למועד דיווח, והשכר, המחליפה וההפרשות תלויים
  בה. מדווחת רק על מה שנוסף מאז הריצה הקודמת.
*/
import { db, guard, monthKeyNow, monthOf, cycleStarted } from '../_lib/db.js';

const KIND = 'maternity_alert';

export default async function handler(req, res) {
  const bad = guard(req);
  if (bad) return res.status(403).json({ error: bad });

  const sb = db();
  const key = monthOf(req);
  if (!cycleStarted()) {
    return res.status(200).json({ ok: true, month: key, skipped: 'המחזור עוד לא התחיל בחודש הזה' });
  }
  const { data: rows } = await sb.from('teacher_months')
    .select('id, name, leave_from, leave_to, mm_for, schools!inner(name)')
    .eq('month_key', key)
    .eq('leave_type', 'maternity');
  const all = rows ?? [];
  if (!all.length) return res.status(200).json({ ok: true, note: 'אין חל"ד החודש' });

  // מי שכבר דווחה — לפי מזהה השורה, כדי שלא נתריע פעמיים על אותה עובדת
  const { data: sentRows } = await sb.from('notifications')
    .select('teacher_id, to_phone').eq('kind', KIND).eq('month_key', key);
  const sent = new Set((sentRows ?? []).map(n => `${n.teacher_id}|${n.to_phone}`));
  const fresh = all;

  /*
    למי ההתראה. חל"ד נוגעת לשתיים: לשרה, שמחליטה על המחליפה ועל
    התקציב, ולחשבת השכר, שההפרשות והתלוש בידיה (הוראת שרה, 1.9).

    חשבת השכר נקראת מהפרופילים ולא מרשימה קבועה — מי שתחליף את אסתר
    תקבל את ההתראות בלי לגעת בקוד. פרופיל בלי נייד פשוט אינו מקבל.
  */
  const { data: clerks } = await sb.from('profiles')
    .select('full_name, phone').eq('role', 'clerk').not('phone', 'is', null);
  const to = [
    ...(process.env.ADMIN_PHONE ? [{ phone: process.env.ADMIN_PHONE, name: 'שרה הגר' }] : []),
    ...(clerks ?? []).map(c => ({ phone: c.phone, name: c.full_name })),
  ];
  if (!to.length) return res.status(200).json({ ok: true, note: 'אין למי לשלוח', fresh: fresh.length });

  const day = d => (d ? String(d).split('-').reverse().join('/') : '—');
  const queue = fresh.flatMap(r => to.filter(t => !sent.has(`${r.id}|${t.phone}`)).map(t => ({
    kind: KIND, to_phone: t.phone, to_name: t.name, month_key: key, teacher_id: r.id,
    body: `חופשת לידה — ${r.name}\n${r.schools?.name ?? ''}\nמ-${day(r.leave_from)} עד ${day(r.leave_to)}\n` +
          (r.mm_for ? 'שובצה מחליפה.' : 'טרם שובצה מחליפה — עד שתשובץ השכר נשאר מלא בתקציב.'),
  })));
  if (!queue.length) return res.status(200).json({ ok: true, note: 'כל החל"ד כבר דווחו' });
  const { error } = await sb.from('notifications').insert(queue);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, month: key, queued: queue.length });
}
