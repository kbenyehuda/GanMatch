-- Delete more junk: nav links, services, events, community centers, etc.
-- Run after 20260227400000 if junk slipped through.

DELETE FROM ganim
WHERE
  array_length(string_to_array(regexp_replace(trim(name_he), '\s+', ' ', 'g'), ' '), 1) > 3
  OR name_he ILIKE '%מקלטים ציבוריים%'
  OR name_he ILIKE '%וואטסאפ למוקד%'
  OR name_he ILIKE '%התחדשות עירונית%'
  OR name_he ILIKE '%אירועים לגיל הרך%'
  OR name_he ILIKE '%קבלת עדכונים%'
  OR name_he ILIKE '%רישום בחינוך%'
  OR name_he ILIKE '%לשלם ארנונה%'
  OR name_he ILIKE '%דוחות מפגעים%'
  OR name_he ILIKE '%מפגעים%'
  OR name_he ILIKE '%אגרת שילוט%'
  OR name_he ILIKE '%דוח חניה%'
  OR name_he ILIKE '%חשבון מים%'
  OR name_he ILIKE '%כריתת עץ%'
  OR name_he ILIKE '%לקבל שירותים%'
  OR name_he ILIKE '%זימון תורים%'
  OR name_he ILIKE '%פינוי אשפה%'
  OR name_he ILIKE '%פינוי גזם%'
  OR name_he ILIKE '%גרוטאות%'
  OR name_he ILIKE '%רווחה ושירותים%'
  OR name_he ILIKE '%תו חניה%'
  OR name_he ILIKE '%משחקיית%'
  OR name_he ILIKE '%מרכז קהילתי%'
  OR name_he ILIKE '%הרצאה%'
  OR name_he ILIKE '%ריקודי עם%'
  OR name_he ILIKE '%חוג בוקר%'
  OR name_he ILIKE '%מגיל לידה ועד%'
  OR name_he ILIKE '%דרושים%';
