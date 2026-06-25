export const SENSITIVE_ACTION_METADATA = {
  S01_WECHAT_OPEN_APP_LOGIN: {
    obtainFrom: "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息",
    writeTargets: [
      "WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env",
      "WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:readiness",
      "corepack pnpm aliyun:health:smoke",
      "corepack pnpm aliyun:app-api:smoke",
    ],
    requiresActionTimeConfirmation: true,
    completionEvidence: [
      "reviewStatus=approved",
      "mobileAppCreated=true",
      "mobileAppSubmitted=true",
      "mobileAppIdReady=true",
      "mobileAppSecretReady=true",
      "confirmed=true",
    ],
  },
  S02_APPLE_TEAM_ID: {
    obtainFrom: "Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID",
    writeTargets: [
      "APPLE_TEAM_ID -> 阿里云 SAE plain env",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform / iOS evidence",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:aasa:check",
      "corepack pnpm aliyun:app-native:check",
    ],
    requiresActionTimeConfirmation: true,
    completionEvidence: [
      "APPLE_TEAM_ID=ready",
      "aliyun:aasa:check no longer reports apple_team_id_missing",
    ],
  },
  S03_ACR_PAID_PURCHASE: {
    obtainFrom: "阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页",
    writeTargets: [
      "deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr non-secret evidence",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:image:plan",
      "corepack pnpm aliyun:resources:matrix",
      "corepack pnpm aliyun:user:actions",
    ],
    requiresActionTimeConfirmation: true,
    completionEvidence: [
      "acr.purchaseCandidate.confirmed=true",
      "acr.registryHost is the actual aliyuncs.com registry host",
      "acr.namespace is the created namespace",
      "acr.evidence contains a non-secret purchase/instance evidence handle",
    ],
  },
  S04_ACR_REGISTRY_AUTH: {
    obtainFrom: "阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置",
    writeTargets: [
      "deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields",
      "SAE runtime image pull credentials -> Aliyun runtime secret settings only",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:container:smoke",
    ],
    requiresActionTimeConfirmation: true,
    completionEvidence: [
      "acr.imagePushed=true",
      "acr.digestVerified=true",
      "runtime.remoteImageConfigured=true",
      "runtime.imagePullConfigured=true",
      "remoteDigest is sha256:<64 hex chars>",
    ],
  },
  S05_OSS_RAM_SECRET_OR_STS: {
    obtainFrom: "阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE 环境变量或 Secrets Manager",
    writeTargets: [
      "ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:cloud:confirmations",
      "corepack pnpm aliyun:health:smoke",
    ],
    requiresActionTimeConfirmation: true,
    completionEvidence: [
      "oss.confirmed=true",
      "oss.ramLeastPrivilege=true",
      "secret/token imported only through Aliyun controlled secret env",
    ],
  },
  S08_ALIYUN_RDS_DATABASE_URL: {
    obtainFrom: "阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env",
    writeTargets: [
      "DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only",
      "deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport non-secret confirmation",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:rds:migration:package",
      "corepack pnpm aliyun:rds:migration:evidence:strict",
      "corepack pnpm aliyun:sensitive:blockers:backend",
      "corepack pnpm aliyun:backend-cn:status",
      "corepack pnpm aliyun:completion:audit",
    ],
    requiresActionTimeConfirmation: true,
    completionEvidence: [
      "Aliyun RDS PostgreSQL instance exists in cn-hangzhou",
      "database account and least-privilege access are ready",
      "DATABASE_URL_CN imported through secret env only",
      "compatibilityReviewChecklistItemCount=6 is reviewed and closed before schema apply",
      "supabase_auth_uid/supabase_storage_schema/supabase_service_role/row_level_security/policy_statement/extension_review dispositions are recorded without secrets",
      "migration.schemaCompatibilityReviewed=true",
      "migration.supabaseSpecificSqlResolved=true",
      "migration.rdsExtensionSupportConfirmed=true",
      "schema/data/APP API smoke/rollback validation passed",
      "backend production-cn no longer depends on Supabase as formal database target",
    ],
  },
  S06_READY_SENSITIVE_ENV_IMPORT: {
    obtainFrom: "现有 Vercel production / Supabase / 阿里云百炼 / DeepSeek / 火山引擎 / 微信公众平台等控制台",
    writeTargets: [
      "SAE plain env for non-secret identifiers only",
      "KMS/Secrets Manager/SAE secret env for secret or connection values",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:env:checklist",
      "corepack pnpm aliyun:sensitive:blockers",
      "corepack pnpm aliyun:readiness:cloud-ready",
    ],
    requiresActionTimeConfirmation: true,
    completionEvidence: [
      "envImport.confirmed=true",
      "envImport.secretNotInImage=true",
      "importedAt records a non-secret timestamp/evidence handle",
    ],
  },
  S07_ANDROID_RELEASE_SIGNING: {
    obtainFrom: "Android release keystore 管理位置 / CI Secret Store；微信开放平台 -> 移动应用 -> Android 应用签名",
    writeTargets: [
      "MEIYE_RELEASE_STORE_FILE / MEIYE_RELEASE_STORE_PASSWORD / MEIYE_RELEASE_KEY_ALIAS / MEIYE_RELEASE_KEY_PASSWORD -> 本机或 CI 受控 signing secret store",
      "微信开放平台 -> 移动应用 -> Android 应用签名",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidSignature / androidConfigured",
    ],
    verifyCommands: [
      "cd /Users/Admin/Documents/美业话镜APP/meiye-huajing-app/android && ANDROID_HOME=\"$HOME/Library/Android/sdk\" ANDROID_SDK_ROOT=\"$HOME/Library/Android/sdk\" ./gradlew assembleRelease",
      "ANDROID_HOME=\"$HOME/Library/Android/sdk\" ANDROID_SDK_ROOT=\"$HOME/Library/Android/sdk\" $ANDROID_HOME/build-tools/<version>/apksigner verify --print-certs app/build/outputs/apk/release/*.apk",
      "corepack pnpm aliyun:wechat-open:package",
      "corepack pnpm aliyun:app-native:check",
    ],
    requiresActionTimeConfirmation: true,
    completionEvidence: [
      "Android release build succeeds with signingConfigs.release",
      "release APK/AAB exists and is not signed with debug.keystore",
      "wechatOpenPlatform.androidSignature records release signature evidence only",
      "wechatOpenPlatform.androidConfigured=true",
    ],
  },
}
