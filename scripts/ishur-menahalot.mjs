/*
  דף אישור נתונים למנהלת — מה שהיא הזינה למערכת, בלי סימולציה ובלי שכר.
  "תכין לכל מנהלת את מסד הנתונים שהיא שלחה למערכת ללא סימולציה לאישור"
  (שרה, 8.9). דף אחד לכל בית ספר, A4 לרוחב, מוכן להדפסה ולשליחה.

  הרצה:  node scripts/ishur-menahalot.mjs [תיקיית-יעד] [YYYY-MM]
*/
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || 'ishur';
const MONTH = process.argv[3] || '2026-09';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const { data, error } = await sb.from('teacher_months')
  .select('*, schools(name, city)').eq('month_key', MONTH);
if (error) { console.error(error.message); process.exit(1); }

const REFORM = { ofek: 'אופק חדש', pre: 'עולם ישן' };
const DEGREE = { intern: 'מתמחה', unlicensed: 'לא מוסמך', senior: 'בכיר', BA: 'תואר ראשון', MA: 'תואר שני' };
const ROLE = { none: '—', homeroom: 'מחנכת ב׳-ו׳', homeroom1: 'מחנכת א׳', homeroom2: 'מחנכת חטיבה',
  subject6: 'רכזת מקצוע', subject8: 'רכזת מקצוע', team: 'ראש צוות',
  counselor: 'יועצת', counselor2: 'יועצת', principal: 'מנהלת' };
const AGE = { none: '—', age50: '50–55', age55: '55+ ותיקה', age55n: '55+ חדשה' };

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const MISS = '<span class="miss">חסר</span>';
const bad = v => `<span class="miss">${esc(v)}</span>`;

/*
  בדיקת תקינות, לא רק "מלא או ריק". השדות האלה הוקלדו ביד ולכן נכנס
  אליהם מה שלא צריך: ת.ז. עם שם משפחה בתוכה, ת.ז. שהיא בעצם מספר
  טלפון, טלפון בלי ה-0 בהתחלה. שדה מלא ושגוי מסוכן משדה ריק — הוא
  נראה תקין ואיש לא בודק אותו.
*/
const digits = v => String(v ?? '').replace(/\D/g, '');
const checkTz = v => {
  if (!v) return { ok: false, why: 'ת.ז. חסרה', html: MISS };
  const d = digits(v);
  if (/[א-ת]/.test(v)) return { ok: false, why: `ת.ז. מכילה טקסט (${v})`, html: bad(v) };
  if (d.length === 10 && d.startsWith('0')) return { ok: false, why: `בשדה ת.ז. הוקלד מספר טלפון (${v})`, html: bad(v) };
  if (d.length < 5 || d.length > 9) return { ok: false, why: `ת.ז. באורך ${d.length} ספרות (${v})`, html: bad(v) };
  return { ok: true, html: esc(d) };
};
const checkPhone = v => {
  if (!v) return { ok: false, why: 'טלפון חסר', html: MISS };
  const d = digits(v).replace(/^972/, '0');
  if (!/^0\d{9}$/.test(d)) return { ok: false, why: `טלפון לא תקין (${v})`, html: bad(v) };
  return { ok: true, html: esc(d.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')) };
};
const checkEmail = v => {
  if (!v) return { ok: false, why: 'מייל חסר', html: MISS };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())) return { ok: false, why: `מייל לא תקין (${v})`, html: bad(v) };
  return { ok: true, html: esc(v) };
};

const bySchool = {};
for (const r of data) { const n = r.schools?.name || 'ללא בית ספר'; (bySchool[n] ||= []).push(r); }
fs.mkdirSync(OUT, { recursive: true });
const index = [];

