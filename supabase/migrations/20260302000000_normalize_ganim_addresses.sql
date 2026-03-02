-- Normalize ganim.address to "street + number" where possible.
-- Preserve the original raw address in metadata.raw_address when we change it.
-- Store detected neighborhood in metadata.neighborhood (do not overwrite if already present).

WITH base AS (
  SELECT
    g.id,
    g.name_he,
    g.city,
    g.address AS raw_address,
    g.metadata,
    -- Normalize whitespace + separators
    regexp_replace(
      replace(replace(replace(coalesce(g.address, ''), '•', '|'), '｜', '|'), '│', '|'),
      '\s+',
      ' ',
      'g'
    ) AS s0
  FROM public.ganim g
  WHERE g.address IS NOT NULL AND btrim(g.address) <> ''
),
strip1 AS (
  SELECT
    *,
    -- Strip leading UI labels (apply twice because some rows repeat it)
    regexp_replace(
      regexp_replace(
        s0,
        '^\s*(פתיחת מידע נוסף\s*:|סגירת מידע נוסף\s*:|פתיחת מידע\s*:|סגירת מידע\s*:|מסגרת מידע נוסף\s*:|מידע נוסף\s*:|לחצו לפרטים)\s*',
        '',
        'gi'
      ),
      '^\s*(פתיחת מידע נוסף\s*:|סגירת מידע נוסף\s*:|פתיחת מידע\s*:|סגירת מידע\s*:|מסגרת מידע נוסף\s*:|מידע נוסף\s*:|לחצו לפרטים)\s*',
      '',
      'gi'
    ) AS s1
  FROM base
),
strip2 AS (
  SELECT
    *,
    regexp_replace(s1, '\s*\|\s*', ' | ', 'g') AS s2
  FROM strip1
),
cut AS (
  SELECT
    *,
    (
      regexp_split_to_array(
        s2,
        '(?i)\s*(?:פתיחת מידע נוסף|סגירת מידע נוסף|מסגרת מידע נוסף|מידע נוסף|סמל מעון|מוכר/פרטי|תוקף רישיון|סטטוס רישוי|סטטוס|רישיון|טלפון|מנהלת|מנהל|שעות|אימייל|דוא״ל|דוא\"ל|דוא''ל|דואל)\s*:?\s*'
      )
    )[1] AS s3
  FROM strip2
),
parts AS (
  SELECT
    id,
    name_he,
    city,
    raw_address,
    metadata,
    btrim(regexp_replace(coalesce(s3, ''), '[|;:\-–—]+$', '', 'g')) AS cleaned,
    regexp_split_to_array(btrim(coalesce(s3, '')), '\s*,\s*') AS cparts
  FROM cut
),
calc AS (
  SELECT
    id,
    name_he,
    city,
    raw_address,
    metadata,
    cleaned,
    nullif(btrim(cparts[1]), '') AS p1,
    nullif(btrim(cparts[2]), '') AS p2,
    nullif(btrim(cparts[3]), '') AS p3
  FROM parts
),
street AS (
  SELECT
    *,
    -- Remove embedded city text from street candidate (best-effort)
    btrim(
      replace(
        replace(coalesce(p1, ''), coalesce(city, ''), ''),
        replace(coalesce(city, ''), '-', ' '),
        ''
      )
    ) AS street0
  FROM calc
),
final AS (
  SELECT
    id,
    raw_address,
    metadata,
    city,
    name_he,
    (raw_address ~ '[|:]'
      OR raw_address ~* '(פתיחת מידע|סגירת מידע|מידע נוסף|סמל מעון|מוכר/פרטי|תוקף רישיון|סטטוס רישוי|טלפון|מנהלת|מנהל|שעות|לחצו לפרטים)'
    ) AS looks_blob,
    -- Street heuristic:
    -- - keep if contains digits OR starts with a common street keyword OR is short-ish and does not resemble the gan name/UI label
    CASE
      WHEN street0 = '' THEN NULL
      WHEN city IS NOT NULL AND (street0 ILIKE city OR city ILIKE street0) THEN NULL
      WHEN street0 ~ '\d' THEN street0
      WHEN street0 ~* '\m(רחוב|שדרות|שד׳|שד''|שד\.|דרך|סמטת|כיכר)\M' THEN street0
      WHEN char_length(street0) BETWEEN 3 AND 60
        AND street0 !~* '(פתיחת מידע|סגירת מידע|מידע נוסף|לחצו)'
        AND street0 !~ '[:|]'
        AND (name_he IS NULL OR street0 NOT ILIKE ('%' || name_he || '%'))
        AND (name_he IS NULL OR name_he NOT ILIKE ('%' || street0 || '%'))
      THEN street0
      ELSE NULL
    END AS street_address,
    -- Neighborhood heuristic (do not overwrite existing metadata.neighborhood):
    CASE
      WHEN (metadata ? 'neighborhood') THEN NULL
      WHEN p2 IS NULL THEN NULL
      WHEN city IS NOT NULL AND (p2 ILIKE city OR city ILIKE p2) THEN
        CASE
          WHEN p3 IS NOT NULL
            AND NOT (city IS NOT NULL AND (p3 ILIKE city OR city ILIKE p3))
            AND p3 !~ '\d'
            AND char_length(p3) <= 40
            AND p3 !~* '(פתיחת מידע|סגירת מידע|מידע נוסף|לחצו)'
          THEN p3
          ELSE NULL
        END
      WHEN p2 !~ '\d'
        AND char_length(p2) <= 40
        AND p2 !~* '(פתיחת מידע|סגירת מידע|מידע נוסף|לחצו)'
      THEN p2
      ELSE NULL
    END AS neighborhood
  FROM street
)
UPDATE public.ganim g
SET
  -- Save the original raw address only if we are changing address and raw_address not already stored.
  metadata = (
    CASE
      WHEN NOT (g.metadata ? 'raw_address')
        AND (
          (final.street_address IS NOT NULL AND btrim(coalesce(g.address, '')) <> btrim(final.street_address))
          OR (final.street_address IS NULL AND final.looks_blob AND g.address IS NOT NULL)
        )
      THEN g.metadata || jsonb_build_object('raw_address', g.address)
      ELSE g.metadata
    END
  ) || (
    CASE
      WHEN final.neighborhood IS NOT NULL
      THEN jsonb_build_object('neighborhood', final.neighborhood)
      ELSE '{}'::jsonb
    END
  ),
  address = CASE
    WHEN final.street_address IS NOT NULL THEN final.street_address
    WHEN final.street_address IS NULL AND final.looks_blob THEN NULL
    ELSE g.address
  END
FROM final
WHERE g.id = final.id;

-- Keep Supabase schema cache in sync
NOTIFY pgrst, 'reload schema';

