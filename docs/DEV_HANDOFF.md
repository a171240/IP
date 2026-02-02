# IP内容工厂 · 开发文档与进度梳理（P0/P1）

更新时间：2026-02-02

本文件用于“换机继续开发”。它把你给的开发文档要求完整梳理成：
- 已完成什么
- 怎么做的（具体实现位置）
- 接下来还要完成什么

## 文档位置
- 全量开发文档：`docs/DEV_SPEC_FULL.md`
- vNext 开发文档：`docs/DEV_SPEC_VNEXT.md`
- 当前进度文档：`docs/DEV_HANDOFF.md`

---

## 0. 总目标（闭环）
小红书 9.9 体验卡 → /redeem 或 /activate 兑换 → /diagnosis 诊断 → 生成高价值 PDF → 在线预览可复制 → 引导进入内容工坊复购。

核心标准：
- 1 分钟内完成兑换激活
- 5 分钟内拿到可发布内容（标题 + 钩子 + 结构 + CTA）
- PDF “可执行”，不是作文

---

## 1. 已完成（P0）

### 1.1 兑换 / 激活链路（核心入口已具备）
**已完成：**
- `/start` 支持兑换码激活（小红书体验卡入口），支持 query 自动填 `code / email`，支持未登录邮箱兑换。
- `/start` 移动端补齐“3 步开始 + 底部粘性 CTA”，首屏更聚焦“兑换 → 诊断”。
- `/activate` 页面内置兑换表单，成功后显示有效期并引导进入诊断。
- `/redeem` 页面保留兜底，并支持 query 自动填与前端归一化（去空格、转大写）。
- 埋点：`redeem_view / redeem_submit / redeem_success / redeem_fail`（前端已接）。

**实现位置：**
- `/start`：`app/start/page.tsx`，`app/start/start-client.tsx`
- `/activate`：`app/activate/activate-client.tsx`
- `/redeem`：`app/redeem/redeem-client.tsx`
- 后端：`app/api/redeem/route.ts`

---

### 1.2 诊断问卷已统一为 10 题（高信号字段齐）
**已完成：**
- 问卷改为 10 题，全部映射到 DeliveryPackInput（高信号字段：offer_desc / target_audience / price_range / tone / current_problem）。
- 首页文案已同步为“5分钟 · 10道题”。
- 修复 `/diagnosis/quiz` 在未包 AuthProvider 时的报错：改用 Supabase `auth.getUser` 拉取 `userId`。

**实现位置：**
- 题库：`lib/diagnosis/questions.ts`
- 评分映射：`lib/diagnosis/scoring.ts`
- 首页口径：`app/page.tsx`
- 诊断入口标题：`app/diagnosis/page.tsx`
- 诊断问卷客户端：`app/diagnosis/quiz/quiz-client.tsx`

---

### 1.3 交付包生成 + PDF 渲染（PDF 为主交付）
**已完成：**
- LLM 先产 JSON → 结构校验 → 内容清洗 → PDF 渲染。
- 校验规则已内置：7 天排产长度、3 条脚本完整度、禁用“同行排名/击败”等。
- **仅输出 PDF**，已移除 zip。
- storage 字段已改名为 `pdf_path`。
- 新增“明天第一条完整文案”（标题/正文/封面文字/置顶评论）并写入 PDF + 在线预览。

**实现位置：**
- 生成：`lib/delivery-pack/generate.ts`
- 校验/清洗：`lib/delivery-pack/sanitize.ts`
- Schema：`lib/delivery-pack/schema.ts`
- PDF：`lib/delivery-pack/pdf.ts`
- API：`app/api/delivery-pack/generate/route.ts`
- pdf_path 迁移：`supabase/migrations/20260129_rename_delivery_packs_zip_path_to_pdf_path.sql`

---

