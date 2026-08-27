// המסלול של רינה: קישור לכל מנהלת, והמנהלת ממלאת את הרשימה מאפס —
// שם, ת.ז., מסלול, תואר, דרגה, ותק ושעות. כל מה שצריך כדי לחשב שכר.
//
// הגבול שחייב להישבר בקול: דרך הקישור אין דרך להזין כסף או לאשר,
// ואי אפשר לגעת בבית ספר אחר.
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon  = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

const MONTH = '2098-10';
const S1 = 'קישור מלא בדיקה', S2 = 'קישור מלא אחר';
const CODE = 'fulltestaaaaaaaaaaaa', OTHER = 'fulltestbbbbbbbbbbbb';

async function cleanup() {
  await admin.from('access_links').delete().in('code', [CODE, OTHER]);
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  const { data: ps } = await admin.from('profiles').select('id, full_name').like('full_name', 'קישור מלא%');
  for (const x of ps || []) {
    await admin.from('profiles').delete().eq('id', x.id);
    const { error } = await admin.auth.admin.deleteUser(x.id);
    if (error) console.error('מחיקת משתמש:', error.message);
  }
  await admin.from('schools').delete().in('name', [S1, S2]);
}
const settled = async (pred, ms = 20000) => {
  const until = Date.now() + ms;
  for (;;) {
    const { data } = await admin.from('teacher_months').select('*').eq('month_key', MONTH);
    const hit = (data || []).find(pred);
    if (hit) return hit;
    if (filtered) return null;              // הרשת חסמה — לא המערכת
    if (Date.now() > until) return null;
    await new Promise(r => setTimeout(r, 400));
  }
};
const skipIfFiltered = (name) => {
  if (!filtered) return false;
  console.log(`SKIP  ${name} — סינון התוכן של הרשת חסם את הקריאה`);
  return true;
};
// בחירה לפי התווית ולא לפי מיקום: סדר השדות משתנה לפי המסלול (בעולם
// ישן אין דרגת אופק ויש ילדים עד 18), ואינדקסים הופכים את הבדיקה
// לשקרית ברגע שהטופס זז.
const fld = (card, label) => card.locator('label').filter({ hasText: label }).first().locator('input');
const sel = (card, label) => card.locator('label').filter({ hasText: label }).first().locator('select');
const clickWhenEnabled = async (scope, name) => {
  const btn = scope.getByRole('button', { name }).first();
  const until = Date.now() + 10000;
  while (await btn.isDisabled()) {
    if (Date.now() > until) throw new Error(`הכפתור "${name}" לא נפתח`);
    await new Promise(r => setTimeout(r, 100));
  }
  await btn.click();
};

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 430, height: 930 }, locale: 'he-IL' })).newPage();  // טלפון
// סינון התוכן של הרשת המקומית מחליף לפעמים תשובת RPC בדף HTML. זו לא
// תקלה במערכת, ולכן הבדיקה מזהה ומדלגת במקום להיכשל.
let filtered = false;
p.on('response', async r => {
  if (!/link_/.test(r.url())) return;
  const t = await r.text().catch(() => '');
  if (/safepage|netspark|neto\.net\.il/i.test(t)) filtered = true;
});

