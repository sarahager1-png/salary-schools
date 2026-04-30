import { useState } from 'react';
import './index.css';
// v2-apple-design

/* ═══════════════════════════════════════════════════════════════
   SALARY TABLES
═══════════════════════════════════════════════════════════════ */
function buildBase(start, end, steps = 30) {
  return Array.from({ length: steps }, (_, i) =>
    Math.round(start + (end - start) * (i / (steps - 1)))
  );
}
const OFEK_SALARY = {
  intern: buildBase(4800, 6096, 30),
  1: buildBase(6096,  8900),  2: buildBase(7300,  10200),
  3: buildBase(8500,  11500), 4: buildBase(9800,  12800),
  5: buildBase(11000, 13600), 6: buildBase(11900, 14300),
  7: buildBase(12800, 15000), 8: buildBase(13700, 15600),
  9: buildBase(14600, 16339),
};
const OFEK_GRADES = [
  { id: 'intern', label: 'מתמחה' },
  { id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' },
  { id: 4, label: '4' }, { id: 5, label: '5' }, { id: 6, label: '6' },
  { id: 7, label: '7' }, { id: 8, label: '8' }, { id: 9, label: '9' },
];
const PRE_SALARY = {
  intern:     buildBase(4500, 5800, 30),  // מתמחה
  unlicensed: buildBase(5000, 10500),     // לא מוסמך
  senior:     buildBase(5500, 12000),     // בכיר
  BA:         buildBase(5800, 13500),     // תואר ראשון
  MA:         buildBase(7200, 15200),     // תואר שני
};
const DEGREE_LABELS = {
  intern: 'מתמחה', unlicensed: 'לא מוסמך', senior: 'בכיר',
  BA: 'תואר ראשון', MA: 'תואר שני',
};
const ROLES = [
  { id: 'none',       label: 'ללא תפקיד נוסף',             pct: 0,    min: 0    },
  { id: 'homeroom',   label: "מחנך/ת כיתה (יסודי ב'-ו')",  pct: 10,   min: 1000 },
  { id: 'homeroom1',  label: "מחנך/ת כיתה א'",              pct: 11.5, min: 1000 },
  { id: 'homeroom2',  label: 'מחנך/ת כיתה (חטיבה)',         pct: 11.5, min: 1000 },
  { id: 'subject6',   label: 'מרכז/ת מקצוע (יסודי)',        pct: 6,    min: 0    },
  { id: 'subject8',   label: 'מרכז/ת מקצוע (חטיבה/עליון)', pct: 8,    min: 0    },
  { id: 'team',       label: 'ראש צוות / מרכז שכבה',        pct: 6.5,  min: 1000 },
  { id: 'counselor',  label: "יועץ/ת (רישיון זמני)",         pct: 12,   min: 0    },
  { id: 'counselor2', label: "יועץ/ת (רישיון קבוע)",         pct: 18,   min: 0    },
  { id: 'vp',         label: "סגן/ית מנהל",                  pct: 20,   min: 0    },
  { id: 'principal',  label: 'מנהל/ת בית ספר (אופק ד1)',    pct: 0,    min: 0    },
];
const LEVELS = {
  elementary: { label: 'יסודי',        frontal: 26, individual: 5, presence: 5 },
  middle:     { label: 'חטיבת ביניים', frontal: 23, individual: 4, presence: 9 },
  high:       { label: 'עליון',         frontal: 23, individual: 4, presence: 9 },
};
const AGE_RED = {
  none:  { label: 'עד גיל 50',        f: 0, i: 0 },
  age50: { label: 'גיל 50–55',        f: 2, i: 0 },
  age55: { label: "גיל 55+ (ותיק/ה)", f: 3, i: 1 },
  age55n:{ label: "גיל 55+ (חדש/ה)",  f: 2, i: 0 },
};
const REASON_TYPES = [
  { id: 'maternity', label: 'מילוי מקום לחל"ד' },
  { id: 'system',    label: 'צרכי מערכת' },
  { id: 'other',     label: 'אחר' },
];

/* ═══════════════════════════════════════════════════════════════
   CALCULATIONS
═══════════════════════════════════════════════════════════════ */
function calcBase(t) {
  const sen = Math.min(Math.max(Math.floor(t.seniority), 0), 29);
  if (t.reform === 'ofek') return (OFEK_SALARY[t.grade] || OFEK_SALARY[1])[sen];
  // טרום רפורמה: מתמחה = intern, אחרת לפי תואר
  return (PRE_SALARY[t.degree] || PRE_SALARY.BA)[sen];
}
function calcRoleSupp(base, roleId) {
  const r = ROLES.find(r => r.id === roleId);
  if (!r || r.pct === 0) return 0;
  return Math.max(Math.round(base * r.pct / 100), r.min);
}
function currentScope(t) {
  if (t.scopeChanges?.length > 0) {
    return [...t.scopeChanges].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  }
  return { scopePct: t.scopePct || 100, frontalHours: t.frontalHours || 26 };
}
function calcGross(t) {
  if (t._officialGross) return Number(t._officialGross);
  const base  = calcBase(t);
  const role  = calcRoleSupp(base, t.role);
  const scope = t.reform === 'ofek' ? (currentScope(t).scopePct || 100) : (t.scope || 100);
  return Math.round((base + role) * scope / 100);
}
function calcNet(gross) { return Math.round(gross * 0.735); }
function deriveHours(t, scopeOverride) {
  if (t.reform !== 'ofek') return null;
  const lvl = LEVELS[t.level] || LEVELS.elementary;
  const agR = AGE_RED[t.ageGroup] || AGE_RED.none;
  const baseFrontal    = lvl.frontal    - agR.f;
  const baseIndividual = lvl.individual - agR.i;
  if (baseFrontal === 0) return null;
  const cur        = scopeOverride || currentScope(t);
  const scopePct   = cur.scopePct || Math.round((cur.frontalHours / baseFrontal) * 100);
  const frontal    = cur.frontalHours || Math.round(baseFrontal * scopePct / 100);
  const individual = Math.round(baseIndividual * scopePct / 100);
  const presence   = Math.round(lvl.presence   * scopePct / 100);
  return { scopePct, frontal, individual, presence };
}

// ביגוד + הבראה (מקור: הסכם קיבוצי חינוך 2024)
const HAVRAAH_DAY   = 421;   // שכר יום הבראה 2024
const BIGUUD_ANNUAL = 2028;  // ביגוד שנתי למורה (הסכם חינוך)
function havraahDays(sen) {
  if (sen < 1)  return 0;
  if (sen < 2)  return 10;
  if (sen < 4)  return 14;
  if (sen < 11) return 16;
  if (sen < 16) return 20;
  if (sen < 20) return 22;
  if (sen < 25) return 24;
  return 26;
}
function calcExtras(t) {
  // ביגוד והבראה משולמים יחסית לאחוז משרה
  const scope   = t.reform === 'ofek' ? (currentScope(t).scopePct || 100) : (t.scope || 100);
  const factor  = scope / 100;
  const biguud  = Math.round(BIGUUD_ANNUAL * factor / 12);
  const havraah = Math.round(havraahDays(t.seniority) * HAVRAAH_DAY * factor / 12);
  return { biguud, havraah, total: biguud + havraah };
}
// ברוטו למעסיק = (ברוטו + ביגוד + הבראה) × 1.30
// ביטוח לאומי 7.5% + פנסיה+פיצויים 15% + קרן השתלמות 7.5%
function calcEmployer(t) {
  const gross  = calcGross(t);
  const extras = calcExtras(t);
  const base   = gross + extras.total;
  const social = Math.round(base * 0.30);
  return { gross, extras, base, social, total: base + social };
}

/* ═══════════════════════════════════════════════════════════════
   CHANGE TRACKING
═══════════════════════════════════════════════════════════════ */
const TRACKED = ['reform','grade','degree','level','ageGroup','seniority','role','scopePct','frontalHours','scope','isTemp','startDate','endDate'];
const FIELD_LBL = {
  reform:'רפורמה', grade:'דרגה', degree:'תואר', level:'שלב',
  ageGroup:'קבוצת גיל', seniority:'ותק', role:'תפקיד',
  scopePct:'% משרה', frontalHours:'שעות פרונטלי',
  scope:'% משרה(טרום)', startDate:'מתאריך', endDate:'עד תאריך',
};
function snapT(t) { return Object.fromEntries(TRACKED.map(k => [k, t[k]])); }
function diffT(t) {
  if (!t._snapshot) return [];
  return TRACKED.filter(k => String(t[k] ?? '') !== String(t._snapshot[k] ?? ''));
}
// סטטוס מורה בזרימת העבודה:
// needs_sim: מנהלת שמרה שינויים, ממתין לסימולציה אצל חשבת שכר
// needs_approval: חשבת שכר הכניסה שכר רשמי, ממתין לאישור שליח
// approved: השליח אישר
const needsSim      = t => Boolean(t._changedAt && !t._approved && !t._officialGross);
const needsApproval = t => Boolean(t._changedAt && !t._approved && t._officialGross);
const isPending     = t => Boolean(t._changedAt && !t._approved); // = needsSim || needsApproval

function readableVal(field, val) {
  if (val === undefined || val === null || val === '') return '—';
  const maps = {
    grade:    v => v === 'intern' ? 'מתמחה' : `ד${v}`,
    degree:   v => (DEGREE_LABELS[v] || v),
    reform:   v => ({ ofek:'אופק חדש', pre:'טרום רפורמה' }[v] || v),
    level:    v => LEVELS[v]?.label || v,
    ageGroup: v => AGE_RED[v]?.label || v,
    role:     v => ROLES.find(r => r.id === v)?.label.split('(')[0].trim() || v,
    scopePct: v => `${v}%`, scope: v => `${v}%`,
    startDate: v => v.split('-').reverse().join('/'),
    endDate:   v => v.split('-').reverse().join('/'),
  };
  return maps[field] ? maps[field](val) : String(val);
}

/* ═══════════════════════════════════════════════════════════════
   STORAGE
═══════════════════════════════════════════════════════════════ */
const LS_SCHOOLS  = 'ss-schools-v2';
const LS_TEACHERS = 'ss-teachers-v2';   // legacy
const LS_MONTHS   = 'ss-months-v1';
const load  = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const loadObj = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const save  = (k, d) => localStorage.setItem(k, JSON.stringify(d));
const uid   = () => Math.random().toString(36).slice(2, 10);

// Month helpers
const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const toMonthKey   = (y, m) => `${y}-${String(m).padStart(2,'0')}`;
const nowMonthKey  = () => { const d=new Date(); return toMonthKey(d.getFullYear(), d.getMonth()+1); };
const fmtMonth     = k => { if (!k) return ''; const [y,m]=k.split('-'); return `${MONTH_NAMES[Number(m)-1]} ${y}`; };
const nextMonthKey = k => { const [y,m]=k.split('-').map(Number); return m===12 ? toMonthKey(y+1,1) : toMonthKey(y,m+1); };
const prevMonthKey = k => { const [y,m]=k.split('-').map(Number); return m===1 ? toMonthKey(y-1,12) : toMonthKey(y,m-1); };

// Base fields — if changed, simulation clears for that month
const BASE_FIELDS = ['reform','degree','grade','seniority','scopePct','frontalHours','scope','childrenUnder18'];

const EMPTY_TEACHER = {
  id: '', schoolId: '', tzId: '', name: '', email: '',
  reform: 'ofek', level: 'elementary', grade: 1, degree: 'BA',
  seniority: 0, frontalHours: 26, scopePct: 100, scope: 100,
  role: 'none', ageGroup: 'none',
  isTemp: false, startDate: '', endDate: '', scopeChanges: [],
  childrenUnder18: 0,
  _officialGrossPre: null,
  _snapshot: null, _changedAt: null, _approved: false, _approvedAt: null,
  _files: [],
  // ─── Monthly fields (reset each month) ───
  absenceDays: 0,        // ימי העדרות
  sickFiles: [],         // קבצי מחלה
  mmHours: 0,            // שעות ממ"מ
  mmFor: '',             // במקום מי
  monthlyExtras: 0,      // תוספות חודשיות נוספות (₪)
};

const fmt = d => d ? d.split('-').reverse().join('/') : '—';

/* ═══════════════════════════════════════════════════════════════
   LOGIN SCREEN
═══════════════════════════════════════════════════════════════ */
function LoginScreen({ schools, onLogin }) {
  const [role, setRole] = useState('coordinator');
  const [schoolId, setSchoolId] = useState('');
  const canLogin = role !== 'principal' || schoolId;

  const ROLES_INFO = [
    { v: 'coordinator', icon: '👨‍💼', label: 'שליח / מנהל רשת',  desc: 'אישור שינויים ודוחות' },
    { v: 'clerk',       icon: '🧮',   label: 'חשבת שכר',          desc: 'סימולציה והכנת שכר' },
    { v: 'principal',   icon: '👩‍🏫',  label: 'מנהלת בית ספר',    desc: 'עדכון נתוני מורים' },
  ];

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(145deg, #0a0a1a 0%, #0d1b3e 40%, #1a0533 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, position:'relative', overflow:'hidden' }} dir="rtl">
      {/* decorative blobs */}
      <div style={{ position:'absolute', top:'-20%', right:'-10%', width:500, height:500, background:'radial-gradient(circle, rgba(0,122,255,0.25) 0%, transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'-15%', left:'-5%', width:400, height:400, background:'radial-gradient(circle, rgba(88,86,214,0.2) 0%, transparent 70%)', pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:420, position:'relative', zIndex:1 }}>
        {/* Logo header */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:72, height:72, background:'linear-gradient(135deg, #007aff, #5856d6)', borderRadius:22, display:'flex', alignItems:'center', justifyContent:'center', fontSize:34, margin:'0 auto 18px', boxShadow:'0 8px 32px rgba(0,122,255,0.5)' }}>🏫</div>
          <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:'-0.03em', color:'#ffffff', marginBottom:6 }}>מערכת שכר מורים</h1>
          <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)', letterSpacing:'0.01em' }}>ניהול תקציב שכר — רשת בתי הספר</p>
        </div>

        {/* Card */}
        <div style={{ background:'rgba(255,255,255,0.07)', backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)', borderRadius:24, border:'1px solid rgba(255,255,255,0.12)', padding:28 }}>
          <p style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(255,255,255,0.4)', marginBottom:12 }}>כניסה בתור</p>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
            {ROLES_INFO.map(({ v, icon, label, desc }) => {
              const COLORS = { coordinator:'#007aff', clerk:'#34c759', principal:'#5856d6' };
              const isActive = role === v;
              return (
                <button key={v} onClick={() => { setRole(v); setSchoolId(''); }}
                  style={{
                    display:'flex', alignItems:'center', gap:14, padding:'14px 16px',
                    borderRadius:14, border: isActive ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    cursor:'pointer', textAlign:'right', transition:'all 0.18s',
                    background: isActive ? COLORS[v] : 'rgba(255,255,255,0.05)',
                    boxShadow: isActive ? `0 4px 20px ${COLORS[v]}55` : 'none',
                    transform: isActive ? 'scale(1.01)' : 'scale(1)',
                  }}>
                  <span style={{ fontSize:26, flexShrink:0 }}>{icon}</span>
                  <div style={{ textAlign:'right' }}>
                    <p style={{ fontWeight:700, fontSize:15, color:'#ffffff', marginBottom:2 }}>{label}</p>
                    <p style={{ fontSize:12, color: isActive ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)' }}>{desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {role === 'principal' && (
            <div style={{ marginBottom:16 }}>
              <p style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(255,255,255,0.4)', marginBottom:8 }}>בית הספר שלי</p>
              <select value={schoolId} onChange={e => setSchoolId(e.target.value)}
                style={{ width:'100%', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:12, padding:'11px 14px', fontSize:15, color:'#ffffff', outline:'none', appearance:'none', cursor:'pointer' }}>
                <option value="" style={{ color:'#000' }}>— בחרי בית ספר —</option>
                {schools.map(s => <option key={s.id} value={s.id} style={{ color:'#000' }}>{s.name}</option>)}
              </select>
            </div>
          )}

          <button disabled={!canLogin} onClick={() => onLogin({ role, schoolId })}
            style={{
              width:'100%', padding:'14px 20px', fontSize:16, fontWeight:700, borderRadius:14,
              border:'none', cursor: canLogin ? 'pointer' : 'not-allowed',
              background: canLogin ? 'linear-gradient(135deg, #007aff, #5856d6)' : 'rgba(255,255,255,0.1)',
              color: canLogin ? '#ffffff' : 'rgba(255,255,255,0.3)',
              boxShadow: canLogin ? '0 4px 24px rgba(0,122,255,0.4)' : 'none',
              transition:'all 0.18s',
            }}>
            כניסה למערכת
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TEACHER DIFF
═══════════════════════════════════════════════════════════════ */
function TeacherDiff({ t }) {
  const diffs = diffT(t);
  const isNew = !t._snapshot;
  if (isNew) return <span className="apple-badge badge-blue">מורה חדש/ה</span>;
  if (diffs.length === 0) {
    const hasScopeChanges = t.scopeChanges?.some(c => !c._approved);
    if (!hasScopeChanges) return <span className="apple-badge badge-orange">שינוי תוכן</span>;
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      {diffs.map(k => (
        <div key={k} style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', fontSize:12 }}>
          <span style={{ color:'var(--apple-text2)' }}>{FIELD_LBL[k]}:</span>
          <span style={{ textDecoration:'line-through', color:'var(--apple-red)' }}>{readableVal(k, t._snapshot[k])}</span>
          <span style={{ color:'var(--apple-text3)' }}>→</span>
          <span style={{ fontWeight:600, color:'var(--apple-green)' }}>{readableVal(k, t[k])}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   APPROVAL VIEW (coordinator only)
═══════════════════════════════════════════════════════════════ */
function ApprovalView({ teachers, schools, onApprove, onApproveAll, onClose }) {
  // רק מורים שסימולציה הושלמה (יש שכר רשמי) → ממתינים לאישור שליח
  const readyToApprove = teachers.filter(needsApproval);
  // מורים עדיין ממתינים לסימולציה אצל חשבת שכר
  const waitingSim     = teachers.filter(needsSim);

  const bySchool = schools.map(s => ({
    school: s,
    ts: readyToApprove.filter(t => t.schoolId === s.id),
  })).filter(g => g.ts.length > 0);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, overflowY:'auto', backdropFilter:'blur(4px)' }} dir="rtl">
      <div style={{ maxWidth:680, margin:'0 auto', background:'var(--apple-bg)', minHeight:'100vh', padding:24 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, letterSpacing:'-0.02em', color:'var(--apple-text)', marginBottom:2 }}>אישור שכר חודשי</h2>
            <p style={{ fontSize:13, color:'var(--apple-text2)' }}>{readyToApprove.length} ממתינים לאישורך</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {readyToApprove.length > 0 && (
              <button className="apple-btn apple-btn-green" onClick={onApproveAll} style={{ fontSize:13 }}>
                אשר הכל ({readyToApprove.length})
              </button>
            )}
            <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ fontSize:13 }}>סגור</button>
          </div>
        </div>

        {/* ממתינים לסימולציה */}
        {waitingSim.length > 0 && (
          <div className="apple-card" style={{ padding:16, marginBottom:16, borderRight:'3px solid var(--apple-orange)' }}>
            <p style={{ fontWeight:600, fontSize:14, color:'var(--apple-text)', marginBottom:4 }}>
              {waitingSim.length} מורים ממתינים לסימולציה
            </p>
            <p style={{ fontSize:12, color:'var(--apple-text2)', marginBottom:10 }}>אחרי שחשבת השכר תזין שכר רשמי, הם יופיעו כאן</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {waitingSim.slice(0, 8).map(t => (
                <span key={t.id} className="apple-badge badge-orange">{t.name}</span>
              ))}
              {waitingSim.length > 8 && <span style={{ fontSize:12, color:'var(--apple-text2)' }}>ועוד {waitingSim.length - 8}...</span>}
            </div>
          </div>
        )}

        {readyToApprove.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px 0' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>{waitingSim.length > 0 ? '🧮' : '✅'}</div>
            <p style={{ fontWeight:600, color:'var(--apple-text2)' }}>
              {waitingSim.length > 0 ? 'ממתין לסימולציה אצל חשבת שכר' : 'אין שינויים ממתינים לאישור'}
            </p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {bySchool.map(({ school, ts }) => (
              <div key={school.id}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ background:'var(--apple-blue)', color:'#fff', fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10 }}>{ts.length}</span>
                  <span style={{ fontWeight:600, fontSize:14, color:'var(--apple-text)' }}>{school.name}{school.city ? ` — ${school.city}` : ''}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {ts.map(t => {
                    const emp = calcEmployer(t);
                    return (
                      <div key={t.id} className="apple-card" style={{ padding:16 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                          <div>
                            <p style={{ fontWeight:600, fontSize:15, color:'var(--apple-text)', marginBottom:2 }}>{t.name}</p>
                            {t.tzId && <p style={{ fontSize:12, color:'var(--apple-text3)', fontFamily:'monospace' }}>{t.tzId}</p>}
                            {t._changedAt && <p style={{ fontSize:12, color:'var(--apple-blue)', marginTop:2 }}>שונה: {new Date(t._changedAt).toLocaleDateString('he-IL')}</p>}
                          </div>
                          <div style={{ textAlign:'left' }}>
                            <p style={{ fontSize:11, color:'var(--apple-green)', fontWeight:600, marginBottom:2 }}>שכר רשמי</p>
                            <p style={{ fontWeight:700, fontSize:16, color:'var(--apple-text)' }}>{emp.gross.toLocaleString()} ₪</p>
                            <p style={{ fontSize:11, color:'var(--apple-text3)' }}>למעסיק: {emp.total.toLocaleString()} ₪</p>
                          </div>
                        </div>
                        <div style={{ marginBottom:12 }}><TeacherDiff t={t} /></div>
                        <div style={{ display:'flex', justifyContent:'flex-end' }}>
                          <button className="apple-btn apple-btn-green" onClick={() => onApprove(t.id)} style={{ fontSize:13, padding:'7px 16px' }}>
                            אשר
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize:12, color:'var(--apple-text3)', textAlign:'center', marginTop:32 }}>
          לאחר אישור, הנתונים מוכנים לחישוב משכורות חודשי
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCOPE CHANGE MODAL
═══════════════════════════════════════════════════════════════ */
function ScopeChangeModal({ teacher, onSave, onClose }) {
  const lvl = LEVELS[teacher.level] || LEVELS.elementary;
  const agR = AGE_RED[teacher.ageGroup] || AGE_RED.none;
  const baseFrontal = lvl.frontal - agR.f;
  const [c, setC] = useState({
    id: uid(), date: new Date().toISOString().slice(0,10),
    scopePct: teacher.scopePct || 100,
    frontalHours: teacher.frontalHours || baseFrontal,
    reasonType: 'system', detail: '',
  });
  const set = (k,v) => setC(p => ({...p,[k]:v}));
  const syncFromScope   = pct => setC(p => ({...p, scopePct: pct,                      frontalHours: Math.round(baseFrontal * pct / 100) }));
  const syncFromFrontal = hrs => setC(p => ({...p, frontalHours: hrs,                  scopePct: baseFrontal > 0 ? Math.round((hrs/baseFrontal)*100) : 100 }));

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(4px)' }}>
      <div className="apple-card" style={{ width:'100%', maxWidth:360, padding:24 }}>
        <h3 style={{ fontWeight:700, fontSize:17, letterSpacing:'-0.01em', color:'var(--apple-text)', marginBottom:20 }}>שינוי משרה — {teacher.name}</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <p className="apple-label">תאריך השינוי</p>
            <input type="date" value={c.date} onChange={e => set('date', e.target.value)} className="apple-input" dir="ltr" />
          </div>
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <p className="apple-label" style={{ marginBottom:0 }}>אחוז משרה</p>
              <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{c.scopePct}%</span>
            </div>
            <input type="range" min={1} max={140} value={c.scopePct} onChange={e => syncFromScope(+e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
            <div style={{ display:'flex', gap:4, marginTop:8, flexWrap:'wrap' }}>
              {[50,67,75,100,112,125,140].map(v => (
                <button key={v} onClick={() => syncFromScope(v)} style={{
                  flex:1, minWidth:0, padding:'5px 4px', borderRadius:8, border:'none', fontSize:12, fontWeight:600, cursor:'pointer',
                  background: c.scopePct===v ? 'var(--apple-blue)' : 'var(--apple-fill)',
                  color: c.scopePct===v ? '#fff' : 'var(--apple-text2)',
                }}>{v}%</button>
              ))}
            </div>
          </div>
          {teacher.reform === 'ofek' && (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <p className="apple-label" style={{ marginBottom:0 }}>שעות פרונטליות (מ-{baseFrontal})</p>
                <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{c.frontalHours}</span>
              </div>
              <input type="range" min={0} max={40} value={c.frontalHours} onChange={e => syncFromFrontal(+e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
            </div>
          )}
          <div>
            <p className="apple-label">סיבת השינוי</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {REASON_TYPES.map(r => (
                <button key={r.id} onClick={() => set('reasonType', r.id)} style={{
                  padding:'10px 14px', borderRadius:10, border:'none', fontSize:14, fontWeight: c.reasonType===r.id?600:400,
                  background: c.reasonType===r.id ? 'rgba(0,122,255,0.1)' : 'var(--apple-fill)',
                  color: c.reasonType===r.id ? 'var(--apple-blue)' : 'var(--apple-text)',
                  cursor:'pointer', textAlign:'right',
                }}>{r.label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="apple-label">פירוט נוסף</p>
            <textarea value={c.detail} onChange={e => set('detail', e.target.value)} rows={2}
              className="apple-input" placeholder="תיאור קצר (אופציונלי)"
              style={{ resize:'none', lineHeight:1.5 }} />
          </div>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:20 }}>
          <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ flex:1 }}>ביטול</button>
          <button className="apple-btn apple-btn-blue" onClick={() => onSave(c)} style={{ flex:1 }}>שמור שינוי</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL REPORT HELPER
═══════════════════════════════════════════════════════════════ */
function buildEmailBody(school, teachers) {
  const ts  = teachers.filter(t => t.schoolId === school.id);
  const now = new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  const totGross = ts.reduce((s,t) => s + calcGross(t), 0);
  const totEmp   = ts.reduce((s,t) => s + calcEmployer(t).total, 0);
  const pending  = ts.filter(isPending);

  let body = `דוח שכר חודשי — ${school.name}\nתאריך: ${now}\n\n`;
  body += `סה"כ מורים: ${ts.length}\nברוטו: ${totGross.toLocaleString()} ₪\nברוטו למעסיק: ${totEmp.toLocaleString()} ₪\n`;
  body += `\n— רשימת מורים —\n`;
  ts.forEach(t => {
    const emp   = calcEmployer(t);
    const grade = t.reform === 'ofek' ? (t.grade === 'intern' ? 'מתמחה' : `ד${t.grade}`) : (t.degree === 'intern' ? 'מתמחה' : t.degree);
    body += `\n${t.name} | ת.ז.: ${t.tzId||'—'} | ${t.reform==='ofek'?'אופק':'טרום'} ${grade} | ותק: ${t.seniority} | ברוטו: ${emp.gross.toLocaleString()} ₪ | למעסיק: ${emp.total.toLocaleString()} ₪`;
  });
  if (pending.length > 0) {
    body += `\n\n⚠️ שינויים ממתינים לאישור (${pending.length}):\n`;
    pending.forEach(t => { body += `• ${t.name}\n`; });
  }
  body += `\n\nהסכומים הם הערכה בלבד — לאימות מול מדור שכר`;
  return body;
}

function sendMonthlyEmail(school, teachers) {
  const subject = encodeURIComponent(`דוח שכר חודשי — ${school.name}`);
  const body    = encodeURIComponent(buildEmailBody(school, teachers));
  const to      = school.principalEmail || '';
  const cc      = school.coordinatorEmail ? `&cc=${encodeURIComponent(school.coordinatorEmail)}` : '';
  window.open(`mailto:${to}?subject=${subject}${cc}&body=${body}`);
}

/* ═══════════════════════════════════════════════════════════════
   IMPORT MODAL (from file / WhatsApp paste)
═══════════════════════════════════════════════════════════════ */
// המרת תאריך DD/MM/YYYY → YYYY-MM-DD
function parseDateHeb(s) {
  if (!s) return '';
  s = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
  const m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}
// המרת דרגה ידידותית → ערך פנימי
function parseGrade(raw, reform) {
  if (!raw) return reform === 'ofek' ? 1 : 'BA';
  const s = raw.trim();
  if (s === 'מתמחה' || s.toLowerCase() === 'intern') return 'intern';
  if (reform !== 'ofek') {
    if (s.includes('דוקטורט') || s.includes('phd')) return 'PHD';
    if (s.includes('שני') || s === 'MA') return 'MA';
    if (s.includes('ראשון') || s === 'BA') return 'BA';
    return 'BA';
  }
  const n = Number(s);
  return (n >= 1 && n <= 9) ? n : 1;
}
// המרת תפקיד ידידותי → id
function parseRole(raw) {
  if (!raw) return 'none';
  const s = raw.trim();
  if (s.includes('מחנך') || s.includes('מחנכ')) {
    if (s.includes("א'")) return 'homeroom1';
    if (s.includes('חטיבה')) return 'homeroom2';
    return 'homeroom';
  }
  if (s.includes('מקצוע') && s.includes('חטיבה')) return 'subject8';
  if (s.includes('מקצוע')) return 'subject6';
  if (s.includes('צוות') || s.includes('שכבה')) return 'team';
  if (s.includes('יועץ') || s.includes('יועצ')) return 'counselor';
  if (s.includes("סגן") || s.includes("סגנ")) return 'vp';
  const known = ['homeroom','homeroom1','homeroom2','subject6','subject8','team','counselor','counselor2','vp'];
  return known.includes(s) ? s : 'none';
}

function parseTeachers(text, schoolId) {
  const results = [];
  // דלג על שורות הסבר (#) וחלק ריק
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  // Detect CSV (has commas, first line might be header)
  const isCSV = lines[0]?.includes(',') && lines[0].split(',').length >= 3;

  if (isCSV) {
    const start = lines[0].match(/שם|name/i) ? 1 : 0;
    for (let i = start; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (!cols[0]) continue;

      // עמודות חדשות: שם,ת.ז.,מייל,רפורמה,דרגה,ותק,% משרה,תפקיד,שיבוץ זמני,תאריך התחלה,תאריך סיום
      // תמיכה גם בפורמט ישן: שם,ת.ז.,רפורמה,דרגה,ותק,% משרה,תפקיד,תאריך התחלה,תאריך סיום
      const hasEmail = cols.length >= 9 && (cols[2].includes('@') || cols[2] === '');
      let name, tzId, email, reformRaw, gradeRaw, seniority, scopePct, roleRaw, isTempRaw, startRaw, endRaw;

      if (hasEmail) {
        [name, tzId, email, reformRaw, gradeRaw, seniority, scopePct, roleRaw, isTempRaw, startRaw, endRaw] = cols;
      } else {
        [name, tzId, reformRaw, gradeRaw, seniority, scopePct, roleRaw, startRaw, endRaw] = cols;
        email = '';
        isTempRaw = '';
      }

      const reform = reformRaw?.includes('טרום') ? 'pre' : 'ofek';
      const grade  = parseGrade(gradeRaw, reform);
      const scope  = Number(scopePct) || 100;
      const isTemp = isTempRaw?.trim() === 'כן';

      results.push({
        ...EMPTY_TEACHER, id: '', schoolId,
        name:      name || '',
        tzId:      tzId || '',
        email:     email || '',
        reform,
        grade,
        degree:    reform === 'pre' ? (typeof grade === 'string' ? grade : 'BA') : 'BA',
        seniority: Number(seniority) || 0,
        scopePct:  scope,
        scope,
        frontalHours: Math.round(26 * scope / 100),
        role:      parseRole(roleRaw),
        isTemp,
        startDate: parseDateHeb(startRaw),
        endDate:   parseDateHeb(endRaw),
        _changedAt: new Date().toISOString(),
      });
    }
  } else {
    // WhatsApp / free text: look for blocks with כname + ת.ז / שם
    const blocks = text.split(/\n\s*\n/).filter(Boolean);
    for (const block of blocks) {
      const get = (patterns) => {
        for (const p of patterns) {
          const m = block.match(p);
          if (m) return m[1]?.trim();
        }
        return '';
      };
      const name = get([/שם[:\s]+([^\n]+)/, /^([^\n:]{2,20})$/m]);
      if (!name) continue;
      const tzId     = get([/ת\.?ז\.?[:\s]*([\d]{5,9})/]);
      const reform   = block.match(/טרום/) ? 'pre' : 'ofek';
      const gradeRaw = get([/דרגה[:\s]*([\dא-ת]+)/, /grade[:\s]*([\d]+)/i]);
      const grade    = gradeRaw === 'מתמחה' ? 'intern' : (Number(gradeRaw) || 1);
      const sen      = Number(get([/ותק[:\s]*([\d]+)/, /seniority[:\s]*([\d]+)/i])) || 0;
      const scopePct = Number(get([/משרה[:\s]*([\d]+)/, /%([\d]+)/])) || 100;
      results.push({
        ...EMPTY_TEACHER, id: '', schoolId,
        name, tzId, reform, grade, seniority: sen, scopePct,
        frontalHours: Math.round(26 * scopePct / 100),
        _changedAt: new Date().toISOString(),
      });
    }
  }
  return results;
}

/* ─── CSV template download ─── */
function downloadTemplate(schoolName) {
  const BOM = '\uFEFF';
  // שורת הסבר (מתחילה ב-# — תדלג עליה המערכת)
  const note1 = '# הנחיות מילוי: מלאי שורה אחת לכל מורה. אל תמחקי את שורת הכותרת.';
  const note2 = '# רפורמה: כתבי אופק או טרום  |  דרגה אופק: 1-9 או מתמחה  |  דרגה טרום: תואר-ראשון / תואר-שני / דוקטורט / מתמחה';
  const note3 = '# שיבוץ זמני: כתבי כן אם זו החלפה זמנית. תאריך סיום חובה לשיבוץ זמני.';
  const header = 'שם פרטי ומשפחה,תעודת זהות,מייל,רפורמה,דרגה,ותק (שנים),אחוז משרה (%),תפקיד,שיבוץ זמני (כן/לא),תאריך התחלה (DD/MM/YYYY),תאריך סיום (DD/MM/YYYY)';
  const ex1 = 'שרה כהן,123456789,sarah@school.edu,אופק,5,10,100,מחנכת,לא,01/09/2024,';
  const ex2 = 'רחל לוי,987654321,rachel@school.edu,אופק,מתמחה,1,100,ללא תפקיד,לא,01/09/2024,';
  const ex3 = 'מרים דוד,111222333,miriam@school.edu,טרום,תואר-שני,18,75,ללא תפקיד,כן,01/09/2024,31/01/2025';
  const csv = BOM + [note1, note2, note3, header, ex1, ex2, ex3].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `מורים_${schoolName || 'בית_ספר'}.csv`;
  a.click();
}

function ImportModal({ schoolId, schoolName, onImport, onClose }) {
  const [text, setText]   = useState('');
  const [preview, setPrev]= useState(null);
  const [error, setError] = useState('');

  const handleFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => { setText(ev.target.result); setPrev(null); };
    reader.readAsText(f, 'utf-8');
    e.target.value = '';
  };

  const handlePreview = () => {
    setError('');
    const parsed = parseTeachers(text, schoolId);
    if (parsed.length === 0) { setError('לא זוהו נתונים. בדקי את הפורמט.'); return; }
    setPrev(parsed);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, overflowY:'auto' }}>
      <div className="apple-card" style={{ width:'100%', maxWidth:640, padding:24, margin:'16px auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ fontWeight:700, fontSize:17, color:'var(--apple-text)', letterSpacing:'-0.01em' }}>ייבוא מורים — {schoolName}</h2>
          <button onClick={onClose} style={{ background:'var(--apple-fill)', border:'none', borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:14, color:'var(--apple-text2)', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {/* שלב 1 */}
        <div style={{ background:'rgba(0,122,255,0.06)', borderRadius:14, padding:16, marginBottom:12, border:'1px solid rgba(0,122,255,0.15)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div>
              <p style={{ fontWeight:700, fontSize:14, color:'var(--apple-blue)', marginBottom:2 }}>שלב 1 — הורד תבנית למילוי</p>
              <p style={{ fontSize:12, color:'var(--apple-text2)' }}>קובץ CSV עם כל השדות + שורות לדוגמה</p>
            </div>
            <button className="apple-btn apple-btn-blue" onClick={() => downloadTemplate(schoolName)} style={{ fontSize:13, padding:'8px 14px', whiteSpace:'nowrap' }}>⬇️ הורד תבנית</button>
          </div>
          <div style={{ marginTop:10, fontSize:12, color:'var(--apple-blue)', background:'rgba(0,122,255,0.08)', borderRadius:10, padding:'8px 12px', lineHeight:1.7 }}>
            שם · ת.ז. · מייל · רפורמה · דרגה · ותק · % משרה · תפקיד · שיבוץ זמני · תאריך התחלה/סיום
          </div>
        </div>

        {/* שלב 2 */}
        <div style={{ background:'var(--apple-fill)', borderRadius:14, padding:16, marginBottom:12 }}>
          <p style={{ fontWeight:700, fontSize:13, color:'var(--apple-text2)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.04em' }}>שלב 2 — העלי קובץ</p>
          <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', border:'2px dashed var(--apple-fill2)', borderRadius:12, padding:24, cursor:'pointer', transition:'border-color 0.15s', background:'var(--apple-surface)' }}>
            <span style={{ fontSize:32, marginBottom:8 }}>📂</span>
            <span style={{ fontWeight:600, fontSize:14, color:'var(--apple-text)' }}>לחצי להעלאת קובץ CSV</span>
            <span style={{ fontSize:12, color:'var(--apple-text3)', marginTop:4 }}>או גררי לכאן</span>
            <input type="file" accept=".csv,.txt" onChange={handleFile} style={{ display:'none' }} />
          </label>
          {text && (
            <p style={{ fontSize:12, color:'var(--apple-green)', fontWeight:600, textAlign:'center', marginTop:10 }}>
              ✓ קובץ נקרא — {text.split('\n').filter(l=>l.trim()).length} שורות
            </p>
          )}
        </div>

        {error && (
          <div style={{ background:'rgba(255,59,48,0.08)', border:'1px solid rgba(255,59,48,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'var(--apple-red)', fontWeight:600 }}>
            {error}
          </div>
        )}

        {preview ? (
          <div>
            <p style={{ fontWeight:700, fontSize:14, color:'var(--apple-text)', marginBottom:10 }}>שלב 3 — אישור: נמצאו {preview.length} מורים</p>
            <div style={{ background:'rgba(255,159,10,0.08)', border:'1px solid rgba(255,159,10,0.2)', borderRadius:10, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#a06000' }}>
              💡 לאחר הייבוא — כנסי לסימולטור והזיני את השכר הרשמי לכל מורה
            </div>
            <div style={{ overflowX:'auto', border:'1px solid var(--apple-fill2)', borderRadius:12, maxHeight:220, overflowY:'auto' }}>
              <table className="apple-table" style={{ fontSize:12 }}>
                <thead>
                  <tr>
                    {['שם','ת.ז.','מייל','רפורמה','דרגה','ותק','% משרה','תפקיד','זמני','תאריך התחלה'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((t,i) => (
                    <tr key={i}>
                      <td style={{ fontWeight:600 }}>{t.name}</td>
                      <td style={{ fontFamily:'monospace', fontSize:11 }}>{t.tzId||'—'}</td>
                      <td style={{ fontSize:11, color:'var(--apple-text2)' }}>{t.email||'—'}</td>
                      <td>{t.reform==='ofek'?'אופק':'טרום'}</td>
                      <td>{t.grade==='intern'?'מתמחה':t.grade}</td>
                      <td>{t.seniority}</td>
                      <td>{t.scopePct}%</td>
                      <td style={{ fontSize:11 }}>{ROLES.find(r=>r.id===t.role)?.label.split('(')[0].trim()||'—'}</td>
                      <td style={{ textAlign:'center' }}>{t.isTemp?'כן':'—'}</td>
                      <td style={{ fontSize:11 }}>{t.startDate||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button className="apple-btn apple-btn-ghost" onClick={() => setPrev(null)} style={{ flex:1, fontSize:14 }}>← חזרה</button>
              <button className="apple-btn apple-btn-green" onClick={() => onImport(preview)} style={{ flex:1, fontSize:14 }}>ייבא {preview.length} מורים ✓</button>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', gap:8 }}>
            <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ flex:1, fontSize:14 }}>ביטול</button>
            <button className="apple-btn apple-btn-blue" onClick={handlePreview} disabled={!text.trim()} style={{ flex:1, fontSize:14 }}>תצוגה מקדימה →</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FILE ATTACHMENTS SECTION
═══════════════════════════════════════════════════════════════ */
function FileAttachSection({ files, onChange }) {
  const MAX_SIZE = 2 * 1024 * 1024;

  const handleAdd = e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > MAX_SIZE) { alert('קובץ גדול מדי (מקסימום 2MB)'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const file = { id: uid(), name: f.name, type: f.type, data: ev.target.result, uploadedAt: new Date().toISOString() };
      onChange([...files, file]);
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const download = file => {
    const a = document.createElement('a');
    a.href = file.data; a.download = file.name; a.click();
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <span className="apple-label" style={{ marginBottom:0 }}>📎 קבצים מצורפים</span>
        <label style={{ cursor:'pointer' }}>
          <span className="apple-btn apple-btn-ghost" style={{ fontSize:12, padding:'5px 12px', display:'inline-flex', alignItems:'center', gap:4 }}>
            + הוסף קובץ
          </span>
          <input type="file" style={{ display:'none' }} onChange={handleAdd} />
        </label>
      </div>
      {files.length === 0 ? (
        <p style={{ fontSize:12, color:'var(--apple-text3)', textAlign:'center', padding:'12px 0' }}>אין קבצים מצורפים</p>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {files.map(f => (
            <div key={f.id} style={{ display:'flex', alignItems:'center', gap:10, background:'var(--apple-fill)', borderRadius:10, padding:'8px 12px' }}>
              <span style={{ fontSize:18 }}>{f.type?.startsWith('image') ? '🖼️' : f.type?.includes('pdf') ? '📄' : '📎'}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:13, fontWeight:600, color:'var(--apple-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</p>
                <p style={{ fontSize:11, color:'var(--apple-text3)' }}>{new Date(f.uploadedAt).toLocaleDateString('he-IL')}</p>
              </div>
              <button onClick={() => download(f)} style={{ fontSize:12, color:'var(--apple-blue)', background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:'4px 8px' }}>הורד</button>
              <button onClick={() => onChange(files.filter(x => x.id !== f.id))} style={{ fontSize:13, color:'var(--apple-red)', background:'none', border:'none', cursor:'pointer', padding:'4px 6px' }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TEACHER MODAL
═══════════════════════════════════════════════════════════════ */
function TeacherModal({ teacher, schools, onSave, onClose, userRole }) {
  const [t, setT] = useState({ ...EMPTY_TEACHER, ...teacher, scopeChanges: teacher.scopeChanges || [], _files: teacher._files || [] });
  const [showScopeChange, setShowScopeChange] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [simCalc, setSimCalc] = useState('ofek');
  const set = (k, v) => setT(p => ({ ...p, [k]: v }));

  const simUrls = {
    ofek: 'https://educalc.unq.co.il/#/Calculators/2',
    old:  'https://educalc.unq.co.il/#/Calculators/1',
    mgmt: 'https://educalc.unq.co.il/#/Calculators/4',
  };

  const lvl = LEVELS[t.level] || LEVELS.elementary;
  const agR = AGE_RED[t.ageGroup] || AGE_RED.none;
  const baseFrontal = lvl.frontal - agR.f;

  const syncFromFrontal = hrs => {
    const scopePct = baseFrontal > 0 ? Math.round((hrs / baseFrontal) * 100) : 100;
    setT(p => ({ ...p, frontalHours: hrs, scopePct }));
  };
  const syncFromScope = pct => {
    const frontalHours = Math.round(baseFrontal * pct / 100);
    setT(p => ({ ...p, scopePct: pct, frontalHours }));
  };

  const cur     = currentScope(t);
  const derived = deriveHours(t, cur);
  const base    = calcBase(t);
  const emp     = calcEmployer(t);
  const extras  = emp.extras;

  const addScopeChange = c => {
    const changes = [...t.scopeChanges, c].sort((a,b) => a.date.localeCompare(b.date));
    setT(p => ({ ...p, scopeChanges: changes }));
    setShowScopeChange(false);
  };
  const removeScopeChange = id => setT(p => ({ ...p, scopeChanges: p.scopeChanges.filter(c => c.id !== id) }));
  const sortedChanges = [...t.scopeChanges].sort((a,b) => b.date.localeCompare(a.date));

  return (
    <div className={['fixed inset-0 bg-black/50 z-50 flex', showSimulator ? 'flex-row items-stretch' : 'flex-col items-center justify-start overflow-y-auto p-4'].join(' ')}>

      {/* סימולטור — פאנל שמאל */}
      {showSimulator && (
        <div style={{ display:'flex', flexDirection:'column', background:'#fff', borderLeft:'0.5px solid var(--apple-fill2)', width:'55%' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'var(--apple-fill)', borderBottom:'0.5px solid var(--apple-fill2)', flexWrap:'wrap' }}>
            <span style={{ fontSize:12, fontWeight:600, color:'var(--apple-text2)' }}>מחשבון רשמי</span>
            <div className="apple-seg">
              {[['ofek','אופק'],['old','טרום'],['mgmt','ניהול']].map(([id,label]) => (
                <button key={id} onClick={() => setSimCalc(id)} className={['apple-seg-item', simCalc===id?'active':''].join(' ')} style={{ padding:'5px 10px', fontSize:12 }}>{label}</button>
              ))}
            </div>
          </div>
          <iframe key={simCalc} src={simUrls[simCalc]} style={{ flex:1, width:'100%', border:'none' }} title="סימולטור רשמי" />
        </div>
      )}

      {/* טופס — פאנל ימין */}
      <div style={showSimulator
        ? { width:'45%', display:'flex', flexDirection:'column', background:'#fff', overflowY:'auto' }
        : { background:'#fff', borderRadius:18, width:'100%', maxWidth:520, margin:'24px auto', boxShadow:'var(--apple-shadow)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 24px', borderBottom:'0.5px solid var(--apple-fill2)' }}>
          <h2 style={{ fontSize:17, fontWeight:700, letterSpacing:'-0.02em', color:'var(--apple-text)' }}>{t.id ? 'עריכת מורה' : 'הוספת מורה'}</h2>
          <button onClick={onClose} style={{ background:'var(--apple-fill)', border:'none', borderRadius:'50%', width:28, height:28, fontSize:14, cursor:'pointer', color:'var(--apple-text2)', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>

          {/* שם + ת.ז */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p className="apple-label">שם המורה</p>
              <input value={t.name} onChange={e => set('name', e.target.value)} placeholder="שם מלא" className="apple-input" />
            </div>
            <div>
              <p className="apple-label">תעודת זהות</p>
              <input value={t.tzId} onChange={e => set('tzId', e.target.value)} placeholder="000000000" dir="ltr" className="apple-input" style={{ fontFamily:'monospace' }} />
            </div>
          </div>

          {/* מייל */}
          <div>
            <p className="apple-label">מייל המורה</p>
            <input value={t.email || ''} onChange={e => set('email', e.target.value)} placeholder="teacher@school.edu" dir="ltr" className="apple-input" />
          </div>

          {/* בית ספר */}
          {userRole !== 'principal' && (
            <div>
              <p className="apple-label">בית ספר</p>
              <select value={t.schoolId} onChange={e => set('schoolId', e.target.value)} className="apple-select">
                <option value="">בחר בית ספר</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* שיבוץ זמני + תאריכים */}
          <div className="apple-section" style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <label className="apple-toggle">
                <input type="checkbox" checked={t.isTemp} onChange={e => set('isTemp', e.target.checked)} />
                <div className="apple-toggle-track" />
              </label>
              <div>
                <p style={{ fontWeight:600, fontSize:14, color:'var(--apple-text)' }}>שיבוץ זמני (מילוי מקום)</p>
                {t.isTemp && <p style={{ fontSize:12, color:'var(--apple-orange)' }}>תאריך סיום — חובה</p>}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <p className="apple-label">תאריך התחלה</p>
                <input type="date" value={t.startDate} onChange={e => set('startDate', e.target.value)} dir="ltr" className="apple-input" />
              </div>
              <div>
                <p className="apple-label" style={{ color: t.isTemp ? 'var(--apple-orange)' : undefined }}>
                  תאריך סיום{t.isTemp ? ' *' : ''}
                </p>
                <input type="date" value={t.endDate} onChange={e => set('endDate', e.target.value)} dir="ltr" className="apple-input" />
              </div>
            </div>
          </div>

          {/* רפורמה */}
          <div>
            <p className="apple-label">רפורמה</p>
            <div className="apple-seg" style={{ width:'100%' }}>
              {[['ofek','אופק חדש'],['pre','טרום רפורמה']].map(([v,l]) => (
                <button key={v} onClick={() => set('reform', v)} className={['apple-seg-item', t.reform===v?'active':''].join(' ')}>{l}</button>
              ))}
            </div>
          </div>

          {/* אופק חדש */}
          {t.reform === 'ofek' && (<>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <p className="apple-label">דרגה</p>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:4 }}>
                  {OFEK_GRADES.map(g => (
                    <button key={g.id} onClick={() => set('grade', g.id)} style={{
                      padding:'7px 2px', borderRadius:8, border:'none', fontSize:12, fontWeight:700, cursor:'pointer',
                      background: t.grade===g.id ? 'var(--apple-blue)' : 'var(--apple-fill)',
                      color: t.grade===g.id ? '#fff' : 'var(--apple-text2)',
                    }}>{g.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="apple-label">שלב לימוד</p>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {Object.entries(LEVELS).map(([k,v]) => (
                    <button key={k} onClick={() => set('level', k)} style={{
                      padding:'8px 12px', borderRadius:8, border:'none', fontSize:13, fontWeight:600, cursor:'pointer', textAlign:'right',
                      background: t.level===k ? 'var(--apple-blue)' : 'var(--apple-fill)',
                      color: t.level===k ? '#fff' : 'var(--apple-text)',
                    }}>{v.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="apple-label">קבוצת גיל</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {Object.entries(AGE_RED).map(([k,v]) => (
                  <button key={k} onClick={() => set('ageGroup', k)} style={{
                    padding:'8px 12px', borderRadius:8, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', textAlign:'right',
                    background: t.ageGroup===k ? 'var(--apple-orange)' : 'var(--apple-fill)',
                    color: t.ageGroup===k ? '#fff' : 'var(--apple-text)',
                  }}>{v.label}</button>
                ))}
              </div>
            </div>

            <div className="apple-section" style={{ gap:12, display:'flex', flexDirection:'column' }}>
              <p className="apple-label" style={{ marginBottom:0 }}>משרה</p>
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:13, color:'var(--apple-text2)' }}>אחוז משרה</span>
                  <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{t.scopePct}%</span>
                </div>
                <input type="range" min={1} max={140} value={t.scopePct} onChange={e => syncFromScope(+e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
                <div style={{ display:'flex', gap:4, marginTop:8, flexWrap:'wrap' }}>
                  {[50,67,75,100,112,125,140].map(v => (
                    <button key={v} onClick={() => syncFromScope(v)} style={{
                      flex:1, minWidth:0, padding:'5px 2px', borderRadius:8, border:'none', fontSize:11, fontWeight:600, cursor:'pointer',
                      background: t.scopePct===v ? 'var(--apple-blue)' : '#fff',
                      color: t.scopePct===v ? '#fff' : 'var(--apple-text2)',
                    }}>{v}%</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:13, color:'var(--apple-text2)' }}>שעות פרונטליות (מ-{baseFrontal})</span>
                  <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{t.frontalHours}</span>
                </div>
                <input type="range" min={0} max={40} value={t.frontalHours} onChange={e => syncFromFrontal(+e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
              </div>
              {derived && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, textAlign:'center' }}>
                  {[
                    { label: 'אחוז', val: derived.scopePct + '%' },
                    { label: 'פרונטלי', val: derived.frontal },
                    { label: 'פרטני',   val: derived.individual },
                    { label: 'שהייה',   val: derived.presence },
                  ].map(c => (
                    <div key={c.label} style={{ background:'#fff', borderRadius:10, padding:'8px 4px' }}>
                      <p style={{ fontSize:11, color:'var(--apple-text3)', marginBottom:2 }}>{c.label}</p>
                      <p style={{ fontWeight:700, color:'var(--apple-blue)', fontSize:14 }}>{c.val}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* שינויי משרה */}
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <p className="apple-label" style={{ marginBottom:0 }}>שינויי משרה</p>
                <button className="apple-btn apple-btn-blue" onClick={() => setShowScopeChange(true)} style={{ fontSize:12, padding:'5px 12px' }}>+ הוסף</button>
              </div>
              {sortedChanges.length === 0 ? (
                <p style={{ fontSize:12, color:'var(--apple-text3)', textAlign:'center', padding:'8px 0' }}>אין שינויים רשומים</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {sortedChanges.map(c => (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', borderRadius:10, padding:'8px 12px' }}>
                      <div style={{ flex:1, fontSize:12 }}>
                        <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{c.scopePct}%</span>
                        {c.frontalHours && <span style={{ color:'var(--apple-text2)' }}> · {c.frontalHours} פר׳</span>}
                        <span style={{ color:'var(--apple-text3)' }}> · {fmt(c.date)}</span>
                        <span style={{ color:'var(--apple-orange)' }}> · {REASON_TYPES.find(r=>r.id===c.reasonType)?.label}</span>
                        {c.detail && <span style={{ color:'var(--apple-text2)' }}> ({c.detail})</span>}
                      </div>
                      <button onClick={() => removeScopeChange(c.id)} style={{ background:'none', border:'none', color:'var(--apple-red)', cursor:'pointer', fontSize:14 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>)}

          {/* טרום רפורמה */}
          {t.reform === 'pre' && (<>
            <div>
              <p className="apple-label">דרגה / תואר</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {[['intern','מתמחה'],['BA','תואר ראשון'],['MA','תואר שני']].map(([v,l]) => (
                  <button key={v} onClick={() => set('degree', v)} style={{
                    padding:'10px 12px', borderRadius:10, border:'none', fontSize:13, fontWeight:600, cursor:'pointer',
                    background: t.degree===v ? 'var(--apple-purple)' : 'var(--apple-fill)',
                    color: t.degree===v ? '#fff' : 'var(--apple-text)',
                  }}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:13, color:'var(--apple-text2)' }}>אחוז משרה</span>
                <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{t.scope}%</span>
              </div>
              <input type="range" min={1} max={140} value={t.scope} onChange={e => set('scope', +e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
            </div>
          </>)}

          {/* ותק */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontSize:13, color:'var(--apple-text2)' }}>שנות ותק</span>
              <span style={{ fontWeight:700, color:'var(--apple-blue)' }}>{t.seniority}</span>
            </div>
            <input type="range" min={0} max={40} value={t.seniority} onChange={e => set('seniority', +e.target.value)} style={{ accentColor:'var(--apple-blue)' }} />
          </div>

          {/* תפקיד */}
          <div>
            <p className="apple-label">גמול תפקיד</p>
            <select value={t.role} onChange={e => set('role', e.target.value)} className="apple-select">
              {ROLES.map(r => (
                <option key={r.id} value={r.id}>
                  {r.label}{r.pct > 0 ? ` — ${r.pct}%${r.min ? `, מינ' ${r.min.toLocaleString()}₪` : ''}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* קבצים מצורפים */}
          <FileAttachSection files={t._files} onChange={f => setT(p => ({...p, _files: f}))} />

          {/* תוספת אם */}
          <div style={{ background:'rgba(88,86,214,0.06)', borderRadius:14, padding:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:13, fontWeight:600, color:'var(--apple-purple)', marginBottom:2 }}>תוספת אם עובדת</p>
                <p style={{ fontSize:12, color:'var(--apple-text2)' }}>ילדים עד גיל 18 (זכאות מ-79% משרה)</p>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button onClick={() => set('childrenUnder18', Math.max(0, (t.childrenUnder18||0)-1))}
                  style={{ width:28, height:28, borderRadius:'50%', border:'1px solid var(--apple-fill2)', background:'var(--apple-fill)', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>−</button>
                <span style={{ fontWeight:800, fontSize:18, color:'var(--apple-purple)', minWidth:20, textAlign:'center' }}>{t.childrenUnder18||0}</span>
                <button onClick={() => set('childrenUnder18', (t.childrenUnder18||0)+1)}
                  style={{ width:28, height:28, borderRadius:'50%', border:'1px solid var(--apple-fill2)', background:'var(--apple-fill)', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>+</button>
              </div>
            </div>
            {(t.childrenUnder18||0) > 0 && (t.scopePct||t.scope||100) >= 79 && (
              <p style={{ fontSize:12, color:'var(--apple-purple)', fontWeight:600, marginTop:8 }}>
                ✓ זכאית לתוספת אם — {t.childrenUnder18} ילדים עד גיל 18
              </p>
            )}
            {(t.childrenUnder18||0) > 0 && (t.scopePct||t.scope||100) < 79 && (
              <p style={{ fontSize:12, color:'var(--apple-orange)', marginTop:8 }}>
                אחוז משרה נמוך מ-79% — אין זכאות לתוספת אם
              </p>
            )}
          </div>

          {/* שכר מהסימולטור הרשמי */}
          <div style={{ background:'rgba(52,199,89,0.08)', borderRadius:14, padding:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <p style={{ fontSize:13, fontWeight:600, color:'#1a7a38' }}>שכר משולב מהסימולטור</p>
              <button className="apple-btn apple-btn-green" onClick={() => setShowSimulator(v => !v)} style={{ fontSize:12, padding:'6px 12px' }}>
                {showSimulator ? 'סגור' : 'פתח סימולטור'}
              </button>
            </div>
            <p style={{ fontSize:12, color:'#2d8a4e', marginBottom:10 }}>הריצי את הסימולטור → הכניסי כאן את "השכר המשולב"</p>

            {/* אופק חדש — שני שדות */}
            {t.reform === 'ofek' ? (<>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <div>
                  <p style={{ fontSize:11, fontWeight:700, color:'#1a7a38', marginBottom:4 }}>סימולציית אופק חדש</p>
                  <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                    <input type="number" className="apple-input" dir="ltr" style={{ fontSize:13 }}
                      value={t._officialGross || ''}
                      onChange={e => set('_officialGross', e.target.value ? Number(e.target.value) : null)}
                      placeholder="שכר אופק..." />
                    {t._officialGross && <button onClick={() => set('_officialGross', null)} style={{ background:'none', border:'none', color:'var(--apple-red)', cursor:'pointer', fontSize:14 }}>✕</button>}
                  </div>
                </div>
                <div>
                  <p style={{ fontSize:11, fontWeight:700, color:'#8B5CF6', marginBottom:4 }}>סימולציית טרום רפורמה</p>
                  <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                    <input type="number" className="apple-input" dir="ltr" style={{ fontSize:13 }}
                      value={t._officialGrossPre || ''}
                      onChange={e => set('_officialGrossPre', e.target.value ? Number(e.target.value) : null)}
                      placeholder="שכר טרום..." />
                    {t._officialGrossPre && <button onClick={() => set('_officialGrossPre', null)} style={{ background:'none', border:'none', color:'var(--apple-red)', cursor:'pointer', fontSize:14 }}>✕</button>}
                  </div>
                </div>
              </div>
              {t._officialGross && t._officialGrossPre && (
                <div style={{ background:'rgba(88,86,214,0.1)', borderRadius:10, padding:'8px 12px', fontSize:12, color:'var(--apple-purple)', fontWeight:600 }}>
                  תוספת בית חב"ד: {(Number(t._officialGross) - Number(t._officialGrossPre)).toLocaleString()} ₪
                  <span style={{ fontWeight:400, color:'var(--apple-text2)', marginRight:6 }}>(= אופק − טרום)</span>
                </div>
              )}
            </>) : (
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input type="number" className="apple-input" dir="ltr"
                  value={t._officialGross || ''}
                  onChange={e => set('_officialGross', e.target.value ? Number(e.target.value) : null)}
                  placeholder="שכר משולב..." />
                {t._officialGross && <button onClick={() => set('_officialGross', null)} style={{ background:'none', border:'none', color:'var(--apple-red)', cursor:'pointer', fontSize:16 }}>✕</button>}
              </div>
            )}
          </div>

          {/* תצוגה מקדימה — נתון רשמי בלבד */}
          {t._officialGross ? (
            <div style={{ background:'#E8F5E9', border:'2px solid #A5D6A7', borderRadius:12, padding:16 }}>
              <p style={{ fontSize:11, fontWeight:700, color:'#2E7D32', textAlign:'center', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.04em' }}>✓ שכר רשמי מסימולטור משרד החינוך</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, textAlign:'center' }}>
                <div style={{ background:'#C8E6C9', borderRadius:8, padding:'10px 8px' }}>
                  <p style={{ fontSize:11, color:'#555', marginBottom:4 }}>ברוטו חודשי</p>
                  <p style={{ fontSize:20, fontWeight:800, color:'#1B5E20' }}>{Number(t._officialGross).toLocaleString()} ₪</p>
                </div>
                <div style={{ background:'#C8E6C9', borderRadius:8, padding:'10px 8px' }}>
                  <p style={{ fontSize:11, color:'#555', marginBottom:4 }}>ביגוד + הבראה</p>
                  <p style={{ fontSize:16, fontWeight:700, color:'#1B5E20' }}>{extras.total.toLocaleString()} ₪</p>
                </div>
                <div style={{ background:'#A5D6A7', borderRadius:8, padding:'10px 8px' }}>
                  <p style={{ fontSize:11, color:'#333', marginBottom:4 }}>ברוטו למעסיק</p>
                  <p style={{ fontSize:20, fontWeight:800, color:'#1B5E20' }}>{emp.total.toLocaleString()} ₪</p>
                </div>
              </div>
              <p style={{ fontSize:11, color:'#666', textAlign:'center', marginTop:10 }}>
                נטו משוער {calcNet(Number(t._officialGross)).toLocaleString()} ₪ · מעסיק 30%: {emp.social.toLocaleString()} ₪
              </p>
            </div>
          ) : (
            <div style={{ background:'#FFF3E0', border:'1px dashed #FFB74D', borderRadius:12, padding:16, textAlign:'center' }}>
              <p style={{ fontSize:13, fontWeight:600, color:'#E65100', marginBottom:6 }}>נדרשת סימולציה במחשבון משרד החינוך</p>
              <p style={{ fontSize:12, color:'#999' }}>הזיני את השכר המשולב בשדה למעלה לאחר ביצוע הסימולציה</p>
            </div>
          )}
        </div>

        <div style={{ padding:'16px 24px', borderTop:'1px solid var(--apple-fill2)', display:'flex', gap:8 }}>
          <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ flex:1 }}>ביטול</button>
          <button className="apple-btn apple-btn-blue" onClick={() => {
            if (!t.name.trim()) return alert('יש למלא שם');
            if (!t.schoolId)    return alert('יש לבחור בית ספר');
            onSave(t);
          }} style={{ flex:2 }}>
            {t.id ? 'שמור שינויים' : 'הוסף מורה'}
          </button>
        </div>
      </div>
      {showScopeChange && (
        <ScopeChangeModal teacher={t} onSave={addScopeChange} onClose={() => setShowScopeChange(false)} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCHOOL MODAL
═══════════════════════════════════════════════════════════════ */
function SchoolModal({ school, onSave, onClose }) {
  const [s, setS] = useState({ ...school });
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(4px)' }}>
      <div className="apple-card" style={{ width:'100%', maxWidth:360, padding:24 }}>
        <h2 style={{ fontSize:17, fontWeight:700, letterSpacing:'-0.02em', color:'var(--apple-text)', marginBottom:20 }}>
          {s.id ? 'עריכת בית ספר' : 'הוספת בית ספר'}
        </h2>
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
          <input value={s.name || ''} onChange={e => setS(p => ({...p, name: e.target.value}))} placeholder="שם בית הספר *" className="apple-input" />
          <input value={s.city || ''} onChange={e => setS(p => ({...p, city: e.target.value}))} placeholder="עיר / יישוב" className="apple-input" />
          <input value={s.principalEmail || ''} onChange={e => setS(p => ({...p, principalEmail: e.target.value}))} placeholder="מייל מנהלת" dir="ltr" className="apple-input" />
          <input value={s.coordinatorEmail || ''} onChange={e => setS(p => ({...p, coordinatorEmail: e.target.value}))} placeholder="מייל שליח (עותק)" dir="ltr" className="apple-input" />
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="apple-btn apple-btn-ghost" onClick={onClose} style={{ flex:1 }}>ביטול</button>
          <button className="apple-btn apple-btn-blue" onClick={() => { if (!s.name?.trim()) return; onSave(s); }} style={{ flex:1 }}>שמור</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCHOOL REPORT
═══════════════════════════════════════════════════════════════ */
function SchoolReport({ school, teachers, onClose }) {
  const ts = teachers.filter(t => t.schoolId === school.id);
  const tsOfficial  = ts.filter(t => t._officialGross);
  const totEmpGross = tsOfficial.reduce((s, t) => s + calcEmployer(t).total, 0);
  const totGross    = tsOfficial.reduce((s, t) => s + Number(t._officialGross), 0);
  const pendingCount = ts.filter(isPending).length;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, overflowY:'auto' }} dir="rtl">
      <div style={{ maxWidth:1000, margin:'0 auto', background:'var(--apple-surface)', minHeight:'100vh', padding:32 }}>
        <div className="no-print" style={{ display:'flex', justifyContent:'space-between', marginBottom:24 }}>
          <button className="apple-btn apple-btn-ghost" onClick={onClose}>← חזרה</button>
          <button className="apple-btn apple-btn-blue" onClick={() => window.print()}>🖨️ הדפסה</button>
        </div>

        <div style={{ borderBottom:'2px solid var(--apple-text)', paddingBottom:16, marginBottom:24 }}>
          <h1 style={{ fontSize:24, fontWeight:800, letterSpacing:'-0.02em', color:'var(--apple-text)', marginBottom:4 }}>דוח שכר מורים</h1>
          <h2 style={{ fontSize:17, fontWeight:600, color:'var(--apple-text2)', marginBottom:4 }}>{school.name}{school.city ? ` — ${school.city}` : ''}</h2>
          <p style={{ fontSize:13, color:'var(--apple-text3)' }}>הופק: {new Date().toLocaleDateString('he-IL')}</p>
          {pendingCount > 0 && (
            <div style={{ marginTop:8, display:'inline-flex', alignItems:'center', gap:6, background:'rgba(255,159,10,0.12)', border:'1px solid rgba(255,159,10,0.3)', borderRadius:8, padding:'4px 12px', fontSize:13, fontWeight:600, color:'#a06000' }}>
              🔔 {pendingCount} שינויים ממתינים לאישור
            </div>
          )}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
          {[
            { label: 'סה"כ מורים', val: ts.length },
            { label: 'אופק חדש',   val: ts.filter(t=>t.reform==='ofek').length },
            { label: 'טרום רפורמה', val: ts.filter(t=>t.reform==='pre').length },
            { label: 'ברוטו למעסיק', val: totEmpGross.toLocaleString()+' ₪' },
          ].map(c => (
            <div key={c.label} className="apple-stat" style={{ textAlign:'center' }}>
              <p className="apple-stat-label">{c.label}</p>
              <p className="apple-stat-value" style={{ fontSize:18 }}>{c.val}</p>
            </div>
          ))}
        </div>

        <table className="apple-table" style={{ fontSize:12, marginBottom:24 }}>
          <thead>
            <tr>
              <th>שם</th><th>ת.ז.</th><th style={{ textAlign:'center' }}>רפורמה</th>
              <th style={{ textAlign:'center' }}>דרגה</th><th style={{ textAlign:'center' }}>ותק</th>
              <th style={{ textAlign:'center' }}>% משרה</th><th style={{ textAlign:'center' }}>פרונטלי</th>
              <th style={{ textAlign:'center' }}>פרטני</th><th style={{ textAlign:'center' }}>שהייה</th>
              <th>תפקיד</th><th style={{ textAlign:'center' }}>מתאריך</th><th style={{ textAlign:'center' }}>עד תאריך</th>
              <th>ברוטו</th><th>ביגוד+הבראה</th><th style={{ color:'var(--apple-purple)' }}>ברוטו למעסיק</th>
            </tr>
          </thead>
          <tbody>
            {ts.map((t, i) => {
              const emp     = calcEmployer(t);
              const derived = deriveHours(t);
              const scope   = t.reform === 'ofek' ? (derived?.scopePct || t.scopePct || 100) : (t.scope || 100);
              const grade   = t.reform === 'ofek' ? (t.grade === 'intern' ? 'מתמחה' : `ד${t.grade}`) : (t.degree === 'intern' ? 'מתמחה' : t.degree);
              const pending = isPending(t);
              return (
                <tr key={t.id} style={pending ? { background:'rgba(255,159,10,0.08)' } : {}}>
                  <td style={{ fontWeight:600 }}>{pending && <span style={{ color:'var(--apple-orange)', marginLeft:4 }}>🔔</span>}{t.name}</td>
                  <td style={{ fontFamily:'monospace', fontSize:11 }}>{t.tzId||'—'}</td>
                  <td style={{ textAlign:'center' }}>{t.reform==='ofek'?'אופק':'טרום'}</td>
                  <td style={{ textAlign:'center', fontWeight:700 }}>{grade}</td>
                  <td style={{ textAlign:'center' }}>{t.seniority}</td>
                  <td style={{ textAlign:'center', fontWeight:600, color:'var(--apple-blue)' }}>{scope}%</td>
                  <td style={{ textAlign:'center' }}>{derived ? derived.frontal : '—'}</td>
                  <td style={{ textAlign:'center' }}>{derived ? derived.individual : '—'}</td>
                  <td style={{ textAlign:'center' }}>{derived ? derived.presence : '—'}</td>
                  <td style={{ fontSize:11 }}>{t.role!=='none' ? ROLES.find(r=>r.id===t.role)?.label.split('(')[0].trim() : '—'}</td>
                  <td style={{ textAlign:'center' }}>{fmt(t.startDate)}</td>
                  <td style={{ textAlign:'center' }}>{fmt(t.endDate)}</td>
                  <td style={{ fontWeight: t._officialGross ? 700 : 400, color: t._officialGross ? 'var(--apple-green)' : '#bbb' }}>
                    {t._officialGross ? Number(t._officialGross).toLocaleString()+' ₪' : '—'}
                  </td>
                  <td style={{ color:'var(--apple-text2)' }}>{emp.extras.total.toLocaleString()} ₪</td>
                  <td style={{ fontWeight:800, color:'var(--apple-purple)' }}>{emp.total.toLocaleString()} ₪</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={12}>סה״כ</td>
              <td style={{ color:'var(--apple-green)' }}>{totGross.toLocaleString()} ₪</td>
              <td></td>
              <td style={{ color:'var(--apple-purple)' }}>{totEmpGross.toLocaleString()} ₪</td>
            </tr>
          </tfoot>
        </table>

        {pendingCount > 0 && (
          <div style={{ marginBottom:24, padding:16, background:'rgba(255,159,10,0.08)', border:'1px solid rgba(255,159,10,0.25)', borderRadius:14 }}>
            <h3 style={{ fontWeight:700, color:'#a06000', marginBottom:12, fontSize:14 }}>🔔 שינויים ממתינים לאישור</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {ts.filter(isPending).map(t => (
                <div key={t.id} className="apple-card" style={{ padding:14 }}>
                  <p style={{ fontWeight:700, fontSize:13, color:'var(--apple-text)', marginBottom:6 }}>{t.name}</p>
                  <TeacherDiff t={t} />
                </div>
              ))}
            </div>
          </div>
        )}

        {ts.some(t => t.scopeChanges?.length > 0) && (
          <div style={{ marginBottom:24 }}>
            <h3 style={{ fontWeight:700, fontSize:14, color:'var(--apple-text)', marginBottom:12, paddingBottom:8, borderBottom:'1px solid var(--apple-fill2)' }}>שינויי משרה במהלך השנה</h3>
            <table className="apple-table" style={{ fontSize:12 }}>
              <thead>
                <tr>
                  <th>מורה</th><th style={{ textAlign:'center' }}>תאריך</th>
                  <th style={{ textAlign:'center' }}>% משרה</th><th style={{ textAlign:'center' }}>פרונטלי</th>
                  <th>סיבה</th><th>פירוט</th>
                </tr>
              </thead>
              <tbody>
                {ts.flatMap(t => (t.scopeChanges || []).map(c => ({...c, teacherName: t.name})))
                  .sort((a,b) => a.date.localeCompare(b.date)).map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight:600 }}>{c.teacherName}</td>
                    <td style={{ textAlign:'center' }}>{fmt(c.date)}</td>
                    <td style={{ textAlign:'center', fontWeight:700 }}>{c.scopePct}%</td>
                    <td style={{ textAlign:'center' }}>{c.frontalHours||'—'}</td>
                    <td>{REASON_TYPES.find(r=>r.id===c.reasonType)?.label||'—'}</td>
                    <td style={{ color:'var(--apple-text2)' }}>{c.detail||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop:16, padding:14, background:'var(--apple-fill)', borderRadius:12, fontSize:12, color:'var(--apple-text2)', lineHeight:1.8 }}>
          <strong style={{ color:'var(--apple-text)' }}>פירוט ברוטו למעסיק:</strong> ברוטו + ביגוד + הבראה × 1.30<br/>
          30% = ביטוח לאומי 7.5% + פנסיה ופיצויים 15% + קרן השתלמות 7.5%<br/>
          ביגוד: {Math.round(BIGUUD_ANNUAL/12)} ₪/חודש · יום הבראה: {HAVRAAH_DAY} ₪ (2024) · הסכומים הם הערכה בלבד
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ABSENCE / MM REPORT
═══════════════════════════════════════════════════════════════ */
function AbsenceReport({ school, teachers, monthLabel, onClose }) {
  const ts = teachers.filter(t => t.schoolId === school.id);
  const withAbsence = ts.filter(t => (t.absenceDays||0) > 0 || (t.mmHours||0) > 0 || (t.monthlyExtras||0) > 0);
  const totAbsence = ts.reduce((s,t) => s + (t.absenceDays||0), 0);
  const totMM      = ts.reduce((s,t) => s + (t.mmHours||0), 0);
  const totExtras  = ts.reduce((s,t) => s + (t.monthlyExtras||0), 0);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'24px 16px', overflowY:'auto' }} dir="rtl">
      <div style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:860, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#c0392b,#e74c3c)', borderRadius:'18px 18px 0 0', padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', color:'#fff' }}>
          <div>
            <h2 style={{ fontWeight:800, fontSize:20, marginBottom:2 }}>דוח ממ"מ והעדרויות</h2>
            <p style={{ fontSize:13, opacity:.85 }}>{school.name} — {monthLabel}</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => window.print()} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, padding:'6px 14px', color:'#fff', cursor:'pointer', fontWeight:600, fontSize:13 }}>🖨️ הדפסה</button>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, padding:'6px 14px', color:'#fff', cursor:'pointer', fontWeight:700, fontSize:16 }}>✕</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, padding:'16px 24px' }}>
          {[
            { label:'סה"כ ימי העדרות', val: totAbsence, color:'#c0392b' },
            { label:'סה"כ שעות ממ"מ',  val: totMM,      color:'#8e44ad' },
            { label:'סה"כ תוספות',      val: totExtras.toLocaleString()+' ₪', color:'#27ae60' },
          ].map(c => (
            <div key={c.label} style={{ background:'#f9f9f9', borderRadius:12, padding:'12px 16px', textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#888', fontWeight:600, marginBottom:4 }}>{c.label}</div>
              <div style={{ fontSize:22, fontWeight:800, color: c.color }}>{c.val}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ padding:'0 24px 24px', overflowX:'auto' }}>
          {withAbsence.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px', color:'#aaa', fontSize:14 }}>אין העדרויות או ממ"מ לחודש זה</div>
          ) : (
            <table className="apple-table">
              <thead>
                <tr>
                  <th>שם עובדת</th>
                  <th style={{ textAlign:'center', color:'#c0392b' }}>ימי העדרות</th>
                  <th style={{ textAlign:'center', color:'#8e44ad' }}>שעות ממ"מ</th>
                  <th>במקום מי</th>
                  <th style={{ textAlign:'center', color:'#27ae60' }}>תוספות (₪)</th>
                  <th>קבצי מחלה</th>
                </tr>
              </thead>
              <tbody>
                {withAbsence.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight:600 }}>{t.name}</td>
                    <td style={{ textAlign:'center', fontWeight:700, color: (t.absenceDays||0)>0 ? '#c0392b' : '#ccc' }}>
                      {(t.absenceDays||0) > 0 ? t.absenceDays : '—'}
                    </td>
                    <td style={{ textAlign:'center', fontWeight:700, color: (t.mmHours||0)>0 ? '#8e44ad' : '#ccc' }}>
                      {(t.mmHours||0) > 0 ? t.mmHours : '—'}
                    </td>
                    <td style={{ fontSize:13, color:'#555' }}>{t.mmFor||'—'}</td>
                    <td style={{ textAlign:'center', fontWeight: (t.monthlyExtras||0)>0 ? 700 : 400, color: (t.monthlyExtras||0)>0 ? '#27ae60' : '#ccc' }}>
                      {(t.monthlyExtras||0) > 0 ? Number(t.monthlyExtras).toLocaleString()+' ₪' : '—'}
                    </td>
                    <td style={{ fontSize:12, color:'#888' }}>
                      {(t.sickFiles||[]).length > 0
                        ? <span style={{ color:'#c0392b', fontWeight:600 }}>📎 {t.sickFiles.length} קבצים</span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight:700 }}>סה"כ</td>
                  <td style={{ textAlign:'center', fontWeight:800, color:'#c0392b' }}>{totAbsence}</td>
                  <td style={{ textAlign:'center', fontWeight:800, color:'#8e44ad' }}>{totMM}</td>
                  <td></td>
                  <td style={{ textAlign:'center', fontWeight:800, color:'#27ae60' }}>{totExtras > 0 ? totExtras.toLocaleString()+' ₪' : '—'}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCHOOL DETAIL
═══════════════════════════════════════════════════════════════ */
function SchoolView({ school, schools, teachers, userRole, onBack, onAddTeacher, onSaveTeacher, onDeleteTeacher, onApproveTeacher, onImportTeachers, activeMonth, fmtMonthFn }) {
  const [search, setSearch]           = useState('');
  const [showReport, setShowReport]   = useState(false);
  const [showAbsence, setShowAbsence] = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [editingId, setEditingId]   = useState(null);   // teacher id or 'new'
  const [editData,  setEditData]    = useState(null);
  const ts       = teachers.filter(t => t.schoolId === school.id);
  const filtered = ts.filter(t => t.name.includes(search) || (t.tzId || '').includes(search));
  const tsOfficial = ts.filter(t => t._officialGross);
  const totEmp   = tsOfficial.reduce((s, t) => s + calcEmployer(t).total, 0);
  const totGross = tsOfficial.reduce((s, t) => s + Number(t._officialGross), 0);
  const totExtras = tsOfficial.reduce((s, t) => s + calcEmployer(t).extras.total, 0);
  const totSupp   = tsOfficial.reduce((s, t) => { const e = calcEmployer(t); return s + (e.total - e.gross); }, 0);
  const needsSimCount   = ts.filter(needsSim).length;
  const needsApprCount  = ts.filter(needsApproval).length;
  const isCoord  = userRole === 'coordinator';
  const isPrincipal = userRole === 'principal';

  const startEdit = t => { setEditingId(t.id); setEditData({ ...t }); };
  const startNew  = () => { setEditingId('new'); setEditData({ ...EMPTY_TEACHER, schoolId: school.id, id: uid() }); };
  const cancelEdit = () => { setEditingId(null); setEditData(null); };
  const saveEdit = () => {
    if (!editData.name.trim()) return alert('יש למלא שם');
    onSaveTeacher(editData);
    cancelEdit();
  };
  const setF = (k, v) => setEditData(p => ({ ...p, [k]: v }));

  const inp = (k, props={}) => (
    <input className="apple-input" value={editData[k] ?? ''} onChange={e => setF(k, e.target.value)}
      style={{ fontSize:12, padding:'4px 8px', borderRadius:6, minWidth:0, ...props.style }} {...props} />
  );
  const num = (k, props={}) => (
    <input type="number" className="apple-input" dir="ltr" value={editData[k] ?? ''} onChange={e => setF(k, e.target.value === '' ? '' : Number(e.target.value))}
      style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:72, textAlign:'center', ...props.style }} {...props} />
  );

  return (
    <div style={{ minHeight:'100vh', background:'var(--apple-bg)' }} dir="rtl">

      {/* ══ Apple Header ══ */}
      <div style={{ background:'var(--apple-surface)', borderBottom:'1px solid var(--apple-border)', padding:'16px 24px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          {onBack && (
            <button className="apple-btn apple-btn-ghost" onClick={onBack} style={{ fontSize:13, padding:'7px 14px' }}>← חזרה</button>
          )}
          <div style={{ flex:1 }}>
            <h1 style={{ fontSize:22, fontWeight:800, color:'var(--apple-text)', letterSpacing:'-0.02em', marginBottom:2 }}>{school.name}</h1>
            {school.city && <p style={{ fontSize:13, color:'var(--apple-text2)' }}>{school.city}</p>}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {needsSimCount > 0 && <span className="apple-badge badge-orange">🧮 {needsSimCount} לסימולציה</span>}
            {needsApprCount > 0 && <span className="apple-badge badge-blue">✅ {needsApprCount} לאישור</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="apple-input" placeholder="חיפוש לפי שם / ת.ז."
            style={{ width:220, fontSize:13 }} />
          <button className="apple-btn apple-btn-ghost" onClick={() => setShowReport(true)} style={{ fontSize:13 }}>🖨️ דוח שכר</button>
          <button className="apple-btn apple-btn-ghost" onClick={() => setShowAbsence(true)} style={{ fontSize:13, color:'#c0392b', borderColor:'rgba(192,57,43,0.3)' }}>📋 ממ"מ והעדרויות</button>
          <button className="apple-btn apple-btn-ghost" onClick={() => downloadTemplate(school.name)} style={{ fontSize:13 }}>⬇️ תבנית</button>
          <button className="apple-btn apple-btn-ghost" onClick={() => setShowImport(true)} style={{ fontSize:13 }}>📥 ייבוא</button>
          <button className="apple-btn apple-btn-blue" onClick={startNew} style={{ fontSize:13 }}>+ הוסף מורה</button>
          <button className="apple-btn apple-btn-ghost" onClick={() => sendMonthlyEmail(school, teachers)}
            title={school.principalEmail ? `שלח ל: ${school.principalEmail}` : 'הגדר מייל מנהלת'}
            style={{ fontSize:13 }}>
            ✉️ {isCoord ? 'שלח לאישור' : 'שלח לשליח'}
          </button>
        </div>
      </div>

      {/* ══ Stat Cards ══ */}
      {tsOfficial.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, padding:'20px 24px 0' }}>
          {[
            { label:'מורות', val: ts.length, sub: `${tsOfficial.length} עם שכר רשמי` },
            { label:'ברוטו / חודש', val: totGross.toLocaleString()+' ₪', color:'var(--apple-green)' },
            { label:'ברוטו למעסיק', val: totEmp.toLocaleString()+' ₪', color:'var(--apple-blue)' },
            { label:'עלות שנתית', val: (totEmp*12).toLocaleString()+' ₪', color:'var(--apple-purple)' },
          ].map(c => (
            <div key={c.label} className="apple-stat">
              <p className="apple-stat-label">{c.label}</p>
              <p className="apple-stat-value" style={{ color: c.color || 'var(--apple-text)', fontSize:18 }}>{c.val}</p>
              {c.sub && <p style={{ fontSize:11, color:'var(--apple-text3)', marginTop:2 }}>{c.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ══ Table ══ */}
      <div style={{ padding:'20px 24px' }}>
        <div className="apple-card" style={{ overflowX:'auto' }}>
          <table className="apple-table" style={{ fontSize:13 }}>
            <thead>
              <tr>
                <th>שם עובדת</th>
                <th style={{ textAlign:'center' }}>ת.ז.</th>
                <th>מייל</th>
                <th style={{ textAlign:'center' }}>רפורמה</th>
                <th style={{ textAlign:'center' }}>% משרה</th>
                <th style={{ textAlign:'center' }}>תואר</th>
                <th style={{ textAlign:'center' }}>דרגת אופק</th>
                <th style={{ textAlign:'center' }}>ותק</th>
                <th style={{ textAlign:'center' }}>פרונטלי</th>
                <th style={{ textAlign:'center' }}>שיבוץ</th>
                <th style={{ textAlign:'center', color:'var(--apple-purple)' }}>ילדים</th>
                <th style={{ textAlign:'center', color:'#c0392b' }}>העדרות (ימים)</th>
                <th style={{ textAlign:'center', color:'#c0392b' }}>ממ"מ שעות</th>
                <th style={{ textAlign:'center', color:'#c0392b' }}>במקום מי</th>
                <th style={{ textAlign:'center', color:'#27ae60' }}>תוספות (₪)</th>
                <th style={{ textAlign:'center' }}>שכר רשמי (₪)</th>
                {!isPrincipal && <th style={{ textAlign:'center' }}>טרום-רפורמה (₪)</th>}
                {!isPrincipal && <th style={{ textAlign:'center', color:'var(--apple-purple)' }}>תוספת חב"ד</th>}
                {!isPrincipal && <th style={{ textAlign:'center' }}>סוציאלי</th>}
                {!isPrincipal && <th style={{ textAlign:'center', color:'var(--apple-blue)', fontWeight:800 }}>סה״כ למעסיק</th>}
                <th style={{ width:90 }}></th>
              </tr>
            </thead>
            <tbody>
              {/* New row */}
              {editingId === 'new' && editData && (
                <tr style={{ background:'rgba(0,122,255,0.05)', borderBottom:'2px solid var(--apple-blue)' }}>
                  <td><input className="apple-input" value={editData.name} onChange={e=>setF('name',e.target.value)} placeholder="שם מלא *" style={{ fontSize:12, padding:'4px 8px', borderRadius:6 }} /></td>
                  <td><input className="apple-input" dir="ltr" value={editData.tzId||''} onChange={e=>setF('tzId',e.target.value)} placeholder="ת.ז." style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:90, textAlign:'center' }} /></td>
                  <td><input className="apple-input" value={editData.email||''} onChange={e=>setF('email',e.target.value)} placeholder="מייל" dir="ltr" style={{ fontSize:12, padding:'4px 8px', borderRadius:6 }} /></td>
                  <td style={{ textAlign:'center' }}>
                    <select value={editData.reform} onChange={e=>setF('reform',e.target.value)} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                      <option value="ofek">אופק חדש</option>
                      <option value="pre">טרום</option>
                    </select>
                  </td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.scopePct??100} onChange={e=>setF('scopePct',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td>
                    <select value={editData.degree||'BA'} onChange={e=>setF('degree',e.target.value)} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                      <option value="intern">מתמחה</option>
                      <option value="unlicensed">לא מוסמך</option>
                      <option value="senior">בכיר</option>
                      <option value="BA">תואר ראשון</option>
                      <option value="MA">תואר שני</option>
                    </select>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    {editData.reform==='ofek'
                      ? <select value={editData.grade||1} onChange={e=>setF('grade',Number(e.target.value))} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                          {[1,2,3,4,5,6,7,8,9].map(g=><option key={g} value={g}>דרגה {g}</option>)}
                        </select>
                      : <span style={{ color:'var(--apple-text3)' }}>—</span>}
                  </td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.seniority??0} onChange={e=>setF('seniority',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.frontalHours??26} onChange={e=>setF('frontalHours',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td style={{ textAlign:'center' }}>
                    <label className="apple-toggle">
                      <input type="checkbox" checked={!!editData.isTemp} onChange={e=>setF('isTemp',e.target.checked)} />
                      <span className="apple-toggle-track"></span>
                    </label>
                  </td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.childrenUnder18??0} onChange={e=>setF('childrenUnder18',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.absenceDays??0} onChange={e=>setF('absenceDays',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.mmHours??0} onChange={e=>setF('mmHours',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                  <td><input className="apple-input" value={editData.mmFor||''} onChange={e=>setF('mmFor',e.target.value)} placeholder="שם המורה" style={{ fontSize:12, padding:'4px 8px', borderRadius:6, minWidth:80 }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData.monthlyExtras??0} onChange={e=>setF('monthlyExtras',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:70, textAlign:'center' }} /></td>
                  <td><input type="number" className="apple-input" dir="ltr" value={editData._officialGross||''} onChange={e=>setF('_officialGross',e.target.value?Number(e.target.value):null)} placeholder="—" style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:90, textAlign:'center' }} /></td>
                  {!isPrincipal && <td><input type="number" className="apple-input" dir="ltr" value={editData._officialGrossPre||''} onChange={e=>setF('_officialGrossPre',e.target.value?Number(e.target.value):null)} placeholder="—" style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:90, textAlign:'center' }} /></td>}
                  {!isPrincipal && <td style={{ textAlign:'center', color:'var(--apple-purple)', fontWeight:700 }}>
                    {editData._officialGross && editData._officialGrossPre ? (Number(editData._officialGross)-Number(editData._officialGrossPre)).toLocaleString()+' ₪' : '—'}
                  </td>}
                  {!isPrincipal && <td>—</td>}
                  {!isPrincipal && <td>—</td>}
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="apple-btn apple-btn-blue" onClick={saveEdit} style={{ padding:'4px 10px', fontSize:12 }}>שמור</button>
                      <button className="apple-btn apple-btn-ghost" onClick={cancelEdit} style={{ padding:'4px 10px', fontSize:12 }}>ביטול</button>
                    </div>
                  </td>
                </tr>
              )}

              {filtered.length === 0 && editingId !== 'new' ? (
                <tr><td colSpan={15} style={{ textAlign:'center', padding:'40px', color:'var(--apple-text3)' }}>
                  {ts.length === 0 ? 'אין מורות עדיין — לחצי על "+ הוסף מורה"' : 'לא נמצאו תוצאות'}
                </td></tr>
              ) : filtered.map(t => {
                const isEditing = editingId === t.id;
                const d = isEditing ? editData : t;
                const emp     = calcEmployer(t);
                const derived = deriveHours(t);
                const scope   = t.reform === 'ofek' ? (derived?.scopePct || t.scopePct || 100) : (t.scope || 100);
                const degreeLabel = DEGREE_LABELS[t.degree] || t.degree;
                const gradeLabel  = t.reform === 'ofek' ? (t.grade === 'intern' ? 'מתמחה' : `דרגה ${t.grade}`) : '—';
                const isSim  = needsSim(t);
                const isAppr = needsApproval(t);
                const chabadBonus = t.reform === 'ofek' && t._officialGross && t._officialGrossPre
                  ? Number(t._officialGross) - Number(t._officialGrossPre) : null;
                const momBonus = (t.childrenUnder18||0) > 0 && (scope||100) >= 79;

                if (isEditing) return (
                  <tr key={t.id} style={{ background:'rgba(0,122,255,0.04)', borderBottom:'2px solid var(--apple-blue)' }}>
                    <td><input className="apple-input" value={d.name} onChange={e=>setF('name',e.target.value)} style={{ fontSize:12, padding:'4px 8px', borderRadius:6 }} /></td>
                    <td><input className="apple-input" dir="ltr" value={d.tzId||''} onChange={e=>setF('tzId',e.target.value)} placeholder="ת.ז." style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:90, textAlign:'center' }} /></td>
                    <td><input className="apple-input" value={d.email||''} onChange={e=>setF('email',e.target.value)} dir="ltr" placeholder="מייל" style={{ fontSize:12, padding:'4px 8px', borderRadius:6 }} /></td>
                    <td style={{ textAlign:'center' }}>
                      <select value={d.reform} onChange={e=>setF('reform',e.target.value)} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                        <option value="ofek">אופק חדש</option>
                        <option value="pre">טרום רפורמה</option>
                      </select>
                    </td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.scopePct??100} onChange={e=>setF('scopePct',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td>
                      <select value={d.degree||'BA'} onChange={e=>setF('degree',e.target.value)} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                        <option value="intern">מתמחה</option>
                        <option value="unlicensed">לא מוסמך</option>
                        <option value="senior">בכיר</option>
                        <option value="BA">תואר ראשון</option>
                        <option value="MA">תואר שני</option>
                      </select>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {d.reform==='ofek'
                        ? <select value={d.grade||1} onChange={e=>setF('grade',Number(e.target.value))} className="apple-select" style={{ fontSize:12, padding:'4px 8px' }}>
                            {[1,2,3,4,5,6,7,8,9].map(g=><option key={g} value={g}>דרגה {g}</option>)}
                          </select>
                        : <span style={{ color:'var(--apple-text3)' }}>—</span>}
                    </td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.seniority??0} onChange={e=>setF('seniority',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.frontalHours??26} onChange={e=>setF('frontalHours',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td style={{ textAlign:'center' }}>
                      <label className="apple-toggle">
                        <input type="checkbox" checked={!!d.isTemp} onChange={e=>setF('isTemp',e.target.checked)} />
                        <span className="apple-toggle-track"></span>
                      </label>
                    </td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.childrenUnder18??0} onChange={e=>setF('childrenUnder18',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.absenceDays??0} onChange={e=>setF('absenceDays',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.mmHours??0} onChange={e=>setF('mmHours',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:60, textAlign:'center' }} /></td>
                    <td><input className="apple-input" value={d.mmFor||''} onChange={e=>setF('mmFor',e.target.value)} placeholder="שם המורה" style={{ fontSize:12, padding:'4px 8px', borderRadius:6, minWidth:80 }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d.monthlyExtras??0} onChange={e=>setF('monthlyExtras',Number(e.target.value))} style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:70, textAlign:'center' }} /></td>
                    <td><input type="number" className="apple-input" dir="ltr" value={d._officialGross||''} onChange={e=>setF('_officialGross',e.target.value?Number(e.target.value):null)} placeholder="—" style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:90, textAlign:'center' }} /></td>
                    {!isPrincipal && <td><input type="number" className="apple-input" dir="ltr" value={d._officialGrossPre||''} onChange={e=>setF('_officialGrossPre',e.target.value?Number(e.target.value):null)} placeholder="—" style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:90, textAlign:'center' }} /></td>}
                    {!isPrincipal && <td style={{ textAlign:'center', color:'var(--apple-purple)', fontWeight:700 }}>
                      {d._officialGross && d._officialGrossPre ? (Number(d._officialGross)-Number(d._officialGrossPre)).toLocaleString()+' ₪' : '—'}
                    </td>}
                    {!isPrincipal && <td style={{ color:'var(--apple-text3)', textAlign:'center' }}>—</td>}
                    {!isPrincipal && <td style={{ color:'var(--apple-text3)', textAlign:'center' }}>—</td>}
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="apple-btn apple-btn-blue" onClick={saveEdit} style={{ padding:'4px 10px', fontSize:12 }}>שמור</button>
                        <button className="apple-btn apple-btn-ghost" onClick={cancelEdit} style={{ padding:'4px 10px', fontSize:12 }}>ביטול</button>
                      </div>
                    </td>
                  </tr>
                );

                return (
                  <tr key={t.id} style={{ background: isSim ? 'rgba(255,159,10,0.04)' : isAppr ? 'rgba(0,122,255,0.04)' : '' }}>
                    <td>
                      <div style={{ fontWeight:600 }}>
                        {isSim  && <span style={{ color:'var(--apple-orange)', fontSize:11, marginLeft:4 }}>🧮</span>}
                        {isAppr && <span style={{ color:'var(--apple-blue)', fontSize:11, marginLeft:4 }}>✅</span>}
                        {t.name}
                      </div>
                    </td>
                    <td style={{ textAlign:'center', fontFamily:'monospace', fontSize:12, color:'var(--apple-text2)' }}>{t.tzId||'—'}</td>
                    <td style={{ fontSize:12, color:'var(--apple-text3)' }}>{t.email||'—'}</td>
                    <td style={{ textAlign:'center' }}>
                      <span className={`apple-badge ${t.reform==='ofek' ? 'badge-blue' : 'badge-gray'}`}>
                        {t.reform==='ofek' ? 'אופק חדש' : 'טרום רפורמה'}
                      </span>
                    </td>
                    <td style={{ textAlign:'center', fontWeight:600, color:'var(--apple-blue)' }}>{scope}%</td>
                    <td style={{ textAlign:'center' }}>{degreeLabel}</td>
                    <td style={{ textAlign:'center', fontWeight:700, color: t.reform==='ofek' ? 'var(--apple-text)' : 'var(--apple-text3)' }}>{gradeLabel}</td>
                    <td style={{ textAlign:'center', color:'var(--apple-text2)' }}>{t.seniority}</td>
                    <td style={{ textAlign:'center' }}>{derived ? derived.frontal : '—'}</td>
                    <td style={{ textAlign:'center' }}>
                      {t.isTemp
                        ? <span className="apple-badge badge-orange">שיבוץ זמני</span>
                        : <span style={{ color:'var(--apple-text3)' }}>—</span>}
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {momBonus
                        ? <span className="apple-badge badge-purple">✓ {t.childrenUnder18}</span>
                        : (t.childrenUnder18||0) > 0
                          ? <span style={{ fontSize:11, color:'var(--apple-text3)' }}>לא זכאית</span>
                          : <span style={{ color:'var(--apple-text3)' }}>—</span>}
                    </td>
                    <td style={{ textAlign:'center', color: (t.absenceDays||0)>0 ? '#c0392b' : 'var(--apple-text3)', fontWeight: (t.absenceDays||0)>0 ? 700 : 400 }}>
                      {(t.absenceDays||0) > 0 ? t.absenceDays : '—'}
                    </td>
                    <td style={{ textAlign:'center', color: (t.mmHours||0)>0 ? '#8e44ad' : 'var(--apple-text3)', fontWeight: (t.mmHours||0)>0 ? 700 : 400 }}>
                      {(t.mmHours||0) > 0 ? t.mmHours : '—'}
                    </td>
                    <td style={{ fontSize:12, color:'var(--apple-text2)' }}>{t.mmFor||'—'}</td>
                    <td style={{ textAlign:'center', color: (t.monthlyExtras||0)>0 ? '#27ae60' : 'var(--apple-text3)', fontWeight: (t.monthlyExtras||0)>0 ? 700 : 400 }}>
                      {(t.monthlyExtras||0) > 0 ? Number(t.monthlyExtras).toLocaleString()+' ₪' : '—'}
                    </td>
                    <td style={{ textAlign:'center', fontWeight: t._officialGross ? 600 : 400, color: t._officialGross ? 'var(--apple-green)' : 'var(--apple-text3)' }}>
                      {t._officialGross ? Number(t._officialGross).toLocaleString() : '—'}
                    </td>
                    {!isPrincipal && <td style={{ textAlign:'center', color:'var(--apple-text2)' }}>
                      {t._officialGrossPre ? Number(t._officialGrossPre).toLocaleString() : '—'}
                    </td>}
                    {!isPrincipal && <td style={{ textAlign:'center' }}>
                      {chabadBonus != null
                        ? <span className="apple-badge badge-purple">{chabadBonus.toLocaleString()} ₪</span>
                        : <span style={{ color:'var(--apple-text3)' }}>—</span>}
                    </td>}
                    {!isPrincipal && <td style={{ textAlign:'center', color:'var(--apple-text2)' }}>
                      {t._officialGross ? emp.extras.total.toLocaleString() : '—'}
                    </td>}
                    {!isPrincipal && <td style={{ textAlign:'center', fontWeight:700, color: t._officialGross ? 'var(--apple-blue)' : 'var(--apple-text3)' }}>
                      {t._officialGross ? emp.total.toLocaleString()+' ₪'
                        : <span style={{ fontSize:12, color:'var(--apple-orange)' }}>נדרשת סימולציה</span>}
                    </td>}
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="apple-btn apple-btn-ghost" onClick={() => startEdit(t)} style={{ padding:'4px 8px', fontSize:12 }}>✏️</button>
                        {isCoord && isAppr && onApproveTeacher && (
                          <button className="apple-btn apple-btn-green" onClick={() => onApproveTeacher(t.id)} style={{ padding:'4px 8px', fontSize:12 }}>✓</button>
                        )}
                        {isCoord && onDeleteTeacher && (
                          <button className="apple-btn apple-btn-ghost" onClick={() => { if (window.confirm('למחוק?')) onDeleteTeacher(t.id); }}
                            style={{ padding:'4px 8px', fontSize:12, color:'var(--apple-red)' }}>🗑</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {tsOfficial.length > 0 && !isPrincipal && (
              <tfoot>
                <tr>
                  <td colSpan={9} style={{ fontWeight:700 }}>סה״כ ({tsOfficial.length} מורות עם שכר רשמי)</td>
                  <td style={{ textAlign:'center', fontWeight:700, color:'var(--apple-green)' }}>{totGross.toLocaleString()} ₪</td>
                  <td></td>
                  <td></td>
                  <td style={{ textAlign:'center', fontWeight:700 }}>{totExtras.toLocaleString()} ₪</td>
                  <td style={{ textAlign:'center', fontWeight:800, color:'var(--apple-blue)' }}>{totEmp.toLocaleString()} ₪</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {showReport  && <SchoolReport   school={school} teachers={teachers} onClose={() => setShowReport(false)} />}
      {showAbsence && <AbsenceReport school={school} teachers={teachers} monthLabel={fmtMonthFn ? fmtMonthFn(activeMonth) : activeMonth} onClose={() => setShowAbsence(false)} />}
      {showImport && (
        <ImportModal
          schoolId={school.id}
          schoolName={school.name}
          onImport={ts => { onImportTeachers(ts); setShowImport(false); }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NETWORK REPORT
═══════════════════════════════════════════════════════════════ */
function ReportView({ schools, teachers }) {
  const rows = schools.map(s => {
    const ts       = teachers.filter(t => t.schoolId === s.id);
    const tsOff    = ts.filter(t => t._officialGross);
    const gross    = tsOff.reduce((sum, t) => sum + Number(t._officialGross), 0);
    const empTot   = tsOff.reduce((sum, t) => sum + calcEmployer(t).total, 0);
    const pending  = ts.filter(isPending).length;
    return { ...s, count: ts.length, officialCount: tsOff.length, gross, empTot, annual: empTot * 12, pending };
  }).sort((a,b) => b.empTot - a.empTot);

  const totGross  = rows.reduce((s,r) => s + r.gross, 0);
  const totEmp    = rows.reduce((s,r) => s + r.empTot, 0);
  const totAnnual = rows.reduce((s,r) => s + r.annual, 0);
  const totCount  = rows.reduce((s,r) => s + r.count, 0);
  const totPending = rows.reduce((s,r) => s + r.pending, 0);

  return (
    <div style={{ background:'var(--apple-bg)', minHeight:'100vh' }} dir="rtl">

      {/* Header */}
      <div style={{ background:'var(--apple-surface)', borderBottom:'1px solid var(--apple-border)', padding:'20px 24px', display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ flex:1 }}>
          <h1 style={{ fontSize:22, fontWeight:800, color:'var(--apple-text)', letterSpacing:'-0.02em' }}>דוח רשת — סימולציית שכר תשפ״ו</h1>
          <p style={{ fontSize:13, color:'var(--apple-text2)', marginTop:2 }}>{rows.filter(r=>r.count>0).length} בתי ספר · {totCount} מורות</p>
        </div>
        {totPending > 0 && <span className="apple-badge badge-orange">🔔 {totPending} ממתינים לאישור</span>}
        <button className="apple-btn apple-btn-ghost" onClick={() => window.print()} style={{ fontSize:13 }}>🖨️ הדפסה</button>
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, padding:'20px 24px 0' }}>
        {[
          { label:'סה״כ מורות', val: totCount, color:'var(--apple-text)' },
          { label:'בתי ספר פעילים', val: rows.filter(r=>r.count>0).length, color:'var(--apple-text)' },
          { label:'ברוטו למעסיק / חודש', val: totEmp.toLocaleString()+' ₪', color:'var(--apple-blue)' },
          { label:'עלות שנתית', val: totAnnual.toLocaleString()+' ₪', color:'var(--apple-purple)' },
        ].map(c => (
          <div key={c.label} className="apple-stat">
            <p className="apple-stat-label">{c.label}</p>
            <p className="apple-stat-value" style={{ color: c.color, fontSize:20 }}>{c.val}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ padding:'20px 24px' }}>
        <div className="apple-card" style={{ overflowX:'auto' }}>
          <table className="apple-table">
            <thead>
              <tr>
                <th>בית ספר</th>
                <th>עיר</th>
                <th style={{ textAlign:'center' }}>מורות</th>
                <th style={{ textAlign:'center' }}>ברוטו / חודש</th>
                <th style={{ textAlign:'center' }}>ברוטו למעסיק</th>
                <th style={{ textAlign:'center', color:'var(--apple-purple)' }}>עלות שנתית</th>
                <th style={{ textAlign:'center' }}>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight:700 }}>{r.name}</td>
                  <td style={{ color:'var(--apple-text2)', fontSize:13 }}>{r.city||'—'}</td>
                  <td style={{ textAlign:'center', fontWeight:600 }}>{r.count}</td>
                  <td style={{ textAlign:'center', color:'var(--apple-green)', fontWeight:600 }}>{r.gross>0 ? r.gross.toLocaleString()+' ₪' : '—'}</td>
                  <td style={{ textAlign:'center', fontWeight:700, color:'var(--apple-blue)' }}>{r.empTot>0 ? r.empTot.toLocaleString()+' ₪' : '—'}</td>
                  <td style={{ textAlign:'center', fontWeight:700, color:'var(--apple-purple)' }}>{r.annual>0 ? r.annual.toLocaleString()+' ₪' : '—'}</td>
                  <td style={{ textAlign:'center' }}>
                    {r.pending > 0
                      ? <span className="apple-badge badge-orange">🔔 {r.pending}</span>
                      : <span className="apple-badge badge-green">✓ מעודכן</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ fontWeight:800 }}>סה״כ רשת</td>
                <td style={{ textAlign:'center', fontWeight:700 }}>{totCount}</td>
                <td style={{ textAlign:'center', fontWeight:700, color:'var(--apple-green)' }}>{totGross.toLocaleString()} ₪</td>
                <td style={{ textAlign:'center', fontWeight:800, color:'var(--apple-blue)' }}>{totEmp.toLocaleString()} ₪</td>
                <td style={{ textAlign:'center', fontWeight:800, color:'var(--apple-purple)' }}>{totAnnual.toLocaleString()} ₪</td>
                <td style={{ textAlign:'center' }}>{totPending > 0 ? `🔔 ${totPending}` : '✓'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p style={{ fontSize:11, color:'var(--apple-text3)', marginTop:10, padding:'0 4px' }}>
          ברוטו למעסיק = (ברוטו + ביגוד + הבראה) × 1.30 · כולל ביטוח לאומי, פנסיה ופיצויים, קרן השתלמות
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SIMULATOR VIEW — חשבת שכר עורכת סימולציה
═══════════════════════════════════════════════════════════════ */
function SimulatorView({ teachers, schools, onSaveGross }) {
  const [calc, setCalc] = useState('ofek');
  const [filterSchool, setFilterSchool] = useState('all');
  const [inputs, setInputs] = useState({});    // teacherId → string
  const [saved, setSaved]   = useState({});    // teacherId → true (just saved flash)
  const [activeId, setActiveId] = useState(null);

  const urls = {
    ofek:  'https://educalc.unq.co.il/#/Calculators/2',
    oz:    'https://educalc.unq.co.il/#/Calculators/3',
    mgmt:  'https://educalc.unq.co.il/#/Calculators/4',
    old:   'https://educalc.unq.co.il/#/Calculators/1',
  };
  const calcOptions = [
    { id: 'ofek', label: 'אופק חדש' },
    { id: 'oz',   label: 'עוז לתמורה' },
    { id: 'mgmt', label: 'אופק — ניהול' },
    { id: 'old',  label: 'טרום רפורמה' },
  ];

  // כל המורים שממתינים לסימולציה (שינוי נתונים, אין עדיין שכר רשמי)
  const allMissing = teachers.filter(needsSim);
  const total = teachers.filter(isPending).length || teachers.length;
  const done  = teachers.filter(needsApproval).length;

  // Schools that have at least one missing teacher
  const missingSchoolIds = [...new Set(allMissing.map(t => t.schoolId))];

  const filtered = filterSchool === 'all'
    ? allMissing
    : allMissing.filter(t => t.schoolId === filterSchool);

  // Group by school
  const grouped = schools
    .filter(s => filterSchool === 'all' ? missingSchoolIds.includes(s.id) : s.id === filterSchool)
    .map(s => ({ school: s, teachers: filtered.filter(t => t.schoolId === s.id) }))
    .filter(g => g.teachers.length > 0);

  const handleSave = (t) => {
    const val = inputs[t.id];
    if (!val || isNaN(Number(val))) return;
    onSaveGross(t.id, Number(val));
    setSaved(prev => ({ ...prev, [t.id]: true }));
    setTimeout(() => setSaved(prev => { const n={...prev}; delete n[t.id]; return n; }), 1500);
    // advance to next in list
    const flat = grouped.flatMap(g => g.teachers);
    const idx  = flat.findIndex(x => x.id === t.id);
    if (idx !== -1 && idx + 1 < flat.length) setActiveId(flat[idx + 1].id);
  };

  const pct = total > 0 ? Math.round(done / total * 100) : 100;

  return (
    <div style={{ display:'flex', height:'calc(100vh - 52px)' }}>

      {/* LEFT — simulator iframe */}
      <div style={{ width:'58%', display:'flex', flexDirection:'column', borderLeft:'1px solid var(--apple-fill2)' }}>
        <div style={{ background:'var(--apple-surface)', borderBottom:'1px solid var(--apple-fill2)', padding:'10px 16px', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, fontWeight:600, color:'var(--apple-text2)', marginLeft:4 }}>מחשבון רשמי:</span>
          <div className="apple-seg">
            {calcOptions.map(o => (
              <button key={o.id} onClick={() => setCalc(o.id)}
                className={`apple-seg-item${calc === o.id ? ' active' : ''}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <iframe
          key={calc}
          src={urls[calc]}
          style={{ flex:1, width:'100%', border:'none' }}
          title="מחשבון שכר רשמי"
          allow="fullscreen"
        />
      </div>

      {/* RIGHT — teacher list */}
      <div style={{ width:'42%', display:'flex', flexDirection:'column', background:'var(--apple-bg)' }}>

        {/* Header */}
        <div style={{ background:'var(--apple-surface)', borderBottom:'1px solid var(--apple-fill2)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <h2 style={{ fontWeight:700, fontSize:15, color:'var(--apple-text)', letterSpacing:'-0.01em' }}>הזנת שכר רשמי</h2>
            <span style={{ fontSize:12, color:'var(--apple-text2)' }}>{done} / {total} הושלמו</span>
          </div>
          {/* Progress bar */}
          <div style={{ background:'var(--apple-fill2)', borderRadius:4, height:6 }}>
            <div style={{ width: pct+'%', background:'var(--apple-green)', borderRadius:4, height:6, transition:'width 0.4s' }} />
          </div>
          <select className="apple-select" style={{ fontSize:13 }}
            value={filterSchool} onChange={e => setFilterSchool(e.target.value)}>
            <option value="all">כל בתי הספר ({allMissing.length} ממתינים)</option>
            {schools.filter(s => missingSchoolIds.includes(s.id)).map(s => (
              <option key={s.id} value={s.id}>{s.name} ({allMissing.filter(t => t.schoolId === s.id).length})</option>
            ))}
          </select>
        </div>

        {/* Teacher rows */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 12px', display:'flex', flexDirection:'column', gap:16 }}>
          {grouped.length === 0 && (
            <div style={{ textAlign:'center', padding:'48px 0', fontSize:15, fontWeight:600, color:'var(--apple-green)' }}>
              ✅ כל המורים הוזנו!
            </div>
          )}
          {grouped.map(({ school, teachers: gTeachers }) => (
            <div key={school.id}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--apple-purple)', marginBottom:8, padding:'5px 10px', background:'rgba(88,86,214,0.08)', borderRadius:8, display:'inline-flex', alignItems:'center', gap:6 }}>
                🏫 {school.name}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {gTeachers.map(t => {
                  const est = calcGross(t);
                  const isActive = activeId === t.id;
                  const wasSaved = saved[t.id];
                  return (
                    <div key={t.id} onClick={() => setActiveId(t.id)}
                      className="apple-card"
                      style={{ padding:'12px 14px', cursor:'pointer', borderRight: isActive ? '3px solid var(--apple-blue)' : '3px solid transparent', boxShadow: isActive ? '0 4px 20px rgba(0,122,255,0.12)' : '' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom: isActive ? 10 : 0 }}>
                        <div>
                          <p style={{ fontWeight:600, fontSize:14, color:'var(--apple-text)', marginBottom:2 }}>{t.name}</p>
                          <p style={{ fontSize:12, color:'var(--apple-text2)' }}>
                            {t.reform === 'ofek' ? 'אופק' : 'טרום'} · {t.reform === 'ofek' ? `דרגה ${t.grade}` : t.degree} · {t.seniority} שנות ותק
                          </p>
                        </div>
                        <div style={{ textAlign:'left', flexShrink:0 }}>
                          <p style={{ fontSize:11, color:'var(--apple-text3)', marginBottom:1 }}>הערכה</p>
                          <p style={{ fontSize:13, fontWeight:600, fontFamily:'monospace', color:'var(--apple-text2)' }}>{est.toLocaleString()} ₪</p>
                        </div>
                      </div>
                      {isActive && (
                        <div style={{ display:'flex', gap:8 }}>
                          <input type="number" className="apple-input" dir="ltr"
                            placeholder="שכר משולב מהסימולטור"
                            value={inputs[t.id] || ''}
                            onChange={e => setInputs(prev => ({ ...prev, [t.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && handleSave(t)}
                            autoFocus
                            style={{ fontSize:14 }}
                          />
                          <button className="apple-btn" onClick={() => handleSave(t)} disabled={!inputs[t.id]}
                            style={{
                              fontSize:13, padding:'8px 14px', flexShrink:0,
                              background: wasSaved ? 'var(--apple-green)' : inputs[t.id] ? 'var(--apple-blue)' : 'var(--apple-fill2)',
                              color: (wasSaved || inputs[t.id]) ? '#fff' : 'var(--apple-text3)',
                            }}>
                            {wasSaved ? '✓' : 'שמור'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop:'1px solid var(--apple-fill2)', background:'var(--apple-surface)', padding:'10px 16px' }}>
          <p style={{ fontSize:12, color:'var(--apple-text3)', textAlign:'center' }}>
            הזן "שכר משולב" מהסימולטור הרשמי · Enter לשמור ומעבר למורה הבא
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   APP
═══════════════════════════════════════════════════════════════ */
export default function App() {
  const [schools,  setSchools]  = useState(() => load(LS_SCHOOLS));
  // months: { '2025-09': [teacher,...], ... }  — migrate from legacy if needed
  const [months, setMonths] = useState(() => {
    const saved = loadObj(LS_MONTHS);
    if (saved && Object.keys(saved).length > 0) return saved;
    // migrate legacy flat teachers
    const legacy = load(LS_TEACHERS);
    if (legacy.length > 0) {
      const mk = nowMonthKey();
      return { [mk]: legacy };
    }
    return {};
  });
  const [activeMonth, setActiveMonth] = useState(() => {
    const saved = loadObj(LS_MONTHS);
    const keys = Object.keys(saved || {}).sort();
    return keys.length > 0 ? keys[keys.length - 1] : nowMonthKey();
  });

  const [user,          setUser]          = useState(null);
  const [view,          setView]          = useState('schools');
  const [activeSchool,  setActiveSchool]  = useState(null);
  const [schoolModal,   setSchoolModal]   = useState(null);
  const [teacherModal,  setTeacherModal]  = useState(null);
  const [showApproval,  setShowApproval]  = useState(false);

  const teachers = months[activeMonth] || [];

  const persistS  = s  => { setSchools(s);  save(LS_SCHOOLS, s); };
  const persistMT = (mk, ts) => {
    const newMonths = { ...months, [mk]: ts };
    setMonths(newMonths);
    save(LS_MONTHS, newMonths);
  };
  const persistT  = ts => persistMT(activeMonth, ts);

  if (!user) return <LoginScreen schools={schools} onLogin={u => {
    setUser(u);
    setView(u.role === 'clerk' ? 'calc' : 'schools');
  }} />;

  const isCoord = user.role === 'coordinator';
  const isClerk = user.role === 'clerk';
  const needsSimCount      = teachers.filter(needsSim).length;
  const needsApprovalCount = teachers.filter(needsApproval).length;
  const pendingCount = teachers.filter(isPending).length;
  const sortedMonthKeys = Object.keys(months).sort();

  // Open a new month — copy teachers from current, reset monthly fields
  const openNewMonth = () => {
    const nextKey = nextMonthKey(activeMonth);
    if (months[nextKey]) { setActiveMonth(nextKey); return; }
    const MONTHLY_RESET = { absenceDays:0, sickFiles:[], mmHours:0, mmFor:'', monthlyExtras:0,
                             _approved:false, _approvedAt:null, _changedAt:null, _snapshot:null };
    const nextTeachers = teachers.map(t => ({ ...t, ...MONTHLY_RESET }));
    persistMT(nextKey, nextTeachers);
    setActiveMonth(nextKey);
  };

  const onSaveSchool = s => {
    persistS(s.id ? schools.map(x => x.id===s.id ? s : x) : [...schools, {...s, id: uid()}]);
    setSchoolModal(null);
  };
  const onDeleteSchool = id => {
    persistS(schools.filter(s => s.id !== id));
    persistT(teachers.filter(t => t.schoolId !== id));
  };

  const onSaveTeacher = t => {
    const now = new Date().toISOString();
    const old = teachers.find(x => x.id === t.id);
    let updated = { ...t };

    if (old) {
      // If base salary fields changed → clear simulation for this month
      const baseChanged = BASE_FIELDS.some(k => String(t[k] ?? '') !== String(old[k] ?? ''));
      if (baseChanged) {
        updated._officialGross    = null;
        updated._officialGrossPre = null;
        updated._changedAt        = now;
        updated._approved         = false;
        if (!old._snapshot) updated._snapshot = snapT(old);
      }
    } else {
      updated._changedAt = now;
      updated._approved  = false;
    }

    persistT(t.id
      ? teachers.map(x => x.id === t.id ? updated : x)
      : [...teachers, { ...updated, id: uid() }]
    );
    setTeacherModal(null);
  };

  const onDeleteTeacher  = id => persistT(teachers.filter(t => t.id !== id));
  const onImportTeachers = ts => {
    const now = new Date().toISOString();
    const withIds = ts.map(t => ({ ...t, id: uid(), _changedAt: now, _approved: false }));
    persistT([...teachers, ...withIds]);
  };

  const onApproveTeacher = id => {
    const now = new Date().toISOString();
    persistT(teachers.map(t => t.id === id
      ? { ...t, _snapshot: null, _changedAt: null, _approved: true, _approvedAt: now }
      : t
    ));
  };
  const onApproveAll = () => {
    const now = new Date().toISOString();
    persistT(teachers.map(t => ({ ...t, _snapshot: null, _changedAt: null, _approved: true, _approvedAt: now })));
    setShowApproval(false);
  };

  // Principal goes directly to their school
  const principalSchool = user.role === 'principal' ? schools.find(s => s.id === user.schoolId) : null;

  return (
    <div style={{ minHeight:'100vh', background:'var(--apple-bg)', display:'flex', flexDirection:'column' }} dir="rtl">

      <header style={{ position:'sticky', top:0, zIndex:40, background:'linear-gradient(90deg, #0d1b3e, #0a0a1a)', borderBottom:'1px solid rgba(255,255,255,0.08)', boxShadow:'0 2px 20px rgba(0,0,0,0.3)' }}>
        <div style={{ maxWidth:1152, margin:'0 auto', padding:'0 20px', height:54, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, cursor: isCoord ? 'pointer' : 'default' }} onClick={() => isCoord && setView('schools')}>
            <img src="/logo-chabad.png" alt="לוגו רשת" style={{ height:40, width:'auto', objectFit:'contain' }} />
            <div>
              <p style={{ fontWeight:700, fontSize:14, color:'#ffffff', letterSpacing:'-0.01em', lineHeight:1.2 }}>מערכת שכר מורים</p>
              <p style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>
                {isCoord ? 'שליח / מנהל רשת' : isClerk ? 'חשבת שכר' : `מנהלת: ${principalSchool?.name || ''}`}
              </p>
            </div>
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {isCoord && view !== 'schools' && (
              <button onClick={() => setView('schools')} style={{ fontSize:13, padding:'6px 12px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, color:'rgba(255,255,255,0.8)', cursor:'pointer', fontWeight:600 }}>← ראשי</button>
            )}
            {isCoord && (
              <button onClick={() => setView('report')} style={{
                fontSize:13, padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:600,
                background: view==='report' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)',
                color: view==='report' ? '#fff' : 'rgba(255,255,255,0.6)',
              }}>דוח רשת</button>
            )}
            {(isCoord || isClerk) && (
              <button onClick={() => setView('calc')} style={{
                fontSize:13, padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:600, position:'relative',
                background: view==='calc' ? '#34c759' : 'rgba(52,199,89,0.15)',
                color: view==='calc' ? '#fff' : '#34c759',
              }}>
                סימולציה
                {needsSimCount > 0 && (
                  <span style={{ position:'absolute', top:-5, left:-5, background:'#ff9f0a', color:'#fff', fontSize:10, fontWeight:700, borderRadius:'50%', width:17, height:17, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {needsSimCount}
                  </span>
                )}
              </button>
            )}
            {isCoord && (
              <button onClick={() => setShowApproval(true)} style={{
                fontSize:13, padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:600,
                background: needsApprovalCount > 0 ? '#007aff' : 'rgba(0,122,255,0.15)',
                color: needsApprovalCount > 0 ? '#fff' : '#007aff',
                boxShadow: needsApprovalCount > 0 ? '0 2px 12px rgba(0,122,255,0.4)' : 'none',
              }}>
                {needsApprovalCount > 0 ? `${needsApprovalCount} לאישור` : 'אישורים'}
              </button>
            )}
            {/* Month selector */}
            <div style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(255,255,255,0.07)', borderRadius:8, padding:'3px 6px' }}>
              <button onClick={() => { const i=sortedMonthKeys.indexOf(activeMonth); if(i>0) setActiveMonth(sortedMonthKeys[i-1]); }}
                style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:14, padding:'0 4px' }}>‹</button>
              <span style={{ fontSize:12, fontWeight:700, color:'#fff', minWidth:100, textAlign:'center' }}>{fmtMonth(activeMonth)}</span>
              <button onClick={() => { const i=sortedMonthKeys.indexOf(activeMonth); if(i<sortedMonthKeys.length-1) setActiveMonth(sortedMonthKeys[i+1]); }}
                style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:14, padding:'0 4px' }}>›</button>
              {isCoord && sortedMonthKeys.indexOf(activeMonth) === sortedMonthKeys.length-1 && (
                <button onClick={openNewMonth}
                  style={{ fontSize:11, padding:'3px 8px', background:'#34c759', border:'none', borderRadius:6, color:'#fff', cursor:'pointer', fontWeight:700, marginRight:2 }}>
                  + חודש
                </button>
              )}
            </div>
            <button onClick={() => setUser(null)} style={{ fontSize:13, padding:'6px 12px', background:'rgba(255,59,48,0.15)', border:'1px solid rgba(255,59,48,0.25)', borderRadius:8, color:'#ff6b6b', cursor:'pointer', fontWeight:600 }}>יציאה</button>
          </div>
        </div>
      </header>

      <div className="flex-1">
        {/* Clerk: only SimulatorView */}
        {isClerk ? (
          <SimulatorView
            teachers={teachers}
            schools={schools}
            onSaveGross={(id, gross) => persistT(teachers.map(t => t.id === id ? { ...t, _officialGross: gross } : t))}
          />
        ) : /* Principal: see only their school */
        !isCoord && principalSchool ? (
          <SchoolView
            school={principalSchool}
            schools={schools}
            teachers={teachers}
            userRole={user.role}
            onBack={null}
            onAddTeacher={null}
            onSaveTeacher={onSaveTeacher}
            onDeleteTeacher={null}
            onApproveTeacher={null}
            onImportTeachers={onImportTeachers}
            activeMonth={activeMonth}
            fmtMonthFn={fmtMonth}
          />
        ) : view === 'calc' ? (
          <SimulatorView
            teachers={teachers}
            schools={schools}
            onSaveGross={(id, gross) => persistT(teachers.map(t => t.id === id ? { ...t, _officialGross: gross } : t))}
          />
        ) : view === 'report' ? (
          <ReportView schools={schools} teachers={teachers} />
        ) : view === 'school' && activeSchool ? (
          <SchoolView
            school={activeSchool}
            schools={schools}
            teachers={teachers}
            userRole={user.role}
            onBack={() => setView('schools')}
            onAddTeacher={null}
            onSaveTeacher={onSaveTeacher}
            onDeleteTeacher={onDeleteTeacher}
            onApproveTeacher={onApproveTeacher}
            onImportTeachers={onImportTeachers}
          />
        ) : (
          /* Coordinator: schools list */
          <div style={{ maxWidth:1152, margin:'0 auto', padding:'24px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <div>
                <h2 style={{ fontSize:22, fontWeight:700, letterSpacing:'-0.02em', color:'var(--apple-text)', marginBottom:2 }}>בתי הספר</h2>
                <p style={{ fontSize:13, color:'var(--apple-text2)' }}>{schools.length} בתי ספר ברשת</p>
              </div>
              <button className="apple-btn apple-btn-blue" onClick={() => setSchoolModal({ id:'', name:'', city:'' })}>+ הוסף בית ספר</button>
            </div>
            {schools.length === 0 ? (
              <div className="apple-card" style={{ textAlign:'center', padding:'80px 20px' }}>
                <div style={{ fontSize:48, marginBottom:16 }}>🏫</div>
                <p style={{ fontWeight:600, fontSize:16, color:'var(--apple-text)', marginBottom:6 }}>אין בתי ספר עדיין</p>
                <p style={{ fontSize:14, color:'var(--apple-text2)' }}>לחצי על "הוסף בית ספר" להתחלה</p>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:16 }}>
                {schools.map(s => {
                  const ts      = teachers.filter(t => t.schoolId === s.id);
                  const empTot  = ts.reduce((sum, t) => sum + calcEmployer(t).total, 0);
                  const simN    = ts.filter(needsSim).length;
                  const apprN   = ts.filter(needsApproval).length;
                  return (
                    <div key={s.id} className="apple-card"
                      style={{ padding:20, cursor:'pointer', transition:'transform 0.15s, box-shadow 0.15s', borderRight: simN>0 ? '3px solid var(--apple-orange)' : apprN>0 ? '3px solid var(--apple-blue)' : '3px solid transparent' }}
                      onClick={() => { setActiveSchool(s); setView('school'); }}
                      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 32px rgba(0,0,0,0.12)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='var(--apple-shadow)'; }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                        <div>
                          <h3 style={{ fontWeight:700, fontSize:16, color:'var(--apple-text)', marginBottom:2, letterSpacing:'-0.01em' }}>{s.name}</h3>
                          {s.city && <p style={{ fontSize:13, color:'var(--apple-text2)' }}>{s.city}</p>}
                          <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                            {simN > 0 && <span className="apple-badge badge-orange">{simN} לסימולציה</span>}
                            {apprN > 0 && <span className="apple-badge badge-blue">{apprN} לאישור</span>}
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:4 }} onClick={e => e.stopPropagation()}>
                          <button className="apple-btn apple-btn-ghost" onClick={() => setSchoolModal({ ...s })} style={{ padding:'5px 8px', fontSize:13 }}>✏️</button>
                          <button className="apple-btn apple-btn-ghost" onClick={() => { if(window.confirm(`למחוק את ${s.name}?`)) onDeleteSchool(s.id); }} style={{ padding:'5px 8px', fontSize:13, color:'var(--apple-red)' }}>🗑</button>
                        </div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                        <div style={{ background:'var(--apple-fill)', borderRadius:12, padding:'10px 12px', textAlign:'center' }}>
                          <p style={{ fontSize:11, color:'var(--apple-text2)', marginBottom:2 }}>מורים</p>
                          <p style={{ fontWeight:800, fontSize:22, color:'var(--apple-blue)', letterSpacing:'-0.02em' }}>{ts.length}</p>
                        </div>
                        <div style={{ background:'var(--apple-fill)', borderRadius:12, padding:'10px 12px', textAlign:'center' }}>
                          <p style={{ fontSize:11, color:'var(--apple-text2)', marginBottom:2 }}>למעסיק/חודש</p>
                          <p style={{ fontWeight:700, fontSize:14, color:'var(--apple-text)', letterSpacing:'-0.01em' }}>{empTot > 0 ? empTot.toLocaleString()+' ₪' : '—'}</p>
                        </div>
                      </div>
                      <button className="apple-btn apple-btn-ghost" onClick={e => { e.stopPropagation(); openAddTeacher(s.id); }}
                        style={{ width:'100%', fontSize:13, borderRadius:10, border:'1.5px dashed var(--apple-fill2)' }}>
                        + הוסף מורה
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showApproval && (
        <ApprovalView
          teachers={teachers}
          schools={schools}
          onApprove={onApproveTeacher}
          onApproveAll={onApproveAll}
          onClose={() => setShowApproval(false)}
        />
      )}
      {schoolModal  && <SchoolModal  school={schoolModal}  onSave={onSaveSchool}  onClose={() => setSchoolModal(null)} />}
      {teacherModal && <TeacherModal teacher={teacherModal} schools={schools} userRole={user.role} onSave={onSaveTeacher} onClose={() => setTeacherModal(null)} />}
    </div>
  );
}
