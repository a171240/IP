# Codex 开发说明（v2）

项目：IP内容工厂（ipnrgc.com）  
阶段目标：跑通小红书 9.9 体验卡的最小可行闭环（成交 → 激活 → 第一次产出成功 → 复购/预约演示）

## 0) 成功标准（必须量化）
- 体验卡激活完成率（进入激活页的人里，成功提交激活的人）≥ 40%。
- 首次产出成功率（激活后 24h 内至少下载/生成一次交付包）≥ 25%。
- 二次动作率（下载后点击“升级/预约演示”的比例）≥ 8%。
- 以上指标必须通过 `/api/track` 事件埋点获取数据，否则不要做“优化”，只能做“猜”。

## 1) 现状问题（Why 必须修，不修就别谈转化）
### 1.1 信任杀手（直接影响付费与转化）
- 页面“已有 1,234 人完成诊断”若非真实实时数据，必须删除。
- 诊断页强露出“添加微信领取 1V1 诊断解读：like171240”，在小红书成交链路中会显著增加摩擦/风控/跳失，应移出体验卡站内闭环路径。

### 1.2 产品形态错（“像作文，不像交付”）
- 诊断输出包含“行业击败 XX%/内容生产 0%”这类无口径数字，必须移除。
- 输出缺少可直接执行的交付件（日历/脚本/质检/归档/行动清单），导致“看完懂了但不会做”，自然不复购。

## 2) 用户路径（围绕此路径写代码）
小红书 9.9 体验卡闭环（最小可行）：
笔记 → 商品支付 → 自动发货 → 注册/登录 → 体验卡激活 → 解锁 7 天 Pro → 生成交付包 → 第一次发布/交付 → 升级/预约演示

两个关键点：
- 体验卡激活页面（站内闭环入口闸门）。
- 基于变现路径优化诊断（诊断不再是“测一测”，而是“交付包生成器 + 解锁/升级承接”）。

## 3) 开发范围总览
### 3.1 必做（MVP）
A. 新增体验卡激活页 + 激活申请 API + 数据表  
B. 诊断流程 v2：问题改造（匹配代运营/MCN/企业内容团队）+ 评分口径修正（去掉虚假指标）  
C. 新增交付包 v2 生成器（LLM 输出 JSON → 渲染成文件 → zip 下载）  
D. 诊断结果页改造成“交付包解锁/生成/下载”的主承接页（不再是长文作文）

### 3.2 可选（先别做）
- 第三方埋点（GA/Plausible/PostHog）
- 全自动权益开通（对接支付平台 API）
- 后台客服系统/工单系统

## 4) 关键功能一：体验卡激活页（Activation）
### 4.1 页面要求
- 新增页面：`/activate`（或 `/dashboard/activate`，建议复用登录态）。
- 页面极简，只解决一件事：提交激活申请 → 告诉用户下一步。
- 强制文案结构：
  1) 你已购买「7天Pro体验卡」
  2) 第1步：登录/注册（未登录显示按钮）
  3) 第2步：提交激活（填邮箱/订单信息）
  4) 第3步：激活成功后去「生成交付包」

### 4.2 表单字段（最小）
- `email`（必填；登录则自动填充，仍可编辑）
- `platform`（默认 `xiaohongshu`）
- `order_tail`（必填：订单号后 4 位或你决定的校验字段）
- `note`（可选）

提交成功后同页切换状态：
- 文案：“已收到，我们将在 1 个工作日内开通。”
- 主按钮：去生成交付包（跳转 `/diagnosis` 或 `/dashboard/quick-start`）
- 不出现微信号（体验卡路径先站内闭环）

### 4.3 API：`POST /api/activation`
入参：
```json
{
  "email": "xxx",
  "platform": "xiaohongshu",
  "orderTail": "1234",
  "note": "可选"
}
```

后端逻辑（复用 `/api/leads` 防刷策略）：
- 2 秒内重复提交：返回 `ok:true` 但不落库。
- 1 分钟内超过 3 次：`429`。
- 记录：`utm_*`、`referrer`、`landing_path`、`user_agent`、`source`、`ip_hash`。

返回：
```json
{ "ok": true, "activationId": "uuid", "status": "pending" }
```

### 4.4 数据表：`activation_requests`
字段建议：
- `id uuid pk`
- `created_at timestamptz`
- `user_id uuid nullable`
- `email text not null`
- `platform text not null default 'xiaohongshu'`
- `order_tail text not null`
- `status text not null default 'pending'`（pending/approved/rejected）
- `source text, utm_* text, referrer text, landing_path text, user_agent text, ip_hash text`
- `approved_at timestamptz nullable`
- `expires_at timestamptz nullable`（开通 7 天时写）

