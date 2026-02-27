-- GanMatch Database Schema
-- Enables PostGIS for location-based spatial queries (radius, bounding box)
-- Run this in Supabase SQL Editor or via supabase db push

-- Enable PostGIS extension (required for geography/geometry types)
CREATE EXTENSION IF NOT EXISTS postgis;

-- =============================================================================
-- GANIM (Daycares) - Core table with government licensing data
-- =============================================================================
CREATE TABLE IF NOT EXISTS ganim (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core identifiers
  name_he TEXT NOT NULL,
  name_en TEXT,
  
  -- Location - PostGIS geography for efficient spatial queries
  -- Use ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography when inserting
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  address TEXT,
  city TEXT,
  
  -- Government licensing data
  type TEXT NOT NULL CHECK (type IN ('Private', 'Supervised', 'Maon')),
  license_status TEXT NOT NULL CHECK (license_status IN ('Permanent', 'Temporary', 'Under Observation')),
  has_cctv BOOLEAN DEFAULT FALSE,
  
  -- Flexible metadata (phone numbers, age groups, hours, etc.)
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for fast bounding-box and radius queries
CREATE INDEX IF NOT EXISTS idx_ganim_location ON ganim USING GIST (location);

-- Index for common filters
CREATE INDEX IF NOT EXISTS idx_ganim_city ON ganim (city);
CREATE INDEX IF NOT EXISTS idx_ganim_type ON ganim (type);
CREATE INDEX IF NOT EXISTS idx_ganim_license_status ON ganim (license_status);
CREATE INDEX IF NOT EXISTS idx_ganim_metadata ON ganim USING GIN (metadata);

-- =============================================================================
-- REVIEWS - Community "Give-to-Get" reviews
-- =============================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gan_id UUID NOT NULL REFERENCES ganim(id) ON DELETE CASCADE,
  
  -- Review content
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  pros_text TEXT,
  cons_text TEXT,
  advice_to_parents_text TEXT,
  enrollment_year SMALLINT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, gan_id) -- One review per user per gan
);

CREATE INDEX IF NOT EXISTS idx_reviews_gan_id ON reviews (gan_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews (user_id);

-- =============================================================================
-- VISIT_NOTES - Short contributions that count toward "Give-to-Get" unlock
-- =============================================================================
CREATE TABLE IF NOT EXISTS visit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gan_id UUID NOT NULL REFERENCES ganim(id) ON DELETE CASCADE,
  note_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, gan_id)
);

CREATE INDEX IF NOT EXISTS idx_visit_notes_gan_id ON visit_notes (gan_id);
CREATE INDEX IF NOT EXISTS idx_visit_notes_user_id ON visit_notes (user_id);

-- =============================================================================
-- WAITLIST_REPORTS - Community-reported availability status
-- =============================================================================
CREATE TABLE IF NOT EXISTS waitlist_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gan_id UUID NOT NULL REFERENCES ganim(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  status TEXT NOT NULL CHECK (status IN ('Available', 'Limited', 'Full')),
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_waitlist_reports_gan_id ON waitlist_reports (gan_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_reports_reported_at ON waitlist_reports (reported_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) - Enable for production
-- =============================================================================
ALTER TABLE ganim ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_reports ENABLE ROW LEVEL SECURITY;

-- Ganim: Public read access
CREATE POLICY "ganim_public_read" ON ganim FOR SELECT USING (true);

-- Reviews: Users can read, insert, update own
CREATE POLICY "reviews_select" ON reviews FOR SELECT USING (true);
CREATE POLICY "reviews_insert" ON reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reviews_update" ON reviews FOR UPDATE USING (auth.uid() = user_id);

-- Visit notes: Same pattern
CREATE POLICY "visit_notes_select" ON visit_notes FOR SELECT USING (true);
CREATE POLICY "visit_notes_insert" ON visit_notes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Waitlist reports: Anyone can insert (community reports), all can read
CREATE POLICY "waitlist_reports_select" ON waitlist_reports FOR SELECT USING (true);
CREATE POLICY "waitlist_reports_insert" ON waitlist_reports FOR INSERT WITH CHECK (true);

-- =============================================================================
-- HELPER FUNCTION: Get ganim within bounding box (for map viewport)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_ganim_in_bbox(
  min_lon DOUBLE PRECISION,
  min_lat DOUBLE PRECISION,
  max_lon DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  name_he TEXT,
  name_en TEXT,
  address TEXT,
  city TEXT,
  type TEXT,
  license_status TEXT,
  has_cctv BOOLEAN,
  metadata JSONB,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id,
    g.name_he,
    g.name_en,
    g.address,
    g.city,
    g.type,
    g.license_status,
    g.has_cctv,
    g.metadata,
    ST_Y(g.location::geometry)::DOUBLE PRECISION AS lat,
    ST_X(g.location::geometry)::DOUBLE PRECISION AS lon
  FROM ganim g
  WHERE ST_Within(
    g.location,
    ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)::geography
  )
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
