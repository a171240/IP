-- 微信支付 Native 订单表
-- 在 Supabase 的 SQL Editor 执行本文件

CREATE TABLE IF NOT EXISTS public.wechatpay_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  out_trade_no TEXT NOT NULL UNIQUE,
  client_secret TEXT NOT NULL,
  idempotency_key TEXT,
  description TEXT NOT NULL,
  amount_total INT NOT NULL CHECK (amount_total > 0),
  currency TEXT NOT NULL DEFAULT 'CNY',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'closed', 'failed')),
  code_url TEXT,
  wx_transaction_id TEXT,
  paid_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  raw_notify JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  origin TEXT,
  -- 权限开通相关字段
  product_id TEXT,
  grant_status TEXT DEFAULT 'pending' CHECK (grant_status IN ('pending', 'granting', 'granted', 'failed')),
  grant_attempts INT DEFAULT 0,
  granted_at TIMESTAMPTZ,
  grant_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wechatpay_orders ENABLE ROW LEVEL SECURITY;

-- 登录用户只能查询自己的订单；未登录用户通过后端接口（带 client_secret）查询
DROP POLICY IF EXISTS "Users can select own wechatpay_orders" ON public.wechatpay_orders;
CREATE POLICY "Users can select own wechatpay_orders" ON public.wechatpay_orders
  FOR SELECT USING (auth.uid() = user_id);

-- 通常订单由服务端使用 service_role 写入；此策略仅用于兼容需要用户直写的场景
DROP POLICY IF EXISTS "Users can insert own wechatpay_orders" ON public.wechatpay_orders;
CREATE POLICY "Users can insert own wechatpay_orders" ON public.wechatpay_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_wechatpay_orders_user_id ON public.wechatpay_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_wechatpay_orders_status_created_at ON public.wechatpay_orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_wechatpay_orders_out_trade_no_secret ON public.wechatpay_orders(out_trade_no, client_secret);
CREATE INDEX IF NOT EXISTS idx_wechatpay_orders_product_id ON public.wechatpay_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_wechatpay_orders_grant_status ON public.wechatpay_orders(grant_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wechatpay_orders_idempotency_key ON public.wechatpay_orders(idempotency_key);

DROP TRIGGER IF EXISTS update_wechatpay_orders_updated_at ON public.wechatpay_orders;
CREATE TRIGGER update_wechatpay_orders_updated_at
  BEFORE UPDATE ON public.wechatpay_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 数据库迁移脚本（已有表时执行）
-- =============================================================================
-- 如果表已存在，需要单独执行以下 ALTER 语句添加新字段：
--
-- ALTER TABLE public.wechatpay_orders ADD COLUMN IF NOT EXISTS product_id TEXT;
-- ALTER TABLE public.wechatpay_orders ADD COLUMN IF NOT EXISTS grant_status TEXT DEFAULT 'pending';
-- ALTER TABLE public.wechatpay_orders ADD COLUMN IF NOT EXISTS grant_attempts INT DEFAULT 0;
-- ALTER TABLE public.wechatpay_orders ADD COLUMN IF NOT EXISTS granted_at TIMESTAMPTZ;
-- ALTER TABLE public.wechatpay_orders ADD COLUMN IF NOT EXISTS grant_error TEXT;
-- ALTER TABLE public.wechatpay_orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
-- ALTER TABLE public.wechatpay_orders ADD COLUMN IF NOT EXISTS ip_address TEXT;
-- ALTER TABLE public.wechatpay_orders ADD COLUMN IF NOT EXISTS user_agent TEXT;
-- ALTER TABLE public.wechatpay_orders ADD COLUMN IF NOT EXISTS origin TEXT;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_wechatpay_orders_idempotency_key ON public.wechatpay_orders(idempotency_key);
--
-- 注意：Supabase 的 ADD COLUMN IF NOT EXISTS 可能需要先检查版本支持
-- 如果不支持，可以使用以下方式：
--
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wechatpay_orders' AND column_name='product_id') THEN
--     ALTER TABLE public.wechatpay_orders ADD COLUMN product_id TEXT;
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wechatpay_orders' AND column_name='grant_status') THEN
--     ALTER TABLE public.wechatpay_orders ADD COLUMN grant_status TEXT DEFAULT 'pending';
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wechatpay_orders' AND column_name='grant_attempts') THEN
--     ALTER TABLE public.wechatpay_orders ADD COLUMN grant_attempts INT DEFAULT 0;
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wechatpay_orders' AND column_name='granted_at') THEN
--     ALTER TABLE public.wechatpay_orders ADD COLUMN granted_at TIMESTAMPTZ;
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wechatpay_orders' AND column_name='grant_error') THEN
--     ALTER TABLE public.wechatpay_orders ADD COLUMN grant_error TEXT;
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wechatpay_orders' AND column_name='idempotency_key') THEN
--     ALTER TABLE public.wechatpay_orders ADD COLUMN idempotency_key TEXT;
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wechatpay_orders' AND column_name='ip_address') THEN
--     ALTER TABLE public.wechatpay_orders ADD COLUMN ip_address TEXT;
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wechatpay_orders' AND column_name='user_agent') THEN
--     ALTER TABLE public.wechatpay_orders ADD COLUMN user_agent TEXT;
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wechatpay_orders' AND column_name='origin') THEN
--     ALTER TABLE public.wechatpay_orders ADD COLUMN origin TEXT;
--   END IF;
-- END $$;
