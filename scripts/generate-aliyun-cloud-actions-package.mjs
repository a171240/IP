#!/usr/bin/env node

import { writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runJsonWithCache } from "./lib/run-json-cache.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")

const CLOUD_CONSOLE_PACKET_IDS = new Set([
  "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
  "P11_ALIYUN_RDS_DATA_MIGRATION",
  "P05_OSS_RAM_STS",
  "P03_ACR_PURCHASE",
  "P04_ACR_IMAGE_AND_PULL",
])
const EXTERNAL_APP_PACKET_IDS = new Set(["P01_WECHAT_OPEN_MOBILE_APP", "P10_ANDROID_RELEASE_SIGNING", "P02_APPLE_TEAM_ID"])
const CURRENT_SCOPE = "backend_aliyun_only"
const FULL_APP_LAUNCH_SCOPE = "deferred_after_backend_online"
const BACKEND_FIRST_STEPS = [
  {
    id: "BAP00_READONLY_INVENTORY_IDENTITY",
    title: "Restore Aliyun CLI or CloudShell read-only inventory evidence",
    orderLine: "0. Restore Aliyun CLI/CloudShell read-only inventory evidence and write non-secret summaries only.",
    requiredAuthorizationPackets: ["P00_ALIYUN_READONLY_INVENTORY_IDENTITY"],
    blockingDependencies: [],
    userIntervention: "USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY",
  },
  {
    id: "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE",
    title: "Create Aliyun RDS PostgreSQL and close Supabase-to-RDS migration",
    orderLine: "1. Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou and close Supabase-to-RDS migration evidence.",
    requiredAuthorizationPackets: ["P11_ALIYUN_RDS_DATA_MIGRATION"],
    blockingDependencies: [],
    userIntervention: "USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD",
  },
  {
    id: "BAP02_OSS_RAM_STS_CLOSE",
    title: "Close OSS audio bucket RAM least privilege or STS/runtime role",
    orderLine: "2. Confirm OSS RAM/STS least-privilege runtime access.",
    requiredAuthorizationPackets: ["P05_OSS_RAM_STS"],
    blockingDependencies: [],
    userIntervention: "USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE",
  },
  {
    id: "BAP03_ACR_PURCHASE_AND_REPOSITORY",
    title: "Confirm ACR Enterprise instance, namespace, and repository",
    orderLine: "3. Purchase/confirm ACR Enterprise instance, namespace, and repository.",
    requiredAuthorizationPackets: ["P03_ACR_PURCHASE"],
    blockingDependencies: [],
    userIntervention: "USER_CONFIRM_ACR_PAID_PURCHASE",
  },
  {
    id: "BAP04_ACR_IMAGE_PUSH_AND_PULL",
    title: "Push backend image and configure SAE pull authorization",
    orderLine: "4. Push backend image to ACR, verify digest, and configure SAE image pull authorization.",
    requiredAuthorizationPackets: ["P04_ACR_IMAGE_AND_PULL"],
    blockingDependencies: ["BAP03_ACR_PURCHASE_AND_REPOSITORY"],
    userIntervention: "USER_CONFIRM_ACR_IMAGE_PUSH_AND_RUNTIME_PULL",
  },
  {
    id: "BAP05_BACKEND_ENV_IMPORT",
    title: "Import backend env through SAE/KMS/Secrets Manager",
    orderLine: "5. Import backend env through SAE/KMS/Secrets Manager, including DATABASE_URL_CN only as a secret env.",
    requiredAuthorizationPackets: ["P06_ENV_IMPORT"],
    blockingDependencies: [
      "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE",
      "BAP02_OSS_RAM_STS_CLOSE",
      "BAP04_ACR_IMAGE_PUSH_AND_PULL",
    ],
    userIntervention: "USER_CONFIRM_SECRET_ENV_IMPORT",
  },
  {
    id: "BAP06_SAE_RUNTIME_CREATE",
    title: "Create SAE runtime with container port 3000 and /api/healthz",
    orderLine: "6. Create SAE runtime with container port 3000 and /api/healthz.",
    requiredAuthorizationPackets: ["P08_SAE_RUNTIME_SLS"],
    blockingDependencies: [
      "BAP02_OSS_RAM_STS_CLOSE",
      "BAP04_ACR_IMAGE_PUSH_AND_PULL",
      "BAP05_BACKEND_ENV_IMPORT",
    ],
    userIntervention: "USER_CONFIRM_PRODUCTION_DEPLOY",
  },
  {
    id: "BAP07_DOMAINS_HTTPS_ICP",
    title: "Bind api-cn/assets-cn DNS, HTTPS certificate, and ICP access",
    orderLine: "7. Bind api-cn/assets-cn DNS, HTTPS certificate, and ICP-compliant public access.",
    requiredAuthorizationPackets: ["P07_DOMAIN_DNS_HTTPS"],
    blockingDependencies: ["BAP06_SAE_RUNTIME_CREATE"],
    userIntervention: "USER_CONFIRM_DNS_HTTPS_ICP_CHANGE",
  },
  {
    id: "BAP08_SLS_ALERTS",
    title: "Configure SLS health and 5xx alerts",
    orderLine: "8. Configure SLS health and 5xx alerts.",
    requiredAuthorizationPackets: ["P08_SAE_RUNTIME_SLS"],
    blockingDependencies: ["BAP06_SAE_RUNTIME_CREATE"],
    userIntervention: "USER_CONFIRM_PRODUCTION_DEPLOY",
  },
  {
    id: "BAP09_POSTDEPLOY_SMOKE",
    title: "Run backend health and APP API smoke tests against Aliyun",
    orderLine: "9. Run backend health and APP API smoke tests against Aliyun.",
    requiredAuthorizationPackets: ["P09_PRODUCTION_DEPLOY"],
    blockingDependencies: [
      "BAP06_SAE_RUNTIME_CREATE",
      "BAP07_DOMAINS_HTTPS_ICP",
      "BAP08_SLS_ALERTS",
    ],
    userIntervention: "USER_CONFIRM_PRODUCTION_DEPLOY",
  },
]
const DEFERRED_APP_LAUNCH_CREDENTIAL_NAMES = new Set([
  "APPLE_TEAM_ID",
  "MEIYE_RELEASE_KEY_ALIAS",
  "MEIYE_RELEASE_KEY_PASSWORD",
  "MEIYE_RELEASE_STORE_FILE",
  "MEIYE_RELEASE_STORE_PASSWORD",
  "WECHAT_OPEN_APP_ID",
  "WECHAT_OPEN_APP_SECRET",
  "WECHAT_OPEN_APP_REVIEW_STATUS",
])
const DEFERRED_APP_LAUNCH_ID_NAMES = new Set([
  "P01_WECHAT_OPEN_MOBILE_APP",
  "P10_ANDROID_RELEASE_SIGNING",
  "P02_APPLE_TEAM_ID",
  "S01_WECHAT_OPEN_APP_LOGIN",
  "S02_APPLE_TEAM_ID",
  "S07_ANDROID_RELEASE_SIGNING",
  "U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE",
  "U10_ANDROID_RELEASE_SIGNING",
  "U02_APPLE_TEAM_ID",
])

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /:\/\/[^\s:@]+:[^\s@]+@/,
]

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
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
  return runJsonWithCache(label, scriptArgs, {
    cwd: BACKEND_ROOT,
    maxBuffer: 1024 * 1024 * 50,
  })
}

function envArgs(args) {
  return ["--env-file", args.envFile, "--cloud-confirmations", args.cloudConfirmationsFile]
}

