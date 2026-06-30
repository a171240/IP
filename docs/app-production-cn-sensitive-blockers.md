# 美业话镜 APP production-cn 密钥/密码/token/付款/受控标识符阻塞项

Generated: 2026-06-29T14:37:00.077Z

## 结论

- 当前仍有密钥、密码、token、付款或受控标识符类人工介入项；本报告只列变量名和控制台路径，不输出任何 value。
- currentScope: full_app_launch
- ok: true
- containsValues: false
- blocked: 3 / 3
- actionTimeConfirmationRequired: S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S07_ANDROID_RELEASE_SIGNING
- deferredAppLaunchSensitiveActionIds: none
- secretLeakCheck: true
- canCodexProceedWithoutUser: false
- blockedVariableNames: APPLE_TEAM_ID, MEIYE_RELEASE_KEY_ALIAS, MEIYE_RELEASE_KEY_PASSWORD, MEIYE_RELEASE_STORE_FILE, MEIYE_RELEASE_STORE_PASSWORD, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
- readySecretEnvVariableNames: none

## 用户介入密钥/密码简表

- blockedCredentialCount: 7
- blockedCredentialNames: APPLE_TEAM_ID, MEIYE_RELEASE_KEY_ALIAS, MEIYE_RELEASE_KEY_PASSWORD, MEIYE_RELEASE_STORE_FILE, MEIYE_RELEASE_STORE_PASSWORD, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
- readySecretEnvVariableCount: 0
- readySecretEnvVariableNames: none
- forbiddenStorage: git, JSON/Markdown 报告, Docker image, App bundle, 小程序或 App 前端包

## 密钥/密码介入拆解

- required: true
- missingCredentialValues: APPLE_TEAM_ID, MEIYE_RELEASE_KEY_ALIAS, MEIYE_RELEASE_KEY_PASSWORD, MEIYE_RELEASE_STORE_FILE, MEIYE_RELEASE_STORE_PASSWORD, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
- missingCredentialValueActionIds: S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S07_ANDROID_RELEASE_SIGNING
- readySecretsPendingCloudImport: 0
- readySecretsPendingCloudImportActionIds: none
- paidPurchaseConfirmationActionIds: none
- controlledSecretChannelActionIds: none
- actionIds: S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S07_ANDROID_RELEASE_SIGNING
- forbiddenStorage: git, JSON/Markdown 报告, Docker image, App bundle, 小程序或 App 前端包
- DATABASE_URL_CN must come from Aliyun RDS PostgreSQL after schema/data migration validation and must only enter KMS/Secrets Manager/SAE secret env.
- OSS should use SAE RRSA/OIDC runtime role first: ALIBABA_CLOUD_ROLE_ARN, ALIBABA_CLOUD_OIDC_PROVIDER_ARN, and ALIBABA_CLOUD_OIDC_TOKEN_FILE are runtime env/file-path inputs, while AccessKey/STS values are fallback-only secret env material.
- Ready local secret variables still need controlled Aliyun secret-env import; names can be reported, values must not be copied into JSON, Markdown, Docker images, git, chat, or shell history.
- ACR purchase and registry/runtime pull credentials require action-time confirmation; registry password or pull secret must stay in Docker credential helper, RAM/KMS/Secrets Manager, or Aliyun runtime secret settings.

## 获取/导入队列

- queueScope: full_app_launch
- missingCredentialNames: APPLE_TEAM_ID, MEIYE_RELEASE_KEY_ALIAS, MEIYE_RELEASE_KEY_PASSWORD, MEIYE_RELEASE_STORE_FILE, MEIYE_RELEASE_STORE_PASSWORD, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
- onlyMissingBackendCredentialValue: n/a
- readySecretsPendingCloudImport: 0
- requiresActionTimeConfirmationIds: S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S07_ANDROID_RELEASE_SIGNING

