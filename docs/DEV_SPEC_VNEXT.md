# vNext 开发文档（Codex 专用）

> 目标：把“体验卡成交 → 激活 → 交付包 → 第一次成功产出 → 复购升级”做成可强制执行的主线，并解决移动端“能看但不好用”的问题。

---

## 0) 需要的 MCP（放最前面）

- **GitHub MCP**：拉取/修改仓库代码、提交 PR
- **Supabase MCP**：SQL 迁移、表结构、存储（报告文件/兑换码/事件）
- **Vercel MCP**（或部署平台 MCP）：环境变量、构建、线上发布
- **Playwright MCP（可选）**：E2E 自动化回归（激活 → 生成 → 下载）

---

## 对照当前项目（已存在能力）

- 已有入口：`/start`、`/activate`、`/redeem`
- 已有交付包预览：`/delivery-pack/[packId]`（可复制版）
- 已有 PDF 下载路由：`/api/delivery-pack/[packId]/download`
- 已有埋点基础与 `analytics_events`
- 已有兑换码表：`redemption_codes`（字段较少，需升级为 SKU 化）

> vNext 重点：**“强制主线 + 移动端可用 + SKU 化”**。当前已有页面可复用，但流程需要强约束与聚焦。

---

## 1) P0：激活成功后的“强制主线”页面

### 1.1 新增页面：`/activate/success`（或在 ActivateClient 成功态内实现）

**功能**
- 激活成功后立即进入 success 状态，不让用户回到输入兑换码页面
- 展示 3 步进度条：
  1) 兑换成功
  2) 生成交付包（进行中）
  3) 完成下载 + 去发布
- 自动触发交付包生成（后台异步则轮询状态）
- 成功后显示：
  - 【下载 PDF】
  - 【打开可复制版报告】（见第 2 部分）
  - 【去内容工坊生成第一条】（直接跳推荐 Step，并预填参数）

**验收标准**
- 激活成功后 **10 秒内**能看到“生成中”
- 生成成功后 **1 次点击**可下载 PDF
- 不出现 500/空白页

---

## 2) P0：交付包“移动端可用”——新增可复制版报告页

### 2.1 新增页面：`/pack/:packId`（HTML 渲染）

**要求**
- 用 output_json 渲染成报告（不要仅靠 PDF）
- 每个关键字段提供 Copy 按钮：
  - 明天第一条：标题 / 钩子 / 结构 / CTA
  - 3 条脚本：每条【复制整条台词】【复制置顶评论】
  - 10 条选题：每条【复制标题】
- 页面顶部固定一个【明天第一条】卡片（强引导）

> 当前已有 `/delivery-pack/[packId]`，需评估：
> - 是否可直接改成 `/pack/:packId` 路由或同内容别名
> - 是否需要增强“顶部固定卡片 + 分段复制按钮”

### 2.2 与 PDF 下载联动

- `/pack/:packId` 页面提供【下载 PDF】按钮（同一 packId）

**验收标准**
- 手机端打开 `/pack/:packId` 能一键复制，不需要下载 PDF
- PDF 仍可下载用于“证据感/留存”

---

## 3) P0：复购升级继续用兑换码（SKU 化）

### 3.1 数据表：`redeem_codes`

**字段建议**
- `code`（唯一）
- `sku`（trial_7d_pro / pro_30d / plus_30d / credits_500 等）
- `plan_grant`（trial_pro / pro / vip …）
- `credits_grant`
- `expires_at`
- `max_uses`（默认 1）
- `used_count`
- `used_by`（user_id）
- `used_at`
- `source`（xiaohongshu / manual / …）

> 当前表为 `redemption_codes`，需迁移升级（或新表 + 兼容旧表）。

### 3.2 Redeem 逻辑升级

- `/activate` 支持识别不同 sku：
  - 体验卡：开通 `trial_pro` + credits
  - 月卡：升级 plan + 续期 + credits
  - 充值包：只加 credits
- 兑换完成后统一跳到 `/activate/success`，继续引导生成/使用

**验收标准**
- 同一入口支持“体验卡 + 月卡 + 充值包”
- 兑换码单次使用不可复用
- 失败原因清晰（已用 / 过期 / 不存在）

---

## 4) P1：内容价值提升——Playbook 轻量模板库接入

### 4.1 新增目录：`/playbooks/*.json`

每个 playbook 至少包含：
- `industry`
- `offer_type`
- `high_intent_keywords[]`
- `pain_points[]`
- `scenes[]`
- `hook_patterns[]`
- `cta_templates[]`
- `script_structures[]`
- `compliance_notes[]`

### 4.2 生成时注入 playbook

在 `generateDeliveryPackV2`（或 `generate.ts` 的 buildPrompt）里：
- 根据 `industry + offer_type` 选 1 个 playbook
- 将 playbook 关键片段拼进 prompt（限制长度，避免 token 爆炸）
- 强制输出要“引用 playbook 的关键词/场景”

**验收标准**
- `topics_10` 关键词更行业化，不再像通用作文
- `scripts_3` 能看出“卖点 / 场景 / 人群”，不再空泛

---

## 5) P2：漏斗数据看板（最小可用）

### 5.1 事件规范（统一命名）

新增/统一事件：
- `activate_view`
- `activate_submit`
- `activate_success`
- `diagnosis_start`
- `diagnosis_complete`
- `pack_generate_start`
- `pack_generate_success`
- `pack_view`
- `pack_download`
- `workshop_open`
- `first_generation_success`
- `upgrade_click`
- `redeem_success`

### 5.2 新增管理页：`/admin/funnel`

- 显示最近 7 天各事件数量
- 显示关键转化率：
  - `activate_submit / activate_view`
  - `pack_generate_success / activate_success`
  - `first_generation_success / pack_view`
  - `redeem_success / upgrade_click`

**验收标准**
- 能在一个页面看清楚“卡点在哪里”
- 不需要手动翻数据库

---

## vNext 交付顺序（建议执行）

1) 激活成功强制主线（/activate/success + 自动生成）
2) 移动端可复制报告页（/pack/:packId + 顶部固定卡片 + 复制按钮）
3) 兑换码 SKU 化（表结构 + 逻辑升级）
4) Playbook 模板库接入（提示词增强）
5) 漏斗看板（P2）

