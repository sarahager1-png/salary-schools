/*
  העלאת התלושים בפועל מהגזברות — תלוש נפרד לכל עובדת, לדלי הפרטי payslips,
  ורישום ב-payslip_files (שרה, 6.10.26: "תעלה את התלושים בפועל לכל מורה, לכל חודש").

    node scripts/upload-payslips.mjs <manifest.json>            → הרצה יבשה
    node scripts/upload-payslips.mjs <manifest.json> --upload   → העלאה בפועל

  ה-manifest נוצר מפיצול קובצי ה-PDF לעמודים: [{ file, month, schoolKey, name, tz, gross, net, dep, sourceFile }].
  הנתיב בדלי אינו מכיל שם או ת"ז. תלוש שכבר הועלה (אותו חודש, סניף ות"ז/שם) מדולג — לא נדרס.
*/
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const GO = process.argv.includes('--upload');

// עלות מעביד מלאה: מה שבתלוש, ועוד ביטוח לאומי מעסיק ומס שכר שאינם מופיעים בו — בשיעורים של employer.js
const BL = w => (w <= 7703 ? w * 0.0451 : 7703 * 0.0451 + (w - 7703) * 0.076);
const fullCost = (gross, dep) => Math.round((gross || 0) + (dep || 0) + BL(gross || 0) + (gross || 0) * 0.075);
const tzn = s => String(s || '').replace(/\D/g, '').replace(/^0+/, '');

const { data: schools } = await sb.from('schools').select('id, name');
const months = [...new Set(manifest.map(m => m.month))];
const { data: rows } = await sb.from('teacher_months').select('id, name, tz_id, school_id, month_key').in('month_key', months);
const { data: existing } = await sb.from('payslip_files').select('month_key, school_id, tz_id, name');
const seen = new Set((existing || []).map(e => `${e.month_key}|${e.school_id}|${tzn(e.tz_id) || e.name}`));

let up = 0, skip = 0, noRow = 0; const bad = [];
for (const m of manifest) {
  const sc = schools.filter(s => s.name.includes(m.schoolKey));
  if (sc.length !== 1) { bad.push(`${m.name}: סניף "${m.schoolKey}" אינו חד-משמעי`); continue; }
  const mine = rows.filter(r => r.school_id === sc[0].id && r.month_key === m.month);
  let t = m.tz ? mine.find(r => tzn(r.tz_id) && tzn(r.tz_id) === tzn(m.tz)) : null;
  if (!t && m.sysName) t = mine.find(r => r.name.trim() === m.sysName);
  if (!t) { const w = m.name.split(' ').filter(k => k.length > 1); const c = mine.filter(r => w.filter(k => r.name.includes(k)).length >= 2); if (c.length === 1) t = c[0]; }
  if (!t) noRow++;
  const tz = tzn(t?.tz_id) || tzn(m.tz) || null;
  const key = `${m.month}|${sc[0].id}|${tz || m.name}`;
  if (seen.has(key)) { skip++; continue; }
  const row = { month_key: m.month, school_id: sc[0].id, tz_id: tz, name: m.name, teacher_month_id: t?.id || null,
    path: `${m.month}/${sc[0].id}/${crypto.randomUUID()}.pdf`,
    gross: m.gross, net: m.net ?? null, employer_deposits: m.dep, employer_cost: fullCost(m.gross, m.dep), source_file: m.sourceFile };
  if (!GO) { up++; continue; }
  const { error: e1 } = await sb.storage.from('payslips').upload(row.path, fs.readFileSync(m.file), { contentType: 'application/pdf', upsert: false });
  if (e1) { bad.push(`${m.name}: העלאה — ${e1.message}`); continue; }
  const { error: e2 } = await sb.from('payslip_files').insert(row);
  if (e2) { await sb.storage.from('payslips').remove([row.path]).catch(() => {}); bad.push(`${m.name}: רישום — ${e2.message}`); continue; }
  seen.add(key); up++;
}
console.log(`${GO ? 'הועלו' : 'יבש — יעלו'} ${up} · כבר קיימים ${skip} · בלי שורת עובדת בחודש ${noRow} · נכשלו ${bad.length}`);
for (const b of bad) console.log('  ✗', b);
if (GO) {
  const { data: after } = await sb.from('payslip_files').select('month_key, school_id, gross, employer_cost');
  const by = {}; for (const a of after) { const k = a.month_key + ' ' + schools.find(s => s.id === a.school_id).name.replace(/\s+/g, ' '); (by[k] ??= { n: 0, g: 0, c: 0 }); by[k].n++; by[k].g += Number(a.gross || 0); by[k].c += Number(a.employer_cost || 0); }
  for (const [k, v] of Object.entries(by)) console.log(' ', k, '| תלושים', v.n, '| ברוטו', Math.round(v.g), '| עלות', Math.round(v.c));
}
