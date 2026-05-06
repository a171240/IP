# 2026-05-06 小程序 AI 点与出差交接说明

## 当前结论

今天的主线已经拆成两个可拉取的项目：

- 小程序前端：`E:\美业话镜`，需要作为独立小程序仓库维护。
- 后端/API：`D:\IP网站`，GitHub 仓库 `a171240/IP`，当前分支 `codex/mp-ui-gptpro-handoff`。

注意：`D:\IP网站\mini-program-ui` 不是本次小程序前端进度的来源，不要把它当成当前小程序 CLR 继续改。

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

### Vercel

已从 `D:\IP网站` 部署生产：

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

## Mac 接手方式

后端：

```bash
git clone https://github.com/a171240/IP.git
cd IP
git checkout codex/mp-ui-gptpro-handoff
```

小程序前端仓库单独拉取。仓库地址见 `E:\美业话镜` 的 README 或本次提交记录。

## 已验证

本地后端：

```bash
D:\IP网站\node_modules\.bin\tsc.cmd --noEmit --pretty false
```

前端关键 JS：

```bash
node --check E:\美业话镜\pages\poster\index.js
node --check E:\美业话镜\pages\xiaohongshu\index.js
```

Vercel 构建：

- 生产构建成功，0 errors。
- 构建中仍有项目既有 lint warnings，主要集中在 voice-coach 和脚本目录，未阻断发布。

## 后续建议

1. 在小程序内登录真实账号后，跑一遍海报生成、小红书正文、封面、内容改写，确认 `mp_ai_point_ledger` 写入。
2. 补一个后台页面或管理脚本，用于给公司、门店、员工账号绑定 `mp_account_memberships`。
3. 生成视频仍需等成本模型稳定后再从“按实际成本”落成固定扣点或阶梯扣点。
4. 如果继续做 P1-P10 工作流，不要混进当前小程序 AI 点体系，另开规则版本。
