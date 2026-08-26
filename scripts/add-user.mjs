// יצירת משתמש במערכת: חשבון התחברות + פרופיל עם תפקיד.
//
//   node scripts/add-user.mjs <מייל> <שם מלא> <תפקיד> [שם בית הספר]
//
// תפקידים: coordinator (שליח) · clerk (חשבת שכר) · principal (מנהלת) · network (אישור רשתי)
// למנהלת חובה לציין שם בית ספר, בדיוק כפי שהוא רשום במערכת.
//
// הסיסמה הזמנית נוצרת אוטומטית ונכתבת ל-users-created.txt (מוחרג מ-git).
// אין שליחת מייל לאף אחד — את מוסרת את הסיסמה בעצמך.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ROLES = {
  coordinator: 'שליח / מנהל רשת',
  clerk:       'חשבת שכר',
  principal:   'מנהלת בית ספר',
  network:     'אישור רשתי',
};

const [email, fullName, role, schoolName] = process.argv.slice(2);

if (!email || !fullName || !role) {
  console.error('שימוש:  node scripts/add-user.mjs <מייל> <שם מלא> <תפקיד> [בית ספר]');
  console.error('תפקידים: ' + Object.entries(ROLES).map(([k, v]) => `${k} (${v})`).join(' · '));
  process.exit(1);
}
if (!ROLES[role]) {
  console.error(`תפקיד לא מוכר: ${role}. אפשרויות: ${Object.keys(ROLES).join(', ')}`);
  process.exit(1);
}
if (role === 'principal' && !schoolName) {
  console.error('למנהלת חובה לציין שם בית ספר.');
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

// ── בית ספר, אם נדרש ──
let schoolId = null;
if (schoolName) {
  const { data, error } = await admin.from('schools').select('id, name').eq('name', schoolName).maybeSingle();
  if (error) { console.error('שגיאה בחיפוש בית הספר:', error.message); process.exit(1); }
  if (!data) {
    const { data: all } = await admin.from('schools').select('name').order('name');
    console.error(`בית הספר "${schoolName}" לא נמצא. הקיימים:`);
    (all || []).forEach(s => console.error('  · ' + s.name));
    process.exit(1);
  }
  schoolId = data.id;
}

// ── המשתמש קיים כבר? ──
const { data: list } = await admin.auth.admin.listUsers();
const existing = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

let userId, password = null;
if (existing) {
  userId = existing.id;
  console.log(`המשתמש ${email} כבר קיים — מעדכן את הפרופיל בלבד.`);
} else {
  password = crypto.randomBytes(9).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error) { console.error('יצירת המשתמש נכשלה:', error.message); process.exit(1); }
  userId = data.user.id;
}

const { error: pErr } = await admin.from('profiles')
  .upsert({ id: userId, full_name: fullName, role, school_id: schoolId }, { onConflict: 'id' });
if (pErr) { console.error('שמירת הפרופיל נכשלה:', pErr.message); process.exit(1); }

console.log(`\n✓ ${fullName} — ${ROLES[role]}${schoolName ? ' · ' + schoolName : ''}`);
console.log(`  ${email}`);

if (password) {
  const line = `${email}\t${fullName}\t${ROLES[role]}${schoolName ? ' · ' + schoolName : ''}\t${password}\n`;
  fs.appendFileSync('users-created.txt', line, 'utf8');
  console.log(`  סיסמה זמנית נכתבה ל-users-created.txt`);
  console.log(`  מסרי אותה ל${fullName} ובקשי שתחליף אותה בכניסה הראשונה.`);
}
