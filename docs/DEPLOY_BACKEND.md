# 后端部署攻略（Next.js + Supabase + 小程序单域名）

目标：把本仓库（`d:\IP网站`）的 Next.js 后端部署到一个公网 HTTPS 域名（默认按小程序单域名策略：`https://ip.ipgongchang.xin`），并把 Supabase 数据库与 Storage 配好，让小程序可以稳定调用：

- 小程序统一请求：`https://ip.ipgongchang.xin/api/*`
- Supabase 负责：账号/权益/积分/草稿/门店档案/埋点/订单等数据与存储

本文分两套方案：

- 方案 A：Vercel（最快上手，适合先跑通）
- 方案 B：自建服务器（Nginx + PM2，国内稳定性通常更好）

---

## 0. 你需要准备的东西

必须：

- 一个可用于小程序的 **备案 HTTPS 域名**（示例：`ip.ipgongchang.xin`）
- 一个 Supabase 项目（Production）
- Apimart/Evolink 的 `APIMART_API_KEY`（用于内容生成）

如果用小程序微信登录：

- `WECHAT_MINI_APPID`、`WECHAT_MINI_SECRET`
- `WECHAT_LOGIN_SECRET`（随机长串，用于派生密码/登录兜底）

如果用微信支付：

- `WECHATPAY_*` 全套（见 `.env.example`）
- `WECHATPAY_NOTIFY_URL` 指向公网回调地址（示例：`https://ip.ipgongchang.xin/api/wechatpay/notify`）

---

## 1. Supabase 部署（数据库 + Storage）

### 1.1 创建 Supabase 项目

