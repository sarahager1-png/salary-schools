/*
  כרטיס התקציב של בתי הספר "שלהבות" — לדשבורד שלהבות.

  "את כרטיס התקציב של בתי הספר שלהבות תטמיע בדשבורד שלהבות" (שרה, 2.9).
  אותם שלושה מדדים שמציג מסך "עלות הוראה" כאן — הפרש עלות הוראה, הפרש
  תקציב נוסף וסך הכל — מחושבים באותם כלים בדיוק (src/lib/employer.js,
  school_finance), בלי נוסחה שנייה שיכולה לסטות. ראו TeachingCostView
  ב-src/App.jsx — כל סטייה מהחישוב שם היא באג כאן.

  פרטיות: הנתון המוחזר הוא סכום בית-ספרי בלבד — בלי שמות עובדות,
  בלי שורות אישיות. רק בתי ספר ששמם מתחיל ב"שלהבות".

  גישה: כותרת x-access-code מול SHALHAVOT_BUDGET_CODE מהסביבה.
  הקוד לא כתוב בשום מקום בקוד — רק ב-env של Vercel (מגדירה שרה).
*/
import { createClient } from '@supabase/supabase-js';
import * as emp from '../src/lib/employer.js';

// זהה ל-api/school-costs.js — תרגום עמודות המסד לשמות שהמודול מכיר
const toTeacher = (r) => ({
  monthKey: r.month_key, schoolId: r.school_id, name: r.name,
  reform: r.reform, level: r.level, grade: r.grade, degree: r.degree,
  seniority: r.seniority, frontalHours: r.frontal_hours,
  scope: r.scope_pct, scopePct: r.scope_pct,
  role: r.gamul_role, ageGroup: r.age_group,
  gender: r.gender, childrenUnder18: r.children_under_18,
  travelDays: r.travel_days, daycareChildren: r.daycare_children,
  leaveType: r.leave_type, mmFor: r.mm_for,
  job: r.job || 'teaching', hourlyRate: r.hourly_rate,
  _officialGross: r.official_gross, _agreedGross: r.agreed_gross,
  _chabadSupp: r.chabad_supp, _actualEmployerCost: r.actual_employer_cost,
});

// עלות מילוי מקום: "לכל בית ספר צריך להיות 5 אחוז מסך הכולל של עלות ההוראה"
// (שרה, 10.9) — 5% אחד לבית ספר על עלות ההוראה השנתית המלאה. זהה ל-MM_PCT באפליקציה.
const MM_PCT = 0.05;
// כרית ביטחון 10% על עלות ההוראה השנתית, בנוסף למילוי המקום (שרה, 15.9). זהה ל-BUFFER_PCT באפליקציה.
const BUFFER_PCT = 0.10;

// שורות באותו שם מאוחדות לשורה אחת — כמו mergeLines בכרטיסים
const mergeLines = (lines) => {
  const m = new Map();
  for (const x of lines || []) m.set(x.name, (m.get(x.name) || 0) + Number(x.amount || 0));
  return [...m.entries()].map(([name, amount]) => ({ name, amount }));
};

