// מסך האישור הרשתי — המסך עם הסיכון הגבוה ביותר: אדם אחד חותם על מספר.
//
// מה שנשבר בו לפני התיקון: המאשרת נחתה על החודש הקלנדרי וראתה "אין
// צורך"; מענדי וחנה חתמו בשם "רינה אלהרר"; "אישור כל הרשת" סיים
// ב"הכול מאושר" בזמן שעפולה חיכתה; ושורה שהסימולציה שלה נמחקה אחרי
// האישור הגיעה לחתימה עם בסיס 0.
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

const PW = 'Net!' + Math.random().toString(36).slice(2, 9);
// חודשים מוקדמים מכל חודש אמיתי במערכת: "החודש הראשון" הוא הראשון
// בכל המסד, ומרגע שנפתח חודש עבודה אמיתי בדיקה בשנת 2098 אינה יכולה
// להיות ראשונה.
const M1 = '2019-01', M2 = '2019-02';
const S_GEN = 'רשתי בדיקה כללי', S_DED = 'רשתי בדיקה ייעודי';
const U = {
  coord: 'net-coord@example.com', clerk: 'net-clerk@example.com',
  rina: 'net-general@example.com', mendy: 'net-dedicated@example.com',
};

async function cleanup() {
  await admin.from('teacher_months').delete().in('month_key', [M1, M2]);
  await admin.from('months').delete().in('key', [M1, M2]);
  const { data: us } = await admin.auth.admin.listUsers();
  for (const email of Object.values(U)) {
    const u = us?.users?.find(x => x.email === email);
    if (u) { await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {}); }
  }
  await admin.from('schools').delete().in('name', [S_GEN, S_DED]);
}
const client = async (email) => {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`כניסה ${email}: ${error.message}`);
  return c;
};

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' })).newPage();
const login = async (email) => {
  await p.goto('http://localhost:5190/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.getByPlaceholder('name@reshetch.org.il').fill(email);
  await p.locator('input[type="password"]').fill(PW);
  await p.getByRole('button', { name: /כניסה למערכת/ }).click();
  await p.getByRole('button', { name: /יציאה/ }).first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(1200);   // הנחיתה על החודש הראשון קורית אחרי הטעינה
};

try {
  await cleanup();
  const { data: sGen } = await admin.from('schools').insert({ name: S_GEN, reform: 'ofek', hours_quota: 400 }).select().single();
  const { data: sDed } = await admin.from('schools').insert({ name: S_DED, reform: 'ofek', hours_quota: 400 }).select().single();
  await admin.from('months').insert([{ key: M1 }, { key: M2 }]);
  const mk = async (email, name, role, school) => {
    const { data } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    await admin.from('profiles').insert({ id: data.user.id, full_name: name, role, school_id: school ?? null });
  };
  await mk(U.coord, 'שליח רשתי', 'coordinator');
  await mk(U.clerk, 'חשבת רשתי', 'clerk');
  await mk(U.rina,  'רינה בדיקה', 'network');            // כללית — בלי בית ספר
  await mk(U.mendy, 'מענדי בדיקה', 'network', sDed.id);  // ייעודי

  // שלוש מורות בחודש הראשון: שתיים אצל הכללית, אחת אצל הייעודי
  const rows = [];
  for (const [school, name] of [[sGen.id, 'רשתי מורה א'], [sGen.id, 'רשתי מורה ב'], [sDed.id, 'רשתי מורה ג']]) {
    const { data } = await admin.from('teacher_months').insert({
      month_key: M1, school_id: school, name, reform: 'ofek', level: 'elementary', degree: 'BA', grade: '5',
      seniority: 8, frontal_hours: 26, scope_pct: 100, changed_at: new Date().toISOString(),
    }).select().single();
    rows.push(data);
  }
  const clerk = await client(U.clerk);
  for (const r of rows) {
    const { error } = await clerk.from('teacher_months').update({ official_gross: 12500, official_gross_pre: 11200 }).eq('id', r.id);
    if (error) throw new Error('חשבת: ' + error.message);
  }
  const coord = await client(U.coord);
  for (const r of rows) {
    const { error } = await coord.from('teacher_months').update({ approved: true }).eq('id', r.id);
    if (error) throw new Error('שליח: ' + error.message);
  }

  // "החודש הראשון" הוא הראשון בכל המסד. אם חבילה אחרת או שריד השאירו
  // חודש מוקדם יותר, הבדיקה תאמר זאת במפורש במקום להיכשל על נחיתה נכונה.
  const { data: allMonths } = await admin.from('months').select('key').order('key');
  const firstKey = allMonths[0].key;
  check('החודש הראשון במסד הוא של הבדיקה (אין שרידים מוקדמים יותר)', firstKey === M1,
    firstKey === M1 ? '' : `הראשון הוא ${firstKey} — נקי את המסד (scripts/list-leftovers.mjs)`);

  // ── 1. השליח: "אצל" בשם הנכון לכל בית ספר ──
  await login(U.coord);
  await p.selectOption('select[title="בחירת חודש"]', M1);
  await p.waitForTimeout(800);
  let body = await p.locator('body').innerText();
  check('בורר החודש הוא רשימה, והחודש הראשון מסומן', body.includes('· ראשון'));
  check('תג ההדר סופר את שני המאשרים', body.includes('3 באישור רשתי'), body.match(/\d+ (באישור רשתי|אצל [^\n·]+)/)?.[0] || 'לא נמצא');
  await p.getByText(S_DED).first().click();
  await p.getByText('רשתי מורה ג').first().waitFor({ timeout: 10000 });
  body = await p.locator('body').innerText();
  check('בבית הספר הייעודי — "אצל מענדי", לא "אצל רינה"', body.includes('אצל מענדי בדיקה') && !body.includes('אצל רינה'));

  // ── 2. המאשרת הכללית נוחתת על החודש הראשון ──
  await login(U.rina);
  body = await p.locator('body').innerText();
  check('רינה נחתה על החודש הראשון, לא על האחרון', body.includes('אישור רשתי — ינואר 2019'), body.match(/אישור רשתי — [^\n]+/)?.[0] || body.slice(0, 120));
  check('הכותרת בשמה האמיתי', body.includes('רינה בדיקה · אישור רשתי'));
  check('הכפתור אומר על מה הוא חל', body.includes('אישור כל בתי הספר באחריותך'));
  check('היא רואה עובדת אחת פחות — של הייעודי לא', body.includes('2 עובדות ממתינות'), body.match(/\S+ עובדות ממתינות|עובדת אחת ממתינות/)?.[0] || '');
  check('עלות שנתית מוצגת', /₪ לשנה/.test(body));

  // מעבר לחודש השני — והחזרה
  await p.selectOption('select[title="בחירת חודש"]', M2);
  await p.waitForTimeout(800);
  body = await p.locator('body').innerText();
  check('בחודש השני היא מקבלת קישור חזרה, לא מסך ירוק סתום', body.includes('ממתינות לך בינואר 2019'));
  await p.getByRole('button', { name: /ממתינות לך/ }).click();
  await p.waitForTimeout(800);
  check('הקישור מחזיר לחודש הראשון', (await p.locator('body').innerText()).includes('אישור רשתי — ינואר 2019'));

  // ── 3. הפירוט בטבלה ──
  await p.getByText('הצג פירוט').first().click();
  await p.waitForTimeout(500);
  body = await p.locator('body').innerText();
  check('שש השורות של הוצאות המעביד מוצגות למאשרת', ['פנסיה ופיצויים', 'קרן השתלמות', 'מס שכר', 'ביטוח לאומי', 'הבראה', 'ביגוד'].every(x => body.includes(x)));

  // ── 4. שורה שהסימולציה שלה נמחקה אחרי האישור נעלמת מהתור ──
  await coord.from('teacher_months').update({ official_gross_pre: null }).eq('id', rows[1].id);
  await p.reload();
  await p.getByRole('button', { name: /יציאה/ }).first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(1200);
  body = await p.locator('body').innerText();
  check('שורה בלי סימולציה מלאה לא מוצעת לחתימה', body.includes('עובדת אחת ממתינות') && !body.includes('רשתי מורה ב'), body.match(/\S+ ממתינות/)?.[0] || '');

  // ── 5. אישור — ומה נאמר אחריו ──
  p.once('dialog', d => d.accept());
  await p.getByRole('button', { name: /אישור כל בתי הספר באחריותך/ }).click();
  await p.waitForTimeout(2500);
  body = await p.locator('body').innerText();
  check('אחרי האישור לא נאמר "הכול מאושר"', !body.includes('הכול מאושר'));
  check('אלא "סיימת את שלך" עם מי מאשר את השאר', body.includes('סיימת את שלך') && body.includes(S_DED) && body.includes('מענדי בדיקה'));
  const { data: ded } = await admin.from('teacher_months').select('net_approved').eq('id', rows[2].id).single();
  check('והשורה של הייעודי לא נגעה', ded.net_approved === false);

  // ── 6. המאשר הייעודי ──
  await login(U.mendy);
  body = await p.locator('body').innerText();
  check('מענדי רואה את שמו ואת בית הספר שלו בכותרת', body.includes('מענדי בדיקה · אישור רשתי — ' + S_DED));
  check('והכפתור שלו אינו "כל הרשת"', body.includes('אישור ' + S_DED) && !body.includes('אישור כל הרשת'));
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 200));
} finally {
  await b.close();
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
