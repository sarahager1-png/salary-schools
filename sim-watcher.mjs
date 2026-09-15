/*
  שירות החישוב המקומי — הזרוע של כפתור "חשב".

  מחשבון משרד החינוך חסום לשרתים (Cloudflare) ונענה רק לדפדפן אמיתי,
  ולכן החישוב רץ כאן — על המחשב במשרד — ולא בענן. הלולאה: כל 15
  שניות נשלפות בקשות pending מ-sim_requests, כל אחת מורצת בדרייבר
  המוקשח (sim-form), והתוצאה נכתבת לבקשה בלבד. את השכר עצמו שומר
  הדפדפן של שרה, בהרשאות שלה — השירות לעולם אינו כותב לשורת שכר.

    node sim-watcher.mjs          (רץ ונשאר; Ctrl+C לעצירה)

  הדפדפן נפתח פעם אחת ונשאר חם, כדי שהלחיצה הראשונה לא תחכה דקה.
*/
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { createClient } from '@supabase/supabase-js';
import { formFields, openForm, runOne, readResultRows, dargaFor, kitaFor, pickEnv, resetForm, principalPlanFor } from './sim-form.mjs';
import { scopeWithMom } from './src/lib/employer.js';

const { env } = pickEnv(fs, true);
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
console.log('שירות החישוב פועל · מסד:', env.VITE_SUPABASE_URL, '· ממתין לבקשות');

let browser = null, page = null;
const getPage = async () => {
  if (page && !page.isClosed()) return page;
  browser = await chromium.launch();
  page = await (await browser.newContext({ locale: 'he-IL', viewport: { width: 1300, height: 1600 } })).newPage();
  resetForm();
  return page;
};
const dropPage = async () => {
  try { await browser?.close(); } catch { /* הדפדפן ממילא מת */ }
  page = null;
};

const stamp = () => new Date().toLocaleTimeString('he-IL');
const finish = (id, patch) => sb.from('sim_requests').update({ ...patch, done_at: new Date().toISOString() }).eq('id', id);

/*
  האתר של המשרד נתקע לסירוגין (קליק תלוי, ניווט באמצע evaluate) —
  וריצה חוזרת כמעט תמיד מצליחה. לכן כישלון ראשון אינו "נכשל":
  הדפדפן נזרק, נפתח חדש, ורק כישלון שני עולה לבקשה.
*/
const runWithRetry = async (plan, monthKey, name) => {
  for (let att = 1; ; att++) {
    try {
      const p = await getPage();
      await openForm(p, plan.calc || 'old');
      const gross = await runOne(p, plan, monthKey);
      if (!gross) throw new Error('לא נקרא ברוטו מהטופס');
      return gross;
    } catch (e) {
      await dropPage();
      if (att >= 2) throw e;
      console.log(`[${stamp()}] ${name} — ניסיון ${att} נפל (${e.message?.slice(0, 60)}), מנסה שוב`);
    }
  }
};

const saveSlip = async (t, gross) => {
  const lines = await readResultRows(await getPage());
  await sb.from('slip_lines').upsert({ teacher_month_id: t.id, lines, gross, computed_at: new Date().toISOString() });
  console.log(`[${stamp()}]   ↳ תלוש: ${lines.length} שורות · ${gross.toLocaleString('he-IL')} ₪`);
};

/*
  מנהלת — "תחשב את תלושי המנהלות כמו כל עובדי ההוראה" (שרה, 14.9).
  הברוטו שלה קבוע (אופק ניהול / שכר מוסכם) ואינו נכתב מכאן; מה שמחושב
  הוא התלוש בעולם ישן — דרגה+ותק ב-100% וגמול ניהול לפי מספר הכיתות —
  אל slip_lines. result_gross מקבל את העולם הישן, והדפדפן של שרה שומר
  ממנו את תוספת בית חב"ד (ברוטו − עולם ישן) — לא את הברוטו.
*/
const runPrincipal = async (req, t) => {
  const plan = principalPlanFor(t, t.schools?.name);
  if (plan.skip) {
    console.log(`[${stamp()}] ${t.name} — ${plan.skip}`);
    await finish(req.id, { status: 'failed', error: plan.skip });
    return;
  }
  const gross = await runWithRetry(plan, t.month_key, t.name);
  console.log(`[${stamp()}] ${t.name} · מנהלת · ${plan.nihul.classes} כיתות → עולם ישן ${gross.toLocaleString('he-IL')} ₪`);
  await saveSlip(t, gross);
  await finish(req.id, { status: 'done', result_gross: gross });
};

