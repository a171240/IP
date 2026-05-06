# 2026-05-06 小程序 AI 点与出差交接说明

## Mac 接手先看这里

Mac 上不要按 Windows 盘符理解项目。以后只按 GitHub 仓库接手：

小程序前端：

```bash
git clone https://github.com/a171240/meiye-huajing-miniprogram.git
cd meiye-huajing-miniprogram
```

这个仓库是 private。Mac 上需要先登录有权限的 GitHub 账号，再 clone。

后端/API：

```bash
git clone https://github.com/a171240/IP.git
cd IP
git checkout codex/mp-ui-gptpro-handoff
```

后端当前进度在分支 `codex/mp-ui-gptpro-handoff` 和 Draft PR `https://github.com/a171240/IP/pull/14`，还没有合并到 `main`。Mac 上不要只拉 `main`。

Windows 上的 `E:\美业话镜` 只是小程序前端仓库的旧本地路径；`D:\IP网站` 只是后端仓库的旧本地路径。Mac 上没有 D/E 盘，不需要照着盘符找。

注意：后端仓库里的 `mini-program-ui` 不是本次小程序前端进度的来源，不要把它当成当前小程序 CLR 继续改。当前小程序前端以 `a171240/meiye-huajing-miniprogram` 为准。

## 四个线程汇总

这份交接按今天截图里的四个线程来整理，覆盖今天已经落到代码仓库里的内容。注意：我不能直接读取其他已关闭线程的完整聊天记录，所以这里以“线程名称 + 当前两个仓库里的实际代码变更”为准。

1. 找到 E 盘的小程序
   - 明确当前小程序前端不是后端仓库里的 `mini-program-ui`，而是独立项目。
   - 已创建并推送私有仓库：`a171240/meiye-huajing-miniprogram`。
   - 小程序仓库已包含当前前端快照、AI 点文档、Mac 接手说明。

2. 定位到海报页面
   - 海报页完成 UI/按钮路径检查后的整理。
   - 后端补齐海报需求整理、素材上传、生成、历史记录、图片读取、语音转写接口。
   - 海报生成、修字、重做分别接入小程序 AI 点动作码和失败退款。

3. 定位到发文页面
   - 小红书发文页完成正文生成、换一版、封面、换风格路径整理。
   - 新增小程序专用封面接口：`/api/mp/xhs/generate-cover-image`。
   - 小红书正文和封面生成已接入 AI 点扣点与流水。

4. 定位到我的页面并检查按钮
   - “我的”页、充值页、工作台等入口统一成 AI 点/服务包表达。
   - 后端 `profile` / `workbench` 返回 AI 点余额、账号角色、公司/门店字段。
   - 按钮检查后保留当前页面可用路径；P1-P10 旧工作流暂不纳入本轮小程序 AI 点体系。

后续在这个线程里继续完成了跨前后端落地：

- 小程序 AI 点后端模块：`lib/mp/ai-points.server.ts`
- 小程序报价接口：`app/api/mp/billing/quote/route.ts`
- Supabase 迁移：`supabase/migrations/20260506_add_mp_ai_points_backend.sql`
- Vercel 生产部署：`dpl_AGFL5gqZ2LLkijEMyvPLBMRi81ko`

## 已完成事项

### 小程序前端

小程序前端完成了当前页面的 AI 点路径梳理与页面提示：

- 我的页：展示 AI 点余额、账号角色、公司/门店归属。
- 充值页：从“积分/订阅”改成“AI 点/服务包”表达。
- 海报页：展示海报生成、修字、重做消耗，并向后端传 `action_code`。
- 小红书发文页：正文、换一版、封面、换风格对应不同消耗。
- 内容工作台：链接提取 0 点，改写视频脚本 3 点，生成视频保留“按实际成本”。
- 话术训练相关页：当前基础训练、顾客档案、项目卡、基础报告暂不扣点。

前端核心文件：

- `utils/ai-points.js`
- `docs/ai-points-current-page-path.md`
- `pages/mine/*`
- `pages/pay/*`
- `pages/poster/*`
- `pages/xiaohongshu/*`
- `pages/content-studio/*`
- `pages/voice-coach/**`

### 后端/API

新增了小程序专用 AI 点模块，旧 IP 网站 P 工作流仍走旧规则：

- `lib/mp/ai-points.server.ts`
  - 定义 `MP_AI_ACTIONS`
  - 负责小程序 AI 点扣减、失败退款、响应头、流水记录
  - 余额兼容沿用 `profiles.credits_balance`，对小程序返回 `ai_points_balance`

新增/接入 API：

- `app/api/mp/billing/quote/route.ts`
  - 可查询单个 `action_code` 的价格、余额、是否可执行
