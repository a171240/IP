# 小红书图文生成 v4（美业）开发规格与第三方审核

更新时间：2026-02-09  
适用端：微信小程序 `mini-program-ui/` + Next.js BFF `app/api/` + Supabase

---

## 0. 背景与目标

当前小程序存在两个问题：

1. 用户路径绕：P1-P10 工作流暴露后，新用户上手成本高。  
2. 输出不稳定：正文禁 CTA、合规、风控降级、首图冲突句等规则容易漏网。

本 v4 的目标是把默认路径收敛成“一次可发布的图文闭环”：

- 生成：正文（严格禁 CTA）+ 置顶评论（转化入口）+ 1 张高情绪冲突首图（香蕉2出图/提示词）。
- 支持：先生成泛内容，生成后追问补齐门店档案，再一键生成“门店定制版”。
- 支持：三档冲突强度（稳健/标准/狠）。
- 支持：风控自动改写闭环（最多 2 轮）。
- 全局：小程序默认不暴露 P1-P10（仅在“进阶工具”中隐藏入口）。

---

## 1) 已确认的产品决策（不可改动，除非产品重新拍板）

1. 转化优先级：大众优先（备用：抖音团购），但置顶评论 **不直写平台名**。
2. 正文：严格禁 CTA（正文 + 首图文案同一套禁词/检测）。
3. 城市/区县：允许写入正文（更本地代入）。
4. 档案缺失策略：先生成泛内容；生成后允许追问补齐。
5. 冲突强度：三档（稳健/标准/狠）。
6. 风控：自动（触发后自动改写并二次检测，不只是提示）。
7. 图片：仅 1 张首图；输出香蕉2（Nano Banana 2）风格的首图提示词（可复制），可选再走“生成封面”接口产图。

---

## 2) 第三方审核（站外视角）

### 2.1 高风险点（必须落地到实现）

1. **正文禁 CTA 漏网**
   - 仅靠提示词不够，必须做程序级禁词检测（正文 + 首图文案一起扫）并进入自动改写闭环。
   - 禁词表必须版本化，否则规则漂移不可控。

2. **自动风控改写可控性**
   - 上游 `danger-check` 仅提供 riskLevel/dangerCount，不提供命中项，无法精准改写。
   - 必须自建“命中项检测”（CTA/医疗/诋毁/隐私）输出明确命中词与字段名，用于可控改写。

3. **首图中文文字准确率**
   - “文生图直出带中文字”存在错字/乱码风险。
   - 需要兜底能力：同一套首图文案支持“无字背景 + 端侧叠字”切换（一期可不启用，但要能扩展）。

4. **小程序仍绕**
   - TabBar 必须收敛到“发文/草稿/我的”，P1-P10 不出现在默认入口。
   - TabBar 页面不可 `navigateTo`，必须 `switchTab`（并解决 draftId 参数传递）。

5. **多次调用链的时延与成本**
   - “生成 + 风控 + 自动改写 + 首图”是多步链路，WeChat 端请求超时约束 60s。
   - 服务端应做编排端点，限制改写轮次（最多 2）并支持草稿回填继续。

### 2.2 中风险点（建议一期覆盖）

- 置顶评论“不写平台名”会降低转化：建议保留 AB 开关（默认隐晦版）。
- 先泛后补追问要极简：只问 4 个字段（城市/时长/三条承诺/地标）。
- 自动改写必须保留“改写前/后”可追溯（一期可先写入 guardrail_flags + rounds，后续做版本对比）。

---

## 3) 信息架构（IA）与导航

### 3.1 TabBar（建议）

1. 发文：`pages/xiaohongshu/index`（作为 TabBar 页面）
2. 草稿：`pages/xhs-drafts/index`（作为 TabBar 页面）
3. 我的：`pages/mine/index`

其它页面（home/workspace/workflow/ip-factory 等）归入“我的 > 进阶工具”。

### 3.2 TabBar 导航约束

- 不能 `navigateTo` TabBar 页面，必须 `switchTab`。
- 不能通过 `switchTab` 传 query：用 storage 传递 `pendingDraftId`。

---

## 4) 数据结构（Supabase）

### 4.1 新表：store_profiles（门店档案）

用途：一次录入，后续复用；支持多门店切换。

建议字段（最小集）：

- user_id（FK -> profiles.id）
- name（门店昵称/简称）
- city / district / landmark（用于本地表达与搜索引导）
- shop_type（皮肤管理/SPA…）
- main_offer_name / main_offer_duration_min / included_steps
- promises（jsonb：不加价/不缩水/可拒绝）
- created_at / updated_at

