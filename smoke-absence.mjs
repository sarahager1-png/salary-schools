// היעדרות עם אישור ומילוי מקום תואם לשעות (שרה, 4.10.26) — מול מסד הבדיקות.
// בודק את הכללים דרך הקישור של המנהלת, בדיוק כפי שהדפדפן קורא להם (לקוח anon),
// עם כל הטריגרים האמיתיים של הטבלה.
import fs from 'node:fs';
import { ENV_FILE } from './test-env.mjs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon  = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const fails = [];
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!ok) fails.push(n); };

const MONTH = '2096-04';
const S1 = 'היעדרות בדיקה א', S2 = 'היעדרות בדיקה ב';
const CODE_A = 'abstestaaaaaaaaaaaaa', CODE_B = 'abstestbbbbbbbbbbbbb';
const uploaded = [];

async function cleanup() {
  if (uploaded.length) await admin.storage.from('sick-forms').remove(uploaded).catch(() => {});
  const { data: tms } = await admin.from('teacher_months').select('id').eq('month_key', MONTH);
  const ids = (tms || []).map(t => t.id);
  if (ids.length) {
    const { data: objs } = await admin.storage.from('sick-forms').list(MONTH, { limit: 100 });
    for (const dir of objs || []) {
      const { data: inner } = await admin.storage.from('sick-forms').list(`${MONTH}/${dir.name}`, { limit: 100 });
      if (inner?.length) await admin.storage.from('sick-forms').remove(inner.map(o => `${MONTH}/${dir.name}/${o.name}`));
    }
  }
  await admin.from('notifications').delete().eq('month_key', MONTH);
  await admin.from('access_links').delete().in('code', [CODE_A, CODE_B]);
  await admin.from('teacher_months').delete().eq('month_key', MONTH);
  await admin.from('months').delete().eq('key', MONTH);
  const { data: profs } = await admin.from('profiles').select('id').like('full_name', 'היעדרות בדיקה%');
  for (const p of profs || []) { await admin.from('profiles').delete().eq('id', p.id); await admin.auth.admin.deleteUser(p.id).catch(() => {}); }
  await admin.from('schools').delete().in('name', [S1, S2]);
}

const save = (code, row) => anon.rpc('link_save_row', { p_code: code, p_row: row });
const attach = (code, id, path) => anon.rpc('link_attach_doc', { p_code: code, p_row: id, p_path: path });
const rowOf = async (id) => (await admin.from('teacher_months').select('*').eq('id', id).single()).data;
const notifs = async (id) => (await admin.from('notifications').select('status, to_phone, body, send_after')
  .eq('kind', 'absence_doc_needed').eq('teacher_id', id)).data || [];
const putDoc = async (id, n = 1) => {
  const path = `${MONTH}/${id}/${n}.pdf`;
  const { error } = await admin.storage.from('sick-forms').upload(path, Buffer.from('%PDF-1.4 smoke'), { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error('העלאת קובץ הבדיקה נכשלה: ' + error.message);
  uploaded.push(path);
  return path;
};

const day = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }).slice(8, 10));
if (day > 20) {
  console.log('הדיווח מהקישור פתוח רק מה-1 עד ה-20. הבדיקה הזו אינה יכולה לרוץ היום — זה אינו מעבר.');
  process.exit(2);
}

