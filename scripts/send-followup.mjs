/*
  תזכורת למנהלות שקיבלו קישור וטרם מילאו, ועדכון שטלפון ומייל הפכו לחובה.

    node scripts/send-followup.mjs            → הרצה יבשה
    node scripts/send-followup.mjs --send     → שליחה בפועל
    node scripts/send-followup.mjs --only "רחלי אדר"

  ההבדל מ-send-links: כאן לא מונפק קישור חדש. הקישור שבידיהן עובד,
  והנפקה מחדש הייתה מבטלת אותו ושולחת אותן לחפש הודעה חדשה.

  מי מקבלת: מי שיש לה קישור פעיל, ועדיין לא הזינה ולו עובד/ת הוראה אחת,
  או שהזינה בלי טלפון ומייל. מי שסיימה אינה מקבלת תזכורת.
*/
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const INSTANCE = env.GREENAPI_INSTANCE, TOKEN = env.GREENAPI_TOKEN;
const BASE = `${env.GREEN_API_URL || 'https://api.green-api.com'}/waInstance${INSTANCE}`;
const APP  = env.VITE_APP_URL || 'https://salary-schools.vercel.app';

const args = process.argv.slice(2);
const SEND = args.includes('--send');
const oi = args.indexOf('--only');
const ONLY = oi !== -1 ? args[oi + 1] : null;

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chatId = p => `${String(p).replace(/\D/g, '')}@c.us`;
const local  = p => String(p).replace(/\D/g, '').replace(/^972/, '0');

// ההודעה קצרה בכוונה: היא לא מחליפה את הראשונה אלא מוסיפה עליה.
const message = (name, link, started) => {
  const first = (name || '').split(' ')[0];
  const opening = started
    ? 'התחלת למלא — תודה. נשאר להשלים פרט אחד:'
    : 'תזכורת קטנה לגבי הקישור למילוי נתוני עובדי ההוראה, ועדכון אחד:';
  const tail = started
    ? '\n\nהקישור נפתח על מה שכבר הזנת — אפשר להשלים רק את מה שחסר.'
    : '';
  return `שלום ${first},

${opening}

*טלפון ומייל של כל עובד/ת הוראה הם עכשיו שדות חובה.* דרכם נשלחים נתוני ההעסקה לחתימה, ובלעדיהם אי אפשר לסגור את החודש.${tail}

*הקישור שלך:*
${link}

זה אותו קישור מקודם, הוא עדיין עובד.

תודה,
רשת חינוך חב"ד`;
};

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

// ── מי צריכה תזכורת ───────────────────────────────────────────
const { data: principals } = await admin.from('profiles')
  .select('id, full_name, phone, gender, school_id, schools(name)')
  .eq('role', 'principal').order('full_name');
const { data: links } = await admin.from('access_links').select('code, profile_id, revoked');
const { data: rows }  = await admin.from('teacher_months').select('school_id, phone, email');

const need = [];
for (const p of principals || []) {
  if (!p.schools?.name || !p.phone) continue;
  const link = (links || []).find(l => l.profile_id === p.id && !l.revoked);
  if (!link) continue;                                    // לא נשלח לה קישור מעולם
  const mine = (rows || []).filter(r => r.school_id === p.school_id);
  const missing = mine.filter(r => !String(r.phone || '').trim() || !String(r.email || '').trim()).length;
  if (mine.length && !missing) continue;                  // סיימה — לא מטרידים
  need.push({ ...p, code: link.code, started: mine.length > 0, rows: mine.length, missing });
}

let list = ONLY ? need.filter(p => p.full_name?.includes(ONLY)) : need;
if (!list.length) { console.log('אין למי לשלוח — כולן מילאו, או שאין קישור פעיל.'); process.exit(0); }

console.log(SEND ? '── שליחה בפועל ──\n' : '── הרצה יבשה (בלי --send לא נשלח דבר) ──\n');

const done = (principals || []).filter(p => {
  const mine = (rows || []).filter(r => r.school_id === p.school_id);
  return mine.length && !mine.some(r => !String(r.phone || '').trim() || !String(r.email || '').trim());
});
if (done.length) console.log('סיימו, לא יקבלו תזכורת: ' + done.map(p => p.full_name).join(', ') + '\n');

if (SEND && (!INSTANCE || !TOKEN)) { console.error('חסרים פרטי Green API ב-.env.local.'); process.exit(1); }
if (SEND) {
  process.stdout.write('ממתין שחשבון הוואטסאפ יתעורר… ');
  const phone = await waitReady();
  if (!phone) { console.error('\nהחשבון לא התחבר תוך שתי דקות.'); process.exit(1); }
  console.log(`מחובר, שולח מ-${local(phone)}\n`);
}

const log = [];
for (const [i, p] of list.entries()) {
  const state = p.started ? `${p.rows} שורות, ${p.missing} חסרות קשר` : 'טרם הזינה';
  const line = `${p.full_name} · ${p.schools.name} · ${local(p.phone)} · ${state}`;
  if (!SEND) {
    console.log(`${i + 1}. ${line}`);
    if (i === 0 || ONLY) console.log('\n' + message(p.full_name, `${APP}/?k=${p.code}`, p.started) + '\n');
    continue;
  }
  try {
    const has = await post('checkWhatsapp', { phoneNumber: Number(String(p.phone).replace(/\D/g, '')) });
    if (has?.existsWhatsapp !== true) { console.log(`✗ ${line} — אין חשבון וואטסאפ`); continue; }
    const res = await post('sendMessage', { chatId: chatId(p.phone),
      message: message(p.full_name, `${APP}/?k=${p.code}`, p.started) });
    console.log(`✓ ${line} — נשלח (${res.idMessage})`);
    log.push({ at: new Date().toISOString(), name: p.full_name, phone: local(p.phone), idMessage: res.idMessage });
  } catch (e) { console.log(`✗ ${line} — ${e.message}`); }
  if (i < list.length - 1) await sleep(1100);
}

if (log.length) {
  fs.appendFileSync('outgoing-links.log', log.map(x => JSON.stringify(x)).join('\n') + '\n');
  console.log(`\n${log.length} נשלחו. נרשם ל-outgoing-links.log`);
}