- `app/api/mp/posters/generate/route.ts`
  - `poster.generate.image`：10 点
  - `poster.rewrite.text`：1 点
  - `poster.regenerate.image`：6 点
- `app/api/mp/xhs/generate-v4/route.ts`
  - `xhs.generate.text`：2 点
  - `xhs.regenerate.text`：1 点
- `app/api/mp/xhs/generate-cover-image/route.ts`
  - `xhs.generate.cover`：8 点
  - `xhs.regenerate.cover`：6 点
- `app/api/mp/content/rewrite/route.ts`
  - `content.rewrite.video_script`：3 点
- `app/api/mp/profile/route.ts`
  - 返回 AI 点余额、账号角色、公司/门店字段
- `app/api/mp/workbench/route.ts`
  - 返回同一套小程序 AI 点 profile payload

### Supabase

已部署迁移到 Supabase 项目 `IP网站`：

- project ref：`topyedxzcdfswxdcucpl`
- migration：`20260506075111_add_mp_ai_points_backend`
- 本地文件：`supabase/migrations/20260506_add_mp_ai_points_backend.sql`

新增表：

- `mp_companies`
- `mp_stores`
- `mp_account_memberships`
- `mp_ai_point_ledger`

`profiles` 新增字段：

- `account_role`
- `company_id`
- `company_name`
- `store_id`
- `store_name`
- `service_plan_label`

同一个 Supabase 项目里不要重复手动执行这份迁移。迁移文件留在仓库中，是为了后续环境重建和审计。

### Vercel

已从后端仓库本地工作树部署生产：

- project：`ip`
- deployment：`dpl_AGFL5gqZ2LLkijEMyvPLBMRi81ko`
- status：`READY`
- aliases：
  - `https://ip.ipgongchang.xin`
  - `https://www.ipnrgc.com`
  - `https://ipnrgc.com`

线上冒烟检查：

- `GET https://ip.ipgongchang.xin/api/mp/billing/quote`
- 返回 `401 {"ok":false,"error":"请先登录","code":"auth_required"}`
- 说明新路由已上线，鉴权链路正常。

后续补交接文档的提交不需要重新部署 Vercel，因为它们不影响 API 运行。真正改 `app/api/*`、`lib/*` 或环境配置时再部署。

## 当前扣点表

| 页面 | action_code | 后端扣点 |
| --- | --- | ---: |
| 海报页 | `poster.generate.image` | 10 |
| 海报页 | `poster.rewrite.text` | 1 |
| 海报页 | `poster.regenerate.image` | 6 |
| 小红书页 | `xhs.generate.text` | 2 |
| 小红书页 | `xhs.regenerate.text` | 1 |
| 小红书页 | `xhs.generate.cover` | 8 |
| 小红书页 | `xhs.regenerate.cover` | 6 |
| 内容工作台 | `content.ingest` | 0 |
| 内容工作台 | `content.rewrite.video_script` | 3 |
| 内容工作台 | `content.generate.video` | 按实际成本，暂未固定扣点 |
| 内容工作台 | `content.distribute` | 0 |
| 话术训练 | 基础档案/项目卡/训练/基础报告 | 0 |

P1-P10 工作流暂不纳入本轮小程序 AI 点体系。

## 已验证

本地后端：

```bash
node_modules/.bin/tsc --noEmit --pretty false
```

前端关键 JS：

```bash
node --check pages/poster/index.js
node --check pages/xiaohongshu/index.js
```

Vercel 构建：

- 生产构建成功，0 errors。
- 构建中仍有项目既有 lint warnings，主要集中在 voice-coach 和脚本目录，未阻断发布。

## 后续建议

1. 在小程序内登录真实账号后，跑一遍海报生成、小红书正文、封面、内容改写，确认 `mp_ai_point_ledger` 写入。
2. 补一个后台页面或管理脚本，用于给公司、门店、员工账号绑定 `mp_account_memberships`。
3. 生成视频仍需等成本模型稳定后再从“按实际成本”落成固定扣点或阶梯扣点。
4. 如果继续做 P1-P10 工作流，不要混进当前小程序 AI 点体系，另开规则版本。

## 本次没有纳入的内容

- 后端仓库里的 `mini-program-ui` 本地改动没有纳入本次小程序前端交接；当前前端以 `a171240/meiye-huajing-miniprogram` 为准。
- 后端仓库里 `voice-coach-ws` 的本地配置改动没有纳入本次提交。
- 临时截图、预览目录、插件生成物没有纳入 Git。
- 后端 PR 是 Draft，适合 Mac 接手继续检查；准备合并前再确认是否需要把其它未提交改动另开 PR。
