-- Add new Givatayim neighborhoods to the enum
ALTER TYPE public.neighborhood_givatayim ADD VALUE IF NOT EXISTS 'KIRYAT_YOSEF';
ALTER TYPE public.neighborhood_givatayim ADD VALUE IF NOT EXISTS 'SHEINKIN';
ALTER TYPE public.neighborhood_givatayim ADD VALUE IF NOT EXISTS 'KOZLOVSKY';
ALTER TYPE public.neighborhood_givatayim ADD VALUE IF NOT EXISTS 'HATEKUMA';
ALTER TYPE public.neighborhood_givatayim ADD VALUE IF NOT EXISTS 'BEN_GURION';
