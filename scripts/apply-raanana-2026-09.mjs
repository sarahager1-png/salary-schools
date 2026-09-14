// תיקוני רעננה לספטמבר 2026 — לפי ההכרעות של שרה (15.9.2026), מול הרשימה
// של בית הספר ומול הטבלה הרשמית של אופק חדש.
// מגבה את כל שורות רעננה לקובץ raanana-backup-<זמן>.json לפני כל שינוי.
// הרצה מתיקיית הפרויקט:  node scripts/apply-raanana-2026-09.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const { data: schools } = await sb.from('schools').select('id,name');
const s = schools.find(x => x.name.includes('רעננה'));
const { data: rows } = await sb.from('teacher_months').select('*').eq('month_key', '2026-09').eq('school_id', s.id);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(`raanana-backup-${stamp}.json`, JSON.stringify(rows, null, 1));
console.log('גיבוי', rows.length, 'שורות ->', `raanana-backup-${stamp}.json`);

const byName = n => rows.find(r => r.name.trim() === n);
const now = new Date().toISOString();
const upd = async (n, patch) => {
  const r = byName(n); if (!r) { console.log('לא נמצאה:', n); return; }
  const { error } = await sb.from('teacher_months').update({ ...patch, scope_set_at: now, updated_at: now }).eq('id', r.id);
  console.log(error ? `שגיאה ${n}: ${error.message}` : `✓ ${n} ${JSON.stringify(patch)}`);
};

await upd('דינה שכטר',    { scope_pct: 69 });                       // 18 ש׳, בלי ילדים
await upd('חני מור יוסף', { name: 'חני עטייה', scope_pct: 69 });   // אותה מורה, 18 ש׳
await upd('רחלי בקרמן',   { frontal_hours: 17, scope_pct: 72 });   // משרת אם
await upd('אלקי ונקרט',   { scope_pct: 61 });                       // 15 ש׳, משרת אם
await upd('ברוך בוטמן',   { scope_pct: 58 });                       // 15 ש׳
await upd('אפרת קריסטל',  { frontal_hours: 16, scope_pct: 61 });   // סה"כ 16 ש׳
await upd('חני פרידמן',   { frontal_hours: 13, scope_pct: 56 });   // 13 שילוב, משרת אם
await upd('חני זלמנוב',   { leave_type: 'sick' });                  // ימי מחלה עד הלידה

{ // הרב יחיאל ובר עזב — השורה נמחקת (שמורה בגיבוי)
  const r = byName('יחיאל ובר');
  if (r) { const { error } = await sb.from('teacher_months').delete().eq('id', r.id);
    console.log(error ? `שגיאה במחיקת ובר: ${error.message}` : '✓ יחיאל ובר הוסר (בגיבוי)'); }
}
{ // גב' חני מלכה — חדשה: 10 ש׳ (5 הוראה + 5 שילוב), ותק 10, דרגה 5, תואר שני, אם → 43%
  const { error } = await sb.from('teacher_months').insert({
    month_key: '2026-09', school_id: s.id, name: 'חני מלכה', reform: 'ofek', level: 'elementary',
    grade: '5', degree: 'MA', seniority: 10, frontal_hours: 10, scope_pct: 43, gamul_role: 'none',
    age_group: 'none', gender: 'f', children_under_18: 1, leave_type: 'none', scope_set_at: now });
  console.log(error ? `שגיאה בהוספת חני מלכה: ${error.message}` : '✓ חני מלכה נוספה');
}

const { data: after } = await sb.from('teacher_months').select('name,frontal_hours,scope_pct,leave_type')
  .eq('month_key', '2026-09').eq('school_id', s.id).order('name');
console.log('\nמצב אחרי:');
for (const r of after) console.log(`  ${r.name}: ${r.frontal_hours} ש׳ · ${r.scope_pct}%${r.leave_type !== 'none' ? ' [' + r.leave_type + ']' : ''}`);
console.log('סה"כ שעות מורות:', after.filter(r => r.frontal_hours < 40).reduce((a, r) => a + r.frontal_hours, 0));
