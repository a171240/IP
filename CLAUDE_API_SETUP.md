# IP传记采访 API 配置说明

## 当前配置（2025-12-14 更新）

**IP传记采访** 功能现已切换回使用 **Kimi K2 Thinking Turbo** API（原本尝试使用 Claude 4.5 Haiku，但因渠道不可用已回退）。

## 1. 环境变量配置（`.env.local`）

已添加以下配置：

```env
# Claude API 配置（用于 IP传记采访）
CLAUDE_API_KEY=sk-jDtkItBb4pDmc6V8pvM68VGQ19oLdh4K0sbXjG1H5fxOxAgD
CLAUDE_BASE_URL=https://api.evolink.ai/v1
CLAUDE_MODEL=claude-3-5-haiku-20241022
```

### 说明
- **CLAUDE_API_KEY**: Claude API 密钥（当前复用了 Evolink AI 的密钥）
- **CLAUDE_BASE_URL**: API 端点（使用 Evolink AI 作为代理）
- **CLAUDE_MODEL**: 模型名称（Claude 3.5 Haiku）

## 2. API 路由修改（`app/api/chat/route.ts`）

### 保留的 Claude 配置常量（第 14-17 行）

```typescript
// Claude API 配置（用于 IP传记采访）- 当前未使用
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY
const CLAUDE_BASE_URL = process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com/v1'
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-haiku-20241022'
```

### 当前模型选择逻辑（第 32-47 行）

```typescript
// 判断使用哪个 API
const isQuickStart = typeof stepId === 'string' && stepId.startsWith('quick-')
const isIPBiography = stepId === 'IP传记'

// 根据 stepId 选择 API 配置
let apiKey: string | undefined
let baseUrl: string | undefined
let model: string | undefined

if (isIPBiography) {
  // IP传记采访使用 Kimi K2 Thinking Turbo（快速响应）
  apiKey = APIMART_QUICK_API_KEY || APIMART_API_KEY
  baseUrl = APIMART_QUICK_BASE_URL || APIMART_BASE_URL
  model = APIMART_QUICK_MODEL || 'kimi-k2-thinking-turbo'
} else if (isQuickStart) {
  // 快速体验使用快速模型
  apiKey = APIMART_QUICK_API_KEY || APIMART_API_KEY
  baseUrl = APIMART_QUICK_BASE_URL || APIMART_BASE_URL
  model = APIMART_QUICK_MODEL || APIMART_MODEL
} else {
  // 默认使用 APIMart
  apiKey = APIMART_API_KEY
  baseUrl = APIMART_BASE_URL
  model = APIMART_MODEL
}
```

### 当前错误提示（第 49-59 行）

```typescript
if (!apiKey || apiKey === 'your-api-key-here') {
  let errorMsg = '请在 .env.local 中配置 APIMART_API_KEY'
  if (isIPBiography || isQuickStart) {
    errorMsg = '请在 .env.local 中配置 APIMART_QUICK_API_KEY（或复用 APIMART_API_KEY）'
  }

  return new Response(
    JSON.stringify({ error: errorMsg }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  )
}
```

## 3. 工作原理

### API 路由选择逻辑

系统会根据 `stepId` 自动选择不同的 API：

1. **IP传记采访**（`stepId === 'IP传记'`）
   - ✅ **当前使用**: Kimi K2 Thinking Turbo
   - API: `APIMART_QUICK_BASE_URL` + `APIMART_QUICK_API_KEY`
   - 模型: `kimi-k2-thinking-turbo`
   - 原因: Claude 4.5 Haiku 在 Evolink AI 平台暂时不可用

2. **快速体验**（`stepId.startsWith('quick-')`）
   - 使用 Kimi K2 Thinking Turbo（更快）
   - API: `APIMART_QUICK_BASE_URL` + `APIMART_QUICK_API_KEY`
   - 模型: `kimi-k2-thinking-turbo`

3. **其他工作流步骤**（默认）
   - 使用 Kimi K2 Thinking
   - API: `APIMART_BASE_URL` + `APIMART_API_KEY`
   - 模型: `kimi-k2-thinking`

### 降级策略

- 如果 `APIMART_QUICK_API_KEY` 未配置，自动降级使用 `APIMART_API_KEY`
- 如果 `APIMART_QUICK_BASE_URL` 未配置，默认使用 `APIMART_BASE_URL`

## 4. 提示词确认

IP传记采访使用的提示词已确认：