function buildPackage(args) {
  const productionStatus = runJson("production_status", [
    "scripts/summarize-aliyun-production-cn-status.mjs",
    "--backend-only",
    ...envArgs(args),
  ])
  const backendStatus = runJson("backend_status", [
    "scripts/summarize-aliyun-backend-cn-status.mjs",
    ...envArgs(args),
  ])
  const consoleRunbook = runJson("console_runbook", [
    "scripts/generate-aliyun-console-runbook.mjs",
    ...envArgs(args),
  ])
  const provisioningPlan = runJson("provisioning_plan", [
    "scripts/generate-aliyun-provisioning-plan.mjs",
    ...envArgs(args),
  ])
  const cloudAccess = runJson("cloud_access", [
    "scripts/check-aliyun-cloud-access.mjs",
    ...envArgs(args),
  ])
  const cloudInventoryResults = runJson("cloud_inventory_results", [
    "scripts/check-aliyun-cli-inventory-results.mjs",
    "--allow-incomplete",
  ])
  const imagePublishPlan = runJson("image_publish_plan", [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--allow-incomplete",
  ])
  const sensitiveBlockers = runJson("sensitive_blockers", [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--backend-only",
    ...envArgs(args),
  ])

  const consoleTasks = (consoleRunbook.consoleTasks || []).map(scopeBackendOnlyConsoleTask)
  const immediateConsoleTasks = consoleTasks.filter((item) => item.canStartNow === true)
  const blockedConsoleTasks = consoleTasks.filter((item) => item.canStartNow !== true)
  const immediatePackets = backendStatus.actionAuthorization?.nextActionTimeConfirmations?.length
    ? backendStatus.actionAuthorization.nextActionTimeConfirmations
    : provisioningPlan.readyAuthorizationPackets || []
  const cloudConsolePackets = immediatePackets.filter((item) => CLOUD_CONSOLE_PACKET_IDS.has(item.packetId))
  const deferredAppLaunchPackets = (provisioningPlan.deferredAppLaunchAuthorizationPackets || [])
    .filter((item) => EXTERNAL_APP_PACKET_IDS.has(item.packetId))
  const externalAppPackets = []
  const phases = (provisioningPlan.phases || []).map(compactPhase)
  const firstCloudPhase = phases.find((item) => item.id === "PH02_BASE_CLOUD_RESOURCES") || null
  const cliConfigProbeFailureCategory = cloudAccess.cli?.configProbe?.failureCategory || cloudAccess.cliConfigProbeFailureCategory || "none"
  const cloudInventorySummary = summarizeCloudInventoryResults(cloudInventoryResults)
  const imagePublishWritebackPlan = compactImagePublishWritebackPlan(imagePublishPlan.writebackPlan)
  const readonlyInventoryUnblock = buildReadonlyInventoryUnblock(
    cloudAccess,
    cliConfigProbeFailureCategory,
    cloudInventorySummary,
  )
  const backendFirstOrder = buildBackendFirstOrder(backendStatus)
  const credentialAcquisitionQueue = buildCredentialAcquisitionQueue(sensitiveBlockers)
  const cloudActionClosureBrief = buildCloudActionClosureBrief({
    consoleRunbook,
    backendFirstOrder,
    immediateConsoleTasks,
    blockedConsoleTasks,
    cloudConsolePackets,
    externalAppPackets,
    deferredAppLaunchPackets,
    cloudInventorySummary,
    imagePublishWritebackPlan,
    credentialAcquisitionQueue,
  })
  const currentBlockers = uniqueStrings([
    ...(backendStatus.summary?.backendRequiredBlocking || []).map((name) => `backendRequired:${name}`),
    ...(blockedConsoleTasks || []).map((item) => `blockedConsoleTask:${item.id}`),
    ...(cloudInventorySummary.ready ? [] : (cloudAccess.blockers || [])),
    ...(cloudInventorySummary.ready ? [] : cloudInventorySummary.blockers.map((item) => `cloudInventory:${item}`)),
  ])
  const executionQueue = buildExecutionQueue(
    backendFirstOrder,
    immediateConsoleTasks,
    blockedConsoleTasks,
    externalAppPackets,
    imagePublishWritebackPlan,
  )
  const sensitiveActionTotal = productionStatus.summary?.sensitiveActionItems?.total || 0
  const sensitiveActionBlocked = productionStatus.summary?.sensitiveActionItems?.blocked || 0
  const sensitiveActionReady = Math.max(sensitiveActionTotal - sensitiveActionBlocked, 0)

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    packageId: "C00_ALIYUN_CLOUD_ACTIONS",
    environment: "production-cn",
    currentScope: CURRENT_SCOPE,
    fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    cloudApiCalled: false,
    currentAnswer: "现在不能部署；本包只把阿里云控制台可先做/需暂缓的动作拆成短清单，不创建资源、不付款、不导入密钥、不部署。",
    summary: {
      currentScope: CURRENT_SCOPE,
      fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
      canDeployNow: backendStatus.canDeployBackendNow === true,
      canProceedWithoutWechat: backendStatus.canProceedWithoutWechat === true,
      verdict: productionStatus.verdict || "blocked",
      backendTargetReady: backendStatus.summary?.backendTargetReady || "unknown",
      cloudConfirmationsReady: formatReadyTotal(productionStatus.summary?.cloudConfirmations),
      operatorTasksReady: formatReadyTotal(productionStatus.summary?.operatorTasks),
      backendCanStartNowSteps: backendFirstOrder.immediateBackendSteps,
      canStartNowConsoleTasks: immediateConsoleTasks.map((item) => item.id),
      blockedByDependencies: blockedConsoleTasks.map((item) => item.id),
      cloudConsolePackets: cloudConsolePackets.map((item) => item.packetId),
      externalAppPackets: externalAppPackets.map((item) => item.packetId),
      deferredAppLaunchPackets: deferredAppLaunchPackets.map((item) => item.packetId),
      requiredBlocking: backendStatus.summary?.backendRequiredBlocking || [],
      fullAppRequiredBlocking: productionStatus.summary?.fullAppRequiredBlocking || productionStatus.summary?.requiredBlocking || [],
      deferredAppLaunchBlocking: backendStatus.summary?.appLaunchDeferredBlocking || [],
      sensitiveActionReady: `${sensitiveActionReady}/${sensitiveActionTotal}`,
      sensitiveActionBlocked: `${sensitiveActionBlocked}/${sensitiveActionTotal}`,
      canReadCloudNow: cloudAccess.canReadCloudNow === true,
      cloudInventoryResultsReady: cloudInventorySummary.ready,
      cloudInventoryReadyLocalOperations: `${cloudInventorySummary.readyLocalOperations}/${cloudInventorySummary.localOperations}`,
      cloudInventoryExecutedCommandResults: `${cloudInventorySummary.executedCommandResults}/${cloudInventorySummary.commandResults}`,
      imagePublishWritebackBlockingGroups: imagePublishWritebackPlan.blockingGroups,
      cliConfigProbeFailureCategory,
      blockedCredentialCount: cloudActionClosureBrief.blockedCredentialCount,
      onlyMissingBackendCredentialValue: credentialAcquisitionQueue.onlyMissingBackendCredentialValue,
      readySecretEnvVariableCount: cloudActionClosureBrief.readySecretEnvVariableCount,
      resourceEvidenceReady: cloudActionClosureBrief.resourceEvidenceReady,
      blockedResourceEvidenceIds: cloudActionClosureBrief.blockedResourceEvidenceIds,
      partiallyObservedResourceEvidenceIds: cloudActionClosureBrief.partiallyObservedResourceEvidenceIds,
      immediateBackendSteps: backendFirstOrder.immediateBackendSteps,
      blockedBackendSteps: backendFirstOrder.blockedBackendSteps,
      backendFirstUserInterventionRequired: backendFirstOrder.immediateUserInterventionRequired,
      backendDeferredUserInterventionRequired: backendFirstOrder.blockedUserInterventionRequired,
    },
    cloudActionClosureBrief,
    credentialAcquisitionQueue,
    firstCloudPhase,
    backendFirstOrder,
    executionQueue,
    immediateConsoleTasks: immediateConsoleTasks.map((task) => compactConsoleTask(task, imagePublishWritebackPlan)),
    blockedConsoleTasks: blockedConsoleTasks.map((task) => compactConsoleTask(task, imagePublishWritebackPlan)),
    cloudConsoleAuthorizationPackets: cloudConsolePackets.map(compactPacket),
    externalAppPrerequisitePackets: externalAppPackets.map(compactPacket),
    deferredAppLaunchPrerequisitePackets: deferredAppLaunchPackets.map(compactPacket),
    phaseOrder: phases,
    readonlyInventoryUnblock,
    cloudAccess: {
      canReadCloudNow: cloudAccess.canReadCloudNow === true,
      cliAvailable: cloudAccess.cli?.available === true || cloudAccess.cliAvailable === true,
      cliConfigProbeReady: cloudAccess.cli?.configProbe?.ready === true || cloudAccess.cliConfigProbeReady === true,
      cliConfigProbeFailureCategory,
      workbenchTerminalConnected: cloudAccess.terminalAccess?.workbenchTerminal?.connected === true || cloudAccess.workbenchTerminalConnected === true,
      workbenchTerminalReadiness: cloudAccess.terminalAccess?.workbenchTerminal?.readiness || cloudAccess.workbenchTerminalReadiness || "unknown",
      blockers: cloudAccess.blockers || [],
    },
    cloudInventoryResults: cloudInventorySummary,
    imagePublishWritebackPlan,
    writeTargets: [
      "deploy/aliyun-production-cn.image-publish.local.json -> acr purchase/runtime non-secret evidence",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> runtime/apiDomainHttps/assetDomainHttps/oss/envImport/slsAlerts non-secret evidence",
      "阿里云 SAE plain env -> only public identifiers and URLs",
      "阿里云 KMS/Secrets Manager/SAE secret env -> secrets only, never in reports",
    ],
    strictVerificationOrder: [
      "corepack pnpm aliyun:cloud:access",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
      "corepack pnpm aliyun:cloud:confirmations:strict",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:completion:audit",
      "corepack pnpm aliyun:predeploy",
    ],
    nextSafeLocalCommands: uniqueStrings([
      "corepack pnpm aliyun:cloud-actions:package",
      "corepack pnpm aliyun:cloud:access",
      "corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage",
      "corepack pnpm aliyun:completion:audit",
    ]),
    prohibitedWithoutActionTimeConfirmation: [
      "购买 ACR 或任何付费资源。",
      "创建/修改 SAE、SLS、OSS、RAM、KMS、Secrets Manager、DNS、证书、CDN 或公网入口。",
      "读取、复制、粘贴、导入或输出 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、Supabase service role key。",
      "推送镜像到 ACR、部署 production-cn、修改正式域名解析、git push。",
      "当前后端-only 目标不创建微信开放平台移动应用；微信/Apple/Android 发布项延期到后端上线后单独处理。",
    ],
    currentBlockers,
    safetyBoundary: [
      "本命令只读本地无值报告，不调用阿里云 API。",
      "不购买 ACR，不创建或修改 SAE/SLS/OSS/RAM/KMS/Secrets Manager/DNS/证书/CDN。",
      "不读取、复制、粘贴或导入 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、Supabase service role key。",
      "不推送镜像、不部署 production-cn、不 git push。",
      "所有 .local.json 只能写资源名、布尔值、时间、控制台路径、digest 和非密钥 evidence handle。",
    ],
  }

  const secretLikePaths = findSecretLikeValues(report)
  report.secretLeakCheck = {
    ok: secretLikePaths.length === 0,
    matches: secretLikePaths,
  }
  if (secretLikePaths.length > 0) {
    report.ok = false
    report.containsValues = true
  }
  return report
}

