-- IP内容工厂 数据库结构
-- 在 Supabase SQL Editor 中执行此文件

-- ============================================
-- 1. 用户档案表 (扩展 Supabase Auth)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  nickname TEXT,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'pro', 'vip')),
  credits_balance INT NOT NULL DEFAULT 0,
  credits_unlimited BOOLEAN NOT NULL DEFAULT false,
  trial_granted_at TIMESTAMPTZ,
  trial_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的档案
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);


-- ============================================
-- NOTE: comment removed (encoding)
-- ============================================
-- NOTE: comment removed (encoding)
-- NOTE: comment removed (encoding)
-- NOTE: comment removed (encoding)
-- NOTE: comment removed (encoding)

-- NOTE: comment removed (encoding)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits_balance INT NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits_unlimited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_granted_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_source TEXT;

-- NOTE: comment removed (encoding)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- NOTE: comment removed (encoding)
CREATE OR REPLACE FUNCTION public.update_profile_public(p_nickname TEXT, p_avatar_url TEXT)
RETURNS public.profiles AS $$
DECLARE
  uid UUID := auth.uid();
  updated public.profiles;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
  SET nickname = COALESCE(p_nickname, nickname),
      avatar_url = COALESCE(p_avatar_url, avatar_url)
  WHERE id = uid
  RETURNING * INTO updated;

  RETURN updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- NOTE: comment removed (encoding)
CREATE TABLE IF NOT EXISTS public.trial_grants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,
  ip_hash TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_id)
);

ALTER TABLE public.trial_grants ENABLE ROW LEVEL SECURITY;
-- NOTE: comment removed (encoding)

CREATE INDEX IF NOT EXISTS idx_trial_grants_ip_hash_created_at ON public.trial_grants(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_trial_grants_user_id ON public.trial_grants(user_id);

-- NOTE: comment removed (encoding)
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
-- NOTE: comment removed (encoding)

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at);

-- NOTE: comment removed (encoding)
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

-- NOTE: comment removed (encoding)
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
    SET credits_balance = credits_balance - p_amount
    WHERE id = uid
    RETURNING credits_balance, credits_unlimited INTO bal, unlimited;

  INSERT INTO public.credit_transactions(user_id, step_id, delta, reason, metadata)
    VALUES (uid, p_step_id, -p_amount, 'consume', jsonb_build_object('amount', p_amount));

  RETURN QUERY SELECT bal, unlimited;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 创建触发器：新用户注册时自动创建档案
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nickname)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nickname', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 删除旧触发器（如果存在）并创建新触发器
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. IP项目表
-- ============================================
CREATE TABLE IF NOT EXISTS public.ip_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  industry TEXT,
  target_audience TEXT,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE public.ip_projects ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的项目
DROP POLICY IF EXISTS "Users can CRUD own projects" ON public.ip_projects;

CREATE POLICY "Users can CRUD own projects" ON public.ip_projects
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 3. 对话记录表
-- ============================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.ip_projects(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,  -- P1, P2, P3, IP传记 等
  step_title TEXT,
  messages JSONB DEFAULT '[]'::jsonb,  -- [{role, content, reasoning?, timestamp}]
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的对话
DROP POLICY IF EXISTS "Users can CRUD own conversations" ON public.conversations;

CREATE POLICY "Users can CRUD own conversations" ON public.conversations
  FOR ALL USING (auth.uid() = user_id);

-- 创建索引提升查询性能
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_step_id ON public.conversations(step_id);
CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON public.conversations(project_id);

-- ============================================
-- 4. 生成报告表
-- ============================================
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.ip_projects(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  step_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,  -- Markdown 格式的报告内容
  summary TEXT,  -- 报告摘要
  metadata JSONB DEFAULT '{}'::jsonb,  -- 额外元数据
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的报告
DROP POLICY IF EXISTS "Users can CRUD own reports" ON public.reports;

CREATE POLICY "Users can CRUD own reports" ON public.reports
  FOR ALL USING (auth.uid() = user_id);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_step_id ON public.reports(step_id);
CREATE INDEX IF NOT EXISTS idx_reports_project_id ON public.reports(project_id);

-- ============================================
-- 5. 知识库文档表 (存储各步骤生成的核心文档)
-- ============================================
CREATE TABLE IF NOT EXISTS public.knowledge_docs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.ip_projects(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,  -- industry-analysis, depth-analysis, emotion-map, ip-biography 等
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  generated_by TEXT NOT NULL,  -- 哪个步骤生成的 (P1, P2, P3, IP传记 等)
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,  -- 当前激活版本
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE public.knowledge_docs ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的知识库文档
DROP POLICY IF EXISTS "Users can CRUD own knowledge_docs" ON public.knowledge_docs;

CREATE POLICY "Users can CRUD own knowledge_docs" ON public.knowledge_docs
  FOR ALL USING (auth.uid() = user_id);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_user_id ON public.knowledge_docs(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_doc_type ON public.knowledge_docs(doc_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_project_id ON public.knowledge_docs(project_id);

-- ============================================
-- 6. 工作流进度表
-- ============================================
CREATE TABLE IF NOT EXISTS public.workflow_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.ip_projects(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, project_id, step_id)
);

-- 启用 RLS
ALTER TABLE public.workflow_progress ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的进度
DROP POLICY IF EXISTS "Users can CRUD own progress" ON public.workflow_progress;

CREATE POLICY "Users can CRUD own progress" ON public.workflow_progress
  FOR ALL USING (auth.uid() = user_id);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_workflow_progress_user_id ON public.workflow_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_progress_project_id ON public.workflow_progress(project_id);

-- ============================================
-- 更新时间触发器
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为所有表添加更新时间触发器
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ip_projects_updated_at ON public.ip_projects;

CREATE TRIGGER update_ip_projects_updated_at
  BEFORE UPDATE ON public.ip_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.conversations;

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reports_updated_at ON public.reports;

CREATE TRIGGER update_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_knowledge_docs_updated_at ON public.knowledge_docs;

CREATE TRIGGER update_knowledge_docs_updated_at
  BEFORE UPDATE ON public.knowledge_docs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_progress_updated_at ON public.workflow_progress;

CREATE TRIGGER update_workflow_progress_updated_at
  BEFORE UPDATE ON public.workflow_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
