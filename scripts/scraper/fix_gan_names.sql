-- Fix gan names that have "פתיחת מידע נוסף:" or "סגירת מידע נוסף:" prefix (scraper noise).
-- Run in Supabase SQL Editor after run_clean_junk.sql.

UPDATE ganim
SET name_he = trim(regexp_replace(name_he, '^(פתיחת מידע נוסף:\s*|סגירת מידע נוסף:\s*)', '', 'i'))
WHERE name_he ~* '^(פתיחת מידע נוסף:\s*|סגירת מידע נוסף:\s*)';
