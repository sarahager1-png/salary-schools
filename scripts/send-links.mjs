/*
  שליחת הקישור האישי למנהלות בוואטסאפ, דרך Green API.

    node scripts/send-links.mjs              → הרצה יבשה: מה יישלח, למי, ומה ההודעה
    node scripts/send-links.mjs --send       → שליחה בפועל
    node scripts/send-links.mjs --only "רחלי אדר"   → מנהלת אחת

  ברירת המחדל היא הרצה יבשה בכוונה. כל קישור הוא מפתח כניסה: מי
  שמחזיק בו נכנס בשם המנהלת ורואה את נתוני השכר של בית הספר שלה.
  שליחה למספר שגוי אינה טעות שאפשר לתקן אחר כך.

  מה שנעשה לפני כל שליחה:
  · המספר נבדק מול וואטסאפ — מספר בלי חשבון לא מקבל הודעה שנעלמת
  · מונפק קישור חדש והקודם מתבטל, כדי שלא יסתובבו שני קישורים
  · שנייה בין הודעות (Green API מגביל להודעה בשנייה)
  · כל שליחה נרשמת ל-outgoing-links.log, עם הזמן ומזהה ההודעה
*/
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));

const INSTANCE = env.GREENAPI_INSTANCE;
const TOKEN    = env.GREENAPI_TOKEN;
const API      = env.GREEN_API_URL || 'https://api.green-api.com';
const BASE     = `${API}/waInstance${INSTANCE}`;
const APP      = env.VITE_APP_URL || 'https://salary-schools.vercel.app';

const args  = process.argv.slice(2);
const SEND  = args.includes('--send');
const onlyI = args.indexOf('--only');
const ONLY  = onlyI !== -1 ? args[onlyI + 1] : null;

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const makeCode = () => Array.from(crypto.randomBytes(20)).map(b => ALPHABET[b % ALPHABET.length]).join('');
const chatId   = phone => `${String(phone).replace(/\D/g, '')}@c.us`;
const local    = phone => String(phone).replace(/\D/g, '').replace(/^972/, '0');

