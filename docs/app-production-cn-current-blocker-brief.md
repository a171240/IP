# 美业话镜 APP production-cn 当前阻塞简报

更新日期：2026-06-24

本文是当前 APP 国内发布后端桥接链路的 go/no-go 简报。它只固化本地证据和下一步动作边界，不包含任何密钥值，也不授权阿里云购买、资源创建、密钥导入、镜像推送、生产部署、微信开放平台写操作、Apple Developer 写操作或 git push。

## 当前结论

现在不能部署/上线。

关键状态：

```text
verdict: blocked
canDeployNow: false
requiredEnv: 24/26
requiredBlocking: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
localCodeReady: false
releaseEvidenceUsable: true
cloudResourceEvidenceReady: 0/7
cloudConfirmationsReady: 0/7
operatorTasksReady: 1/9
completion: proved 2/10, blocked 7, partial 1
sensitiveBlocked: 7/7
blockedCredentialCount: 8
readySecretEnvVariableCount: 17
canReadCloudNow: false
cloudInventoryInterpretation: existing_strict_inventory_ready_but_fresh_cli_profile_unavailable
currentBrowserCanUseCurrentConsole: true
currentBrowserAliyunConsoleTabCount: 1
```

当前机器阻塞：

```text
missing_required_env:WECHAT_OPEN_APP_ID
missing_required_env:WECHAT_OPEN_APP_SECRET
wechat_open_platform_mobile_app_not_ready
invalid_app_universal_link_config
app_universal_link:apple_team_id_missing
```

这说明本地后端桥接代码和 release evidence 基本可用，但 APP 微信登录凭证、Android 发布签名、Apple Team ID、阿里云云资源和部署后验收证据还没有形成闭环。

## 后端部署目标

第一版 APP production-cn 后端准备部署到阿里云：

```text
region: cn-hangzhou
runtime: SAE custom container
appName: meiye-huajing-app-api-production-cn
containerPort: 3000
healthCheck: /api/healthz
apiDomain: api-cn.ipgongchang.xin
assetDomain: assets-cn.ipgongchang.xin
imageRepository: meiye-huajing-app-api
imageTag: production-cn
```

数据层边界：

```text
current: Supabase
target: Aliyun RDS PostgreSQL
firstBridgeDeploymentUses: Supabase bridge env
rdsMigrationIncludedInThisRelease: false
rdsMigrationRequiredForFinalProductionCn: true
DATABASE_URL_CN: todo
REDIS_URL_CN: todo
```

也就是说，第一版是“阿里云跑 API 容器，数据层暂时桥接现有 Supabase”。完整 RDS PostgreSQL/Tair 迁移不是这次部署的一部分，需要单独方案、迁移脚本、回滚方案和授权。

## 微信 APP 登录为什么还缺环境变量

这是 APP，不是小程序。React Native APP 的微信登录需要微信开放平台“移动应用”的 AppID/AppSecret；小程序的 `WECHAT_MINI_APPID`、`WECHAT_MINI_SECRET`、`WECHAT_LOGIN_SECRET` 只能保留给旧小程序/兼容后端链路，不能替代 APP 登录。

APP 微信登录凭证边界：

```text
appLoginCredentialSource: 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息
appLoginVariableNames: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET, WECHAT_OPEN_APP_REVIEW_STATUS
appLoginImportTargets:
  WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env
  WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env
  WECHAT_OPEN_APP_REVIEW_STATUS -> 阿里云 SAE plain env
miniProgramCompatVariableNames: WECHAT_MINI_APPID, WECHAT_MINI_SECRET, WECHAT_LOGIN_SECRET
wechatMiniProgramCredentialsReusableForAppLogin: false
```

运行时使用方式：阿里云 SAE 后端在 APP 微信登录回调中使用移动应用 AppID/AppSecret 调微信登录接口；React Native APP 包内不内置 AppSecret。

当前微信开放平台状态：

