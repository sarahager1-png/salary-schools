/*
  לכידת שורות התלוש לכל המורות — הרצה חד-פעמית שממלאת את slip_lines.
  לכל מורה (אופק וגם עולם ישן) מורצים נתוני התלוש שלה במחשבון העולם
  הישן, ושורות התוצאה נשמרות כפי שהן. מכאן והלאה ה-watcher מרענן.

    node capture-lines.mjs --month 2026-09 --live
*/
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';
import { dargaFor, kitaFor, openForm, runOne, readResultRows, pickEnv } from './sim-form.mjs';
import { computedBaseScope, momScopeBonus, homeroomHours, isPrincipalRow } from './src/lib/employer.js';

const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const MONTH = arg('month');
const LIVE = process.argv.includes('--live');
const { env } = pickEnv(fs, LIVE);
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const { data: rows } = await sb.from('teacher_months')
  .select('id, name, reform, degree, seniority, scope_pct, gamul_role, gender, children_under_18, leave_type, frontal_hours, official_gross, schools!inner(name)')
  .eq('month_key', MONTH);
const { data: have } = await sb.from('slip_lines').select('teacher_month_id');
const done = new Set((have || []).map(x => x.teacher_month_id));

const oldScope = (t) => {
  if (t.reform !== 'ofek') return t.scope_pct;
  const pseudo = { reform: 'pre', frontalHours: t.frontal_hours, role: t.gamul_role,
    gender: t.gender, childrenUnder18: t.children_under_18 };
  return Math.min(100, computedBaseScope(pseudo) + momScopeBonus({ ...pseudo }));
};

const b = await chromium.launch();
const p = await (await b.newContext({ locale: 'he-IL', viewport: { width: 1300, height: 1600 } })).newPage();
let ok = 0, skip = 0;
try {
  await openForm(p, 'old');
  for (const t of rows || []) {
    if (done.has(t.id)) { skip++; continue; }
    if (isPrincipalRow({ role: t.gamul_role }) || t.leave_type !== 'none' || !Number(t.frontal_hours)) { skip++; continue; }
    const darga = dargaFor(t);
    if (!darga || !t.official_gross) { skip++; continue; }
    const plan = { calc: 'old', darga,
      vetek: String(Math.max(1, Math.min(40, Number(t.seniority) || 1))),
      pct: String(oldScope(t)), kita: kitaFor(t) };
    try {
      const gross = await runOne(p, plan, MONTH);
      if (!gross) { console.log('✗', t.name, '— לא נקרא'); continue; }
      const lines = await readResultRows(p);
      await sb.from('slip_lines').upsert({ teacher_month_id: t.id, lines, gross, computed_at: new Date().toISOString() });
      ok++;
      console.log(`✓ ${t.name.padEnd(22)} ${lines.length} שורות · ${gross.toLocaleString('he-IL')} ₪`);
    } catch (e) { console.log('✗', t.name, '—', e.message?.slice(0, 80)); }
  }
} finally { await b.close(); }
console.log(`\nנלכדו ${ok} · דולגו ${skip}`);
