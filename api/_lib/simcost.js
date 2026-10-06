/*
  עלות ההוראה לפי הסימולציה — לכל סניף, לחודש אחד.

  "הסימולציה" היא מה שהמערכת חישבה לכל עובדת ממחשבון משרד החינוך, לפני
  שהגיעו התלושים: הברוטו שבשורה, ועלות המעביד לפי המודל — בלי עלות בפועל
  מקובץ השכר, ובלי הכיול שנלמד מהתלושים (הכיול נגזר מהם, ולכן אינו "לפני").

  מקום אחד לחישוב, כדי שהצילום שנשמר (month_sim_snapshot) והשחזור שמוצג
  כשאין צילום יהיו אותו מספר בדיוק.

  הפונקציה משנה את מצב המודול של employer.js (כיול, תוספת בית חב"ד,
  מחליפות). מי שקורא לה וממשיך לחשב עלות בפועל — חייב לטעון את המצב מחדש.
*/
import * as emp from '../../src/lib/employer.js';
import { rowToTeacher } from '../../src/lib/teacherFields.js';

export function simCostsForMonth(schools, rows, monthKey) {
  emp.CHABAD_SUPP.clear();
  for (const s of schools || []) emp.CHABAD_SUPP.set(s.id, s.chabad_supp !== false);
  emp.MM_REPLACED.clear();
  emp.MATERNITY_LEAVES.clear();
  const mrows = (rows || []).filter(r => r.month_key === monthKey);
  for (const r of mrows) {
    if (String(r.mm_for || '').trim()) emp.MM_REPLACED.add(`${r.month_key}|${r.school_id}|${String(r.mm_for).trim()}`);
    if (r.leave_type === 'maternity') emp.MATERNITY_LEAVES.add(`${r.month_key}|${r.school_id}|${String(r.name).trim()}`);
  }
  emp.setCalib([], 1);
  const out = new Map();
  for (const s of schools || []) {
    if (s.pays_salary === false) continue;
    const ts = mrows.filter(r => r.school_id === s.id).map(rowToTeacher).filter(t => !emp.isHourlyRow(t));
    if (!ts.length) continue;
    let cost = 0, gross = 0;
    for (const t of ts) {
      const c = emp.calcEmployer({ ...t, _actualEmployerCost: null });
      cost += c.total; gross += c.gross || 0;
    }
    if (cost > 0) out.set(s.id, { cost: Math.round(cost), gross: Math.round(gross), staff: ts.length });
  }
  return out;
}

/*
  שמירת הצילום לחודש אחד. לא דורס צילום קיים: הצילום הראשון הוא הקובע,
  ולכן הרצה חוזרת (או פתיחת חודש ידנית ואחריה ה-cron) אינה משנה אותו.
*/
export async function snapshotSim(sb, monthKey, source = 'auto') {
  const [{ data: schools, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
    sb.from('schools').select('*'),
    sb.from('teacher_months').select('*').eq('month_key', monthKey).range(0, 999),
  ]);
  if (e1 || e2) throw new Error((e1 || e2).message);
  if ((rows || []).length >= 1000) throw new Error('יותר מ-1,000 שורות בחודש — נדרשת קריאה בעמודים');
  const sims = simCostsForMonth(schools, rows, monthKey);
  if (!sims.size) return { month: monthKey, saved: 0 };
  const payload = [...sims.entries()].map(([school_id, v]) => ({
    school_id, month_key: monthKey, sim_cost: v.cost, sim_gross: v.gross, staff: v.staff, source }));
  const { data, error } = await sb.from('month_sim_snapshot')
    .upsert(payload, { onConflict: 'school_id,month_key', ignoreDuplicates: true }).select('school_id');
  if (error) throw new Error(error.message);
  return { month: monthKey, saved: (data || []).length, branches: sims.size };
}
