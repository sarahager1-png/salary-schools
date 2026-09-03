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
import { formFields, openForm, runOne, readResultRows, dargaFor, kitaFor, pickEnv, resetForm } from './sim-form.mjs';
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

const stamp = () => new Date().toLocaleTimeString('he-IL');

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
        .select('id, month_key, name, reform, degree, grade, seniority, scope_pct, scope_set_at, gamul_role, leave_type, frontal_hours, children_under_18, official_gross')
        .eq('id', req.teacher_month_id).single();
      if (!t) { await sb.from('sim_requests').update({ status: 'failed', error: 'השורה לא נמצאה', done_at: new Date().toISOString() }).eq('id', req.id); continue; }
      const f = formFields(t);
      if (f.skip) {
        console.log(`[${stamp()}] ${t.name} — ${f.skip}`);
        await sb.from('sim_requests').update({ status: 'failed', error: f.skip, done_at: new Date().toISOString() }).eq('id', req.id);
        continue;
      }
      try {
        /*
          האתר של המשרד נתקע לסירוגין (קליק תלוי, ניווט באמצע evaluate) —
          וריצה חוזרת כמעט תמיד מצליחה. לכן כישלון ראשון אינו "נכשל":
          הדפדפן נזרק, נפתח חדש, ורק כישלון שני עולה לבקשה.
        */
        let gross = null, p = null;
        for (let att = 1; ; att++) {
          try {
            p = await getPage();
            await openForm(p, f.calc || 'old');
            gross = await runOne(p, f, t.month_key);
            break;
          } catch (e) {
            try { await browser?.close(); } catch { /* הדפדפן ממילא מת */ }
            page = null;
            if (att >= 2) throw e;
            console.log(`[${stamp()}] ${t.name} — ניסיון ${att} נפל (${e.message?.slice(0, 60)}), מנסה שוב`);
          }
        }
        if (!gross) throw new Error('לא נקרא ברוטו מהטופס');
        p = await getPage();
        console.log(`[${stamp()}] ${t.name} · ${f.pct}%${f.kita ? ' · מחנכת' : ''} → ${gross.toLocaleString('he-IL')} ₪`);
        await sb.from('sim_requests').update({ status: 'done', result_gross: gross, done_at: new Date().toISOString() }).eq('id', req.id);
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
            const slipGross = await runOne(p, slipPlan, t.month_key);
            if (slipGross) {
              const lines = await readResultRows(p);
              await sb.from('slip_lines').upsert({ teacher_month_id: t.id, lines, gross: slipGross, computed_at: new Date().toISOString() });
              console.log(`[${stamp()}]   ↳ תלוש: ${lines.length} שורות · ${slipGross.toLocaleString('he-IL')} ₪`);
            }
          }
        } catch (e2) { console.log(`[${stamp()}]   ↳ תלוש נכשל: ${e2.message?.slice(0, 60)}`); }
      } catch (e) {
        console.log(`[${stamp()}] ${t.name} — נכשל: ${e.message?.slice(0, 100)}`);
        await sb.from('sim_requests').update({ status: 'failed', error: String(e.message || e).slice(0, 300), done_at: new Date().toISOString() }).eq('id', req.id);
        try { await browser?.close(); } catch { /* הדפדפן ממילא מת */ }
        page = null;
      }
    }
  } catch (e) {
    console.log(`[${stamp()}] רשת: ${e.message?.slice(0, 80)}`);
  }
  await new Promise(r => setTimeout(r, 15000));
}
