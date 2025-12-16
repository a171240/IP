-- 积分系统修复脚本
-- 如果遇到"积分系统尚未初始化"错误，请在 Supabase SQL Editor 中执行此脚本

-- 1. 确保 profiles 表有所需列
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits_balance INT NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits_unlimited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_granted_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_source TEXT;

-- 2. 确保 trial_grants 表存在
CREATE TABLE IF NOT EXISTS public.trial_grants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,
  ip_hash TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_id)
);

ALTER TABLE public.trial_grants ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_trial_grants_ip_hash_created_at ON public.trial_grants(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_trial_grants_user_id ON public.trial_grants(user_id);

-- 3. 确保 credit_transactions 表存在
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  step_id TEXT,
  delta INT NOT NULL,
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at);

-- 4. 创建/更新 grant_trial_credits 函数
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

  -- Lock profile row
  PERFORM 1 FROM public.profiles WHERE id = uid FOR UPDATE;

  -- If already granted, return current status
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND trial_granted_at IS NOT NULL) THEN
    RETURN QUERY
    SELECT false, COALESCE(p.trial_source, 'already_granted'), p.credits_balance, p.credits_unlimited, p.trial_granted_at
    FROM public.profiles p
    WHERE p.id = uid;
    RETURN;
  END IF;

  SELECT p.credits_unlimited INTO unlimited FROM public.profiles p WHERE p.id = uid;
  IF unlimited THEN
    UPDATE public.profiles SET trial_granted_at = NOW(), trial_source = 'unlimited' WHERE id = uid;
    RETURN QUERY
    SELECT true, 'unlimited', p.credits_balance, p.credits_unlimited, p.trial_granted_at
    FROM public.profiles p
    WHERE p.id = uid;
    RETURN;
  END IF;

  -- Count IP grants in last 24h
  IF p_ip_hash IS NOT NULL AND length(trim(p_ip_hash)) > 0 THEN
    SELECT COUNT(*) INTO ip_count
    FROM public.trial_grants
    WHERE ip_hash = p_ip_hash
      AND created_at > NOW() - interval '24 hours';
  END IF;

  -- Claim device
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

  -- Decide grant
  IF device_claimed AND ip_count < 3 THEN
    grant_amount := 30;
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

  UPDATE public.profiles
    SET credits_balance = credits_balance + grant_amount,
        trial_granted_at = NOW(),
        trial_source = source
    WHERE id = uid;

  INSERT INTO public.credit_transactions(user_id, delta, reason, metadata)
    VALUES (uid, grant_amount, 'trial_grant', jsonb_build_object('source', source, 'device_claimed', device_claimed, 'ip_count_24h', ip_count));

  RETURN QUERY
    SELECT (source = 'trial_full'), source, p.credits_balance, p.credits_unlimited, p.trial_granted_at
    FROM public.profiles p
    WHERE p.id = uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. 创建/更新 consume_credits 函数
CREATE OR REPLACE FUNCTION public.consume_credits(p_step_id TEXT, p_amount INT)
RETURNS TABLE(
  credits_balance INT,
  credits_unlimited BOOLEAN
) AS $$
DECLARE
  uid UUID := auth.uid();
  bal INT;
  unlimited BOOLEAN;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT p.credits_balance, p.credits_unlimited INTO bal, unlimited
  FROM public.profiles p
  WHERE p.id = uid
  FOR UPDATE;

  IF unlimited THEN
    RETURN QUERY SELECT bal, unlimited;
    RETURN;
  END IF;

  IF bal < p_amount THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  UPDATE public.profiles
    SET credits_balance = public.profiles.credits_balance - p_amount
    WHERE id = uid
    RETURNING public.profiles.credits_balance, public.profiles.credits_unlimited INTO bal, unlimited;

  INSERT INTO public.credit_transactions(user_id, step_id, delta, reason, metadata)
    VALUES (uid, p_step_id, -p_amount, 'consume', jsonb_build_object('amount', p_amount));

  RETURN QUERY SELECT bal, unlimited;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. 给现有用户设置初始积分（如果还没有）
UPDATE public.profiles
SET credits_balance = 30, trial_granted_at = NOW(), trial_source = 'initial_grant'
WHERE credits_balance = 0 AND trial_granted_at IS NULL;

-- 7. 验证函数是否创建成功
SELECT
  'grant_trial_credits' as function_name,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'grant_trial_credits') as exists
UNION ALL
SELECT
  'consume_credits' as function_name,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'consume_credits') as exists;
