# 美业话镜 APP 国内生产栈总控进度

Updated: 2026-07-01T06:02:44+0800

## 当前结论

现在不能上线 / 上传。

原因是当前 release-gate 仍把 `handoff/IP/lib/supabase/server.ts` 归为 `backend:supabase` 阻塞项。这个文件可能影响后端鉴权、数据访问或运行时 Supabase 连接，必须单独授权、验证并收口后，才允许继续生产部署、上传或对外发布动作。

本文件只记录总控线程的当前安全进展，不作为生产上线授权。

## 本轮已完成的安全收口

### 1. 阿里云预部署配置包已本地提交

后端仓库：

```text
/Users/Admin/Documents/美业话镜APP/handoff/IP
```

已提交：

```text
243c480 chore: wire aliyun predeploy config checks
```

提交只包含以下 6 个文件：

```text
package.json
scripts/aliyun-predeploy-commands.mjs
scripts/check-aliyun-deployment-spec.mjs
deploy/aliyun-production-cn.example.json
deploy/aliyun-production-cn.cloud-confirmations.example.json
deploy/aliyun-production-cn.image-publish.example.json
```

已验证：

```text
node --check scripts/aliyun-predeploy-commands.mjs
node --check scripts/check-aliyun-deployment-spec.mjs
node scripts/check-aliyun-deployment-spec.mjs
corepack pnpm run aliyun:image:plan:test
corepack pnpm run aliyun:acr:transfer-handoff:test
corepack pnpm run aliyun:sae:runtime-handoff:test
corepack pnpm run aliyun:rds:runtime-smoke:test
corepack pnpm run aliyun:oss:runtime-access:test
corepack pnpm run aliyun:runtime:plan:test
corepack pnpm run aliyun:rds:request-context:test
git diff --cached --check
```

验证结论：

```text
deployment spec ok=true
containsValues=false
localPredeployChecks=103
predeployChecks=57
package script tests PASS
```

### 2. 四个执行线程已完成复核

线程 A：配置 / 部署预检查边界。

结论：只有上述 6 个阿里云配置与脚本文件适合安全提交；`docs/app-production-cn-current-thread-progress-2026-06-27.md`、`lib/supabase/server.ts`、`app/api/**`、`voice-coach-ws/**`、`deploy/*.local.json` 不应混入同一提交。

线程 B：第一版 API 本地验证。

结论：本地 focused API 与 App 测试通过。后续真实 200/403/409/503 冒烟仍需要真实 token、`x-device-id`、RDS / OSS / ASR 环境和店长账号。

线程 C：iPhone / iOS 真机前置状态。

结论：本机可见一台 iPhone 和一份历史 Debug 包相关签名材料，但没有本轮当前 HEAD 的真机安装、启动和登录录音验证授权，不能表述为真机已通过。

线程 D：本地可见验证。

结论：App 仓库干净；截图墙、dev API、Metro、Android APK、iOS simulator app、dev-api-server route smoke、real-device-preflight 均为本地通过。该结论仍是本地可见验证，不等于线上可发布。

## 当前仓库状态口径

### App 仓库

```text
/Users/Admin/Documents/美业话镜APP/meiye-huajing-app
branch: main
HEAD: c360c959
status: clean
```

第一版范围保持不变：

```text
登录 / 测试 token
profile / 多租户权限
门店邀请
服务记录长录音链路
店长查看本店服务记录
```

不纳入本轮：

```text
App 内支付
苹果 IAP
安卓应用市场支付
海报 / 小红书 / 视频任务全量迁移
完整小程序页面迁移
```

### 后端交接仓库

```text
/Users/Admin/Documents/美业话镜APP/handoff/IP
branch: codex/app-api-handoff-20260521
HEAD: 243c480
```

预部署配置包已经提交。其余未收口改动仍需分 lane 处理：

```text
backend:supabase
- lib/supabase/server.ts

backend:poster-xhs / feature API
- app/api/mp/library/route.ts
- app/api/mp/posters/history/route.ts
- app/api/mp/workbench/route.ts
- app/api/mp/xhs/drafts/route.ts
- app/api/xhs/generate-cover-image/route.ts

voice-coach-ws
- voice-coach-ws/src/__tests__/protocol.test.ts
- voice-coach-ws/src/protocol.ts
- voice-coach-ws/src/ws-server.ts
```

### 小程序仓库

```text
/Users/Admin/Documents/美业话镜小程序
branch: codex/app-migration-handoff-20260521
```

当前存在 poster / voice-coach / project.config 相关未收口改动。本轮未改小程序，也未执行微信开发者工具上传。

## 下一步执行队列

### P0: Supabase 阻塞项单独授权

目标：只审 `lib/supabase/server.ts` 的差异、风险和测试覆盖。

通过条件：

```text
release-gate 不再出现 backend:supabase 阻塞
相关鉴权 / 数据访问本地测试通过
无真实 token、后端高权限密钥、生产密钥写入仓库
```

### P1: 第一版 API 真实环境冒烟

目标：用真实测试 token 和测试账号跑第一版范围 API。

需要补充：

```text
测试 token
x-device-id 策略
店长 / 店员测试账号
RDS / OSS / ASR 测试环境确认
```

### P1: iOS / Android 真机闭环

目标：当前 HEAD 安装、启动、登录、长录音、服务记录上传、店长查看。

需要补充：

```text
iOS 真机安装授权
Android 真机或模拟器策略
是否允许使用当前 Apple Development Team 做 Debug 包
```

### P2: poster / xhs / voice-coach 分 lane 收口

目标：不把 poster、xhs、voice-coach、Supabase 混成一个提交。

处理原则：

```text
每个 lane 单独 diff
单独测试
单独提交
未授权不上传、不部署、不 push
```

## 禁止误表述

以下说法当前都不成立：

```text
可以上线
可以上传
后端生产已无阻塞
真机已完整通过
第一版 API 已真实环境闭环
App 已完成小程序全量迁移
```

当前准确说法是：

```text
本地配置预检查已收口并提交
App 本地可见验证通过
第一版 API 本地 focused 测试通过
生产上传 / 部署仍被 backend:supabase 阻塞
```
