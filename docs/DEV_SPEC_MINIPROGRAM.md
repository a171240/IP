# IP工厂小程序 v1 融合开发文档（单域名 + 共用账号/权益/积分）

更新时间：2026-02-06  
适用范围：`d:\IP网站\mini-program-ui`（微信小程序） + `d:\IP网站`（IP内容工厂网站/后端） + `d:\IP网站\xiaoshouzhushou1`（小红书能力上游）

## 0. 结论先行（你已确认的产品约束）

1. **小程序只依赖一个备案域名**：`https://ip.ipgongchang.xin`（小程序 request 合法域名只配这一条）。  
2. **账号/权益/积分共用一套**：以 IP 工厂的 Supabase 用户体系为准（`/api/wechat/login` 下发 Supabase Session Token）。  
3. **两站能力融合的实现方式**：小程序只调用 IP 工厂域名；由 IP 工厂在服务端代理/整合“小红书能力”，并统一做鉴权、扣积分、埋点、风控与审计。

## 0.5 本次已落地（代码清单）

- 后端（`d:\IP网站`）
  - 统一权益快照：`GET /api/mp/profile`（`app/api/mp/profile/route.ts`）
  - 小程序工作台聚合：`GET /api/mp/workbench`（`app/api/mp/workbench/route.ts`）
  - 小程序订单列表：`GET /api/mp/orders`（`app/api/mp/orders/route.ts`）
  - 小红书 BFF：`/api/xhs/*`（rewrite + danger-check + cover + publish）
  - 小红书草稿库：
    - `GET/POST /api/mp/xhs/drafts`（`app/api/mp/xhs/drafts/route.ts`）
    - `GET /api/mp/xhs/drafts/[draftId]`（`app/api/mp/xhs/drafts/[draftId]/route.ts`）
  - 单域名图片代理：
    - `GET /api/mp/xhs/covers/[draftId]`（封面）
    - `GET /api/mp/xhs/qrs/[draftId]`（发布二维码）
  - 单域名交付包接口：
    - `GET /api/mp/delivery-pack/latest`
    - `GET /api/mp/delivery-pack/[packId]`
    - `GET /api/mp/delivery-pack/[packId]/download`（不再 redirect 到 supabase 域名）
  - 小程序支付 JSAPI：`POST /api/wechatpay/jsapi/unified-order`
  - IP工厂工作流（小程序版，P7/P8 优先）
    - 依赖上下文：`GET /api/mp/workflow/context?stepId=P7|P8`
    - 报告沉淀：`GET/POST /api/mp/reports`，`GET /api/mp/reports/[reportId]`
    - 统一素材库聚合：`GET /api/mp/library`
- 小程序（`d:\IP网站\mini-program-ui`）
  - 单域名配置：移除 `XHS_BASE_URL`，统一请求 `IP_FACTORY_BASE_URL`
  - 工作台：动态聚合权益/进度/最近草稿/交付包（`pages/workspace/*`）
  - IP工厂入口页：`pages/ip-factory/*`（导航：P7/P8/素材库/小红书）
  - P7 选题库：`pages/workflow-p7/*`（调用 `/api/chat?stepId=P7`，并保存到 `/api/mp/reports`）
  - P8 脚本创作：`pages/workflow-p8/*`（调用 `/api/chat?stepId=P8` + agentId，保存到 `/api/mp/reports`）
  - 统一素材库：`pages/library/*`（聚合 reports + xhs草稿 + 交付包）
  - 报告查看：`pages/report-viewer/*`
  - 小红书页：调用 `/api/xhs/*`，并通过 `draft_id` 自动落库到草稿库；权益/积分不足时引导去支付页
  - 草稿库页：`pages/xhs-drafts/*`（从草稿库查看历史并继续编辑/发布）
  - 支付页：接入 `wx.requestPayment`，并在支付后触发状态同步与权益开通
  - 我的页：展示套餐与积分（实时从 `/api/mp/profile` 拉取）
  - 订单页：展示最近订单（从 `/api/mp/orders` 拉取）
