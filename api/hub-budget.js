/*
  גשר למבט-רשת — הכנסות וייעול לכל בית ספר, לדף עלות ההוראה.

  "מערכות תקציב מבט רשת נותנות הכנסות שכר" (שרה, 2.9). הפונקציה
  network-budget של מבט-רשת כבר מסכמת לכל בית ספר את ההכנסות ואת
  הייעול שנבחר; כאן רק מגשרים אליה. קוד הגישה שלה נשאר בצד השרת —
  בדפדפן הוא היה גלוי לכל מי שפותחת את הקבצים.

  מי רשאי: coordinator בלבד, מאומת מול טוקן ההתחברות האמיתי —
  אותה הרשאה שמסתירה את דף עלות ההוראה עצמו.

  הייעול נספר רק כשבמבט-רשת נבחר בפועל (saved) — ייעול מוצע שאיש לא
  אישר אינו חיסכון, וזו בדיוק המלכודת של "טרם נבחר ייעול".
*/
import { createClient } from '@supabase/supabase-js';
import { db } from './_lib/db.js';

const HUB_URL = 'https://ogkwvrerolofujhydhsl.supabase.co/functions/v1/network-budget';

export default async function handler(req, res) {
  try {
    const token = (req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'חסר טוקן התחברות' });

    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const anon = createClient(url, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: userData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !userData?.user) return res.status(401).json({ error: 'ההתחברות אינה תקפה' });

    const { data: prof } = await db().from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (prof?.role !== 'coordinator') return res.status(403).json({ error: 'הדף הזה של שרה בלבד' });

    const code = process.env.HUB_ACCESS_CODE;
    if (!code) return res.status(500).json({ error: 'HUB_ACCESS_CODE אינו מוגדר בשרת' });

    const r = await fetch(HUB_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!r.ok) return res.status(502).json({ error: `מבט-רשת החזיר ${r.status}` });
    const data = await r.json();

    const schools = (data.schools || []).filter(s => !s.empty && !s.error).map(s => {
      const inc = s.income || {};
      // הכסף שמקורו במשרד: תקן + מענק + לתלמיד + תל"ן. שכר לימוד ותרומות לא.
      const ministry = (inc.ministry || 0) + (inc.grant || 0) + (inc.perStudent || 0) + (inc.talan || 0);
      return {
        name: s.name,
        ministry,
        parts: { ministry: inc.ministry || 0, grant: inc.grant || 0, perStudent: inc.perStudent || 0, talan: inc.talan || 0 },
        incomeTotal: inc.total || 0,
        yieul: s.efficiency?.saved === true ? (s.efficiency?.total || 0) : null,
        yieulOffered: s.efficiency?.total || 0,
        yieulChosen: s.efficiency?.saved === true,
      };
    });
    return res.status(200).json({ schools, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'שגיאה בשרת' });
  }
}