/*
  ההודעה. חתומה בשם הרשת ולא בשם אדם — היא נשלחת ממספר הרשת, ושם
  פרטי בסופה הופך אותה לאישית יותר ממה שהיא.

  מה שמופנה אל המקבל/ת — לפי המין שרשום בפרופיל. בעפולה המנהל גבר,
  והודעה שכתובה כולה בנקבה אומרת לו, בלי לומר זאת, שהיא לא נכתבה
  בשבילו. מה שמתאר את הצוות נשאר בשם עצם או בצורה כפולה: הוא מעורב.
*/
const message = (name, school, link, male) => {
  const first = (name || '').split(' ')[0];
  return `שלום ${first},

הרשת עוברת למערכת אחת לניהול שכר עובדי ההוראה במוכש"ר, וזה הקישור האישי שלך ל${school}.

*מה צריך למלא:*
לכל עובד/ת הוראה — *כולל אותך* — שם, ת.ז., *טלפון ומייל*, מסלול (אופק חדש / עולם ישן), תואר, דרגה, ותק ושעות פרונטליות. אחוז המשרה מחושב לבד.
הטלפון והמייל הם חובה — דרכם נשלחים נתוני ההעסקה לחתימה.
יציאה לחל"ד — יש בורר סטטוס עם תאריך.

*חשוב:* ${male ? 'הצמד' : 'הצמדי'} למספר השעות שאושר בבניית התקציב.

*הקישור:*
${link}

אין צורך בסיסמה — הקישור נכנס ישירות. הוא אישי, אז נא לא להעביר אותו הלאה.
אפשר לפתוח מהטלפון, ולחזור ולעדכן בכל שלב.

בכל שאלה — אני כאן.

תודה,
רשת חינוך חב"ד`;
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/*
  המופע נרדם כשלא משתמשים בו ומתעורר לאט. getStateInstance יכול לומר
  authorized בזמן שהסשן עצמו עוד starting, ולהיפך — ולכן נבדקים שניהם,
  וכל קריאה חוזרת על עצמה כשהתשובה היא "מתעורר" ולא כישלון אמיתי.
*/
const WAKING = /instance is starting|not authorized|starting/i;

const post = async (path, body, tries = 4) => {
  for (let n = 1; ; n++) {
    const r = await fetch(`${BASE}/${path}/${TOKEN}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const text = await r.text();
    if (r.ok) return JSON.parse(text);
    if (n >= tries || !WAKING.test(text)) throw new Error(`${path} → ${r.status} ${text.slice(0, 120)}`);
    await sleep(n * 4000);
  }
};

// ממתין שגם ה-API וגם הסשן יהיו מוכנים
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

// ── מי מקבלת ──────────────────────────────────────────────────
const { data: principals, error } = await admin
  .from('profiles')
  .select('id, full_name, phone, gender, schools(name)')
  .eq('role', 'principal')
  .order('full_name');
if (error) { console.error('טעינת המנהלות נכשלה:', error.message); process.exit(1); }

let list = (principals || []).filter(p => p.schools?.name);
if (ONLY) list = list.filter(p => p.full_name?.includes(ONLY));
if (!list.length) { console.error(ONLY ? `לא נמצאה מנהלת בשם "${ONLY}"` : 'אין מנהלות'); process.exit(1); }

const noPhone = list.filter(p => !p.phone);
// בשליחה בפועל מדלגים על מי שאין לו טלפון; בהרצה יבשה מציגים גם אותו,
// אחרת אי אפשר לראות את הנוסח שהוא היה מקבל.
if (SEND) list = list.filter(p => p.phone);

console.log(SEND ? '── שליחה בפועל ──\n' : '── הרצה יבשה (בלי --send לא נשלח דבר) ──\n');
if (noPhone.length) {
  console.log('ללא טלפון, לא יקבלו:');
  for (const p of noPhone) console.log(`  · ${p.full_name} — ${p.schools.name}`);
  console.log('');
}

if (SEND && (!INSTANCE || !TOKEN)) {
  console.error('חסרים GREENAPI_INSTANCE / GREENAPI_TOKEN ב-.env.local. בלעדיהם אי אפשר לשלוח.');
  process.exit(1);
}

if (SEND) {
  process.stdout.write('ממתין שחשבון הוואטסאפ יתעורר… ');
  const phone = await waitReady();
  if (!phone) {
    console.error('\nהחשבון לא התחבר תוך שתי דקות. יש לוודא בקונסולה של Green API שהמכשיר מקושר.');
    process.exit(1);
  }
  console.log(`מחובר, שולח מ-${String(phone).replace(/^972/, '0')}\n`);
}

// ── שליחה ─────────────────────────────────────────────────────
const log = [];
for (const [i, p] of list.entries()) {
  const school = p.schools.name;
  let line = `${p.full_name} · ${school} · ${p.phone ? local(p.phone) : '—'}`;

  if (!SEND) {
    console.log(`${i + 1}. ${line}${p.phone ? '' : '   ← אין טלפון, לא יקבל/ת'}`);
    if (i === 0 || ONLY) console.log('\n' + message(p.full_name, school, `${APP}/?k=<קוד אישי>`, p.gender === 'm') + '\n');
    continue;
  }

  try {
    const has = await post('checkWhatsapp', { phoneNumber: Number(String(p.phone).replace(/\D/g, '')) });
    if (has?.existsWhatsapp !== true) { console.log(`✗ ${line} — אין חשבון וואטסאפ למספר הזה`); continue; }

    await admin.from('access_links').update({ revoked: true }).eq('profile_id', p.id);
    const code = makeCode();
    const { error: le } = await admin.from('access_links').insert({ code, profile_id: p.id, revoked: false });
    if (le) { console.log(`✗ ${line} — יצירת הקישור נכשלה: ${le.message}`); continue; }

    const res = await post('sendMessage', { chatId: chatId(p.phone), message: message(p.full_name, school, `${APP}/?k=${code}`, p.gender === 'm') });
    console.log(`✓ ${line} — נשלח (${res.idMessage})`);
    log.push({ at: new Date().toISOString(), name: p.full_name, school, phone: local(p.phone), idMessage: res.idMessage });
  } catch (e) {
    console.log(`✗ ${line} — ${e.message}`);
  }

  if (i < list.length - 1) await sleep(1100);   // הודעה בשנייה
}

if (SEND && log.length) {
  fs.appendFileSync('outgoing-links.log', log.map(x => JSON.stringify(x)).join('\n') + '\n', 'utf8');
  console.log(`\n${log.length} נשלחו. נרשם ל-outgoing-links.log`);
} else if (!SEND) {
  console.log(`\n${list.filter(p => p.phone).length} מקבלים/ות. להרצה אמיתית: node scripts/send-links.mjs --send`);
}
