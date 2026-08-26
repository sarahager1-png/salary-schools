// זריעת תשעת בתי הספר של הרשת לבסיס הנתונים.
// בטוח להרצה חוזרת — בית ספר שכבר קיים לפי שם מעודכן ולא משוכפל.
//
//   node scripts/seed-schools.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// השמות זהים ל-schools.config.json של מערכת תקציב בית הספר,
// כדי ששתי המערכות יקראו לאותו בית ספר באותו שם.
const SCHOOLS = [
  { name: 'בית חינוך רעננה',    city: 'רעננה',       reform: 'ofek' },
  { name: 'שלהבות מזכרת בתיה',  city: 'מזכרת בתיה',  reform: 'ofek' },
  { name: 'שלהבות אשקלון',      city: 'אשקלון',      reform: 'ofek' },
  { name: 'שלהבות אור עקיבא',   city: 'אור עקיבא',   reform: 'ofek' },
  { name: 'שלהבות ירושלים',     city: 'ירושלים',     reform: 'pre'  },
  { name: 'שלהבות גני תקוה',    city: 'גני תקוה',    reform: 'ofek' },
  { name: 'שלהבות רמת ישי',     city: 'רמת ישי',     reform: 'ofek' },
  { name: 'בית חינוך עפולה',    city: 'עפולה',       reform: 'pre'  },
];

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const { data: existing, error } = await admin.from('schools').select('id, name');
if (error) { console.error('טעינת בתי הספר נכשלה:', error.message); process.exit(1); }
const byName = Object.fromEntries((existing || []).map(s => [s.name, s.id]));

let added = 0, updated = 0;
for (const s of SCHOOLS) {
  if (byName[s.name]) {
    const { error: e } = await admin.from('schools').update(s).eq('id', byName[s.name]);
    if (e) { console.error(`עדכון ${s.name} נכשל:`, e.message); process.exit(1); }
    updated++;
  } else {
    const { error: e } = await admin.from('schools').insert(s);
    if (e) { console.error(`הוספת ${s.name} נכשלה:`, e.message); process.exit(1); }
    added++;
  }
}

const { data: all } = await admin.from('schools').select('name, city, reform, hours_quota').order('name');
console.log(`\nנוספו ${added} · עודכנו ${updated}\n`);
for (const s of all) {
  console.log(`  ${s.name.padEnd(22)} ${(s.city || '').padEnd(14)} ${s.reform === 'pre' ? 'עולם ישן' : 'אופק חדש'}   מכסה: ${s.hours_quota ?? '—'}`);
}
