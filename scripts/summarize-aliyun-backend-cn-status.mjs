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

const WECHAT_DEFERRED_BLOCKERS = Object.freeze([
  "WECHAT_OPEN_APP_ID",
  "WECHAT_OPEN_APP_SECRET",
  "WECHAT_OPEN_PLATFORM_MOBILE_APP",
  "ANDROID_RELEASE_WECHAT_SIGNATURE",
])

const APP_LAUNCH_DEFERRED_BLOCKERS = Object.freeze([
  "WECHAT_OPEN_APP_ID",
  "WECHAT_OPEN_APP_SECRET",
  "WECHAT_OPEN_PLATFORM_MOBILE_APP",
  "ANDROID_RELEASE_SIGNING",
  "APPLE_TEAM_ID",
  "IOS_UNIVERSAL_LINK_AASA",
])

const BACKEND_TARGETS = Object.freeze([
  {
    id: "B01_RDS_POSTGRES_DATA_LAYER",
    title: "Aliyun RDS PostgreSQL formal production-cn data layer",
    requiredBlockers: Object.freeze([
      "DATABASE_URL_CN",
      "RDS_POSTGRES_NOT_READY",
      "RDS_MIGRATION_EVIDENCE_NOT_READY",
      "APP_API_POSTGRES_ADAPTER_MISSING",
    ]),
    verifyCommands: Object.freeze([
      "corepack pnpm aliyun:rds:migration:plan",
      "corepack pnpm aliyun:rds:migration:evidence:strict",
    ]),
  },
  {
    id: "B02_ACR_IMAGE_REGISTRY",
    title: "ACR image registry and production image digest",
    requiredBlockers: Object.freeze(["ACR_IMAGE_REGISTRY_NOT_READY"]),
    verifyCommands: Object.freeze([
      "corepack pnpm aliyun:image:plan",
      "corepack pnpm aliyun:image:plan:strict",
    ]),
  },
  {
    id: "B03_SAE_RUNTIME",
    title: "SAE custom container runtime",
    requiredBlockers: Object.freeze(["SAE_RUNTIME_NOT_READY"]),
    verifyCommands: Object.freeze([
      "corepack pnpm aliyun:runtime:plan",
      "corepack pnpm aliyun:cloud:confirmations:strict",
    ]),
  },
  {
    id: "B04_DOMAINS_HTTPS_ICP",
    title: "api-cn and assets-cn DNS, HTTPS and ICP readiness",
    requiredBlockers: Object.freeze([
      "API_DOMAIN_HTTPS_ICP_NOT_READY",
      "ASSET_DOMAIN_HTTPS_ICP_NOT_READY",
    ]),
    verifyCommands: Object.freeze([
      "corepack pnpm aliyun:domain:check",
      "corepack pnpm aliyun:domain:strict",
    ]),
  },
  {
    id: "B05_OSS_RAM_STS",
    title: "OSS audio storage, CORS, RAM least privilege or STS",
    requiredBlockers: Object.freeze(["OSS_RAM_STS_NOT_READY"]),
    verifyCommands: Object.freeze([
      "corepack pnpm aliyun:cloud:confirmations",
      "corepack pnpm aliyun:health:smoke",
    ]),
  },
  {
    id: "B06_ENV_IMPORT",
    title: "SAE/KMS/Secrets Manager backend environment import",
    requiredBlockers: Object.freeze(["ENV_IMPORT_NOT_READY"]),
    verifyCommands: Object.freeze([
      "corepack pnpm aliyun:env:checklist",
      "corepack pnpm aliyun:sensitive:blockers",
    ]),
  },
  {
    id: "B07_SLS_ALERTS",
    title: "SLS logstore and health/5xx alerts",
    requiredBlockers: Object.freeze(["SLS_ALERTS_NOT_READY"]),
    verifyCommands: Object.freeze([
      "corepack pnpm aliyun:cloud:confirmations",
      "corepack pnpm aliyun:postdeploy:smoke",
    ]),
  },
  {
    id: "B08_POSTDEPLOY_SMOKE",
    title: "Aliyun backend health and APP API smoke after deploy",
    requiredBlockers: Object.freeze(["POSTDEPLOY_SMOKE_NOT_RUN"]),
    verifyCommands: Object.freeze([
      "corepack pnpm aliyun:health:smoke",
      "corepack pnpm aliyun:app-api:smoke",
      "corepack pnpm aliyun:postdeploy:smoke",
    ]),
  },
])