function formatReadyTotal(value = {}) {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return "unknown"
  const ready = value.ready
  const total = value.total
  if (ready === undefined || total === undefined) return "unknown"
  return `${ready}/${total}`
}

function buildCloudActionClosureBrief({
  consoleRunbook,
  backendFirstOrder,
  immediateConsoleTasks,
  blockedConsoleTasks,
  cloudConsolePackets,
  externalAppPackets,
  deferredAppLaunchPackets,
  cloudInventorySummary,
  imagePublishWritebackPlan,
  credentialAcquisitionQueue,
}) {
  const runbookBrief = consoleRunbook.consoleClosureBrief || {}
  const blockedCredentialNames =
    runbookBrief.blockedCredentialNames ||
    []
  const backendBlockedCredentialNames = blockedCredentialNames.filter((name) =>
    !DEFERRED_APP_LAUNCH_CREDENTIAL_NAMES.has(name)
  )
  const readySecretEnvVariableNames =
    runbookBrief.readySecretEnvVariableNames ||
    []
  const blockedResourceEvidenceIds =
    runbookBrief.blockedResourceEvidenceIds ||
    consoleRunbook.summary?.blockedResourceEvidenceIds ||
    []

  return {
    conclusion: "现在不能部署；本动作包当前只覆盖阿里云后端，能进入 C02/C05/P11 的动作时确认，其余 ACR push/SAE/DNS/env/SLS/smoke 仍未闭环。",
    currentScope: CURRENT_SCOPE,
    fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
    canDeployNow: consoleRunbook.summary?.canDeployNow === true,
    blockedCredentialCount: backendBlockedCredentialNames.length,
    blockedCredentialNames: backendBlockedCredentialNames,
    onlyMissingBackendCredentialValue: credentialAcquisitionQueue.onlyMissingBackendCredentialValue || "",
    credentialAcquisitionQueueActionIds: (credentialAcquisitionQueue.items || []).map((item) => item.actionId),
    readySecretEnvVariableCount: runbookBrief.readySecretEnvVariableCount ?? readySecretEnvVariableNames.length,
    readySecretEnvVariableNames,
    resourceEvidenceReady: runbookBrief.resourceEvidenceReady || consoleRunbook.summary?.resourceEvidenceReady || "unknown",
    blockedResourceEvidenceIds,
    partiallyObservedResourceEvidenceIds:
      runbookBrief.partiallyObservedResourceEvidenceIds ||
      consoleRunbook.summary?.partiallyObservedResourceEvidenceIds ||
      [],
    blockedResourceEvidence: (runbookBrief.blockedResourceEvidence || []).map(scopeBackendOnlyResourceEvidence),
    strictReadonlyInventoryReady: cloudInventorySummary.ready === true,
    cloudInventoryReadyLocalOperations: `${cloudInventorySummary.readyLocalOperations}/${cloudInventorySummary.localOperations}`,
    cloudInventoryExecutedCommandResults: `${cloudInventorySummary.executedCommandResults}/${cloudInventorySummary.commandResults}`,
    mutationPerformedCommandResults: cloudInventorySummary.mutationPerformedCommandResults,
    backendCanStartNowSteps: backendFirstOrder.immediateBackendSteps,
    backendBlockedByDependencies: backendFirstOrder.blockedBackendSteps,
    canStartNowConsoleTasks: immediateConsoleTasks.map((item) => item.id),
    cloudConsolePackets: cloudConsolePackets.map((item) => item.packetId),
    externalAppPackets: externalAppPackets.map((item) => item.packetId),
    deferredAppLaunchPackets: deferredAppLaunchPackets.map((item) => item.packetId),
    blockedByDependencies: blockedConsoleTasks.map((item) => item.id),
    imagePublishWritebackBlockingGroups: imagePublishWritebackPlan.blockingGroups,
    stillRequiresActionTimeConfirmation: uniqueStrings([
      ...(runbookBrief.actionTimeConfirmationRequiredIds || []),
      ...cloudConsolePackets.map((item) => item.packetId),
    ]).filter((item) => !isDeferredAppLaunchBlocker(item)),
  }
}