| 顺序 | 类别 | 动作 ID | 要回答的问题 | 获取位置 | 导入/写入目标 | 验证 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `wechat_open_mobile_app` | `S01_WECHAT_OPEN_APP_LOGIN` | 微信登录环境变量从哪里获得 | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息 | WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env; WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform | corepack pnpm aliyun:readiness; corepack pnpm aliyun:health:smoke; corepack pnpm aliyun:app-api:smoke |
| 2 | `ios_universal_link` | `S02_APPLE_TEAM_ID` | iOS Universal Link 需要哪个 Apple Team ID | Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID | APPLE_TEAM_ID -> 阿里云 SAE plain env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform / iOS evidence | corepack pnpm aliyun:aasa:check; corepack pnpm aliyun:app-native:check |
| 3 | `android_release_signing` | `S07_ANDROID_RELEASE_SIGNING` | 国内 Android release 签名和微信开放平台签名如何补齐 | Android release keystore 管理位置 / CI Secret Store；微信开放平台 -> 移动应用 -> Android 应用签名 | MEIYE_RELEASE_STORE_FILE / MEIYE_RELEASE_STORE_PASSWORD / MEIYE_RELEASE_KEY_ALIAS / MEIYE_RELEASE_KEY_PASSWORD -> 本机或 CI 受控 signing secret store; 微信开放平台 -> 移动应用 -> Android 应用签名; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidSignature / androidConfigured | cd /Users/Admin/Documents/美业话镜APP/meiye-huajing-app/android && ANDROID_HOME="$HOME/Library/Android/sdk" ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" ./gradlew assembleRelease; ANDROID_HOME="$HOME/Library/Android/sdk" ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" $ANDROID_HOME/build-tools/<version>/apksigner verify --print-certs app/build/outputs/apk/release/*.apk; corepack pnpm aliyun:wechat-open:package; corepack pnpm aliyun:app-native:check |

| 类别 | 动作 ID | 状态 | 还缺变量 | 已 ready 但需导入 secret env | 获取位置 | 导入/写入目标 |
| --- | --- | --- | --- | --- | --- | --- |
| `wechat_open_mobile_app` | `S01_WECHAT_OPEN_APP_LOGIN` | blocked | WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET | none | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息 | WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env; WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform |
| `ios_universal_link` | `S02_APPLE_TEAM_ID` | blocked | APPLE_TEAM_ID | none | Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID | APPLE_TEAM_ID -> 阿里云 SAE plain env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform / iOS evidence |
| `android_release_signing` | `S07_ANDROID_RELEASE_SIGNING` | blocked | MEIYE_RELEASE_KEY_ALIAS, MEIYE_RELEASE_KEY_PASSWORD, MEIYE_RELEASE_STORE_FILE, MEIYE_RELEASE_STORE_PASSWORD | none | Android release keystore 管理位置 / CI Secret Store；微信开放平台 -> 移动应用 -> Android 应用签名 | MEIYE_RELEASE_STORE_FILE / MEIYE_RELEASE_STORE_PASSWORD / MEIYE_RELEASE_KEY_ALIAS / MEIYE_RELEASE_KEY_PASSWORD -> 本机或 CI 受控 signing secret store; 微信开放平台 -> 移动应用 -> Android 应用签名; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidSignature / androidConfigured |

## 用户介入分层

- external_review_then_app_credentials: S01_WECHAT_OPEN_APP_LOGIN
- external_identifier_lookup: S02_APPLE_TEAM_ID
- android_release_signing_secret: S07_ANDROID_RELEASE_SIGNING

## 按类型汇总

- external_credential_after_review: 1
- external_identifier: 1
- android_keystore_password_or_signature: 1

## 变量名

- APPLE_TEAM_ID
- MEIYE_RELEASE_KEY_ALIAS
- MEIYE_RELEASE_KEY_PASSWORD
- MEIYE_RELEASE_STORE_FILE
- MEIYE_RELEASE_STORE_PASSWORD
- WECHAT_OPEN_APP_ID
- WECHAT_OPEN_APP_REVIEW_STATUS
- WECHAT_OPEN_APP_SECRET

## 人工介入项

### S01_WECHAT_OPEN_APP_LOGIN

- type: external_credential_after_review
- status: blocked
- owner: 用户/微信开放平台操作员
- consolePath: 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App
- obtainFrom: 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息
- writeTargets: WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env; WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform
- verifyCommands: corepack pnpm aliyun:readiness; corepack pnpm aliyun:health:smoke; corepack pnpm aliyun:app-api:smoke
- requiresActionTimeConfirmation: true
- completionEvidence: reviewStatus=approved; mobileAppCreated=true; mobileAppSubmitted=true; mobileAppIdReady=true; mobileAppSecretReady=true; confirmed=true
- variableNames: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET, WECHAT_OPEN_APP_REVIEW_STATUS
- requiredUserAction: 先在微信开放平台创建“美业话镜”移动应用并提交审核；审核通过后读取 AppID/AppSecret；AppID 只导入阿里云 SAE 服务端 plain env，AppSecret 只导入 KMS/Secrets Manager/SAE secret env。
- unblockCondition: reviewStatus=approved 且 WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET ready。
- forbidden: 不能用小程序 AppID/Secret 替代，不能把 AppID 写进 App 包，也不能把 AppSecret 写入文档、镜像或 git。

#### 变量获取和导入明细

| 变量 | 必填 | 状态 | 敏感等级 | 来源分类 | 获取位置 | 导入目标 | 解除/动作 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `WECHAT_OPEN_APP_ID` | 是 | todo | identifier_or_connection | wechat_open_platform | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App | 阿里云 SAE plain env | 等待微信开放平台移动应用审核通过后获取并导入 |
| `WECHAT_OPEN_APP_SECRET` | 是 | todo | secret | wechat_open_platform | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App | 阿里云 KMS/Secrets Manager/SAE secret env | 等待微信开放平台移动应用审核通过后获取并导入 |
| `WECHAT_OPEN_APP_REVIEW_STATUS` | 否 | ready | public | wechat_open_platform | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App | 阿里云 SAE plain env | 导入阿里云运行环境变量 |

### S02_APPLE_TEAM_ID

- type: external_identifier
- status: blocked
- owner: Apple Developer / iOS 发布操作员
- consolePath: Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID
- obtainFrom: Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID
- writeTargets: APPLE_TEAM_ID -> 阿里云 SAE plain env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform / iOS evidence
- verifyCommands: corepack pnpm aliyun:aasa:check; corepack pnpm aliyun:app-native:check
- requiresActionTimeConfirmation: true
- completionEvidence: APPLE_TEAM_ID=ready; aliyun:aasa:check no longer reports apple_team_id_missing
- variableNames: APPLE_TEAM_ID
- requiredUserAction: 从 Apple Developer 确认 10 位 Team ID 后导入阿里云 plain env，用于 AASA appID。
- unblockCondition: APPLE_TEAM_ID ready 且 aliyun:aasa:check 不再报 apple_team_id_missing。
- forbidden: 不要猜测 Team ID；需与 iOS Bundle ID com.ipgongchang.meiyehuajing 一致。

#### 变量获取和导入明细

| 变量 | 必填 | 状态 | 敏感等级 | 来源分类 | 获取位置 | 导入目标 | 解除/动作 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `APPLE_TEAM_ID` | 否 | empty | public | ios_universal_link | Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID | 阿里云 SAE plain env | APP 发布/AASA 阻塞：从 Apple Developer 获取 10 位 Team ID 后导入阿里云 SAE plain env |

### S07_ANDROID_RELEASE_SIGNING

- type: android_keystore_password_or_signature
- status: blocked
- owner: Android 发布操作员 / 微信开放平台操作员
- consolePath: 本机 Android release signing / CI Secret Store；微信开放平台 -> 移动应用 -> Android 应用签名
- obtainFrom: Android release keystore 管理位置 / CI Secret Store；微信开放平台 -> 移动应用 -> Android 应用签名
- writeTargets: MEIYE_RELEASE_STORE_FILE / MEIYE_RELEASE_STORE_PASSWORD / MEIYE_RELEASE_KEY_ALIAS / MEIYE_RELEASE_KEY_PASSWORD -> 本机或 CI 受控 signing secret store; 微信开放平台 -> 移动应用 -> Android 应用签名; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidSignature / androidConfigured
- verifyCommands: cd /Users/Admin/Documents/美业话镜APP/meiye-huajing-app/android && ANDROID_HOME="$HOME/Library/Android/sdk" ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" ./gradlew assembleRelease; ANDROID_HOME="$HOME/Library/Android/sdk" ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" $ANDROID_HOME/build-tools/<version>/apksigner verify --print-certs app/build/outputs/apk/release/*.apk; corepack pnpm aliyun:wechat-open:package; corepack pnpm aliyun:app-native:check
- requiresActionTimeConfirmation: true
- completionEvidence: Android release build succeeds with signingConfigs.release; release APK/AAB exists and is not signed with debug.keystore; wechatOpenPlatform.androidSignature records release signature evidence only; wechatOpenPlatform.androidConfigured=true
- variableNames: MEIYE_RELEASE_STORE_FILE, MEIYE_RELEASE_STORE_PASSWORD, MEIYE_RELEASE_KEY_ALIAS, MEIYE_RELEASE_KEY_PASSWORD
- requiredUserAction: 提供或确认 Android release keystore、store password、key alias、key password；用 release APK/AAB 生成微信开放平台 Android 应用签名并回填。
- unblockCondition: assembleRelease 成功，release 包不是 debug keystore 签名，微信开放平台记录 release 签名且 androidConfigured=true。
- forbidden: 不能使用 debug.keystore；不能把 keystore 文件、store password、key password、证书私钥或微信 AppSecret 写入 JSON、Markdown、Docker 镜像或 git。

#### 变量获取和导入明细

| 变量 | 必填 | 状态 | 敏感等级 | 来源分类 | 获取位置 | 导入目标 | 解除/动作 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `MEIYE_RELEASE_STORE_FILE` | 是 | required_at_build_time | controlled_identifier | android_release_signing | 本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。 | 本机/CI Android signing secret store，不导入阿里云 SAE env。 | 动作时用于 assembleRelease；随后用 release APK/AAB 读取微信开放平台 Android 应用签名。 |
| `MEIYE_RELEASE_STORE_PASSWORD` | 是 | required_at_build_time | secret | android_release_signing | 本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。 | 本机/CI Android signing secret store，不导入阿里云 SAE env。 | 动作时用于 assembleRelease；随后用 release APK/AAB 读取微信开放平台 Android 应用签名。 |
| `MEIYE_RELEASE_KEY_ALIAS` | 是 | required_at_build_time | controlled_identifier | android_release_signing | 本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。 | 本机/CI Android signing secret store，不导入阿里云 SAE env。 | 动作时用于 assembleRelease；随后用 release APK/AAB 读取微信开放平台 Android 应用签名。 |
| `MEIYE_RELEASE_KEY_PASSWORD` | 是 | required_at_build_time | secret | android_release_signing | 本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。 | 本机/CI Android signing secret store，不导入阿里云 SAE env。 | 动作时用于 assembleRelease；随后用 release APK/AAB 读取微信开放平台 Android 应用签名。 |

## 安全边界

- 本报告不创建资源、不付款、不修改 DNS、不导入环境变量、不调用阿里云写 API。
- 本报告不读取或打印 secret value；只复用 operator tasks 的变量名、控制台路径和动作说明。
- 不要把 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie 或 Supabase service role key 写入 git。
