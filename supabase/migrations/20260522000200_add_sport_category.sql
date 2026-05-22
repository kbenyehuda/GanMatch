-- Add 'sport' to place_category enum (wellness cannot be dropped in Postgres without recreating the type)
ALTER TYPE public.place_category ADD VALUE IF NOT EXISTS 'sport';