```text
wechatOpenAccountVerified: true
wechatOpenMobileAppCreated: false
wechatOpenCanCreateDraft: true
wechatOpenReadyToSubmitForReview: false
mobileAppCredentialsAvailable: false
androidPackageName: com.ipgongchang.meiyehuajing
androidSignatureStatus: missing_release_wechat_signature
iosBundleId: com.ipgongchang.meiyehuajing
iosUniversalLink: https://api-cn.ipgongchang.xin/app/wechat/
iosAssociatedDomain: applinks:api-cn.ipgongchang.xin
appleTeamIdMissing: true
```

因此，即使微信开放平台账号已经认证成功，只要移动应用还没创建/审核通过，`WECHAT_OPEN_APP_ID` 和 `WECHAT_OPEN_APP_SECRET` 仍然不能标记为 ready。

## 还缺哪些环境变量和获得方式

当前硬阻塞的必填环境变量：

| 变量 | 获得位置 | 导入位置 | 处理规则 |
| --- | --- | --- | --- |
| `WECHAT_OPEN_APP_ID` | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息 | 阿里云 SAE plain env | 不能用小程序 AppID 替代；不能写进 App 包。 |
| `WECHAT_OPEN_APP_SECRET` | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息 | 阿里云 KMS/Secrets Manager/SAE secret env | 不能用小程序 Secret 替代；不能写入文档、镜像、App 包或 git。 |

当前会阻塞 APP 上架/验收但不属于后端必填的值：

| 变量/凭证 | 获得位置 | 用途 | 处理规则 |
| --- | --- | --- | --- |
| `APPLE_TEAM_ID` | Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID | iOS AASA / Universal Link 验收 | plain env；不要把真实 value 写入文档或 git。 |
| `MEIYE_RELEASE_STORE_FILE` | 受控 Android signing secret store | Android release 签名 | 只保存在本机/CI signing secret store。 |
| `MEIYE_RELEASE_STORE_PASSWORD` | 受控 Android signing secret store | Android release 签名 | 不能输出、不能写 Markdown/JSON/git。 |
| `MEIYE_RELEASE_KEY_ALIAS` | 受控 Android signing secret store | Android release 签名 | 只保存在本机/CI signing secret store。 |
| `MEIYE_RELEASE_KEY_PASSWORD` | 受控 Android signing secret store | Android release 签名 | 不能输出、不能写 Markdown/JSON/git。 |
| `ALIYUN_OSS_SECURITY_TOKEN` | 阿里云 RAM/STS 或运行时角色方案 | OSS 临时授权或运行时访问 | 优先使用运行时角色/STS；不要持久化 token。 |

已有 17 个 ready secret env 变量可迁移/导入阿里云 secret env，例如 Supabase、DashScope、DeepSeek、火山语音、OSS、旧小程序兼容和后台管理相关变量。它们的真实值只应从现有 Vercel Production、本机受控 env 或对应服务控制台迁移到阿里云 KMS/Secrets Manager/SAE secret env，不能写进文档或 git。

Vercel 覆盖状态：

```text
envSourceVercelRequiredCovered: 17/26
envSourceCanMigrateFromVercelProduction: 46
envSourceAppAliyunOwnedNotInVercel: 11
envSourceBlockedExternalRequired: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET, APPLE_TEAM_ID
envSourceReadyLocalButMissingFromVercel: SERVICE_RECORD_DEEPSEEK_API_KEY, SERVICE_RECORD_DEEPSEEK_BASE_URL, SERVICE_RECORD_DEEPSEEK_MODEL
envSourceSecretOrSensitiveToImport: 17
```

## 阿里云资源当前状态

云资源证据还不能支撑部署：

```text
cloudResourceEvidenceReady: 0/7
cloudResourceObservedReady: 0/7
cloudResourceObservedPartial: 2
cloudResourceObservedBlocked: 5
cloudResourceBlockedIds:
  R01_SAE_RUNTIME
  R02_ACR_IMAGE_REGISTRY
  R03_API_DOMAIN_HTTPS
  R04_ASSET_DOMAIN_HTTPS
  R05_OSS_AUDIO_STORAGE
  R06_ENV_IMPORT
  R07_SLS_ALERTS
cloudResourceObservedPartialIds:
  R05_OSS_AUDIO_STORAGE
  R07_SLS_ALERTS
cloudResourceObservedBlockedIds:
  R01_SAE_RUNTIME
  R02_ACR_IMAGE_REGISTRY
  R03_API_DOMAIN_HTTPS
  R04_ASSET_DOMAIN_HTTPS
  R06_ENV_IMPORT
```