RLS：用户只能读自己的记录（按 `user_id` 或 `email` 匹配，二选一即可）。

### 4.5 权益开通（先半自动，但代码要能承接自动化）
- 当 activation 被标记为 `approved`：
  - 给 user 写入 `trial_pro` 权益：`start=now, end=now+7 days`。
  - 前端能识别“我已是 trial_pro”，并解锁交付包生成。
- 无需先做后台审批 UI，可用 Supabase 后台手动改 `status`，但前端必须支持 `approved` 的解锁逻辑。

## 5) 关键功能二：诊断流程 v2（问题匹配 + 评分口径修正）
### 5.1 诊断页定位必须改
- 标题建议替换：
  - 「内容交付系统诊断（5分钟）」  
  - 「找出你团队交付卡点，直接生成 7 天排产 + 脚本 + 质检清单」
- 诊断页必须直接展示交付件清单（强证据）：
  - 五维评分（0-10）
  - Top3 优先级动作
  - 7天内容日历（xlsx）
  - 10条高意图选题（csv）
  - 3条可拍脚本（md）
  - 质检清单（pdf）
  - 归档规则（md）

### 5.2 删除/改掉信任杀手
- “已有 1,234 人完成诊断”：
  - 方案 A：删掉（最快、安全）
  - 方案 B：接真实数据（从 `diagnosis_results` 或 events 聚合实时统计）
- “添加微信领取 1V1 诊断解读”：从体验链路移除（可放结果页底部弱化展示）。

### 5.3 题目集重做（保持 8 题）
要求：匹配 B 端交付视角，且每题必须映射到交付包 JSON 字段。

建议题目（直接替换配置）：
1) 你是谁（`account_type`）：代运营团队 / MCN矩阵 / 品牌内容部 / 个人创作者  
2) 你的行业/赛道（`industry`）：餐饮/美业/教育/本地生活/电商/企业服务/其他  
3) 你主战平台（`platform`）：小红书 / 抖音 / 视频号 / 公众号 / 多平台  
4) 团队规模（`team_size`）：1人 / 2-3人 / 4-8人 / 9+ / 外包协作  
5) 目前交付形态（`delivery_mode`）：靠经验口头对齐 / 有部分 SOP / SOP 完整但执行不稳 / SOP 完整且可复盘  
6) 目前最大卡点（`current_problem`，多选）：选题体系缺失 / 内容日历排不出来 / 脚本产出慢/质量不稳 / 返工多口径乱（缺质检标准）/ 转化链路不清 / 素材/知识不沉淀  
7) 周产出能力（`weekly_output`）：0-2 / 3-5 / 6-15 / 16+  
8) 你希望 30 天内达成什么（`goal`）：拉新获客 / 建立信任 / 成交转化 / 团队交付稳定 / 多项目并行

### 5.4 评分口径（必须修）
- 五维评分必须是 0-10，不要百分比，不要“击败 XX% 同行”。
- 禁止输出“行业排名/前 20%/击败 22% 同行”等无法校验数字。
- 保证每个维度至少有一个题贡献分数（避免出现“某维度 0%”）。

## 6) 关键功能三：交付包 v2（核心：JSON → 渲染 → ZIP）
### 6.1 生成入口
- 诊断结果页新增区域：「生成交付包（7天日历+脚本+质检）」。
- 未登录：先跳登录（带 redirect 回结果页）。
- 未解锁（无 trial_pro/pro 权益）：展示 paywall（文案见 7.2）。

### 6.2 输入 Schema（最小 + 可补充）
Layer 1：诊断 8 题直接得到的字段  
Layer 2：生成交付包时可选补充

最终入参：
```json
{
  "industry": "...",
  "platform": "...",
  "account_type": "...",
  "team_size": "...",
  "delivery_mode": "...",
  "weekly_output": "...",
  "goal": "...",
  "current_problem": ["..."],
  "product_or_service": "",
  "target_audience": "",
  "price_range": "",
  "tone": ""
}
```

### 6.3 LLM 合同（必须先产 JSON）
- 新增 JSON Schema：`schemas/delivery_pack_v2.schema.json`。
- LLM 输出必须是严格 JSON（parse 失败重试一次）。
- 输出结构：
```json
{
  "scorecard": { "dimensions": [], "core_bottleneck": "...", "top_actions": [] },
  "calendar_7d": [],
  "topic_bank_10": [],
  "scripts_3": [],
  "qc_checklist_10": [],
  "archive_rules": {},
  "upgrade_suggestion": {}
}
```