function buildCredentialAcquisitionQueue(sensitiveBlockers) {
  const queue = sensitiveBlockers.credentialAcquisitionQueue || {}
  return {
    currentScope: queue.currentScope || CURRENT_SCOPE,
    queueScope: queue.queueScope || queue.currentScope || CURRENT_SCOPE,
    missingCredentialNames: queue.missingCredentialNames || [],
    onlyMissingBackendCredentialValue: queue.onlyMissingBackendCredentialValue || "",
    readySecretEnvVariableCount: queue.readySecretEnvVariableCount || 0,
    readySecretEnvVariableNames: queue.readySecretEnvVariableNames || [],
    requiresActionTimeConfirmationIds: queue.requiresActionTimeConfirmationIds || [],
    items: (queue.items || []).map((item) => ({
      order: item.order,
      actionId: item.actionId,
      category: item.category,
      status: item.status,
      owner: item.owner,
      userQuestion: item.userQuestion || "",
      obtainFrom: item.obtainFrom || "",
      blockedCredentialNames: item.blockedCredentialNames || [],
      readySecretEnvVariableNames: item.readySecretEnvVariableNames || [],
      destinationSummary: item.destinationSummary || item.writeTargets || item.importTargets || [],
      verifyCommands: item.verifyCommands || [],
      requiresActionTimeConfirmation: item.requiresActionTimeConfirmation === true,
      unblockCondition: item.unblockCondition || "",
    })),
  }
}

function scopeBackendOnlyConsoleTask(task) {
  return {
    ...task,
    currentBlockers: (task.currentBlockers || []).filter((item) => !isDeferredAppLaunchBlocker(item)),
  }
}

function scopeBackendOnlyResourceEvidence(item) {
  return {
    ...item,
    currentEvidence: (item.currentEvidence || []).filter((value) => !isDeferredAppLaunchBlocker(value)),
    missingEvidence: (item.missingEvidence || []).filter((value) => !isDeferredAppLaunchBlocker(value)),
    writeTargets: (item.writeTargets || []).filter((value) => !isDeferredAppLaunchBlocker(value)),
  }
}

function isDeferredAppLaunchBlocker(value) {
  const text = String(value || "")
  return DEFERRED_APP_LAUNCH_ID_NAMES.has(text) ||
    /WECHAT_OPEN_|wechat_open_platform|APPLE_TEAM_ID|apple_team_id|ANDROID_RELEASE|MEIYE_RELEASE_|Android release signing|app_universal_link/i.test(text)
}

function buildExecutionQueue(backendFirstOrder, immediateConsoleTasks, blockedConsoleTasks, externalAppPackets, imagePublishWritebackPlan) {
  return {
    backendCanStartNow: backendFirstOrder.steps
      .filter((step) => step.status === "ready_for_action_time_confirmation")
      .map((step) => ({
        id: step.id,
        kind: "backend_apply_step",
        title: step.title,
        requiresActionTimeConfirmation: true,
        requiredAuthorizationPackets: step.requiredAuthorizationPackets,
        userIntervention: step.userIntervention,
        orderLine: step.orderLine,
      })),
    canStartNow: immediateConsoleTasks.map((task) => {
      const compact = compactConsoleTask(task, imagePublishWritebackPlan)
      const currentActionAcceptanceEvidence = compact.currentActionAcceptanceEvidence?.length
        ? compact.currentActionAcceptanceEvidence
        : compact.completionEvidence
      return {
        id: compact.id,
        kind: "aliyun_console_task",
        title: compact.title,
        owner: task.owner || "阿里云操作员",
        requiresActionTimeConfirmation: true,
        minimumAuthorizationPhrase: compact.minimumAuthorizationPhrase,
        currentActionScope: compact.currentActionScope || "full_task",
        currentActionAcceptanceEvidence,
        consolePath: compact.consolePath,
        writeTargets: compact.writeTargets,
        verifyCommands: compact.verifyCommands,
        completionEvidence: currentActionAcceptanceEvidence,
        deferredActions: compact.deferredActions,
        deferredWritebackGroups: compact.deferredWritebackGroups || [],
        forbidden: compact.forbidden,
      }
    }),
    backendBlockedByDependencies: backendFirstOrder.steps
      .filter((step) => step.status === "blocked_by_dependencies")
      .map((step) => ({
        id: step.id,
        kind: "backend_apply_step",
        title: step.title,
        requiredAuthorizationPackets: step.requiredAuthorizationPackets,
        blockingDependencies: step.blockingDependencies,
        userIntervention: step.userIntervention,
        orderLine: step.orderLine,
      })),
    externalAppPrerequisites: externalAppPackets.map((packet) => {
      const compact = compactPacket(packet)
      return {
        packetId: compact.packetId,
        kind: "external_platform_prerequisite",
        title: compact.title,
        owner: compact.owner,
        requiresActionTimeConfirmation: true,
        minimumAuthorizationPhrase: compact.minimumAuthorizationPhrase,
        writeTargets: compact.writeTargets,
        verifyCommands: compact.verifyCommands,
        completionEvidence: compact.completionEvidence,
        explicitlyExcluded: compact.explicitlyExcluded,
      }
    }),
    blockedByDependencies: blockedConsoleTasks.map((task) => {
      const compact = compactConsoleTask(task, imagePublishWritebackPlan)
      return {
        id: compact.id,
        kind: "aliyun_console_task",
        title: compact.title,
        owner: task.owner || "阿里云操作员",
        status: compact.status,
        dependsOn: compact.dependsOn,
        blockingDependencies: compact.blockingDependencies,
        currentBlockers: compact.currentBlockers,
        nextActions: compact.nextActions,
        verifyCommands: compact.verifyCommands,
      }
    }),
  }
}

