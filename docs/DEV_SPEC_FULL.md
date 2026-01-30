# MCP（给 Codex 开发前置：先把工具接好）

> 你要的是“买完能用”的闭环，不是再堆页面。下面这份文档，默认 Codex 具备这些 MCP（没有就先配）：

1. **GitHub MCP**

   * 用途：拉取/搜索/修改代码、提交 PR、查看最新 commit 差异。
2. **Supabase MCP**

   * 用途：执行 SQL 迁移、创建/调整表与索引、配置 RLS、创建 Storage Bucket、查看数据与埋点。
3. **Vercel MCP**（或你实际部署平台的 MCP）

   * 用途：配置环境变量、触发预览部署、回滚、查看运行日志。
4. **Browser/Playwright MCP（可选但强烈建议）**

   * 用途：跑移动端 E2E（小红书内置浏览器场景）、验证 `/redeem → /activate → /diagnosis → PDF` 全链路。

---

# IP内容工厂：小红书9.9体验卡 → 激活 → 诊断 → PDF交付 → 内容工坊复购 闭环开发文档（整合版）

> 你现在的关键不是“再优化首页UI”，而是 **把成交后的第一小时体验做到无脑顺滑**：
> **付款 → 1分钟激活 → 5分钟拿到可执行PDF → 当天发出第一条内容 → 7天内形成依赖 → 续费码续期**。
> 这份文档把「体验卡激活」+「诊断/交付包PDF」+「内容工坊复购承接」合并成一套明确的开发任务。

---

## 0. 你现在已经有的能力（我基于你上传的最新版代码确认）

### 已具备（可直接利用）

* **兑换码体系**：`/redeem` + `POST /api/redeem`

  * 支持：未登录用户填邮箱 + 兑换码 → 自动创建用户 + 下发 session → 写入 `entitlements` 延长到期时间（你这块实现是对的）。
* **激活请求体系（兜底）**：`POST /api/activate`（写入 `activation_requests`，带防刷、ip_hash、utm、webhook）
* **交付包生成器（核心资产）**：`generate.ts + schema.ts + sanitize.ts`

  * 输出结构化 JSON（包含 `bottleneck/top_actions/calendar_7d/topics_10/scripts_3/qc_checklist/archive_rules/upsell` 等）
* **PDF渲染（关键）**：`pdf.ts` 已经是「一份PDF」的形态（移动端友好）
* **下载签名**：`GET /api/delivery-pack/[packId]/download` 已可对 Storage 里的 PDF 生成 signedUrl 并重定向下载

### 当前最大短板（必须直说）

* 你“闭环”里**最值钱的东西不是生成文件数量**，而是：
  **PDF里有没有“明天就能发”的标题+脚本+排产+质检**，而且必须跟用户行业/卖什么/卖给谁强绑定。
* 你现在交付包生成 payload 里**缺少高信号字段**（比如 `target_audience/price_range/tone/current_problem`），导致生成内容容易“泛”。

---

## 1. 你要的“主流程”应该长什么样（产品级闭环）

### A. 小红书购买用户（9.9体验卡）主路径（P0 必须跑通）

1. 小红书自动发货文案里给一个入口链接：
   **`https://ipnrgc.com/start?from=xhs&code=XXXX`**（XXXX为兑换码；如果平台无法动态码，就退回“手工激活兜底”）
2. `/start` 页面只做三件事（移动端 1 屏内）

   * Step1：确认权益（展示“7天Pro体验”）
   * Step2：一键兑换（code 自动填入，用户只填邮箱）
   * Step3：立刻开始诊断（一个按钮跳 `/diagnosis/quiz`）
3. 诊断完成 → 结果页

   * **立刻生成 PDF**（按钮）
   * 生成完成 → **直接打开在线预览**（而不是逼下载）
   * 在预览页一键复制“第1天脚本/标题/置顶评论”
4. 预览页底部强承接：

   * **“进入内容工坊：用这套脚本继续生成7天日历/脚本（P7/P8）”**
   * 这是复购承接（用起来才会续费）

### B. 非购买用户（冷流量/B2B）路径（P1）

