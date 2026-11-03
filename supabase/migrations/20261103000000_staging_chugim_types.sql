-- Triage: the kind of class (תחום) for kids rows typed "חוגים", chosen in /admin/whatsapp.
-- On approval it goes to places.attributes.chugim_types (the map's "תחום" filter) instead of the AI's guess.
alter table public.whatsapp_import_staging add column if not exists chugim_types text[] null;

notify pgrst, 'reload schema';
