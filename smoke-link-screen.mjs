// המסך שהקישור פותח. מי שמחזיקה בו אינה מחוברת — אין session ואין
// auth.uid() — ולכן זו הזרימה היחידה במערכת שנשענת כולה על ה-RPCs.
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

const MONTH = '2098-05';
const S1 = 'מסך קישור א', S2 = 'מסך קישור ב';
const CODE = 'screentestaaaaaaaaaa', OTHER = 'screentestbbbbbbbbbb';
const PW = 'Link!' + Math.random().toString(36).slice(2, 9);
const CLERK = 'link-clerk@example.com', COORD = 'link-coord@example.com';

async function cleanup() {
  await admin.from('access_links').delete().in('code', [CODE, OTHER]);
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  const { data: ps } = await admin.from('profiles').select('id, full_name').like('full_name', 'מסך קישור%');
  for (const x of ps || []) { await admin.from('profiles').delete().eq('id', x.id); await admin.auth.admin.deleteUser(x.id).catch(() => {}); }
  const { data: us } = await admin.auth.admin.listUsers();
  for (const email of [CLERK, COORD]) {
    const u = us?.users?.find(x => x.email === email);
    if (u) { await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {}); }
  }
  await admin.from('schools').delete().in('name', [S1, S2]);
}

// ההבזק "נשמר" חי 2.5 שניות ואז נעלם, והמתנה לו היא מרוץ. מה שקובע
// הוא מה שנשמר בשרת, ולכן הבדיקה ממתינה לו ולא לתצוגה.
// הכפתור מנוטרל כל עוד אין שינוי. React מעבד את ההקלדה בסבב הבא, ולכן
// לחיצה מיידית אחריה נופלת על כפתור שעדיין סגור — ולא קורה דבר.
// בחירה לפי התווית ולא לפי מיקום: משנוספו שדות הבסיס לכרטיס, השדה
// המספרי הראשון הוא ותק ולא שעות — והבדיקה מילאה בשקט את השדה הלא נכון.
const fld = (scope, label) => scope.locator('label').filter({ hasText: label }).first().locator('input');

async function clickSave(page) {
  const btn = page.getByRole('button', { name: 'שמירה' }).first();
  const until = Date.now() + 10000;
  while (await btn.isDisabled()) {
    if (Date.now() > until) throw new Error('כפתור השמירה לא נפתח אחרי ההקלדה');
    await new Promise(r => setTimeout(r, 100));
  }
  await btn.click();
}

async function settled(id, pred, ms = 15000) {
  const until = Date.now() + ms;
  for (;;) {
    const { data } = await admin.from('teacher_months').select('*').eq('id', id).single();
    if (data && pred(data)) return data;
    if (filtered) return null;                       // הרשת חסמה — לא המערכת
    // פסק זמן אינו חריגה שמפילה את כל החבילה: הבדיקה שתלויה בשמירה
    // תיכשל בעצמה עם שם ברור, ושאר הבדיקות ימשיכו.
    if (Date.now() > until) return null;
    await new Promise(r => setTimeout(r, 400));
  }
}
// הדגל מה-response מגיע באיחור: קריאת גוף התשובה היא אסינכרונית, ובזמן
// שהיא רצה הבדיקה כבר ויתרה. ההודעה שהמסך מציג היא הסימן הוודאי —
// raise() מתרגמת את דף החסימה לעברית לפני שהיא מגיעה לכרטיס.
const blockedOnScreen = async () =>
  (await p.locator('body').innerText().catch(() => '')).includes('סינון התוכן');

const skipIfFiltered = (name) => {
  if (!filtered) return false;
  console.log(`SKIP  ${name} — סינון התוכן של הרשת חסם את הקריאה`);
  return true;
};

const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:430,height:930}, locale:'he-IL' })).newPage();  // טלפון
// סינון התוכן של הרשת (נטו/נטספארק) מחליף לפעמים את תשובת השרת בדף
// חסימה. זו אינה תקלה במערכת, ולכן הבדיקה מזהה אותה ומדלגת במקום להיכשל.
let filtered = false;
p.on('response', async r => {
  if (/link_save_row/.test(r.url())) {
    const t = await r.text().catch(() => '');
    if (/safepage|netspark|neto\.net\.il/i.test(t)) filtered = true;
  }
});