function buildBackendFirstOrder(backendStatus) {
  const canStartNowPackets = new Set(backendStatus.actionAuthorization?.canStartNowPackets || [])
  const acrPurchaseConfirmed = canStartNowPackets.has("P04_ACR_IMAGE_AND_PULL")
  const steps = BACKEND_FIRST_STEPS.map((step) => {
    if (step.id === "BAP03_ACR_PURCHASE_AND_REPOSITORY" && acrPurchaseConfirmed) {
      return {
        ...step,
        status: "completed",
        completed: true,
        blockingDependencies: [],
      }
    }
    if (step.id === "BAP04_ACR_IMAGE_PUSH_AND_PULL" && canStartNowPackets.has("P04_ACR_IMAGE_AND_PULL")) {
      return {
        ...step,
        blockingDependencies: [],
      }
    }
    return step
  })
  const immediateBackendSteps = steps
    .filter((step) => !step.completed && step.blockingDependencies.length === 0)
    .map((step) => step.id)
  const blockedBackendSteps = steps
    .filter((step) => !step.completed && step.blockingDependencies.length > 0)
    .map((step) => step.id)
  return {
    sourceCommand: "corepack pnpm aliyun:backend-cn:status",
    purpose: "backend_first_apply_order_over_console_task_canStartNow",
    note: "Console canStartNow only means a console task can begin after action-time confirmation; backend-first apply order still starts with BAP00/BAP01 so RDS and read-only inventory are not skipped.",
    sourceOrderLines: backendStatus.nextBackendOrder || [],
    immediateBackendSteps,
    blockedBackendSteps,
    completedBackendSteps: steps.filter((step) => step.completed).map((step) => step.id),
    actionTimeConfirmationRequired: steps.filter((step) => !step.completed).map((step) => step.id),
    immediateUserInterventionRequired: uniqueStrings(steps
      .filter((step) => !step.completed && step.blockingDependencies.length === 0)
      .map((step) => step.userIntervention)),
    blockedUserInterventionRequired: uniqueStrings(steps
      .filter((step) => !step.completed && step.blockingDependencies.length > 0)
      .map((step) => step.userIntervention)),
    userInterventionRequired: uniqueStrings(steps.filter((step) => !step.completed).map((step) => step.userIntervention)),
    steps: steps.map((step) => ({
      id: step.id,
      title: step.title,
      orderLine: step.orderLine,
      status: step.status || (step.blockingDependencies.length === 0
        ? "ready_for_action_time_confirmation"
        : "blocked_by_dependencies"),
      requiresActionTimeConfirmation: true,
      requiredAuthorizationPackets: step.requiredAuthorizationPackets,
      blockingDependencies: step.blockingDependencies,
      userIntervention: step.userIntervention,
    })),
  }
}

function compactImagePublishWritebackPlan(writebackPlan = {}) {
  const groups = (writebackPlan.groups || []).map((group) => ({
    id: group.id,
    title: group.title,
    actionScope: group.actionScope,
    ready: group.ready === true,
    canStartNow: group.canStartNow === true,
    dependsOnGroups: group.dependsOnGroups || [],
    requiredAuthorizationPackets: group.requiredAuthorizationPackets || [],
    blockers: group.blockers || [],
    writeTargets: group.writeTargets || [],
    expectedEvidence: group.expectedEvidence || [],
    forbidden: group.forbidden || [],
    verifyCommands: group.verifyCommands || [],
    nonSecretEvidenceOnly: group.nonSecretEvidenceOnly === true,
  }))
  return {
    ready: writebackPlan.ready === true,
    totalBlockers: Number(writebackPlan.totalBlockers || 0),
    blockingGroups: writebackPlan.blockingGroups || groups.filter((group) => !group.ready).map((group) => group.id),
    requiredAuthorizationPackets: writebackPlan.requiredAuthorizationPackets || [],
    strictVerificationOrder: writebackPlan.strictVerificationOrder || [],
    groups,
  }
}

function imageWritebackGroup(plan, id) {
  return (plan.groups || []).find((group) => group.id === id) || null
}

function summarizeCloudInventoryResults(cloudInventoryResults) {
  const local = cloudInventoryResults.local || {}
  const observationSummary = local.observationSummary || {}
  const summary = cloudInventoryResults.summary || {}
  const localOperations = Number(summary.localOperations || observationSummary.operations || local.checkedOperations || 0)
  const readyLocalOperations = Number(summary.readyLocalOperations || observationSummary.strictReadyOperations || 0)
  const commandResults = Number(observationSummary.commandResults || 0)
  const executedCommandResults = Number(observationSummary.executedCommandResults || 0)
  const cloudApiCalledCommandResults = Number(observationSummary.cloudApiCalledCommandResults || 0)
  const mutationPerformedCommandResults = Number(observationSummary.mutationPerformedCommandResults || 0)
  const ready =
    local.exists === true &&
    local.ready === true &&
    localOperations > 0 &&
    readyLocalOperations === localOperations &&
    commandResults > 0 &&
    executedCommandResults === commandResults &&
    cloudApiCalledCommandResults === commandResults &&
    mutationPerformedCommandResults === 0
  return {
    exists: local.exists === true,
    ready,
    localReady: local.ready === true,
    localOperations,
    readyLocalOperations,
    commandResults,
    executedCommandResults,
    cloudApiCalledCommandResults,
    mutationPerformedCommandResults,
    observedOperationIds: observationSummary.observedOperationIds || [],
    notFoundOperationIds: observationSummary.notFoundOperationIds || [],
    blockedOperationIds: observationSummary.blockedOperationIds || [],
    blockers: local.blockers || [],
    evidence: ready
      ? [
          `readyLocalOperations=${readyLocalOperations}/${localOperations}`,
          `executedCommandResults=${executedCommandResults}/${commandResults}`,
          `cloudApiCalledCommandResults=${cloudApiCalledCommandResults}`,
          `mutationPerformedCommandResults=${mutationPerformedCommandResults}`,
        ]
      : [],
  }
}

function buildReadonlyInventoryUnblock(cloudAccess, cliConfigProbeFailureCategory, cloudInventorySummary) {
  const workbenchTerminal = cloudAccess.terminalAccess?.workbenchTerminal || {}
  const inventoryReady = cloudInventorySummary.ready === true
  return {
    status: inventoryReady
      ? "strict_inventory_evidence_ready"
      : (cloudAccess.canReadCloudNow === true ? "ready_to_execute_allowlisted_readonly_inventory" : "blocked_until_cli_or_cloudshell_identity_ready"),
    currentBlocker: inventoryReady ? "none" : (cliConfigProbeFailureCategory || "unknown"),
    currentEvidence: cloudInventorySummary.evidence,
    whyConsoleLoginIsNotEnough: inventoryReady
      ? "严格云证据已来自 allowlisted Aliyun CLI/CloudShell List/Describe/stat/get 命令摘要；后续云资源创建、购买、DNS、密钥导入和部署仍需动作时确认。"
      : "浏览器控制台登录、ECS Workbench 终端可见、或 OSS/SLS 页面可见，只能作为人工观察证据；严格云证据必须来自 allowlisted Aliyun CLI/CloudShell List/Describe/stat/get 命令结果，且不记录原始敏感输出。",
    minimumAuthorizationPhrase: "授权在本机 Aliyun CLI 或阿里云 CloudShell 中配置只读身份，并只运行 allowlisted production-cn inventory 命令；不输出 AccessKeySecret、STS token、cookie、registry password 或证书私钥。",
    allowedIdentityPaths: [
      {
        id: "local_aliyun_cli",
        title: "本机 Aliyun CLI default profile",
        currentStatus: cloudAccess.cli?.configProbe?.ready === true ? "ready" : cliConfigProbeFailureCategory || "not_ready",
        allowedActions: [
          "使用阿里云官方 CLI 登录或受控 RAM/STS 只读凭据配置 default profile。",
          "region 使用 cn-hangzhou。",
          "配置完成后只运行本仓库 inventory runner 生成非密钥摘要。",
        ],
      },
      {
        id: "aliyun_cloudshell",
        title: "阿里云 CloudShell 登录身份",
        currentStatus: cloudAccess.cloudShellObservation?.ready === true ? "ready" : "not_ready_or_unread",
        allowedActions: [
          "在 CloudShell 中运行 inventory 计划中的 List/Describe/stat/get 类命令。",
          "只抄录资源名、状态、digest、时间戳和非密钥 evidence handle。",
          "如果 CloudShell 无法访问本仓库，就回到本机手工回填 ignored 的 .local.json。",
        ],
      },
      {
        id: "ecs_workbench_terminal",
        title: "ECS Workbench 终端",
        currentStatus: workbenchTerminal.connected === true ? "connected_not_inventory_ready" : "not_ready",
        allowedActions: [
          "只把连接状态作为人工观察证据。",
          "只有确认该终端有 Aliyun CLI 只读身份，并运行 allowlisted inventory 命令后，才可回填严格证据。",
        ],
      },
    ],
    unlockCommands: [
      "corepack pnpm aliyun:cloud:access",
      "MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
      "corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage",
      "corepack pnpm aliyun:completion:audit",
    ],
    expectedNonSecretEvidenceAfterUnlock: [
      inventoryReady ? `readyLocalOperations = ${cloudInventorySummary.readyLocalOperations}/${cloudInventorySummary.localOperations}` : "executedCommandResults > 0",
      inventoryReady ? `executedCommandResults = ${cloudInventorySummary.executedCommandResults}/${cloudInventorySummary.commandResults}` : "cloudApiCalledCommandResults > 0",
      `mutationPerformedCommandResults = ${cloudInventorySummary.mutationPerformedCommandResults}`,
      "each command output stored only as summary counts, exit code, sha256 fingerprint, timestamp, and evidence handle",
    ],
    forbidden: [
      "不要把 AccessKeySecret、STS token、cookie、registry password、RAM Secret、Supabase service role key 或证书私钥写入 JSON、Markdown、Docker 镜像、截图、聊天或 git。",
      "不要运行 Create/Update/Delete/Deploy/Start/Stop/GetAuthorizationToken/docker login/docker push/oss cp/oss cat/oss sign。",
      "不要把控制台页面可见或 Workbench 已连接误标记成 cloudInventory strict ready。",
    ],
  }
}

