/*
  השלמת התלושים המפורטים (slip_lines) לחודש שנפתח בלעדיהם.

  פתיחת החודש מעתיקה את שורות המורות עם מזהים חדשים, והתלוש המפורט
  יושב לפי מזהה השורה. ב-1.10.26 הוא לא הועתק, והתלושים נעלמו מהמסך
  ("נעלמו תלושי שכר", שרה 5.10.26). מאז הפתיחה מעתיקה אותם בעצמה, וזה
  הכלי למקרה שההעתקה נכשלה.

  התלוש של החודש הקודם מועתק לשורת החודש החדש של אותה מורה — רק כשאף
  נתון שמשפיע על התלוש לא השתנה, ורק לשורה שאין לה עדיין תלוש. שום
  שורה קיימת אינה נדרסת או נמחקת.

  הרצה יבשה (ברירת המחדל):  node scripts/restore-slips.mjs 2026-10
  כתיבה, רק באישור שרה:      node scripts/restore-slips.mjs 2026-10 --write
*/
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const WRITE = process.argv.includes('--write');
const MONTH = process.argv.slice(2).find(a => /^\d{4}-\d{2}$/.test(a));
if (!MONTH) { console.error('חסר חודש, למשל: node scripts/restore-slips.mjs 2026-10'); process.exit(1); }
const [y, m] = MONTH.split('-').map(Number);
const prevD = new Date(Date.UTC(y, m - 2, 1));
const PREV = `${prevD.getUTCFullYear()}-${String(prevD.getUTCMonth() + 1).padStart(2, '0')}`;

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

// כל מה שהמחשבון מקבל, ועוד הברוטו עצמו: אם אחד מהם זז, התלוש הקודם אינו תקף
const SAME = ['reform', 'level', 'grade', 'degree', 'seniority', 'frontal_hours', 'scope_pct', 'gamul_role',
  'age_group', 'children_under_18', 'nihul_grade', 'gender', 'individual_hours', 'presence_hours', 'job',
  'extra_roles', 'non_quota_hours', 'leave_type', 'official_gross', 'tz_id'];
const diffOf = (a, b) => SAME.filter(f => JSON.stringify(a[f]) !== JSON.stringify(b[f]));

async function all(table, cols, filter = q => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(sb.from(table).select(cols)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const tm = await all('teacher_months', '*', q => q.in('month_key', [PREV, MONTH]).order('id'));
const prevRows = tm.filter(r => r.month_key === PREV), newRows = tm.filter(r => r.month_key === MONTH);
const sl = await all('slip_lines', 'teacher_month_id, lines, gross, computed_at', q => q.order('teacher_month_id'));
const schools = await all('schools', 'id, name');
const schoolName = Object.fromEntries(schools.map(s => [s.id, s.name.replace(/\s+/g, ' ')]));
const rowById = new Map(tm.map(r => [r.id, r]));

const slipOf = new Map(sl.map(s => [s.teacher_month_id, s]));
const keyOf = r => `${r.school_id}|${String(r.name || '').trim()}|${r.job || ''}`;
const prevBy = new Map(), dupKeys = new Set();
for (const r of prevRows) {
  if (prevBy.has(keyOf(r))) dupKeys.add(keyOf(r));
  prevBy.set(keyOf(r), r);
}

const toInsert = [], prevOf = new Map(), skipped = [];
for (const o of newRows) {
  const who = `${schoolName[o.school_id]} / ${o.name}`;
  if (slipOf.has(o.id)) continue;                                   // כבר יש תלוש — לא נוגעים
  const p = prevBy.get(keyOf(o));
  if (!p) { skipped.push(`${who}: אין שורה ב-${PREV}`); continue; }
  if (dupKeys.has(keyOf(o))) { skipped.push(`${who}: שם כפול ב-${PREV}`); continue; }
  const s = slipOf.get(p.id);
  if (!s) { skipped.push(`${who}: גם ב-${PREV} לא היה תלוש מפורט`); continue; }
  const diff = diffOf(o, p);
  if (diff.length) { skipped.push(`${who}: השתנה ${diff.join(', ')} — נדרש חישוב מחדש`); continue; }
  toInsert.push({ teacher_month_id: o.id, lines: s.lines, gross: s.gross, computed_at: s.computed_at });
  prevOf.set(o.id, p);
}

const bySchool = {};
for (const row of toInsert) {
  const name = schoolName[rowById.get(row.teacher_month_id).school_id];
  bySchool[name] = (bySchool[name] || 0) + 1;
}
console.log(`${MONTH}: ${newRows.length} שורות · תלושים להשלמה מ-${PREV}: ${toInsert.length}`);
console.table(bySchool);
console.log(`לא מושלמים (${skipped.length}):\n  ` + (skipped.join('\n  ') || '—'));

if (!WRITE) { console.log('\nהרצה יבשה — לא נכתב דבר.'); process.exit(0); }
if (!toInsert.length) { console.log('\nאין מה להשלים.'); process.exit(0); }

const before = slipOf.size;
// insert ולא upsert: אם לשורה כבר נוצר תלוש בינתיים, ההוספה נכשלת ואינה דורסת
const { error: iErr } = await sb.from('slip_lines').insert(toInsert);
if (iErr) throw new Error('ההוספה נכשלה, לא נכתב דבר: ' + iErr.message);
const { count: after } = await sb.from('slip_lines').select('teacher_month_id', { count: 'exact', head: true });
console.log(`\nנכתב. לפני: ${before} · אחרי: ${after} · נוספו: ${after - before} (צפוי ${toInsert.length})`);

// שורה שנערכה בין הקריאה לכתיבה קיבלה תלוש שכבר אינו שלה — מדווחת לחישוב מחדש
const fresh = await all('teacher_months', '*', q => q.eq('month_key', MONTH).order('id'));
const moved = fresh.filter(o => prevOf.has(o.id) && diffOf(o, prevOf.get(o.id)).length)
  .map(o => `${schoolName[o.school_id]} / ${o.name}: ${diffOf(o, prevOf.get(o.id)).join(', ')}`);
console.log(moved.length
  ? `שורות שהשתנו בזמן ההשלמה — לחשב להן מחדש:\n  ` + moved.join('\n  ')
  : 'אף שורה לא השתנתה בזמן ההשלמה.');
