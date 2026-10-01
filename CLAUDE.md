# מערכת השכר ("המערכת שלי עם אסתר")

> נגזר אוטומטית מכרטיס המערכת (עודכן 1/10/2026) · ענף: main

## מה המערכת ולמי
- **פרודקשן:** https://salary-schools.vercel.app · Vercel: `salary-schools` בחשבון sarahager1-pngs-projects (פריסה אחרונה Ready לפני יום)
- **מסד:** Supabase `rvkjfjokdhkwiigorysr` (eu-central-1) · מסד בדיקות: `dovgircrzeputtkgxdsv` (`salary-schools-test`)
- **סטאק:** Vite 8 + React 19 (כמעט הכול ב-`src/App.jsx`, נתונים ב-`src/lib/store.js`), פונקציות serverless ב-`api/`, PWA

## פריסה
- `npx vercel --prod --yes` מהמחשב. **נפרס עץ העבודה כמות שהוא**, לא הקומיט; push לגיט לא בונה כלום.
- ⚠️ ב-1/10 יש בעץ העבודה 69 שינויים לא מקומטים – לבדוק `git status` לפני כל פריסה, אחרת עבודה לא מאושרת עולה.
- `const BUILD` ב-`src/App.jsx` מתעדכן ידנית בכל פריסה. בדיקה: `vercel ls --yes` → ● Ready + מספר BUILD במסך הכניסה.

## רגישות
- שכר, ת"ז וטלפונים של מורות · בדיקת Codex לפני פריסה: **כן** · gizbarit: **כן**
- שליחה החוצה: וואטסאפ מהקו של שרה 050-333-9770 (משתני `GREEN_API_*`), רק דרך טבלת `notifications` → קרון `queue-drain`. התראות לשרה: `profiles.phone` של שרה (null = כבוי).
- `sim-watcher` (כפתור "חשב") רץ רק על המחשב במשרד (משימה מתוזמנת `salary-sim-watcher`).

## מלכודות (5 הראשונות מהכרטיס)
- טריגר במסד (`enforce_column_permissions`) חוסם כתיבה מהשרת ל-`official_gross`, `chabad_supp` ושדות מ"מ. לא להחליש אותו: מכניסים הצעה ל-`proposed_fixes`, ושרה מאשרת במסך האישורים — [[salary-schools-system]]
- "חשב" שנשאר "מחשב…" = ה-watcher לא רץ. הרצה חוזרת של "חשב" דורסת ברוטו שהועלה ידנית — [[salary-schools-system]]
- דיווח מנהלת מדליק `report_pending`: אין סימולציה ואין שכר עד ששרה מאשרת. דיווח מותר רק 1–20 בחודש — [[salary-principal-report-approval]]
- לא להריץ `supabase db push --include-all`, כי הוא מריץ מחדש מיגרציות ישנות. אחרי הרצה ישירה צריך `migration repair` — [[salary-schools-migrations-history]]
- בדיקות smoke רק מול מסד הבדיקות. "דילוג" אינו הצלחה, כי סינון התוכן `safepage.neto.net.il` חוסם לפעמים קריאות — [[project-salary-schools-testing]]

מקור האמת: הכרטיס `~/.claude/skills/tzevet/systems/salary-schools.md` והכללים `~/.claude/skills/tzevet/KLALIM.md`. לא לערוך את הקובץ הזה ידנית – הוא נוצר ב-gen-claude-md.mjs.
