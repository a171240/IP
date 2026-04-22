# Mini Program UI Handoff For GPT Pro

更新时间：2026-04-22  
适用范围：`D:\IP网站\mini-program-ui`

## 1. 这份文档是干什么的

这不是全量开发文档，也不是产品 PRD。  
这是一份给 GPT Pro 接力做小程序 UI 优化的窄范围 handoff。

目标只有一个：

- 在不破坏现有业务逻辑的前提下，继续把当前小程序主链路页面做得更像正式产品，而不是设计说明稿或内部 Demo。

## 2. 本轮行为约束

本轮执行必须遵守以下 4 条约束：

1. 先读再改  
先看相关页面的 `.wxml / .wxss`，确认当前结构和已有风格，再动代码。

2. 简单优先  
优先做最小可行、最稳定的 UI 修正，不做大而全重构。

3. 外科手术式修改  
只碰必要文件，只改展示层，不顺手清理无关代码，不带出额外改动。

4. 目标导向  
本轮只解决 UI 观感、层级、密度、文案和一致性问题，不顺带改功能。

## 3. 严格边界

### 3.1 允许改动

优先只改：

- `.wxml`
- `.wxss`
- 少量纯展示层结构调整

如确实必须动 `.js`，只允许纯展示相关的小改动，并且必须单独说明原因。

### 3.2 禁止改动

不要改这些内容：

- 接口请求
- 鉴权逻辑
- 埋点
- 路由目标
- 支付逻辑
- 录音 / 播放 / 语音训练逻辑
- Supabase / 后端 API
- 积分 / 订阅 / 订单业务规则

### 3.3 当前仓库有大量非 UI 脏改动

当前工作树里混有很多与本轮无关的改动，包括：

- `app/api/voice-coach/*`
- `lib/voice-coach/*`
- `tests/*`
- `voice-coach-ws/*`
- `scripts/wechat-devtools-cli.mjs`

本轮 UI 接力不要碰这些文件。

## 4. 当前 UI 范围

### 4.1 主 Tab 页面

本轮主范围只包括 4 个 Tab 页：

- `pages/xiaohongshu/index`
- `pages/xhs-drafts/index`
- `pages/voice-coach/index`
- `pages/mine/index`

### 4.2 一级直达页

允许一起优化的一级直达页：

- `pages/login/index`
- `pages/pay/index`
- `pages/order/index`
- `pages/store-profiles/index`
- `pages/store-profile-editor/index`
- `pages/voice-coach/setup/index`
- `pages/voice-coach/customer-profiles/index`
- `pages/voice-coach/customer-profile-editor/index`
- `pages/voice-coach/scene-cards/index`
- `pages/voice-coach/scene-card-editor/index`
- `pages/voice-coach/chat`

### 4.3 暂缓页

这一轮不要扩散到：

- `workflow/*`
- `library`
- `content-studio`
- `video-jobs`
- `diagnosis*`
- `voice-coach/report`

## 5. 当前代码基线

截至 2026-04-22，已完成一轮 UI 收口，主要涉及：

- `mini-program-ui/app.wxss`
- `mini-program-ui/pages/xiaohongshu/*`
- `mini-program-ui/pages/xhs-drafts/*`
- `mini-program-ui/pages/mine/*`
- `mini-program-ui/pages/login/*`
- `mini-program-ui/pages/pay/*`
- `mini-program-ui/pages/order/*`
- `mini-program-ui/pages/store-*/*`
- `mini-program-ui/pages/voice-coach/index.*`
- `mini-program-ui/pages/voice-coach/setup/index.wxss`
- `mini-program-ui/pages/voice-coach/customer-profiles/index.wxss`
- `mini-program-ui/pages/voice-coach/customer-profile-editor/index.wxss`
- `mini-program-ui/pages/voice-coach/scene-cards/index.wxss`
- `mini-program-ui/pages/voice-coach/scene-card-editor/index.wxss`
- `mini-program-ui/pages/voice-coach/chat.wxss`

