-- 添加 AI 报告字段
-- 用于缓存 AI 生成的深度分析报告，避免重复生成

ALTER TABLE diagnostic_results
ADD COLUMN IF NOT EXISTS ai_report JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMPTZ DEFAULT NULL;

-- 添加注释
COMMENT ON COLUMN diagnostic_results.ai_report IS 'AI生成的深度分析报告（缓存）';
COMMENT ON COLUMN diagnostic_results.ai_generated_at IS 'AI报告生成时间';

-- 创建索引（可选，用于查询有AI报告的记录）
CREATE INDEX IF NOT EXISTS idx_diagnostic_results_ai_generated
  ON diagnostic_results(ai_generated_at)
  WHERE ai_generated_at IS NOT NULL;
