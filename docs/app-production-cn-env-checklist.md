# APP production-cn 环境变量与云资源获取清单

更新时间：2026-06-22

本清单只记录变量名、获取位置和导入位置，不记录真实密钥值。当前后端主部署目标是阿里云 SAE `cn-hangzhou` 自定义容器应用 `meiye-huajing-app-api-production-cn`，端口 `3000`；镜像进入阿里云 ACR 后由 SAE 拉取。Vercel 只作为现有后端能力来源和对照，不作为国内正式 APP 的生产运行环境。

## 微信登录

阿里云不是“还缺一个 APP”。缺的是国内 APP 后端在阿里云运行时调用微信开放平台移动应用登录所需的变量。

| 变量 | 获取位置 | 导入位置 | 密钥 | 当前状态 |
| --- | --- | --- | --- | --- |
| `WECHAT_OPEN_APP_REVIEW_STATUS` | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 -> 审核状态 | 本机 `.env.production-cn.local`、阿里云 SAE 普通环境变量 | 否 | 用户已确认 `reviewing` |
| `WECHAT_OPEN_APP_ID` | 审核通过后，微信开放平台 -> 移动应用 -> 美业话镜 -> 开发信息/AppID | 阿里云 SAE 环境变量或 KMS/Secrets Manager 引用 | 否，但不要写进 App 包 | 审核通过后才能获取 |
| `WECHAT_OPEN_APP_SECRET` | 审核通过后，微信开放平台 -> 移动应用 -> 美业话镜 -> 开发信息/AppSecret | 只导入阿里云 SAE secret/KMS/Secrets Manager | 是 | 审核通过后才能获取 |

不要用小程序的 `WECHAT_MINI_APPID` / `WECHAT_MINI_SECRET` 替代移动应用 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`。APP 微信登录链路是：原生 iOS/Android 微信 SDK 取授权 `code`，APP 调 `POST /api/app/auth/wechat`，阿里云后端用 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET` 向微信换取登录态。

## APP 运行域名

| 变量 | 获取位置 | 导入位置 | 密钥 | 当前状态 |
| --- | --- | --- | --- | --- |
| `APP_API_BASE_URL` | 阿里云 DNS/SAE/HTTPS 完成后使用 `https://api-cn.ipgongchang.xin` | App 本机 production-cn 配置、阿里云 SAE 普通环境变量 | 否 | 本机已配置，云端 DNS/HTTPS/ICP 证据未完成 |
| `NEXT_PUBLIC_SITE_URL` | 同 `APP_API_BASE_URL` | 阿里云 SAE 普通环境变量 | 否 | 本机已配置，云端证据未完成 |
| `APP_ASSET_BASE_URL` | 阿里云 DNS/CDN/OSS 自定义域完成后使用 `https://assets-cn.ipgongchang.xin` | App 本机 production-cn 配置、阿里云 SAE 普通环境变量 | 否 | production-cn 必填；本机已配置，云端 DNS/HTTPS/ICP 证据未完成 |
| `PRIVACY_POLICY_URL` | production-cn 法务页面可公网 GET 后确认 URL | App 本机 production-cn 配置、阿里云 SAE 普通环境变量 | 否 | 本机形态检查通过，公网 GET 证据未完成 |
| `TERMS_URL` | production-cn 用户协议页可公网 GET 后确认 URL | App 本机 production-cn 配置、阿里云 SAE 普通环境变量 | 否 | 本机形态检查通过，公网 GET 证据未完成 |
| `APPLE_TEAM_ID` | Apple Developer -> Membership 或 Identifiers/App ID 页面读取 10 位 Team ID | 阿里云 SAE 普通环境变量，用于 AASA `appID` 生成 | 否 | 未提供，AASA/Universal Link 仍阻塞 |

`api-cn` 与 `assets-cn` 是两组外部证据：`api-cn` 证明 SAE/API HTTPS 入口，`assets-cn` 证明资产域名 DNS/HTTPS/ICP。不能用 OSS Bucket CORS/RAM 证据替代 `assets-cn` 域名证据。

