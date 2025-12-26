# IP 内容工厂（本地运行）

## 环境要求
- Node.js 18+（你现在用的 Node 24 也可以）

## 1) 安装依赖
```powershell
cd "D:\IP网站\IP-main"
npm ci
```

## 2) 配置 Supabase
1. 在 Supabase 创建项目
2. 打开 Project Settings → API，复制：Project URL、anon public key
3. 在项目根目录执行：
```powershell
Copy-Item .env.example .env.local
notepad .env.local
```
填入：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

可选：把 `lib/supabase/schema.sql` 粘贴到 Supabase 的 SQL Editor 执行。

## 3) 启动开发
```powershell
npm run dev
```
浏览器打开：`http://localhost:3000`

## 4) 生产构建/启动
```powershell
npm run build
npm run start
```

## 微信支付（仅 Native 扫码）
1. 先准备一个可绑定到商户号的 AppID（服务号或小程序），填 `WECHATPAY_APPID`。
2. 在 Supabase SQL Editor 执行：`lib/supabase/wechatpay.sql`
3. 在 Vercel 配置环境变量：`.env.example` 的 `SUPABASE_SERVICE_ROLE_KEY` + `WECHATPAY_*`
   - 回调验签二选一：`WECHATPAY_PLATFORM_PUBLIC_KEY_ID + WECHATPAY_PLATFORM_PUBLIC_KEY_PEM`（推荐，公钥模式）或 `WECHATPAY_PLATFORM_SERIAL_NO + WECHATPAY_PLATFORM_CERT_PEM`（平台证书模式）
4. 下单接口（未登录可用）：`POST /api/wechatpay/native/unified-order`（body: `{ "amount_total": 100, "description": "xxx" }`，单位：分）
   - 返回：`out_trade_no` + `client_secret` + `code_url`
   - 前端保存 `client_secret`（localStorage/cookie）用于查单/认领
5. 回调地址：`POST /api/wechatpay/notify`（把 `WECHATPAY_NOTIFY_URL` 配成你的公网 HTTPS 地址）
6. 查单接口（未登录可用，但必须带 secret）：`GET /api/wechatpay/orders/:outTradeNo?secret=...`（或 header: `x-order-secret`）
7. 付完再注册/登录后绑定订单：`POST /api/wechatpay/orders/claim`（body: `{ "out_trade_no": "...", "client_secret": "..." }`）
