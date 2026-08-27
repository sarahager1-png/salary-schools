// מעקב מילוי — מי נכנסה ואצל מי תקוע.
//
// הנתון שמאחוריו, access_links.last_used_at, סגור לשליח בלבד. הבדיקה
// מוודאת גם שהמסך מציג את המצב הנכון, וגם שמנהלת אינה יכולה לראות
// את התמונה של שאר בתי הספר.
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(Boolean)
    .filter(l => !l.trimStart().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon  = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

const PW = 'Prg!' + Math.random().toString(36).slice(2, 9);
const MONTH = '2097-02';
const S = { none: 'מעקב אין קישור', fresh: 'מעקב טרם נכנסה', empty: 'מעקב נכנסה ריק', ready: 'מעקב מוכן' };
const COORD = 'prg-coord@example.com', PRIN = 'prg-prin@example.com';
const CODE_EMPTY = 'prgtestaaaaaaaaaaaaa', CODE_READY = 'prgtestbbbbbbbbbbbbb', CODE_FRESH = 'prgtestccccccccccccc';

async function cleanup() {
  await admin.from('access_links').delete().in('code', [CODE_EMPTY, CODE_READY, CODE_FRESH]);
  const { data: scs } = await admin.from('schools').select('id').in('name', Object.values(S));
  for (const x of scs || []) await admin.from('teacher_months').delete().eq('school_id', x.id);
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  const { data: ps } = await admin.from('profiles').select('id, full_name').like('full_name', 'מעקב %');
  for (const x of ps || []) { await admin.from('profiles').delete().eq('id', x.id); await admin.auth.admin.deleteUser(x.id).catch(() => {}); }
  const { data: us } = await admin.auth.admin.listUsers();
  for (const email of [COORD, PRIN]) {
    const u = us?.users?.find(x => x.email === email);
    if (u) { await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {}); }
  }
  await admin.from('schools').delete().in('name', Object.values(S));
}

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 1100 }, locale: 'he-IL' })).newPage();

