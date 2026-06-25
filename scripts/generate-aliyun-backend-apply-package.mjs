#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const DEFAULT_CLOUD_INVENTORY_RESULTS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-inventory-results.local.json")
const DEFAULT_RDS_MIGRATION_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.rds-migration.local.json")
const READONLY_INVENTORY_AUTH_PACKET = "P00_ALIYUN_READONLY_INVENTORY_IDENTITY"
const FIRST_BACKEND_ACTION_PACKET_IDS = [
  READONLY_INVENTORY_AUTH_PACKET,
  "P03_ACR_PURCHASE",
  "P05_OSS_RAM_STS",
  "P11_ALIYUN_RDS_DATA_MIGRATION",
]
const FIRST_BACKEND_ACTION_STEP_IDS = [
  "BAP00_READONLY_INVENTORY_IDENTITY",
  "BAP03_ACR_PURCHASE_AND_REPOSITORY",
  "BAP02_OSS_RAM_STS_CLOSE",
  "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE",
]
const FIRST_BACKEND_ACTION_RECOMMENDED_REPLY =
  "授权本轮只做阿里云后端第一批动作：只读盘点、创建/确认 RDS PostgreSQL 并处理数据库密码、确认 OSS RAM/STS，购买/确认 ACR Enterprise Economic cn-hangzhou 1个月 CNY117；密钥只进入阿里云 KMS/Secrets Manager/SAE secret env，不写文档/代码/git；仅处理 RDS/OSS 所需的受控 secret env，暂不执行全量 SAE env import；不做微信/Android/iOS、不部署上线、不改 DNS。"

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /:\/\/[^\s:@]+:[^\s@]+@/,
  /(password|passwd|pwd|token|secret|access[_-]?key)\s*[:=]\s*[^,\s]{8,}/i,
]

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    cloudInventoryResultsFile: DEFAULT_CLOUD_INVENTORY_RESULTS_FILE,
    rdsMigrationFile: DEFAULT_RDS_MIGRATION_FILE,
    outPath: "",
    markdownPath: "",
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
      continue
    }
    if (arg === "--cloud-confirmations") {
      args.cloudConfirmationsFile = resolveValue(argv[++index], "--cloud-confirmations")
      continue
    }
    if (arg === "--cloud-inventory-results") {
      args.cloudInventoryResultsFile = resolveValue(argv[++index], "--cloud-inventory-results")
      continue
    }
    if (arg === "--rds-migration") {
      args.rdsMigrationFile = resolveValue(argv[++index], "--rds-migration")
      continue
    }
    if (arg === "--out") {
      args.outPath = resolveValue(argv[++index], "--out")
      continue
    }
    if (arg === "--markdown") {
      args.markdownPath = resolveValue(argv[++index], "--markdown")
      continue
    }
    if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    }
    throw new Error(`unknown_arg:${arg}`)
  }
  return args
}

function resolveValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function runJson(label, scriptArgs) {
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label}_failed:${result.status}\n${result.stderr || result.stdout}`)
  }
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`invalid_json_from_${label}:${error instanceof Error ? error.message : String(error)}`)
  }
}

function buildReport(args) {
  const backendStatus = runJson("backend_status", [
    "scripts/summarize-aliyun-backend-cn-status.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
    "--cloud-inventory-results",
    args.cloudInventoryResultsFile,
    "--rds-migration",
    args.rdsMigrationFile,
  ])
  const cloudActions = runJson("cloud_actions", [
    "scripts/generate-aliyun-cloud-actions-package.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const sensitiveBlockers = runJson("sensitive_blockers", [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--backend-only",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const rdsEvidence = runJson("rds_evidence", [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--local",
    args.rdsMigrationFile,
    "--allow-incomplete",
  ])

  const steps = buildApplySteps({ backendStatus, cloudActions, sensitiveBlockers, rdsEvidence })
  const immediateBackendSteps = steps.filter((step) => step.canStartAfterActionTimeConfirmation).map((step) => step.id)
  const blockedBackendSteps = steps.filter((step) => !step.canStartAfterActionTimeConfirmation).map((step) => step.id)
  const userIntervention = buildUserIntervention({ sensitiveBlockers, backendStatus, cloudActions })
  const credentialPasswordIntervention = buildCredentialPasswordIntervention(sensitiveBlockers)
  const actionTimeAuthorizationRequest = buildActionTimeAuthorizationRequest(steps)
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    packageId: "B00_ALIYUN_BACKEND_APPLY_PACKAGE",
    environment: "production-cn",
    currentScope: "backend_aliyun_only",
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    cloudApiCalledByThisCommand: false,
    canProceedWithoutWechat: backendStatus.canProceedWithoutWechat === true,
    canApplyBackendNowWithoutUserIntervention: false,
    canDeployBackendNow: backendStatus.canDeployBackendNow === true,
    currentAnswer: "当前包把阿里云后端补齐拆成可执行阶段；仍需用户在付款、密钥、数据库密码、生产 DNS/env/deploy 等动作时确认。",
    summary: {
      backendTargetReady: backendStatus.summary.backendTargetReady,
      backendRequiredBlocking: backendStatus.summary.backendRequiredBlocking,
      immediateBackendSteps,
      blockedBackendSteps,
      actionTimeConfirmationRequired: steps.filter((step) => step.requiresActionTimeConfirmation).map((step) => step.id),
      userInterventionRequired: userIntervention.requiredIds,
      deferredAppLaunchBlocking: backendStatus.summary.appLaunchDeferredBlocking,
      wechatExcludedFromBackend: true,
      cloudInventoryStrictReady: backendStatus.cloudInventory.strictReady === true,
      resourceEvidenceReady: backendStatus.cloudResources.evidenceReady,
      rdsMigrationEvidenceReady: rdsEvidence.local?.ready === true,
      blockedCredentialCount: userIntervention.blockedCredentialNames.length,
      readySecretEnvVariableCount: userIntervention.readySecretEnvVariableNames.length,
      missingCredentialValues: credentialPasswordIntervention.missingCredentialValues.names,
      readySecretsPendingCloudImport: credentialPasswordIntervention.readySecretsPendingCloudImport.count,
      paidPurchaseConfirmationActionIds: credentialPasswordIntervention.paidPurchaseConfirmationActionIds,
      controlledSecretChannelActionIds: credentialPasswordIntervention.controlledSecretChannelActionIds,
    },
    actionTimeAuthorizationRequest,
    applySteps: steps,
    userIntervention,
    credentialPasswordIntervention,
    evidenceWritebackTargets: [
      "deploy/aliyun-production-cn.cloud-inventory-results.local.json",
      "deploy/aliyun-production-cn.rds-migration.local.json",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json",
      "deploy/aliyun-production-cn.image-publish.local.json",
      "Aliyun KMS / Secrets Manager / SAE secret env",
      "Aliyun SAE runtime config",
    ],
    verificationOrder: [
      "corepack pnpm aliyun:backend-cn:status",
      "corepack pnpm aliyun:env:handoff:backend",
      "corepack pnpm aliyun:user:actions:backend",
      "corepack pnpm aliyun:action:authorization:backend",
      "corepack pnpm aliyun:cloudshell:handoff",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
      "corepack pnpm aliyun:rds:migration:package",
      "corepack pnpm aliyun:rds:migration:evidence",
      "corepack pnpm aliyun:cloud:confirmations",
      "corepack pnpm aliyun:image:plan",
      "corepack pnpm aliyun:evidence:writeback:backend",
      "corepack pnpm aliyun:operator:tasks:backend",
      "corepack pnpm aliyun:operator:handoff:backend",
      "corepack pnpm aliyun:backend-cn:apply-package",
      "corepack pnpm aliyun:predeploy",
    ],
    safetyBoundary: [
      "This command does not create, modify, purchase, deploy, push images, import secrets, or mutate DNS.",
      "Every apply step still needs action-time confirmation before external mutation.",
      "Only non-secret evidence handles, resource names, booleans, timestamps, and digest strings may be written to .local.json files.",
      "DATABASE_URL_CN, database password, AccessKeySecret, AppSecret, RAM Secret, STS token, registry password, cookie, certificate private key, Android keystore password, and Supabase service role key must never be written to JSON, Markdown, Docker image, APP bundle, mini-program package, git, or shell history.",
    ],
  }

  const secretMatches = findSecretLikeValues(report)
  report.secretLeakCheck = {
    ok: secretMatches.length === 0,
    matches: secretMatches,
  }
  if (secretMatches.length) {
    report.ok = false
    report.containsValues = true
  }
  return report
}

function buildActionTimeAuthorizationRequest(steps) {
  const stepsById = new Map(steps.map((step) => [step.id, step]))
  const firstActionSteps = FIRST_BACKEND_ACTION_STEP_IDS
    .map((id) => stepsById.get(id))
    .filter(Boolean)
  return {
    required: true,
    currentScope: "backend_aliyun_only",
    backendOnly: true,
    stepIds: FIRST_BACKEND_ACTION_STEP_IDS,
    packetIds: FIRST_BACKEND_ACTION_PACKET_IDS,
    recommendedUserReply: FIRST_BACKEND_ACTION_RECOMMENDED_REPLY,
    allowedActions: [
      "恢复阿里云 CLI/CloudShell 只读盘点身份，只运行 allowlisted List/Describe/stat/get inventory 命令。",
      "创建或确认 cn-hangzhou RDS PostgreSQL、数据库、账号和网络访问策略，并只把 DATABASE_URL_CN 写入阿里云受控 secret env。",
      "确认 OSS bucket/CORS/service-records 前缀，绑定最小权限 RAM/STS 或运行时角色。",
      "购买或确认 ACR Enterprise Economic cn-hangzhou 1个月 CNY117，并记录 registry host、namespace、repository 等非密钥证据。",
    ],
    explicitlyExcluded: [
      "不创建微信开放平台移动应用，不处理 Android release signing，不读取 Apple Team ID/AASA。",
      "不执行 production-cn 部署、postdeploy smoke、DNS/HTTPS/ICP 变更或 git push。",
      "不执行 docker login/push，不配置 SAE 镜像拉取。",
      "不执行全量 SAE 环境变量导入；只允许本批 RDS/OSS 动作要求的受控 secret env 写入。",
      "不把 DATABASE_URL_CN、数据库密码、AccessKeySecret、STS token、registry password、Supabase service role key、cookie 或证书私钥写入 JSON、Markdown、Docker 镜像、App 包、小程序包、shell history 或 git。",
    ],
    valueHandling: [
      "只允许记录变量名、资源名、布尔值、时间戳、digest、控制台路径和非密钥 evidence handle。",
      "密钥和密码只进入阿里云 KMS/Secrets Manager/SAE secret env 或受控凭证通道。",
    ],
    writeTargets: firstActionSteps.flatMap((step) => step.writeTargets || []),
    verifyCommands: Array.from(new Set(firstActionSteps.flatMap((step) => step.verifyCommands || []))),
  }
}

function buildCredentialPasswordIntervention(sensitiveBlockers) {
  const intervention = sensitiveBlockers.credentialPasswordIntervention || {}
  const brief = sensitiveBlockers.credentialInterventionBrief || {}
  const breakdown = brief.interventionBreakdown || {}
  const missingCredentialValues = intervention.missingCredentialValues ||
    breakdown.missingCredentialValues ||
    { count: (brief.blockedCredentialNames || []).length, names: brief.blockedCredentialNames || [], actionIds: [] }
  const readySecretsPendingCloudImport = intervention.readySecretsPendingCloudImport ||
    breakdown.readySecretsPendingCloudImport ||
    { count: (brief.readySecretEnvVariableNames || []).length, names: brief.readySecretEnvVariableNames || [], actionIds: [] }
  const paidPurchaseConfirmationActionIds = intervention.paidPurchaseConfirmationActionIds ||
    breakdown.paidPurchaseConfirmationActionIds ||
    []
  const controlledSecretChannelActionIds = intervention.controlledSecretChannelActionIds ||
    breakdown.controlledSecretChannelActionIds ||
    []
  const actionIds = intervention.actionIds || [
    ...(missingCredentialValues.actionIds || []),
    ...(readySecretsPendingCloudImport.actionIds || []),
    ...paidPurchaseConfirmationActionIds,
    ...controlledSecretChannelActionIds,
  ].filter((item, index, items) => item && items.indexOf(item) === index)

  return {
    required: intervention.required !== false && actionIds.length > 0,
    missingCredentialValues: {
      count: missingCredentialValues.count || 0,
      names: missingCredentialValues.names || [],
      actionIds: missingCredentialValues.actionIds || [],
    },
    readySecretsPendingCloudImport: {
      count: readySecretsPendingCloudImport.count || 0,
      names: readySecretsPendingCloudImport.names || [],
      actionIds: readySecretsPendingCloudImport.actionIds || [],
    },
    paidPurchaseConfirmationActionIds,
    controlledSecretChannelActionIds,
    actionIds,
    userMustProvideOrConfirm: intervention.userMustProvideOrConfirm || [
      "DATABASE_URL_CN must come from Aliyun RDS PostgreSQL and must only enter KMS/Secrets Manager/SAE secret env.",
      "Ready local secret variables still need controlled Aliyun secret-env import; values must not be copied into reports, images, git, chat, or shell history.",
      "ACR purchase and registry/runtime pull credentials require action-time confirmation.",
    ],
    forbiddenStorage: intervention.forbiddenStorage || brief.forbiddenStorage || [],
  }
}

function buildApplySteps({ backendStatus, cloudActions, sensitiveBlockers, rdsEvidence }) {
  const statusBlockers = new Set(backendStatus.summary.backendRequiredBlocking || [])
  const immediateConsoleTasks = new Set(cloudActions.summary?.canStartNowConsoleTasks || [])
  const blockedConsoleTasks = new Set(cloudActions.summary?.blockedByDependencies || [])
  const blockedCredentialNames = new Set(sensitiveBlockers.credentialInterventionBrief?.blockedCredentialNames || [])
  const readySecretEnvVariableNames = sensitiveBlockers.credentialInterventionBrief?.readySecretEnvVariableNames || []
  const cloudInventory = backendStatus.cloudInventory?.backendMeaning || {}
  const cloudInventoryReady = backendStatus.cloudInventory?.strictReady === true
  const cloudInventoryReadyLocalOperations = backendStatus.cloudInventory?.readyLocalOperations || "unknown"
  const cloudInventoryExecutedCommandResults = backendStatus.cloudInventory?.executedCommandResults || "unknown"
  const cliConfigFailureCategory = cloudActions.summary?.cliConfigProbeFailureCategory || "unknown"
  const resourceEvidenceById = new Map(
    (cloudActions.cloudActionClosureBrief?.blockedResourceEvidence || []).map((item) => [item.id, item]),
  )
  const ossResourceEvidence = resourceEvidenceById.get("R05_OSS_AUDIO_STORAGE")
  const slsResourceEvidence = resourceEvidenceById.get("R07_SLS_ALERTS")

  return [
    {
      id: "BAP00_READONLY_INVENTORY_IDENTITY",
      title: "Restore Aliyun CLI or CloudShell read-only inventory evidence",
      canStartAfterActionTimeConfirmation: !cloudInventoryReady,
      requiresActionTimeConfirmation: true,
      mutationType: "readonly_inventory_identity_and_non_secret_writeback",
      requiredAuthorizationPackets: [READONLY_INVENTORY_AUTH_PACKET],
      consolePath: "本机 Aliyun CLI default profile 或阿里云控制台 -> CloudShell",
      currentEvidence: [
        `cloudInventoryStrictReady=${cloudInventoryReady}`,
        `readyLocalOperations=${cloudInventoryReadyLocalOperations}`,
        `executedCommandResults=${cloudInventoryExecutedCommandResults}`,
        `cliConfigProbeFailureCategory=${cliConfigFailureCategory}`,
      ],
      currentBlockers: cloudInventoryReady ? [] : [
        `cloudInventory:readonly_inventory_strict_ready=${cloudInventoryReadyLocalOperations}`,
        ...(cliConfigFailureCategory === "unknown" ? [] : [cliConfigFailureCategory]),
      ],
      writeTargets: [
        "deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries",
      ],
      userMustHandle: [
        "Aliyun CLI default profile or CloudShell logged-in read-only identity",
        "If CloudShell shows an 开通 page with a performance NAS usage-fee warning, confirm that warning before clicking 开通.",
        "If the current CloudShell tab is disconnected, reconnecting it still requires action-time confirmation.",
        "AccessKeySecret or STS token must never be copied into JSON, Markdown, chat, git, or shell history",
      ],
      actionTimeConfirmation: {
        minimumUserPhrase: "授权开通/重新连接阿里云 CloudShell 或配置 Aliyun CLI；如 CloudShell 提示会创建性能型 NAS 并可能产生费用，确认后才可点击开通；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。",
        allowedActions: [
          "If CloudShell requires service activation, confirm the performance NAS usage-fee warning before clicking 开通.",
          "Reconnect the existing Aliyun CloudShell session or configure the official Aliyun CLI profile.",
          "Run only the generated List/Describe/stat/get inventory commands.",
          "Write only resource names, booleans, timestamps, command status, digest handles, and non-secret evidence handles.",
        ],
        explicitlyExcluded: [
          "No Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation commands.",
          "No docker login/push, registry password, AccessKeySecret, STS token, cookie, or certificate private key capture.",
          "No production-cn deploy, env import, business resource creation, or billing action beyond the explicitly confirmed CloudShell activation warning.",
        ],
      },
      nonSecretEvidenceToRecord: [
        "readyLocalOperations count",
        "executedCommandResults count",
        "cloudApiCalledCommandResults count",
        "mutationPerformedCommandResults=0",
        "observed/not_found/blocked operation ids",
        "timestamp and evidence handles only",
      ],
      verifyCommands: [
        "corepack pnpm aliyun:cloudshell:handoff",
        "corepack pnpm aliyun:cloud:access",
        "MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json",
        "corepack pnpm aliyun:cloud:inventory-results:strict",
        "corepack pnpm aliyun:evidence:writeback:backend",
      ],
    },
    {
      id: "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE",
      title: "Create Aliyun RDS PostgreSQL and close Supabase-to-RDS migration",
      canStartAfterActionTimeConfirmation: true,
      requiresActionTimeConfirmation: true,
      mutationType: "paid_resource_create_and_data_migration",
      requiredAuthorizationPackets: ["P11_ALIYUN_RDS_DATA_MIGRATION"],
      consolePath: "阿里云控制台 -> 云数据库 RDS -> PostgreSQL -> cn-hangzhou",
      currentEvidence: [
        `inventory.rdsPostgres=${cloudInventory.rdsPostgres || "unknown"}`,
        `rdsLocalExists=${rdsEvidence.local?.exists === true}`,
        `rdsLocalReady=${rdsEvidence.local?.ready === true}`,
        `appApiRoutesTouchingSupabaseCompatibility=${rdsEvidence.summary?.appApiRoutesWithSupabase || 0}/${rdsEvidence.summary?.appApiRouteCount || 0}`,
        `appApiRoutesWithSupabaseDataAccess=${rdsEvidence.summary?.appApiRoutesWithSupabaseDataAccess || 0}/${rdsEvidence.summary?.appApiRouteCount || 0}`,
        `firstVersionRdsRoutesTouchingSupabaseCompatibility=${rdsEvidence.summary?.firstVersionRdsRoutesWithSupabase || 0}/${rdsEvidence.summary?.firstVersionRdsRouteCount || 0}`,
        `firstVersionRdsRoutesWithSupabaseDataAccess=${rdsEvidence.summary?.firstVersionRdsRoutesWithSupabaseDataAccess || 0}/${rdsEvidence.summary?.firstVersionRdsRouteCount || 0}`,
        `postgresDataAccessAdapterDetected=${rdsEvidence.summary?.postgresDataAccessAdapterDetected === true}`,
        "rdsMigrationPackageHandoff=docs/app-production-cn-rds-migration-package.md",
      ],
      currentBlockers: [
        ...filterPresent(statusBlockers, [
          "DATABASE_URL_CN",
          "RDS_POSTGRES_NOT_READY",
          "RDS_MIGRATION_EVIDENCE_NOT_READY",
          "APP_API_POSTGRES_ADAPTER_MISSING",
        ]),
        ...(rdsEvidence.local?.blockers || []).map((item) => `rdsEvidence:${item}`),
      ],
      writeTargets: [
        "docs/app-production-cn-rds-migration-package.md -> non-secret schema/validation/rollback package digest handoff",
        "deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres/sourceInventory/migration/security",
        "DATABASE_URL_CN -> Aliyun KMS / Secrets Manager / SAE secret env only",
      ],
      userMustHandle: [
        "RDS purchase/spec confirmation if billed",
        "database account password",
        "DATABASE_URL_CN secret value",
        "Supabase export/import credentials during migration",
        "migration rollback confirmation",
      ],
      nonSecretEvidenceToRecord: [
        "RDS instance id/name/region/engine version",
        "database name",
        "database account ready=true",
        "DATABASE_URL_CN secret imported=true without value",
        "schema/data/row-count/critical-record/rollback validation handles",
      ],
      verifyCommands: [
        "corepack pnpm aliyun:rds:migration:package",
        "corepack pnpm aliyun:rds:migration:plan",
        "corepack pnpm aliyun:rds:migration:evidence:strict",
        "corepack pnpm aliyun:backend-cn:status",
      ],
    },
    {
      id: "BAP02_OSS_RAM_STS_CLOSE",
      title: "Close OSS audio bucket RAM least privilege or STS/runtime role",
      canStartAfterActionTimeConfirmation: immediateConsoleTasks.has("C05_OSS_AUDIO_RAM_STS"),
      requiresActionTimeConfirmation: true,
      mutationType: "ram_policy_binding_or_secret_runtime_role",
      requiredAuthorizationPackets: ["P05_OSS_RAM_STS"],
      consolePath: "阿里云控制台 -> OSS / RAM / STS",
      currentEvidence: [
        `inventory.ossAudioBucket=${cloudInventory.ossAudioBucket || "unknown"}`,
        ...formatResourceEvidence("ossResource", ossResourceEvidence),
        "bucket=meiye-huajing-service-records-production-cn",
        "serviceRecordPrefix=service-records/production-cn",
      ],
      currentBlockers: filterPresent(statusBlockers, ["OSS_RAM_STS_NOT_READY"]),
      writeTargets: [
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss",
        "ALIYUN_OSS_ACCESS_KEY_SECRET / STS token -> KMS/Secrets Manager/SAE secret env only if runtime role is not used",
      ],
      userMustHandle: [
        "AccessKeySecret or STS token if runtime role is not selected",
        "RAM policy attachment or runtime role authorization",
      ],
      nonSecretEvidenceToRecord: [
        "confirmed=true",
        "ramLeastPrivilege=true",
        "runtime role or STS path selected",
        "serviceRecordPrefix=service-records/production-cn",
      ],
      verifyCommands: [
        "corepack pnpm aliyun:cloud:confirmations",
        "corepack pnpm aliyun:backend-cn:status",
      ],
    },
    {
      id: "BAP03_ACR_PURCHASE_AND_REPOSITORY",
      title: "Confirm ACR Enterprise instance, namespace, and repository",
      canStartAfterActionTimeConfirmation: immediateConsoleTasks.has("C02_ACR_IMAGE_AND_PULL"),
      requiresActionTimeConfirmation: true,
      mutationType: "paid_resource_purchase_or_confirmation",
      requiredAuthorizationPackets: ["P03_ACR_PURCHASE"],
      consolePath: "阿里云控制台 -> 容器镜像服务 ACR -> 企业版实例/命名空间/镜像仓库",
      currentEvidence: [
        `inventory.acrImage=${cloudInventory.acrImage || "unknown"}`,
        "edition=ACR Enterprise Economic",
        "region=cn-hangzhou",
        "term=1 month",
        "quotedAmount=CNY 117.00",
        "repository=meiye-huajing-app-api",
      ],
      currentBlockers: filterPresent(statusBlockers, ["ACR_IMAGE_REGISTRY_NOT_READY"]),
      writeTargets: [
        "deploy/aliyun-production-cn.image-publish.local.json -> acr.confirmed/registryHost/namespace/repository",
      ],
      userMustHandle: [
        "ACR paid purchase confirmation",
        "registry password only later through docker login or controlled credential helper",
      ],
      nonSecretEvidenceToRecord: [
        "acr.purchaseCandidate.confirmed=true",
        "actual registryHost",
        "actual namespace",
        "repository created",
      ],
      verifyCommands: [
        "corepack pnpm aliyun:image:plan",
        "corepack pnpm aliyun:backend-cn:status",
      ],
    },
    {
      id: "BAP04_ACR_IMAGE_PUSH_AND_PULL",
      title: "Push backend image to ACR and configure SAE pull evidence",
      canStartAfterActionTimeConfirmation: false,
      blockedUntil: ["BAP03_ACR_PURCHASE_AND_REPOSITORY"],
      requiresActionTimeConfirmation: true,
      mutationType: "docker_login_push_and_runtime_pull_secret",
      requiredAuthorizationPackets: ["P04_ACR_IMAGE_AND_PULL"],
      consolePath: "本机 Docker + 阿里云 ACR + SAE runtime image pull",
      currentEvidence: ["localDockerImage.status=ready"],
      currentBlockers: filterPresent(statusBlockers, ["ACR_IMAGE_REGISTRY_NOT_READY", "SAE_RUNTIME_NOT_READY"]),
      writeTargets: [
        "deploy/aliyun-production-cn.image-publish.local.json -> image/runtime",
        "SAE runtime image pull config",
      ],
      userMustHandle: [
        "docker login / registry password or credential helper",
        "SAE image pull credential if not using internal authorization",
      ],
      nonSecretEvidenceToRecord: [
        "imagePushed=true",
        "remoteImage",
        "remoteDigest sha256",
        "digestVerified=true",
        "runtime.remoteImageConfigured=true",
        "runtime.imagePullConfigured=true",
      ],
      verifyCommands: [
        "corepack pnpm aliyun:image:plan:strict",
        "corepack pnpm aliyun:backend-cn:status",
      ],
    },
    {
      id: "BAP05_BACKEND_ENV_IMPORT",
      title: "Import backend env into SAE/KMS/Secrets Manager",
      canStartAfterActionTimeConfirmation: false,
      blockedUntil: ["BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE", "BAP02_OSS_RAM_STS_CLOSE", "BAP04_ACR_IMAGE_PUSH_AND_PULL"],
      requiresActionTimeConfirmation: true,
      mutationType: "secret_env_import",
      requiredAuthorizationPackets: ["P06_ENV_IMPORT"],
      consolePath: "阿里云控制台 -> SAE 环境变量 / KMS / Secrets Manager",
      currentEvidence: [
        `readySecretEnvVariableCount=${readySecretEnvVariableNames.length}`,
        `wechatExcludedFromBackend=${backendStatus.canProceedWithoutWechat === true}`,
      ],
      currentBlockers: filterPresent(statusBlockers, ["DATABASE_URL_CN", "ENV_IMPORT_NOT_READY"]),
      writeTargets: [
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport",
        "Aliyun KMS / Secrets Manager / SAE secret env",
      ],
      userMustHandle: [
        "DATABASE_URL_CN",
        "ready secret env import",
        "ALIYUN_OSS_ACCESS_KEY_SECRET or STS token if runtime role is not used",
        "SUPABASE_SERVICE_ROLE_KEY only if migration compatibility remains temporarily needed",
      ],
      backendEnvExcludesForNow: [
        "WECHAT_OPEN_APP_ID",
        "WECHAT_OPEN_APP_SECRET",
        "WECHAT_OPEN_PLATFORM_MOBILE_APP",
      ],
      nonSecretEvidenceToRecord: [
        "envImport.confirmed=true",
        "target=SAE/KMS/SecretsManager",
        "secretNotInImage=true",
        "importedAt timestamp",
      ],
      verifyCommands: [
        "corepack pnpm aliyun:env:checklist",
        "corepack pnpm aliyun:sensitive:blockers",
        "corepack pnpm aliyun:backend-cn:status",
      ],
    },
    {
      id: "BAP06_SAE_RUNTIME_CREATE",
      title: "Create SAE custom-container runtime",
      canStartAfterActionTimeConfirmation: false,
      blockedUntil: ["BAP04_ACR_IMAGE_PUSH_AND_PULL", "BAP05_BACKEND_ENV_IMPORT"],
      requiresActionTimeConfirmation: true,
      mutationType: "runtime_create_or_update",
      requiredAuthorizationPackets: ["P08_SAE_RUNTIME_SLS"],
      consolePath: "阿里云控制台 -> SAE -> cn-hangzhou",
      currentEvidence: [`inventory.saeRuntime=${cloudInventory.saeRuntime || "unknown"}`],
      currentBlockers: filterPresent(statusBlockers, ["SAE_RUNTIME_NOT_READY"]),
      writeTargets: [
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime",
      ],
      userMustHandle: [
        "SAE paid/runtime resource confirmation if prompted",
        "runtime env visibility check without exposing values",
      ],
      nonSecretEvidenceToRecord: [
        "provider=SAE",
        "region=cn-hangzhou",
        "appName=meiye-huajing-app-api-production-cn",
        "containerPort=3000",
        "healthPath=/api/healthz",
        "confirmed=true",
      ],
      verifyCommands: [
        "corepack pnpm aliyun:runtime:plan",
        "corepack pnpm aliyun:cloud:confirmations",
        "corepack pnpm aliyun:backend-cn:status",
      ],
    },
    {
      id: "BAP07_DOMAINS_HTTPS_ICP",
      title: "Bind api-cn/assets-cn DNS, HTTPS, and ICP-compliant public access",
      canStartAfterActionTimeConfirmation: false,
      blockedUntil: ["BAP06_SAE_RUNTIME_CREATE", "BAP02_OSS_RAM_STS_CLOSE"],
      requiresActionTimeConfirmation: true,
      mutationType: "dns_https_certificate_binding",
      requiredAuthorizationPackets: ["P07_DOMAIN_DNS_HTTPS"],
      consolePath: "阿里云控制台 -> 云解析 DNS / 数字证书 / SAE 或 OSS-CDN 自定义域名",
      currentEvidence: [
        "api-cn.ipgongchang.xin=not_ready",
        "assets-cn.ipgongchang.xin=not_ready",
      ],
      currentBlockers: filterPresent(statusBlockers, ["API_DOMAIN_HTTPS_ICP_NOT_READY", "ASSET_DOMAIN_HTTPS_ICP_NOT_READY"]),
      writeTargets: [
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps",
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps",
      ],
      userMustHandle: [
        "DNS change confirmation",
        "certificate issuance/binding confirmation",
        "ICP compliance confirmation",
      ],
      nonSecretEvidenceToRecord: [
        "dnsResolvedToAliyun=true",
        "httpsEnabled=true",
        "icpReady=true",
        "confirmed=true",
      ],
      verifyCommands: [
        "corepack pnpm aliyun:domain:strict",
        "corepack pnpm aliyun:backend-cn:status",
      ],
    },
    {
      id: "BAP08_SLS_ALERTS",
      title: "Configure SLS health and 5xx alerts",
      canStartAfterActionTimeConfirmation: false,
      blockedUntil: ["BAP06_SAE_RUNTIME_CREATE"],
      requiresActionTimeConfirmation: true,
      mutationType: "observability_alert_create",
      requiredAuthorizationPackets: ["P08_SAE_RUNTIME_SLS"],
      consolePath: "阿里云控制台 -> 日志服务 SLS",
      currentEvidence: [
        `inventory.slsProject=${cloudInventory.slsProject || "unknown"}`,
        ...formatResourceEvidence("slsResource", slsResourceEvidence),
        "alerts=0",
      ],
      currentBlockers: filterPresent(statusBlockers, ["SLS_ALERTS_NOT_READY"]),
      writeTargets: [
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts",
      ],
      userMustHandle: [
        "alert recipient/channel confirmation if needed",
      ],
      nonSecretEvidenceToRecord: [
        "healthAlertConfigured=true",
        "serverErrorAlertConfigured=true",
        "confirmed=true",
      ],
      verifyCommands: [
        "corepack pnpm aliyun:cloud:confirmations",
        "corepack pnpm aliyun:backend-cn:status",
      ],
    },
    {
      id: "BAP09_POSTDEPLOY_SMOKE",
      title: "Run Aliyun backend health and APP API smoke",
      canStartAfterActionTimeConfirmation: false,
      blockedUntil: ["BAP06_SAE_RUNTIME_CREATE", "BAP07_DOMAINS_HTTPS_ICP"],
      requiresActionTimeConfirmation: true,
      mutationType: "production_deploy_and_smoke",
      requiredAuthorizationPackets: ["P09_PRODUCTION_DEPLOY"],
      consolePath: "Aliyun SAE deployment + local smoke commands",
      currentEvidence: ["baseUrl=https://api-cn.ipgongchang.xin", "expected unauthenticated business routes return 401"],
      currentBlockers: filterPresent(statusBlockers, ["POSTDEPLOY_SMOKE_NOT_RUN"]),
      writeTargets: [
        "release artifacts -> postdeploy smoke evidence",
      ],
      userMustHandle: [
        "production deploy authorization",
        "rollback decision if smoke fails",
      ],
      nonSecretEvidenceToRecord: [
        "/api/healthz ready",
        "APP API route smoke passed",
        "service-record upload smoke passed after auth",
      ],
      verifyCommands: [
        "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin",
        "corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin",
        "corepack pnpm aliyun:app-api:smoke -- --base-url https://api-cn.ipgongchang.xin",
      ],
    },
  ].map((step) => ({
    ...step,
    blocked: step.currentBlockers.length > 0 || Boolean(step.blockedUntil?.length),
  }))
}

function buildUserIntervention({ sensitiveBlockers, backendStatus, cloudActions }) {
  const credentialBrief = sensitiveBlockers.credentialInterventionBrief || {}
  const blockedCredentialNames = credentialBrief.blockedCredentialNames || []
  const readySecretEnvVariableNames = credentialBrief.readySecretEnvVariableNames || []
  const appLaunchDeferred = backendStatus.summary.appLaunchDeferredBlocking || []
  const requiredIds = [
    "USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD",
    "USER_CONFIRM_ACR_PAID_PURCHASE",
    "USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE",
    "USER_CONFIRM_SECRET_ENV_IMPORT",
    "USER_CONFIRM_DNS_HTTPS_ICP_CHANGE",
    "USER_CONFIRM_PRODUCTION_DEPLOY",
  ]
  return {
    requiredIds,
    paymentOrBillingConfirmations: [
      "RDS PostgreSQL instance/spec purchase or existing instance confirmation",
      "ACR Enterprise Economic cn-hangzhou 1 month quoted CNY 117.00",
      "SAE runtime/public ingress/SLS/certificate costs if prompted by Aliyun",
    ],
    secretOrPasswordHandling: [
      "Aliyun CLI profile, CloudShell session, AccessKeySecret or STS token if needed for read-only inventory",
      "DATABASE_URL_CN",
      "database account password",
      "ALIYUN_OSS_ACCESS_KEY_SECRET or STS token if runtime role is not used",
      "ACR registry password or credential helper",
      "ready secret env import values",
      "SUPABASE_SERVICE_ROLE_KEY only for controlled migration/export compatibility",
    ],
    blockedCredentialNames,
    readySecretEnvVariableNames,
    deferredAppLaunchBlocking: appLaunchDeferred,
    backendNowExcludes: [
      "WECHAT_OPEN_APP_ID",
      "WECHAT_OPEN_APP_SECRET",
      "WECHAT_OPEN_PLATFORM_MOBILE_APP",
      "ANDROID_RELEASE_WECHAT_SIGNATURE",
    ],
    actionTimeCloudConsolePackets: cloudActions.summary?.cloudConsolePackets || [],
  }
}

function filterPresent(blockerSet, names) {
  return names.filter((name) => blockerSet.has(name))
}

function formatResourceEvidence(prefix, evidence) {
  if (!evidence) return []
  return [
    `${prefix}.observedStatus=${evidence.observedStatus || "unknown"}`,
    `${prefix}.observedReadiness=${evidence.observedReadiness || "unknown"}`,
    ...(evidence.currentEvidence || []).slice(0, 3).map((item, index) => `${prefix}.currentEvidence${index + 1}=${item}`),
    ...(evidence.missingEvidence || []).slice(0, 4).map((item) => `${prefix}.missing=${item}`),
  ]
}

function renderMarkdown(report) {
  return [
    "# APP production-cn Aliyun backend apply package",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Scope",
    "",
    `- currentScope: ${report.currentScope}`,
    `- canProceedWithoutWechat: ${report.canProceedWithoutWechat}`,
    `- canDeployBackendNow: ${report.canDeployBackendNow}`,
    `- canApplyBackendNowWithoutUserIntervention: ${report.canApplyBackendNowWithoutUserIntervention}`,
    `- backendTargetReady: ${report.summary.backendTargetReady}`,
    `- resourceEvidenceReady: ${report.summary.resourceEvidenceReady}`,
    "",
    "## Immediate Backend Steps After Confirmation",
    "",
    `- ${report.summary.immediateBackendSteps.join(", ") || "none"}`,
    "",
    "## Blocked Backend Steps",
    "",
    `- ${report.summary.blockedBackendSteps.join(", ") || "none"}`,
    "",
    "## Action-Time Authorization Request",
    "",
    `- required: ${report.actionTimeAuthorizationRequest.required}`,
    `- currentScope: ${report.actionTimeAuthorizationRequest.currentScope}`,
    `- stepIds: ${report.actionTimeAuthorizationRequest.stepIds.join(", ")}`,
    `- packetIds: ${report.actionTimeAuthorizationRequest.packetIds.join(", ")}`,
    `- recommendedUserReply: ${report.actionTimeAuthorizationRequest.recommendedUserReply}`,
    `- allowedActions: ${report.actionTimeAuthorizationRequest.allowedActions.join("; ")}`,
    `- explicitlyExcluded: ${report.actionTimeAuthorizationRequest.explicitlyExcluded.join("; ")}`,
    `- valueHandling: ${report.actionTimeAuthorizationRequest.valueHandling.join("; ")}`,
    "",
    "## User Intervention",
    "",
    `- requiredIds: ${report.userIntervention.requiredIds.join(", ")}`,
    `- paymentOrBillingConfirmations: ${report.userIntervention.paymentOrBillingConfirmations.join("; ")}`,
    `- secretOrPasswordHandling: ${report.userIntervention.secretOrPasswordHandling.join("; ")}`,
    `- blockedCredentialCount: ${report.userIntervention.blockedCredentialNames.length}`,
    `- blockedCredentialNames: ${report.userIntervention.blockedCredentialNames.join(", ") || "none"}`,
    `- backendNowExcludes: ${report.userIntervention.backendNowExcludes.join(", ")}`,
    "",
    "## Credential / Password Intervention",
    "",
    ...renderCredentialPasswordIntervention(report.credentialPasswordIntervention),
    "",
    "## Apply Steps",
    "",
    ...report.applySteps.flatMap((step) => [
      `### ${step.id}`,
      "",
      `- title: ${step.title}`,
      `- canStartAfterActionTimeConfirmation: ${step.canStartAfterActionTimeConfirmation}`,
      `- blockedUntil: ${(step.blockedUntil || []).join(", ") || "none"}`,
      `- mutationType: ${step.mutationType}`,
      `- requiredAuthorizationPackets: ${step.requiredAuthorizationPackets.join(", ")}`,
      `- consolePath: ${step.consolePath}`,
      `- currentEvidence: ${step.currentEvidence.join("; ") || "none"}`,
      `- currentBlockers: ${step.currentBlockers.join(", ") || "none"}`,
      `- writeTargets: ${step.writeTargets.join("; ")}`,
      `- userMustHandle: ${step.userMustHandle.join("; ")}`,
      ...(step.actionTimeConfirmation ? [
        `- actionTimeConfirmation.minimumUserPhrase: ${step.actionTimeConfirmation.minimumUserPhrase}`,
        `- actionTimeConfirmation.allowedActions: ${step.actionTimeConfirmation.allowedActions.join("; ")}`,
        `- actionTimeConfirmation.explicitlyExcluded: ${step.actionTimeConfirmation.explicitlyExcluded.join("; ")}`,
      ] : []),
      `- nonSecretEvidenceToRecord: ${step.nonSecretEvidenceToRecord.join("; ")}`,
      `- verifyCommands: ${step.verifyCommands.join("; ")}`,
      "",
    ]),
    "## Verification Order",
    "",
    ...report.verificationOrder.map((item) => `- ${item}`),
    "",
    "## Safety Boundary",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
    "",
  ].join("\n")
}

