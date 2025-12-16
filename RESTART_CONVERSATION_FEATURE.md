# 重新开始对话功能说明

## 功能概述

为所有工作流步骤（包括 IP传记采访）添加了"重新开始对话"功能，允许用户在对话过程中清空当前对话并重新开始，而不会丢失之前的对话记录。

## 修改内容

### 文件：`app/dashboard/workflow/[stepId]/page.tsx`

#### 1. 新增函数：`handleRestartConversation`（第 1481-1519 行）

```typescript
// 重新开始对话
const handleRestartConversation = async () => {
  if (!window.confirm('确定要重新开始对话吗？当前对话记录将被保存，但会开始新的对话流程。')) {
    return
  }

  try {
    // 如果有当前对话，先完成它
    if (currentConversation) {
      await completeConversation(currentConversation.id)
    }

    // 创建新对话
    const newConversation = await createConversation(step.id, step.title)
    if (newConversation) {
      setCurrentConversation(newConversation)
    }

    // 重置状态
    setMessages([{
      id: "initial",
      role: "assistant",
      content: step.initialPrompt,
      timestamp: new Date()
    }])
    setGeneratedDoc(null)
    setConversationProgress(0)
    setCanGenerateReport(false)
    setIsSaved(false)
    setCanvasStreamContent("")

    // 清空输入框
    setInputValue("")

  } catch (error) {
    console.error('Failed to restart conversation:', error)
    alert('重新开始对话失败，请刷新页面重试')
  }
}
```

**功能说明**：
1. **确认对话框**：防止用户误操作
2. **保存旧对话**：调用 `completeConversation` 标记当前对话为已完成
3. **创建新对话**：在数据库中创建新的对话记录
4. **重置所有状态**：
   - 清空消息历史（只保留开场白）
   - 清空生成的报告
   - 重置进度为 0%
   - 重置所有标志位
5. **错误处理**：捕获异常并提示用户

#### 2. UI 组件：添加重新开始按钮（第 1960-1969 行）

```typescript
{/* 重新开始对话按钮 */}
{messages.length > 1 && (
  <button
    onClick={handleRestartConversation}
    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border dark:border-amber-500/30 border-amber-400/30 dark:bg-amber-500/5 bg-amber-50 text-amber-500 text-sm dark:hover:bg-amber-500/10 hover:bg-amber-100 transition-colors"
  >
    <RefreshCw size={14} />
    重新开始对话
  </button>
)}
```

**位置**：位于右侧面板，在"快捷回复"卡片下方、"返回工作流"按钮上方

**显示条件**：`messages.length > 1`（即有用户消息时才显示）

**样式特点**：
- 琥珀色主题（amber-500），表示警告/重置操作
- 带有刷新图标（RefreshCw）
- 悬停效果增强视觉反馈

## 使用场景

1. **IP传记采访中途想重新开始**
   - 用户回答了一些问题后，发现回答方向不对
   - 想重新组织思路，从头开始对话

2. **测试和调试**
   - 开发者测试对话流程
   - 快速清空对话重新测试

3. **多次尝试不同角度**
   - 尝试不同的回答方式
   - 对比不同对话路径的结果

## 数据安全保障

### 1. 对话记录保存
- 旧对话会被标记为 `completed` 状态，不会被删除
- 可以在数据库中查询历史对话记录
- 支持恢复或查看历史对话

### 2. 确认机制
```javascript
if (!window.confirm('确定要重新开始对话吗？当前对话记录将被保存，但会开始新的对话流程。'))
```
- 用户必须确认才能执行重置
- 明确告知用户操作后果

### 3. 错误处理
```javascript
try {
  // ... 重置逻辑
} catch (error) {
  console.error('Failed to restart conversation:', error)
  alert('重新开始对话失败，请刷新页面重试')
}
```
- 捕获所有可能的错误
- 友好的错误提示
- 建议用户刷新页面恢复

## 用户体验优化

### 1. 按钮只在有对话时显示
```typescript
{messages.length > 1 && (
  <button ... />
)}
```
- 对话刚开始时不显示按钮（避免混淆）
- 有用户消息后才出现（确保有内容可以重置）

### 2. 视觉区分
- 使用琥珀色（amber）而非主色调紫色
- 表明这是一个需要谨慎的操作
- 与其他操作按钮有明显区分

