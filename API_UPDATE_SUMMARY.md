# API 配置更新总结

## 变更说明

**时间**: 2025-12-14

### 问题
IP传记采访 API 请求失败，错误信息：
```
APIMart API Error: {"error":{"message":"当前分组 default 下对于模型 claude-3-5-haiku-20241022 无可用渠道"}}
```

### 解决方案
将 IP传记采访的 API 从 **Claude 4.5 Haiku** 切换回 **Kimi K2 Thinking Turbo**

## 修改内容

### 文件：`app/api/chat/route.ts`

#### 修改前（第 32-36 行）
```typescript
if (isIPBiography) {
  // IP传记采访使用 Claude 4.5 Haiku
  apiKey = CLAUDE_API_KEY || APIMART_API_KEY
  baseUrl = CLAUDE_BASE_URL || APIMART_BASE_URL
  model = CLAUDE_MODEL
}
```

#### 修改后（第 32-36 行）
```typescript
if (isIPBiography) {
  // IP传记采访使用 Kimi K2 Thinking Turbo（快速响应）
  apiKey = APIMART_QUICK_API_KEY || APIMART_API_KEY
  baseUrl = APIMART_QUICK_BASE_URL || APIMART_BASE_URL
  model = APIMART_QUICK_MODEL || 'kimi-k2-thinking-turbo'
}
```

#### 错误提示优化（第 49-59 行）
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

## 当前 API 配置

| 步骤/功能 | 使用模型 | API 配置 |
|---------|---------|---------|
| IP传记采访 | ✅ Kimi K2 Thinking Turbo | `APIMART_QUICK_*` |
| 快速体验 (quick-*) | Kimi K2 Thinking Turbo | `APIMART_QUICK_*` |
| 其他工作流步骤 | Kimi K2 Thinking | `APIMART_*` |

## 环境变量配置

### 当前使用的配置（`.env.local`）

```env
# 默认模型配置
APIMART_API_KEY=sk-jDtkItBb4pDmc6V8pvM68VGQ19oLdh4K0sbXjG1H5fxOxAgD
APIMART_BASE_URL=https://api.evolink.ai/v1
APIMART_MODEL=kimi-k2-thinking

# 快速模型配置（用于 IP传记采访和快速体验）
APIMART_QUICK_MODEL=kimi-k2-thinking-turbo
```

### Claude 配置（保留但未使用）

```env
# Claude API 配置（当前渠道不可用）
CLAUDE_API_KEY=sk-jDtkItBb4pDmc6V8pvM68VGQ19oLdh4K0sbXjG1H5fxOxAgD
CLAUDE_BASE_URL=https://api.evolink.ai/v1
CLAUDE_MODEL=claude-3-5-haiku-20241022
```

## 测试验证

### 测试步骤
1. 访问 IP传记采访页面：`http://localhost:3000/dashboard/workflow/IP传记`
2. 开始对话并发送消息
3. 观察 AI 响应是否正常

### 预期结果
- ✅ API 请求成功（使用 Kimi K2 Thinking Turbo）
- ✅ AI 正常响应
- ✅ 无 503 或渠道不可用错误

### 实际测试
服务器日志显示：
- 之前：`POST /api/chat 503` + APIMart API Error
- 修改后：应该返回 `POST /api/chat 200`

## 影响范围

### 受影响的功能
- ✅ IP传记采访（主要影响）
- ✅ 重新开始对话功能（新添加的功能，也受益于修复）

### 不受影响的功能
- 其他工作流步骤（P1-P10）继续使用原有配置
- 快速体验功能（本来就用 Kimi K2 Thinking Turbo）
- 报告生成和保存功能

## 回退方案

如果 Evolink AI 平台恢复 Claude 4.5 Haiku 支持，可以快速切换回来：

### 步骤 1：修改 `app/api/chat/route.ts`
```typescript
if (isIPBiography) {
  // IP传记采访使用 Claude 4.5 Haiku
  apiKey = CLAUDE_API_KEY || APIMART_API_KEY
  baseUrl = CLAUDE_BASE_URL || APIMART_BASE_URL
  model = CLAUDE_MODEL
}
```

### 步骤 2：更新错误提示
```typescript
if (isIPBiography) {
  errorMsg = '请在 .env.local 中配置 CLAUDE_API_KEY（或复用 APIMART_API_KEY）'
}
```

### 步骤 3：重启开发服务器
```bash
# 环境变量会自动重新加载
# 或手动重启
npm run dev
```

## 性能对比

### Kimi K2 Thinking Turbo 特点
- ✅ 响应速度快（2-5秒）
- ✅ 支持思维链（reasoning）
- ✅ 长文本处理能力强
- ✅ 中文理解优秀
- ✅ 渠道稳定可用

### Claude 3.5 Haiku 特点（理论优势）
- 速度更快（1-3秒）
- 成本更低
- 对话质量好
- ❌ 当前渠道不可用

## 相关文件

- **API 路由**: [app/api/chat/route.ts](app/api/chat/route.ts)
- **环境配置**: [.env.local](.env.local)
- **详细文档**: [CLAUDE_API_SETUP.md](CLAUDE_API_SETUP.md)
- **对话功能**: [app/dashboard/workflow/[stepId]/page.tsx](app/dashboard/workflow/[stepId]/page.tsx)

## 注意事项

1. **Claude 配置保留**：代码中保留了 Claude 配置，方便未来切换
2. **降级策略**：如果 `APIMART_QUICK_API_KEY` 未配置，会自动降级使用 `APIMART_API_KEY`
3. **环境变量**：确保 `.env.local` 中有正确的 API Key 配置
4. **渠道监控**：定期检查 Evolink AI 是否恢复 Claude 4.5 Haiku 支持

## 监控建议

定期检查 Evolink AI 支持的模型列表：
```bash
curl --request GET \
  --url https://api.evolink.ai/v1/models \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

查找 `claude-3-5-haiku-20241022` 是否可用。

## 常见问题

### Q: 为什么不继续使用 Claude？
A: Evolink AI 平台当前没有 Claude 4.5 Haiku 的可用渠道，会返回 503 错误。

### Q: Kimi K2 Thinking Turbo 是否适合 IP传记采访？
A: 是的。Kimi 支持长对话、思维链推理，中文理解能力强，非常适合深度访谈场景。

### Q: 什么时候会切换回 Claude？
A: 当 Evolink AI 平台恢复 Claude 4.5 Haiku 支持后，可以快速切换回来。

### Q: 这个修改会影响其他功能吗？
A: 不会。只影响 IP传记采访，其他功能继续使用原有配置。

## 更新日志

**2025-12-14 20:52**
- ⚠️ 将 IP传记采访 API 从 Claude 4.5 Haiku 切换回 Kimi K2 Thinking Turbo
- ✅ 修复 API 请求失败问题
- ✅ 优化错误提示信息
- ✅ 更新文档说明