- 数据库
  - `wechatpay_orders` 增加 `prepay_id` 字段（见 `lib/supabase/wechatpay.sql`）
  - 新增 `xhs_drafts` 表：`supabase/migrations/20260206_add_xhs_drafts.sql`
  - 工作流报告与进度表（若生产库缺失需补齐）：`reports`、`workflow_progress`（在 `lib/supabase/schema.sql` 中有定义）
  - 新增存储桶（建议）：`xhs-assets`（封面/二维码等资产；服务端写入）

---

## 1. 项目现状（深度检索结果）

### 1.1 仓库结构（与本次任务强相关）

- IP内容工厂（Next.js 16）：仓库根目录 `d:\IP网站`
  - 认证/积分：`lib/pricing/*`、`app/api/chat/route.ts`、`app/api/prompts/route.ts`
  - 诊断：`app/api/diagnosis/*`
  - 交付包（PDF + 预览）：`app/api/delivery-pack/*`、`lib/delivery-pack/*`
  - 埋点：`app/api/track/route.ts`、表 `analytics_events`（见迁移 `supabase/migrations/20250211_add_leads_and_analytics_events.sql`）
  - 微信登录：`app/api/wechat/login/route.ts`
  - 微信支付（目前是 Native 扫码）：`app/api/wechatpay/native/*` + 回调 `app/api/wechatpay/notify/route.ts`
- 小程序工程：`d:\IP网站\mini-program-ui`
  - 已实现：微信一键登录（静默/授权）、诊断问卷/结果、工作台（权益/进度/最近草稿/交付包聚合）、小红书工坊（经由 IP 工厂 BFF：`/api/xhs/*`，单域名调用 + 草稿落库）、支付（JSAPI + `wx.requestPayment`）、IP工厂 P7/P8（选题库/脚本）、统一素材库（reports + 草稿 + 交付包）
  - 待补齐：IP工厂 P1-P6/P9-P10/IP传记等步骤的小程序交互（目前小程序优先落地 P7/P8）
- 小红书能力工程（上游服务）：`d:\IP网站\xiaoshouzhushou1`
  - 提供接口：`/api/rewrite-premium`、`/api/content/danger-check`、`/api/generate-cover-image`、`/api/publish-note` 等
  - 目标：作为“上游能力”，不再让小程序直连；由 IP 工厂服务端代理

### 1.2 小程序域名依赖（已改为单域名）

小程序配置：`mini-program-ui/utils/config.js`

```js
const IP_FACTORY_BASE_URL = "https://ip.ipgongchang.xin"
const API_BASE_URL = IP_FACTORY_BASE_URL
```

小程序请求封装：`mini-program-ui/utils/request.js`

- 只有当 `baseUrl === IP_FACTORY_BASE_URL` 时才会附带：
  - `Authorization: Bearer <supabase access_token>`
  - `x-device-id: <deviceId>`
- 这意味着：只要我们让小程序**所有能力都请求 IP_FACTORY_BASE_URL**，鉴权与积分逻辑才能统一。

### 1.3 支付现状（必须补 JSAPI）

- IP 工厂已实现微信支付 **Native 扫码**下单：`app/api/wechatpay/native/unified-order/route.ts`
- 小程序必须走 **JSAPI（小程序内）**：需要后端返回 `prepay_id` + 签名参数，前端调用 `wx.requestPayment`。
- 结论：需要在 IP 工厂补一套 **JSAPI 下单 API**（复用现有 wechatpay_orders 表与 fulfill 逻辑）。

---

## 2. 目标架构（单域名融合）

### 2.1 数据与鉴权主线