const RESOURCE_EVIDENCE_BY_BACKEND_TARGET = Object.freeze({
  B02_ACR_IMAGE_REGISTRY: Object.freeze(["R02_ACR_IMAGE_REGISTRY"]),
  B03_SAE_RUNTIME: Object.freeze(["R01_SAE_RUNTIME"]),
  B04_DOMAINS_HTTPS_ICP: Object.freeze(["R03_API_DOMAIN_HTTPS", "R04_ASSET_DOMAIN_HTTPS"]),
  B05_OSS_RAM_STS: Object.freeze(["R05_OSS_AUDIO_STORAGE"]),
  B06_ENV_IMPORT: Object.freeze(["R06_ENV_IMPORT"]),
  B07_SLS_ALERTS: Object.freeze(["R07_SLS_ALERTS"]),
})

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
  const cloudConfirmations = runJson("cloud_confirmations", [
    "scripts/check-aliyun-cloud-confirmations.mjs",
    "--local",
    args.cloudConfirmationsFile,
    "--allow-incomplete",
  ])
  const imagePublishPlan = runJson("image_publish_plan", [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--allow-incomplete",
  ])
  const cloudInventoryResults = runJson("cloud_inventory_results", [
    "scripts/check-aliyun-cli-inventory-results.mjs",
    "--local",
    args.cloudInventoryResultsFile,
    "--allow-incomplete",
  ])
  const resourceMatrix = runJson("resource_matrix", [
    "scripts/summarize-aliyun-resource-matrix.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const rdsMigration = runJson("rds_migration", [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--local",
    args.rdsMigrationFile,
    "--allow-incomplete",
  ])

  const backendRequiredBlocking = buildBackendRequiredBlocking({
    cloudConfirmations,
    imagePublishPlan,
    cloudInventoryResults,
    resourceMatrix,
    rdsMigration,
  })
  const backendTargets = buildBackendTargets(backendRequiredBlocking, {
    cloudConfirmations,
    imagePublishPlan,
    cloudInventoryResults,
    resourceMatrix,
    rdsMigration,
  })
  const cloudInventory = compactCloudInventory(cloudInventoryResults)
  const cloudResources = compactCloudResources(resourceMatrix)

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    currentScope: "backend_aliyun_only",
    fullAppLaunchScope: "deferred_after_backend_online",
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    cloudApiCalledByThisCommand: false,
    canProceedWithoutWechat: true,
    canDeployBackendNow: backendRequiredBlocking.length === 0,
    currentAnswer: backendRequiredBlocking.length === 0
      ? "Backend Aliyun evidence is ready for a separate production deploy authorization."
      : "微信开放平台移动应用已从当前目标排除；现在只补阿里云后端，仍缺 RDS/ACR/SAE/DNS/OSS/env/SLS/smoke 等后端证据。",
    files: {
      envFile: args.envFile,
      cloudConfirmationsFile: args.cloudConfirmationsFile,
      cloudInventoryResultsFile: args.cloudInventoryResultsFile,
      rdsMigrationFile: args.rdsMigrationFile,
    },
    summary: {
      backendRequiredBlocking,
      backendRequiredBlockingCount: backendRequiredBlocking.length,
      backendTargetReady: `${backendTargets.filter((item) => item.ready).length}/${backendTargets.length}`,
      cloudResourceEvidenceReady: resourceMatrix.summary?.resourceEvidenceReady || "unknown",
      cloudInventoryStrictReady: cloudInventory.strictReady,
      rdsMigrationReady: rdsMigration.localReady === true || rdsMigration.local?.ready === true,
      rdsLocalExists: rdsMigration.localExists === true || rdsMigration.local?.exists === true,
      imagePublishReady: imagePublishPlan.ready === true || imagePublishPlan.local?.ready === true,
      wechatDeferredBlocking: [...WECHAT_DEFERRED_BLOCKERS],
      appLaunchDeferredBlocking: [...APP_LAUNCH_DEFERRED_BLOCKERS],
    },
    backendTargets,
    cloudResources,
    cloudInventory,
    rdsMigration: compactRdsMigration(rdsMigration),
    imagePublish: compactImagePublish(imagePublishPlan),
    cloudConfirmations: compactCloudConfirmations(cloudConfirmations),
    deferredScope: {
      wechatOpenMobileApp: {
        status: "deferred_after_backend_online",
        excludedFromBackendRequiredBlocking: true,
        blockers: [...WECHAT_DEFERRED_BLOCKERS],
        note: "APP 微信登录的移动应用 AppID/AppSecret 仍是完整 APP 发布前置项，但不是当前阿里云后端资源补齐的阻塞项。",
      },
      appStoreLaunch: {
        status: "deferred_after_backend_online",
        blockers: [...APP_LAUNCH_DEFERRED_BLOCKERS],
      },
    },
    nextBackendOrder: [
      ...(cloudInventory.strictReady ? [] : [
        "0. Restore Aliyun CLI/CloudShell read-only inventory evidence and write non-secret summaries only.",
      ]),
      "1. Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou and close Supabase-to-RDS migration evidence.",
      "2. Confirm OSS RAM/STS least-privilege runtime access.",
      "3. Purchase/confirm ACR, build/push the backend image, and record non-secret digest evidence.",
      "4. Import backend env through SAE/KMS/Secrets Manager, including DATABASE_URL_CN only as a secret env.",
      "5. Create SAE runtime with container port 3000 and /api/healthz.",
      "6. Bind api-cn/assets-cn DNS, HTTPS certificate, and ICP-compliant public access.",
      "7. Configure SLS health and 5xx alerts.",
      "8. Run backend health and APP API smoke tests against Aliyun.",
    ],
    strictVerificationOrder: [
      "corepack pnpm aliyun:backend-cn:status",
      "corepack pnpm aliyun:cloudshell:handoff",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
      "corepack pnpm aliyun:rds:migration:evidence:strict",
      "corepack pnpm aliyun:cloud:confirmations:strict",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:predeploy",
    ],
    safetyBoundary: [
      "This command is read-only and does not create, purchase, modify, deploy, push images, or import secrets.",
      "Do not store DATABASE_URL_CN, database password, AccessKeySecret, AppSecret, STS token, registry password, or Supabase service role key in JSON, Markdown, Docker image, APP bundle, mini-program package, git, or shell history.",
      "WeChat Open Platform mobile app creation is explicitly deferred from the current backend-only target.",
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

function buildBackendRequiredBlocking({ cloudConfirmations, imagePublishPlan, cloudInventoryResults, resourceMatrix, rdsMigration }) {
  const blockers = new Set()
  const cloudItems = cloudConfirmations.local?.items || {}
  const inventoryNotFound = new Set(cloudInventoryResults.local?.observationSummary?.notFoundOperationIds || [])

  if (!rdsMigration.local?.ready) {
    blockers.add("DATABASE_URL_CN")
    blockers.add("RDS_MIGRATION_EVIDENCE_NOT_READY")
  }
  if (inventoryNotFound.has("I08_RDS_POSTGRES")) blockers.add("RDS_POSTGRES_NOT_READY")
  if (rdsMigration.summary?.postgresDataAccessAdapterDetected !== true) blockers.add("APP_API_POSTGRES_ADAPTER_MISSING")
  if (imagePublishPlan.ready !== true && imagePublishPlan.local?.ready !== true) blockers.add("ACR_IMAGE_REGISTRY_NOT_READY")
  if (cloudItems.runtime?.ready !== true) blockers.add("SAE_RUNTIME_NOT_READY")
  if (cloudItems.apiDomainHttps?.ready !== true) blockers.add("API_DOMAIN_HTTPS_ICP_NOT_READY")
  if (cloudItems.assetDomainHttps?.ready !== true) blockers.add("ASSET_DOMAIN_HTTPS_ICP_NOT_READY")
  if (cloudItems.oss?.ready !== true) blockers.add("OSS_RAM_STS_NOT_READY")
  if (cloudItems.envImport?.ready !== true) blockers.add("ENV_IMPORT_NOT_READY")
  if (cloudItems.slsAlerts?.ready !== true) blockers.add("SLS_ALERTS_NOT_READY")

  for (const id of resourceMatrix.summary?.blockedResourceEvidenceIds || []) {
    if (id === "R01_SAE_RUNTIME") blockers.add("SAE_RUNTIME_NOT_READY")
    if (id === "R02_ACR_IMAGE_REGISTRY") blockers.add("ACR_IMAGE_REGISTRY_NOT_READY")
    if (id === "R03_API_DOMAIN_HTTPS") blockers.add("API_DOMAIN_HTTPS_ICP_NOT_READY")
    if (id === "R04_ASSET_DOMAIN_HTTPS") blockers.add("ASSET_DOMAIN_HTTPS_ICP_NOT_READY")
    if (id === "R05_OSS_AUDIO_STORAGE") blockers.add("OSS_RAM_STS_NOT_READY")
    if (id === "R06_ENV_IMPORT") blockers.add("ENV_IMPORT_NOT_READY")
    if (id === "R07_SLS_ALERTS") blockers.add("SLS_ALERTS_NOT_READY")
  }

  blockers.add("POSTDEPLOY_SMOKE_NOT_RUN")

  return [...blockers].filter((item) => !WECHAT_DEFERRED_BLOCKERS.includes(item)).sort()
}

function buildBackendTargets(backendRequiredBlocking, reports) {
  const blockerSet = new Set(backendRequiredBlocking)
  return BACKEND_TARGETS.map((target) => {
    const blockers = target.requiredBlockers.filter((blocker) => blockerSet.has(blocker))
    return {
      ...target,
      ready: blockers.length === 0,
      blockers,
      currentEvidence: currentEvidenceForTarget(target.id, reports),
    }
  })
}

function currentEvidenceForTarget(id, { cloudConfirmations, imagePublishPlan, cloudInventoryResults, resourceMatrix, rdsMigration }) {
  const cloudItems = cloudConfirmations.local?.items || {}
  const observation = cloudInventoryResults.local?.observationSummary || {}
  const resourceEvidence = evidenceForResourceRows(resourceMatrix, RESOURCE_EVIDENCE_BY_BACKEND_TARGET[id] || [])
  if (id === "B01_RDS_POSTGRES_DATA_LAYER") {
    return [
      `rdsLocalExists=${rdsMigration.local?.exists === true}`,
      `rdsLocalReady=${rdsMigration.local?.ready === true}`,
      `appApiRoutesWithSupabase=${rdsMigration.summary?.appApiRoutesWithSupabase || 0}/${rdsMigration.summary?.appApiRouteCount || 0}`,
      `firstVersionRdsRoutesWithSupabaseDataAccess=${rdsMigration.summary?.firstVersionRdsRoutesWithSupabaseDataAccess || 0}/${rdsMigration.summary?.firstVersionRdsRouteCount || 0}`,
      `postgresDataAccessAdapterDetected=${rdsMigration.summary?.postgresDataAccessAdapterDetected === true}`,
      `inventoryNotFound=${(observation.notFoundOperationIds || []).includes("I08_RDS_POSTGRES")}`,
    ]
  }
  if (id === "B02_ACR_IMAGE_REGISTRY") {
    return [
      `imagePlanReady=${imagePublishPlan.ready === true || imagePublishPlan.local?.ready === true}`,
      `imageWritebackGroups=${(imagePublishPlan.summary?.writebackBlockingGroups || []).join(",") || "none"}`,
      ...resourceEvidence,
    ]
  }
  if (id === "B03_SAE_RUNTIME") return [...evidenceForCloudItem(cloudItems.runtime), ...resourceEvidence]
  if (id === "B04_DOMAINS_HTTPS_ICP") {
    return [
      ...evidenceForCloudItem(cloudItems.apiDomainHttps).map((item) => `api:${item}`),
      ...evidenceForCloudItem(cloudItems.assetDomainHttps).map((item) => `asset:${item}`),
      ...resourceEvidence,
    ]
  }
  if (id === "B05_OSS_RAM_STS") return [...evidenceForCloudItem(cloudItems.oss), ...resourceEvidence]
  if (id === "B06_ENV_IMPORT") return [...evidenceForCloudItem(cloudItems.envImport), ...resourceEvidence]
  if (id === "B07_SLS_ALERTS") return [...evidenceForCloudItem(cloudItems.slsAlerts), ...resourceEvidence]
  if (id === "B08_POSTDEPLOY_SMOKE") return ["requires deployed Aliyun backend base URL"]
  return []
}

function evidenceForCloudItem(item) {
  if (!item) return ["missing_cloud_confirmation_item"]
  return [
    `ready=${item.ready === true}`,
    `blockers=${(item.blockers || []).join(",") || "none"}`,
    `evidenceReady=${Boolean(String(item.evidence || "").trim())}`,
  ]
}

function evidenceForResourceRows(resourceMatrix, ids) {
  if (!ids.length) return []
  const rows = resourceMatrix.resourceEvidenceBrief?.rows || []
  const rowById = new Map(rows.map((row) => [row.id, row]))
  return ids.flatMap((id) => {
    const row = rowById.get(id)
    if (!row) return [`${id}:missing_resource_matrix_row`]
    return [
      `${id}.observedStatus=${row.observedStatus || "unknown"}`,
      `${id}.observedReadiness=${row.observedReadiness || "unknown"}`,
      ...(row.currentEvidence || []).slice(0, 2).map((item, index) => `${id}.currentEvidence${index + 1}=${item}`),
      ...(row.missingEvidence || []).slice(0, 3).map((item) => `${id}.missing=${item}`),
    ]
  })
}

function compactCloudInventory(report) {
  const observation = report.local?.observationSummary || {}
  return {
    strictReady: report.local?.ready === true,
    readyLocalOperations: `${report.summary?.readyLocalOperations || 0}/${report.summary?.localOperations || 0}`,
    executedCommandResults: `${observation.executedCommandResults || 0}/${observation.commandResults || 0}`,
    mutationPerformedCommandResults: observation.mutationPerformedCommandResults || 0,
    observedOperationIds: observation.observedOperationIds || [],
    notFoundOperationIds: observation.notFoundOperationIds || [],
    backendMeaning: {
      rdsPostgres: (observation.notFoundOperationIds || []).includes("I08_RDS_POSTGRES") ? "not_found" : "observed_or_unknown",
      saeRuntime: (observation.notFoundOperationIds || []).includes("I01_SAE_RUNTIME") ? "not_found" : "observed_or_unknown",
      acrImage: (observation.notFoundOperationIds || []).includes("I02_ACR_IMAGE") ? "not_found" : "observed_or_unknown",
      ossAudioBucket: (observation.observedOperationIds || []).includes("I05_OSS_AUDIO_BUCKET") ? "partial_observed" : "not_observed",
      slsProject: (observation.observedOperationIds || []).includes("I06_SLS_ALERTS") ? "partial_observed" : "not_observed",
    },
  }
}

function compactCloudResources(report) {
  return {
    evidenceReady: report.summary?.resourceEvidenceReady || "unknown",
    blockedIds: report.summary?.blockedResourceEvidenceIds || [],
    observedPartial: report.resourceEvidenceBrief?.rows
      ?.filter((item) => item.observedReadiness === "partial")
      .map((item) => item.id) || [],
    rows: (report.resourceEvidenceBrief?.rows || []).map((item) => ({
      id: item.id,
      title: item.title,
      ready: item.ready === true,
      observedReadiness: item.observedReadiness || "unknown",
      requiredAuthorizationPackets: item.requiredAuthorizationPackets || [],
      consoleTaskIds: item.consoleTaskIds || [],
      verifyCommands: item.verifyCommands || [],
    })),
  }
}

function compactRdsMigration(report) {
  return {
    localExists: report.local?.exists === true,
    localReady: report.local?.ready === true,
    migrationReady: report.migrationReady === true || report.summary?.migrationReady === true,
    appApiRouteCount: report.summary?.appApiRouteCount || 0,
    appApiRoutesWithSupabase: report.summary?.appApiRoutesWithSupabase || 0,
    appApiRoutesWithSupabaseDataAccess: report.summary?.appApiRoutesWithSupabaseDataAccess || 0,
    firstVersionRdsRouteCount: report.summary?.firstVersionRdsRouteCount || 0,
    firstVersionRdsRoutesWithSupabase: report.summary?.firstVersionRdsRoutesWithSupabase || 0,
    firstVersionRdsRoutesWithSupabaseDataAccess: report.summary?.firstVersionRdsRoutesWithSupabaseDataAccess || 0,
    deferredAppApiRouteCount: report.summary?.deferredAppApiRouteCount || 0,
    deferredAppApiRoutesWithSupabaseDataAccess: report.summary?.deferredAppApiRoutesWithSupabaseDataAccess || 0,
    databaseUrlCnReferencedInSource: report.summary?.databaseUrlCnReferencedInSource === true,
    postgresDataAccessAdapterDetected: report.summary?.postgresDataAccessAdapterDetected === true,
    blockers: report.local?.blockers || [],
    requiredAuthorizationPackets: report.summary?.requiredAuthorizationPackets || [],
  }
}

function compactImagePublish(report) {
  return {
    ready: report.ready === true || report.local?.ready === true,
    localReady: report.local?.ready === true,
    writebackBlockingGroups: report.summary?.writebackBlockingGroups || [],
    requiredAuthorizationPackets: report.summary?.requiredAuthorizationPackets || [],
  }
}

function compactCloudConfirmations(report) {
  const localItems = report.local?.items || {}
  const backendKeys = ["runtime", "apiDomainHttps", "assetDomainHttps", "oss", "envImport", "slsAlerts"]
  return {
    backendReady: `${backendKeys.filter((key) => localItems[key]?.ready === true).length}/${backendKeys.length}`,
    backendBlockers: backendKeys.flatMap((key) =>
      (localItems[key]?.blockers || []).map((blocker) => `${key}:${blocker}`)),
    wechatExcludedBlockers: localItems.wechatOpenPlatform?.blockers || [],
  }
}

function renderMarkdown(report) {
  return [
    "# APP production-cn Aliyun backend status",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Current Scope",
    "",
    `- currentScope: ${report.currentScope}`,
    `- fullAppLaunchScope: ${report.fullAppLaunchScope}`,
    `- canProceedWithoutWechat: ${report.canProceedWithoutWechat}`,
    `- canDeployBackendNow: ${report.canDeployBackendNow}`,
    `- backendRequiredBlocking: ${report.summary.backendRequiredBlocking.join(", ") || "none"}`,
    `- wechatDeferredBlocking: ${report.summary.wechatDeferredBlocking.join(", ")}`,
    "",
    "## Backend Targets",
    "",
    ...report.backendTargets.flatMap((target) => [
      `### ${target.id}`,
      "",
      `- ready: ${target.ready}`,
      `- blockers: ${target.blockers.join(", ") || "none"}`,
      `- verifyCommands: ${target.verifyCommands.join("; ")}`,
      `- currentEvidence: ${target.currentEvidence.join("; ") || "none"}`,
      "",
    ]),
    "## Next Backend Order",
    "",
    ...report.nextBackendOrder.map((item) => `- ${item}`),
    "",
    "## Deferred App Launch Scope",
    "",
    `- wechatOpenMobileApp: ${report.deferredScope.wechatOpenMobileApp.status}`,
    `- appLaunchDeferredBlocking: ${report.summary.appLaunchDeferredBlocking.join(", ")}`,
    "",
    "## Strict Verification Order",
    "",
    ...report.strictVerificationOrder.map((item) => `- ${item}`),
    "",
    "## Safety Boundary",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
    "",
  ].join("\n")
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
    "  node scripts/summarize-aliyun-backend-cn-status.mjs [--out path] [--markdown path]",
    "",
    "Summarizes the current backend-only Aliyun production-cn readiness.",
    "WeChat Open Platform mobile app blockers are explicitly deferred from this backend-only scope.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
