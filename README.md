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