function renderCredentialPasswordIntervention(intervention) {
  return [
    `- required: ${intervention.required}`,
    `- missingCredentialValues: ${intervention.missingCredentialValues.names.join(", ") || "none"}`,
    `- missingCredentialValueActionIds: ${intervention.missingCredentialValues.actionIds.join(", ") || "none"}`,
    `- readySecretsPendingCloudImport: ${intervention.readySecretsPendingCloudImport.count}`,
    `- readySecretsPendingCloudImportActionIds: ${intervention.readySecretsPendingCloudImport.actionIds.join(", ") || "none"}`,
    `- paidPurchaseConfirmationActionIds: ${intervention.paidPurchaseConfirmationActionIds.join(", ") || "none"}`,
    `- controlledSecretChannelActionIds: ${intervention.controlledSecretChannelActionIds.join(", ") || "none"}`,
    `- actionIds: ${intervention.actionIds.join(", ") || "none"}`,
    `- forbiddenStorage: ${intervention.forbiddenStorage.join(", ") || "none"}`,
    ...intervention.userMustProvideOrConfirm.map((item) => `- ${item}`),
  ]
}

function findSecretLikeValues(value, path = "$") {
  const matches = []
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) matches.push(path)
    return matches
  }
  if (!value || typeof value !== "object") return matches
  if (Array.isArray(value)) {
    value.forEach((item, index) => matches.push(...findSecretLikeValues(item, `${path}[${index}]`)))
    return matches
  }
  for (const [key, nested] of Object.entries(value)) {
    matches.push(...findSecretLikeValues(nested, `${path}.${key}`))
  }
  return matches
}

function writeOutput(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildReport(args)
  if (args.outPath) writeOutput(args.outPath, JSON.stringify(report, null, 2))
  if (args.markdownPath) writeOutput(args.markdownPath, renderMarkdown(report))
  console.log(JSON.stringify(report, null, 2))
  if (!report.secretLeakCheck.ok) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-aliyun-backend-apply-package.mjs [--out path] [--markdown path]",
    "",
    "Builds a value-free backend-only Aliyun apply package. It does not mutate cloud resources.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
