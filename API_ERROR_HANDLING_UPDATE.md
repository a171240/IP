# API 错误处理优化

**更新时间**: 2025-12-14

## 问题描述

用户在使用 **P4（IP概念生成）** 步骤时遇到 API 请求失败，错误信息为：

```
API 请求失败: 500
```

### 服务器日志错误
```
POST /api/chat 500 in 14.4s
APIMart API Error: {"error":{"message":"do request failed: Post \"https://api.moonshot.cn/v1/chat/completions\": net/http: TLS handshake timeout","type":"do_request_failed"}}
```

### 根本原因
- **网络超时**: Moonshot（Kimi）API 的 TLS 握手超时
- **无超时控制**: 原代码没有设置请求超时
- **错误信息不友好**: 用户只看到 "API 请求失败: 500"，无法理解具体原因

## 解决方案

### 1. 添加请求超时控制

**修改文件**: `app/api/chat/route.ts` (行 119-152)

**添加内容**:
```typescript
// 添加超时控制（60秒）
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 60000)

try {
  var response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 8000,
      stream: true
    }),
    signal: controller.signal  // 关联超时控制器
  })
} catch (fetchError: any) {
  clearTimeout(timeoutId)
  if (fetchError.name === 'AbortError') {
    console.error('API request timeout after 60s')
    return new Response(
      JSON.stringify({ error: 'API 请求超时，请稍后重试' }),
      { status: 504, headers: { 'Content-Type': 'application/json' } }
    )
  }
  throw fetchError
} finally {
  clearTimeout(timeoutId)
}
```

**工作原理**:
1. 创建 `AbortController` 控制请求生命周期
2. 设置 60 秒定时器，超时后自动中止请求
3. 捕获 `AbortError` 并返回友好的超时错误信息
4. 确保定时器被正确清理（finally 块）

### 2. 改进错误信息处理

**修改文件**: `app/api/chat/route.ts` (行 154-180)

**添加内容**:
```typescript
if (!response.ok) {
  const errorText = await response.text()
  console.error('APIMart API Error:', errorText)

  // 解析错误信息
  let errorMessage = `API 请求失败 (${response.status})`
  try {
    const errorJson = JSON.parse(errorText)
    if (errorJson.error?.message) {
      errorMessage = errorJson.error.message
    }
  } catch {
    // 忽略JSON解析错误
  }

  // 针对特定错误提供友好提示
  if (errorMessage.includes('TLS handshake timeout') || errorMessage.includes('timeout')) {
    errorMessage = 'API 服务响应超时，请稍后重试'
  } else if (errorMessage.includes('无可用渠道')) {
    errorMessage = 'API 模型暂时不可用，请稍后重试'
  }

  return new Response(
    JSON.stringify({ error: errorMessage }),
    { status: response.status, headers: { 'Content-Type': 'application/json' } }
  )
}
```

**改进点**:
1. **解析详细错误**: 尝试从 API 响应中提取错误信息
2. **友好错误提示**: 将技术错误转换为用户可理解的描述
3. **特定错误处理**: 针对常见错误提供定制化提示

## 错误信息对比

### 修改前
```
API 请求失败: 500
```

### 修改后
```
API 服务响应超时，请稍后重试
```
或
```
API 模型暂时不可用，请稍后重试
```
或（超过60秒）
```
API 请求超时，请稍后重试
```

## 技术细节

### AbortController 使用

**作用**: 允许在需要时中止 fetch 请求

**实现**:
```javascript
const controller = new AbortController()
fetch(url, { signal: controller.signal })
controller.abort()  // 中止请求
```

**超时实现**:
```javascript
const timeoutId = setTimeout(() => controller.abort(), 60000)
```

### 错误类型识别

**AbortError**:
- 由 `controller.abort()` 触发
- `fetchError.name === 'AbortError'`

**网络错误**:
- TLS handshake timeout
- Connection refused
- DNS resolution failed

## 受影响的功能

