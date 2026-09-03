/*
  שליחת קישורי הקליטה לכל עובדי ההוראה — הוראת שרה (3.9.2026):
  "תשלח לכל העובדים והעובדות מחר ב-8 בבוקר... הגשה עד ה-8.9",
  מקו מערכת השיבוץ (0503339770, מופע 7107618754) — שהוא הקו המוגדר
  בפרודקשן של מערכת השכר.

  המנגנון: הסקריפט מכניס את ההודעות לתור notifications (kind
  teacher_forms), וה-cron queue-drain של Vercel (רץ כל דקה) שולח
  אותן מהקו — אותו מסלול בדיוק כמו כפתור "שליחה לעובדי ההוראה" באתר.
  ההבדל היחיד: כאן נשלח לכל העובדים הפעילים, לא רק למאושרים.

  הנוסח — כפי שאושר בצ'אט, זהה למוטמע במסך השליחה.
*/
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

const DIR = 'C:/tmp/work/salary-schools';
const MARKER = `${DIR}/.onboarding-all-sent-2026-09-04`;
const LOG = `${DIR}/onboarding-send.log`;
const SITE = 'https://salary-schools.vercel.app';
const MONTH = '2026-09';
const log = (m) => { const line = `[${new Date().toLocaleString('he-IL')}] ${m}`; console.log(line); appendFileSync(LOG, line + '\n'); };

const env = Object.fromEntries(readFileSync(`${DIR}/.env.local`, 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const obCode = () => [...crypto.getRandomValues(new Uint8Array(10))].map(b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');

const body = (name, code) =>
  `${name}, שלום.\n` +
  `כדי שהשכר ייצא בחודש הבא צריך להשלים את הפרטים: טופס 101, נתוני העסקה והסכם העסקה.\n` +
  `הכול בקישור אישי אחד, כמה דקות:\n${SITE}/?f=${code}\n\n` +
  `*ההגשה עד יום שלישי, 8.9.*\n` +
  `השכר בחודש הבא ישולם רק למי שהשלים/ה את ההגשה.`;

if (existsSync(MARKER)) { log('כבר נשלח — הסמן קיים.'); process.exit(0); }

const { data: rows } = await sb.from('teacher_months')
  .select('id, name, tz_id, phone, leave_type').eq('month_key', MONTH);
const all = (rows || []).filter(r => r.name && r.leave_type !== 'unpaid');
const { data: ob } = await sb.from('teacher_onboarding').select('id, tz_id, name, code, form101_signed_at');
const byKey = new Map((ob || []).map(o => [o.tz_id || o.name, o]));
const { data: already } = await sb.from('notifications')
  .select('teacher_id').eq('kind', 'teacher_forms').eq('month_key', MONTH);
const sentSet = new Set((already || []).map(n => n.teacher_id));

writeFileSync(MARKER, new Date().toISOString());
const queue = []; let done = 0, noPhone = 0;
for (const t of all) {
  if (sentSet.has(t.id)) continue;
  let rec = byKey.get(t.tz_id || t.name);
  if (rec?.form101_signed_at) { done++; continue; }
  if (!t.phone) { noPhone++; log(`בלי נייד: ${t.name}`); continue; }
  if (!rec) {
    const { data: made, error } = await sb.from('teacher_onboarding')
      .insert({ name: t.name, tz_id: t.tz_id, phone: t.phone, code: obCode() }).select('code').single();
    if (error) { log(`✗ יצירת קישור נכשלה: ${t.name} — ${error.message}`); continue; }
    rec = made;
  }
  if (!rec?.code) continue;
  queue.push({ kind: 'teacher_forms', to_phone: t.phone, to_name: t.name,
    month_key: MONTH, teacher_id: t.id, body: body(t.name, rec.code) });
}
if (queue.length) {
  const { error } = await sb.from('notifications').insert(queue);
  if (error) { log(`✗ הכנסת התור נכשלה: ${error.message}`); process.exit(1); }
}
log(`נכנסו לתור: ${queue.length} · כבר השלימו: ${done} · בלי נייד: ${noPhone}`);

// סיכום לשרה מהקו (השליחות עצמן יוצאות מה-cron תוך דקות)
const b = `${env.GREENAPI_API_URL.replace(/\/$/, '')}/waInstance${env.GREENAPI_INSTANCE}`;
await fetch(`${b}/sendMessage/${env.GREENAPI_TOKEN}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chatId: '972503339770@c.us',
    message: `בוקר טוב שרה 🌅\nקישורי הקליטה נכנסו לתור השליחה: ${queue.length} עובדי הוראה (ההודעות יוצאות מקו מערכת השיבוץ תוך דקות).` +
      (noPhone ? `\nבלי נייד: ${noPhone}` : '') + `\nמעקב: מסך ההתראות במערכת השכר.` }),
});