try {
  await cleanup();
  const { data: s1 } = await admin.from('schools').insert({ name: S1, reform: 'ofek' }).select().single();
  const { data: s2 } = await admin.from('schools').insert({ name: S2, reform: 'ofek' }).select().single();
  await admin.from('months').insert({ key: MONTH });
  const mk = async (name, school) => {
    const { data } = await admin.auth.admin.createUser({ email: `st-${Math.random().toString(36).slice(2)}@link.local`, email_confirm: true });
    await admin.from('profiles').insert({ id: data.user.id, full_name: name, role: 'principal', school_id: school });
    return data.user.id;
  };
  const mkAuth = async (email, name, role) => {
    const { data } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    await admin.from('profiles').insert({ id: data.user.id, full_name: name, role });
  };
  await mkAuth(CLERK, 'חשבת קישור', 'clerk');
  await mkAuth(COORD, 'שליח קישור', 'coordinator');
  const pA = await mk('מסך קישור מנהלת', s1.id);
  const pB = await mk('מסך קישור אחרת', s2.id);
  await admin.from('access_links').insert([
    { code: CODE,  profile_id: pA, revoked: false },
    { code: OTHER, profile_id: pB, revoked: false },
  ]);
  const { data: row } = await admin.from('teacher_months').insert({
    month_key: MONTH, school_id: s1.id, name: 'מורה בקישור', phone: '0501112233', email: 'link@example.com', reform: 'ofek',
    frontal_hours: 26, scope_pct: 100, seniority: 4, official_gross: 11000, official_gross_pre: 10500,
  }).select().single();
  await admin.from('teacher_months').insert({
    month_key: MONTH, school_id: s2.id, name: 'מורה של אחרת', phone: '0504445566', email: 'other@example.com', reform: 'ofek', frontal_hours: 20,
  });

  // ── קוד תקף ──
  await p.goto(`http://localhost:5190/?k=${CODE}`);
  await p.getByText('מורה בקישור').first().waitFor({ timeout: 20000 });
  const body = await p.locator('body').innerText();
  check('נפתח בלי מסך התחברות', !body.includes('כניסה למערכת'));
  check('מציג את שם בית הספר',  body.includes(S1));
  check('ואת שם המנהלת',        body.includes('מסך קישור מנהלת'));
  check('אינו מציג בית ספר אחר', !body.includes('מורה של אחרת'));
  check('אין עמודות כסף',       !body.includes('11,000') && !body.includes('הוצאות מעביד'));

  // ── שמירה ──
  const hours = fld(p, 'שעות פרונטליות');
  await hours.fill('18');
  await clickSave(p);
  const savedHours = await settled(row.id, r => r.frontal_hours === 18);
  if (!savedHours && await blockedOnScreen()) filtered = true;
  if (!filtered && !savedHours) check('שמירה דרך הקישור הגיעה לשרת', false, 'לא הגיעה תוך 15 שניות');
  if (!skipIfFiltered('שמירה דרך הקישור') && savedHours) {
    const { data: after } = await admin.from('teacher_months')
      .select('frontal_hours, official_gross, official_gross_pre, approved, changed_at').eq('id', row.id).single();
    check('השעות נשמרו בשרת', after.frontal_hours === 18, String(after.frontal_hours));
    check('ושינוי שעות איפס את הסימולציה',
      after.official_gross === null && after.official_gross_pre === null && !after.approved && !!after.changed_at,
      JSON.stringify(after));
  } else {
    check('הודעת החסימה בעברית ולא קוד HTML',
      (await p.locator('.apple-card').first().innerText()).includes('סינון התוכן'));
  }

  // שינוי שאינו נוגע לשכר אינו מבטל אישור.
  // הזנת השכר והאישור נעשים במשתמשים אמיתיים: מפתח השרת נחסם בטריגר,
  // שדורש פרופיל, ולכן עדכון דרכו נכשל בשקט ומזייף את הבדיקה.
  const clerkC = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await clerkC.auth.signInWithPassword({ email: CLERK, password: PW });
  const { error: ge } = await clerkC.from('teacher_months')
    .update({ official_gross: 11000, official_gross_pre: 10500 }).eq('id', row.id);
  check('חשבת הזינה שכר מחדש', !ge, ge?.message?.slice(0, 60) || '');
  const coordC = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await coordC.auth.signInWithPassword({ email: COORD, password: PW });
  const { error: ae } = await coordC.from('teacher_months').update({ approved: true }).eq('id', row.id);
  check('שליח אישר', !ae, ae?.message?.slice(0, 60) || '');
  await p.goto(`http://localhost:5190/?k=${CODE}`);
  await p.getByText('מורה בקישור').first().waitFor({ timeout: 20000 });
  const absence = fld(p, 'ימי היעדרות');
  await absence.fill('3');
  await clickSave(p);
  const savedAbs = await settled(row.id, r => r.absence_days === 3);
  if (!savedAbs && await blockedOnScreen()) filtered = true;
  if (!filtered && !savedAbs) check('שינוי ימי היעדרות הגיע לשרת', false, 'לא הגיע תוך 15 שניות');
  if (!skipIfFiltered('שינוי שאינו בשכר') && savedAbs) {
    const { data: abs } = await admin.from('teacher_months')
      .select('absence_days, official_gross, approved').eq('id', row.id).single();
    check('ימי היעדרות נשמרו', abs.absence_days === 3, String(abs.absence_days));
    check('ושינוי שאינו בשכר אינו מבטל את האישור',
      abs.official_gross === 11000 && abs.approved === true, JSON.stringify(abs));
  }

  // ── חודש נעול ──
  await admin.from('months').update({ locked: true }).eq('key', MONTH);
  await p.goto(`http://localhost:5190/?k=${CODE}`);
  // הבאנר עצמו: משנפתחו כמה חודשים, "נעול" מופיע גם כאפשרות מוסתרת בבורר
  await p.getByText('החודש נעול').first().waitFor({ timeout: 20000 });
  check('חודש נעול מוצג ככזה', true);
  check('וכפתור השמירה מנוטרל', await p.getByRole('button', { name: 'שמירה' }).first().isDisabled());
  await admin.from('months').update({ locked: false }).eq('key', MONTH);

  // ── קוד שגוי ומבוטל ──
  await p.goto('http://localhost:5190/?k=zzzzzzzzzzzzzzzzzzzz');
  await p.getByText('הקישור אינו תקף').first().waitFor({ timeout: 20000 });
  check('קוד שגוי מקבל הודעה ברורה, לא מסך ריק', true);
  await admin.from('access_links').update({ revoked: true }).eq('code', CODE);
  await p.goto(`http://localhost:5190/?k=${CODE}`);
  await p.getByText('הקישור אינו תקף').first().waitFor({ timeout: 20000 });
  check('קוד מבוטל נחסם מיד', true);

  // ── בלי קוד — מסך התחברות רגיל ──
  await p.goto('http://localhost:5190/');
  await p.getByText('כניסה למערכת').first().waitFor({ timeout: 20000 });
  check('בלי קוד נפתח מסך ההתחברות הרגיל', true);
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 200));
} finally {
  await b.close();
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