const runTeacher = async (req, t) => {
  const f = formFields(t);
  if (f.skip) {
    console.log(`[${stamp()}] ${t.name} — ${f.skip}`);
    await finish(req.id, { status: 'failed', error: f.skip });
    return;
  }
  const gross = await runWithRetry(f, t.month_key, t.name);
  console.log(`[${stamp()}] ${t.name} · ${f.pct}%${f.kita ? ' · מחנכת' : ''} → ${gross.toLocaleString('he-IL')} ₪`);
  await finish(req.id, { status: 'done', result_gross: gross });
  /*
    שורות התלוש מתרעננות עם החישוב: התלוש בעולם ישן לפי השעות
    (+3 למחנכת, +10 לאם) — הרצה שנייה, והרכיבים נשמרים כפי שהם.
  */
  try {
    let slipPct = t.scope_pct;
    if (t.reform === 'ofek') {
      const pseudo = { reform: 'pre', frontalHours: t.frontal_hours, role: t.gamul_role,
        gender: t.gender, childrenUnder18: t.children_under_18 };
      slipPct = scopeWithMom(pseudo); // אם: בסיס חתוך + 10 (הכלל של שרה, 4.9)
    }
    const slipPlan = { calc: 'old', darga: dargaFor(t),
      vetek: String(Math.max(1, Math.min(40, Number(t.seniority) || 1))),
      pct: String(slipPct), kita: kitaFor(t) };
    if (slipPlan.darga) {
      const slipGross = await runOne(await getPage(), slipPlan, t.month_key);
      if (slipGross) await saveSlip(t, slipGross);
    }
  } catch (e2) { console.log(`[${stamp()}]   ↳ תלוש נכשל: ${e2.message?.slice(0, 60)}`); }
};

while (true) {
  try {
    // שחרור בקשות שנתקעו ב-running (ווצ'ר שמת באמצע) — חוזרות לתור
    await sb.from('sim_requests').update({ status: 'pending' })
      .eq('status', 'running')
      .lt('created_at', new Date(Date.now() - 15 * 60e3).toISOString());
    const { data: reqs } = await sb.from('sim_requests')
      .select('id, teacher_month_id').eq('status', 'pending').order('created_at').limit(10);
    for (const req of reqs || []) {
      // תפיסה אטומית: רק ווצ'ר אחד יצליח להעביר pending→running
      const { data: claimed } = await sb.from('sim_requests')
        .update({ status: 'running' }).eq('id', req.id).eq('status', 'pending').select('id');
      if (!claimed?.length) continue;
      const { data: t } = await sb.from('teacher_months')
        .select('id, month_key, name, reform, degree, grade, seniority, scope_pct, scope_set_at, gamul_role, leave_type, frontal_hours, children_under_18, gender, official_gross, job, schools(name)')
        .eq('id', req.teacher_month_id).single();
      if (!t) { await finish(req.id, { status: 'failed', error: 'השורה לא נמצאה' }); continue; }
      // משרה שעתית (צהרון): שעות × תעריף, אין מה להריץ במחשבון המשרד
      if (t.job && t.job !== 'teaching') {
        await finish(req.id, { status: 'failed', error: 'משרה שעתית — הברוטו הוא שעות × תעריף, לא סימולציה' });
        continue;
      }
      try {
        if (t.gamul_role === 'principal') await runPrincipal(req, t);
        else await runTeacher(req, t);
      } catch (e) {
        console.log(`[${stamp()}] ${t.name} — נכשל: ${e.message?.slice(0, 100)}`);
        await finish(req.id, { status: 'failed', error: String(e.message || e).slice(0, 300) });
        await dropPage();
      }
    }
  } catch (e) {
    console.log(`[${stamp()}] רשת: ${e.message?.slice(0, 80)}`);
  }
  await new Promise(r => setTimeout(r, 15000));
}
