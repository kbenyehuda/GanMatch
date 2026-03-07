-- Replace suggest_gan: insert into user_inputs only (gan_id=null).
-- Python script will create ganim_v2 when appropriate.

CREATE OR REPLACE FUNCTION public.suggest_gan(
  p_name_he TEXT,
  p_lon DOUBLE PRECISION,
  p_lat DOUBLE PRECISION,
  p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID;
  v_input_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.user_inputs (
    user_id,
    gan_id,
    is_new_gan,
    input_type,
    name_he,
    address,
    city,
    lat,
    lon,
    has_cctv,
    cctv_streamed_online,
    metadata,
    parent_in_gan
  ) VALUES (
    v_uid,
    NULL,
    TRUE,
    'suggest_gan'::public.user_input_type,
    p_name_he,
    p_address,
    p_city,
    p_lat,
    p_lon,
    (p_metadata->>'cctv_access') IN ('online', 'exceptional'),
    CASE
      WHEN (p_metadata->>'cctv_access') = 'online' THEN TRUE
      WHEN (p_metadata->>'cctv_access') = 'exceptional' THEN FALSE
      ELSE NULL
    END,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'user_suggestion'),
    TRUE
  )
  RETURNING id INTO v_input_id;

  RETURN v_input_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_gan(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_gan(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
