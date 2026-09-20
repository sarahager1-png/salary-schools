/*
  העלאת טופס מחלה מהקישור של המנהלת.

  למחזיקת הקישור אין session, ולכן ההעלאה עוברת כאן: הקוד מאומת מול
  access_links, השורה מאומתת מול בית הספר שלה, והקובץ נכתב לדלי
  sick-forms במפתח השרת. הנתיב חוזר אליה והיא שומרת אותו על השורה דרך
  link_save_row — כרגיל, בלי מסלול כתיבה חדש למסד.

  הקובץ מגיע כ-base64 בגוף JSON — פשוט יותר מ-multipart בפונקציית
  Vercel, וטופס מחלה מצולם קטן ממגבלת ה-4.5MB של הגוף.
*/
import { db } from './_lib/db.js';

const MAX_BYTES = 4 * 1024 * 1024;
const OK_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf', 'image/webp': 'webp', 'image/heic': 'heic' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST בלבד' });
  try {
    const { code, teacherMonthId, contentType, dataBase64 } = req.body || {};
    if (!code || !teacherMonthId || !dataBase64) {
      return res.status(400).json({ error: 'חסרים פרטים בבקשה' });
    }
    const ext = OK_TYPES[contentType];
    if (!ext) return res.status(400).json({ error: 'סוג הקובץ אינו נתמך — תמונה או PDF בלבד' });

    const sb = db();
    // אימות הקוד — אותו מסלול שהקישור עצמו עובר
    const { data: who, error: whoErr } = await sb.rpc('link_whoami', { p_code: code });
    const pr = Array.isArray(who) ? who[0] : who;
    if (whoErr || !pr?.school_id) return res.status(403).json({ error: 'הקישור אינו תקף' });

    const { data: row } = await sb.from('teacher_months')
      .select('id, school_id, month_key').eq('id', teacherMonthId).maybeSingle();
    if (!row || row.school_id !== pr.school_id) {
      return res.status(403).json({ error: 'השורה אינה שייכת לבית הספר שלך' });
    }

    const buf = Buffer.from(dataBase64, 'base64');
    if (!buf.length || buf.length > MAX_BYTES) {
      return res.status(400).json({ error: 'הקובץ גדול מדי (עד 4MB) או ריק' });
    }

    const path = `${row.month_key}/${row.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from('sick-forms')
      .upload(path, buf, { contentType, upsert: false });
    if (upErr) return res.status(500).json({ error: 'ההעלאה נכשלה: ' + upErr.message });

    return res.status(200).json({ ok: true, path });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
}