* 首页 CTA 分流：

  * **免费诊断（拿结果 + 看交付样本）**
  * **团队/企业 → /demo（顾问演示）**
  * 但别把团队线混进“9.9体验卡用户”的链路里，体验卡用户要的是“马上能用”。

---

## 2. P0 开发：体验卡激活/兑换体验做到“傻瓜式”（最关键）

### 2.1 新增 `/start`（强烈建议，专为小红书购买用户）

**需求**

* 读取 query：`code / from / utm_*`
* UI：3步卡片 + 进度状态（未登录/已兑换/已开通）
* 逻辑：

  * 如果已登录且已有 Pro 未过期 → 直接显示「已开通」+ “开始诊断”
  * 如果未登录：

    * 邮箱输入框（必填）
    * 兑换按钮（调用 `/api/redeem`）
    * 成功后自动 setSession → 跳转 `/activate?from=start` 或直接 `/diagnosis/quiz?from=start`

**验收**

* 在手机浏览器（含小红书内置）里，从打开链接到看到“开始诊断”按钮 ≤ 60秒。
* 不需要用户先去找“注册/登录”入口。

### 2.2 合并 `/redeem` 与 `/activate` 的职责（减少迷路）

你现在同时有 `/redeem` 和 `/activate`，用户很容易困惑。
**建议最终呈现**：用户只需要记住 **一个入口：`/activate`**。

**实现策略**

* `/activate` 页面内部：

  * 如果无权益：展示“兑换码 + 邮箱”输入（直接复用 RedeemClient 逻辑）
  * 如果有权益：展示有效期 + 下一步（诊断 / 内容工坊）
* `/redeem` 保留但不在外部强曝光（给客服/兜底用）

### 2.3 兑换码体验优化（你已经有后端能力，再把体验补齐）

**改动点**

* `/redeem` 支持 query 自动填：`?code=XXXX&email=xxx`
* 支持“粘贴自动识别空格/小写/换行”（你后端已 normalizeCode，前端也要做）
* 成功后不要只提示“成功”，要给明确下一步：

  * **“去诊断，生成你的7天交付PDF”**（主按钮）
  * 次按钮：去内容工坊

**埋点**

* `redeem_view` / `redeem_submit` / `redeem_success` / `redeem_fail`
* props：`source/utm/landingPath/code_present/email_present`

---

## 3. P0 开发：诊断流程必须“对准付费人群 + 为PDF服务”（你自己也承认不匹配）

你说的两点我完全同意，而且更狠一点：
**诊断不是问卷，是为了喂给交付包生成器的“高信号输入采集器”。**
采不到关键输入，PDF就会泛，泛就不值钱，不值钱就不续费。

### 3.1 诊断问题重构目标

* 总题数控制在 **8～10题**（超过就掉转化）
* 每一题都必须映射到 `DeliveryPackInput`（你 schema.ts 里已经定义了）
* 必须采到这些高信号字段（否则内容价值上不去）：

  * `offer_desc`（你卖什么，必须一句话说清）
  * `target_audience`（你卖给谁）
  * `price_range`（客单价/服务价格区间，决定脚本CTA与成交路径）
  * `tone`（脚本口吻）
  * `current_problem`（多选：流量低/转化低/返工多/没SOP/没选题/交付不稳）
  * 再加你已有的交付成熟度字段：`sop/qc/script_review/multi_project/...`

### 3.2 诊断结果页改造目标（你已经有 ResultClient 的骨架，但要强化“第一口价值”）

结果页必须出现（且在首屏/第二屏内）：

* **核心瓶颈（只给一个，别给一堆）**
* **Top3动作（可执行动词开头）**
* **“明天第一条”预览（标题+3秒钩子+CTA）**

  > 这条预览要来自交付包生成器的结构化输出，而不是你现在自己拼的泛内容。

按钮策略（P0）：

* Pro 用户：`生成交付包PDF`（主按钮） + `在线预览/复制脚本`（生成后）
* 非 Pro：`去激活体验卡`（主按钮） + `看样本PDF`（次按钮）

### 3.3 去掉所有“无证据排名/击败百分比”文案

