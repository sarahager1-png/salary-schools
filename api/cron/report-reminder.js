/*
  תזכורת למנהלות — ב-3 בחודש, יומיים לפני המועד.

  לא נשלחת למי שכבר דיווחה, ולא פעמיים לאותה מנהלת: התור נבדק לפני
  שנכתבת שורה חדשה. "כל דיווח שיעלה עד ה-5 ישולם, מה שלא יעלה לא ישולם"
  — התזכורת היא ההזדמנות, לא ההודעה על התוצאה.
*/
import { db, guard, monthKeyNow, monthOf, cycleStarted } from '../_lib/db.js';

const KIND = 'report_reminder';

export default async function handler(req, res) {
  const bad = guard(req);
  if (bad) return res.status(403).json({ error: bad });

  const sb = db();
  const key = monthOf(req);
  if (!cycleStarted(key)) {
    return res.status(200).json({ ok: true, month: key, skipped: 'המחזור עוד לא התחיל בחודש הזה' });
  }
  const { data: month } = await sb.from('months').select('key, report_due').eq('key', key).maybeSingle();
  if (!month) return res.status(200).json({ ok: true, note: 'החודש טרם נפתח' });

  // מי טרם דיווחה: בית ספר שיש בו שורה אחת לפחות בלי reported_at
  const { data: rows } = await sb.from('teacher_months')
    .select('school_id, reported_at, schools!inner(name)')
    .eq('month_key', key);
  const pending = new Map();
  for (const r of rows ?? []) {
    if (r.reported_at) continue;
    pending.set(r.school_id, r.schools?.name ?? '');
  }
  if (!pending.size) return res.status(200).json({ ok: true, note: 'כולן דיווחו' });

  const { data: principals } = await sb.from('profiles')
    .select('id, full_name, phone, school_id')
    .eq('role', 'principal')
    .in('school_id', [...pending.keys()]);

  const { data: already } = await sb.from('notifications')
    .select('to_phone').eq('kind', KIND).eq('month_key', key);
  const sentTo = new Set((already ?? []).map(n => n.to_phone));

  const due = String(month.report_due || '').split('-').reverse().join('/');
  const queue = [];
  for (const pr of principals ?? []) {
    if (!pr.phone || sentTo.has(pr.phone)) continue;
    queue.push({
      kind: KIND, to_phone: pr.phone, to_name: pr.full_name, month_key: key,
      body: `${pr.full_name}, שלום.\nהדיווח החודשי של ${pending.get(pr.school_id)} עדיין פתוח — העדרויות, מילוי מקום וחופשות לידה.\nהמועד האחרון הוא ${due}. דיווח שיגיע אחריו לא ייכנס לשכר החודש.`,
    });
  }
  if (queue.length) {
    const { error } = await sb.from('notifications').insert(queue);
    if (error) return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ ok: true, month: key, queued: queue.length, schools: pending.size });
}
