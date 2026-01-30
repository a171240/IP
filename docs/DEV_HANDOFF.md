# IP内容工厂 · 开发交接文档（本地换机继续开发）

更新时间：2026-01-30

## 1. 本地环境准备
- Node.js：建议 20.x
- pnpm：建议 10.x

## 2. 拉取代码
```bash
git clone https://github.com/a171240/IP.git
cd IP
```

## 3. 环境变量
从模板生成本地环境文件，并按实际填写：
```powershell
Copy-Item .env.example .env.local
```

必须填写（最少跑通闭环）：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CREDITS_IP_SALT`
- `APIMART_API_KEY`
- `APIMART_BASE_URL`（默认 https://api.evolink.ai/v1）
- `APIMART_MODEL`（建议 kimi-k2-thinking-turbo 或 kimi-k2-thinking）

如需微信支付 / 小程序登录，再补齐微信相关变量。

## 4. 安装依赖 & 启动
```bash
pnpm install
pnpm dev
```
默认端口：`http://localhost:3000`

## 5. Supabase 迁移
推荐在 Supabase 控制台 SQL 编辑器执行 `supabase/migrations` 中的 SQL。

关键表/字段：
- `activation_requests`
- `entitlements`
- `delivery_packs.pdf_path`（已由 zip_path 改名）
- `redeem_codes`
- `analytics_events`

## 6. 核心页面/接口位置
- 兑换码入口页：`/activate`（含兑换逻辑）
  - 页面：`app/activate/page.tsx`
  - 兑换接口：`app/api/redeem/route.ts`
  - 激活兜底：`app/api/activate/route.ts`
- 诊断流程：
  - 问卷页：`app/diagnosis/quiz/page.tsx`
  - 结果页：`app/diagnosis/result/[id]/page.tsx`
  - 结果客户端：`app/diagnosis/result/[id]/result-client.tsx`
- 交付包生成：
  - 生成接口：`app/api/delivery-pack/generate/route.ts`
  - 生成逻辑：`lib/delivery-pack/generate.ts`
  - JSON Schema：`lib/delivery-pack/schema.ts`
  - 文本清洗：`lib/delivery-pack/sanitize.ts`
  - PDF 渲染：`lib/delivery-pack/pdf.ts`
  - 下载接口：`app/api/delivery-pack/[packId]/download/route.ts`
- 在线预览页：
  - `app/delivery-pack/[packId]/page.tsx`

## 7. 闭环验证路径（本地）
1) `/activate` 输入兑换码 + 邮箱 → 兑换成功  
2) `/diagnosis/quiz` 完成诊断  
3) `/diagnosis/result/[id]` 生成 PDF  
4) `/delivery-pack/[packId]` 在线预览  
5) `/api/delivery-pack/[packId]/download` 下载 PDF

## 8. 已知注意点（换机后容易踩坑）
- 兑换码逻辑依赖 Supabase Auth；确保 `SUPABASE_SERVICE_ROLE_KEY` 正确。
- 交付包生成依赖 LLM；若超时/失败，先检查 `APIMART_*` 配置与网络。
- `delivery_packs` 已改为 `pdf_path` 字段，代码与库表需一致。

## 9. Git 提交流程（本地）
```bash
git status
git add .
git commit -m "feat: handoff + result cleanup"
git push
```

> 注意：不要提交 `dev-server.pid`、`dev-server*.log`、`e2e-*.png` 等本地产物。

