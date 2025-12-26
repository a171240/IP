-- 诊断结果表
-- 用于存储IP内容健康度诊断的结果数据

CREATE TABLE IF NOT EXISTS diagnostic_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 答题数据
  answers JSONB NOT NULL,
  industry VARCHAR(50),

  -- 评分结果
  total_score INTEGER NOT NULL CHECK (total_score >= 0 AND total_score <= 100),
  level VARCHAR(20) NOT NULL CHECK (level IN ('excellent', 'good', 'pass', 'needs_improvement')),
  scores JSONB NOT NULL,

  -- AI生成的建议
  recommendations JSONB DEFAULT '[]'::jsonb,
  action_plan JSONB DEFAULT '[]'::jsonb,

  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),

  -- 可选：用户联系方式（如果收集的话）
  contact_info JSONB DEFAULT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_diagnostic_results_created_at
  ON diagnostic_results(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diagnostic_results_expires_at
  ON diagnostic_results(expires_at);

CREATE INDEX IF NOT EXISTS idx_diagnostic_results_industry
  ON diagnostic_results(industry);

-- 创建过期数据清理函数
CREATE OR REPLACE FUNCTION cleanup_expired_diagnostics()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM diagnostic_results
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 注释：建议通过 pg_cron 或外部定时任务定期调用 cleanup_expired_diagnostics()
-- 例如每天凌晨执行：SELECT cleanup_expired_diagnostics();

-- RLS 策略
-- 由于是匿名诊断，使用简化的公开读取策略
ALTER TABLE diagnostic_results ENABLE ROW LEVEL SECURITY;

-- 允许任何人插入新记录（匿名提交）
CREATE POLICY "Allow anonymous insert" ON diagnostic_results
  FOR INSERT
  WITH CHECK (true);

-- 允许通过ID读取（拥有链接即可查看）
CREATE POLICY "Allow read by id" ON diagnostic_results
  FOR SELECT
  USING (true);

-- 注意：生产环境建议在 API 层实现频率限制（rate limiting）
-- 可以使用 Supabase Edge Functions 或中间件实现
-- 建议限制：每IP每小时最多10次诊断提交

COMMENT ON TABLE diagnostic_results IS 'IP内容健康度诊断结果表';
COMMENT ON COLUMN diagnostic_results.answers IS '用户的答题数据，JSON格式';
COMMENT ON COLUMN diagnostic_results.industry IS '用户选择的行业类型';
COMMENT ON COLUMN diagnostic_results.total_score IS '综合健康度评分(0-100)';
COMMENT ON COLUMN diagnostic_results.level IS '评级：excellent/good/pass/needs_improvement';
COMMENT ON COLUMN diagnostic_results.scores IS '各维度详细得分，JSON格式';
COMMENT ON COLUMN diagnostic_results.recommendations IS 'AI生成的改进建议';
COMMENT ON COLUMN diagnostic_results.action_plan IS '具体行动计划';
COMMENT ON COLUMN diagnostic_results.expires_at IS '数据过期时间，默认30天后';
