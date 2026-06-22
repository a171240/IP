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
    requiresActionTimeConfirmation: false,
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
    requiresActionTimeConfirmation: false,
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
    requiresActionTimeConfirmation: false,
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
    requiresActionTimeConfirmation: false,
    completionEvidence: [
      "oss.confirmed=true",
      "oss.ramLeastPrivilege=true",
      "secret/token imported only through Aliyun controlled secret env",
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
}