try {
  await cleanup();
  const { data: s1 } = await admin.from('schools').insert({ name: S1, reform: 'ofek', hours_quota: 400 }).select().single();
  const { data: s2 } = await admin.from('schools').insert({ name: S2, reform: 'ofek', hours_quota: 400 }).select().single();
  await admin.from('months').insert({ key: MONTH });
  const mk = async (name, school) => {
    const { data } = await admin.auth.admin.createUser({ email: `fl-${Math.random().toString(36).slice(2)}@link.local`, email_confirm: true });
    await admin.from('profiles').insert({ id: data.user.id, full_name: name, role: 'principal', school_id: school });
    return data.user.id;
  };
  const pA = await mk('קישור מלא מנהלת', s1.id);
  const pB = await mk('קישור מלא אחרת', s2.id);
  await admin.from('access_links').insert([
    { code: CODE, profile_id: pA, revoked: false },
    { code: OTHER, profile_id: pB, revoked: false },
  ]);

  // ══ 1. רשימה ריקה — המנהלת ממלאת אותה ══
  await p.goto(`http://localhost:5190/?k=${CODE}`);
  await p.getByText('אין עדיין עובדי הוראה').first().waitFor({ timeout: 20000 });
  let body = await p.locator('body').innerText();
  check('רשימה ריקה מזמינה למלא, כולל את עצמה', body.includes('כולל את עצמך') && body.includes('שאושר בבניית התקציב'));
  check('ויש כפתור הוספה', await p.getByRole('button', { name: /הוספת עובד\/ת הוראה/ }).count() > 0);

  // ══ 2. מורת אופק — כל הפרטים ══
  await p.getByRole('button', { name: /הוספת עובד\/ת הוראה/ }).click();
  await p.getByText('עובד/ת הוראה חדש/ה').first().waitFor({ timeout: 10000 });
  const card = p.locator('.apple-card').filter({ hasText: 'עובד/ת הוראה חדש/ה' }).first();
  await fld(card, 'שם עובד/ת ההוראה').fill('חנה כהן');
  await fld(card, 'ת.ז.').fill('123456789');
  await fld(card, 'טלפון').fill('054-1112222');
  await fld(card, 'מייל').fill('hana@example.com');
  await sel(card, 'מסלול').selectOption('ofek');
  await sel(card, 'תואר').selectOption('MA');
  await sel(card, 'דרגה באופק').selectOption('5');
  await fld(card, 'ותק בהוראה').fill('8');
  await sel(card, 'שלב').selectOption('middle');
  await sel(card, 'גמול תפקיד').selectOption('homeroom2');
  await fld(card, 'שעות פרונטליות').fill('23');
  await clickWhenEnabled(p, /^הוספה$/);
  const hana = await settled(r => r.name === 'חנה כהן');
  if (!skipIfFiltered('הוספה דרך הקישור')) check('מורת אופק נוספה דרך הקישור', !!hana, hana ? '' : 'לא הגיעה');
  if (hana) {
    check('כל פרטי החישוב נשמרו',
      hana.reform === 'ofek' && hana.degree === 'MA' && hana.grade === '5' && hana.seniority === 8
      && hana.level === 'middle' && hana.gamul_role === 'homeroom2' && hana.frontal_hours === 23,
      JSON.stringify({ r: hana.reform, d: hana.degree, g: hana.grade, s: hana.seniority, l: hana.level, gr: hana.gamul_role, f: hana.frontal_hours }));
    check('ת.ז. נשמרה', hana.tz_id === '123456789', hana.tz_id || 'ריק');
    // חטיבת ביניים: בסיס 23 שעות → 23 שעות = 100%
    check('אחוז המשרה נגזר מהשעות ומהשלב', hana.scope_pct === 100, `${hana.scope_pct}%`);
    check('והשורה ממתינה לחשבת השכר', !!hana.changed_at && hana.official_gross === null);
    check('בית הספר נגזר מהקוד', hana.school_id === s1.id);
  }

  if (!hana) {
    console.log('SKIP  שאר הבדיקה — לא נוצרה שורה ראשונה');
  } else {
  // ══ 3. מורת עולם ישן — ילדים עד 18 במקום דרגה ══
  await p.getByRole('button', { name: /הוספת עובד\/ת הוראה/ }).click();
  const card2 = p.locator('.apple-card').filter({ hasText: 'עובד/ת הוראה חדש/ה' }).first();
  await fld(card2, 'שם עובד/ת ההוראה').fill('מרים לוי');
  await fld(card2, 'טלפון').fill('052-3334444');
  await fld(card2, 'מייל').fill('miriam@example.com');
  await sel(card2, 'מסלול').selectOption('pre');
  await p.waitForTimeout(500);
  check('בעולם ישן אין בורר דרגת אופק', await card2.getByText('דרגה באופק').count() === 0);
  check('ויש שדה ילדים עד 18', await card2.getByText('ילדים עד 18').count() > 0);
  await sel(card2, 'תואר').selectOption('BA');
  await fld(card2, 'ותק בהוראה').fill('12');
  await fld(card2, 'ילדים עד 18').fill('3');
  await fld(card2, 'שעות פרונטליות').fill('20');
  await clickWhenEnabled(p, /^הוספה$/);
  const miriam = await settled(r => r.name === 'מרים לוי');
  if (!miriam && !filtered) {
    const { data: all } = await admin.from('teacher_months').select('name, reform, month_key').eq('month_key', MONTH);
    console.log('      במסד: ' + JSON.stringify(all));
    for (const lbl of ['שם המורה', 'ותק בהוראה', 'ילדים עד 18', 'שעות פרונטליות']) {
      const v = await fld(card2, lbl).inputValue().catch(() => '(אין שדה)');
      console.log(`      ${lbl} = ${JSON.stringify(v)}`);
    }
    const err = await card2.locator('span').filter({ hasText: /יש למלא|נכשל|שגיא/ }).allInnerTexts().catch(() => []);
    console.log('      שגיאה בכרטיס: ' + JSON.stringify(err));
  }
  if (!skipIfFiltered('מורת עולם ישן נוספה')) check('מורת עולם ישן נוספה', !!miriam, miriam ? '' : 'לא הגיעה');
  if (miriam) check('עם ותק, ילדים ושעות', miriam.reform === 'pre' && miriam.seniority === 12 && miriam.children_under_18 === 3 && miriam.frontal_hours === 20,
    JSON.stringify({ r: miriam.reform, s: miriam.seniority, c: miriam.children_under_18, f: miriam.frontal_hours }));

  // ══ 4. עריכת מורה קיימת — אותם שדות ══
  if (filtered || !hana) {
    console.log('SKIP  עריכה, חל"ד והגבולות — סינון התוכן חסם את היצירה, אין על מה לבדוק');
  } else {
  await p.reload();
  await p.getByText('חנה כהן').first().waitFor({ timeout: 20000 });
  const hCard = p.locator('.apple-card').filter({ hasText: 'חנה כהן' }).first();
  await fld(hCard, 'ותק בהוראה').fill('11');   // 8 → 11
  // הכפתור של הכרטיס הזה, לא הראשון בעמוד — יש כמה מורות ברשימה
  await clickWhenEnabled(hCard, /^שמירה$/);
  const edited = await settled(r => r.id === hana.id && r.seniority === 11);
  if (!skipIfFiltered('מנהלת מעדכנת ותק דרך הקישור')) check('מנהלת מעדכנת ותק דרך הקישור', !!edited, edited ? '' : 'לא נשמר');
  if (edited) check('ונשמר צילום "לפני" לשליח', !!edited.snapshot, JSON.stringify(edited.snapshot).slice(0, 60));

  // ══ 4b. יציאה לחל"ד עם תאריך ══
  await sel(hCard, 'סטטוס').selectOption('maternity');
  await p.waitForTimeout(400);
  check('בחירת חל"ד חושפת שדות תאריך', await hCard.getByText('מתאריך').count() > 0);
  await fld(hCard, 'מתאריך').fill('2098-11-01');
  await fld(hCard, 'עד תאריך').fill('2099-02-15');
  await clickWhenEnabled(hCard, /^שמירה$/);
  const onLeave = await settled(r => r.id === hana.id && r.leave_type === 'maternity');
  if (!skipIfFiltered('חל"ד נשמר עם תאריכים')) check('חל"ד נשמר עם תאריכים', !!onLeave && onLeave.leave_from === '2098-11-01' && onLeave.leave_to === '2099-02-15',
    onLeave ? `${onLeave.leave_from} → ${onLeave.leave_to}` : 'לא נשמר');
  if (onLeave) {
    check('ויציאה לחופשה מחזירה את המורה לחישוב מחדש', onLeave.official_gross === null && onLeave.approved === false);
    await p.waitForTimeout(600);
    check('התג מוצג בכרטיס', (await p.locator('body').innerText()).includes('חופשת לידה'));
  }
  // חופשה בלי תאריך נדחית בשרת
  const { error: noDate } = await anon.rpc('link_add_row', {
    p_code: CODE, p_month: MONTH, p_row: { name: 'ללא תאריך', phone: '0500000000', email: 'x@example.com', leave_type: 'maternity' },
  });
  check('חופשה בלי תאריך נחסמת', /תאריך יציאה/.test(noDate?.message || ''), noDate?.message?.slice(0, 60) || 'עבר!');

  // ══ 5. הגבולות ══
  const { error: moneyErr } = await anon.rpc('link_add_row', {
    p_code: CODE, p_month: MONTH,
    p_row: { name: 'ניסיון כסף', phone: '0500000000', email: 'x@example.com', official_gross: 99999, approved: true, school_id: s2.id },
  });
  const cheat = await settled(r => r.name === 'ניסיון כסף', 4000);
  check('דרך הקישור אי אפשר להזין שכר או לאשר',
    !!cheat && cheat.official_gross === null && cheat.approved === false,
    moneyErr?.message || JSON.stringify({ g: cheat?.official_gross, a: cheat?.approved }));
  check('ובית ספר אחר נדחה — השורה נכתבה לבית הספר של הקוד', cheat?.school_id === s1.id);
  const { error: noName } = await anon.rpc('link_add_row', { p_code: CODE, p_month: MONTH, p_row: { name: '  ' } });
  check('שם ריק נחסם בעברית', /יש למלא שם/.test(noName?.message || ''), noName?.message?.slice(0, 60) || 'עבר!');
  const { error: badCode } = await anon.rpc('link_add_row', { p_code: 'zzzzzzzzzzzzzzzzzzzz', p_month: MONTH, p_row: { name: 'ניסיון', phone: '0500000000', email: 'x@example.com' } });
  check('קוד שגוי אינו מוסיף', /אינו תקף/.test(badCode?.message || ''), badCode?.message?.slice(0, 60) || 'עבר!');

  // חודש נעול
  await admin.from('months').update({ locked: true }).eq('key', MONTH);
  const { error: lockedErr } = await anon.rpc('link_add_row', { p_code: CODE, p_month: MONTH, p_row: { name: 'ניסיון נעול', phone: '0500000000', email: 'x@example.com' } });
  check('חודש נעול חוסם הוספה', /נעול/.test(lockedErr?.message || ''), lockedErr?.message?.slice(0, 60) || 'עבר!');
  await p.reload();
  // הבאנר עצמו, לא כל טקסט. משנפתחו כמה חודשים, המילה "נעול" מופיעה
  // גם באפשרות מוסתרת בבורר החודשים.
  await p.getByText('החודש נעול').first().waitFor({ timeout: 20000 });
  check('ובמסך אין כפתור הוספה', await p.getByRole('button', { name: /הוספת עובד\/ת הוראה/ }).count() === 0);
  await admin.from('months').update({ locked: false }).eq('key', MONTH);
  }
  }
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 220));
} finally {
  await b.close();
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
