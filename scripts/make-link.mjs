// יצירת קישור אישי למנהלת בית ספר — נכנסת בלי מייל ובלי סיסמה.
//
//   node scripts/make-link.mjs "<שם מלא>" "<בית ספר>" [--base https://...]
//   node scripts/make-link.mjs --list
//   node scripts/make-link.mjs --revoke <קוד>
//
// הקוד הוא 20 תווים אקראיים (כ-100 ביט). הוא כל ההגנה על הקישור, ולכן
// הוא חייב להיות ארוך מספיק כדי שלא יהיה אפשר לנחש אותו בניסיונות.
// אין שליחה לאף אחת — הקישור מודפס כאן ואת שולחת אותו.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';   // בלי תווים שמתבלבלים
const makeCode = () => Array.from(crypto.randomBytes(20))
  .map(b => ALPHABET[b % ALPHABET.length]).join('');

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE = baseIdx !== -1 ? args[baseIdx + 1] : (env.VITE_APP_URL || 'http://localhost:5190');
// כש---base אינו נתון, baseIdx הוא -1 ו-baseIdx+1 הוא 0 — מה שסינן בטעות
// את הארגומנט הראשון. הסינון תקף רק כשהדגל באמת קיים.
const clean = baseIdx === -1 ? args : args.filter((_, i) => i !== baseIdx && i !== baseIdx + 1);

// ── רשימה ──
if (clean.includes('--list')) {
  const { data } = await admin.from('access_links')
    .select('code, revoked, last_used_at, profiles(full_name, role, schools(name))');
  if (!data?.length) { console.log('אין קישורים.'); process.exit(0); }
  for (const l of data) {
    const p = l.profiles || {};
    console.log(`${l.revoked ? '✗' : '✓'} ${(p.full_name || '').padEnd(18)} ${(p.schools?.name || '').padEnd(20)}`);
    console.log(`   ${BASE}/?k=${l.code}`);
    console.log(`   ${l.last_used_at ? 'נכנסה לאחרונה: ' + new Date(l.last_used_at).toLocaleString('he-IL') : 'טרם נכנסה'}\n`);
  }
  process.exit(0);
}

// ── ביטול ──
const revIdx = clean.indexOf('--revoke');
if (revIdx !== -1) {
  const code = clean[revIdx + 1];
  if (!code) { console.error('שימוש: --revoke <קוד>'); process.exit(1); }
  const { error } = await admin.from('access_links').update({ revoked: true }).eq('code', code);
  if (error) { console.error('הביטול נכשל:', error.message); process.exit(1); }
  console.log('הקישור בוטל. מי שיפתח אותו לא ייכנס.');
  process.exit(0);
}

// ── יצירה ──
const [fullName, schoolName] = clean;
if (!fullName || !schoolName) {
  console.error('שימוש: node scripts/make-link.mjs "<שם מלא>" "<בית ספר>"');
  console.error('       node scripts/make-link.mjs --list');
  console.error('       node scripts/make-link.mjs --revoke <קוד>');
  process.exit(1);
}

const { data: school } = await admin.from('schools').select('id, name').eq('name', schoolName).maybeSingle();
if (!school) {
  const { data: all } = await admin.from('schools').select('name').order('name');
  console.error(`בית הספר "${schoolName}" לא נמצא. הקיימים:`);
  (all || []).forEach(s => console.error('  · ' + s.name));
  process.exit(1);
}

// מנהלת בקישור אינה זקוקה למייל אמיתי. הכתובת היא מזהה פנימי בלבד,
// ולא נשלח אליה דבר — הכניסה היא דרך הקישור.
const localId = 'link-' + crypto.randomBytes(6).toString('hex') + '@link.local';

const { data: list } = await admin.auth.admin.listUsers();
const existingProfile = (await admin.from('profiles').select('id, full_name, school_id')
  .eq('full_name', fullName).eq('school_id', school.id).maybeSingle()).data;

let profileId;
if (existingProfile) {
  profileId = existingProfile.id;
  console.log(`${fullName} כבר במערכת — מנפיק לה קישור חדש.`);
} else {
  const { data, error } = await admin.auth.admin.createUser({ email: localId, email_confirm: true });
  if (error) { console.error('יצירת המשתמשת נכשלה:', error.message); process.exit(1); }
  profileId = data.user.id;
  const { error: pErr } = await admin.from('profiles')
    .insert({ id: profileId, full_name: fullName, role: 'principal', school_id: school.id });
  if (pErr) { console.error('יצירת הפרופיל נכשלה:', pErr.message); process.exit(1); }
}

// קישור קודם מתבטל, כדי שלא יישארו שני קישורים פעילים לאותה מנהלת
await admin.from('access_links').update({ revoked: true }).eq('profile_id', profileId);

const code = makeCode();
const { error: lErr } = await admin.from('access_links').insert({ code, profile_id: profileId });
if (lErr) { console.error('יצירת הקישור נכשלה:', lErr.message); process.exit(1); }

console.log(`\n✓ ${fullName} — ${school.name}\n`);
console.log(`${BASE}/?k=${code}\n`);
console.log('שלחי לה את הקישור בוואטסאפ. הוא אישי — מי שמחזיק בו נכנס בשמה.');
if (!existingProfile) console.log('אם היה לה קישור קודם, הוא בוטל.');