CLI 验证记录：

- 2026-04-22：`npm run mp:islogin` 成功
- 2026-04-22：`npm run mp:open` 成功
- 2026-04-22：`npm run mp:preview` 成功

说明当前版本至少能被微信开发者工具正常打开和预览。

## 6. 当前截图里暴露出的主要问题

这是 GPT Pro 本轮最该解决的部分。

### 6.1 跨页面共性问题

1. 英文标签过多  
`CONTENT STUDIO`、`DRAFT LIBRARY`、`VOICE COACH`、`ACCOUNT CENTER` 这类 eyebrow 文案让页面更像设计展示稿，而不是正式小程序产品。

2. 解释型文案偏多  
很多副标题和 section copy 在解释设计意图，而不是帮助用户完成任务。

3. Hero 仍然偏重  
发文页、草稿页、我的页的顶部信息量还是稍满，首屏主任务不够直接。

4. 页面差异还不够大  
虽然已经比之前好，但普通业务页还是有“同一套深色卡片模板换标题”的痕迹。

5. 中文产品感还不够稳定  
有些文案像产品，有些像设计 review，有些像内部注释，语气不统一。

### 6.2 发文页问题

- 顶部 hero 信息略多，`创作方式 / 发布路径` 两块信息不是高优先级。
- `内容类型` 的 4 个按钮仍然略显平均，选中态不够果断。
- 输入区仍然稍像表单集合，不够像“单一任务工作台”。
- `结果 / 资产 / 发布` 三段方向对了，但文案还不够产品化。

### 6.3 草稿页问题

- 空状态页已经比旧版好，但顶部 hero 仍然有点重。
- 空状态下，页面最重要的动作应该更直接，不需要过多前置说明。
- 整页可以更像“列表库”，而不是“信息卡 + 说明卡”。

### 6.4 话术练习页问题

- 这是当前四页里方向最稳的一页，可以作为视觉锚点。
- 仍可继续压缩说明文案，让“开始训练”更突出。
- `顾客档案 / 场景卡` 两张卡可以更像功能入口，不必像内容说明块。

### 6.5 我的页问题

- 账号卡结构已经清楚，但“头像 / 信息 / 退出登录”目前主次略别扭。
- `已登录` badge 可以更轻，不要抢标题。
- `订阅与积分` 区已经是主 CTA，但下面 `订单 / 工具` 的说明文案仍偏多。

## 7. 本轮目标风格

三个关键词：

- 专业
- 克制
- 产品化

一个核心要求：

- 页面先像能直接上线的小程序，再像“设计过”的页面。

## 8. 视觉方向

### 8.1 保留

- 深色底
- 黑金体系
- 语音模块的专业感
- 主 CTA 的浅金色强调

### 8.2 收敛

- 收掉过多英文 eyebrow
- 收掉解释型文案
- 收掉不必要的“设计语言展示感”
- 收掉顶部非关键摘要卡

### 8.3 强化

- 主任务一眼可见
- CTA 层级唯一
- 列表页像列表页
- 工具页像工具页
- 账户页像账户页

## 9. 页面级目标

### 9.1 发文页

目标：像创作工作台，而不是产品介绍页。

建议：

- hero 继续压缩
- 去掉或弱化顶部双摘要卡
- 把页面重点压到输入区和主 CTA
- `结果 / 封面 / 发布` 三段继续保留，但减少解释性 copy

### 9.2 草稿页

目标：像内容资产库。

建议：

- 进一步弱化顶部 hero
- 空状态直接服务于“去工坊”
- 非空状态下强调标题、状态、时间、操作

### 9.3 话术练习页

目标：像训练入口。

建议：

- 保持当前基调
- 继续减少说明文案
- 让两个资产入口更像次级 action card

### 9.4 我的页

目标：像账户中心。

建议：

- 账号区更利落
- badge 降权
- 订单、工具区减少说明型 copy
- 保持“升级/购买”为唯一主 CTA

## 10. 推荐改动文件

优先改这些文件：