1. Supabase 新建项目（记住数据库密码）
2. Project Settings -> API：
   - 拿到 `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
   - 拿到 `anon public` -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - 拿到 `service_role` -> `SUPABASE_SERVICE_ROLE_KEY`（只放后端环境变量，严禁放小程序/前端）

### 1.2 初始化核心表（新项目必做）

在 Supabase Dashboard -> SQL Editor，新建 Query，依次执行：

1. `lib/supabase/schema.sql`
   - 创建 `public.profiles / ip_projects / conversations / reports / knowledge_docs / workflow_progress`
   - 创建用户触发器（auth.users -> profiles）
   - 创建积分发放/消耗函数

2. （如要微信支付）`lib/supabase/wechatpay.sql`

说明：

- `supabase/migrations/*` 里的迁移会依赖 `public.profiles`，因此 **新库必须先跑 `schema.sql`**。

### 1.3 执行迁移（新增功能表/字段）

在 SQL Editor 依次执行 `supabase/migrations`（按文件名时间顺序）：

- `supabase/migrations/20241224_add_ai_report.sql`
- `supabase/migrations/20241224_create_diagnostic_results.sql`
- `supabase/migrations/20250211_add_leads_and_analytics_events.sql`
- `supabase/migrations/20250212_add_leads_ip_hash_source.sql`
- `supabase/migrations/20250213_add_activation_requests_and_entitlements.sql`
- `supabase/migrations/20250214_add_delivery_packs.sql`
- `supabase/migrations/20250215_fix_activation_requests_legacy.sql`
- `supabase/migrations/20250216_add_redemption_codes.sql`
- `supabase/migrations/20260129_rename_delivery_packs_zip_path_to_pdf_path.sql`
- `supabase/migrations/20260202_add_leads_industry.sql`
- `supabase/migrations/20260202_upgrade_redemption_codes_sku.sql`
- `supabase/migrations/20260206_add_xhs_drafts.sql`
- `supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql`

最小可用（只为了小程序小红书图文 v4）至少要：

- `lib/supabase/schema.sql`
- `supabase/migrations/20260206_add_xhs_drafts.sql`
- `supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql`

### 1.4 Storage Bucket（必须确认）

在 Supabase Dashboard -> Storage：

- 创建 bucket：`delivery-packs`（建议 private）
  - 交付包 PDF 存这里

可选：

- bucket：`xhs-assets`
  - 小红书封面/二维码等资产（默认用这个名字）
  - 说明：后端在首次上传时会尝试自动创建，但建议你还是手工建好，避免权限/网络问题导致首次上传失败。

---

## 2. 后端部署方案 A：Vercel（推荐先跑通）

### 2.1 创建 Vercel 项目并导入仓库

1. 新建 Vercel Project，导入 Git 仓库（或直接上传）
2. Framework 选择 Next.js（一般会自动识别）
3. Build Command 使用默认的 `pnpm build`
   - 本项目 `package.json` 的 `build` 是 `node ./scripts/strict-build.mjs`，会先跑 `eslint` 再 `next build`

### 2.2 配置环境变量（Vercel -> Settings -> Environment Variables）

必须（最低可运行）：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CREDITS_IP_SALT`（生产必须是长随机串）
- `APIMART_API_KEY`
- `APIMART_BASE_URL`（默认是 `https://api.evolink.ai/v1` 也可不填）
- `APIMART_MODEL`（示例：`kimi-k2-thinking`）

小程序登录（需要就填）：

- `WECHAT_MINI_APPID`
- `WECHAT_MINI_SECRET`
- `WECHAT_LOGIN_SECRET`

微信支付（需要就填，按 `.env.example`）：

- `WECHATPAY_APPID`
- `WECHATPAY_MCHID`
- `WECHATPAY_SERIAL_NO`
- `WECHATPAY_PRIVATE_KEY`（注意换行用 `\\n`）
- `WECHATPAY_API_V3_KEY`
- 平台验签二选一（推荐公钥模式）：
  - `WECHATPAY_PLATFORM_PUBLIC_KEY_ID`
  - `WECHATPAY_PLATFORM_PUBLIC_KEY_PEM`（换行用 `\\n`）
- `WECHATPAY_NOTIFY_URL`（示例：`https://ip.ipgongchang.xin/api/wechatpay/notify`）

建议（可选）：

- `XHS_UPSTREAM_BASE_URL=https://xhs.ipgongchang.xin`
- `XHS_ASSETS_BUCKET=xhs-assets`
- `NEXT_PUBLIC_SUPPORT_EMAIL=...`
- `REDEEM_LOGIN_SECRET=...`（若不填会 fallback 到 `WECHAT_LOGIN_SECRET`）

### 2.3 绑定自定义域名（关键：小程序必须备案域名）

Vercel -> Settings -> Domains：

1. 添加域名：`ip.ipgongchang.xin`
2. 按 Vercel 提示到 DNS 里加记录（常见是）：
   - `CNAME`：`ip` -> `cname.vercel-dns.com`
3. 等待 DNS 生效与证书签发完成（Vercel UI 会提示）

### 2.4 部署后验收

1. 访问首页：`https://ip.ipgongchang.xin/` 能打开
2. 访问一个无鉴权接口（用于确认 API 路由已上线）：
   - `GET https://ip.ipgongchang.xin/api/wechatpay/products`
3. 小程序联调：见第 4 节“微信小程序后台配置”

---

## 3. 后端部署方案 B：自建服务器（Nginx + PM2）

适用：你追求国内稳定、低延迟，或不想依赖 Vercel。

以下以 Ubuntu 为例（CentOS 同理）。

### 3.1 服务器初始化

1. 安装 Node.js 20 LTS
2. 安装 pnpm（推荐用 corepack）
3. 安装 pm2
4. 安装 nginx
5. 防火墙放通 80/443

### 3.2 部署代码与构建

在服务器上：

```bash
git clone <你的仓库地址> ip-site
cd ip-site

corepack enable
pnpm install --frozen-lockfile

# 生产构建
pnpm build
```

准备环境变量：

- 方式 1：写到 `.env.local`（不提交 git）
- 方式 2：写到系统服务/pm2 的 ecosystem 配置

至少要包含 `.env.example` 里的关键项（见 2.2 的“必须”）。

### 3.3 启动服务（PM2）

```bash
cd ip-site
pm2 start pnpm --name ip-factory -- start
pm2 save
pm2 status
pm2 logs ip-factory
```

默认监听 `http://127.0.0.1:3000`。

### 3.4 配置 Nginx 反代

创建 `ip.ipgongchang.xin` 站点配置（示例）：

```nginx
server {
  listen 80;
  server_name ip.ipgongchang.xin;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 3.5 配置 HTTPS（Let’s Encrypt）

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ip.ipgongchang.xin
```

验收：

- `https://ip.ipgongchang.xin/` 可访问
- `https://ip.ipgongchang.xin/api/wechatpay/products` 返回 JSON

---

## 4. 微信小程序后台配置（上线必做）

在微信公众平台 -> 小程序 -> 开发管理 -> 开发设置：

把下列合法域名都配成同一个（建议都填 `https://ip.ipgongchang.xin`）：

- request 合法域名
- downloadFile 合法域名
- uploadFile 合法域名
- socket 合法域名（如果不用可以不填）

注意：

- 必须是 `https://`，不能带端口、不能带路径
- 域名必须备案且证书合规（TLS 版本/链路符合微信要求）

本地联调（不走线上域名）：

1. 微信开发者工具开启“**不校验合法域名**”
2. 临时把 `mini-program-ui/utils/config.js` 的 `IP_FACTORY_BASE_URL` 改为 `http://localhost:3000`
3. 提测/上线前务必改回 `https://ip.ipgongchang.xin`

---

## 5. 上线验收清单（建议你按顺序打钩）

1. Supabase
   - `lib/supabase/schema.sql` 已执行
   - `supabase/migrations/20260206_add_xhs_drafts.sql` 已执行
   - `supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql` 已执行
   - Storage bucket `delivery-packs` 已存在

2. 后端
   - `pnpm build` 通过（严格构建会跑 eslint）
   - 线上 `GET /api/wechatpay/products` 返回 200
   - 线上域名 HTTPS 正常

3. 小程序
   - 合法域名配置完成
   - 能静默登录（`POST /api/wechat/login`）
   - 能生成图文（`POST /api/mp/xhs/generate-v4`）
   - 能查看草稿列表（`GET /api/mp/xhs/drafts`）
   - 能下载交付包 PDF（`GET /api/mp/delivery-pack/[packId]/download`）

