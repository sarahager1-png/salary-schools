import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  // נכשל ברור ומוקדם, במקום שגיאת רשת סתומה בזמן ההתחברות
  throw new Error('חסרים VITE_SUPABASE_URL או VITE_SUPABASE_ANON_KEY בקובץ .env.local');
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // החזרה מגוגל מגיעה עם הטוקן בכתובת; בלי זה הכניסה פשוט לא נתפסת
    detectSessionInUrl: true,
  },
});
