/*
  שליחת וואטסאפ דרך Green API.

  הקו הוא של שרה — "הקו של השביל", מופע 7107618754, מספר 050-333-9770
  (הכרעת שרה, 3.9; החליף את מופע 710722721038 / 053-327-7014, שהתברר
  כקו של חגים ונהנים). מופעים מקבלים host משלהם, ולכן GREEN_API_URL
  ולא הכתובת הכללית; בלעדיו כל השליחות נכשלות בשקט.

  בלי פרטי חיבור לא נשלח דבר והתור נשאר ממתין — הודעה לא נמחקת ולא
  נשלחת למספר שגוי.
*/
export function normalizePhone(phone) {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('972')) return d;
  if (d.startsWith('0')) return '972' + d.slice(1);
  return '972' + d;
}

export function credentials() {
  const id = process.env.GREEN_API_INSTANCE_ID;
  const token = process.env.GREEN_API_TOKEN;
  const base = (process.env.GREEN_API_URL || 'https://api.green-api.com').replace(/\/+$/, '');
  return id && token ? { id, token, base } : null;
}

export async function sendWhatsApp(phone, message) {
  const c = credentials();
  if (!c) throw new Error('חסרים פרטי Green API');
  const chatId = `${normalizePhone(phone)}@c.us`;
  const res = await fetch(`${c.base}/waInstance${c.id}/sendMessage/${c.token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`green-api ${res.status}: ${text.slice(0, 160)}`);
  return text;
}