try {
  await cleanup();
  const mkSchool = async n => (await admin.from('schools').insert({ name: n, reform: 'ofek', hours_quota: 400 }).select().single()).data;
  const sc = {};
  for (const [k, n] of Object.entries(S)) sc[k] = await mkSchool(n);
  await admin.from('months').insert({ key: MONTH });

  const mkPrincipal = async (name, school, code, lastUsed) => {
    const { data } = await admin.auth.admin.createUser({ email: `pg-${Math.random().toString(36).slice(2)}@link.local`, email_confirm: true });
    await admin.from('profiles').insert({ id: data.user.id, full_name: name, role: 'principal', school_id: school });
    if (code) await admin.from('access_links').insert({ code, profile_id: data.user.id, revoked: false, last_used_at: lastUsed ?? null });
    return data.user.id;
  };
  // ארבעה מצבים: בלי קישור · עם קישור שלא נפתח · נפתח בלי הזנה · מוכן
  await mkPrincipal('מעקב בלי קישור', sc.none.id, null);
  await mkPrincipal('מעקב לא נכנסה', sc.fresh.id, CODE_FRESH, null);
  await mkPrincipal('מעקב ריקה',     sc.empty.id, CODE_EMPTY, new Date(Date.now() - 20 * 60000).toISOString());
  await mkPrincipal('מעקב סיימה',    sc.ready.id, CODE_READY, new Date(Date.now() - 3 * 3600000).toISOString());

  const ins = async (school, row) => (await admin.from('teacher_months').insert({
    month_key: MONTH, school_id: school, reform: 'ofek', level: 'elementary', degree: 'BA', grade: '5',
    seniority: 6, frontal_hours: 26, scope_pct: 100, changed_at: new Date().toISOString(), ...row,
  }).select().single()).data;
  await ins(sc.ready.id, { name: 'מעקב עובדת א', phone: '0501111111', email: 'a@x.co', official_gross: 12000, official_gross_pre: 11000 });
  await ins(sc.ready.id, { name: 'מעקב עובדת ב', phone: '0502222222', email: 'b@x.co', official_gross: 12500, official_gross_pre: 11200 });
  // בבית ספר "ריק" — שורה בלי פרטי קשר, כדי לבדוק את המצב הזה
  await ins(sc.empty.id, { name: 'מעקב בלי קשר' });

  const mkAuth = async (email, name, role, school) => {
    const { data } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    await admin.from('profiles').insert({ id: data.user.id, full_name: name, role, school_id: school ?? null });
  };
  await mkAuth(COORD, 'מעקב שליח', 'coordinator');
  await mkAuth(PRIN,  'מעקב מנהלת מחוברת', 'principal', sc.ready.id);

  // ── 1. הפונקציה עצמה ──
  const coord = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await coord.auth.signInWithPassword({ email: COORD, password: PW });
  const { data: prog, error: pe } = await coord.rpc('school_progress', { p_month: MONTH });
  check('השליח מקבל תמונת התקדמות', !pe && (prog || []).length > 0, pe?.message?.slice(0, 60) || `${prog?.length} שורות`);
  const row = id => (prog || []).find(r => r.school_id === id);
  check('בית ספר בלי קישור מסומן ככזה', row(sc.none.id)?.has_link === false);
  check('קישור שלא נפתח — אין זמן כניסה', row(sc.fresh.id)?.has_link === true && row(sc.fresh.id)?.last_seen === null);
  check('נכנסה אך לא הזינה', row(sc.empty.id)?.last_seen !== null && row(sc.empty.id)?.teachers === 1);
  check('ונספר החוסר בפרטי קשר', row(sc.empty.id)?.missing_contact === 1, String(row(sc.empty.id)?.missing_contact));
  check('בית ספר שסיים — שתי עובדות, שתיהן עם סימולציה',
    row(sc.ready.id)?.teachers === 2 && row(sc.ready.id)?.simulated === 2 && row(sc.ready.id)?.missing_contact === 0,
    JSON.stringify({ t: row(sc.ready.id)?.teachers, s: row(sc.ready.id)?.simulated }));

  // ── 2. הגבול: מנהלת ו-anon ──
  const prin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await prin.auth.signInWithPassword({ email: PRIN, password: PW });
  const { data: pp } = await prin.rpc('school_progress', { p_month: MONTH });
  check('מנהלת אינה רואה את תמונת הרשת', (pp || []).length === 0, `${pp?.length} שורות`);
  const { data: ap, error: ae } = await anon.rpc('school_progress', { p_month: MONTH });
  check('ומי שאינו מחובר — כלל לא', !!ae || (ap || []).length === 0, ae ? '' : `${ap?.length} שורות`);

  // ── 3. המסך ──
  await p.goto('http://localhost:5190/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.getByPlaceholder('name@reshetch.org.il').fill(COORD);
  await p.locator('input[type="password"]').fill(PW);
  await p.getByRole('button', { name: /כניסה למערכת/ }).click();
  await p.getByRole('button', { name: /יציאה/ }).first().waitFor({ timeout: 20000 });
  await p.selectOption('select[title="בחירת חודש"]', MONTH).catch(() => {});
  await p.waitForTimeout(1500);
  const body = await p.locator('body').innerText();
  check('הפאנל מוצג', body.includes('מעקב מילוי'));
  for (const [label, ok] of [
    ['אין קישור', body.includes('אין קישור')],
    ['טרם נכנסה', body.includes('טרם נכנסה')],
    ['נכנסה, לא הזינה או חסרי קשר', body.includes('בלי פרטי קשר') || body.includes('נכנסה, לא הזינה')],
    ['ממתין לחשבת השכר או מוכן', body.includes('ממתין לחשבת השכר') || body.includes('מוכן')],
  ]) check(`מוצג המצב "${label}"`, ok);
  check('מוצג "לפני כמה זמן"', /לפני \d+ (דק׳|שע׳)/.test(body), body.match(/לפני \d+ \S+/)?.[0] || 'לא נמצא');
  check('ונאמר כמה ממתינים', /בתי ספר ממתינים לך/.test(body));

  // לחיצה על שורה נכנסת לבית הספר
  await p.getByText(S.ready).first().click();
  await p.getByText('מעקב עובדת א').first().waitFor({ timeout: 15000 });
  check('לחיצה על שורה פותחת את בית הספר', true);
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 220));
} finally {
  await b.close();
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
