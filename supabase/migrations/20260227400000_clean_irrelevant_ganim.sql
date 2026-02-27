-- Delete irrelevant ganim: municipal offices, nav links, events, services, etc.
-- These were scraped by mistake and are not actual daycares (מעונות יום / גנים).

DELETE FROM ganim
WHERE
  -- More than 3 words = not a gan name
  array_length(string_to_array(regexp_replace(trim(name_he), '\s+', ' ', 'g'), ' '), 1) > 3
  OR
  -- Municipal/gov offices
  name_he ILIKE '%עיריית%'
  OR name_he ILIKE '%עירייה%'
  OR name_he ILIKE '%משרד ראשי%'
  OR name_he ILIKE '%מרכז שירות%'
  OR name_he ILIKE '%מרכז השירות לתושב%'
  -- City names as sole entry
  OR TRIM(name_he) IN ('גבעתיים', 'תל אביב', 'תל-אביב')
  -- Generic labels
  OR TRIM(name_he) IN ('מעון יום', 'פתיחת מידע', 'סגירת מידע', 'לחצו לפרטים', 'שם המעון')
  OR name_he ILIKE 'גילאי%'
  -- Non-daycare: events, services, nav links
  OR name_he ILIKE '%חירום%'
  OR name_he ILIKE '%לוח אירועים%'
  OR name_he ILIKE '%מכרזים%'
  OR name_he ILIKE '%מכרז%'
  OR name_he ILIKE '%דרושים%'
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
  -- Playgrounds, community centers, lectures, classes (not daycares)
  OR name_he ILIKE '%משחקיית%'
  OR name_he ILIKE '%מרכז קהילתי%'
  OR name_he ILIKE '%הרצאה%'
  OR name_he ILIKE '%ריקודי עם%'
  OR name_he ILIKE '%חוג בוקר%'
  OR name_he ILIKE '%מגיל לידה ועד%'
  -- Very short
  OR LENGTH(TRIM(name_he)) < 2;