1. 小程序启动：`mini-program-ui/app.js` → `loginSilent()` → 调 `POST https://ip.ipgongchang.xin/api/wechat/login`
2. IP 工厂后端用微信 `code` 换 `openid`，创建/登录 Supabase 用户并返回 session：`app/api/wechat/login/route.ts`
3. 小程序把 `access_token/refresh_token/user` 存入 storage（已实现：`mini-program-ui/utils/auth.js`）
4. 后续小程序请求统一走 `https://ip.ipgongchang.xin/api/*` 并带 `Authorization`，IP 工厂按现有逻辑：
   - 校验 plan
   - 扣积分（或试用发放）
   - 写埋点

### 2.2 小红书能力的融合方式（BFF 代理）

新增：IP 工厂 API 作为 **BFF**，在服务端请求上游 `xhs.ipgongchang.xin`（或未来直接内置逻辑），对小程序暴露同构接口：

- `/api/xhs/rewrite-premium`
- `/api/xhs/content/danger-check`
- `/api/xhs/generate-cover-image`
- `/api/xhs/publish-note`

核心点：**小程序不再请求 `xhs.ipgongchang.xin`**，只请求 `ip.ipgongchang.xin`。

增强点（建议/已支持）：

- 小程序先 `POST /api/mp/xhs/drafts` 创建草稿拿到 `draft_id`，后续调用 `/api/xhs/*` 时把 `draft_id` 一并带上
  - 服务端会把生成结果/风控/封面/发布结果写入 `xhs_drafts`，形成“素材库/历史”
  - 封面与发布二维码会被存储并通过 `ip.ipgongchang.xin` 代理输出（避免小程序依赖第二个域名）

---

## 3. 后端开发（IP 工厂）规格

### 3.1 必新增：小程序统一“用户权益快照”接口

目的：小程序“工作台/我的”需要实时展示 plan、积分余额、是否无限、是否有 Pro 体验等。

推荐新增：

- `GET /api/mp/profile`

返回（建议）：

```json
{
  "ok": true,
  "user": { "id": "...", "email": "...", "nickname": "...", "avatar_url": "..." },
  "profile": { "plan": "free|basic|pro|vip", "plan_label": "体验版|Plus|Pro|企业版", "credits_balance": 30, "credits_unlimited": false },
  "entitlements": { "plan": "trial_pro|pro|vip|null", "pro_expires_at": "..." }
}
```

实现要点：

- 使用 `createServerSupabaseClientForRequest(request)`（会识别 Bearer token）。
- 读取/必要时创建 `profiles`（参考 `lib/pricing/profile.server.ts` + `app/api/chat/route.ts` 逻辑）。
- 同时读取 `entitlements`（交付包生成等 API 已在用 entitlement 判断逻辑，可复用）。

### 3.2 必新增：小红书能力代理（BFF）

#### 3.2.1 统一上游地址与鉴权

建议在 IP 工厂新增 env：

- `XHS_UPSTREAM_BASE_URL=https://xhs.ipgongchang.xin`（本地可指向 `http://localhost:3001` 等）
- `XHS_UPSTREAM_API_KEY=`（如上游需要；如果上游不需要可不配）

并在 BFF 统一做：

- 登录校验（无 token 直接 401）
- plan/积分规则：建议将“小红书工坊”定义为 **basic 起**，publish 定义为 **pro 起**（可按业务改）
- 统一错误格式（返回 `{ error, code, ... }`，小程序端好处理）
- 统一埋点：每个动作写 `analytics_events`

#### 3.2.2 端点列表（建议）

1. `POST /api/xhs/rewrite-premium`
   - 入参：`{ topic, keywords, shopName, contentType }`
   - 输出：保持与当前小程序解析逻辑兼容
     - 推荐直接透传上游的 SSE 文本（小程序用 `requestText + parseSsePayload` 已可解析）
2. `POST /api/xhs/content/danger-check`
   - 入参：`{ content }`
   - 输出：JSON（透传即可）
3. `POST /api/xhs/generate-cover-image`
   - 入参：`{ content, contentType, preExtracted }`（与现有一致）
   - 输出：JSON（包含 base64 或 URL）
