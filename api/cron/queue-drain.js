/*
  ריקון תור ההודעות.

  כל שליחה במערכת עוברת דרך טבלת notifications, ורק כאן היא יוצאת.
  המסך אינו מדבר עם Green API: כך יש היסטוריה, ניסיון חוזר, ומקום אחד
  לראות מה נשלח ומה נכשל.

  בלי פרטי חיבור לא נשלח דבר, והתור נשאר ממתין — עדיף שהודעה תחכה מאשר
  שתצא ממספר שגוי.
*/
import { db, guard } from '../_lib/db.js';
import { sendWhatsApp, credentials } from '../_lib/whatsapp.js';

const MAX_PER_RUN = 40;      // מגן על הקו מפני חסימה
const MAX_ATTEMPTS = 4;

export default async function handler(req, res) {
  const bad = guard(req);
  if (bad) return res.status(403).json({ error: bad });

  if (!credentials()) {
    return res.status(200).json({ ok: true, skipped: 'אין פרטי Green API — התור ממתין' });
  }

  const sb = db();
  const { data: rows, error } = await sb.from('notifications')
    .select('id, to_phone, to_name, body, attempts')
    .eq('status', 'pending')
    // inapp אינה יוצאת לשום מקום — היא מוצגת במסך
    .eq('channel', 'whatsapp')
    .lte('send_after', new Date().toISOString())
    .order('send_after')
    .limit(MAX_PER_RUN);
  if (error) return res.status(500).json({ error: error.message });

  let sent = 0, failed = 0;
  for (const n of rows ?? []) {
    try {
      await sendWhatsApp(n.to_phone, n.body);
      await sb.from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString(), attempts: n.attempts + 1, error: null })
        .eq('id', n.id);
      sent++;
    } catch (e) {
      const attempts = n.attempts + 1;
      // אחרי ארבעה ניסיונות מפסיקים ומשאירים את הסיבה על השורה
      await sb.from('notifications').update({
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        attempts,
        error: String(e.message).slice(0, 300),
        send_after: new Date(Date.now() + attempts * 10 * 60000).toISOString(),
      }).eq('id', n.id);
      failed++;
    }
  }
  return res.status(200).json({ ok: true, sent, failed, picked: rows?.length ?? 0 });
}
