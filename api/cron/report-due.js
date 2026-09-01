/*
  מועד הדיווח — ב-5 בחודש.

  "נסגר אבל מסומן" (הכרעת שרה): המנהלת עדיין יכולה לדווח, אבל השורה
  מסומנת late_report ואינה עוברת לתשלום בלי אישור מפורש. אחת ההחלטות
  שקל להחמיץ: חסימה קשיחה הייתה משאירה עובדת בלי שכר בגלל יום איחור.

  בסוף היום שרה מקבלת הודעה אחת עם מה שקפץ לבדיקה.
*/
import { db, guard, monthKeyNow, monthOf } from '../_lib/db.js';

const KIND = 'report_due_summary';

export default async function handler(req, res) {
  const bad = guard(req);
  if (bad) return res.status(403).json({ error: bad });

  const sb = db();
  const key = monthOf(req);
  const { data: month } = await sb.from('months').select('key').eq('key', key).maybeSingle();
  if (!month) return res.status(200).json({ ok: true, note: 'החודש טרם נפתח' });

  await sb.from('months').update({ closed_at: new Date().toISOString() }).eq('key', key);

  // כל שורה שטרם דווחה מסומנת מאחרת — הסימון הוא על השורה, לא על החודש
  const { data: late } = await sb.from('teacher_months')
    .update({ late_report: true })
    .eq('month_key', key)
    .is('reported_at', null)
    .select('id, name, schools!inner(name)');

  const { data: rows } = await sb.from('teacher_months')
    .select('id, name, leave_type, official_gross, approved, schools!inner(name)')
    .eq('month_key', key);
  const all = rows ?? [];
  const noGross  = all.filter(r => r.official_gross == null).length;
  const maternity = all.filter(r => r.leave_type === 'maternity').length;
  const waiting  = all.filter(r => r.official_gross != null && !r.approved).length;

  const admin = process.env.ADMIN_PHONE;
  let queued = 0;
  if (admin) {
    const { data: dup } = await sb.from('notifications')
      .select('id').eq('kind', KIND).eq('month_key', key).limit(1);
    if (!dup?.length) {
      const lateNames = (late ?? []).slice(0, 8).map(r => `· ${r.name} (${r.schools?.name ?? ''})`).join('\n');
      const body = [
        `סיכום ה-5 בחודש — ${key}`,
        `${all.length} שורות בחודש.`,
        (late ?? []).length ? `${late.length} לא דווחו במועד:\n${lateNames}` : 'כל בתי הספר דיווחו במועד.',
        noGross ? `${noGross} עדיין בלי ברוטו מחשבת השכר.` : 'לכולן יש ברוטו.',
        waiting ? `${waiting} ממתינות לאישור שלך.` : '',
        maternity ? `${maternity} בחופשת לידה.` : '',
      ].filter(Boolean).join('\n');
      const { error } = await sb.from('notifications').insert({
        kind: KIND, to_phone: admin, to_name: 'שרה הגר', month_key: key, body,
      });
      if (error) return res.status(500).json({ error: error.message });
      queued = 1;
    }
  }
  return res.status(200).json({ ok: true, month: key, marked_late: (late ?? []).length, queued });
}