### 1.4 结果页首屏“明天第一条”已接入
**已完成：**
- 结果页首屏包含「明天第一条」模块（标题 + 钩子 + 结构 + CTA）。
- 核心瓶颈 + Top3 动作展示。
- 增加“用交付包直接开始产出”承接模块，引导进入内容工坊 P7/P8。
- 诊断后可一键直达 P7/P8（自动写入 onboarding，上屏即自动生成）。

**实现位置：**
- `app/diagnosis/result/[id]/result-client.tsx`

---

### 1.5 在线预览页已存在
**已完成：**
- `/delivery-pack/[packId]` 支持在线预览（输出 JSON 渲染成卡片）。
- 支持打开/下载 PDF。
- 预览页埋点补齐：`pack_view / pack_download / copy_script / copy_calendar / workshop_open`（带 `packId / userId`）。
- 质检清单/归档规则支持一键复制（事件：`copy_qc / copy_archive`）。
- 新增样本交付包预览页 `/delivery-pack/sample`，非 Pro 可直接查看样本 PDF（下载路由 `/api/delivery-pack/sample/download`）。
- 结果页/预览页移动端新增底部粘性主 CTA（品牌紫 + 金色提示，主按钮更强）。

**实现位置：**
- `app/delivery-pack/[packId]/page.tsx`
- `app/delivery-pack/sample/page.tsx`
- `app/api/delivery-pack/sample/download/route.ts`

### 1.6 数据埋点补齐（漏斗可闭环）
**已完成：**
- 内容工坊运行埋点：`workflow_run`（带 `stepId / conversationId`）。
- 续费兑换埋点：`redeem_renew_success`（与 `redeem_success` 并行上报）。

**实现位置：**
- `app/dashboard/workflow/[stepId]/WorkflowStepClient.tsx`
- `app/api/redeem/route.ts`
- `app/start/start-client.tsx`
- `app/activate/activate-client.tsx`
- `app/redeem/redeem-client.tsx`

### 1.7 积分 RPC 与乱码修复
**已完成：**
- 修复 Supabase `grant_trial_credits / consume_credits` 的列名歧义（避免 42702），并已更新线上函数。
- 修复 `P7/P8` 自动运行时的“报错乱码”显示；同时修复解决方案包下载内容与小程序私有配置说明的乱码。

**实现位置：**
- SQL：`lib/supabase/fix-credits.sql`，`lib/supabase/schema.sql`
- API 文案：`app/api/chat/route.ts`，`app/api/prompts/route.ts`，`app/api/download/[packId]/route.ts`
- 小程序配置：`mini-program-ui/project.private.config.json`

### 1.8 工坊质量升级（P5-P10）
**已完成：**
- P7-P10 工作流提示词改为“优先读取提示词文件”，保证与 `提示词/` 目录同步；文件缺失时自动回退到内置默认提示词。
- 工作流对话请求加入依赖报告上下文（优先 `context.reports`，无 id 时回退 `context.inline_reports`），P5-P10 能直接读取 P1-P4 / P7-P9 等前置报告，提高输出一致性与可用性。
- 新增 P5-P10 上下文回归脚本（默认走 report_id），用于快速验证上下文注入链路。
- 移除 P10 / IP 传记提示词中的“行业排名/份额”等不可验证口径，避免输出排名类文案。
- ✅ 2026-02-01 回归：脚本 `report_id` / `inline` 两种模式均通过（P5-P10 标识命中）。

**实现位置：**
- 提示词加载：`lib/prompts/content/p7-attraction.ts`，`lib/prompts/content/p8-rational.ts`，`lib/prompts/content/p9-product.ts`，`lib/prompts/content/p10-emotion.ts`
- 动态映射：`lib/prompts/step-prompts.ts`
- 上下文注入：`app/dashboard/workflow/[stepId]/WorkflowStepClient.tsx`
- 回归脚本：`scripts/regress-p5-p10-context.js`

---

### 1.9 交付包质量回归脚本
**已完成：**
- 新增交付包回归脚本：生成交付包并校验标题密度/CTA合规/清单结构，写入并核对 `analytics_events` 事件入库。
- 支持保留测试账号（`--keep-user`）与自定义邮箱/密码。

