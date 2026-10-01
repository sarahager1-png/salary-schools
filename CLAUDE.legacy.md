# CLAUDE.md — מערכת תקציב השכר (שלהבות)

This file provides guidance to Claude Code when working with this repository.

חישוב עלות שכר עובדי הוראה בשמונת בתי הספר המוכש"ר של הרשת, על בסיס **המחשבון הרשמי
של משרד החינוך**. המערכת אינה ממציאה שכר: המנהלת מדווחת נתוני העסקה, חשבת השכר מזינה
את הברוטו שיצא מהמחשבון, ושרה מאשרת. מה שהמערכת כן מחשבת לבד הוא **עלות המעביד**,
תקן השעות, והצלבה מול התקציב ב"מבט רשת".

שמונת בתי הספר: רעננה · מזכרת בתיה · אשקלון · אור עקיבא · ירושלים · גני תקוה · רמת ישי · עפולה
(ירושלים ועפולה בעולם הישן, השאר אופק חדש — `scripts/seed-schools.mjs`).

## Commands

```bash
npm install
npm run dev:test     # ← ברירת המחדל לפיתוח: מול מסד הבדיקות, פורט 5190
npm run dev:prod     # מול המסד החי — רק כששחזרים תקלה שמנהלת דיווחה
npm run build        # vite build → dist/
npm run lint         # eslint .
```

`dev:test` מריץ `vite --mode test`, ולכן `.env.test` גובר על `.env.local`.
אין `typecheck` (JSX, לא TypeScript) ואין test suite פורמלי — האימות הוא חבילות ה-smoke.

```bash
node run-smoke.mjs                # כל החבילות ברצף
node run-smoke.mjs links docs     # רק חבילות ששמן מכיל את המחרוזות
ALLOW_PROD=1 node smoke-store.mjs # הרצה מכוונת מול החי
```

דורש שרת פיתוח פעיל ב-5190. **ברצף, לא במקביל, ועל מסד נקי** — החבילות חולקות מסד,
וחודש שנשאר מריצה קודמת מבלבל את כולן.

תחזוקה:

```bash
node scripts/list-leftovers.mjs   # מה יש במסד החי עכשיו
node scripts/tidy.mjs 2026-09     # ניקוי שרידי בדיקה — החודש לשמירה חובה, בלי ברירת מחדל
node scripts/check-prod.mjs       # בדיקת שפיות מול האתר החי
node scripts/send-links.mjs       # הרצה יבשה; --send שולח באמת
node scripts/make-signed-budget.mjs   # תקציב שנתי לחתימה פר בית ספר
node scripts/make-approval-docs.mjs   # מסמכי אישור למנהלות (מכיל ת"ז — ראי Gotchas)
```

## Deploy

- **URL:** `https://salary-schools.vercel.app`
- **Platform:** Vercel — project `salary-schools` (`prj_QL3VDtAlWkVH88NlhHBwpKbHomtR`)
- **Repo:** `sarahager1-png/salary-schools`, branch `main`
- **Supabase חי:** `rvkjfjokdhkwiigorysr` · **בדיקות:** `dovgircrzeputtkgxdsv` (`salary-schools-test`)
- פריסה: `npx vercel --prod` **מהמחשב**, כלומר **של עץ העבודה כפי שהוא** — לא של הקומיט.
  לכן `.vercelignore` אינו נוחות אלא הגנה. ראי Gotchas.
- `const BUILD` ב-`src/App.jsx:22` מתעדכן **ידנית בכל פריסה** ומוצג בכותרת ובמסך הכניסה.

## Environment variables

שמות בלבד. בדפדפן מגיעים רק משתני `VITE_*`.

```
# לקוח (Vite)
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_APP_URL                  # לבניית הקישורים שיוצאים בוואטסאפ

# שרת (/api + crons)
SUPABASE_SECRET_KEY           # או SUPABASE_SERVICE_ROLE_KEY — db() מקבל את שניהם
CRON_SECRET                   # שער הקרונים
GREEN_API_INSTANCE_ID         # וואטסאפ — הקו של שרה, מופע 7107618754 / 050-333-9770
GREEN_API_TOKEN
GREEN_API_URL                 # host פר-מופע; בלעדיו כל שליחה נכשלת בשקט
HUB_ACCESS_CODE               # קוד הגישה ל-network-budget של מבט-רשת
SHALHAVOT_BUDGET_CODE         # x-access-code שדשבורד שלהבות שולח הנה

# מקומי בלבד
SUPABASE_DB_PASSWORD          # ל-supabase db push
```

**הקוד קורא `GREEN_API_INSTANCE_ID` / `GREEN_API_TOKEN` / `GREEN_API_URL`.**
ב-`.env.local` יושבים גם שמות ישנים (`GREENAPI_INSTANCE`, `GREENAPI_TOKEN`, `GREENAPI_API_URL`)
שאף קובץ אינו קורא — הם שריד ומטעים.

