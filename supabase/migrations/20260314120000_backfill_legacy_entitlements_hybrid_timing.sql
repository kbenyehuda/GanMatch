-- Backfill legacy soft-gate entitlement rows after switching to stage-specific source_ref.
--
-- Problem fixed:
-- 1) Legacy submit grants for gan-data contributions were stored as review_quota (source=bounty).
-- 2) Approval grants used the same source_ref as submit, so full_access insert could be skipped.
--
-- New model:
-- - submit: source_ref "<user_input_id>:submit" (temporary full access)
-- - approval: source_ref "<user_input_id>:approved" (1 year full access)

-- 1) Convert legacy bounty submit rows from quota -> temporary full_access.
update public.user_access_entitlements e
set
  entitlement_type = 'full_access',
  expires_at = coalesce(e.expires_at, e.starts_at + interval '1 day'),
  quota_remaining = null,
  source_ref = case
    when e.source_ref is null then null
    when e.source_ref like '%:submit' or e.source_ref like '%:approved' then e.source_ref
    else e.source_ref || ':submit'
  end,
  metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
    'backfill', 'legacy_bounty_quota_to_submit_full_access',
    'updated_at', now()
  ),
  updated_at = now()
where e.source = 'bounty'
  and e.entitlement_type = 'review_quota';

-- 2) Ensure approved edit contributions have long-term full_access rows.
insert into public.user_access_entitlements (
  user_id,
  entitlement_type,
  source,
  source_ref,
  starts_at,
  expires_at,
  quota_remaining,
  metadata
)
select
  ui.user_id,
  'full_access',
  'bounty',
  ui.id::text || ':approved',
  coalesce(ui.reviewed_at, ui.created_at, now()),
  coalesce(ui.reviewed_at, ui.created_at, now()) + interval '365 days',
  null,
  jsonb_build_object(
    'backfill', 'legacy_missing_approved_grant',
    'input_type', 'edit',
    'user_input_id', ui.id::text,
    'gan_id', ui.gan_id
  )
from public.user_inputs ui
where ui.input_type = 'edit'
  and ui.status = 'approved'
  and ui.user_id is not null
  and not exists (
    select 1
    from public.user_access_entitlements e
    where e.user_id = ui.user_id
      and e.source = 'bounty'
      and e.entitlement_type = 'full_access'
      and (
        e.source_ref = ui.id::text
        or e.source_ref = ui.id::text || ':approved'
      )
  );

-- 3) Ensure approved review contributions have long-term full_access rows.
insert into public.user_access_entitlements (
  user_id,
  entitlement_type,
  source,
  source_ref,
  starts_at,
  expires_at,
  quota_remaining,
  metadata
)
select
  ui.user_id,
  'full_access',
  'review',
  ui.id::text || ':approved',
  coalesce(ui.reviewed_at, ui.created_at, now()),
  coalesce(ui.reviewed_at, ui.created_at, now()) + interval '365 days',
  null,
  jsonb_build_object(
    'backfill', 'legacy_missing_approved_grant',
    'input_type', 'review',
    'user_input_id', ui.id::text,
    'gan_id', ui.gan_id
  )
from public.user_inputs ui
where ui.input_type = 'review'
  and ui.status = 'approved'
  and ui.user_id is not null
  and not exists (
    select 1
    from public.user_access_entitlements e
    where e.user_id = ui.user_id
      and e.source = 'review'
      and e.entitlement_type = 'full_access'
      and (
        e.source_ref = ui.id::text
        or e.source_ref = ui.id::text || ':approved'
      )
  );