**实现位置：**
- 脚本：`scripts/regress-delivery-pack.js`
- npm 脚本：`pnpm regress:delivery-pack`

---

## 2. 当前已知问题 / 待回归（P0）
> 这些问题需换机后继续验证并修复。

1) **兑换已有邮箱时**偶现失败 → 已修复（`createUser` 失败时改用 `auth.admin.listUsers` 回退查找用户）。
2) **兑换按钮是否真正 submit** → 已修复（`/activate` 已补 `type="submit"`；`/start`/`/redeem` 已有）。
3) **PDF 排版**可能出现截断/重叠 → 已收敛（收紧 `maxLines`，避免卡片溢出；仍建议人工视觉回归）。
4) **在线预览复制/下载体验** → 已优化（复制仅成功提示，下载加 401 提示；建议人工回归）。
5) **Next.js 16 searchParams 警告**（/admin/funnel、/auth/login）→ 已修复（改为 await Promise.resolve(searchParams)）。
6) **内容价值密度与CTA合规** → 已补（标题自动补入 offer/人群/价格/平台要素；CTA 过滤微信/手机号等外链引导，回落站内评论领取）。
7) **价值密度“加强版”重生成** → 已补（split 生成若触发规则警告，走一次强化 prompt 再生成）。
8) **UI 控制台偶发 Failed to load resource（reports/conversations 406）** → 已修复（getReport/getConversation/getLatestConversation/use maybeSingle；不再因空数据 406 报错）。
9) **/api/delivery-pack/latest 404**（无交付包时控制台报错）→ 已修复（返回 200 + `{ ok:false }`）。
10) **交付包 JSON 解析偶发失败** → 已修复（split 生成失败自动回退单段生成）。

---

## 3. 接下来要完成什么（P0 未完成项）

### 3.1 结果页稳定呈现“明天第一条”
- ✅ 已完成（首屏 fallback 已接入）。

### 3.2 交付包生成性能优化（按你的要求）
- ✅ 已完成（核心 + 4 项并行拆分；token 收敛；异步轮询已接）。

### 3.3 体验闭环 E2E 回归
- ✅ 已完成（`redeem → activate → diagnosis → generate → PDF → preview` 已跑通；`analytics_events` 已验证写入）。
- ✅ 2026-01-31 回归：新交付包 `0986d40a-6a7a-4a8a-b9ad-80669a9f0465` 标题密度/CTA 合规通过；预览页复制清单/规则可用；`analytics_events` 已写入 `delivery_pack_generate_success / pdf_generate_success / delivery_pack_view / copy_qc / copy_archive`。
- ✅ 2026-02-01 回归：新交付包 `43ff091d-dd58-4bd1-82fe-fef2d1b9851c` 预览页已出现“明天第一条完整文案”；PDF 已包含新页面（本地打开验证）；结果页/预览页进入内容工坊直达 `P7/P8` 并自动触发生成（积分修复后 /api/chat 200）。
- ✅ 2026-02-01 UI 回归：Playwright MCP 跑 `P5 → P10`，每步首屏“前置报告”显示为“已有”，且对话中能提取对应标识（`P5: 概念标识`、`P6: 行业/认知/情绪/传记/概念/类型`、`P7: 行业/情绪/规划/传记`、`P8: 选题`、`P9: 脚本`、`P10: 口语`）。
- ✅ 2026-02-02 回归：新交付包 `6f124f1f-7a18-4f58-92b2-a109ac4f1a30` 预览页“明天第一条完整文案”可见；PDF 文本检索包含“明天第一条完整文案”；结果页/预览页进入内容工坊直达 `P7/P8` 并自动触发生成（更新 Pro 权益后 /api/chat 200）。
- ✅ 2026-02-02 脚本回归：`regress:delivery-pack` 生成 `326e29d8-f2e4-4907-a7b7-d92e6fe23b32`，事件写入 `delivery_pack_generate_success / pdf_generate_success / delivery_pack_view / copy_qc / copy_archive`。
- ✅ 2026-02-02 回归：`regress:delivery-pack` 生成 `11a599fe-84c8-4cfa-ad96-83be492529e2`（split 失败回退验证通过）。
- ✅ 2026-02-02 回归：`regress:p5p10` 上下文注入全部命中（P5→P10）。

