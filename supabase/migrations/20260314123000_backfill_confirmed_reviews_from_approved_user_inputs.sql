-- Backfill approved review inputs into confirmed_reviews.
-- This fixes legacy gaps where admin approval updated user_inputs status
-- but a corresponding confirmed_reviews row was not materialized yet.

insert into public.confirmed_reviews (
  user_id,
  gan_id,
  rating,
  cleanliness_rating,
  staff_rating,
  communication_rating,
  food_rating,
  location_rating,
  safety_rating,
  advice_to_parents_text,
  enrollment_years,
  is_anonymous,
  allow_contact,
  reviewer_public_name,
  reviewer_public_email_masked,
  updated_at
)
select
  ui.user_id,
  ui.gan_id,
  case
    when coalesce(ui.metadata->>'rating', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (ui.metadata->>'rating')::numeric
    else 3.0
  end as rating,
  case
    when coalesce(ui.metadata->>'cleanliness_rating', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (ui.metadata->>'cleanliness_rating')::numeric
    else null
  end as cleanliness_rating,
  case
    when coalesce(ui.metadata->>'staff_rating', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (ui.metadata->>'staff_rating')::numeric
    else null
  end as staff_rating,
  case
    when coalesce(ui.metadata->>'communication_rating', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (ui.metadata->>'communication_rating')::numeric
    else null
  end as communication_rating,
  case
    when coalesce(ui.metadata->>'food_rating', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (ui.metadata->>'food_rating')::numeric
    else null
  end as food_rating,
  case
    when coalesce(ui.metadata->>'location_rating', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (ui.metadata->>'location_rating')::numeric
    else null
  end as location_rating,
  case
    when coalesce(ui.metadata->>'safety_rating', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (ui.metadata->>'safety_rating')::numeric
    else null
  end as safety_rating,
  nullif(btrim(coalesce(ui.free_text_rec, '')), '') as advice_to_parents_text,
  nullif(btrim(coalesce(ui.metadata->>'enrollment_years', '')), '') as enrollment_years,
  coalesce(ui.anonymous, true) as is_anonymous,
  coalesce(ui.allows_messages, true) as allow_contact,
  nullif(btrim(coalesce(ui.metadata->>'reviewer_public_name', '')), '') as reviewer_public_name,
  nullif(btrim(coalesce(ui.metadata->>'reviewer_public_email_masked', '')), '') as reviewer_public_email_masked,
  now() as updated_at
from public.user_inputs ui
where ui.input_type = 'review'
  and ui.status = 'approved'
  and ui.user_id is not null
  and ui.gan_id is not null
on conflict (user_id, gan_id) do update
set
  rating = excluded.rating,
  cleanliness_rating = excluded.cleanliness_rating,
  staff_rating = excluded.staff_rating,
  communication_rating = excluded.communication_rating,
  food_rating = excluded.food_rating,
  location_rating = excluded.location_rating,
  safety_rating = excluded.safety_rating,
  advice_to_parents_text = excluded.advice_to_parents_text,
  enrollment_years = excluded.enrollment_years,
  is_anonymous = excluded.is_anonymous,
  allow_contact = excluded.allow_contact,
  reviewer_public_name = excluded.reviewer_public_name,
  reviewer_public_email_masked = excluded.reviewer_public_email_masked,
  updated_at = now();