RLS：仅 owner 可读写。

### 4.2 扩展表：xhs_drafts

新增字段建议：

- conflict_level（safe|standard|hard）
- pinned_comment
- reply_templates（jsonb string[]）
- cover_text_main / cover_text_sub
- cover_prompt / cover_negative
- guardrail_rounds / guardrail_flags（jsonb）
- store_profile_id（FK -> store_profiles.id）
- variant_of（FK -> xhs_drafts.id，用于“门店定制版”来源草稿）

---

## 5) API 设计（BFF）

### 5.1 门店档案 CRUD

- `GET /api/mp/store-profiles`
- `POST /api/mp/store-profiles`
- `GET /api/mp/store-profiles/{id}`
- `PUT /api/mp/store-profiles/{id}`
- `DELETE /api/mp/store-profiles/{id}`

### 5.2 一键生成（服务端编排端点）

`POST /api/mp/xhs/generate-v4`

请求（示例）：
```json
{
  "draft_id": "optional",
  "variant_of": "optional",
  "contentType": "treatment|education|promotion|comparison",
  "topic": "一句话主题",
  "keywords": "主关键词，可含少量辅词",
  "conflictLevel": "safe|standard|hard",
  "store_profile_id": "optional",
  "seed_reviews": ["可选差评原话1", "可选差评原话2"]
}
```

响应（示例）：
```json
{
  "ok": true,
  "draft": { "id": "uuid" },
  "result": {
    "title": "最终标题",
    "body": "正文（禁CTA）",
    "coverText": { "main": "首图主标题", "sub": "首图副标题" },
    "pinnedComment": "置顶评论（不写平台名）",
    "replyTemplates": ["模板1", "模板2", "模板3"],
    "tags": ["#本地", "#项目", "#避坑"],
    "coverPrompt": "香蕉2首图提示词",
    "coverNegative": "反向提示词"
  },
  "guardrails": {
    "rounds": 2,
    "flags": ["cta_word:团购", "medical_word:根治"],
    "riskLevel": "medium",
    "dangerCount": 3
  },
  "followup": {
    "needProfile": true,
    "questions": ["你在哪个城市/区？", "主推项目时长？", "能否承诺不加价/不缩水/可拒绝？", "附近地标商圈？"]
  }
}
```

实现要点：

- 端点内部完成：生成 -> 自建禁CTA检测 -> 上游 danger-check -> 自动改写（最多 2 轮）-> 落库。
- 置顶评论：大众优先 + 抖音备用，但不写平台名；仅给“搜索门店昵称 + 地标/商圈”的路径。

---

## 6) Guardrails（可控风控）

### 6.1 正文/首图禁 CTA 检测（必须）

字段：`body`、`coverText.main`、`coverText.sub`

至少覆盖：

- 导流动作：评论/私信/关注/加V/微信/VX/电话/扫码/链接/预约/到店
- 平台交易：大众点评/抖音/团购/下单/买券/核销/价格/优惠/地址/定位/导航

输出 flags：`{ field, rule, match }[]`

### 6.2 医疗合规检测（必须）

禁：治疗/根治/立刻见效/包好/百分百/永久  
替：舒缓/体验/因人而异/减少刺激/改善感受

### 6.3 自动改写循环（最多 2 轮）

触发：
- flags 非空
- 或 riskLevel >= medium

策略：
- 第 1 轮尽量保留原冲突强度；第 2 轮必要时降档到 safe。

---

## 7) 小程序端改造点（P0）

1. TabBar 改为 发文/草稿/我的。
2. `xhs-drafts` 打开草稿：写入 storage `xhs_pending_draft_id` 后 `switchTab` 到发文页。
3. 发文页 `onShow`：读取 `xhs_pending_draft_id` 自动加载草稿并清理 storage。
4. 发文页接入 `generate-v4`：
   - 新增冲突强度选择
   - 展示置顶评论 + 复制按钮
   - 展示首图提示词（可复制）
5. 先泛后补：
   - 生成后若 followup.needProfile=true：弹窗引导去“门店档案补齐页”，保存后生成“门店定制版”草稿并跳回发文页。

---

## 8) 里程碑与验收

### P0（必须）

- 小程序默认路径不绕：TabBar 直达发文/草稿。
- 10 次连续生成：正文与首图文案 0 次出现禁CTA词。
- 风控 medium+ 自动改写后：风险显著下降（riskLevel 降到 low 或 dangerCount 下降）。
- 生成链路在 60s 超时约束内可完成，超时可通过草稿回填继续。

