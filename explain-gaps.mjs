/*
  למה יש פער.

  verify-sim אומר שהמספר שונה; הוא אינו אומר למה. הכלי הזה לוקח כל פער
  ומנסה עליו שינוי של פרמטר אחד בכל פעם — ותק שכן, דרגה שכנה, האחוז
  שהברוטו מכתיב — ובודק איזה שינוי סוגר אותו. שינוי יחיד שמייצר בדיוק
  את המספר הרשום הוא הסבר; אם שום שינוי יחיד אינו סוגר, זה נאמר במפורש
  ולא מומצא הסבר.

    node explain-gaps.mjs --month 2026-09 [--live]
*/
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { openForm, runOne, pickEnv } from './sim-form.mjs';

const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const MONTH = arg('month');
const LIVE = process.argv.includes('--live');
if (!MONTH) { console.error('חסר --month'); process.exit(2); }
try { pickEnv(fs, LIVE); } catch (e) { console.error(e.message); process.exit(2); }

const diffs = JSON.parse(fs.readFileSync('verify-sim-diffs.json', 'utf8'));
console.log(`${diffs.length} פערים · מנסים שינוי אחד בכל פעם\n`);

const b = await chromium.launch();
const p = await (await b.newContext({ locale: 'he-IL', viewport: { width: 1300, height: 1600 } })).newPage();
const unexplained = [];

try {
  await openForm(p, 'old');
  for (const d of diffs) {
    const base = d.sent;
    const v = Number(base.vetek);
    // המועמדים: ותק שכן, האחוז שהברוטו מכתיב, ובאופק גם דרגה שכנה
    const tries = [
      { why: `ותק ${v + 1} במקום ${v}`, plan: { ...base, vetek: String(v + 1) } },
      { why: `ותק ${v - 1} במקום ${v}`, plan: { ...base, vetek: String(Math.max(1, v - 1)) } },
      { why: `אחוז משרה ${d.implied_scope}% במקום ${base.pct}%`, plan: { ...base, pct: String(d.implied_scope) } },
    ];
    if (base.kita) tries.push({ why: 'בלי גמול חינוך כיתה', plan: { ...base, kita: null } });
    else tries.push({ why: 'עם גמול חינוך כיתה (ב׳)', plan: { ...base, kita: '2' } });
    if (base.calc === 'ofek') {
      const g = (Number(base.darga) + 1) / 2;
      tries.push({ why: `דרגה ${g + 1} במקום ${g}`, plan: { ...base, darga: String((g + 1) * 2 - 1) } });
      tries.push({ why: `דרגה ${g - 1} במקום ${g}`, plan: { ...base, darga: String(Math.max(1, (g - 1) * 2 - 1)) } });
    }

    let found = null;
    for (const t of tries) {
      if (Number(t.plan.vetek) === v && t.plan.pct === base.pct && t.plan.kita === base.kita && t.plan.darga === base.darga) continue;
      let got = null;
      try { got = await runOne(p, t.plan, MONTH); } catch { continue; }
      if (got != null && Math.abs(got - d.expected) <= 2) { found = { ...t, got }; break; }
    }

    const head = `${d.school} · ${d.name}`.padEnd(42);
    if (found) console.log(`✔ ${head} ${found.why}  →  ${found.got}`);
    else { console.log(`? ${head} שום שינוי יחיד אינו סוגר את הפער (${d.expected} מול ${d.got})`); unexplained.push(d); }
  }
} finally { await b.close(); }

if (unexplained.length) {
  console.log(`\nללא הסבר: ${unexplained.length}`);
  fs.writeFileSync('unexplained-gaps.json', JSON.stringify(unexplained, null, 1));
}
