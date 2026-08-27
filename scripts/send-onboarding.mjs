/*
  שליחת קישורי הקליטה לעובדות ההוראה בוואטסאפ — טופס 101, מסמכים וחוזה.

    node scripts/send-onboarding.mjs            → הרצה יבשה: מי, מה, והנוסח
    node scripts/send-onboarding.mjs --send     → שליחה בפועל
    node scripts/send-onboarding.mjs --only "שם"

  ברירת המחדל יבשה בכוונה. שום דבר לא נשלח לאדם אמיתי בלי אישור מפורש
  של שרה. הקישורים נוצרים מראש בלוח "קליטה" שבמערכת.
*/
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const INSTANCE = env.GREENAPI_INSTANCE, TOKEN = env.GREENAPI_TOKEN;
const BASE = `${env.GREEN_API_URL || 'https://api.green-api.com'}/waInstance${INSTANCE}`;
const APP  = env.VITE_APP_URL || 'https://salary-schools.vercel.app';
const DEADLINE = 'יום ראשון, 6.9.2026';

const args = process.argv.slice(2);
const SEND = args.includes('--send');
const oi = args.indexOf('--only');
const ONLY = oi !== -1 ? args[oi + 1] : null;

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chatId = p => `${String(p).replace(/\D/g, '').replace(/^0/, '972')}@c.us`;
const local  = p => String(p).replace(/\D/g, '').replace(/^972/, '0');

const message = (name, link) => `שלום ${String(name || '').split(' ')[0]},

לקראת תשלום משכורת ספטמבר, רשת חינוך חב"ד מרכזת את מסמכי ההעסקה במקום אחד. זהו הקישור האישי שלך:

${link}

*מה ממלאים שם (כ-10 דקות):*
1. טופס 101 — כרטיס עובד, עם חתימה דיגיטלית
2. צילום תעודת זהות
3. טופס נתוני שכר ממשרד החינוך
4. אסמכתת תיק במשרד החינוך (חובה)
5. חתימה על חוזה ההעסקה — יעלה בהמשך, תגיעי שוב לאותו קישור

*חשוב: יש להשלים עד ${DEADLINE}.*
רק מי שתשלים את כל השלבים עד למועד תקבל משכורת על חודש ספטמבר.

הקישור אישי — נא לא להעביר.
בכל שאלה אפשר לפנות לשרה הגר.

רשת חינוך חב"ד`;

const post = async (path, body) => {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${BASE}/${path}/${TOKEN}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const t = await r.text();
    if (r.ok) return JSON.parse(t);
    if (/starting/i.test(t) && i < 2) { await sleep(8000); continue; }
    throw new Error(`${r.status} ${t.slice(0, 120)}`);
  }
};
const waitReady = async (seconds = 120) => {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const [st, wa] = await Promise.all([
      fetch(`${BASE}/getStateInstance/${TOKEN}`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE}/getWaSettings/${TOKEN}`).then(r => r.json()).catch(() => ({})),
    ]);
    if (st.stateInstance === 'authorized' && wa.stateInstance === 'authorized' && wa.phone) return wa.phone;
    if (Date.now() > until) return null;
    await sleep(5000);
  }
};

const { data: all, error } = await admin.from('teacher_onboarding')
  .select('name, phone, code, revoked, schools(name)').order('name');
if (error) { console.error('טעינה נכשלה:', error.message); process.exit(1); }

let list = (all || []).filter(r => !r.revoked);
if (ONLY) list = list.filter(r => r.name?.includes(ONLY));
const noPhone = list.filter(r => !r.phone);
if (SEND) list = list.filter(r => r.phone);

console.log(SEND ? '── שליחה בפועל ──\n' : '── הרצה יבשה (בלי --send לא נשלח דבר) ──\n');
if (noPhone.length) {
  console.log('ללא טלפון, לא יקבלו: ' + noPhone.map(r => `${r.name} (${r.schools?.name})`).join(' · ') + '\n');
}
if (!list.length) { console.log('אין קישורים. יש ליצור קודם בלוח "קליטה" שבמערכת.'); process.exit(0); }

if (SEND && (!INSTANCE || !TOKEN)) { console.error('חסרים פרטי Green API.'); process.exit(1); }
if (SEND) {
  process.stdout.write('ממתין שחשבון הוואטסאפ יתעורר… ');
  const phone = await waitReady();
  if (!phone) { console.error('\nהחשבון לא התחבר.'); process.exit(1); }
  console.log(`מחובר, שולח מ-${local(phone)}\n`);
}

const log = [];
for (const [i, r] of list.entries()) {
  const line = `${r.name} · ${r.schools?.name} · ${r.phone ? local(r.phone) : '—'}`;
  if (!SEND) {
    console.log(`${i + 1}. ${line}`);
    if (i === 0 || ONLY) console.log('\n' + message(r.name, `${APP}/?f=${r.code}`) + '\n');
    continue;
  }
  try {
    const has = await post('checkWhatsapp', { phoneNumber: Number(String(r.phone).replace(/\D/g, '').replace(/^0/, '972')) });
    if (has?.existsWhatsapp !== true) { console.log(`✗ ${line} — אין וואטסאפ למספר`); continue; }
    const res = await post('sendMessage', { chatId: chatId(r.phone), message: message(r.name, `${APP}/?f=${r.code}`) });
    console.log(`✓ ${line} — נשלח (${res.idMessage})`);
    log.push({ at: new Date().toISOString(), name: r.name, phone: local(r.phone), idMessage: res.idMessage });
  } catch (e) { console.log(`✗ ${line} — ${e.message}`); }
  if (i < list.length - 1) await sleep(1100);
}
if (log.length) {
  fs.appendFileSync('outgoing-links.log', log.map(x => JSON.stringify(x)).join('\n') + '\n');
  console.log(`\n${log.length} נשלחו. נרשם ל-outgoing-links.log`);
}
