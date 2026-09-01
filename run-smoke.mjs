// מריצה את כל חבילות ה-smoke ברצף ומסכמת.
// ברצף בכוונה: הן חולקות מסד אחד, וריצה במקביל יוצרת התנגשויות.
//
//   node run-smoke.mjs            כל החבילות
//   node run-smoke.mjs links docs רק מי ששמן מכיל את המחרוזות האלה
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { ENV_FILE, URL } from './test-env.mjs';

// חבילות מתקופת localStorage — בודקות אפליקציה שכבר לא קיימת.
// נשמרות בהיסטוריה, לא רצות. אם צריך אותן: node <שם החבילה>
const OBSOLETE = new Set([
  'smoke.mjs', 'smoke-export.mjs', 'smoke-fields.mjs',
  'smoke-payroll.mjs', 'smoke-principal.mjs', 'smoke-principal-row.mjs',
  'smoke-seed.mjs', 'smoke-simulator.mjs',
]);
const all = fs.readdirSync('.')
  .filter(f => /^smoke.*\.mjs$/.test(f) && !OBSOLETE.has(f)).sort();
const want = process.argv.slice(2);
const list = want.length ? all.filter(f => want.some(w => f.includes(w))) : all;

console.log(`מסד: ${URL}  (${ENV_FILE})`);
console.log(`חבילות: ${list.length}\n`);

const run = (f) => new Promise(res => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [f], { shell: false });
  let out = '';
  p.stdout.on('data', d => out += d);
  p.stderr.on('data', d => out += d);
  p.on('close', code => res({ f, code, out, ms: Date.now() - t0 }));
});

const results = [];
for (const f of list) {
  const r = await run(f);
  const pass = (r.out.match(/^PASS/gm) || []).length;
  const fail = (r.out.match(/^FAIL/gm) || []).length;
  const skip = (r.out.match(/^SKIP/gm) || []).length;
  results.push({ ...r, pass, fail, skip });
  const mark = fail || (r.code !== 0 && !skip) ? '✗' : '✓';
  console.log(`${mark} ${f.padEnd(24)} PASS ${String(pass).padStart(3)}  FAIL ${String(fail).padStart(2)}  SKIP ${String(skip).padStart(2)}  ${(r.ms/1000).toFixed(0)}s`);
  if (fail) for (const l of r.out.split(/\r?\n/).filter(l => l.startsWith('FAIL'))) console.log('    ' + l);
  if (!pass && !fail && !skip) console.log('    ' + r.out.trim().split(/\r?\n/).slice(-3).join('\n    '));
}

const sum = k => results.reduce((s, r) => s + r[k], 0);
const broken = results.filter(r => r.fail || (!r.pass && !r.skip));
console.log(`\nסך הכול: PASS ${sum('pass')}  FAIL ${sum('fail')}  SKIP ${sum('skip')}`);
if (broken.length) { console.log('נכשלו: ' + broken.map(r => r.f).join(', ')); process.exit(1); }

// דילוג אינו הצלחה. כמעט תמיד זה סינון התוכן של הרשת שחסם קריאה
// ל-Supabase, והבדיקה ויתרה — לא בדקה ולא נכשלה.
const skipped = results.filter(r => r.skip);
if (skipped.length) {
  console.log('דילגו (לא נבדקו): ' + skipped.map(r => `${r.f} ×${r.skip}`).join(', '));
  console.log('כמעט תמיד סינון התוכן של הרשת. שווה להריץ שוב את החבילות האלה לבד.');
} else {
  console.log('הכול ירוק, בלי דילוגים.');
}
