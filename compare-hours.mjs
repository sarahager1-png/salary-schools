/*
  שעות מתוכננות בתקציב מול שעות מאוישות בשכר — לכל בית ספר. קריאה בלבד.

  תקציב: כיתות × שעות שבועיות לכיתה + שעות פיצול, ומזה מורידים את ייעול
  השעות שנבחר (הורדת שעות, קבלת שבת, פרטניות, שעות הוראה של המנהלת).
  שכר: סכום השעות הפרונטליות של כל השורות שאינן מנהלת/יועצת, ובנפרד
  מי בחל"ד (השעות שלה אינן מאוישות על ידה) ומי מחליפה.

  הרצה: node compare-hours.mjs [YYYY-MM]
*/
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import * as emp from './src/lib/employer.js';

const MONTH = process.argv[2] || '2026-09';
const HUB_URL = 'https://ogkwvrerolofujhydhsl.supabase.co/functions/v1/network-budget';
const HUB_CODE = process.env.HUB_ACCESS_CODE || 'reshet2026';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const r = await fetch(HUB_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: HUB_CODE }) });
const hub = await r.json();

const { data: schools } = await sb.from('schools').select('id, name');
const { data: rows } = await sb.from('teacher_months').select('*').eq('month_key', MONTH);

const norm = (s) => String(s || '').replace(/["'׳״]/g, '').replace(/\s+/g, ' ')
  .replace(/^בית חינוך /, '').replace(/^שלהבות /, '').replace(/גני תקווה/, 'גני תקוה').trim();

// ייעול שעות — פירוק התווית למספר שעות שבועיות
const yieulHours = (row, classCount) => {
  const l = row.label || '';
  let m;
  if ((m = l.match(/^הורדת (\d+) שעות הוראה מכל כיתה/))) return Number(m[1]) * classCount;
  if ((m = l.match(/^קבלת שבת.*?\(שעה שבועית × (\d+) כיתות\)/))) return Number(m[1]);
  if ((m = l.match(/^שעות הוראה של המנהלת \((\d+) ש׳ שבועיות\)/))) return Number(m[1]);
  // "שעות פרטניות … (1 ש׳ × 9 כיתות)" — מכפלה. הביטוי הקודם תפס את
  // הספרה הראשונה בלבד והחזיר 1 במקום 9 (נמצא 8.9).
  if ((m = l.match(/^שעות פרטניות.*?(\d+)\s*ש׳\s*×\s*(\d+)\s*כיתות/))) return Number(m[1]) * Number(m[2]);
  if ((m = l.match(/^שעות פרטניות.*?(\d+)/))) return Number(m[1]);
  return null;
};

const pad = (s, w) => { s = String(s); const len = [...s].length; return s + ' '.repeat(Math.max(0, w - len)); };
console.log(`\nחודש ${MONTH} · שעות שבועיות: תכנון בתקציב מול איוש בשכר\n`);
console.log(pad('בית ספר', 20), pad('כיתות', 6), pad('ש׳/כיתה', 8), pad('פיצול', 6), pad('תכנון', 7), pad('ייעול', 6), pad('אחרי', 6), '│', pad('בשכר', 6), pad('חל"ד', 6), pad('מחליפות', 8), pad('נטו', 6), 'פער נטו−אחרי');
console.log('─'.repeat(120));

for (const s of schools) {
  // רעננה מופיעה במבט-רשת כ"בנים" ו"בנות" — נלקח הפרויקט שיש בו כיתות
  const h = (hub.schools || []).find(x => norm(x.name) === norm(s.name))
    || (hub.schools || []).find(x => norm(x.name).startsWith(norm(s.name) + ' - ') && (x.raw?.classes || []).length > 0);
  const ts = rows.filter(t => t.school_id === s.id);
  const isPrincipal = t => emp.isPrincipalRow({ role: t.gamul_role });
  const isCounselor = t => t.gamul_role === 'counselor';
  const teach = ts.filter(t => !isPrincipal(t) && !isCounselor(t));
  const staffed = teach.reduce((a, t) => a + (Number(t.frontal_hours) || 0), 0);
  const onLeave = teach.filter(t => t.leave_type === 'maternity' || t.leave_type === 'unpaid');
  const leaveH = onLeave.reduce((a, t) => a + (Number(t.frontal_hours) || 0), 0);
  const subs = teach.filter(t => String(t.mm_for || '').trim());
  const subH = subs.reduce((a, t) => a + (Number(t.mm_hours) || 0), 0);
  const net = staffed - leaveH; // מי שבפועל מלמדת (המחליפות כבר בתוך staffed בשורות שלהן)

  if (!h || h.mode === 'simple' || !h.raw?.constants) {
    console.log(pad(s.name, 20), pad('—', 6), pad('—', 8), pad('—', 6), pad('—', 7), pad('—', 6), pad('—', 6), '│', pad(staffed, 6), pad(leaveH, 6), pad(subH, 8), pad(net, 6), h ? 'מעקב פשוט' : 'אין במבט-רשת');
    continue;
  }
  const c = h.raw.constants;
  const classes = h.raw.classes || [];
  const perClass = Number(c.actual_weekly_hours) || 0;
  const extra = classes.reduce((a, k) => a + (Number(k.extra_hours) || 0), 0);
  const planned = classes.length * perClass + extra;
  const yRows = h.efficiency?.saved === true ? (h.efficiency?.rows || []) : [];
  let yieul = 0; const unknown = [];
  for (const yr of yRows) {
    const yh = yieulHours(yr, classes.length);
    if (yh == null) { if (/שעות|שבת|פרטני/.test(yr.label || '')) unknown.push(yr.label); continue; }
    yieul += yh;
  }
  const after = planned - yieul;
  const gap = net - after;
  console.log(pad(s.name, 20), pad(classes.length, 6), pad(perClass, 8), pad(extra, 6), pad(planned, 7), pad(yieul, 6), pad(after, 6), '│',
    pad(staffed, 6), pad(leaveH, 6), pad(subH, 8), pad(net, 6), (gap > 0 ? '+' : '') + gap + (unknown.length ? '  (ייעול לא פוענח: ' + unknown.join('; ') + ')' : ''));
}

console.log('\nהסבר: "תכנון" = כיתות × שעות לכיתה + פיצול. "אחרי" = אחרי ייעול השעות שנבחר במבט-רשת.');
console.log('"בשכר" = סך השעות הפרונטליות של המורות (בלי מנהלת ויועצת). "נטו" = בלי מי שבחל"ד/חל"ת.');
console.log('פער חיובי = מאוישות יותר שעות ממה שתוכנן אחרי ייעול; שלילי = פחות.');