function compactConsoleTask(task, imagePublishWritebackPlan = {}) {
  const base = {
    id: task.id,
    title: task.title,
    status: task.status,
    canStartNow: task.canStartNow === true,
    dependsOn: task.dependsOn || [],
    blockingDependencies: task.blockingDependencies || [],
    consolePath: task.consolePath || "",
    minimumAuthorizationPhrase: matchingAuthorizationPhrase(task),
    currentActionScope: task.currentActionScope || "",
    currentActionAcceptanceEvidence: task.currentActionAcceptanceEvidence || [],
    targetFields: task.targetFields || [],
    writeTargets: task.writeTargets || [],
    currentBlockers: task.currentBlockers || [],
    nextActions: task.nextActions || [],
    verifyCommands: task.verifyCommands || [],
    completionEvidence: task.completionEvidence || [],
    deferredActions: task.deferredActions || [],
    forbidden: task.forbidden || [],
    mutationPerformedByThisCommand: task.mutationPerformedByThisCommand === true,
  }
  if (task.id !== "C02_ACR_IMAGE_AND_PULL") return base

  const currentGroup = currentImageWritebackGroup(imagePublishWritebackPlan)
  const deferredGroups = ["acrPurchaseAndRepository", "imagePushAndDigest", "saeRuntimeImagePull"]
    .map((id) => imageWritebackGroup(imagePublishWritebackPlan, id))
    .filter((group) => group && group.id !== currentGroup?.id)
  const currentActionAcceptanceEvidence = base.currentActionAcceptanceEvidence.length
    ? base.currentActionAcceptanceEvidence
    : currentGroup?.expectedEvidence || []
  const deferredGroupLines = deferredGroups.map((group) => {
    const packets = group.requiredAuthorizationPackets.join(", ") || "none"
    const blockers = group.blockers.join(", ") || "none"
    if (group.ready === true) return `${group.id} 已完成；不再等待 ${packets}；当前 blockers: ${blockers}`
    return `${group.id} 需等待 ${packets}；当前 blockers: ${blockers}`
  })

  return {
    ...base,
    currentActionScope: currentGroup?.actionScope || base.currentActionScope || "image_push_or_import_and_digest_verification",
    currentActionAcceptanceEvidence,
    currentActionBlockers: currentGroup?.blockers || [],
    writeTargets: currentGroup?.writeTargets?.length ? currentGroup.writeTargets : base.writeTargets,
    verifyCommands: currentGroup?.verifyCommands?.length ? currentGroup.verifyCommands : base.verifyCommands,
    completionEvidence: currentActionAcceptanceEvidence,
    deferredActions: uniqueStrings([
      ...base.deferredActions,
      ...deferredGroupLines,
    ]),
    deferredWritebackGroups: deferredGroups.map((group) => ({
      id: group.id,
      actionScope: group.actionScope,
      requiredAuthorizationPackets: group.requiredAuthorizationPackets,
      blockers: group.blockers,
      writeTargets: group.writeTargets,
      verifyCommands: group.verifyCommands,
    })),
  }
}

function matchingAuthorizationPhrase(task) {
  if (task.id === "C02_ACR_IMAGE_AND_PULL") {
    return "授权把后端镜像推送或导入已创建的 ACR，核对 sha256 digest，并配置 SAE 拉取该镜像；不输出 registry 密码，不部署 production-cn。"
  }
  if (task.id === "C05_OSS_AUDIO_RAM_STS") {
    return "授权确认 OSS 音频 bucket、CORS、RAM 最小权限或 STS/运行时角色；Secret 只进阿里云受控密钥环境。"
  }
  return task.actionTimeConfirmationReason || ""
}

function currentImageWritebackGroup(imagePublishWritebackPlan) {
  for (const id of ["acrPurchaseAndRepository", "imagePushAndDigest", "saeRuntimeImagePull"]) {
    const group = imageWritebackGroup(imagePublishWritebackPlan, id)
    if (group && group.ready !== true && group.canStartNow === true) return group
  }
  return imageWritebackGroup(imagePublishWritebackPlan, "acrPurchaseAndRepository")
}

function compactPacket(packet) {
  return {
    packetId: packet.packetId,
    actionId: packet.actionId,
    title: packet.title,
    owner: packet.owner,
    sequenceGroup: packet.sequenceGroup,
    minimumAuthorizationPhrase: packet.minimumUserPhrase || packet.minimumAuthorizationPhrase || "",
    writeTargets: packet.writeTargets || [],
    verifyCommands: packet.verifyCommands || [],
    completionEvidence: packet.completionEvidence || [],
    explicitlyExcluded: packet.explicitlyExcluded || [],
    nonSecretEvidenceOnly: packet.nonSecretEvidenceOnly === true,
  }
}

function compactPhase(phase) {
  return {
    id: phase.id,
    title: phase.title,
    status: phase.status,
    canStartNow: phase.canStartNow === true,
    authorizationPackets: (phase.authorizationPackets || [])
      .map((item) => item.packetId)
      .filter((item) => !isDeferredAppLaunchBlocker(item)),
    consoleTasks: (phase.consoleTasks || []).map((item) => item.id),
    blockingDependencies: (phase.blockingDependencies || []).filter((item) => !isDeferredAppLaunchBlocker(item)),
    currentBlockers: (phase.currentBlockers || []).filter((item) => !isDeferredAppLaunchBlocker(item)),
    completionEvidence: phase.completionEvidence || [],
  }
}