硬规则过滤：  
文本出现“击败/超过/行业排名/前%/top%/领先xx%”等关键词时，直接删除该句或替换为“基于输入的推断”，并记录到日志。

### 6.4 文件渲染器（Node runtime）
API route 必须使用 `runtime = 'nodejs'`。

输出文件：
- `README_开始使用.md`
- `01_交付体检单_五维评分.pdf`
- `02_7天内容日历.xlsx`
- `03_选题库_10条高意图.csv`
- `04_可拍脚本_3条.md`
- `05_发布质检清单_10项.pdf`
- `06_去重归档规则.md`
- `07_升级建议.md`

PDF 必须支持中文字体（字体文件放在 `public/fonts/` 或 `assets/fonts/`）。

推荐库（任选其一，需一次做对）：
- xlsx：`exceljs`
- zip：`archiver` 或 `jszip`
- pdf：`@react-pdf/renderer` 或 `pdf-lib`

### 6.5 存储与下载
- 不要只存本地临时目录，线上会丢。
- 使用 Supabase Storage 新 bucket：`delivery-packs`。
- 路径规范：`{user_id}/{pack_id}/交付包_{industry}_{YYYYMMDD}.zip`
- 下载：签名 URL（有效期 10 分钟）。

### 6.6 API 设计
- `POST /api/delivery-pack/generate`
  - 权限：必须登录 + 有 trial_pro/pro 权益
  - 返回：`{ packId, status }`
- `GET /api/delivery-pack/:packId`
  - 返回 pack 状态 + 文件列表
- `GET /api/delivery-pack/:packId/download`
  - 返回 zip 下载（或 302 到 signed url）

### 6.7 数据表（最小实现）
`delivery_packs`：
- `id, user_id, created_at, status(pending|done|failed), input_json, output_json, zip_path, error_message`

RLS：用户仅能访问自己的 pack。

### 6.8 防滥用
- 免费用户：禁止生成，或每天仅 1 次（二选一）。
- trial/pro：每天限制次数（例如 3 次），超限提示升级/预约演示。
- 所有 generate 接口套用 `/api/leads` 的 `ip_hash + 限流逻辑`。

## 7) 变现承接（把“交付包”变成升级按钮）
### 7.1 诊断结果页改造（核心）
- 上半屏：五维评分（0-10）+ 核心瓶颈（1 条）+ Top3 动作（3 条）
- 中部：交付包预览（强证据）
  - 日历表格缩略（可灰化/模糊）
  - 脚本 S1/S2/S3 标题预览（可灰化/模糊）
  - 质检清单预览（可灰化/模糊）
- 下半屏：主 CTA
  - 已解锁：生成交付包并下载（zip）
  - 未解锁：激活 7 天体验卡 / 升级 Pro（跳 `/activate` 或 `/demo`）

### 7.2 paywall 文案（讲“拿到什么”）
标题：解锁「7天交付包」  
Bullets：
- 7天内容日历（xlsx）
- 10条高意图选题（csv）
- 3条可拍脚本（md）
- 质检清单（pdf）
- 归档规则（md）

CTA：
- 去激活体验卡（`/activate`）
- 预约顾问演示（`/demo`）

## 8) 埋点（必须做）
复用 `/api/track`，新增/规范事件：
- `activation_open`
- `activation_submit`
- `activation_submit_success`
- `delivery_pack_generate_start`
- `delivery_pack_generate_success`
- `delivery_pack_generate_fail`
- `delivery_pack_download`
- `paywall_view`
- `paywall_cta_click`（activate / demo）

每个事件都要带：
- `source`（xiaohongshu / organic / ...）
- `utm_*`
- `landingPath`
- `referrer`
- `diagnosisId`（如果有）
- `userId`（登录态有就传）

## 9) Codex 任务拆解（按这个顺序做）
Task A：体验卡激活页 + API + 表  
Task B：诊断题库 v2 + 评分修正  
Task C：交付包 v2 生成器（JSON → 文件 → ZIP）  
Task D：变现承接与体验优化

## 10) 验收清单（写死，避免“看起来差不多”）
- `/diagnosis` 页面不再显示“1,234”等假数据（除非接真实统计）。
- `/activate` 可用：提交后 `activation_requests` 有记录（含 utm/source/ip_hash）。
- 激活通过后（手工改 `status=approved` 也行），用户能看到“已解锁”，并能生成交付包。
- 交付包 zip 内文件齐全（按本说明 7 个文件）。
- 交付包内容不包含“击败xx%同行/行业排名”等词。
- `events` 表可见关键事件：`activation_submit`、`delivery_pack_download`。