4. `POST /api/xhs/publish-note`
   - 入参：`{ title, content, coverImageUrl, tags }`
   - 输出：JSON（publishUrl、qrImageUrl 等）

#### 3.2.3 积分扣减建议（可落到规则）

建议把小红书模块的扣分 stepId 标准化，便于漏斗统计：

- `xhs:rewrite-premium`（2~4 积分/次）
- `xhs:danger-check`（0 积分/次）
- `xhs:generate-cover`（2~4 积分/次）
- `xhs:publish-note`（Pro 权益或高积分）

扣分实现可复用：`lib/pricing/profile.server.ts` 的 `ensureTrialCreditsIfNeeded/consumeCredits`。

### 3.3 必新增：微信支付 JSAPI（小程序内支付）

现状：已有 Native 扫码；小程序需要 JSAPI。

建议新增：

- `POST /api/wechatpay/jsapi/unified-order`

入参（建议）：

```json
{ "product_id": "basic_month|pro_month", "idempotency_key": "..." }
```

返回（建议）：

```json
{
  "out_trade_no": "...",
  "client_secret": "...",
  "pay": {
    "timeStamp": "...",
    "nonceStr": "...",
    "package": "prepay_id=xxx",
    "signType": "RSA",
    "paySign": "..."
  }
}
```

实现要点：

- 必须从当前登录用户取到 `wechat_openid`（在 `app/api/wechat/login/route.ts` 中已写入 `user_metadata.wechat_openid`）。
- 下单接口调用微信支付 v3：`/v3/pay/transactions/jsapi`，并写入 `wechatpay_orders`：
  - `user_id` 直接写当前用户（小程序场景不需要 claim）
  - `product_id` 写入套餐 ID，便于 `tryFulfillWechatpayOrder` 自动开通
  - `client_secret` 继续保留（用于对外查单/幂等/排障）
- 建议在 `wechatpay_orders` 增加 `prepay_id` 字段，便于幂等与排障（本仓库已更新 `lib/supabase/wechatpay.sql`）
- 回调仍走 `POST /api/wechatpay/notify`（已存在），支付成功后自动 fulfill（已存在：`lib/wechatpay/fulfill.server.ts`）

### 3.4 已实现：订单列表接口（给小程序“订单页”）

现状：网页端查询订单用 `GET /api/wechatpay/orders/[outTradeNo]?secret=...`。  
小程序更适合：登录态下直接拉自己的订单列表。

已实现：

- `GET /api/mp/orders?limit=20`
  - 代码：`app/api/mp/orders/route.ts`

数据来源：`wechatpay_orders` 按 `user_id = auth.uid()` 拉取最近订单（用 service_role 或合适 RLS）。

---

## 4. 小程序开发（mini-program-ui）规格

### 4.1 基础改造（单域名）

已落地（当前代码现状）：

1. `mini-program-ui/utils/config.js`
   - 已删除 `XHS_BASE_URL`
   - 只保留单域名 `IP_FACTORY_BASE_URL`，并令 `API_BASE_URL = IP_FACTORY_BASE_URL`
2. `mini-program-ui/pages/xiaohongshu/index.js`
   - 已统一改为请求 `baseUrl: IP_FACTORY_BASE_URL` + url 改为 `/api/xhs/...`
3. `mini-program-ui/utils/request.js`
   - `requestText` 已增强：非 2xx 的 text 响应会尝试解析 JSON，便于识别 `plan_required / insufficient_credits`

### 4.2 页面改造清单（按变现优先级）

#### P0：支付闭环（不做就无法变现）

