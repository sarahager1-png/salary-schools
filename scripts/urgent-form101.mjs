/*
  הודעה דחופה לכל עובד/ת הוראה שטרם מילא/ה טופס 101 (לא חתם/ה בקישור ולא הועלה טופס סרוק).

    node scripts/urgent-form101.mjs            → הרצה יבשה: מי, כמה, והנוסח
    node scripts/urgent-form101.mjs --queue    → הכנסה לתור notifications (השליחה דרך cron queue-drain)

  כמו resend-unopened: קבוצות קטנות עם מרווח, כדי שוואטסאפ לא יגביל את הקו.
*/
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const SITE = 'https://salary-schools.vercel.app';
const MONTH = '2026-09';
const KIND = 'form101_urgent';
const BATCH = Number(process.env.BATCH || 10);
const GAP_MIN = Number(process.env.GAP_MIN || 15);
const START = process.env.START ? new Date(process.env.START) : new Date(Date.now() + 2 * 60000);
const QUEUE = process.argv.includes('--queue');

const body = (name, code) =>
  `${name}, שלום.\n` +
  `*דחוף — טופס 101 שלך עדיין לא מולא.*\n` +
  `בלי טופס 101 אי אפשר לחשב את השכר, והמס ינוכה בשיעור המרבי.\n\n` +
  `זה לוקח כמה דקות, בקישור האישי שלך:\n${SITE}/?f=${code}\n\n` +
  `תודה,\nרשת חינוך חב"ד`;

const { data: ob, error } = await sb.from('teacher_onboarding')
  .select('id, name, phone, code, revoked, form101_signed_at, form101_file_path, last_used_at, schools(name)').order('name');
if (error) { console.error(error.message); process.exit(1); }
const { data: already } = await sb.from('notifications').select('to_phone').eq('kind', KIND).eq('month_key', MONTH);
const sentSet = new Set((already || []).map(n => n.to_phone));

const active = (ob || []).filter(o => !o.revoked);
const missing = active.filter(o => !o.form101_signed_at && !o.form101_file_path);
const noPhone = missing.filter(o => !o.phone || !o.code);
const list = missing.filter(o => o.phone && o.code && !sentSet.has(o.phone));

console.log(`${QUEUE ? 'הכנסה לתור' : 'הרצה יבשה'} — ${active.length} פעילים, ${active.length - missing.length} מילאו 101, ${missing.length} לא מילאו`);
console.log(`יקבלו הודעה: ${list.length}${sentSet.size ? ` (כבר נשלח קודם: ${sentSet.size})` : ''}${noPhone.length ? ` · בלי טלפון/קישור: ${noPhone.length}` : ''}`);
console.log(`${BATCH} כל ${GAP_MIN} דק׳ החל מ-${START.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}\n`);

const queue = list.map((o, i) => ({
  kind: KIND, to_phone: o.phone, to_name: o.name, month_key: MONTH,
  send_after: new Date(START.getTime() + Math.floor(i / BATCH) * GAP_MIN * 60000).toISOString(),
  body: body(o.name, o.code),
}));
for (const [i, q] of queue.entries()) console.log(`${i + 1}. ${q.to_name} · ${list[i].schools?.name} · ${q.to_phone} · ${list[i].last_used_at ? 'פתח/ה קישור' : 'לא פתח/ה'} · ${new Date(q.send_after).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}`);
if (noPhone.length) console.log('\nבלי טלפון או קישור (לא יקבלו): ' + noPhone.map(o => `${o.name} (${o.schools?.name})`).join(', '));
if (queue.length) console.log('\n--- הנוסח (הראשון) ---\n' + queue[0].body + '\n');
if (!QUEUE || !queue.length) process.exit(0);

const { error: e2 } = await sb.from('notifications').insert(queue);
if (e2) { console.error('הכנסת התור נכשלה:', e2.message); process.exit(1); }
console.log(`נכנסו לתור: ${queue.length}. השליחה מה-cron לפי send_after.`);
