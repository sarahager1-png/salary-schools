// שורת הקרדיט האחידה של כל המערכות — הנוסח קבוע, לא לשנות.
export function CreditLine({ className = '' }) {
  return (
    <p className={`text-center text-xs leading-relaxed text-[#6E6893] ${className}`} dir="rtl">
      בנוי ופיתוח: שרה הגר · <span dir="ltr">0503339770</span> · יעוץ ארגוני | פתרונות דיגיטליים · מהבנת הארגון לפתרון שעובד.
    </p>
  );
}