## 阿里云资源

| 项目 | 获取/创建位置 | 写入文件或导入位置 | 密钥 | 当前状态 |
| --- | --- | --- | --- | --- |
| SAE 应用 | 阿里云控制台 -> SAE -> `cn-hangzhou` -> 创建应用，自定义容器，端口 `3000` | `deploy/aliyun-production-cn.cloud-confirmations.local.json` 非密钥证据；SAE 控制台运行时配置 | 否 | 未确认 ready |
| ACR 镜像仓库 | 阿里云控制台 -> 容器镜像服务 ACR -> 命名空间/仓库 | `deploy/aliyun-production-cn.image-publish.local.json` 非密钥证据；Docker credential helper 或 RAM | 认证信息是密钥 | 未确认 ready；个人版页面提示无 SLA 且勿用于生产；企业版经济版 `cn-hangzhou` 1 个月候选报价已核到 `CNY 117.00`，购买前需用户对金额和规格动作确认 |
| OSS Bucket | 阿里云控制台 -> OSS -> Bucket、地域、CORS、RAM 最小权限 | `ALIYUN_OSS_BUCKET`、`ALIYUN_OSS_REGION`、`SERVICE_RECORD_OSS_PREFIX`；密钥走 KMS/Secrets Manager | Bucket/Region 否，AccessKey Secret 是 | Bucket/CORS 已建；RAM 策略模板见 `deploy/aliyun-production-cn.oss-ram-policy.json`，AccessKey/Secret 仍未创建导入 |
| SLS 日志 | 阿里云控制台 -> SLS -> Project/Logstore/告警 | `deploy/aliyun-production-cn.cloud-confirmations.local.json` 非密钥证据 | 否 | 未确认 ready |
| RDS PostgreSQL | 阿里云控制台 -> RDS -> PostgreSQL 实例 | 后续 `DATABASE_URL_CN` 或等价连接串走 KMS/Secrets Manager | 是 | 第一版桥接部署不包含迁移，需用户确认实例/方案 |

## 后端密钥

| 变量 | 获取位置 | 导入位置 | 密钥 | 备注 |
| --- | --- | --- | --- | --- |
| `ALIYUN_OSS_ACCESS_KEY_ID` | 阿里云 RAM 最小权限用户或角色 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 不写入镜像或 git |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | 阿里云 RAM 最小权限用户或角色 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 不写入镜像或 git |
| `ALIYUN_OSS_SECURITY_TOKEN` | 阿里云 RAM/STS 临时凭证或 SAE 运行时角色链路 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 可选；后端已支持 STS token 表单上传和签名下载，长期 AccessKey 模式可留空 |
| `DASHSCOPE_API_KEY` | 阿里云百炼/Model Studio 控制台 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 服务记录 ASR/LLM 相关 |
| `VOLC_SPEECH_APP_ID` | 火山引擎 OpenSpeech 控制台 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 语音能力保留字节链路时需要 |
| `VOLC_SPEECH_ACCESS_TOKEN` | 火山引擎 OpenSpeech 控制台 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 不写入 App 包 |
| `DEEPSEEK_API_KEY` | DeepSeek 平台控制台 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 文本生成链路使用 |

## 可执行检查

本地只读检查：

```bash
corepack pnpm aliyun:status
corepack pnpm aliyun:operator:handoff
corepack pnpm aliyun:cloud:confirmations
corepack pnpm aliyun:readiness
corepack pnpm aliyun:predeploy
```

正式部署前必须满足：

```text
WECHAT_OPEN_APP_REVIEW_STATUS=approved
WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET 已从微信开放平台移动应用取得
APPLE_TEAM_ID 已取得并 AASA 可 GET
SAE / ACR / api-cn / assets-cn / OSS / SLS / env import 外部确认 ready
```