- `pages/pay/index.js`
  - 点击“立即支付”：
    1. 调 `POST /api/wechatpay/jsapi/unified-order` 拿 pay 参数
    2. `wx.requestPayment(pay)` 调起支付
    3. 支付完成后：
       - 调 `GET /api/wechatpay/orders/[outTradeNo]?secret=...` 同步支付状态（必要时服务端会 query 微信支付）
       - 调 `POST /api/wechatpay/orders/claim` 触发 fulfill（防止 notify 延迟导致权益未及时开通）
       - 调 `GET /api/mp/profile` 刷新权益与积分
       - 跳转“支付结果页”（可新建 `pages/pay-result/index`）或 toast + 返回

#### P0：我的页展示权益与积分（承接升级）

- `pages/mine/index.js`
  - `onShow` 拉 `GET /api/mp/profile`，展示：
    - 头像/昵称
    - 当前套餐（plan_label）
    - 积分余额 / 是否无限
    - “升级套餐”按钮跳 `pages/pay/index`

#### P0：小红书工坊迁移到单域名 + 权益统一

- `pages/xiaohongshu/index.js`
  - 调用新 BFF `/api/xhs/*`
  - 处理后端 `plan_required / insufficient_credits`：
    - 引导去 `pages/pay/index`
  - 已增强：生成前创建草稿（`POST /api/mp/xhs/drafts`），并在 `/api/xhs/*` 请求中携带 `draft_id` 自动落库
    - 封面与发布二维码会被代理到 `ip.ipgongchang.xin`（单域名展示）

#### P1：交付包（PDF）引入小程序，完成“诊断 → 交付 → 复购”

- 在 `pages/diagnosis-result/index.wxml` 增加：
  - “生成交付包（PDF）”按钮 → 调 `POST /api/delivery-pack/generate`
  - 轮询 `GET /api/mp/delivery-pack/[packId]` 直到 done（Bearer token）
  - “打开预览 / 下载 PDF / 一键复制明天第一条”：
    - 下载：打开 `GET /api/mp/delivery-pack/[packId]/download`（服务端直出 PDF，避免 redirect 到第二域名）
    - 预览：小程序端需要一个“卡片化预览页”（建议新增 `pages/delivery-pack/index`，用 output_json 渲染并提供复制按钮）

#### P1：工作台（让用户天天打开，提升续费）

- `pages/workspace/index.js` 已接入：
  - `GET /api/mp/workbench`（聚合：积分、进度、最近草稿/交付包/订单、快捷入口）
  - `wx.downloadFile` → `GET /api/mp/delivery-pack/[packId]/download` → `wx.openDocument`（单域名打开 PDF）

#### P1.5：IP 工厂 P7/P8 + 素材库（已落地，当前优先做 2/3）

- 页面（小程序）
  - `pages/ip-factory/index`：入口导航（P7/P8/素材库/小红书）
  - `pages/workflow-p7/index`：P7 选题库生成（可保存到素材库）
  - `pages/workflow-p8/index`：P8 脚本创作（支持 agent 风格；可保存到素材库）
  - `pages/library/index`：统一素材库（聚合 reports + 小红书草稿 + 交付包）
  - `pages/report-viewer/index`：报告查看/复制