## Stack

**React 19** · **Vite 8** · **Tailwind CSS 3** · **Supabase** (Auth + Postgres + Storage) ·
JavaScript (JSX, בלי TypeScript) · `xlsx` לייבוא תלושים · `lucide-react` לאייקונים.
הפרונט הוא SPA, ולצידו פונקציות serverless של Vercel תחת `api/`. **PWA** — `public/sw.js`,
`manifest.webmanifest`, כפתור התקנה במסך; מנהלות מתקינות את הקישור שלהן כאפליקציה.

## Brand

זהות רשת חינוך חב"ד. הטוקנים ב-`src/index.css`:

```
--purple #4B2E83   --teal #00B4CC        /* זהות */
--bg #F8F7FB  --surface #FFF  --fill #F4F2FA
--text #1A0B35  --text2 #4A3F6B  --text3 #8878AA
--ok / --warn / --err                    /* סמנטי — מצבים בלבד, לעולם לא קישוט */
```

`tabular-nums` על כל תא מספרי · טבלה רחבה עם כותרת ועמודת שם דביקות ·
`prefers-reduced-motion` מכובד · שורת קרדיט ב-`src/components/CreditLine.jsx`.

## Architecture

### שלוש שכבות, ולא יותר

| שכבה | קובץ | כלל |
|---|---|---|
| מסכים | `src/App.jsx` (~9,800 שורות) | **כל** רכיבי הממשק, במקום אחד |
| נתונים | `src/lib/store.js` | **הקובץ היחיד** שמדבר עם Supabase |
| חישוב | `src/lib/employer.js` | JS טהור, בלי React — **גם השרת מייבא אותו** |

`store.js` מתרגם בין שמות האפליקציה (camelCase, `_officialGross`) לשמות המסד (snake_case)
דרך טבלת `TEACHER_FIELDS` אחת. אף רכיב לא יודע איך נראית הטבלה. כל פונקציה זורקת שגיאה
עם הודעה בעברית; הקורא מציג אותה.

`employer.js` חולץ מ-App.jsx ב-2.9 **כדי שלא תהיה נוסחה שנייה**: `api/shalhavot-budget.js`
ו-`api/school-costs.js` מייבאים אותו ישירות. כל סטייה בין מסך "עלות הוראה" לכרטיס
שבדשבורד שלהבות היא באג, לא הבדל.

### ארבע דרכי כניסה

| מי | איך | קוד |
|---|---|---|
| שרה / אסתר / חשבת | Supabase Auth (סיסמה או Google) → `profiles.role` | `store.signIn`, `signInWithGoogle` |
| מנהלת בית ספר | `?k=<קוד>` מוואטסאפ — **בלי התחברות בכלל** | `LinkView`, פונקציות `link_*` |
| עובד/ת בקליטה | `?f=<קוד>` — טופס קליטה, 101, חוזה, חתימה | `OnboardingView`, `ob_*` |
| דשבורד שלהבות | `x-access-code` לשרת בלבד | `api/shalhavot-budget.js` |

`app_role` = `coordinator` (שרה) · `clerk` (חשבת שכר) · `principal` (מנהלת) · `network` (מאשרת רשתית).
מסלול הקישור אינו עובר RLS רגיל: הטבלאות **סגורות ל-`anon` לחלוטין**, וכל פעולה היא
פונקציית `link_*` ב-`SECURITY DEFINER` שמקבלת את הקוד.

### זרימת החודש

```
מנהלת מדווחת  →  needsSim   →  חשבת מזינה ברוטו  →  needsApproval  →  שרה מאשרת  →  approved
```

שלושת ה-predicates נגזרים משדות בודדים ומשמשים בכל המסכים. **שינוי בשדה בסיס מאפס
אוטומטית סימולציה ואישור** — רשימת שדות הבסיס נגזרת מ-`FIELDS` ב-`src/App.jsx:~118`,
שהוא **מקור אמת יחיד** ל-`TRACKED` / `BASE_FIELDS` / `FIELD_LBL` / `FIELD_FMT`.
בעבר היו שלוש רשימות ידניות שיצאו מסנכרון (`role` שינה שכר ולא הפיל אישור) — **אין להחזיר
רשימה ידנית; מוסיפים שורה ל-`FIELDS`.**

### קרונים (`vercel.json`)

| נתיב | מתי | תפקיד |
|---|---|---|
| `monthly-open` | 1 לחודש 04:00 | פתיחת חודש שכר חדש |
| `report-reminder` | 3 לחודש | תזכורת דיווח למנהלות |
| `report-due` | 5 לחודש | מועד הדיווח |
| `payroll-cutoff` | 6 לחודש | סגירה לחשבת |
| `maternity-watch` | כל שעה | מעקב חל"ד ומ"מ |
| `queue-drain` | כל דקה | ריקון תור ההודעות |

