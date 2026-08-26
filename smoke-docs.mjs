// מסמכים מהנהלת החשבונות, וקישור למנהלת מהממשק.
//
// שני דברים שחשוב שיישברו בקול אם ישתנו: מנהלת בית ספר לא רואה את
// המסמכים (הם מכילים שכר של עובדות בשמן), ולקובץ אין כתובת קבועה —
// רק חד-פעמית.
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

const PW = 'Doc!' + Math.random().toString(36).slice(2, 9);
const MONTH = '2098-06', SCHOOL = 'מסמכים בדיקה';
const U = { coord: 'doc-coord@example.com', clerk: 'doc-clerk@example.com', prin: 'doc-prin@example.com' };
const FILE = 'דוח שכר בדיקה.pdf';

async function cleanup() {
  const { data: docs } = await admin.from('month_documents').select('path').eq('month_key', MONTH);
  if (docs?.length) await admin.storage.from('payroll-docs').remove(docs.map(d => d.path));
  await admin.from('month_documents').delete().eq('month_key', MONTH);
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  const { data: us } = await admin.auth.admin.listUsers();
  for (const email of Object.values(U)) {
    const u = us?.users?.find(x => x.email === email);
    if (u) {
      await admin.from('access_links').delete().eq('profile_id', u.id);
      await admin.from('profiles').delete().eq('id', u.id);
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) console.error('מחיקת', email, error.message);
    }
  }
  await admin.from('schools').delete().eq('name', SCHOOL);
}
const client = async (email) => {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`כניסה ${email}: ${error.message}`);
  return c;
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' });
const p = await ctx.newPage();
const login = async (email) => {
  await p.goto('http://localhost:5190/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.getByPlaceholder('name@reshetch.org.il').fill(email);
  await p.locator('input[type="password"]').fill(PW);
  await p.getByRole('button', { name: /כניסה למערכת/ }).click();
  await p.getByRole('button', { name: /יציאה/ }).first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(800);
  await p.selectOption('select[title="בחירת חודש"]', MONTH).catch(() => {});
  await p.waitForTimeout(800);
};

try {
  await cleanup();
  const { data: sc } = await admin.from('schools').insert({ name: SCHOOL, reform: 'ofek', hours_quota: 400 }).select().single();
  await admin.from('months').insert({ key: MONTH });
  const mk = async (email, name, role, school, phone) => {
    const { data } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    await admin.from('profiles').insert({ id: data.user.id, full_name: name, role, school_id: school ?? null, phone: phone ?? null });
    return data.user.id;
  };
  await mk(U.coord, 'שליח מסמכים', 'coordinator');
  await mk(U.clerk, 'חשבת מסמכים', 'clerk');
  const prinId = await mk(U.prin, 'מנהלת מסמכים', 'principal', sc.id, '+972501234567');
  await admin.from('teacher_months').insert({
    month_key: MONTH, school_id: sc.id, name: 'מורת מסמכים', reform: 'ofek',
    frontal_hours: 26, scope_pct: 100, changed_at: new Date().toISOString(),
  });

  // ── 1. אסתר מעלה קובץ ──
  await login(U.clerk);
  await p.getByText('מסמכים מהנהלת החשבונות').first().waitFor({ timeout: 15000 });
  check('לחשבת השכר יש פאנל מסמכים לחודש', true);
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
  await p.getByPlaceholder('הערה (לא חובה)').fill('דוח שכר מהמשרד');
  await p.locator('input[type="file"]').setInputFiles({ name: FILE, mimeType: 'application/pdf', buffer: pdfBytes });
  await p.getByText(FILE).first().waitFor({ timeout: 20000 });
  check('הקובץ מופיע ברשימה אחרי ההעלאה', true);
  const { data: rows } = await admin.from('month_documents').select('*').eq('month_key', MONTH);
  check('נרשם במסד עם השם המקורי וההערה', rows?.length === 1 && rows[0].file_name === FILE && rows[0].note === 'דוח שכר מהמשרד', JSON.stringify(rows?.[0] || {}).slice(0, 120));
  check('הנתיב בדלי אינו מכיל את השם העברי', rows?.[0] && !/[\u0590-\u05FF ]/.test(rows[0].path), rows?.[0]?.path || '');
  const { data: obj, error: oe } = await admin.storage.from('payroll-docs').download(rows[0].path);
  check('הקובץ עצמו נמצא בדלי', !oe && obj && (await obj.arrayBuffer()).byteLength === pdfBytes.length, oe?.message || '');

  // ── 2. השליח רואה במסך בית הספר ──
  await login(U.coord);
  await p.getByText(SCHOOL).first().click();
  await p.getByText(FILE).first().waitFor({ timeout: 15000 });
  check('השליח רואה את הקובץ במסך בית הספר', true);

  // ── 3. המנהלת — לא ──
  await login(U.prin);
  await p.getByText('מורת מסמכים').first().waitFor({ timeout: 15000 });
  const body = await p.locator('body').innerText();
  check('למנהלת אין פאנל מסמכים', !body.includes('מסמכים מהנהלת החשבונות') && !body.includes(FILE));
  const prin = await client(U.prin);
  const { data: prinRows } = await prin.from('month_documents').select('id');
  check('וגם ישירות מהמסד היא לא מקבלת שורות', (prinRows || []).length === 0, `${prinRows?.length} שורות`);
  const { data: prinFile, error: pfe } = await prin.storage.from('payroll-docs').download(rows[0].path);
  check('ולא את הקובץ מהדלי', !!pfe || !prinFile, pfe ? '' : 'הורד!');

  // ── 4. כתובת חד-פעמית ──
  const clerk = await client(U.clerk);
  const { data: signed } = await clerk.storage.from('payroll-docs').createSignedUrl(rows[0].path, 600);
  const res = await fetch(signed.signedUrl);
  check('כתובת חתומה נפתחת', res.status === 200, String(res.status));
  const pub = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/public/payroll-docs/${rows[0].path}`);
  check('ואין כתובת ציבורית', pub.status !== 200, String(pub.status));

  // ── 5. קישור למנהלת מהממשק ──
  await login(U.coord);
  await p.getByText(SCHOOL).first().click();
  await p.getByRole('button', { name: /קישור למנהלת/ }).click();
  await p.getByRole('button', { name: /הנפקת קישור חדש/ }).waitFor({ timeout: 15000 });
  const { data: before } = await admin.from('access_links').select('code').eq('profile_id', prinId);
  check('פתיחת החלון לבדה אינה מנפיקה קישור', (before || []).length === 0, `${before?.length} קישורים`);
  await p.getByRole('button', { name: /הנפקת קישור חדש/ }).click();
  await p.locator('input[readonly]').first().waitFor({ timeout: 15000 });
  const link = await p.locator('input[readonly]').first().inputValue();
  check('הונפק קישור אישי', /\?k=[a-z0-9]{20}$/.test(link), link);
  const wa = await p.locator('a[href^="https://wa.me/"]').first().getAttribute('href');
  check('ויש כפתור וואטסאפ עם המספר הנכון', (wa || '').startsWith('https://wa.me/972501234567?text='), (wa || '').slice(0, 50));
  check('ההודעה בוואטסאפ מכילה את הקישור', decodeURIComponent(wa || '').includes(link));
  const { data: links } = await admin.from('access_links').select('code, revoked').eq('profile_id', prinId);
  check('במסד קישור פעיל אחד', links?.filter(l => !l.revoked).length === 1, JSON.stringify(links));
  // הנפקה שנייה מבטלת את הראשונה
  await p.getByRole('button', { name: /סגירה/ }).click();
  await p.getByRole('button', { name: /קישור למנהלת/ }).click();
  await p.getByRole('button', { name: /הנפקת קישור חדש/ }).click();
  await p.locator('input[readonly]').first().waitFor({ timeout: 15000 });
  const link2 = await p.locator('input[readonly]').first().inputValue();
  const { data: links2 } = await admin.from('access_links').select('code, revoked').eq('profile_id', prinId);
  check('הנפקה חוזרת מבטלת את הקישור הקודם', link2 !== link && links2?.filter(l => !l.revoked).length === 1 && links2.length === 2, JSON.stringify(links2));
  await p.getByRole('button', { name: /סגירה/ }).click();

  // ── 6. הקישור החדש באמת עובד למנהלת ──
  const p2 = await (await b.newContext({ viewport: { width: 430, height: 930 }, locale: 'he-IL' })).newPage();
  await p2.goto(link2);
  await p2.getByText('מורת מסמכים').first().waitFor({ timeout: 20000 });
  check('הקישור שהונפק מהממשק פותח את המסך של המנהלת', true);
  await p2.goto(link);
  await p2.getByText('הקישור אינו תקף').first().waitFor({ timeout: 20000 });
  check('והקישור הישן נחסם', true);
  await p2.close();

  // ── 7. מחיקה ──
  await login(U.clerk);
  await p.getByText(FILE).first().waitFor({ timeout: 15000 });
  p.once('dialog', d => d.accept());
  await p.locator('button[title="מחיקה"]').first().click();
  await p.getByText('אין עדיין מסמכים').first().waitFor({ timeout: 15000 });
  const { data: after } = await admin.from('month_documents').select('id').eq('month_key', MONTH);
  const { data: gone, error: ge } = await admin.storage.from('payroll-docs').download(rows[0].path);
  check('מחיקה מסירה גם את הרישום וגם את הקובץ', (after || []).length === 0 && (!!ge || !gone));
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 220));
} finally {
  await b.close();
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
