/*
  תזכורת לקישור הקליטה — רק למי שלא פתח/ה את הקישור.

    node scripts/resend-unopened.mjs             → הרצה יבשה: מי, כמה, והנוסח
    node scripts/resend-unopened.mjs --queue     → הכנסה לתור notifications (השליחה דרך cron queue-drain)

  רקע (7.9.2026): שליחת 6.9 יצאה ל-88 עובדי הוראה תוך שתי דקות מקו 050-333-9770,
  ובאותו יום וואטסאפ הגביל את המספר. 61 מעולם לא פתחו את הקישור. לכן כאן:
  קבוצות קטנות עם מרווח (BATCH כל GAP_MIN דקות) ולא הכול בבת אחת.
  לפני --queue: לוודא ש-GREEN_API_INSTANCE_ID בפרודקשן מצביע על מופע authorized.
*/
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const SITE = 'https://salary-schools.vercel.app';
const MONTH = '2026-09';
const KIND = 'teacher_forms_reminder';
const DEADLINE = process.env.DEADLINE || 'יום חמישי, 10.9';
const BATCH = Number(process.env.BATCH || 10);
const GAP_MIN = Number(process.env.GAP_MIN || 20);
const START = process.env.START ? new Date(process.env.START) : new Date(Date.now() + 2 * 60000);
const QUEUE = process.argv.includes('--queue');

const body = (name, code) =>
  `${name}, שלום.\n` +
  `נשלח לך קישור אישי להשלמת מסמכי ההעסקה (טופס 101, נתוני העסקה והסכם) — ייתכן שלא הגיע.\n` +
  `הנה הקישור שוב, כמה דקות:\n${SITE}/?f=${code}\n\n` +
  `*ההגשה עד ${DEADLINE}.*\n` +
  `השכר בחודש הבא ישולם רק למי שהשלים/ה את ההגשה.`;

const { data: ob, error } = await sb.from('teacher_onboarding')
  .select('id, name, phone, code, last_used_at, revoked, schools(name)').order('name');
if (error) { console.error(error.message); process.exit(1); }
const { data: already } = await sb.from('notifications').select('to_phone').eq('kind', KIND).eq('month_key', MONTH);
const sentSet = new Set((already || []).map(n => n.to_phone));

const list = (ob || []).filter(o => !o.revoked && !o.last_used_at && o.phone && o.code && !sentSet.has(o.phone));
console.log(`${QUEUE ? 'הכנסה לתור' : 'הרצה יבשה'} — ${list.length} עובדי הוראה שלא פתחו את הקישור, ${BATCH} כל ${GAP_MIN} דק׳ החל מ-${START.toLocaleString('he-IL')}\n`);
const queue = list.map((o, i) => ({
  kind: KIND, to_phone: o.phone, to_name: o.name, month_key: MONTH,
  send_after: new Date(START.getTime() + Math.floor(i / BATCH) * GAP_MIN * 60000).toISOString(),
  body: body(o.name, o.code),
}));
for (const [i, q] of queue.entries()) console.log(`${i + 1}. ${q.to_name} · ${list[i].schools?.name} · ${q.to_phone} · ${new Date(q.send_after).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`);
if (queue.length) console.log('\n--- הנוסח (הראשון) ---\n' + queue[0].body + '\n');
if (!QUEUE || !queue.length) process.exit(0);

const { error: e2 } = await sb.from('notifications').insert(queue);
if (e2) { console.error('הכנסת התור נכשלה:', e2.message); process.exit(1); }
console.log(`נכנסו לתור: ${queue.length}. השליחה מה-cron לפי send_after.`);