- 后端（IP 工厂，单域名）
  - `GET /api/mp/workflow/context?stepId=P7|P8`
    - 返回该 step 的“推荐依赖报告”列表（从 `reports` 取最近版本）+ 缺失项提示
    - 当前依赖映射（可调整）：
      - P7 required：`P1,P3,P6,IP传记`；optional：`P10`
      - P8 required：`P7`；optional：`P1,P3,P6,IP传记,P10`
  - `POST /api/chat`
    - `stepId=P7|P8`
    - 可选：`agentId`（P8）
    - 可选：`context: { reports: [{ report_id }] }`（服务端会读取报告内容作为参考）
    - 返回：SSE 文本（`data: {"content": "..."} ... [DONE]`）
  - `POST /api/mp/reports`
    - 保存 P7/P8 输出到 `reports`
    - best-effort 标记 `workflow_progress` 为 completed（如果你后续要在小程序展示步骤完成度，可直接复用）
    - P7 特性：服务端会从 `content` 提取选题条目，写入 `metadata.p7_topics: string[]`（供素材库展示“单条选题”）
    - P8 特性：若 `metadata.p7ReportId + metadata.topic` 存在，服务端会把该 topic 标记到 P7 的 `metadata.p7_topics_used`
  - `PATCH /api/mp/reports/[reportId]`（小程序素材库：手动标记选题已用/未用）
    - `{"op":"p7_topic_used","topic":"..."}`：标记已用
    - `{"op":"p7_topic_unused","topic":"..."}`：撤销已用
    - `{"op":"merge_metadata","metadata_patch":{...}}`：浅合并 metadata（用于兼容/补数据）
  - `GET /api/mp/library`
    - 聚合：`reports(P7-P10)` + `xhs_drafts` + `delivery_packs`
  - `POST /api/mp/xhs/drafts`（支持“P8脚本 → 一键转小红书草稿”）
    - 用途：把已有脚本/内容直接沉淀到 `xhs_drafts`，并跳转到 `pages/xiaohongshu` 继续“封面/风控/发布”
    - 关键字段（新增可选）：
      - `resultTitle`、`resultContent`、`coverTitle`、`tags`
      - `sourceReportId`：若传入，会在 `reports.metadata` 写入 `xhs_draft_id`（用于素材库显示“已转草稿/已发布”）

示例（小程序调用形态，均走 `https://ip.ipgongchang.xin`，并携带 `Authorization: Bearer <token>`）：

1) 获取 P7 上下文（用于自动带参考报告 + 缺失提示）

- `GET /api/mp/workflow/context?stepId=P7`

返回（示例）：

```json
{
  "ok": true,
  "step_id": "P7",
  "required": ["P1", "P3", "P6", "IP传记"],
  "optional": ["P10"],
  "reports": [
    { "step_id": "P1", "report_id": "uuid...", "title": "P1 报告", "created_at": "2026-02-06T00:00:00.000Z" }
  ],
  "missing_required": ["P3", "P6", "IP传记"],
  "missing_optional": ["P10"]
}
```

2) 生成 P7（/api/chat 返回 SSE 文本，小程序端再解析）

- `POST /api/chat`

请求（示例）：

```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "stepId": "P7",
  "context": { "reports": [{ "report_id": "uuid..." }] },
  "allowCreditsOverride": true
}
```

3) 保存 P7/P8 报告到素材库（沉淀到 `reports`）

- `POST /api/mp/reports`

请求（示例）：

```json
{
  "step_id": "P7",
  "title": "《选题库》2026-02-06",
  "content": "...",
  "metadata": { "source": "mp" }
}
```

返回（示例）：

```json
{ "ok": true, "report": { "id": "uuid...", "created_at": "2026-02-06T00:00:00.000Z" } }
```

4) 拉取统一素材库（聚合展示）

- `GET /api/mp/library?limit=20`

返回（示例）：

```json
{
  "ok": true,
  "library": {
    "reports": [{ "id": "uuid...", "step_id": "P7", "title": "《选题库》...", "created_at": "..." }],
    "xhs_drafts": [{ "id": "uuid...", "status": "draft", "cover_url": "/api/mp/xhs/covers/uuid..." }],
    "delivery_packs": [{ "id": "uuid...", "status": "done", "download_url": "/api/mp/delivery-pack/uuid.../download" }]
  }
}
```

#### P2：IP 工厂工作流（P1-P6/P9-P10/IP传记）继续上小程序（下一步）

建议做法：继续复用同一套“生成 + 保存 + 素材库沉淀”链路。

- 后端：在 `app/api/mp/workflow/context/route.ts` 为新 step 增加依赖映射（required/optional）
- 小程序：优先做一个通用 step 页面（例如 `pages/workflow-step/index?stepId=P1`），避免为 P1-P10 每一步写一套 UI

---