### 3. 流畅的状态转换
```typescript
// 重置所有状态
setMessages([{ id: "initial", role: "assistant", content: step.initialPrompt, timestamp: new Date() }])
setGeneratedDoc(null)
setConversationProgress(0)
setCanGenerateReport(false)
setIsSaved(false)
setCanvasStreamContent("")
setInputValue("")
```
- 一次性重置所有相关状态
- 确保页面回到初始状态
- 不需要刷新页面

## 与其他功能的关系

### 1. 报告生成
- 重新开始后，之前生成的报告会被清除
- 需要重新收集信息并生成报告
- 旧报告已保存在数据库中，不会丢失

### 2. 画布模式
- `canvasStreamContent` 会被清空
- 重新开始后需要重新打开画布生成报告

### 3. 数据同步
- 新对话会自动同步到数据库
- 保持与云端的数据一致性

## 技术细节

### 1. 状态管理
使用多个 React state 管理对话状态：
- `messages`: 消息列表
- `currentConversation`: 当前对话记录
- `generatedDoc`: 生成的报告文档
- `conversationProgress`: 对话进度
- `canGenerateReport`: 是否可以生成报告
- `isSaved`: 是否已保存
- `canvasStreamContent`: 画布流式内容
- `inputValue`: 输入框内容

### 2. 数据库操作
```typescript
// 完成旧对话
await completeConversation(currentConversation.id)

// 创建新对话
const newConversation = await createConversation(step.id, step.title)
```

### 3. 异步处理
- 使用 `async/await` 处理异步操作
- 确保数据库操作完成后再重置 UI 状态

## 测试建议

### 1. 基础功能测试
- [ ] 点击"重新开始对话"按钮
- [ ] 确认对话框出现
- [ ] 点击"确定"后对话重置
- [ ] 检查旧对话是否保存到数据库
- [ ] 检查新对话是否创建成功

### 2. 边界情况测试
- [ ] 只有开场白时按钮不显示
- [ ] 有用户消息后按钮出现
- [ ] 重置后输入框清空
- [ ] 重置后报告清空
- [ ] 重置后进度归零

### 3. 错误处理测试
- [ ] 网络断开时重置操作
- [ ] 数据库异常时的错误提示
- [ ] 取消确认对话框的效果

### 4. 数据持久化测试
- [ ] 刷新页面后新对话仍存在
- [ ] 旧对话可以在历史记录中找到
- [ ] 对话记录完整性检查

## 未来优化方向

### 1. 历史对话查看
- 添加查看历史对话的入口
- 支持恢复或导出历史对话

### 2. 对话分支
- 支持从某个消息点创建分支
- 对比不同分支的对话结果

### 3. 自动保存草稿
- 定时自动保存对话草稿
- 防止意外关闭导致内容丢失

### 4. 对话模板
- 支持保存常用的对话模板
- 快速应用模板开始新对话

## 更新日志

**2025-12-14**
- ✅ 添加 `handleRestartConversation` 函数
- ✅ 在右侧面板添加"重新开始对话"按钮
- ✅ 实现旧对话保存机制
- ✅ 添加确认对话框防止误操作
- ✅ 完善错误处理和用户提示
- ✅ 测试所有工作流步骤（包括 IP传记采访）

## 相关文件

- **主文件**: [app/dashboard/workflow/[stepId]/page.tsx](app/dashboard/workflow/[stepId]/page.tsx)
- **数据库函数**: `lib/supabase.ts` - `createConversation`, `completeConversation`
- **UI 组件**: `components/ui/obsidian.tsx` - `GlassCard`, `GlowButton`

## 常见问题

### Q: 重新开始后旧对话会丢失吗？
A: 不会。旧对话会被标记为 `completed` 状态并保存在数据库中。

### Q: 可以恢复已重置的对话吗？
A: 目前不支持直接恢复，但对话记录保存在数据库中，后续可以添加查看历史对话的功能。

### Q: 重新开始会影响已生成的报告吗？
A: 已保存到数据库的报告不会受影响。只有当前页面显示的报告会被清除。

### Q: 按钮什么时候显示？
A: 当对话中有用户消息时（`messages.length > 1`）才显示，避免在对话开始时造成困惑。

### Q: 如果重置失败怎么办？
A: 系统会弹出错误提示，建议刷新页面重试。所有数据都已保存在数据库中，不会丢失。
