-- Places whose location is unknown (e.g. WhatsApp rec with no address) should not
-- appear on the map. Previously they were all force-geocoded to Givatayim centre.
-- This migration:
--   1. Makes places.location nullable.
--   2. Rewrites insert_community_place to accept NULL lat/lon.
--   3. Retrospectively nulls out WhatsApp-sourced places that had no address hint
--      and therefore were incorrectly placed at Givatayim centre.

-- =============================================================================
-- 1. Make location nullable
-- =============================================================================
ALTER TABLE public.places ALTER COLUMN location DROP NOT NULL;

-- =============================================================================
-- 2. Rewrite insert_community_place — lat/lon are now optional (DEFAULT NULL).
--    Null coordinates produce a null location column.
-- =============================================================================
DROP FUNCTION IF EXISTS public.insert_community_place(
  TEXT, public.place_category, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT[], TEXT, TEXT, UUID
);

CREATE OR REPLACE FUNCTION public.insert_community_place(
  p_name        TEXT,
  p_category    public.place_category,
  p_lon         DOUBLE PRECISION DEFAULT NULL,
  p_lat         DOUBLE PRECISION DEFAULT NULL,
  p_address     TEXT    DEFAULT NULL,
  p_description TEXT    DEFAULT NULL,
  p_phone       TEXT[]  DEFAULT NULL,
  p_website     TEXT    DEFAULT NULL,
  p_hours       TEXT    DEFAULT NULL,
  p_user_id     UUID    DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.places (
    name, place_category, location,
    address, description, phone, website, hours,
    source, suggested_by
  ) VALUES (
    p_name,
    p_category,
    CASE
      WHEN p_lon IS NOT NULL AND p_lat IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::GEOGRAPHY
      ELSE NULL
    END,
    p_address, p_description, p_phone, p_website, p_hours,
    'community', p_user_id
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.insert_community_place(
  TEXT, public.place_category, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT[], TEXT, TEXT, UUID
) TO authenticated;

-- =============================================================================
-- 3. Update search_places to handle null location (ST_Y of NULL = NULL, fine).
--    Also let null-location places appear in search results so they can be
--    listed with an "אין מיקום" label.  No WHERE change needed — ST_Y(NULL)
--    just produces NULL lat/lon in the result set.
-- =============================================================================

-- (No RPC change required — PostgreSQL handles NULL geography gracefully.)

-- =============================================================================
-- 4. Helper RPC used by the retroactive geocode endpoint to update a place
--    location from TypeScript without needing PostgREST to call ST_MakePoint.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_place_location(
  p_id  UUID,
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.places
  SET
    location   = ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::GEOGRAPHY,
    updated_at = NOW()
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_place_location(UUID, DOUBLE PRECISION, DOUBLE PRECISION)
  TO service_role;

-- =============================================================================
-- 5. Retrospective geocoding is handled by the admin API endpoint
--    POST /api/admin/whatsapp-staging/retroactive-geocode
--    which re-processes each approved staging row through LLM address
--    extraction + Nominatim geocoding before deciding whether to set a real
--    location or leave it as NULL.
-- =============================================================================

NOTIFY pgrst, 'reload schema';
