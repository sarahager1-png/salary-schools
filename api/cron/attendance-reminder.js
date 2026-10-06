/*
  תזכורת לדוח הנוכחות — ב-1 וב-4 בחודש.

  "תכין דיגיטלי שתמלא ותשלח עד ה-4 בחודש" (שרה, 6.10.26), ואחר כך "כן" לתזכורת
  אוטומטית. עובדת מנהלה שממלאת דוח נוכחות מקבלת תזכורת על החודש שהסתיים:
  ב-1 בחודש — שהגיע הזמן לשלוח, וב-4 — שזה היום האחרון. מי שכבר שלחה
  אינה מקבלת, ולא נשלחות שתי תזכורות באותו יום.

  שבת: הודעה שיוצאת בשבת או בשישי אחר הצהריים נדחית ליום ראשון בבוקר.
  חגים אינם נבדקים כאן.
*/
import { db, guard, monthKeyNow } from '../_lib/db.js';

const KIND = 'attendance_reminder';
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export default async function handler(req, res) {
  const bad = guard(req);
  if (bad) return res.status(403).json({ error: bad });
  try {
    const sb = db();
    const q = new URL(req.url, 'http://x').searchParams;
    const month = /^\d{4}-\d{2}$/.test(q.get('month') || '') ? q.get('month') : monthKeyNow(-1);   // החודש שהסתיים
    const il = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    const last = il.getDate() >= 4;

    const { data: people, error: e1 } = await sb.from('attendance_people').select('id, code, name, phone').eq('active', true);
    if (e1) return res.status(200).json({ ok: true, month, skipped: 'טבלת דוחות הנוכחות אינה זמינה' });
    const { data: reps } = await sb.from('attendance_reports').select('person_id, submitted_at').eq('month_key', month);
    const done = new Set((reps ?? []).filter(r => r.submitted_at).map(r => r.person_id));

    // לא פעמיים באותו יום לאותו טלפון
    const day0 = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const { data: already } = await sb.from('notifications').select('to_phone').eq('kind', KIND).eq('month_key', month).gte('created_at', day0);
    const sentTo = new Set((already ?? []).map(n => n.to_phone));

    // שבת: שישי מ-14:00 ושבת — נדחה לראשון 08:00 (שעון ישראל)
    let sendAfter = new Date();
    const wd = il.getDay(), hr = il.getHours();
    if (wd === 6 || (wd === 5 && hr >= 14)) {
      const days = wd === 6 ? 1 : 2;
      const target = new Date(il); target.setDate(il.getDate() + days); target.setHours(8, 0, 0, 0);
      sendAfter = new Date(Date.now() + (target - il));
    }

    const [y, m] = month.split('-').map(Number);
    const due = `4.${m === 12 ? 1 : m + 1}`;
    const queue = [];
    for (const p of people ?? []) {
      if (!p.phone || done.has(p.id) || sentTo.has(p.phone)) continue;
      const link = `https://salary-schools.vercel.app/?n=${p.code}`;
      queue.push({ kind: KIND, to_phone: p.phone, to_name: p.name, month_key: month, channel: 'whatsapp', status: 'pending', send_after: sendAfter.toISOString(),
        body: last
          ? `היום היום האחרון לשליחת דוח הנוכחות של ${MONTHS[m - 1]} ${y}. השכר של החודש נקבע לפי הדוח, ולכן חשוב לשלוח אותו היום:\n${link}`
          : `דוח הנוכחות של ${MONTHS[m - 1]} ${y} מחכה לשליחה. נא לוודא שכל ימי העבודה מלאים, וללחוץ "שליחת הדוח" עד ${due}:\n${link}` });
    }
    if (queue.length) {
      const { error } = await sb.from('notifications').insert(queue);
      if (error) throw new Error(error.message);
    }
    return res.status(200).json({ ok: true, month, queued: queue.length, alreadySubmitted: done.size, lastDay: last });
  } catch (e) {
    console.error('attendance-reminder', e);
    return res.status(500).json({ error: 'תזכורת דוח הנוכחות נכשלה' });
  }
}