export default async function handler(req, res) {
  try {
    const expected = process.env.SHALHAVOT_BUDGET_CODE;
    if (!expected) {
      return res.status(500).json({
        error: 'SHALHAVOT_BUDGET_CODE אינו מוגדר בסביבת השרת — יש להגדירו ב-Vercel לפני שימוש בנתיב זה',
      });
    }
    const code = req.headers['x-access-code'] || '';
    if (code !== expected) {
      return res.status(401).json({ error: 'קוד גישה שגוי' });
    }

    const db = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );
    const url = new URL(req.url, 'http://x');
    const month = url.searchParams.get('month')
      || new Date().toISOString().slice(0, 7);

    const [{ data: schools, error: e1 }, { data: rows, error: e2 }, { data: finRows, error: e3 }] =
      await Promise.all([
        db.from('schools').select('id, name, chabad_supp'),
        db.from('teacher_months').select('*').eq('month_key', month),
        db.from('school_finance').select(
          'school_id, ministry_budget, network_support, income_total, expenses_other, detail'),
      ]);
    if (e1 || e2 || e3) return res.status(500).json({ error: (e1 || e2 || e3).message });

    // מצב המודול — כמו שהאפליקציה ממלאת אותו אחרי טעינה (זהה ל-school-costs)
    emp.CHABAD_SUPP.clear();
    for (const s of schools || []) emp.CHABAD_SUPP.set(s.id, s.chabad_supp !== false);
    emp.MM_REPLACED.clear();
    emp.MATERNITY_LEAVES.clear();
    for (const r of rows || []) {
      if (String(r.mm_for || '').trim()) {
        emp.MM_REPLACED.add(`${r.month_key}|${r.school_id}|${String(r.mm_for).trim()}`);
      }
      if (r.leave_type === 'maternity') {
        emp.MATERNITY_LEAVES.add(`${r.month_key}|${r.school_id}|${String(r.name).trim()}`);
      }
    }

    const finBy = new Map((finRows || []).map(r => [r.school_id, r]));
    const shalhavot = (schools || [])
      .filter(s => String(s.name || '').trim().startsWith('שלהבות'));

    const out = shalhavot.map(s => {
      // עלות שכר שנתית — אותו סכום כמו monthlyCost * 12 בכרטיסים (כולל מנהלת)
      // הוראה בלבד: צהרון ומשרות שעתיות ממומנים בנפרד ואינם מול תקציב המשרד (15.9)
      // "גם הפירוט עלות הוראה ועלויות נוספות מפורשות" (שרה, 15.9): שכר ההוראה
      // מפורק לרכיביו — סכומים בית-ספריים בלבד. total = gross + social + mmPay.
      let monthly = 0, hourlyMonthly = 0, staff = 0;
      const pay = { base: 0, supp: 0, social: 0, mm: 0 };
      for (const r of (rows || []).filter(r => r.school_id === s.id)) {
        const t = toTeacher(r);
        const c = emp.calcEmployer(t);
        if (emp.isHourlyRow(t)) { hourlyMonthly += c.total; continue; }
        monthly += c.total;
        if (c.total > 0) staff++;
        pay.base += (c.gross || 0) - (c.supplement || 0);
        pay.supp += c.supplement || 0;
        pay.social += c.social || 0;
        pay.mm += c.mmPay || 0;
      }
      const annual = monthly * 12;

      const f = finBy.get(s.id) || {};
      const ministryBudget = f.ministry_budget == null ? null : Number(f.ministry_budget);
      const networkSupport = f.network_support == null ? null : Number(f.network_support);
      const incomeTotal    = f.income_total    == null ? null : Number(f.income_total);
      const expensesOther  = f.expenses_other  == null ? null : Number(f.expenses_other);
      const detail = f.detail || null;

      // ─ צד ההוראה — זהה שורה-לשורה לכרטיס ב-TeachingCostView ─
      const teachIncome = (ministryBudget || 0) + (networkSupport || 0);
      const mmCost = annual * MM_PCT;
      const bufferCost = annual * BUFFER_PCT;
      const teachCost = annual + bufferCost + mmCost;
      const teachDiff = (ministryBudget != null) ? teachIncome - teachCost : null;

      // שורות ההכנסות: משרד + מענק בנפרד כשיש פירוט, אחרת שורה מאוחדת
      const teachIncomeLines = (detail?.teach?.income?.length
        ? detail.teach.income.map(x => ({ name: x.name, amount: Number(x.amount || 0) }))
        : [{ name: 'הכנסות משרד החינוך + מענק', amount: ministryBudget || 0 }]);
      if (networkSupport) teachIncomeLines.push({ name: 'השתתפות הרשת', amount: networkSupport });
      // עיגול הרכיבים כך שסכומם שווה בדיוק לשכר השנתי המעוגל
      const payLines = [
        { name: `שכר ברוטו — ${staff} עובדי הוראה כולל מנהלת`, amount: Math.round(pay.base * 12) },
        { name: 'תוספת בית חב"ד', amount: Math.round(pay.supp * 12) },
        { name: 'עלויות מעביד — הפרשות סוציאליות, ביטוח לאומי, מס שכר ותוספות', amount: Math.round(pay.social * 12) },
        { name: 'מילוי מקום בתשלום', amount: Math.round(pay.mm * 12) },
      ];
      payLines[0].amount += Math.round(annual) - payLines.reduce((a, x) => a + x.amount, 0);
      const teachExpenseLines = [
        ...payLines.filter(x => x.amount !== 0),
        { name: 'תוספת ביטחון — 10% מעלות ההוראה', amount: Math.round(bufferCost) },
        { name: 'מילוי מקום — 5% מעלות ההוראה', amount: Math.round(mmCost) },
      ].filter(x => x.amount !== 0);
      // השורה האחרונה סופגת שקל עיגול — סכום השורות שווה תמיד לסה"כ המוצג
      if (teachExpenseLines.length) {
        teachExpenseLines[teachExpenseLines.length - 1].amount +=
          Math.round(teachCost) - teachExpenseLines.reduce((a, x) => a + x.amount, 0);
      }

      // ─ צד התקציב הנוסף — כמו בכרטיסים ─
      const incLines = mergeLines(detail?.income);
      const expLines = mergeLines(detail?.expenses);
      const incSum = incLines.reduce((a, x) => a + x.amount, 0) || (incomeTotal || 0);
      const expSum = expLines.reduce((a, x) => a + x.amount, 0) || (expensesOther || 0);
      const opDiff = (incomeTotal != null || expLines.length) ? incSum - expSum : null;

      const round = v => (v == null ? null : Math.round(v));
      return {
        name: s.name,
        metrics: {
          teachDiff: round(teachDiff),
          opDiff: round(opDiff),
          // כמו בכרטיסים: בית ספר בלי שום נתון אינו "0" אלא "אין נתונים"
          total: (teachDiff == null && opDiff == null)
            ? null : round((teachDiff || 0) + (opDiff || 0)),
        },
        teaching: {
          income: teachIncomeLines.map(x => ({ ...x, amount: Math.round(x.amount) })),
          incomeTotal: Math.round(teachIncome),
          expenses: teachExpenseLines,
          expensesTotal: Math.round(teachCost),
        },
        extra: {
          income: incLines.map(x => ({ ...x, amount: Math.round(x.amount) })),
          incomeTotal: Math.round(incSum),
          expenses: expLines.map(x => ({ ...x, amount: Math.round(x.amount) })),
          expensesTotal: Math.round(expSum),
        },
      };
    });

    return res.status(200).json({ month, schools: out, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'שגיאה בשרת' });
  }
}
