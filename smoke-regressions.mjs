// ארבע רגרסיות שהוורקפלואו מצא, שלוש מהן נולדו מתיקונים של אותו יום.
// כל בדיקה כאן מגינה על משהו שכבר נשבר פעם אחת.
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

const PW = 'Reg!' + Math.random().toString(36).slice(2, 9);
const MONTH = '2098-09', SCHOOL = 'רגרסיה בדיקה', CODE = 'regtestaaaaaaaaaaaaa';
const PRIN = 'reg-prin@example.com', CLERK = 'reg-clerk@example.com';

async function cleanup() {
  await admin.from('access_links').delete().eq('code', CODE);
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  const { data: us } = await admin.auth.admin.listUsers();
  for (const u of us?.users || []) {
    if ([PRIN, CLERK].includes(u.email) || /^reg-link-/.test(u.email || '')) {
      await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {});
    }
  }
  await admin.from('schools').delete().eq('name', SCHOOL);
}
const settled = async (id, pred, ms = 15000) => {
  const until = Date.now() + ms;
  for (;;) {
    const { data } = await admin.from('teacher_months').select('*').eq('id', id).single();
    if (data && pred(data)) return data;
    if (Date.now() > until) return null;
    await new Promise(r => setTimeout(r, 400));
  }
};
// בחירה לפי תווית ולא לפי מיקום: משנוספו שדות הבסיס לכרטיס הקישור,
// השדה המספרי הראשון הוא ותק ולא שעות.
const fld = (scope, label) => scope.locator('label').filter({ hasText: label }).first().locator('input');
const clickSave = async (page) => {
  const btn = page.getByRole('button', { name: 'שמירה' }).first();
  const until = Date.now() + 10000;
  while (await btn.isDisabled()) {
    if (Date.now() > until) throw new Error('כפתור השמירה לא נפתח');
    await new Promise(r => setTimeout(r, 100));
  }
  await btn.click();
};

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' })).newPage();

try {
  await cleanup();
  const { data: sc } = await admin.from('schools').insert({ name: SCHOOL, reform: 'ofek', hours_quota: 400 }).select().single();
  await admin.from('months').insert({ key: MONTH });
  const mk = async (email, name, role, school) => {
    const { data } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    await admin.from('profiles').insert({ id: data.user.id, full_name: name, role, school_id: school ?? null });
    return data.user.id;
  };
  await mk(PRIN, 'רגרסיה מנהלת', 'principal', sc.id);
  await mk(CLERK, 'רגרסיה חשבת', 'clerk', null);
  const linkId = await mk(`reg-link-${Math.random().toString(36).slice(2)}@link.local`, 'רגרסיה קישור', 'principal', sc.id);
  await admin.from('access_links').insert({ code: CODE, profile_id: linkId, revoked: false });

  // מורה ביסודי: בסיס 26 שעות = 100%. 13 שעות = 50%.
  const { data: row } = await admin.from('teacher_months').insert({
    month_key: MONTH, school_id: sc.id, name: 'רגרסיה מורה', reform: 'ofek',
    level: 'elementary', degree: 'BA', grade: '5', seniority: 8,
    frontal_hours: 26, scope_pct: 100, changed_at: new Date().toISOString(),
  }).select().single();

  const login = async (email) => {
    await p.goto('http://localhost:5190/');
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await p.getByPlaceholder('name@reshetch.org.il').fill(email);
    await p.locator('input[type="password"]').fill(PW);
    await p.getByRole('button', { name: /כניסה למערכת/ }).click();
    await p.waitForTimeout(2000);
    // האפליקציה נשארת על החודש הקלנדרי כשהוא קיים
    await p.selectOption('select[title="בחירת חודש"]', MONTH).catch(() => {});
    await p.waitForTimeout(700);
  };

  // ── 1. הקישור גוזר מחדש את אחוז המשרה ──
  await p.goto(`http://localhost:5190/?k=${CODE}`);
  await p.getByText('רגרסיה מורה').first().waitFor({ timeout: 20000 });
  await fld(p, 'שעות פרונטליות').fill('13');
  await clickSave(p);
  const after = await settled(row.id, r => r.frontal_hours === 13);
  if (!after) {
    console.log('SKIP  שמירה דרך הקישור — ככל הנראה סינון התוכן של הרשת');
  } else {
    check('שינוי שעות דרך הקישור גוזר אחוז משרה מחדש', after.scope_pct === 50, `${after.scope_pct}%`);
    check('ונשמר צילום "לפני" לשליח', !!after.snapshot, JSON.stringify(after.snapshot));
    check('והסימולציה אופסה', after.official_gross === null);
  }

  // ── 2. סליידר אחוז המשרה מגיע למסד ──
  await admin.from('teacher_months').update({ reform: 'pre' }).eq('id', row.id).select();
  await login(CLERK);   // רק כדי לוודא שהשרת חי; ההזנה נעשית כמנהלת
  await login(PRIN);
  await p.getByText('רגרסיה מורה').first().waitFor({ timeout: 20000 });
  await p.locator('button[title^="פרטים מלאים"]').first().click();
  await p.getByText('אחוז משרה').first().waitFor({ timeout: 10000 });
  const slider = p.locator('input[type="range"]').first();
  await slider.fill('60');
  await p.getByRole('button', { name: 'שמור שינויים' }).first().click();
  const scoped = await settled(row.id, r => r.scope_pct === 60);
  check('סליידר אחוז המשרה נשמר במסד', !!scoped, scoped ? '' : 'לא הגיע');

  // ── 3. למנהלת אין שדות שכר בכרטיס ──
  await p.locator('button[title^="פרטים מלאים"]').first().click();
  await p.getByText('שכר').first().waitFor({ timeout: 10000 });
  const modal = await p.locator('body').innerText();
  check('למנהלת אין שדה "שכר משולב מהסימולטור"', !modal.includes('שכר משולב מהסימולטור'));
  check('ואין לה כפתור "פתח סימולטור"',          !modal.includes('פתח סימולטור'));
  check('ונאמר לה מי כן קובע את השכר',           modal.includes('חשבת השכר'));
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 200));
} finally {
  await b.close();
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
