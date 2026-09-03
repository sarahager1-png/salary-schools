-- "אחוזים שדה שלי" (שרה, 3.9.2026).
--
-- הודעת החסימה קראה לאחוז המשרה "שדה של השליח" — מהיום היא אומרת של מי
-- הוא באמת. החסימה עצמה לא השתנתה: אחוז המשרה היה ונשאר של שרה בלבד.
create or replace function private.col_label(p_col text)
returns text
language sql
immutable
as $$
  select coalesce(
    case p_col
      when 'children_under_18'    then 'את מספר הילדים עד גיל 18 (שדה של המנהלת — הוא משנה את השכר בעולם הישן)'
      when 'frontal_hours'        then 'את שעות ההוראה (שדה של המנהלת)'
      when 'scope_pct'            then 'את אחוז המשרה (שדה של שרה בלבד)'
      when 'official_gross'       then 'את הברוטו (שדה של חשבת השכר)'
      when 'chabad_supp'          then 'את תוספת בית חב"ד (שדה של חשבת השכר)'
      when 'actual_employer_cost' then 'את עלות המעביד בפועל (שדה של חשבת השכר)'
      when 'agreed_gross'         then 'את הברוטו המוסכם (שדה של שרה)'
      when 'approved'             then 'את האישור'
      when 'payroll_ready'        then 'את המעבר לשכר'
      when 'school_id'            then 'את שיוך בית הספר'
      when 'slip_issued_at'       then 'את סימון הוצאת התלוש (שדה של חשבת השכר)'
      when 'slip_gross'           then 'את הברוטו שיצא בתלוש (שדה של חשבת השכר)'
      else null
    end,
    'את השדה ' || p_col);
$$;