try {
  await cleanup();
  const { data: s1 } = await admin.from('schools').insert({ name: S1, reform: 'ofek' }).select().single();
  const { data: s2 } = await admin.from('schools').insert({ name: S2, reform: 'ofek' }).select().single();
  await admin.from('months').insert({ key: MONTH });
  const mkPrincipal = async (name, school) => {
    const { data, error } = await admin.auth.admin.createUser({ email: `abs-${Math.random().toString(36).slice(2)}@link.local`, email_confirm: true });
    if (error) throw new Error('יצירת משתמשת נכשלה: ' + error.message);
    const { error: pe } = await admin.from('profiles').insert({ id: data.user.id, full_name: name, role: 'principal', school_id: school });
    if (pe) throw new Error('יצירת פרופיל נכשלה: ' + pe.message);
    return data.user.id;
  };
  const pA = await mkPrincipal('היעדרות בדיקה מנהלת א', s1.id);
  const pB = await mkPrincipal('היעדרות בדיקה מנהלת ב', s2.id);
  const { error: linkErr } = await admin.from('access_links').insert([
    { code: CODE_A, profile_id: pA, revoked: false }, { code: CODE_B, profile_id: pB, revoked: false }]);
  if (linkErr) throw new Error('יצירת הקישורים נכשלה: ' + linkErr.message);
  const mk = async (name, extra = {}) => {
    const { data, error } = await admin.from('teacher_months')
      .insert({ month_key: MONTH, school_id: s1.id, name, frontal_hours: 20, phone: '0500000001', email: 'x@link.local', ...extra })
      .select().single();
    if (error) throw new Error('יצירת שורה נכשלה: ' + error.message);
    return data;
  };
  const absent = await mk('בדיקה נעדרת');
  const sub1 = await mk('בדיקה ממלאת א');
  const sub2 = await mk('בדיקה ממלאת ב');
  const mat = await mk('בדיקה בחופשת לידה', { leave_type: 'maternity', leave_from: '2096-03-01' });
  const idle = await mk('בדיקה בלי היעדרות');
  // שורות שנכנסות מהשרת (העתקת חודש), כולל שורה בחופשת לידה — בלי הודעת אישור.
  // הודעות מסוג אחר (קליטת עובדת) שייכות לטריגר אחר ואינן נבדקות כאן.
  const { data: seeded } = await admin.from('notifications').select('kind').eq('month_key', MONTH);
  check('שורות שנכנסו מהשרת אינן יוצרות הודעת אישור',
    !(seeded || []).some(x => x.kind === 'absence_doc_needed'),
    `סוגים בתור: ${[...new Set((seeded || []).map(x => x.kind))].join(', ') || 'אין'}`);

  // ══ 1. דיווח היעדרות בלי אישור ══
  let r = await save(CODE_A, { id: absent.id, absence_reason: 'sick', absence_days: 1, absence_hours: 4 });
  check('היעדרות בלי אישור נשמרת', !r.error, r.error?.message);
  let t = await rowOf(absent.id);
  check('הסיבה והשעות נשמרו', t.absence_reason === 'sick' && t.absence_hours === 4, `${t.absence_reason}/${t.absence_hours}`);
  check('הדיווח ממתין לאישור שרה', t.report_pending === true);
  let n = await notifs(absent.id);
  check('הודעה אחת לעובדת בתור', n.length === 1 && n[0].status === 'pending' && n[0].to_phone === '0500000001', JSON.stringify(n.map(x => x.status)));
  check('נוסח ההודעה', /עליך לשלוח אישור מחלה למנהלת בית הספר\./.test(n[0]?.body || ''), n[0]?.body);
  check('ההודעה ממתינה לפחות רבע שעה', n[0] && new Date(n[0].send_after) > new Date(Date.now() + 14 * 60000));
  await save(CODE_A, { id: absent.id, absence_days: 2 });
  check('שמירה חוזרת אינה שולחת הודעה שנייה', (await notifs(absent.id)).length === 1);

  // ══ 2. מילוי מקום מול שעות ההיעדרות ══
  r = await save(CODE_A, { id: sub1.id, mm_hours: 5, mm_for: 'בדיקה נעדרת', mm_from: '2096-04-05', mm_to: '2096-04-05' });
  check('5 שעות מול היעדרות של 4 — נדחה', /גבוהות משעות ההיעדרות/.test(r.error?.message || ''), r.error?.message);
  r = await save(CODE_A, { id: sub1.id, mm_hours: 3, mm_for: 'בדיקה נעדרת', mm_from: '2096-04-05', mm_to: '2096-04-05' });
  t = await rowOf(sub1.id);
  check('3 שעות — נשמר, כולל התאריך', !r.error && t.mm_hours === 3 && t.mm_from === '2096-04-05', r.error?.message);
  r = await save(CODE_A, { id: sub2.id, mm_hours: 2, mm_for: 'בדיקה נעדרת' });
  check('ממלאת שנייה: 3+2 מול 4 — נדחה', /גבוהות משעות ההיעדרות/.test(r.error?.message || ''), r.error?.message);
  r = await save(CODE_A, { id: sub2.id, mm_hours: 1, mm_for: 'בדיקה נעדרת' });
  check('ממלאת שנייה: 3+1 מול 4 — נשמר', !r.error, r.error?.message);
  r = await save(CODE_A, { id: sub2.id, mm_hours: 1, mm_for: 'שם שאינו קיים' });
  check('שם שאינו ברשימה — נדחה', /לא נמצא בבית הספר/.test(r.error?.message || ''), r.error?.message);
  r = await save(CODE_A, { id: sub2.id, mm_hours: 1, mm_for: 'בדיקה בלי היעדרות' });
  check('במקום מי שלא דווחה לה היעדרות — נדחה', /קודם יש לדווח את ההיעדרות/.test(r.error?.message || ''), r.error?.message);
  r = await save(CODE_A, { id: absent.id, absence_hours: 3 });
  check('הורדת שעות ההיעדרות מתחת למילוי המקום — נדחה', /כבר דווחו 4 שעות מילוי מקום/.test(r.error?.message || ''), r.error?.message);
  r = await save(CODE_A, { id: absent.id, name: 'בדיקה נעדרת שם חדש' });
  check('שינוי שם של נעדרת שדווח מולה מילוי מקום — נדחה', /ורק אחר כך לשנות את השם/.test(r.error?.message || ''), r.error?.message);

  // ══ 3. אישור ההיעדרות ══
  r = await save(CODE_A, { id: absent.id, sick_form_path: 'anything.pdf' });
  check('נתיב שרירותי — נדחה', /לא נמצא במערכת/.test(r.error?.message || ''), r.error?.message);
  r = await save(CODE_A, { id: absent.id, sick_form_path: `${MONTH}/${absent.id}/999.pdf` });
  check('נתיב נכון שלא הועלה — נדחה', /לא נמצא במערכת/.test(r.error?.message || ''), r.error?.message);
  const otherDoc = await putDoc(sub1.id);
  r = await save(CODE_A, { id: absent.id, sick_form_path: otherDoc });
  check('קובץ של שורה אחרת — נדחה', /לא נמצא במערכת/.test(r.error?.message || ''), r.error?.message);
  const doc = await putDoc(absent.id);
  r = await save(CODE_A, { id: absent.id, sick_form_path: doc });
  check('אישור אמיתי — נשמר', !r.error && (await rowOf(absent.id)).sick_form_path === doc, r.error?.message);
  n = await notifs(absent.id);
  check('ההודעה שטרם יצאה בוטלה', n.length === 1 && n[0].status === 'cancelled', JSON.stringify(n.map(x => x.status)));

  // ══ 4. חופשת לידה ══
  r = await save(CODE_A, { id: sub2.id, mm_hours: 18, mm_for: 'בדיקה בחופשת לידה', mm_from: null, mm_to: null });
  check('מחליפת חופשת לידה — שעות שבועיות, בלי התאמה לשעות', !r.error, r.error?.message);
  r = await save(CODE_A, { id: idle.id, absence_reason: 'maternity', leave_type: 'maternity', leave_from: '2096-04-06' });
  check('חופשת לידה חדשה נשמרת', !r.error, r.error?.message);
  check('ליולדת אין הודעה', (await notifs(idle.id)).length === 0);
  r = await save(CODE_A, { id: mat.id, leave_type: 'none', leave_from: null, leave_to: null });
  check('ביטול חופשה שמולה רשום מילוי מקום — נדחה', /כבר דווחו 18 שעות מילוי מקום/.test(r.error?.message || ''), r.error?.message);

  // ══ 5. צירוף אישור אחרי ה-20 — ליולדת בלבד ══
  const matDoc = await putDoc(mat.id);
  r = await attach(CODE_A, sub1.id, otherDoc);
  check('צירוף לשורה שאינה חופשת לידה — נדחה', /רק לחופשת לידה/.test(r.error?.message || ''), r.error?.message);
  r = await attach(CODE_B, mat.id, matDoc);
  check('קוד של בית ספר אחר — נדחה', /אינה שייכת לבית הספר/.test(r.error?.message || ''), r.error?.message);
  r = await attach('wrongcodewrongcode00', mat.id, matDoc);
  check('קוד שגוי — נדחה', /הקישור אינו תקף/.test(r.error?.message || ''), r.error?.message);
  r = await attach(CODE_A, mat.id, otherDoc);
  check('קובץ של שורה אחרת — נדחה', /לא נמצא במערכת/.test(r.error?.message || ''), r.error?.message);
  const beforeAttach = await rowOf(mat.id);
  r = await attach(CODE_A, mat.id, matDoc);
  t = await rowOf(mat.id);
  check('אישור ליולדת — נשמר', !r.error && t.sick_form_path === matDoc, r.error?.message);
  check('שום שדה אחר לא השתנה', t.report_pending === beforeAttach.report_pending && t.leave_type === 'maternity' && t.approved === beforeAttach.approved);
  await admin.from('teacher_months').update({ sick_form_path: null }).eq('id', mat.id);
  await admin.from('months').update({ locked: true }).eq('key', MONTH);
  r = await attach(CODE_A, mat.id, matDoc);
  check('חודש שננעל ביד — גם ליולדת נדחה', /נעול לשינויים/.test(r.error?.message || ''), r.error?.message);
  await admin.from('months').update({ locked: false }).eq('key', MONTH);

  // ══ 6. מחיקת דיווח ══
  r = await save(CODE_A, { id: sub1.id, mm_hours: 0, mm_for: null, mm_from: null, mm_to: null });
  t = await rowOf(sub1.id);
  check('מחיקת מילוי מקום מנקה גם "במקום מי" והתאריכים', !r.error && t.mm_hours === 0 && t.mm_for === null && t.mm_from === null, r.error?.message);

  // ══ 7. הטבלאות והפונקציות הפנימיות סגורות ══
  const { error: privErr } = await anon.rpc('enforce_absence_rules');
  check('פונקציות הטריגר אינן נגישות מבחוץ', !!privErr);
} catch (e) {
  check('הרצה ללא חריגה', false, e.message?.slice(0, 200));
} finally {
  await cleanup();
}

console.log(fails.length ? `\n${fails.length} כשלונות` : '\nהכול עבר');
process.exit(fails.length ? 1 : 0);