- `mini-program-ui/app.wxss`
- `mini-program-ui/pages/xiaohongshu/index.wxml`
- `mini-program-ui/pages/xiaohongshu/index.wxss`
- `mini-program-ui/pages/xhs-drafts/index.wxml`
- `mini-program-ui/pages/xhs-drafts/index.wxss`
- `mini-program-ui/pages/voice-coach/index.wxml`
- `mini-program-ui/pages/voice-coach/index.wxss`
- `mini-program-ui/pages/mine/index.wxml`
- `mini-program-ui/pages/mine/index.wxss`

二级补充页按需改：

- `mini-program-ui/pages/login/*`
- `mini-program-ui/pages/pay/*`
- `mini-program-ui/pages/order/*`
- `mini-program-ui/pages/store-profiles/*`
- `mini-program-ui/pages/store-profile-editor/*`
- `mini-program-ui/pages/voice-coach/setup/index.wxss`
- `mini-program-ui/pages/voice-coach/customer-profiles/index.wxss`
- `mini-program-ui/pages/voice-coach/customer-profile-editor/index.wxss`
- `mini-program-ui/pages/voice-coach/scene-cards/index.wxss`
- `mini-program-ui/pages/voice-coach/scene-card-editor/index.wxss`
- `mini-program-ui/pages/voice-coach/chat.wxss`

## 11. 不建议这轮做的事

- 不要重做全局视觉体系
- 不要改 tabbar 逻辑
- 不要重写 voice-coach chat 结构
- 不要把 deferred 页面一起卷进来
- 不要把 UI 优化变成后端联调或全仓重构

## 12. 验收标准

1. 3 秒内能看出每页主任务  
2. 英文标签显著减少  
3. 说明性文案显著减少  
4. 发文、草稿、话术练习、我的，四页一眼可区分  
5. 主 CTA 更唯一  
6. 不破坏原有按钮行为和页面跳转

## 13. 推荐 Git 策略

在 GPT Pro 接手前，建议：

1. 先保存当前工作树到备份分支  
2. 不要把整个仓库所有脏改动都当成 UI 版本  
3. UI 接力尽量只围绕 `mini-program-ui` 范围提交

## 14. 可直接给 GPT Pro 的提示词

可直接复制下面这段：

```md
Use a design-engineer workflow to continue polishing the WeChat mini program UI under `D:\\IP网站\\mini-program-ui`.

Hard constraints:
- UI only
- Do not change business logic
- Do not change API calls, auth, routing targets, payment logic, voice training logic, storage, or analytics
- Prefer `.wxml` and `.wxss` changes only
- Make surgical edits only
- Do not touch unrelated dirty files outside `mini-program-ui`

Primary scope:
- `pages/xiaohongshu/index`
- `pages/xhs-drafts/index`
- `pages/voice-coach/index`
- `pages/mine/index`

Secondary scope if needed:
- `pages/login/index`
- `pages/pay/index`
- `pages/order/index`
- `pages/store-profiles/index`
- `pages/store-profile-editor/index`
- `pages/voice-coach/setup/index`
- `pages/voice-coach/customer-profiles/index`
- `pages/voice-coach/customer-profile-editor/index`
- `pages/voice-coach/scene-cards/index`
- `pages/voice-coach/scene-card-editor/index`
- `pages/voice-coach/chat`

Current UI direction is correct but still too "design explanation" heavy.

Fix these problems:
- Too many English eyebrow labels
- Too much explanatory copy
- Hero sections are still too heavy on xiaohongshu, drafts, and mine
- Pages still feel too similar in structure
- Account page hierarchy still needs tightening

Desired direction:
- professional
- restrained
- productized

Specific goals:
- xiaohongshu should feel like a creation workbench, not a product intro page
- drafts should feel like a content library
- voice coach should stay as the visual anchor
- mine should feel like an account center

Keep the dark black-gold base, but reduce decorative explanation and strengthen task clarity.

Validate by keeping the main CTA obvious and preserving all existing behavior.
```

