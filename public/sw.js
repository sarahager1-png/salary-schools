/*
  Service worker מינימלי.
  אין כאן מטמון של נתונים — שכר שנשמר במטמון הוא שכר שמישהי תראה
  כשהוא כבר לא נכון. הוא קיים כדי שהדפדפן יציע התקנה, ומגיש קליפה
  בסיסית כשאין רשת.
*/
const SHELL = 'shell-v1';
const OFFLINE = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<title>אין חיבור</title><body style="font-family:Heebo,system-ui,sans-serif;background:#F8F7FB;color:#1A0B35;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px">
<div><p style="font-size:18px;font-weight:700">אין חיבור לאינטרנט</p>
<p style="font-size:14px;color:#8878AA;margin-top:6px">המערכת עובדת מול השרת, ולכן נדרש חיבור. נסי שוב כשיהיה.</p></div>`;

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(SHELL)); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;          // רק ניווטים; קריאות נתונים תמיד לרשת
  e.respondWith(fetch(e.request).catch(() =>
    new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