## 5. 埋点与漏斗（小程序必须补）

后端已存在：`POST /api/track` → `analytics_events`。

小程序已新增 `mini-program-ui/utils/track.js`（并在关键页调用）：

- 统一把事件发到 `POST /api/track`
- props 必带：
  - `source`（mp）
  - `scene`（xhs / workflow / pay / diagnosis）
  - `userId`（如果能取到就带）
  - `deviceId`（你已经有 `x-device-id`，建议同时写入 props）

建议事件：

- `mp_launch`
- `mp_login_silent_success / mp_login_with_profile_success`
- `pay_view / pay_submit / pay_success / pay_fail / pay_cancel`
- `xhs_generate_submit / xhs_generate_success / xhs_generate_fail`
- `xhs_cover_submit / xhs_cover_success / xhs_cover_fail`
- `xhs_publish_submit / xhs_publish_success / xhs_publish_fail`
- `pay_view / pay_submit / pay_success / pay_fail`
- `diagnosis_submit / diagnosis_success`
- `delivery_pack_generate_submit / delivery_pack_generate_success`

---

## 6. 环境变量与平台配置（上线必做）

### 6.1 IP 工厂（Vercel/生产环境）env

必须：

- Supabase：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`
- 微信小程序登录：`WECHAT_MINI_APPID`、`WECHAT_MINI_SECRET`、`WECHAT_LOGIN_SECRET`
- 积分防刷：`CREDITS_IP_SALT`
- 微信支付 v3：`WECHATPAY_APPID`、`WECHATPAY_MCHID`、`WECHATPAY_SERIAL_NO`、`WECHATPAY_PRIVATE_KEY`、`WECHATPAY_API_V3_KEY`、平台验签公钥/证书（二选一）
- `WECHATPAY_NOTIFY_URL`（公网回调）

建议新增：

- `XHS_UPSTREAM_BASE_URL=https://xhs.ipgongchang.xin`
- （如需要）`XHS_UPSTREAM_API_KEY=...`

### 6.2 微信小程序后台配置

必须把 request 合法域名只配：

- `https://ip.ipgongchang.xin`

并确保：

- 服务器 TLS 合规（微信要求）
- 相关 API 路由不被 WAF/缓存破坏（SSE 文本建议禁缓存）

### 6.3 本地开发与联调（两站 + 小程序）

目标：本地把 **IP 工厂（BFF）** 跑在一个端口，把 **小红书上游** 跑在另一个端口，小程序只打 IP 工厂。

1. 启动 IP 工厂（本仓库根目录：`d:\IP网站`）
   - 安装依赖：`npm i`
   - 启动：`npm run dev`（默认 `http://localhost:3000`）
   - 准备 `.env.local`（参考 `.env.example`，至少要有 Supabase 相关 env；如果要联调支付/登录，补齐微信与微信支付 env）

2. 启动小红书上游（目录：`d:\IP网站\xiaoshouzhushou1`）
   - 安装依赖：`npm i`
   - 启动（建议显式端口）：`npx next dev -p 3001`
     - 注意：该子项目的 `npm run dev` 脚本包含 macOS 的 `open -a`，Windows 下建议直接用 `npx next dev -p 3001`。

3. 配置 IP 工厂把上游指到本地
   - 在 `d:\IP网站\.env.local` 设置：
     - `XHS_UPSTREAM_BASE_URL=http://localhost:3001`

4. 小程序本地联调（`d:\IP网站\mini-program-ui`）
   - 生产必须用备案域名：`https://ip.ipgongchang.xin`（小程序后台只配这一条）。
   - 本地联调两种方式二选一：
     - 方式 A（推荐，最贴近生产）：小程序仍请求 `https://ip.ipgongchang.xin`，用线上环境联调。
     - 方式 B（纯本地）：在微信开发者工具开启“**不校验合法域名**”，并临时把 `mini-program-ui/utils/config.js` 的 `IP_FACTORY_BASE_URL` 改为 `http://localhost:3000`（提测/上线前必须改回备案域名）。

