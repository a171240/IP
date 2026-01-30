# IP内容工厂 · 开发文档与进度梳理（P0/P1）

更新时间：2026-01-30

本文件用于“换机继续开发”。它把你给的开发文档要求完整梳理成：
- 已完成什么
- 怎么做的（具体实现位置）
- 接下来还要完成什么

## 文档位置
- 全量开发文档：`docs/DEV_SPEC_FULL.md`
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

**实现位置：**
- 题库：`lib/diagnosis/questions.ts`
- 评分映射：`lib/diagnosis/scoring.ts`
- 首页口径：`app/page.tsx`
- 诊断入口标题：`app/diagnosis/page.tsx`

---

### 1.3 交付包生成 + PDF 渲染（PDF 为主交付）
**已完成：**
- LLM 先产 JSON → 结构校验 → 内容清洗 → PDF 渲染。
- 校验规则已内置：7 天排产长度、3 条脚本完整度、禁用“同行排名/击败”等。
- **仅输出 PDF**，已移除 zip。
- storage 字段已改名为 `pdf_path`。

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

**实现位置：**
- `app/diagnosis/result/[id]/result-client.tsx`

---

### 1.5 在线预览页已存在
**已完成：**
- `/delivery-pack/[packId]` 支持在线预览（输出 JSON 渲染成卡片）。
- 支持打开/下载 PDF。

**实现位置：**
- `app/delivery-pack/[packId]/page.tsx`

---

## 2. 当前已知问题 / 待回归（P0）
> 这些问题需换机后继续验证并修复。

1) **兑换已有邮箱时**偶现失败（依赖 Supabase Auth 权限），需回归 `app/api/redeem/route.ts`。
2) **兑换按钮是否真正 submit**（GlowButton type），需回归 `/activate` / `/start`。
3) **PDF 排版**仍可能出现截断/重叠，需回归 `lib/delivery-pack/pdf.ts`。
4) **在线预览复制按钮/下载按钮体验**需回归（点击一次多处提示、下载需多次触发等）。

---

## 3. 接下来要完成什么（P0 未完成项）

### 3.1 结果页稳定呈现“明天第一条”
- 确保首屏稳定展示；数据为空时 fallback 不要出现 placeholder。

### 3.2 交付包生成性能优化（按你的要求）
- 并行拆分（核心 + 4 项并行）
- 降 token
- 异步轮询

### 3.3 体验闭环 E2E 回归
- 跑一遍：`redeem → activate → diagnosis → generate → PDF → preview`
- 确认埋点写入 `analytics_events`

---

## 4. P1 事项（后续）
- 兑换码管理后台（生成/作废/导出）
- 内容工坊新手引导（3步）
- 漏斗看板（Supabase View / 简易管理页）

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

---

> 后续每完成一个 P0 项，请在“已完成/待完成”里同步状态。
