# IP内容工厂（本地运行）

## 文档位置（从这里开始）
- **全量开发文档**：`docs/DEV_SPEC_FULL.md`
- **小程序开发文档**：`docs/DEV_SPEC_MINIPROGRAM.md`
- **当前进度/交接文档**：`docs/DEV_HANDOFF.md`

> 新电脑一眼指引：先看 `docs/DEV_HANDOFF.md` 的“接下来要完成什么（P0 未完成项）”。

---

## 环境要求
- Node.js 18+（建议 20.x）
- pnpm 10.x

## 1) 安装依赖
```powershell
pnpm install
```

## 2) 配置 Supabase
1. 在 Supabase 创建项目
2. Project Settings → API → 拷贝 Project URL、anon public key
3. 在项目根目录执行：
```powershell
Copy-Item .env.example .env.local
notepad .env.local
```
填入：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CREDITS_IP_SALT`
- `APIMART_API_KEY`
- `APIMART_BASE_URL`
- `APIMART_MODEL`

可选：执行 `supabase/migrations` 里的 SQL。

## 3) 启动开发
```powershell
pnpm dev
```
浏览器打开：`http://localhost:3000`

## 4) 生产构建/启动
```powershell
pnpm build
pnpm start
```

---

## 微信支付（仅 Native 扫码）
1. 准备可绑定商户号的 AppID（服务号或小程序），填 `WECHATPAY_APPID`
2. 在 Supabase SQL Editor 执行：`lib/supabase/wechatpay.sql`
3. 在环境变量中配置 `SUPABASE_SERVICE_ROLE_KEY` + `WECHATPAY_*`
4. 下单接口：`POST /api/wechatpay/native/unified-order`
5. 回调地址：`POST /api/wechatpay/notify`

---

## 你现在应该做什么？
- 先打开：`docs/DEV_HANDOFF.md`
- 从“接下来要完成什么（P0 未完成项）”开始