5. 数据库迁移（必须）
   - 新增 `xhs_drafts`：执行 `supabase/migrations/20260206_add_xhs_drafts.sql`
   - 微信支付订单表：确保 `wechatpay_orders` 已包含 `prepay_id`（见 `lib/supabase/wechatpay.sql`）
   - 方式：
     - 直接在 Supabase SQL Editor 执行迁移 SQL；或
     - 使用你现有的 Supabase migration 流程（如果你有 supabase-cli/CI）。

---

## 7. 里程碑（按“先变现再体验”排序）

### P0（1-3 天）：跑通单域名 + 支付闭环 + 小红书能力可用

- IP 工厂：
  - `/api/mp/profile`
  - `/api/xhs/*`（至少 rewrite + danger-check + cover + publish）
  - `/api/wechatpay/jsapi/unified-order`
  - `/api/mp/orders`（可选但推荐）
- 小程序：
  - XHS 页改为请求 `/api/xhs/*`
  - Pay 页接 `wx.requestPayment`
  - Mine 页展示 plan/credits 并可跳转购买
  - 埋点工具 + 关键事件

验收：

- 小程序内从“未登录”到“支付成功权益生效”闭环跑通
- 小红书生成/封面/发布均不需要第二个域名

### P1（3-7 天）：诊断 → 交付包 → 复购承接

- 小程序诊断结果页可生成交付包（PDF）
- 小程序端可预览/复制“明天第一条”
- 工作台聚合页上线（驱动日活）

### P2（7-14 天）：IP 工厂工作流完整上小程序 + 素材库/历史

- P7/P8 优先上（选题/脚本）
- 上线素材库：沉淀 xhs 生成历史、交付包、报告

---

## 8. Codex 执行建议（Skill 与 MCP）

### 8.1 推荐使用的 skills（按场景触发）

- `webapp-testing`：验证 IP 工厂站点接口与页面回归（Playwright 跑 web 漏斗）
- `playwright`：需要自动化浏览器时用（例如回归 `/activate → /pack`）
- `systematic-debugging`：出现 bug / 报错 / 回归失败时先走系统化排查
- `vercel-deploy`：需要发布到 Vercel/预览环境时用

说明：本次“小程序”无法直接用 Playwright 自动跑（微信开发者工具不在浏览器里），但可以用它覆盖 **后端 API + web 端闭环**。

### 8.2 推荐接入的 MCP（做真实上线必备）

- Supabase MCP：执行 SQL（新增表、索引、RLS、bucket）与查数据/埋点
- Vercel MCP：配置环境变量、触发部署、看日志
- Browser/Playwright MCP：跑 web 端 E2E 回归、截图对比
- GitHub MCP：若走 PR 流程与 code review（可选）

---

## 9. 风险与注意事项（别踩坑）

1. **微信小程序 request 合法域名限制**：这是单域名策略的硬约束，所有能力必须在 `ip.ipgongchang.xin` 下闭环。
2. **JSAPI 支付必须有 openid**：后端要能稳定从 Supabase user_metadata 取到 `wechat_openid`；取不到要明确提示“请重新登录”。
3. **SSE/长文本响应**：小程序端当前是“拿到完整 text 再解析”，后端代理时避免中途截断与 gzip 干扰，建议禁缓存。
4. **内容合规**：发布前必须至少跑一次风控（danger-check），并在后端加最基础的黑名单过滤（电话/微信号等），避免触发平台风控。
5. **小程序图片请求不带 Authorization**：`<image src>` 无法附加自定义 header，所以封面/二维码使用 `GET /api/mp/xhs/covers/[draftId]` 与 `GET /api/mp/xhs/qrs/[draftId]` 做单域名直出（目前设计为公开读；`draftId` 为 UUID，仍建议后续加频控与防盗链）。