你之前报告里出现过“击败XX%同行/排名前20%”，这在 B 端是**信任杀手**。
**规则：**

* UI 不出现任何“击败/超过同行百分比”
* 若一定要“对比感”，只写：

  * “基于你选择的现状，我们判断你当前主要卡点在 XXX（推断）”
  * 或“成熟度分级：入门/可用/稳定/可规模化”（内部口径）

---

## 4. P0 开发：交付包从“文件多”变成“内容值钱”（并且移动端可用）

你现在选择 PDF 而不是 zip，是对的；但**PDF也可能做成垃圾**。
PDF值钱的标准只有一个：**用户拿到后 5 分钟内能产出第一条可发布内容**。

### 4.1 输出形态：一份PDF + 一个在线可复制预览页（解决移动端不可编辑）

**强制要求**

* PDF：用于“证据截图/留存/小红书展示”
* 在线预览页：用于“复制脚本/标题/清单”（移动端真正能用）

**新增页面**

* `/delivery-pack/[packId]`（或 `/p/[packId]`）

  * 区块化渲染 output_json：

    * 结论页（瓶颈+Top3动作）
    * “明天第一条”（一键复制）
    * 7天排产（表格可复制）
    * 3条脚本（每条都有复制按钮：台词/置顶评论/CTA）
    * 质检清单（可复制）
  * 顶部：`打开PDF` / `下载PDF`
  * 底部：`进入内容工坊继续生成`（复购承接）

**验收**

* 手机端不下载文件也能完成：复制脚本 → 发布第一条（这是关键体验）

### 4.2 生成质量控制（让 PDF“像交付”，不是像作文）

你已经有 `sanitize.ts` 做禁词与截断，但还不够。P0 再补三件事：

1. **结构校验（硬校验，不合格就重试或补默认）**

* `calendar_7d.length === 7`
* 每天必须有：`title/hook/cta/type`
* `scripts_3.length === 3` 且每条必须有：`hook_0_3s / breakdown / steps / proof / cta / pinned_comment`

2. **价值密度规则（软校验，低价值就再生成一次“加强版”）**

* 标题不能全是泛词（比如“如何做内容”）
  必须包含用户的 `offer/人群/场景/价格/结果` 至少两项
* CTA 必须“站内可闭环”（评论关键词/站内生成/下载PDF），不要微信外链

3. **输入字段补齐（你现在 payload 缺很多）**

* 诊断问卷里新增字段后，`POST /api/delivery-pack/generate` payload 必须带齐：

  * `offer_desc/target_audience/price_range/tone/current_problem`

### 4.3 存储字段命名纠偏（小事但会越拖越乱）

你现在表字段叫 `zip_path` 但实际是 pdf。
建议迁移为：

* `file_path` 或 `pdf_path`
* 代码里同步替换（下载路由也改）

---

## 5. P0→P1：复购承接闭环（内容工坊必须接得住）

你说“复购承接闭环，就内容工坊那一栏内容生成流程”，这没错。
问题是：**用户拿到PDF后，没有被强引导进入内容工坊形成依赖**。

### 5.1 结果页/预览页必须有“下一步引导”

在这两个位置加固定承接模块（强制）：

* 标题：**“用交付包直接开始产出”**
* 两个按钮：

  * `进入内容工坊：生成7天日历（P7）`
  * `进入内容工坊：生成3条脚本（P8）`
* 旁边写一句话：
  “你刚拿到的是诊断版交付包；内容工坊是持续生产版本（每天能用）”

### 5.2 首次进入内容工坊做“新手三步”

新增 `/workshop/onboarding`（或在工坊首页弹层）：

* Step 1：选平台/行业/卖什么/卖给谁（从诊断答案自动带入）
* Step 2：一键生成“7天日历”
* Step 3：从日历选一天 → 一键生成脚本

> 你已经有 `/api/chat` + workflow steps 的基础设施，缺的是“引导壳”。

---

## 6. 数据与埋点：你必须开始用数据说话（否则你永远在猜）

你已经有 `/api/track` 和 `analytics_events`（很好）。现在把事件体系补齐成漏斗：