function renderMarkdown(report) {
  return [
    "# 阿里云控制台动作包",
    "",
    `生成时间：${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- packageId: ${report.packageId}`,
    `- currentScope: ${report.currentScope}`,
    `- fullAppLaunchScope: ${report.fullAppLaunchScope}`,
    `- canDeployNow: ${report.summary.canDeployNow}`,
    `- canProceedWithoutWechat: ${report.summary.canProceedWithoutWechat}`,
    `- backendTargetReady: ${report.summary.backendTargetReady}`,
    `- verdict: ${report.summary.verdict}`,
    `- cloudConfirmationsReady: ${report.summary.cloudConfirmationsReady}`,
    `- operatorTasksReady: ${report.summary.operatorTasksReady}`,
    `- sensitiveActionReady: ${report.summary.sensitiveActionReady}`,
    `- sensitiveActionBlocked: ${report.summary.sensitiveActionBlocked}`,
    `- canReadCloudNow: ${report.summary.canReadCloudNow}`,
    `- cloudInventoryResultsReady: ${report.summary.cloudInventoryResultsReady}`,
    `- cloudInventoryReadyLocalOperations: ${report.summary.cloudInventoryReadyLocalOperations}`,
    `- cloudInventoryExecutedCommandResults: ${report.summary.cloudInventoryExecutedCommandResults}`,
    `- cliConfigProbeFailureCategory: ${report.summary.cliConfigProbeFailureCategory}`,
    `- containsValues: ${report.containsValues}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- cloudApiCalled: ${report.cloudApiCalled}`,
    `- blockedCredentialCount: ${report.summary.blockedCredentialCount}`,
    `- readySecretEnvVariableCount: ${report.summary.readySecretEnvVariableCount}`,
    `- resourceEvidenceReady: ${report.summary.resourceEvidenceReady}`,
    `- blockedResourceEvidenceIds: ${report.summary.blockedResourceEvidenceIds.length ? report.summary.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- partiallyObservedResourceEvidenceIds: ${report.summary.partiallyObservedResourceEvidenceIds.length ? report.summary.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
    `- backendCanStartNowSteps: ${report.summary.backendCanStartNowSteps.length ? report.summary.backendCanStartNowSteps.join(", ") : "none"}`,
    `- immediateBackendSteps: ${report.summary.immediateBackendSteps.length ? report.summary.immediateBackendSteps.join(", ") : "none"}`,
    `- blockedBackendSteps: ${report.summary.blockedBackendSteps.length ? report.summary.blockedBackendSteps.join(", ") : "none"}`,
    `- backendFirstUserInterventionRequired: ${report.summary.backendFirstUserInterventionRequired.length ? report.summary.backendFirstUserInterventionRequired.join(", ") : "none"}`,
    `- backendDeferredUserInterventionRequired: ${report.summary.backendDeferredUserInterventionRequired.length ? report.summary.backendDeferredUserInterventionRequired.join(", ") : "none"}`,
    `- onlyMissingBackendCredentialValue: ${report.summary.onlyMissingBackendCredentialValue || "n/a"}`,
    "",
    "## 目标闭环证据简表",
    "",
    `- conclusion: ${report.cloudActionClosureBrief.conclusion}`,
    `- canDeployNow: ${report.cloudActionClosureBrief.canDeployNow}`,
    `- blockedCredentialCount: ${report.cloudActionClosureBrief.blockedCredentialCount}`,
    `- blockedCredentialNames: ${report.cloudActionClosureBrief.blockedCredentialNames.length ? report.cloudActionClosureBrief.blockedCredentialNames.join(", ") : "none"}`,
    `- onlyMissingBackendCredentialValue: ${report.cloudActionClosureBrief.onlyMissingBackendCredentialValue || "n/a"}`,
    `- credentialAcquisitionQueueActionIds: ${report.cloudActionClosureBrief.credentialAcquisitionQueueActionIds.length ? report.cloudActionClosureBrief.credentialAcquisitionQueueActionIds.join(", ") : "none"}`,
    `- readySecretEnvVariableCount: ${report.cloudActionClosureBrief.readySecretEnvVariableCount}`,
    `- resourceEvidenceReady: ${report.cloudActionClosureBrief.resourceEvidenceReady}`,
    `- blockedResourceEvidenceIds: ${report.cloudActionClosureBrief.blockedResourceEvidenceIds.length ? report.cloudActionClosureBrief.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- partiallyObservedResourceEvidenceIds: ${report.cloudActionClosureBrief.partiallyObservedResourceEvidenceIds.length ? report.cloudActionClosureBrief.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
    `- strictReadonlyInventoryReady: ${report.cloudActionClosureBrief.strictReadonlyInventoryReady}`,
    `- cloudInventoryReadyLocalOperations: ${report.cloudActionClosureBrief.cloudInventoryReadyLocalOperations}`,
    `- cloudInventoryExecutedCommandResults: ${report.cloudActionClosureBrief.cloudInventoryExecutedCommandResults}`,
    `- mutationPerformedCommandResults: ${report.cloudActionClosureBrief.mutationPerformedCommandResults}`,
    `- backendCanStartNowSteps: ${report.cloudActionClosureBrief.backendCanStartNowSteps.length ? report.cloudActionClosureBrief.backendCanStartNowSteps.join(", ") : "none"}`,
    `- backendBlockedByDependencies: ${report.cloudActionClosureBrief.backendBlockedByDependencies.length ? report.cloudActionClosureBrief.backendBlockedByDependencies.join(", ") : "none"}`,
    `- canStartNowConsoleTasks: ${report.cloudActionClosureBrief.canStartNowConsoleTasks.length ? report.cloudActionClosureBrief.canStartNowConsoleTasks.join(", ") : "none"}`,
    `- cloudConsolePackets: ${report.cloudActionClosureBrief.cloudConsolePackets.length ? report.cloudActionClosureBrief.cloudConsolePackets.join(", ") : "none"}`,
    `- externalAppPackets: ${report.cloudActionClosureBrief.externalAppPackets.length ? report.cloudActionClosureBrief.externalAppPackets.join(", ") : "none"}`,
    `- deferredAppLaunchPackets: ${report.cloudActionClosureBrief.deferredAppLaunchPackets.length ? report.cloudActionClosureBrief.deferredAppLaunchPackets.join(", ") : "none"}`,
    `- blockedByDependencies: ${report.cloudActionClosureBrief.blockedByDependencies.length ? report.cloudActionClosureBrief.blockedByDependencies.join(", ") : "none"}`,
    `- imagePublishWritebackBlockingGroups: ${report.cloudActionClosureBrief.imagePublishWritebackBlockingGroups.length ? report.cloudActionClosureBrief.imagePublishWritebackBlockingGroups.join(", ") : "none"}`,
    "",
    "## 后端 credential 获取/导入队列",
    "",
    ...renderCredentialAcquisitionQueue(report.credentialAcquisitionQueue),
    "",
    "## 后端优先执行顺序",
    "",
    `- sourceCommand: ${report.backendFirstOrder.sourceCommand}`,
    `- purpose: ${report.backendFirstOrder.purpose}`,
    `- note: ${report.backendFirstOrder.note}`,
    `- immediateBackendSteps: ${report.backendFirstOrder.immediateBackendSteps.join(", ") || "none"}`,
    `- blockedBackendSteps: ${report.backendFirstOrder.blockedBackendSteps.join(", ") || "none"}`,
    `- actionTimeConfirmationRequired: ${report.backendFirstOrder.actionTimeConfirmationRequired.join(", ") || "none"}`,
    `- immediateUserInterventionRequired: ${report.backendFirstOrder.immediateUserInterventionRequired.join(", ") || "none"}`,
    `- blockedUserInterventionRequired: ${report.backendFirstOrder.blockedUserInterventionRequired.join(", ") || "none"}`,
    `- userInterventionRequired: ${report.backendFirstOrder.userInterventionRequired.join(", ") || "none"}`,
    ...(report.backendFirstOrder.steps.map((step) =>
      `- ${step.id}: status=${step.status}; packets=${step.requiredAuthorizationPackets.join(", ") || "none"}; dependsOn=${step.blockingDependencies.join(", ") || "none"}; order=${step.orderLine}`
    )),
    "",
    "## 下一步执行队列",
    "",
    `- backendCanStartNow: ${report.executionQueue.backendCanStartNow.map((item) => item.id).join(", ") || "none"}`,
    `- consoleCanStartNow: ${report.executionQueue.canStartNow.map((item) => item.id).join(", ") || "none"}`,
    `- canStartNow: ${report.executionQueue.canStartNow.map((item) => item.id).join(", ") || "none"}`,
    `- externalAppPrerequisites: ${report.executionQueue.externalAppPrerequisites.map((item) => item.packetId).join(", ") || "none"}`,
    `- deferredAppLaunchPrerequisites: ${report.deferredAppLaunchPrerequisitePackets.map((item) => item.packetId).join(", ") || "none"}`,
    `- backendBlockedByDependencies: ${report.executionQueue.backendBlockedByDependencies.map((item) => item.id).join(", ") || "none"}`,
    `- blockedByDependencies: ${report.executionQueue.blockedByDependencies.map((item) => item.id).join(", ") || "none"}`,
    ...(report.executionQueue.backendCanStartNow.length
      ? report.executionQueue.backendCanStartNow.map((item) => `- ${item.id}: kind=${item.kind}; packets=${item.requiredAuthorizationPackets.join(", ") || "none"}; userIntervention=${item.userIntervention}; order=${item.orderLine}`)
      : ["- backendCanStartNowItems: none"]),
    ...(report.executionQueue.canStartNow.length
      ? report.executionQueue.canStartNow.map((item) => `- ${item.id}: kind=${item.kind}; scope=${item.currentActionScope}; phrase=${item.minimumAuthorizationPhrase}`)
      : ["- canStartNowItems: none"]),
    ...(report.executionQueue.externalAppPrerequisites.length
      ? report.executionQueue.externalAppPrerequisites.map((item) => `- ${item.packetId}: kind=${item.kind}; phrase=${item.minimumAuthorizationPhrase}`)
      : ["- externalAppPrerequisiteItems: none"]),
    "",
    "## 只读盘点解锁",
    "",
    `- status: ${report.readonlyInventoryUnblock.status}`,
    `- currentBlocker: ${report.readonlyInventoryUnblock.currentBlocker}`,
    `- currentEvidence: ${report.readonlyInventoryUnblock.currentEvidence.join("；") || "none"}`,
    `- minimumAuthorizationPhrase: ${report.readonlyInventoryUnblock.minimumAuthorizationPhrase}`,
    `- whyConsoleLoginIsNotEnough: ${report.readonlyInventoryUnblock.whyConsoleLoginIsNotEnough}`,
    "- unlockCommands:",
    ...report.readonlyInventoryUnblock.unlockCommands.map((command) => `  - ${command}`),
    "- forbidden:",
    ...report.readonlyInventoryUnblock.forbidden.map((item) => `  - ${item}`),
    "",
    "## 当前可先做",
    "",
    ...(report.immediateConsoleTasks.length
      ? report.immediateConsoleTasks.flatMap((task) => [
          `### ${task.id} ${task.title}`,
          "",
          `- consolePath: ${task.consolePath}`,
          `- minimumAuthorizationPhrase: ${task.minimumAuthorizationPhrase}`,
          `- currentActionScope: ${task.currentActionScope || "full_task"}`,
          `- currentActionAcceptanceEvidence: ${task.currentActionAcceptanceEvidence.join("；") || "none"}`,
          `- writeTargets: ${task.writeTargets.join("；") || "none"}`,
          `- verifyCommands: ${task.verifyCommands.join("；") || "none"}`,
          `- deferredActions: ${task.deferredActions.join("；") || "none"}`,
          "",
        ])
      : ["- none", ""]),
    "## 必须暂缓",
    "",
    ...(report.blockedConsoleTasks.length
      ? report.blockedConsoleTasks.map((task) => `- ${task.id}: dependsOn=${task.blockingDependencies.join(", ") || "none"}; blockers=${task.currentBlockers.slice(0, 6).join(", ") || "none"}`)
      : ["- none"]),
    "",
    "## 云侧动作授权包",
    "",
    ...(report.cloudConsoleAuthorizationPackets.length
      ? report.cloudConsoleAuthorizationPackets.map((packet) => `- ${packet.packetId}: ${packet.minimumAuthorizationPhrase}`)
      : ["- none"]),
    "",
    "## 延期的外部 App 前置项",
    "",
    ...(report.deferredAppLaunchPrerequisitePackets.length
      ? report.deferredAppLaunchPrerequisitePackets.map((packet) =>
        `- ${packet.packetId}: ${packet.minimumAuthorizationPhrase || packet.title || "deferred full App launch item"}`
      )
      : ["- none"]),
    "",
    "## 严格验证顺序",
    "",
    ...report.strictVerificationOrder.map((command) => `- ${command}`),
    "",
    "## 禁止项",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
    ...report.prohibitedWithoutActionTimeConfirmation.map((item) => `- ${item}`),
    "",
    "## 当前阻塞",
    "",
    ...(report.currentBlockers.length ? report.currentBlockers.map((item) => `- ${item}`) : ["- none"]),
  ].join("\n")
}

function uniqueStrings(items) {
  return [...new Set(items.filter(Boolean).map((item) => String(item)))]
}

function renderCredentialAcquisitionQueue(queue) {
  if (!queue || !(queue.items || []).length) return ["- none"]
  return [
    `- queueScope: ${queue.queueScope}`,
    `- missingCredentialNames: ${(queue.missingCredentialNames || []).join(", ") || "none"}`,
    `- onlyMissingBackendCredentialValue: ${queue.onlyMissingBackendCredentialValue || "n/a"}`,
    `- readySecretsPendingCloudImport: ${queue.readySecretEnvVariableCount || 0}`,
    `- requiresActionTimeConfirmationIds: ${(queue.requiresActionTimeConfirmationIds || []).join(", ") || "none"}`,
    "",
    "| order | category | actionId | question | obtainFrom | destination | verify |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...queue.items.map((item) => [
      String(item.order || ""),
      codeCell(item.category),
      codeCell(item.actionId),
      escapeTableCell(item.userQuestion || "none"),
      escapeTableCell(item.obtainFrom || "none"),
      escapeTableCell((item.destinationSummary || []).join("; ") || "none"),
      escapeTableCell((item.verifyCommands || []).join("; ") || "none"),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
  ]
}

function codeCell(value) {
  return `\`${escapeTableCell(value)}\``
}

function escapeTableCell(value) {
  return String(value || "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
}

function findSecretLikeValues(value, path = "$", matches = []) {
  if (typeof value === "string") {
    for (const pattern of SECRET_VALUE_PATTERNS) {
      if (pattern.test(value)) matches.push(path)
    }
    return matches
  }
  if (!value || typeof value !== "object") return matches
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSecretLikeValues(item, `${path}[${index}]`, matches))
    return matches
  }
  for (const [key, nested] of Object.entries(value)) {
    findSecretLikeValues(nested, `${path}.${key}`, matches)
  }
  return matches
}

function printHelp() {
  console.log([
    "Usage: node scripts/generate-aliyun-cloud-actions-package.mjs [options]",
    "",
    "Options:",
    "  --env-file <path>              production-cn env file to inspect without printing values",
    "  --cloud-confirmations <path>   local non-secret cloud confirmation file",
    "  --out <path>                   write JSON report",
    "  --markdown <path>              write Markdown report",
  ].join("\n"))
}

const args = parseArgs(process.argv)
const report = buildPackage(args)
if (args.outPath) writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
if (args.markdownPath) writeFileSync(args.markdownPath, `${renderMarkdown(report)}\n`, { mode: 0o600 })
console.log(JSON.stringify(report, null, 2))