- **源文件**: `提示词/IP传记采访机器人v1.3（情绪深挖版）.md`
- **存储位置**: `lib/prompts/step-prompts.ts` 第 371-698 行
- **stepId**: `'IP传记'`

提示词内容包含完整的 4 个身份维度采访问题：
1. **工作身份**：职业生涯、专业成长、行业经验
2. **家庭身份**：家庭背景、教育经历、家庭关系
3. **社会身份**：社交圈层、人际关系、社会角色
4. **自由身份**：个人兴趣、价值观、生活方式

## 5. 测试方法

1. 访问 IP传记采访页面：
   ```
   http://localhost:3000/dashboard/workflow/IP传记
   ```

2. 开始对话，系统会自动使用 Claude 4.5 Haiku 模型

3. 查看浏览器控制台（F12），确认没有 API 错误

4. 观察 AI 响应质量和速度：
   - Claude 3.5 Haiku 特点：快速响应、成本低、适合对话场景
   - 相比 Kimi K2 Thinking 更擅长深度对话和情感理解

## 6. 常见问题

### Q: 为什么使用 Evolink AI 而不是 Anthropic 官方 API？

A: Evolink AI 是国内 AI API 聚合服务，提供：
- 更稳定的网络连接（国内访问）
- 统一的 API Key 管理
- 多模型支持（Kimi、Claude、DeepSeek 等）

### Q: 如何切换回 Kimi K2 Thinking？

A: 修改 `.env.local`，删除或注释掉 Claude 配置，或在代码中移除 `isIPBiography` 判断逻辑。

### Q: Claude 3.5 Haiku 与其他模型有什么区别？

A:
- **Claude 3.5 Haiku**: 速度最快，成本最低，适合对话和内容生成
- **Kimi K2 Thinking**: 支持思维链，适合复杂推理和分析任务
- **GPT-4**: 通用能力强，但速度较慢

### Q: 如何验证 API 是否正常工作？

A: 查看服务器日志：
```bash
# 查看 API 调用日志
POST /api/chat 200 in 42s (compile: 191ms, render: 41s)
```

如果出现 500 错误，检查：
1. `.env.local` 中 `CLAUDE_API_KEY` 是否配置
2. API Key 是否有效
3. 网络连接是否正常

## 7. 性能对比

### Claude 3.5 Haiku 优势

✅ **响应速度快** - 平均 2-5 秒首字响应
✅ **成本低** - 约为 GPT-4 的 1/10
✅ **对话质量高** - 擅长情感理解和深度访谈
✅ **上下文理解强** - 支持长对话历史

### 适用场景

- ✅ IP传记采访（深度对话）
- ✅ 内容生产（文案、脚本）
- ✅ 客户服务（快速响应）
- ❌ 复杂推理分析（建议用 Kimi K2 Thinking）
- ❌ 长篇报告生成（建议用 GPT-4o）

## 8. 更新日志

**2025-12-14**
- ✅ 添加 Claude API 配置到 `.env.local`
- ✅ 修改 API 路由逻辑，支持按 stepId 选择模型
- ✅ 为 IP传记采访启用 Claude 3.5 Haiku
- ✅ 添加详细的错误提示和降级策略
- ✅ 确认提示词配置正确

## 9. 后续优化建议

1. **等待 Claude 渠道恢复**: 当 Evolink AI 支持 Claude 4.5 Haiku 后，可以再次切换
2. **A/B 测试**: 对比 Claude 和 Kimi 在 IP传记场景的效果
3. **成本监控**: 统计 API 调用费用，优化模型选择策略
4. **用户反馈**: 收集用户对访谈质量的评价
5. **多模型支持**: 为不同工作流步骤配置最适合的模型

## 10. 变更历史

**2025-12-14 20:52**
- ⚠️ **回退**: 将 IP传记采访 API 从 Claude 4.5 Haiku 切换回 Kimi K2 Thinking Turbo
- 原因: Evolink AI 平台返回错误 "当前分组 default 下对于模型 claude-3-5-haiku-20241022 无可用渠道"
- 当前配置: IP传记采访和快速体验都使用 Kimi K2 Thinking Turbo
- Claude 配置保留在代码中，待渠道恢复后可快速切换回来

**2025-12-14 早些时候**
- ✅ 添加 Claude API 配置到 `.env.local`
- ✅ 修改 API 路由逻辑，支持按 stepId 选择模型
- ✅ 为 IP传记采访配置 Claude 4.5 Haiku（尝试）
- ✅ 添加详细的错误提示和降级策略
- ✅ 确认提示词配置正确