### 6.1 关键事件（统一命名，别再乱）

* 购买入口（站内）：`cta_click`（你已在用）
* 兑换：

  * `redeem_view`
  * `redeem_submit`
  * `redeem_success`
  * `redeem_fail`
* 诊断：

  * `diagnosis_start`
  * `diagnosis_complete`
* 交付包：

  * `delivery_pack_generate_start`
  * `delivery_pack_generate_success`
  * `delivery_pack_generate_fail`
  * `delivery_pack_view`
  * `delivery_pack_download`
  * `copy_script`
  * `copy_calendar`
* 内容工坊承接：

  * `workshop_enter`
  * `workflow_run`（带 stepId）
* 续费：

  * `upgrade_click`
  * `redeem_renew_success`

### 6.2 必带 props（否则没意义）

* `utm_*`
* `source`（xhs / organic / wechat / demo）
* `landingPath`
* `userId`（有就带）
* `packId / diagnosisId`（链路串起来）

---

# 给 Codex 的任务拆解（按优先级直接开工）

## P0（必须先做，做完你才配谈“变现”）

1. **新增 `/start` 入口页（小红书购买专用）**

   * 读 `code/from/utm`，引导兑换与开始诊断
2. **`/activate` 合并兑换与权益展示（减少迷路）**

   * 无权益→展示兑换表单；有权益→显示有效期+下一步
3. **诊断问卷重构（8～10题，高信号字段补齐）**

   * 必采：offer_desc / target_audience / price_range / tone / current_problem
   * 全部映射到 DeliveryPackInput
4. **结果页强化“明天第一条” + 一键生成PDF**

   * 用交付包输出驱动预览（不要人工拼泛文案）
5. **新增 `/delivery-pack/[packId]` 在线预览页（可复制）**

   * 解决移动端“PDF能看但不好用”的问题
6. **去掉所有“击败XX%同行/排名百分比”口径**

   * UI + PDF 全面禁用此类叙述
7. **把 `zip_path` 改名为 `pdf_path/file_path`（迁移 + 代码替换）**

## P1（做完P0你会明显看到转化改善）

8. **兑换码管理后台（生成/导出/作废）**

   * 目标：支撑“月卡续费码”也走同一套 `/redeem`
9. **内容工坊新手引导（3步）**

   * 从诊断答案自动带入，降低首次使用成本
10. **漏斗看板（Supabase View / 简易 admin 页面）**

* 每天看：购买 → 兑换成功 → 诊断完成 → 生成PDF → 工坊进入 → 续费

---

# 环境变量清单（Codex 必须检查并补齐）

* Supabase

  * `NEXT_PUBLIC_SUPABASE_URL`
  * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  * `SUPABASE_SERVICE_ROLE_KEY`（用于签名下载、admin 操作）
* 兑换码登录

  * `REDEEM_LOGIN_SECRET`（你现在用 HMAC 生成密码）
* 防刷

  * `CREDITS_IP_SALT`（ip_hash 盐）
* 交付包生成（你现在用 apimart）

  * `APIMART_API_KEY`（或 `APIMART_QUICK_API_KEY`）
  * `APIMART_BASE_URL`（可选）
  * `APIMART_MODEL` / `APIMART_QUICK_MODEL`（可选）
  * `APIMART_TIMEOUT_MS`（可选）
* Storage

  * 确认 bucket：`delivery-packs` 已存在

---

# 最后一句狠话（你必须接受）

你现在不缺“功能”，你缺的是：**用户买完以后到底下一步干什么**。
P0 做完之前，别再优化首页、别再加模块、别再写内容矩阵。
**先让一个陌生用户：买 → 1分钟激活 → 5分钟拿到能发的脚本 → 发出去。**
做不到这一步，你所有“变现”都是幻觉。

如果你要我下一步继续，我会基于你现在的 `DeliveryPackInput schema + generate.ts prompt`，直接把“高价值输出”再往上推一档：

* 强制生成“明天第一条”的**完整可发布文案**（标题+正文+评论置顶+封面文字），
* 并把内容工坊的 P7/P8 做成“诊断后一键连跑”。
