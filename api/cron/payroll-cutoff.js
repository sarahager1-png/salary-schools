/*
  מועד ההשלמה — ב-6 בחודש.

  "רק מי שתעביר עד ה-6 לחודש תקבל שכר" (שרה, 1.9). מה שנבדק כאן הוא
  שלושה תנאים יחד: יש ברוטו, שרה אישרה, והמורה השלימה את הפרטים שלה
  (טופס 101 חתום). מי שעומדת בשלושתם עוברת לשכר; מי שלא — נשארת, ושרה
  רואה אותה ברשימה.

  אין מחיקה ואין ביטול. השורה ממתינה לחודש הבא או להכרעה ידנית.
*/
import { db, guard, monthKeyNow, workMonth, cycleStarted } from '../_lib/db.js';

const KIND = 'payroll_cutoff';

export default async function handler(req, res) {
  const bad = guard(req);
  if (bad) return res.status(403).json({ error: bad });

  const sb = db();
  const key = workMonth(req);   // חודש העבודה שהסתיים
  if (!cycleStarted()) {
    return res.status(200).json({ ok: true, month: key, skipped: 'המחזור עוד לא התחיל בחודש הזה' });
  }

  const { data: rows } = await sb.from('teacher_months')
    .select('id, name, tz_id, official_gross, agreed_gross, approved, payroll_ready, leave_type, schools!inner(name)')
    .eq('month_key', key);
  const all = (rows ?? []).filter(r => r.leave_type !== 'unpaid');

  // מי השלימה טופס 101 — לפי ת.ז., כי הקליטה חיה בטבלה נפרדת
  const { data: onboarding } = await sb.from('teacher_onboarding')
    .select('tz_id, form101_signed_at');
  const signed = new Set((onboarding ?? []).filter(o => o.form101_signed_at).map(o => o.tz_id));

  const ready = all.filter(r =>
    (r.official_gross != null || r.agreed_gross != null) && r.approved && signed.has(r.tz_id));
  const blocked = all.filter(r => !ready.includes(r));

  if (ready.length) {
    await sb.from('teacher_months').update({ payroll_ready: true })
      .in('id', ready.map(r => r.id));
  }

  const admin = process.env.ADMIN_PHONE;
  let queued = 0;
  if (admin && blocked.length) {
    const { data: dup } = await sb.from('notifications')
      .select('id').eq('kind', KIND).eq('month_key', key).limit(1);
    if (!dup?.length) {
      const why = r => !r.official_gross && !r.agreed_gross ? 'בלי ברוטו'
        : !r.approved ? 'בלי אישור'
        : 'בלי טופס 101';
      const list = blocked.slice(0, 10).map(r => `· ${r.name} (${r.schools?.name ?? ''}) — ${why(r)}`).join('\n');
      await sb.from('notifications').insert({
        kind: KIND, to_phone: admin, to_name: 'שרה הגר', month_key: key,
        body: `סגירת ה-6 — ${key}\n${ready.length} עברו לשכר.\n${blocked.length} לא עברו:\n${list}`,
      });
      queued = 1;
    }
  }
  return res.status(200).json({ ok: true, month: key, ready: ready.length, blocked: blocked.length, queued });
}