**כל שליחה במערכת עוברת דרך טבלת `notifications`, ורק `queue-drain` מוציאה אותה.**
המסך לא מדבר עם Green API — כך יש היסטוריה, ניסיון חוזר (עד 4), ומקום אחד לראות מה נכשל.
בלי פרטי Green API התור נשאר ממתין ולא נשלח דבר.

### מסד

94 מיגרציות תחת `supabase/migrations/`. הליבה: `schools` · `profiles` · `teacher_months`
(שורת מורה לחודש) · `school_finance` · `notifications` · `access_links` · `onboarding` ·
`month_documents` · `audit`.

## Gotchas

- **הפיתוח מכוון למסד הבדיקות בכוונה.** כשחבילות ה-smoke רצו מול החי, מנהלת שפתחה את
  הקישור בזמן בדיקה ראתה "יוני 2098" בבורר החודשים והייתה יכולה להזין אליו נתונים אמיתיים.
  `test-env.mjs` עוצר לפני השורה הראשונה אם ההגדרות מצביעות על החי.
- **`scripts/tidy.mjs` דורש את חודש העבודה כפרמטר.** חודש מקודד קשיח מחק פעם אחת
  את חודש העבודה עצמו.
- **`.vercelignore` מגן על נתונים אישיים.** הפריסה היא של עץ העבודה כפי שהוא, ולכן
  `approval-docs/`, `ishur/`, `shots/`, `תלושים-*` ו-`.env*` **חייבים** להישאר שם —
  הם מכילים ת"ז וטלפונים של מורות. כל תיקיית פלט חדשה עם נתונים אישיים — להוסיף מיד.
- **הרשאות ברמת עמודה אינן אפשריות ב-RLS.** מנהלת חסומה מלערוך ותק ודרגה דרך
  טריגר `BEFORE UPDATE`, לא דרך מדיניות. שינוי בהרשאות עמודה = טריגר, לא policy.
- **סינון תוכן ברשת (`safepage.neto.net.il`) מחליף לפעמים תשובות של Supabase בדף חסימה.**
  החבילות מזהות ומדלגות במקום להיכשל — אל "תתקני" את הזיהוי הזה.
- **קוד הקישור נשמר ב-localStorage בגלל ה-PWA.** אפליקציה מותקנת נפתחת ב-`start_url`
  ("/" בלי `?k`), ולכן הקוד נטען מהמכשיר — אבל **רק ב-standalone ורק כשאין סשן מחובר**,
  אחרת התקנה במכשיר שפעם נפתח בו קישור של מנהלת הייתה דורסת את מסך הכניסה של שרה.
- **`const BUILD` מתעדכן ידנית.** מספר ישן בכותרת = אין דרך לדעת איזו גרסה רואה המנהלת.
- **תקן השעות — כלל אחד לכל המסכים, וזהה ל-`p_hours_of` בשרת:** שעות פרונטליות של
  עובדות הוראה, **בלי** מנהלת, בלי שילוב, בלי משרה שעתית/צהרון, בלי מי שבחל"ד/חל"ת החודש;
  שעות ייעוץ מחוץ לתקן. שינוי בכלל חייב לקרות בשני המקומות — אחרת החריגה בבית הספר
  והחריגה בדוח לא יסכימו.
- **הייעול ממבט-רשת נספר רק כשנבחר בפועל (`saved`).** ייעול מוצע שאיש לא אישר אינו חיסכון.
- **`AUDIT.md` היסטורי.** הוא מתאר גרסה מוקדמת שחיה ב-localStorage בלי אימות ובלי שרת.
  כמעט כל ה"קריטי" שבו כבר תוקן. אל תתייחסי אליו כמצב הנוכחי.
- ענף `redesign-and-fixes` קיים במקביל ל-`main`; העבודה החיה היא ב-`main`.

## Conventions

- כל טקסט בעברית, `dir="rtl"`, mobile-first — **המנהלות עובדות מהטלפון**.
- שגיאות מוצגות למשתמשת בעברית; `store.js` כבר מתרגם, אל תוסיפי טקסט אנגלי במסך.
- כל שינוי נשמר בשרת ואז **נטען מחדש** (`run` → `refresh`) — אין עדכון אופטימי.
- הערות הקוד מתעדות **החלטות של שרה עם תאריך** ("שרה, 15.9") — זו שכבת התיעוד
  האמיתית של הלוגיקה העסקית. כשמשנים כלל, מחליפים את ההערה, לא מוחקים אותה.
- שורת קרדיט אחידה: `בנוי ופיתוח: שרה הגר · 0503339770`.
- שנים בעברית (תשפ״ז), לא מספרים.