---

## 4. P1 事项（后续）
- ✅ 兑换码管理后台（生成/作废/导出）：`/admin/redemption-codes` + `/api/admin/redemption-codes`
- ✅ 内容工坊新手引导（3步）：`/dashboard/workflow/onboarding`（入口优先跳引导；完成写入 `workshop_onboarding_done`；P7/P8 支持 `?onboarding=1` 自动注入提示）
- ✅ 漏斗看板（简易管理页）：`/admin/funnel`（近 7/14/30 天事件统计）
- ✅ 首页 CTA 分流（冷流量/团队）：Hero 与中段 CTA 补 “团队/企业演示” 入口（/demo）。
- ✅ /demo 承接优化：补充演示交付物、流程说明与快速预约入口。
- ✅ /demo 闭环增强：案例/FAQ/行业方向收集 + 微信备用联系入口；新增 leads.industry 字段。
- ✅ 新增 /admin/leads：查看最近线索（含行业/来源/UTM/落地页）。

---

## 8. vNext 进行中（2026-02-02）
- ✅ 新增激活成功强制主线页：`/activate/success`（自动生成交付包、轮询状态、下载/打开可复制报告、直达内容工坊）。
- ✅ `/activate` 激活成功后跳转到 `/activate/success`；`/diagnosis/quiz?from=activate-success` 完成后回到主线。
- ✅ 新增可复制报告别名页：`/pack/[packId]`（同交付包输出，顶部固定“明天第一条”卡片）。
- ✅ 交付包预览增强：明天第一条按字段复制、脚本追加“复制置顶评论”、选题支持“复制标题”。 
- ✅ 兑换码 SKU 化（表结构升级 + 兑换逻辑支持 plan_grant / credits_grant / max_uses）。
- ✅ Playbook 轻量模板库接入（`/playbooks/*.json` + 生成 prompt 自动注入关键词/场景）。
- ✅ 漏斗事件统一命名 & 看板升级：`/admin/funnel` 展示 vNext 事件 + 关键转化率（激活提交、生成成功、首产出、升级兑付）+ 近 N 天趋势（兼容旧事件别名统计）。
- ✅ 内容工坊首产出埋点：首次生成成功写入 `first_generation_success`。

---

## 5. 环境变量清单（必要）
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CREDITS_IP_SALT`
- `APIMART_API_KEY`
- `APIMART_BASE_URL`
- `APIMART_MODEL`

---

## 6. 换机快速启动
```bash
git clone https://github.com/a171240/IP.git
cd IP
pnpm install
pnpm dev
```

复制 `.env.example` → `.env.local` 并填值：
```powershell
Copy-Item .env.example .env.local
```

---

## 7. 关键路径 & 文件索引
- 兑换入口：`/start` → `app/start/start-client.tsx`
- 兑换兜底：`/redeem` → `app/redeem/redeem-client.tsx`
- 激活页：`/activate` → `app/activate/activate-client.tsx`
- 诊断问卷：`lib/diagnosis/questions.ts`
- 结果页：`app/diagnosis/result/[id]/result-client.tsx`
- 生成逻辑：`lib/delivery-pack/generate.ts`
- PDF：`lib/delivery-pack/pdf.ts`
- 预览页：`app/delivery-pack/[packId]/page.tsx`
- 兑换码后台：`/admin/redemption-codes`
- 漏斗看板：`/admin/funnel`
- 工坊新手引导：`/dashboard/workflow/onboarding`

---

> 后续每完成一个 P0 项，请在“已完成/待完成”里同步状态。
