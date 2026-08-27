// טוען את הגדרות הבדיקה ומגן על המסד החי.
//
// חבילות ה-smoke יוצרות בתי ספר, משתמשים וחודשים ומוחקות אחריהן. כשהן רצו
// מול המסד החי, מנהלת שפתחה את הקישור בזמן שבדיקה רצה ראתה חודשי בדיקה
// בבורר ויכלה להזין אליהם נתונים אמיתיים. לכן יש פרויקט Supabase נפרד.
//
// אם קיים .env.test — הוא הנטען. אחרת .env.local, ואז המודול עוצר לפני
// שנכתבת שורה אחת למסד החי, אלא אם הורצה במפורש עם ALLOW_PROD=1.
import fs from 'node:fs';

const PROD_REF = 'rvkjfjokdhkwiigorysr';

export const ENV_FILE = fs.existsSync('.env.test') ? '.env.test' : '.env.local';

const parse = (f) => Object.fromEntries(
  fs.readFileSync(f, 'utf8').split(/\r?\n/)
    .filter(l => l.trim() && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

export const env = parse(ENV_FILE);

if (String(env.VITE_SUPABASE_URL || '').includes(PROD_REF) && process.env.ALLOW_PROD !== '1') {
  console.error(
    '\nעצירה: הבדיקה מכוונת למסד החי (' + PROD_REF + ').\n' +
    'המנהלות עובדות בו עכשיו, והבדיקות יוצרות בו חודשים ומשתמשים.\n' +
    'הריצי מול מסד הבדיקות — ודאי ש-.env.test קיים.\n' +
    'להרצה מכוונת מול החי בכל זאת:  ALLOW_PROD=1 node <suite>\n'
  );
  process.exit(1);
}

export const URL = env.VITE_SUPABASE_URL;
export const ANON = env.VITE_SUPABASE_ANON_KEY;
export const SECRET = env.SUPABASE_SECRET_KEY;