for (const [school, raw] of Object.entries(bySchool)) {
  // המנהלת ראשונה, ואחריה לפי היקף השעות — כך הדף נקרא מלמעלה למטה
  const rows = raw.slice().sort((a, b) =>
    (a.gamul_role === 'principal' ? 0 : 1) - (b.gamul_role === 'principal' ? 0 : 1)
    || (b.frontal_hours || 0) - (a.frontal_hours || 0)
    || String(a.name || '').localeCompare(String(b.name || ''), 'he'));

  const principal = rows.find(r => r.gamul_role === 'principal')?.name || '';
  const city = raw[0]?.schools?.city || '';
  const hours = rows.filter(r => r.gamul_role !== 'principal')
    .reduce((a, r) => a + (Number(r.frontal_hours) || 0), 0);

  // רשימת התיקונים — שם העובדת ומה בדיוק לא בסדר אצלה
  /*
    "מין" נשאר בטבלה אבל לא ברשימת התיקונים הממוספרת: הוא חסר אצל
    עובדות שלמות (13 מ-14 בירושלים), והצפת הרשימה בו מסתירה את
    השגיאות האמיתיות. הוא מקבל שורה אחת מסכמת במקום שלוש-עשרה.
  */
  const fixes = [];
  const checked = rows.map(r => {
    const c = { tz: checkTz(r.tz_id), ph: checkPhone(r.phone), em: checkEmail(r.email) };
    const why = [c.tz, c.ph, c.em].filter(x => !x.ok).map(x => x.why);
    if (why.length) fixes.push({ name: r.name, why });
    return { r, c, flag: why.length > 0 };
  });
  const noGender = rows.filter(r => !r.gender).length;
  const gaps = fixes.length;

  const body = checked.map(({ r, c, flag }, i) => `<tr class="${r.gamul_role === 'principal' ? 'pr' : ''}${flag ? ' fix' : ''}">
    <td class="n">${i + 1}</td>
    <td class="nm">${esc(r.name)}${r.is_temp ? ' <span class="tag">זמנית</span>' : ''}</td>
    <td class="ltr">${c.tz.html}</td>
    <td class="ltr">${c.ph.html}</td>
    <td class="ltr em">${c.em.html}</td>
    <td>${REFORM[r.reform] || '—'}</td>
    <td>${DEGREE[r.degree] || '—'}</td>
    <td>${r.grade === 'intern' ? 'מתמחה' : (r.grade ?? '—')}</td>
    <td class="c">${r.seniority ?? '—'}</td>
    <td class="c b">${r.frontal_hours ?? '—'}</td>
    <td>${ROLE[r.gamul_role] || '—'}</td>
    <td class="c">${r.children_under_18 ?? '—'}</td>
    <td>${r.gender === 'f' ? 'נקבה' : r.gender === 'm' ? 'זכר' : MISS}</td>
    <td>${AGE[r.age_group] || '—'}</td>
  </tr>`).join('\n');

  const today = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>אישור נתונים · ${esc(school)}</title>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&family=Rubik:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 10mm; }
  :root { --purple:#4B2E83; --turq:#00B4CC; --ink:#241C36; --mid:#6E6893; --line:#E6E1F0; --soft:#FAF9FD; }
  * { box-sizing:border-box }
  body { margin:0; font-family:Heebo,system-ui,sans-serif; color:var(--ink); background:#fff; font-size:11.5px }
  header { display:flex; justify-content:space-between; align-items:flex-end; gap:16px;
           border-bottom:3px solid transparent;
           border-image:linear-gradient(270deg,var(--purple),var(--turq)) 1;
           padding-bottom:9px; margin-bottom:12px }
  h1 { font-family:Rubik; font-size:19px; font-weight:800; margin:0; color:var(--purple) }
  .sub { font-size:12.5px; color:var(--mid); margin-top:3px }
  .meta { text-align:left; font-size:11.5px; color:var(--mid); line-height:1.7 }
  .meta b { color:var(--ink) }
  .lead { background:var(--soft); border:1px solid var(--line); border-radius:9px;
          padding:9px 12px; margin-bottom:11px; line-height:1.65; font-size:12px }
  .lead b { color:var(--purple) }
  table { width:100%; border-collapse:collapse }
  th { background:#F3F0FA; color:var(--purple); font-weight:700; font-size:11px; text-align:right;
       padding:6px 5px; border-bottom:1.5px solid var(--line); white-space:nowrap }
  td { padding:5px; border-bottom:1px solid #F0EDF7; vertical-align:middle }
  tr:nth-child(even) td { background:#FCFBFE }
  tr.pr td { background:#F6F2FC; font-weight:600 }
  tr.fix td { background:#FFFBF4 }
  tr.fix td:first-child { box-shadow:inset 2px 0 0 #E8A33D }
  .fixes { margin-top:11px; background:#FFF9EF; border:1px solid #F3E3C2; border-radius:9px; padding:9px 13px }
  .fixes .ttl { margin:0 0 5px; font-weight:700; font-size:12px; color:#B4650A }
  .fixes ol { margin:0; padding-inline-start:18px; font-size:11.5px; line-height:1.75; color:#7A4A08 }
  .fixes b { color:#5C3806 }
  .fixes .note { margin:6px 0 0; font-size:11.5px; line-height:1.7; color:#7A4A08 }
  .n { color:var(--mid); width:20px; text-align:center; font-size:10.5px }
  .nm { font-weight:600; white-space:nowrap }
  .c { text-align:center } .b { font-weight:700 }
  .ltr { direction:ltr; text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap }
  .em { font-size:10.5px; color:var(--mid); max-width:150px; overflow:hidden; text-overflow:ellipsis }
  .tag { font-size:9.5px; background:#FFF4E6; color:#B4650A; border:1px solid #F3E3C2;
         border-radius:20px; padding:1px 5px; font-weight:600 }
  .miss { color:#C2410C; font-weight:600 }
  .sum { display:flex; gap:8px; flex-wrap:wrap; margin:11px 0 }
  .chip { background:var(--soft); border:1px solid var(--line); border-radius:20px; padding:4px 11px; font-size:11.5px }
  .chip b { color:var(--purple); font-family:Rubik; font-weight:700 }
  .warn { background:#FFF9EF; border-color:#F3E3C2; color:#B4650A }
  .sign { margin-top:14px; border:1px solid var(--line); border-radius:9px; padding:11px 13px; background:var(--soft) }
  .sign p { margin:0; font-size:12px; line-height:1.6 }
  .lines { display:flex; gap:26px; margin-top:16px }
  .lines div { flex:1; border-top:1px solid #C9C2DC; padding-top:4px; font-size:11px; color:var(--mid) }
  footer { margin-top:12px; padding-top:7px; border-top:1px solid var(--line);
           font-size:9.5px; color:var(--mid); text-align:center; line-height:1.6 }
</style></head><body>
<header>
  <div>
    <h1>אישור נתוני עובדות ההוראה</h1>
    <div class="sub">${esc(school)}${city ? ' · ' + esc(city) : ''} · שנת הלימודים תשפ״ז · ספטמבר 2026</div>
  </div>
  <div class="meta">${principal ? `<b>${esc(principal)}</b><br>` : ''}רשת חינוך חב״ד<br>הופק ${today}</div>
</header>

<div class="lead">
  לפנייך הנתונים כפי שהוזנו למערכת השכר מבית הספר. <b>אין כאן שכר ואין חישוב</b> — רק הפרטים שנמסרו.
  אבקש לעבור שורה-שורה, לסמן כל טעות או חוסר, ולהחזיר אליי.
  <b>הנתונים האלה הם הבסיס לחישוב השכר</b>, ולכן שגיאה כאן מגיעה לתלוש.
  ${gaps ? `יש כאן <b>${gaps}</b> שורות שדורשות תיקון, מסומנות באדום ומפורטות בסוף הדף.` : 'הפרטים המזהים כולם מלאים ותקינים.'}
</div>

<table>
  <thead><tr>
    <th class="n">#</th><th>שם</th><th>ת.ז.</th><th>טלפון</th><th>מייל</th>
    <th>מסלול</th><th>תואר</th><th>דרגה</th><th class="c">ותק</th><th class="c">שעות</th>
    <th>תפקיד</th><th class="c">ילדים עד 18</th><th>מין</th><th>הפחתת גיל</th>
  </tr></thead>
  <tbody>${body}</tbody>
</table>

<div class="sum">
  <span class="chip">עובדות: <b>${rows.length}</b></span>
  <span class="chip">שעות פרונטליות, בלי מנהלת: <b>${hours}</b></span>
  <span class="chip">אופק חדש: <b>${rows.filter(r => r.reform === 'ofek').length}</b></span>
  <span class="chip">עולם ישן: <b>${rows.filter(r => r.reform === 'pre').length}</b></span>
  ${rows.filter(r => r.is_temp).length ? `<span class="chip">זמניות: <b>${rows.filter(r => r.is_temp).length}</b></span>` : ''}
  ${gaps ? `<span class="chip warn">דורשות תיקון: <b>${gaps}</b></span>` : ''}
</div>

${(gaps || noGender) ? `<div class="fixes">
  <p class="ttl">מה צריך תיקון</p>
  ${gaps ? `<ol>${fixes.map(f => `<li><b>${esc(f.name)}</b> — ${f.why.map(esc).join(' · ')}</li>`).join('')}</ol>` : ''}
  ${noGender ? `<p class="note">${noGender === rows.length ? 'לא סומן מין לאף עובדת' : `מין לא סומן אצל <b>${noGender}</b> עובדות`} — הנתון דרוש לחישוב תוספת אם, אשמח שתשלימי אותו.</p>` : ''}
</div>` : ''}

<div class="sign">
  <p>אני מאשרת שהפרטים לעיל נכונים ומעודכנים, למעט התיקונים שסימנתי.</p>
  <div class="lines"><div>שם המנהלת</div><div>חתימה</div><div>תאריך</div></div>
</div>

<footer>בנוי ופיתוח: שרה הגר · 0503339770 · יעוץ ארגוני | פתרונות דיגיטליים · מהבנת הארגון לפתרון שעובד.</footer>
</body></html>`;

  const safe = school.replace(/["'/\\?*:|<>]/g, '').replace(/\s+/g, '-');
  fs.writeFileSync(path.join(OUT, safe + '.html'), html, 'utf8');
  index.push({ school, principal, file: safe + '.html', n: rows.length, hours, gaps });
}

index.sort((a, b) => b.n - a.n);
console.log(`נוצרו ${index.length} דפים · ${OUT}\n`);
console.log('בית ספר'.padEnd(22) + '| עובדות | ש"פ | חוסרים | מנהלת');
for (const x of index) {
  console.log(x.school.padEnd(22) + '| ' + String(x.n).padStart(6) + ' | ' +
    String(x.hours).padStart(3) + ' | ' + String(x.gaps).padStart(6) + ' | ' + (x.principal || '—'));
}
fs.writeFileSync(path.join(OUT, '_index.json'), JSON.stringify(index, null, 1), 'utf8');
