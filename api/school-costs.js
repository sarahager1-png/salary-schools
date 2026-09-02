/*
  עלות ההוראה בפועל לכל בית ספר — למבט-רשת.

  "עכשיו הוא לא מתעדכן מסימולציות שכר" (שרה, 2.9): פורטל מבט-רשת הציג
  רק את עלות ההוראה המתוכננת מהסימולציה שלה; כאן הוא מקבל את העלות
  בפועל — אותם מספרים בדיוק שמציגה מערכת השכר, מחושבים באותו מודול
  (src/lib/employer.js). אין נוסחה שנייה שיכולה לסטות.

  הגישה באותו קוד גישה של מבט-רשת עצמו: הנתון המוחזר הוא סכום לבית
  ספר — בלי שמות, בלי שורות אישיות.
*/
import { createClient } from '@supabase/supabase-js';
import * as emp from '../src/lib/employer.js';

// השדות שהחישוב נוגע בהם — תרגום עמודות המסד לשמות האפליקציה.
// רשימה מפורשת ותחומה; שדה חדש שנכנס לנוסחה חייב להתווסף גם כאן
// (smoke-costs-api משווה מול האפליקציה ותופס שכחה כזו).
const toTeacher = (r) => ({
  monthKey: r.month_key, schoolId: r.school_id, name: r.name,
  reform: r.reform, level: r.level, grade: r.grade, degree: r.degree,
  seniority: r.seniority, frontalHours: r.frontal_hours,
  scope: r.scope_pct, scopePct: r.scope_pct,
  role: r.gamul_role, ageGroup: r.age_group,
  gender: r.gender, childrenUnder18: r.children_under_18,
  travelDays: r.travel_days, daycareChildren: r.daycare_children,
  leaveType: r.leave_type, mmFor: r.mm_for,
  _officialGross: r.official_gross, _agreedGross: r.agreed_gross,
  _chabadSupp: r.chabad_supp, _actualEmployerCost: r.actual_employer_cost,
});

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    const code = url.searchParams.get('code') || '';
    if (code !== (process.env.HUB_ACCESS_CODE || '')) {
      return res.status(401).json({ error: 'קוד גישה שגוי' });
    }
    const db = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );
    const month = url.searchParams.get('month')
      || new Date().toISOString().slice(0, 7);

    const [{ data: schools, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
      db.from('schools').select('id, name, chabad_supp'),
      db.from('teacher_months').select('*').eq('month_key', month),
    ]);
    if (e1 || e2) return res.status(500).json({ error: (e1 || e2).message });

    // מצב המודול — כמו שהאפליקציה ממלאת אותו אחרי טעינה
    emp.CHABAD_SUPP.clear();
    for (const s of schools || []) emp.CHABAD_SUPP.set(s.id, s.chabad_supp !== false);
    emp.MM_REPLACED.clear();
    for (const r of rows || []) {
      if (String(r.mm_for || '').trim()) {
        emp.MM_REPLACED.add(`${r.month_key}|${r.school_id}|${String(r.mm_for).trim()}`);
      }
    }

    const out = (schools || []).map(s => {
      const ts = (rows || []).filter(r => r.school_id === s.id).map(toTeacher);
      const monthly = ts.reduce((sum, t) => sum + emp.calcEmployer(t).total, 0);
      return { name: s.name, monthly: Math.round(monthly), annual: Math.round(monthly * 12), teachers: ts.length };
    });
    res.setHeader('access-control-allow-origin', '*');
    return res.status(200).json({ month, schools: out, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'שגיאה בשרת' });
  }
}
