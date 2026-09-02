-- "לא מתעדכן מבט הרשת" (שרה, 2.9): המשיכה מילאה רק תאים ריקים, ולכן
-- עדכון במבט-רשת לא זרם לדף אחרי המילוי הראשון. מעכשיו נזכר מקור כל
-- ערך: מה שמקורו במשיכה מתרענן במשיכה הבאה; מה שהוקלד ידנית מוגן.
alter table public.school_finance
  add column if not exists src jsonb not null default '{}'::jsonb;

-- כל מה שמולא עד היום הגיע מהמשיכה — מסומן בהתאם
update public.school_finance set src = (
  select coalesce(jsonb_object_agg(k, 'hub'), '{}'::jsonb) from (
    select 'ministryBudget' as k where ministry_budget is not null
    union all select 'yieul' where yieul is not null
    union all select 'teachingSim' where teaching_sim is not null
  ) t
);
