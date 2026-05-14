CREATE OR REPLACE FUNCTION public.grant_trial_credits(p_device_id TEXT, p_ip_hash TEXT)
RETURNS TABLE(
  granted_full BOOLEAN,
  trial_source TEXT,
  credits_balance INT,
  credits_unlimited BOOLEAN,
  trial_granted_at TIMESTAMPTZ
) AS $$
DECLARE
  uid UUID := auth.uid();
  ip_count INT := 0;
  device_claimed BOOLEAN := false;
  grant_amount INT := 0;
  unlimited BOOLEAN := false;
  source TEXT := 'trial_none';
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = uid FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.trial_granted_at IS NOT NULL) THEN
    RETURN QUERY
    SELECT false, COALESCE(p.trial_source, 'already_granted'), p.credits_balance, p.credits_unlimited, p.trial_granted_at
    FROM public.profiles p
    WHERE p.id = uid;
    RETURN;
  END IF;

  SELECT p.credits_unlimited INTO unlimited FROM public.profiles p WHERE p.id = uid;
  IF unlimited THEN
    UPDATE public.profiles AS p
      SET trial_granted_at = NOW(),
          trial_source = 'unlimited'
      WHERE p.id = uid;
    RETURN QUERY
    SELECT true, 'unlimited', p.credits_balance, p.credits_unlimited, p.trial_granted_at
    FROM public.profiles p
    WHERE p.id = uid;
    RETURN;
  END IF;

  IF p_ip_hash IS NOT NULL AND length(trim(p_ip_hash)) > 0 THEN
    SELECT COUNT(*) INTO ip_count
    FROM public.trial_grants
    WHERE ip_hash = p_ip_hash
      AND created_at > NOW() - interval '24 hours';
  END IF;

  IF p_device_id IS NOT NULL AND length(trim(p_device_id)) >= 8 AND length(p_device_id) <= 128 THEN
    BEGIN
      INSERT INTO public.trial_grants(device_id, ip_hash, user_id)
      VALUES (p_device_id, p_ip_hash, uid);
      device_claimed := true;
    EXCEPTION WHEN unique_violation THEN
      device_claimed := false;
    END;
  ELSE
    RAISE EXCEPTION 'device_id_required';
  END IF;

  IF device_claimed AND ip_count < 3 THEN
    grant_amount := 20;
    source := 'trial_full';
  ELSIF NOT device_claimed THEN
    grant_amount := 0;
    source := 'trial_device_used';
  ELSIF ip_count >= 3 THEN
    grant_amount := 0;
    source := 'trial_ip_throttled';
  ELSE
    grant_amount := 0;
    source := 'trial_limited';
  END IF;

  UPDATE public.profiles AS p
    SET credits_balance = p.credits_balance + grant_amount,
        trial_granted_at = NOW(),
        trial_source = source
    WHERE p.id = uid;

  INSERT INTO public.credit_transactions(user_id, delta, reason, metadata)
    VALUES (uid, grant_amount, 'trial_grant', jsonb_build_object('source', source, 'device_claimed', device_claimed, 'ip_count_24h', ip_count));

  RETURN QUERY
    SELECT (source = 'trial_full'), source, p.credits_balance, p.credits_unlimited, p.trial_granted_at
    FROM public.profiles p
    WHERE p.id = uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
