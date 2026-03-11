-- When query is "gan name, city" (e.g. "גן חבצלת, גבעתיים"), search for ganim matching both name and city.

CREATE OR REPLACE FUNCTION public.search_ganim(p_query TEXT, p_limit INT DEFAULT 10)
RETURNS TABLE (
  id UUID,
  name_he TEXT,
  address TEXT,
  city TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_query TEXT;
  v_name_part TEXT;
  v_city_part TEXT;
  v_name_pattern TEXT;
  v_city_pattern TEXT;
BEGIN
  v_query := trim(coalesce(p_query, ''));
  IF length(v_query) < 2 THEN
    RETURN;
  END IF;

  -- If query contains comma, treat as "gan name, city" format
  -- "גן" is a trigger prefix; the actual gan name is the word(s) after it (e.g. "גן חבצלת" -> "חבצלת")
  IF position(',' IN v_query) > 0 THEN
    v_name_part := trim(regexp_replace(trim(split_part(v_query, ',', 1)), '^גן\s*', ''));
    v_city_part := trim(split_part(v_query, ',', 2));
    IF length(v_name_part) < 2 THEN
      RETURN;
    END IF;

    v_name_pattern := '%' || v_name_part || '%';
    v_city_pattern := CASE WHEN length(v_city_part) >= 2 THEN '%' || v_city_part || '%' ELSE NULL END;

    RETURN QUERY
    SELECT
      g.id,
      g.name_he,
      g.address,
      g.city,
      ST_Y(g.location::geometry)::DOUBLE PRECISION,
      ST_X(g.location::geometry)::DOUBLE PRECISION
    FROM public.ganim_v2 g
    WHERE
      (g.name_he ILIKE v_name_pattern OR (g.name_en IS NOT NULL AND g.name_en ILIKE v_name_pattern))
      AND (v_city_pattern IS NULL OR (g.city IS NOT NULL AND g.city ILIKE v_city_pattern))
    LIMIT least(greatest(p_limit, 1), 100);
    RETURN;
  END IF;

  -- Single query (no comma): strip "גן " prefix, search name_he/name_en
  v_name_part := trim(regexp_replace(v_query, '^גן\s*', ''));
  IF length(v_name_part) < 2 THEN
    RETURN;
  END IF;
  v_name_pattern := '%' || v_name_part || '%';

  RETURN QUERY
  SELECT
    g.id,
    g.name_he,
    g.address,
    g.city,
    ST_Y(g.location::geometry)::DOUBLE PRECISION,
    ST_X(g.location::geometry)::DOUBLE PRECISION
  FROM public.ganim_v2 g
  WHERE
    g.name_he ILIKE v_name_pattern
    OR (g.name_en IS NOT NULL AND g.name_en ILIKE v_name_pattern)
  LIMIT least(greatest(p_limit, 1), 100);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_ganim(TEXT, INT) TO anon;
GRANT EXECUTE ON FUNCTION public.search_ganim(TEXT, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