当前浏览器能看到阿里云控制台，但本机阿里云 CLI profile 没配好：

```text
currentBrowserCanUseCurrentConsole: true
canReadCloudNow: false
cliConfigProbeFailureCategory: aliyun_cli_profile_not_configured
cloudApiCalled: false
cloudMutationPerformed: false
```

所以浏览器登录态可以支持人工确认和后续控制台操作，但不能把它当成已完成的云资源证明；涉及购买、创建、DNS/HTTPS、密钥导入、部署等写动作仍需要动作时确认。

## 现在可以继续补的事项

需要动作时确认后可以先做：

```text
canStartNowConsoleTasks:
  C02_ACR_IMAGE_AND_PULL
  C05_OSS_AUDIO_RAM_STS

canStartNowAuthorizationPackets:
  P01_WECHAT_OPEN_MOBILE_APP
  P10_ANDROID_RELEASE_SIGNING
  P02_APPLE_TEAM_ID
  P03_ACR_PURCHASE
  P05_OSS_RAM_STS
```

当前可回填的非密钥证据：

```text
C02_ACR_IMAGE_AND_PULL:
  scope: purchase_and_repository_only
  writeTargets:
    deploy/aliyun-production-cn.image-publish.local.json: acr.confirmed=true
    deploy/aliyun-production-cn.image-publish.local.json: acr.registryHost=<cn-hangzhou aliyuncs.com host>
    deploy/aliyun-production-cn.image-publish.local.json: acr.namespace=<actual namespace>
  forbidden:
    docker login
    image push
    registry password output
    SAE runtime pull-secret binding

C05_OSS_AUDIO_RAM_STS:
  scope: OSS CORS/RAM/STS/运行时角色证据
  writeTargets:
    deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss
  target:
    bucket: meiye-huajing-service-records-production-cn
    prefix: service-records/production-cn
    ramLeastPrivilege: true
  forbidden:
    AccessKeySecret 输出
    STS token 持久化
    密钥写入 Markdown/JSON/git
```

仍被依赖阻塞：

```text
blockedByConsoleTaskDependencies:
  C01_SAE_RUNTIME
  C03_API_DOMAIN_HTTPS_ICP
  C04_ASSET_DOMAIN_HTTPS_ICP
  C06_ENV_IMPORT
  C07_SLS_ALERTS

blockedByAuthorizationPacketDependencies:
  P04_ACR_IMAGE_AND_PULL
  P06_ENV_IMPORT
  P07_DOMAIN_DNS_HTTPS
  P08_SAE_RUNTIME_SLS
  P09_PRODUCTION_DEPLOY
```

## 下一步建议顺序

1. 先完成 Android release signing 证据，生成微信开放平台需要的 Android release 签名。
2. 创建微信开放平台移动应用草稿，填 Android 包名、release 签名、iOS Bundle ID 和 Universal Link；审核通过后才读取 AppID/AppSecret。
3. 读取 Apple Team ID，用于 AASA / Universal Link 验收。
4. 经动作时确认后开通/确认 ACR 企业版和镜像仓库，只回填 registry host、namespace、repository 等非密钥证据。
5. 经动作时确认后确认 OSS bucket、CORS、RAM 最小权限或 STS/运行时角色方案，只回填 bucket、prefix、布尔证据。
6. 等 `WECHAT_OPEN_APP_ID`、`WECHAT_OPEN_APP_SECRET`、Android signing、Apple Team ID 和阿里云资源证据齐后，再做 SAE、DNS/HTTPS、环境变量导入、SLS 和部署后 smoke。

## 禁止事项

在没有动作时确认前，不做以下事情：

```text
Aliyun ACR purchase
SAE/SLS/OSS/RAM/KMS/DNS/cert/CDN mutation
secret import
docker login
docker push
production deploy
WeChat Open Platform mobile app create/submit
Apple Developer write action
Supabase production write
git push
```

验证入口：

```text
corepack pnpm aliyun:blockers:brief
corepack pnpm aliyun:blockers:brief:test
corepack pnpm aliyun:completion:audit
```
