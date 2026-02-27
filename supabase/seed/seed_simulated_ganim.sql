-- SIMULATED DATA: Fake/sample ganim for development and testing only.
-- These are NOT real daycares. For production, use government portal data or a proper scraper.
--
-- PREREQUISITE: You MUST run supabase/migrations/20260227000000_initial_schema.sql FIRST.
-- If you get "relation ganim does not exist", run the migration before this seed.

INSERT INTO ganim (
  id,
  name_he,
  name_en,
  location,
  address,
  city,
  type,
  license_status,
  has_cctv,
  metadata
) VALUES
(
  gen_random_uuid(),
  'גן שמש',
  'Gan Shemesh',
  ST_SetSRID(ST_MakePoint(34.7818, 32.0853), 4326)::geography,
  'רחוב דיזנגוף 100',
  'תל אביב',
  'Supervised',
  'Permanent',
  true,
  '{"phone": ["03-1234567"], "age_groups": ["0-3"], "hours": "07:30-16:30"}'::jsonb
),
(
  gen_random_uuid(),
  'גן הפרחים',
  'Gan HaPraxim',
  ST_SetSRID(ST_MakePoint(34.7694, 32.0608), 4326)::geography,
  'רחוב רוטשילד 50',
  'תל אביב',
  'Private',
  'Permanent',
  true,
  '{"phone": ["03-9876543"], "age_groups": ["0-2", "2-3"]}'::jsonb
),
(
  gen_random_uuid(),
  'מעון השלום',
  'Maon HaShalom',
  ST_SetSRID(ST_MakePoint(34.7921, 32.0789), 4326)::geography,
  'רחוב אלנבי 75',
  'תל אביב',
  'Maon',
  'Permanent',
  true,
  '{"phone": ["03-5551234"], "age_groups": ["0-3"]}'::jsonb
),
(
  gen_random_uuid(),
  'גן הילדים',
  'Gan Hayeladim',
  ST_SetSRID(ST_MakePoint(34.7556, 32.0712), 4326)::geography,
  'רחוב בן יהודה 120',
  'תל אביב',
  'Supervised',
  'Temporary',
  false,
  '{"phone": ["03-7778899"], "age_groups": ["1-3"]}'::jsonb
),
(
  gen_random_uuid(),
  'מעון הקשת',
  'Maon HaKeshet',
  ST_SetSRID(ST_MakePoint(34.8012, 32.0923), 4326)::geography,
  'רחוב אבן גבירול 30',
  'תל אביב',
  'Private',
  'Permanent',
  true,
  '{"phone": ["03-2223344"], "age_groups": ["0-3"], "hours": "07:00-17:00"}'::jsonb
),
(
  gen_random_uuid(),
  'גן הדקלים',
  'Gan HaDekalim',
  ST_SetSRID(ST_MakePoint(34.7722, 32.0655), 4326)::geography,
  'רחוב הרצל 45',
  'תל אביב',
  'Supervised',
  'Permanent',
  true,
  '{"phone": ["03-4445566"], "age_groups": ["0-3"]}'::jsonb
),
(
  gen_random_uuid(),
  'מעון התקווה',
  'Maon HaTikva',
  ST_SetSRID(ST_MakePoint(34.7889, 32.0556), 4326)::geography,
  'רחוב אלנבי 90',
  'תל אביב',
  'Maon',
  'Under Observation',
  false,
  '{"phone": ["03-6667788"], "age_groups": ["0-2"]}'::jsonb
);