### 所有工作流步骤
- ✅ P1: 行业目标分析
- ✅ P2: 行业认知深度
- ✅ P3: 情绪价值分析
- ✅ **P4: IP概念生成** (此次问题步骤)
- ✅ P5: IP文风设定
- ✅ P6: 4X4内容规划
- ✅ P7-P10: 内容生产步骤
- ✅ IP传记采访
- ✅ 快速体验功能

### 改进效果
1. **更可靠**: 60秒超时避免无限等待
2. **更友好**: 清晰的错误提示帮助用户理解问题
3. **更易调试**: 服务器日志记录详细错误信息

## 网络超时原因分析

### 可能的原因

1. **API 服务器负载高**
   - Moonshot API 暂时响应慢
   - 并发请求过多

2. **网络连接不稳定**
   - 国内访问国际 API 可能有延迟
   - ISP 网络波动

3. **请求内容过大**
   - 长对话历史
   - 复杂的提示词

4. **TLS 握手问题**
   - SSL/TLS 证书验证慢
   - 加密协商耗时

### 缓解措施

1. **超时控制** ✅ 已实现
   - 60秒超时限制
   - 自动中止失败请求

2. **错误提示** ✅ 已实现
   - 友好的用户提示
   - 引导重试操作

3. **未来优化建议**
   - 实现自动重试机制（最多3次）
   - 添加请求队列和限流
   - 考虑使用 CDN 或国内代理

## 测试建议

### 正常场景测试
1. 访问 P4（IP概念生成）步骤
2. 输入基本信息并开始对话
3. 观察 AI 响应是否正常

### 超时场景测试
1. 模拟网络延迟（开发者工具 → 网络 → 慢速3G）
2. 等待超过 60 秒
3. 应该看到 "API 请求超时，请稍后重试" 提示

### 错误恢复测试
1. 遇到超时错误后
2. 刷新页面或重新发送消息
3. 验证对话历史是否保留

## 监控建议

### 服务器日志关注点
```bash
# 超时错误
API request timeout after 60s

# TLS 握手超时
TLS handshake timeout

# 模型不可用
无可用渠道
```

### 告警阈值
- **超时率 > 10%**: 检查网络或 API 服务状态
- **连续3次超时**: 考虑切换备用 API
- **特定步骤频繁超时**: 检查该步骤的提示词长度

## 相关文档

- **API 配置**: [API_UPDATE_SUMMARY.md](API_UPDATE_SUMMARY.md)
- **Claude API**: [CLAUDE_API_SETUP.md](CLAUDE_API_SETUP.md)
- **品牌更新**: [BRAND_UPDATE_SUMMARY.md](BRAND_UPDATE_SUMMARY.md)

## 更新日志

**2025-12-14**
- ✅ 添加 60 秒请求超时控制
- ✅ 改进错误信息解析和提示
- ✅ 针对常见错误提供友好提示
- ✅ 确保超时控制器正确清理
- ✅ 创建详细文档说明

## 后续优化建议

### 短期优化
1. **添加重试机制**
   ```typescript
   for (let attempt = 0; attempt < 3; attempt++) {
     try {
       const response = await fetchWithTimeout(...)
       return response
     } catch (error) {
       if (attempt === 2) throw error
       await sleep(1000 * (attempt + 1))  // 指数退避
     }
   }
   ```

2. **添加请求缓存**
   - 缓存相同输入的响应
   - 减少不必要的 API 调用

### 长期优化
1. **负载均衡**
   - 配置多个 API Key
   - 自动切换失败的端点

2. **降级策略**
   - 主 API 失败时切换到备用 API
   - 提供简化版响应

3. **性能监控**
   - 记录每个请求的响应时间
   - 生成性能报告

## 注意事项

1. **超时时间设置**: 60 秒是基于 Kimi API 的平均响应时间设置的，可根据实际情况调整
2. **AbortController 兼容性**: 现代浏览器和 Node.js 18+ 都支持
3. **错误信息**: 保持中文，用户体验友好
4. **日志记录**: 服务器端记录详细错误信息便于调试
