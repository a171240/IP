#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { APP_API_SMOKE_PROBE_SET_ID, PROBES } from "./smoke-app-api-production-cn.mjs"
import {
  DEPLOYMENT_IDENTITY_FIELDS,
  canonicalizeDeploymentIdentity,
  canonicalIsoTimestampMs,
  isCanonicalImageDigest,
  observeDeploymentIdentities,
  sameDeploymentIdentity,
  validationClockMs,
} from "./lib/aliyun-deployment-identity.mjs"

export { APP_API_SMOKE_PROBE_SET_ID }

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const DEFAULT_CLOUD_INVENTORY_RESULTS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-inventory-results.local.json")
const DEFAULT_RDS_MIGRATION_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.rds-migration.local.json")
const DEFAULT_IMAGE_PUBLISH_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.image-publish.local.json")
const DEFAULT_POSTDEPLOY_SMOKE_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.postdeploy-smoke.local.json")
const DEFAULT_CHILD_TIMEOUT_MS = 120_000
const PRODUCTION_CN_APP_API_BASE_URL = "https://api-cn.ipgongchang.xin"

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

const EVIDENCE_WRITEBACK_PACKET_ORDER = Object.freeze([
  "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
  "P11_ALIYUN_RDS_DATA_MIGRATION",
  "P05_OSS_RAM_STS",
  "P03_ACR_PURCHASE",
  "P04_ACR_IMAGE_AND_PULL",
  "P06_ENV_IMPORT",
  "P07_DOMAIN_DNS_HTTPS",
  "P08_SAE_RUNTIME_SLS",
])

const EVIDENCE_WRITEBACK_SECRET_OR_CREDENTIAL_PACKET_IDS = new Set([
  "P05_OSS_RAM_STS",
  "P11_ALIYUN_RDS_DATA_MIGRATION",
  "P06_ENV_IMPORT",
])
const BACKEND_CLOUD_CONFIRMATION_KEYS = Object.freeze([
  "runtime",
  "apiDomainHttps",
  "assetDomainHttps",
  "oss",
  "envImport",
  "slsAlerts",
])
const BACKEND_CLOUD_CONFIRMATION_PACKETS_BY_KEY = Object.freeze({
  runtime: ["P08_SAE_RUNTIME_SLS"],
  apiDomainHttps: ["P07_DOMAIN_DNS_HTTPS"],
  assetDomainHttps: ["P07_DOMAIN_DNS_HTTPS"],
  oss: ["P05_OSS_RAM_STS"],
  envImport: ["P06_ENV_IMPORT"],
  slsAlerts: ["P08_SAE_RUNTIME_SLS"],
})

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
      "corepack pnpm aliyun:backend-cn:status -- --postdeploy-smoke deploy/aliyun-production-cn.postdeploy-smoke.local.json",
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
    imagePublishFile: DEFAULT_IMAGE_PUBLISH_FILE,
    postdeploySmokeFile: DEFAULT_POSTDEPLOY_SMOKE_FILE,
    childTimeoutMs: DEFAULT_CHILD_TIMEOUT_MS,
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
    if (arg === "--image-publish") {
      args.imagePublishFile = resolveValue(argv[++index], "--image-publish")
      continue
    }
    if (arg === "--postdeploy-smoke") {
      args.postdeploySmokeFile = resolveValue(argv[++index], "--postdeploy-smoke")
      continue
    }
    if (arg === "--child-timeout-ms") {
      args.childTimeoutMs = Number(resolveRawValue(argv[++index], "--child-timeout-ms"))
      if (!Number.isFinite(args.childTimeoutMs) || args.childTimeoutMs < 1_000) {
        throw new Error("invalid_child_timeout_ms")
      }
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
  const raw = resolveRawValue(value, name)
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw)
}

function resolveRawValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return String(value)
}

function runJsonForInvocation(invocationCache, label, scriptArgs, options = {}) {
  const cacheKey = JSON.stringify(scriptArgs)
  if (invocationCache.has(cacheKey)) return invocationCache.get(cacheKey)

  const timeoutMs = options.timeoutMs ?? DEFAULT_CHILD_TIMEOUT_MS
  const childEnv = { ...process.env }
  delete childEnv.MEIYE_ALIYUN_RUN_JSON_CACHE_DIR
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
    timeout: timeoutMs,
    env: childEnv,
  })
  if (result.error) {
    const code = String(result.error.code || "spawn_error")
    throw new Error(`${label}_failed:${code}`)
  }
  if (result.status !== 0) throw new Error(`${label}_failed:nonzero_exit`)

  const stdout = String(result.stdout || "").trim()
  if (!stdout) throw new Error(`${label}_failed:empty_stdout`)
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error(`${label}_failed:invalid_json`)
  }
  invocationCache.set(cacheKey, parsed)
  return parsed
}

function buildReport(args) {
  const invocationCache = new Map()
  const run = (label, scriptArgs, options = {}) => runJsonForInvocation(invocationCache, label, scriptArgs, {
    ...options,
    timeoutMs: options.timeoutMs ?? args.childTimeoutMs,
  })
  const cloudConfirmations = run("cloud_confirmations", [
    "scripts/check-aliyun-cloud-confirmations.mjs",
    "--local",
    args.cloudConfirmationsFile,
    "--allow-incomplete",
  ])
  const imagePublishPlan = run("image_publish_plan", [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--local",
    args.imagePublishFile,
    "--allow-incomplete",
  ])
  const cloudInventoryResults = run("cloud_inventory_results", [
    "scripts/check-aliyun-cli-inventory-results.mjs",
    "--local",
    args.cloudInventoryResultsFile,
    "--allow-incomplete",
  ])
  const resourceMatrix = run("resource_matrix", [
    "scripts/summarize-aliyun-resource-matrix.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
    "--rds-migration",
    args.rdsMigrationFile,
    "--image-publish",
    args.imagePublishFile,
  ])
  const rdsMigration = run("rds_migration", [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--local",
    args.rdsMigrationFile,
    "--allow-incomplete",
  ])
  const sensitiveBlockers = run("sensitive_blockers", [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--backend-only",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const actionAuthorization = run("action_authorization", [
    "scripts/summarize-aliyun-action-authorization.mjs",
    "--backend-only",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
    "--rds-migration",
    args.rdsMigrationFile,
    "--image-publish",
    args.imagePublishFile,
  ])
  const deploymentGate = deriveExpectedDeploymentIdentity(imagePublishPlan, cloudConfirmations)
  const postdeploySmoke = readPostdeploySmokeReport(args.postdeploySmokeFile, { deploymentGate })
  const backendRequiredBlocking = buildBackendRequiredBlocking({
    cloudConfirmations,
    imagePublishPlan,
    cloudInventoryResults,
    resourceMatrix,
    rdsMigration,
    postdeploySmoke,
  })
  const backendTargets = buildBackendTargets(backendRequiredBlocking, {
    cloudConfirmations,
    imagePublishPlan,
    cloudInventoryResults,
    resourceMatrix,
    rdsMigration,
    postdeploySmoke,
  })
  const cloudInventory = compactCloudInventory(cloudInventoryResults)
  const cloudResources = compactCloudResources(resourceMatrix)
  const credentialIntervention = compactCredentialIntervention(sensitiveBlockers)
  const actionAuthorizationSummary = compactActionAuthorization(actionAuthorization)
  const rdsMigrationBrief = compactRdsMigration(rdsMigration)
  const imagePublishBrief = compactImagePublish(imagePublishPlan)
  const cloudConfirmationsBrief = compactCloudConfirmations(cloudConfirmations)
  const backendEvidenceScopeBreakdown = buildBackendEvidenceScopeBreakdown({
    cloudConfirmations: cloudConfirmationsBrief,
    cloudResources,
    rdsMigration: rdsMigrationBrief,
    imagePublish: imagePublishBrief,
  })
  const credentialPasswordIntervention = buildCredentialPasswordIntervention(credentialIntervention)
  const evidenceWritebackBrief = buildEvidenceWritebackBrief({
    args,
    rdsMigration,
    cloudInventoryResults,
    cloudConfirmations,
    imagePublishPlan,
    actionAuthorization: actionAuthorizationSummary,
  })
  const backendActionAuthorizationSummary = filterActionAuthorizationForEvidenceGaps(
    actionAuthorizationSummary,
    evidenceWritebackBrief,
  )
  const nextBackendOrder = buildNextBackendOrder({
    cloudInventory,
    backendTargets,
  })

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
      : "微信开放平台移动应用已从当前目标排除；现在只补阿里云后端，剩余阻塞以 backendRequiredBlocking 为准。",
    childCommands: {
      timeoutMs: args.childTimeoutMs,
      timeoutEnforced: true,
      failureMode: "fail_closed_no_cloud_mutation",
      note: "Child status checks are bounded so backend-cn status cannot hang indefinitely; timed-out children fail the local gate instead of creating or modifying cloud resources.",
    },
    files: {
      envFile: args.envFile,
      cloudConfirmationsFile: args.cloudConfirmationsFile,
      cloudInventoryResultsFile: args.cloudInventoryResultsFile,
      rdsMigrationFile: args.rdsMigrationFile,
      imagePublishFile: args.imagePublishFile,
    },
    summary: {
      backendRequiredBlocking,
      backendRequiredBlockingCount: backendRequiredBlocking.length,
      backendTargetReady: `${backendTargets.filter((item) => item.ready).length}/${backendTargets.length}`,
      cloudResourceEvidenceReady: resourceMatrix.summary?.resourceEvidenceReady || "unknown",
      cloudInventoryStrictReady: cloudInventory.strictReady,
      cloudInventoryFailureCategories: cloudInventory.failureCategories,
      cloudInventoryFailedOperationIds: cloudInventory.failedOperationIds,
      rdsMigrationReady: rdsMigration.localReady === true || rdsMigration.local?.ready === true,
      rdsLocalExists: rdsMigration.localExists === true || rdsMigration.local?.exists === true,
      imagePublishReady: imagePublishPlan.ready === true || imagePublishPlan.local?.ready === true,
      postdeploySmokeReady: postdeploySmoke.ready,
      evidenceWritebackReady: evidenceWritebackBrief.evidenceWritebackReady,
      evidenceWritebackTotalGaps: evidenceWritebackBrief.totalGaps,
      evidenceWritebackGapSummary: evidenceWritebackBrief.gapSummary,
      evidenceWritebackCanStartNowPacketIds: evidenceWritebackBrief.canStartNowPacketIds,
      evidenceWritebackBlockedByDependencyPacketIds: evidenceWritebackBrief.blockedByDependencyPacketIds,
      sensitiveActionBlockedIds: credentialIntervention.sensitiveActionBlockedIds,
      actionTimeConfirmationRequiredIds: credentialIntervention.actionTimeConfirmationRequiredIds,
      nextActionTimeConfirmationPacketIds: backendActionAuthorizationSummary.nextActionTimeConfirmationPacketIds,
      blockedCredentialNames: credentialIntervention.blockedCredentialNames,
      readySecretEnvVariableCount: credentialIntervention.readySecretEnvVariableNames.length,
      readySecretEnvVariableNames: credentialIntervention.readySecretEnvVariableNames,
      backendEvidenceScope: backendEvidenceScopeBreakdown.summary,
      credentialPasswordInterventionRequired: credentialPasswordIntervention.required,
      credentialPasswordInterventionActionIds: credentialPasswordIntervention.actionIds,
      wechatDeferredBlocking: [...WECHAT_DEFERRED_BLOCKERS],
      appLaunchDeferredBlocking: [...APP_LAUNCH_DEFERRED_BLOCKERS],
    },
    backendTargets,
    backendEvidenceScopeBreakdown,
    cloudResources,
    cloudInventory,
    rdsMigration: rdsMigrationBrief,
    imagePublish: imagePublishBrief,
    cloudConfirmations: cloudConfirmationsBrief,
    postdeploySmoke,
    evidenceWriteback: evidenceWritebackBrief,
    credentialIntervention,
    credentialPasswordIntervention,
    actionAuthorization: backendActionAuthorizationSummary,
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
    nextBackendOrder,
    strictVerificationOrder: [
      "corepack pnpm aliyun:backend-cn:status",
      "corepack pnpm aliyun:backend-cn:status -- --postdeploy-smoke deploy/aliyun-production-cn.postdeploy-smoke.local.json",
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

function buildBackendRequiredBlocking({ cloudConfirmations, imagePublishPlan, cloudInventoryResults, resourceMatrix, rdsMigration, postdeploySmoke }) {
  const blockers = new Set()
  const cloudItems = cloudConfirmationItems(cloudConfirmations)
  const inventoryNotFound = new Set(cloudInventoryResults.local?.observationSummary?.notFoundOperationIds || [])
  const acrImageReady = isImagePushAndDigestReady(imagePublishPlan)

  if (!rdsMigration.local?.ready) {
    const rdsLocalBlockers = new Set(rdsMigration.local?.blockers || [])
    const databaseUrlCnImported = rdsMigration.local?.rdsPostgres?.databaseUrlCnSecretImported === true
    const databaseUrlCnStillMissing = !databaseUrlCnImported ||
      rdsLocalBlockers.has("file_missing") ||
      rdsLocalBlockers.has("rdsPostgres.databaseUrlCnSecretImported")
    if (databaseUrlCnStillMissing) blockers.add("DATABASE_URL_CN")
    blockers.add("RDS_MIGRATION_EVIDENCE_NOT_READY")
  }
  if (inventoryNotFound.has("I08_RDS_POSTGRES")) blockers.add("RDS_POSTGRES_NOT_READY")
  if (rdsMigration.summary?.postgresDataAccessAdapterDetected !== true) blockers.add("APP_API_POSTGRES_ADAPTER_MISSING")
  if (!acrImageReady) blockers.add("ACR_IMAGE_REGISTRY_NOT_READY")
  if (cloudItems.runtime?.ready !== true) blockers.add("SAE_RUNTIME_NOT_READY")
  if (cloudItems.apiDomainHttps?.ready !== true) blockers.add("API_DOMAIN_HTTPS_ICP_NOT_READY")
  if (cloudItems.assetDomainHttps?.ready !== true) blockers.add("ASSET_DOMAIN_HTTPS_ICP_NOT_READY")
  if (cloudItems.oss?.ready !== true) blockers.add("OSS_RAM_STS_NOT_READY")
  if (cloudItems.envImport?.ready !== true) blockers.add("ENV_IMPORT_NOT_READY")
  if (cloudItems.slsAlerts?.ready !== true) blockers.add("SLS_ALERTS_NOT_READY")

  for (const id of resourceMatrix.summary?.blockedResourceEvidenceIds || []) {
    if (id === "R01_SAE_RUNTIME") blockers.add("SAE_RUNTIME_NOT_READY")
    if (id === "R02_ACR_IMAGE_REGISTRY" && !acrImageReady) blockers.add("ACR_IMAGE_REGISTRY_NOT_READY")
    if (id === "R03_API_DOMAIN_HTTPS") blockers.add("API_DOMAIN_HTTPS_ICP_NOT_READY")
    if (id === "R04_ASSET_DOMAIN_HTTPS") blockers.add("ASSET_DOMAIN_HTTPS_ICP_NOT_READY")
    if (id === "R05_OSS_AUDIO_STORAGE") blockers.add("OSS_RAM_STS_NOT_READY")
    if (id === "R06_ENV_IMPORT") blockers.add("ENV_IMPORT_NOT_READY")
    if (id === "R07_SLS_ALERTS") blockers.add("SLS_ALERTS_NOT_READY")
  }

  if (postdeploySmoke.ready !== true) {
    blockers.add("POSTDEPLOY_SMOKE_NOT_RUN")
  }

  return [...blockers].filter((item) => !WECHAT_DEFERRED_BLOCKERS.includes(item)).sort()
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function isEmptyArray(value) {
  return Array.isArray(value) && value.length === 0
}

function appApiProbeKey(probe) {
  return `${String(probe?.method || "").toUpperCase()} ${String(probe?.path || "")}`
}

export function deriveExpectedDeploymentIdentity(imagePublishPlan, cloudConfirmations, options = {}) {
  const now = validationClockMs(options.now ?? Date.now())
  if (now === null) return { ready: false, blockers: ["validation_clock_invalid"], identity: null }
  const blockers = []
  const b02Ready = isImagePushAndDigestReady(imagePublishPlan)
  const runtime = cloudConfirmations?.local?.itemStatus?.runtime
  const b03Ready = runtime?.ready === true
  if (!b02Ready) blockers.push("deployment_identity_b02_unready")
  if (!b03Ready) blockers.push("deployment_identity_b03_unready")
  if (blockers.length > 0) return { ready: false, blockers: blockers.sort(), identity: null }

  const imageDigest = imagePublishPlan?.local?.acr?.remoteDigest
  if (!isCanonicalImageDigest(imageDigest)) {
    return { ready: false, blockers: ["deployment_identity_b02_digest_invalid"], identity: null }
  }
  const runtimeIdentity = runtime.deploymentIdentity
  const canonicalRuntimeIdentity = canonicalizeDeploymentIdentity(runtimeIdentity, { now })
  if (!canonicalRuntimeIdentity.ok) {
    if (canonicalRuntimeIdentity.errorCode === "deployment_identity_completed_in_future") {
      return { ready: false, blockers: [canonicalRuntimeIdentity.errorCode], identity: null }
    }
    return { ready: false, blockers: ["deployment_identity_b03_invalid"], identity: null }
  }
  if (imageDigest !== canonicalRuntimeIdentity.identity.imageDigest) {
    return { ready: false, blockers: ["deployment_identity_digest_mismatch"], identity: null }
  }
  return {
    ready: true,
    blockers: [],
    identity: Object.fromEntries(DEPLOYMENT_IDENTITY_FIELDS.map((field) => [field, canonicalRuntimeIdentity.identity[field]])),
  }
}

function expectedAppApiProbeScopes() {
  const scopes = new Map()
  for (const probe of PROBES) scopes.set(probe.scope, (scopes.get(probe.scope) || 0) + 1)
  return Object.fromEntries([...scopes.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function hasExactRecordValues(value, expected) {
  if (!isPlainObject(value)) return false
  const valueKeys = Object.keys(value).sort()
  const expectedKeys = Object.keys(expected).sort()
  return valueKeys.length === expectedKeys.length &&
    valueKeys.every((key, index) => key === expectedKeys[index] && value[key] === expected[key])
}

function safePostdeployMatches(report, deploymentGate, remoteIdentityGate) {
  const remoteResult = report?.steps?.remoteHealth?.result
  const appApiResult = report?.steps?.appApiSmoke?.result
  return {
    baseUrlMatchesExpected: report?.baseUrl === PRODUCTION_CN_APP_API_BASE_URL &&
      remoteResult?.baseUrl === PRODUCTION_CN_APP_API_BASE_URL &&
      appApiResult?.baseUrl === PRODUCTION_CN_APP_API_BASE_URL,
    probeSetIdMatchesExpected: appApiResult?.probeSetId === APP_API_SMOKE_PROBE_SET_ID,
    probeCountMatchesExpected: appApiResult?.checkedProbes === PROBES.length &&
      Array.isArray(appApiResult?.probes) &&
      appApiResult.probes.length === PROBES.length,
    deploymentIdentityMatchesExpected: deploymentGate?.ready === true &&
      remoteIdentityGate?.ready === true &&
      sameDeploymentIdentity(remoteIdentityGate.identity, deploymentGate.identity) &&
      sameDeploymentIdentity(report?.deploymentIdentity, remoteIdentityGate.identity),
  }
}

const POSTDEPLOY_REPORT_FIELDS = Object.freeze([
  "generatedAt",
  "baseUrl",
  "deploymentIdentity",
  "provenanceErrorCode",
  "allowedMissing",
  "ok",
  "steps",
  "outputFiles",
])
const POSTDEPLOY_STEP_FIELDS = Object.freeze(["ok", "status", "errorCode", "result"])
const REMOTE_HEALTH_RESULT_FIELDS = Object.freeze([
  "baseUrl",
  "allowedMissing",
  "provenanceErrorCode",
  "healthz",
  "health",
  "strictHealth",
])
const REMOTE_HEALTH_SUMMARY_FIELDS = Object.freeze([
  "status",
  "service",
  "env",
  "region",
  "mode",
  "checks",
  "ok",
  "missing",
  "observedDeploymentIdentity",
])
const PRODUCTION_HEALTH_CHECK_GROUPS = Object.freeze([
  "aliyunRds",
  "legalLinks",
  "aliyunOssRuntime",
  "bailianAsr",
  "serviceRecordSummary",
  "volcSpeech",
])
const PRODUCTION_HEALTH_METADATA = Object.freeze({
  service: "meiye-huajing-app-api",
  env: "production-cn",
  region: "cn-hangzhou",
  mode: "aliyun-production-cn",
})
const APP_API_RESULT_FIELDS = Object.freeze([
  "baseUrl",
  "probeSetId",
  "runtimePlan",
  "checkedProbes",
  "scopes",
  "probes",
])
const OUTPUT_FILE_FIELDS = Object.freeze([
  "remoteHealth",
  "appApiSmoke",
  "reportJson",
  "reportMarkdown",
])

function hasExactFields(value, fields) {
  if (!isPlainObject(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...fields].sort()
  return actual.length === expected.length && actual.every((field, index) => field === expected[index])
}

function remoteIdentityGate(report, now) {
  const remoteResult = report?.steps?.remoteHealth?.result
  return observeDeploymentIdentities([
    remoteResult?.healthz?.observedDeploymentIdentity,
    remoteResult?.health?.observedDeploymentIdentity,
    remoteResult?.strictHealth?.observedDeploymentIdentity,
  ], { now })
}

function validateProductionHealthSummary(health, healthKey, healthPath) {
  const blockers = []
  for (const [field, expected] of Object.entries(PRODUCTION_HEALTH_METADATA)) {
    if (health[field] !== expected) blockers.push(`${healthPath}.${field}`)
  }
  const checksValid = hasExactFields(health.checks, PRODUCTION_HEALTH_CHECK_GROUPS) &&
    PRODUCTION_HEALTH_CHECK_GROUPS.every((group) => typeof health.checks[group] === "boolean")
  if (!checksValid) {
    blockers.push(`${healthPath}.checks`)
    return blockers
  }
  const expectedMissing = PRODUCTION_HEALTH_CHECK_GROUPS.filter((group) => health.checks[group] === false)
  const missingMatches = Array.isArray(health.missing) &&
    health.missing.length === expectedMissing.length &&
    health.missing.every((group, index) => group === expectedMissing[index])
  if (!missingMatches) blockers.push(`${healthPath}.missing_consistency`)
  if (health.ok !== (expectedMissing.length === 0)) blockers.push(`${healthPath}.ok_consistency`)
  const expectedStatus = healthKey === "strictHealth" && expectedMissing.length > 0 ? 503 : 200
  if (health.status !== expectedStatus) blockers.push(`${healthPath}.status_consistency`)
  return blockers
}

export function validatePostdeploySmokeReport(report, options = {}) {
  const blockers = []
  const deploymentGate = options.deploymentGate
  let matches = safePostdeployMatches(report, deploymentGate, { ready: false, identity: null })
  const result = () => ({
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)].sort(),
    expectedBaseUrl: PRODUCTION_CN_APP_API_BASE_URL,
    expectedProbeSetId: APP_API_SMOKE_PROBE_SET_ID,
    expectedProbeCount: PROBES.length,
    ...matches,
  })

  if (!isPlainObject(report)) {
    blockers.push("report_not_object")
    return result()
  }
  if (findSecretLikeValues(report).length > 0) {
    blockers.push("report_sensitive_value")
    return result()
  }

  const now = validationClockMs(options.now ?? Date.now())
  if (now === null) {
    blockers.push("validation_clock_invalid")
    return result()
  }
  const observedIdentityGate = remoteIdentityGate(report, now)
  matches = safePostdeployMatches(report, deploymentGate, observedIdentityGate)
  if (!hasExactFields(report, POSTDEPLOY_REPORT_FIELDS)) blockers.push("report.schema")
  if (deploymentGate?.ready !== true) {
    blockers.push(...(
      Array.isArray(deploymentGate?.blockers) && deploymentGate.blockers.length > 0
        ? deploymentGate.blockers
        : ["deployment_identity_expected_unavailable"]
    ))
  } else {
    const expectedIdentity = canonicalizeDeploymentIdentity(deploymentGate.identity, { now })
    if (!expectedIdentity.ok) {
      blockers.push(expectedIdentity.errorCode === "deployment_identity_completed_in_future"
        ? expectedIdentity.errorCode
        : "deployment_identity_expected_invalid")
    }
  }
  if (!observedIdentityGate.ready) blockers.push(observedIdentityGate.errorCode)
  const reportIdentity = canonicalizeDeploymentIdentity(report.deploymentIdentity, { now })
  if (!reportIdentity.ok) {
    blockers.push(reportIdentity.errorCode === "deployment_identity_completed_in_future"
      ? reportIdentity.errorCode
      : "deployment_identity_report_invalid")
  }
  if (
    observedIdentityGate.ready &&
    reportIdentity.ok &&
    !sameDeploymentIdentity(reportIdentity.identity, observedIdentityGate.identity)
  ) {
    blockers.push("deployment_identity_report_not_observed")
  }
  if (
    deploymentGate?.ready === true &&
    observedIdentityGate.ready &&
    !sameDeploymentIdentity(observedIdentityGate.identity, deploymentGate.identity)
  ) {
    blockers.push("deployment_identity_mismatch")
  }

  if (report.ok !== true) blockers.push("report.ok")
  if (report.provenanceErrorCode !== null) blockers.push("report.provenanceErrorCode")
  if (report.baseUrl !== PRODUCTION_CN_APP_API_BASE_URL) blockers.push("report.baseUrl")
  if (!isEmptyArray(report.allowedMissing)) blockers.push("report.allowedMissing")
  const generatedAt = canonicalIsoTimestampMs(report.generatedAt)
  if (generatedAt === null) {
    blockers.push("report.generatedAt.invalid")
  } else if (generatedAt > now + 5 * 60_000) {
    blockers.push("report.generatedAt.future")
  } else if (now - generatedAt > 24 * 60 * 60_000) {
    blockers.push("report.generatedAt.stale")
  }
  if (
    generatedAt !== null &&
    observedIdentityGate.ready &&
    generatedAt < canonicalIsoTimestampMs(observedIdentityGate.identity.deploymentCompletedAt)
  ) {
    blockers.push("smoke_precedes_deployment")
  }

  if (!hasExactFields(report.steps, ["remoteHealth", "appApiSmoke"])) blockers.push("report.steps")
  if (
    !hasExactFields(report.outputFiles, OUTPUT_FILE_FIELDS) ||
    OUTPUT_FILE_FIELDS.some((field) => (
      typeof report.outputFiles?.[field] !== "string" || report.outputFiles[field].trim().length === 0
    ))
  ) {
    blockers.push("report.outputFiles")
  }

  const remoteHealth = report.steps?.remoteHealth
  if (!isPlainObject(remoteHealth)) {
    blockers.push("steps.remoteHealth")
  } else {
    if (!hasExactFields(remoteHealth, POSTDEPLOY_STEP_FIELDS)) blockers.push("steps.remoteHealth.schema")
    if (remoteHealth.ok !== true) blockers.push("steps.remoteHealth.ok")
    if (remoteHealth.status !== 0) blockers.push("steps.remoteHealth.status")
    if (remoteHealth.errorCode !== null) blockers.push("steps.remoteHealth.errorCode")
    const remoteResult = remoteHealth.result
    if (!isPlainObject(remoteResult)) {
      blockers.push("steps.remoteHealth.result")
    } else {
      if (!hasExactFields(remoteResult, REMOTE_HEALTH_RESULT_FIELDS)) {
        blockers.push("steps.remoteHealth.result.schema")
      }
      if (remoteResult.baseUrl !== PRODUCTION_CN_APP_API_BASE_URL) blockers.push("steps.remoteHealth.result.baseUrl")
      if (!isEmptyArray(remoteResult.allowedMissing)) blockers.push("steps.remoteHealth.result.allowedMissing")
      if (remoteResult.provenanceErrorCode !== null) blockers.push("steps.remoteHealth.result.provenanceErrorCode")
      for (const healthKey of ["healthz", "health", "strictHealth"]) {
        const health = remoteResult[healthKey]
        const healthPath = `steps.remoteHealth.result.${healthKey}`
        if (!isPlainObject(health)) {
          blockers.push(healthPath)
          continue
        }
        if (!hasExactFields(health, REMOTE_HEALTH_SUMMARY_FIELDS)) blockers.push(`${healthPath}.schema`)
        blockers.push(...validateProductionHealthSummary(health, healthKey, healthPath))
        if (health.status !== 200) blockers.push(`${healthPath}.status`)
        if (health.ok !== true) blockers.push(`${healthPath}.ok`)
        if (!isEmptyArray(health.missing)) blockers.push(`${healthPath}.missing`)
      }
    }
  }

  const appApiSmoke = report.steps?.appApiSmoke
  if (!isPlainObject(appApiSmoke)) {
    blockers.push("steps.appApiSmoke")
  } else {
    if (!hasExactFields(appApiSmoke, POSTDEPLOY_STEP_FIELDS)) blockers.push("steps.appApiSmoke.schema")
    if (appApiSmoke.ok !== true) blockers.push("steps.appApiSmoke.ok")
    if (appApiSmoke.status !== 0) blockers.push("steps.appApiSmoke.status")
    if (appApiSmoke.errorCode !== null) blockers.push("steps.appApiSmoke.errorCode")
    const appApiResult = appApiSmoke.result
    if (!isPlainObject(appApiResult)) {
      blockers.push("steps.appApiSmoke.result")
    } else {
      if (!hasExactFields(appApiResult, APP_API_RESULT_FIELDS)) blockers.push("steps.appApiSmoke.result.schema")
      if (appApiResult.baseUrl !== PRODUCTION_CN_APP_API_BASE_URL) blockers.push("steps.appApiSmoke.result.baseUrl")
      if (appApiResult.probeSetId !== APP_API_SMOKE_PROBE_SET_ID) blockers.push("steps.appApiSmoke.result.probeSetId")
      if (appApiResult.checkedProbes !== PROBES.length) blockers.push("steps.appApiSmoke.result.checkedProbes")
      const expectedRuntimePlan = {
        localMode: false,
        aliyunRdsReady: "not_checked_for_remote_base_url",
        localRdsUnavailableExpected: PROBES.filter((probe) => probe.runtimeExpectation === "local_rds_unavailable").length,
      }
      if (!hasExactRecordValues(appApiResult.runtimePlan, expectedRuntimePlan)) {
        blockers.push("steps.appApiSmoke.result.runtimePlan")
      }
      if (!hasExactRecordValues(appApiResult.scopes, expectedAppApiProbeScopes())) {
        blockers.push("steps.appApiSmoke.result.scopes")
      }
      if (!Array.isArray(appApiResult.probes)) {
        blockers.push("steps.appApiSmoke.result.probes")
      } else {
        if (appApiResult.probes.length !== PROBES.length) blockers.push("steps.appApiSmoke.result.probes.length")
        const expectedByKey = new Map(PROBES.map((probe) => [appApiProbeKey(probe), probe]))
        const expectedIndexByKey = new Map(PROBES.map((probe, index) => [appApiProbeKey(probe), index]))
        const observedKeys = new Set()
        for (const [probeIndex, probe] of appApiResult.probes.entries()) {
          if (!isPlainObject(probe)) {
            blockers.push(`steps.appApiSmoke.result.probes.item_shape:${probeIndex}`)
            continue
          }
          const key = appApiProbeKey(probe)
          const expectedProbe = expectedByKey.get(key)
          const expectedProbeFields = ["scope", "method", "path", "status", "code"]
          if (expectedProbe?.runtimeExpectation) expectedProbeFields.push("runtimeExpectation")
          if (!hasExactFields(probe, expectedProbeFields)) {
            blockers.push(`steps.appApiSmoke.result.probes.item_shape:${probeIndex}`)
          }
          if (
            typeof probe.scope !== "string" ||
            typeof probe.method !== "string" ||
            typeof probe.path !== "string" ||
            !Number.isInteger(probe.status) ||
            typeof probe.code !== "string"
          ) {
            blockers.push(`steps.appApiSmoke.result.probes.item_shape:${probeIndex}`)
          }
          if (observedKeys.has(key)) blockers.push(`steps.appApiSmoke.result.probes.duplicate:${probeIndex}`)
          observedKeys.add(key)
          if (!expectedProbe) {
            blockers.push(`steps.appApiSmoke.result.probes.unexpected:${probeIndex}`)
            continue
          }
          if (probe.scope !== expectedProbe.scope) blockers.push(`steps.appApiSmoke.result.probes.scope:${probeIndex}`)
          if (probe.method !== expectedProbe.method) blockers.push(`steps.appApiSmoke.result.probes.method:${probeIndex}`)
          if (probe.runtimeExpectation !== expectedProbe.runtimeExpectation) {
            blockers.push(`steps.appApiSmoke.result.probes.runtimeExpectation:${probeIndex}`)
          }
          const matchesExpected = expectedProbe.expected.some((expected) => (
            probe.status === expected.status && probe.code === expected.code
          ))
          if (!matchesExpected) blockers.push(`steps.appApiSmoke.result.probes.result:${probeIndex}`)
        }
        for (const key of expectedByKey.keys()) {
          if (!observedKeys.has(key)) {
            blockers.push(`steps.appApiSmoke.result.probes.missing:${expectedIndexByKey.get(key)}`)
          }
        }
      }
    }
  }

  return result()
}

function deploymentGateBlockers(deploymentGate) {
  if (deploymentGate?.ready === true) return []
  return Array.isArray(deploymentGate?.blockers) && deploymentGate.blockers.length > 0
    ? deploymentGate.blockers
    : ["deployment_identity_expected_unavailable"]
}

function readPostdeploySmokeReport(filePath, options = {}) {
  const identityBlockers = deploymentGateBlockers(options.deploymentGate)
  if (!existsSync(filePath)) {
    return {
      exists: false,
      ready: false,
      blockers: [...new Set(["file_missing", ...identityBlockers])].sort(),
      expectedBaseUrl: PRODUCTION_CN_APP_API_BASE_URL,
      expectedProbeSetId: APP_API_SMOKE_PROBE_SET_ID,
      expectedProbeCount: PROBES.length,
      baseUrlMatchesExpected: false,
      probeSetIdMatchesExpected: false,
      probeCountMatchesExpected: false,
      deploymentIdentityMatchesExpected: false,
    }
  }

  try {
    const report = JSON.parse(readFileSync(filePath, "utf8"))
    const validation = validatePostdeploySmokeReport(report, { deploymentGate: options.deploymentGate })
    return {
      exists: true,
      ...validation,
    }
  } catch {
    return {
      exists: true,
      ready: false,
      blockers: [...new Set(["invalid_json", ...identityBlockers])].sort(),
      expectedBaseUrl: PRODUCTION_CN_APP_API_BASE_URL,
      expectedProbeSetId: APP_API_SMOKE_PROBE_SET_ID,
      expectedProbeCount: PROBES.length,
      baseUrlMatchesExpected: false,
      probeSetIdMatchesExpected: false,
      probeCountMatchesExpected: false,
      deploymentIdentityMatchesExpected: false,
    }
  }
}

function isWritebackGroupReady(report, groupId) {
  return (report.writebackPlan?.groups || []).some((group) => group.id === groupId && group.ready === true)
}

function isImagePushAndDigestReady(report) {
  const sourceFreshness = report.local?.image?.sourceFreshness
  const acceptedFreshnessStatuses = new Set([
    "current",
    "current_non_runtime_dirty",
    "stale_non_runtime_source",
  ])
  return report.local?.ready === true &&
    isWritebackGroupReady(report, "imagePushAndDigest") &&
    sourceFreshness?.checked === true &&
    Array.isArray(sourceFreshness.blockers) &&
    sourceFreshness.blockers.length === 0 &&
    acceptedFreshnessStatuses.has(sourceFreshness.status)
}

function isSaeRuntimeImagePullReady(report) {
  return isWritebackGroupReady(report, "saeRuntimeImagePull")
}

function buildNextBackendOrder({ cloudInventory, backendTargets }) {
  const readyById = new Map((backendTargets || []).map((target) => [target.id, target.ready === true]))
  const steps = []
  if (!cloudInventory.strictReady) {
    steps.push("0. Restore Aliyun CLI/CloudShell read-only inventory evidence and write non-secret summaries only.")
  }
  if (!readyById.get("B01_RDS_POSTGRES_DATA_LAYER")) {
    steps.push("1. Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou and close Supabase-to-RDS migration evidence.")
  }
  if (!readyById.get("B05_OSS_RAM_STS")) {
    steps.push("2. Confirm OSS RAM/STS least-privilege runtime access.")
  }
  if (!readyById.get("B02_ACR_IMAGE_REGISTRY")) {
    steps.push("3. Configure SAE to use the verified ACR production-cn image and runtime image pull permission.")
  }
  if (!readyById.get("B06_ENV_IMPORT")) {
    steps.push("4. Import backend env through SAE/KMS/Secrets Manager, including DATABASE_URL_CN only as a secret env.")
  }
  if (!readyById.get("B03_SAE_RUNTIME")) {
    steps.push("5. Create SAE runtime with container port 3000 and /api/healthz.")
  }
  if (!readyById.get("B04_DOMAINS_HTTPS_ICP")) {
    steps.push("6. Bind api-cn/assets-cn DNS, HTTPS certificate, and ICP-compliant public access.")
  }
  if (!readyById.get("B07_SLS_ALERTS")) {
    steps.push("7. Configure SLS health and 5xx alerts.")
  }
  if (!readyById.get("B08_POSTDEPLOY_SMOKE")) {
    steps.push("8. Run backend health and APP API smoke tests against the formal Aliyun HTTPS domain.")
  }
  return steps
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

function currentEvidenceForTarget(id, { cloudConfirmations, imagePublishPlan, cloudInventoryResults, resourceMatrix, rdsMigration, postdeploySmoke }) {
  const cloudItems = cloudConfirmationItems(cloudConfirmations)
  const observation = cloudInventoryResults.local?.observationSummary || {}
  const resourceEvidence = evidenceForResourceRows(resourceMatrix, RESOURCE_EVIDENCE_BY_BACKEND_TARGET[id] || [])
  if (id === "B01_RDS_POSTGRES_DATA_LAYER") {
    return [
      `rdsLocalExists=${rdsMigration.local?.exists === true}`,
      `rdsLocalReady=${rdsMigration.local?.ready === true}`,
      `appApiRoutesWithSupabase=${rdsMigration.summary?.appApiRoutesWithSupabase || 0}/${rdsMigration.summary?.appApiRouteCount || 0}`,
      `firstVersionRdsRoutesWithSupabaseDataAccess=${rdsMigration.summary?.firstVersionRdsRoutesWithSupabaseDataAccess || 0}/${rdsMigration.summary?.firstVersionRdsRouteCount || 0}`,
      `postgresDataAccessAdapterDetected=${rdsMigration.summary?.postgresDataAccessAdapterDetected === true}`,
      rdsMigration.summary?.rdsMigrationPhaseReady ? `rdsMigrationPhaseReady=${rdsMigration.summary.rdsMigrationPhaseReady}` : "",
      Array.isArray(rdsMigration.summary?.rdsMigrationNextPhaseIds) && rdsMigration.summary.rdsMigrationNextPhaseIds.length
        ? `rdsMigrationNextPhaseIds=${rdsMigration.summary.rdsMigrationNextPhaseIds.join(",")}`
        : "",
      rdsMigration.summary?.rdsLocalReviewCanStartNow !== undefined
        ? `rdsLocalReviewCanStartNow=${rdsMigration.summary.rdsLocalReviewCanStartNow === true}`
        : "",
      rdsMigration.summary?.rdsCanStartP11AfterActionTimeConfirmation !== undefined
        ? `rdsCanStartP11AfterActionTimeConfirmation=${rdsMigration.summary.rdsCanStartP11AfterActionTimeConfirmation === true}`
        : "",
      rdsMigration.summary?.rdsCompatibilityReviewCanStartNow !== undefined
        ? `rdsCompatibilityReviewCanStartNow=${rdsMigration.summary.rdsCompatibilityReviewCanStartNow === true}`
        : "",
      rdsMigration.summary?.rdsSchemaApplyBlockedByCompatibilityReview !== undefined
        ? `rdsSchemaApplyBlockedByCompatibilityReview=${rdsMigration.summary.rdsSchemaApplyBlockedByCompatibilityReview === true}`
        : "",
      rdsMigration.rdsMigrationPlan?.executionReadiness?.nextOperatorDecision
        ? `rdsNextOperatorDecision=${rdsMigration.rdsMigrationPlan.executionReadiness.nextOperatorDecision}`
        : "",
      `inventoryNotFound=${(observation.notFoundOperationIds || []).includes("I08_RDS_POSTGRES")}`,
    ]
  }
  if (id === "B02_ACR_IMAGE_REGISTRY") {
    return [
      `imagePlanReady=${imagePublishPlan.ready === true || imagePublishPlan.local?.ready === true}`,
      `imagePushAndDigestReady=${isImagePushAndDigestReady(imagePublishPlan)}`,
      `saeRuntimeImagePullReady=${isSaeRuntimeImagePullReady(imagePublishPlan)}`,
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
  if (id === "B08_POSTDEPLOY_SMOKE") {
    return [
      `postdeploySmokeExists=${postdeploySmoke.exists}`,
      `postdeploySmokeReady=${postdeploySmoke.ready}`,
      `postdeploySmokeBlockers=${postdeploySmoke.blockers.join(",") || "none"}`,
      `expectedBaseUrl=${postdeploySmoke.expectedBaseUrl}`,
      `expectedAppApiSmokeProbeSetId=${postdeploySmoke.expectedProbeSetId}`,
      `expectedAppApiSmokeProbeCount=${postdeploySmoke.expectedProbeCount}`,
      `baseUrlMatchesExpected=${postdeploySmoke.baseUrlMatchesExpected}`,
      `probeSetIdMatchesExpected=${postdeploySmoke.probeSetIdMatchesExpected}`,
      `probeCountMatchesExpected=${postdeploySmoke.probeCountMatchesExpected}`,
      `deploymentIdentityMatchesExpected=${postdeploySmoke.deploymentIdentityMatchesExpected}`,
    ]
  }
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
      ...(row.currentEvidence || [])
        .slice(0, id === "R02_ACR_IMAGE_REGISTRY" ? 8 : 2)
        .map((item, index) => `${id}.currentEvidence${index + 1}=${item}`),
      ...(row.missingEvidence || []).slice(0, 3).map((item) => `${id}.missing=${item}`),
    ]
  })
}

function compactCredentialIntervention(report) {
  const summary = report.summary || {}
  const userIntervention = summary.userIntervention || {}
  const credentialBrief = report.credentialInterventionBrief || summary.credentialInterventionBrief || {}
  const blockedCredentialNames = uniqueStrings(
    credentialBrief.blockedCredentialNames ||
      userIntervention.blockedVariableNames ||
      [],
  ).sort()
  const readySecretEnvVariableNames = uniqueStrings(
    credentialBrief.readySecretEnvVariableNames ||
      userIntervention.readySecretEnvVariableNames ||
      [],
  ).sort()
  const actionTimeConfirmationRequiredIds = uniqueStrings(
    credentialBrief.actionTimeConfirmationRequiredIds ||
      userIntervention.actionTimeConfirmationRequired ||
      summary.actionTimeConfirmationRequired ||
      [],
  ).sort()
  const groups = (credentialBrief.groups || []).map((group) => ({
    category: group.category,
    actionId: group.actionId,
    status: group.status,
    owner: group.owner,
    type: group.type,
    blockedCredentialNames: group.blockedCredentialNames || [],
    readySecretEnvVariableNames: group.readySecretEnvVariableNames || [],
    variableNames: group.variableNames || [],
    obtainFrom: group.obtainFrom || "",
    importTargets: group.importTargets || [],
    writeTargets: group.writeTargets || [],
    requiresActionTimeConfirmation: group.requiresActionTimeConfirmation === true,
    verifyCommands: group.verifyCommands || [],
    unblockCondition: group.unblockCondition || "",
  }))
  return {
    canCodexProceedWithoutUser: credentialBrief.canCodexProceedWithoutUser === true,
    sensitiveActionBlockedIds: summary.blockedIds || [],
    actionTimeConfirmationRequiredIds,
    blockedCredentialNames,
    readySecretEnvVariableNames,
    interventionBreakdown: buildCredentialInterventionBreakdown({
      blockedCredentialNames,
      readySecretEnvVariableNames,
      actionTimeConfirmationRequiredIds,
      groups,
    }),
    valueHandlingRules: credentialBrief.valueHandlingRules || userIntervention.valueHandlingRules || [],
    forbiddenStorage: credentialBrief.forbiddenStorage || [],
    groups,
  }
}

function buildCredentialInterventionBreakdown({
  blockedCredentialNames,
  readySecretEnvVariableNames,
  actionTimeConfirmationRequiredIds,
  groups,
}) {
  return {
    missingCredentialValues: {
      count: blockedCredentialNames.length,
      names: blockedCredentialNames,
      actionIds: groups
        .filter((group) => group.blockedCredentialNames.length > 0)
        .map((group) => group.actionId),
    },
    readySecretsPendingCloudImport: {
      count: readySecretEnvVariableNames.length,
      names: readySecretEnvVariableNames,
      actionIds: groups
        .filter((group) => group.readySecretEnvVariableNames.length > 0)
        .map((group) => group.actionId),
    },
    actionTimeConfirmationRequired: {
      count: actionTimeConfirmationRequiredIds.length,
      actionIds: actionTimeConfirmationRequiredIds,
    },
    paidPurchaseConfirmationActionIds: groups
      .filter((group) => group.type === "paid_purchase_confirmation")
      .map((group) => group.actionId),
    controlledSecretChannelActionIds: groups
      .filter((group) => [
        "registry_password_or_runtime_pull_secret",
        "ram_secret_or_sts_import",
        "database_secret_and_migration",
        "ready_sensitive_env_need_cloud_import",
      ].includes(group.type))
      .map((group) => group.actionId),
  }
}

function buildBackendEvidenceScopeBreakdown({ cloudConfirmations, cloudResources, rdsMigration, imagePublish }) {
  const backendCloudConfirmationItemIds = [
    "runtime",
    "apiDomainHttps",
    "assetDomainHttps",
    "oss",
    "envImport",
    "slsAlerts",
  ]
  const cloudResourceEvidenceItemIds = [
    "R01_SAE_RUNTIME",
    "R02_ACR_IMAGE_REGISTRY",
    "R03_API_DOMAIN_HTTPS",
    "R04_ASSET_DOMAIN_HTTPS",
    "R05_OSS_AUDIO_STORAGE",
    "R06_ENV_IMPORT",
    "R07_SLS_ALERTS",
  ]
  const acrTrackedOutsideCloudConfirmations = cloudResources.blockedIds.includes("R02_ACR_IMAGE_REGISTRY") ||
    cloudResources.rows.some((row) => row.id === "R02_ACR_IMAGE_REGISTRY")
  return {
    summary: {
      currentScope: "backend_aliyun_only",
      cloudConfirmationsBackendReady: cloudConfirmations.backendReady,
      cloudResourceEvidenceReady: cloudResources.evidenceReady,
      acrTrackedOutsideCloudConfirmations,
      rdsMigrationEvidenceReady: rdsMigration.localReady === true,
      imagePublishEvidenceReady: imagePublish.imagePushAndDigestReady === true,
      deferredAppLaunchExcluded: true,
    },
    cloudConfirmationsBackendItems: backendCloudConfirmationItemIds,
    cloudResourceEvidenceItems: cloudResourceEvidenceItemIds,
    interpretation: [
      "cloudConfirmationsBackendReady tracks six Aliyun backend runtime confirmations: SAE, API domain, asset domain, OSS, env import, and SLS.",
      "cloudResourceEvidenceReady tracks those backend resources plus the ACR image registry evidence, so its denominator is seven.",
      "WeChat Open Platform mobile app, Apple Team ID, and Android release signing stay deferred after backend online and are not counted as current backend blockers.",
    ],
  }
}

function buildCredentialPasswordIntervention(credentialIntervention) {
  const breakdown = credentialIntervention.interventionBreakdown || {}
  const missingCredentialValues = breakdown.missingCredentialValues || { count: 0, names: [], actionIds: [] }
  const readySecretsPendingCloudImport = breakdown.readySecretsPendingCloudImport || { count: 0, names: [], actionIds: [] }
  const controlledSecretChannelActionIds = breakdown.controlledSecretChannelActionIds || []
  const paidPurchaseConfirmationActionIds = breakdown.paidPurchaseConfirmationActionIds || []
  const actionIds = uniqueStrings([
    ...(missingCredentialValues.actionIds || []),
    ...(readySecretsPendingCloudImport.actionIds || []),
    ...controlledSecretChannelActionIds,
    ...paidPurchaseConfirmationActionIds,
  ])
  return {
    required: actionIds.length > 0,
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
    userMustProvideOrConfirm: [
      "DATABASE_URL_CN must come from Aliyun RDS PostgreSQL after schema/data migration validation and must only enter KMS/Secrets Manager/SAE secret env.",
      "Ready local secret variables still need controlled Aliyun secret-env import; names can be reported, values must not be copied into JSON, Markdown, Docker images, git, chat, or shell history.",
      "ACR purchase and registry/runtime pull credentials require action-time confirmation; registry password or pull secret must stay in Docker credential helper, RAM/KMS/Secrets Manager, or Aliyun runtime secret settings.",
    ],
    forbiddenStorage: credentialIntervention.forbiddenStorage || [],
  }
}

function filterActionAuthorizationForEvidenceGaps(actionAuthorization, evidenceWriteback) {
  const activePacketIds = sortEvidencePackets([
    ...(evidenceWriteback.canStartNowPacketIds || []),
    ...(evidenceWriteback.blockedByDependencyPacketIds || []),
  ])
  const activePacketIdSet = new Set(activePacketIds)
  const keepActivePackets = (packetIds) => sortEvidencePackets((packetIds || []).filter((packetId) =>
    activePacketIdSet.has(packetId)
  ))
  const nextActionTimeConfirmationPacketIds = keepActivePackets(actionAuthorization.nextActionTimeConfirmationPacketIds)
  const canStartNowPackets = keepActivePackets(actionAuthorization.canStartNowPackets)
  const blockedByPacketDependencies = keepActivePackets(actionAuthorization.blockedByPacketDependencies)

  return {
    ...actionAuthorization,
    nextActionTimeConfirmationPacketIds,
    canStartNowPackets,
    blockedByPacketDependencies,
    nextActionTimeConfirmations: (actionAuthorization.nextActionTimeConfirmations || []).filter((packet) =>
      activePacketIdSet.has(packet.packetId)
    ),
  }
}

function compactActionAuthorization(report) {
  const summary = report.summary || {}
  const closure = report.authorizationClosureBrief || {}
  const packetById = new Map((report.authorizationPackets || []).map((packet) => [packet.packetId, packet]))
  const nextPacketIds = summary.nextActionTimeConfirmations || closure.canStartNowPackets || []
  return {
    currentScope: report.currentScope || summary.currentScope || "",
    canDeployNow: report.canDeployNow === true || closure.canDeployNow === true,
    canCodexProceedWithoutUser: closure.canCodexProceedWithoutUser === true,
    nextActionTimeConfirmationPacketIds: nextPacketIds,
    canStartNowPackets: summary.canStartNowPackets || closure.canStartNowPackets || [],
    blockedByPacketDependencies: summary.blockedByPacketDependencies || closure.blockedByPacketDependencies || [],
    actionTimeConfirmationRequired: summary.actionTimeConfirmationRequired || closure.actionTimeConfirmationRequired || [],
    deferredAppLaunchPackets: summary.deferredAppLaunchPackets || closure.deferredAppLaunchPackets || [],
    nextActionTimeConfirmations: nextPacketIds
      .map((packetId) => compactAuthorizationPacket(packetById.get(packetId)))
      .filter(Boolean),
  }
}

function compactAuthorizationPacket(packet) {
  if (!packet) return null
  return {
    packetId: packet.packetId,
    actionId: packet.actionId,
    title: packet.title,
    status: packet.status,
    owner: packet.owner,
    blockerClass: packet.blockerClass,
    sequenceGroup: packet.sequenceGroup,
    canStartNow: packet.canStartNow === true,
    requiresActionTimeConfirmation: packet.requiresActionTimeConfirmation === true,
    minimumUserPhrase: packet.minimumUserPhrase || "",
    allowedActions: packet.allowedActions || [],
    explicitlyExcluded: packet.explicitlyExcluded || [],
    completionEvidence: packet.completionEvidence || [],
    writeTargets: packet.writeTargets || [],
    verifyCommands: packet.verifyCommands || [],
    nonSecretEvidenceOnly: packet.nonSecretEvidenceOnly === true,
  }
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter((value) => typeof value === "string" && value.trim()))]
}

function compactCloudInventory(report) {
  const observation = report.local?.observationSummary || {}
  const failureCategories = observation.failureCategories || {}
  return {
    strictReady: report.local?.ready === true,
    readyLocalOperations: `${report.summary?.readyLocalOperations || 0}/${report.summary?.localOperations || 0}`,
    executedCommandResults: `${observation.executedCommandResults || 0}/${observation.commandResults || 0}`,
    mutationPerformedCommandResults: observation.mutationPerformedCommandResults || 0,
    failureCategories,
    failedOperationIds: observation.failedOperationIds || [],
    observedOperationIds: observation.observedOperationIds || [],
    notFoundOperationIds: observation.notFoundOperationIds || [],
    nextEvidenceAction: Object.keys(failureCategories).length
      ? "configure_aliyun_cli_profile_or_run_cloudshell_readonly_collector"
      : report.local?.ready === true
        ? "none"
        : "rerun_allowlisted_readonly_inventory",
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
    rdsMigrationPlanReady: report.summary?.rdsMigrationPlanReady === true,
    rdsMigrationPhaseReady: report.summary?.rdsMigrationPhaseReady || "0/5",
    rdsMigrationNextPhaseIds: report.summary?.rdsMigrationNextPhaseIds || [],
    rdsLocalReviewCanStartNow: report.summary?.rdsLocalReviewCanStartNow === true,
    blockers: report.local?.blockers || [],
    requiredAuthorizationPackets: report.summary?.requiredAuthorizationPackets || [],
  }
}

function compactImagePublish(report) {
  return {
    ready: report.ready === true || report.local?.ready === true,
    localReady: report.local?.ready === true,
    imagePushAndDigestReady: isImagePushAndDigestReady(report),
    saeRuntimeImagePullReady: isSaeRuntimeImagePullReady(report),
    writebackBlockingGroups: report.summary?.writebackBlockingGroups || [],
    requiredAuthorizationPackets: report.summary?.requiredAuthorizationPackets || [],
  }
}

function compactCloudConfirmations(report) {
  const localItems = cloudConfirmationItems(report)
  const backendKeys = ["runtime", "apiDomainHttps", "assetDomainHttps", "oss", "envImport", "slsAlerts"]
  const backendMissingItems = backendKeys.filter((key) => !localItems[key])
  const backendBlockers = backendKeys.flatMap((key) => {
    const item = localItems[key]
    if (!item) return [`${key}:missing_cloud_confirmation_item`]
    if (item.ready === true) return []
    const blockers = item.blockers || item.missing || []
    if (!blockers.length) return [`${key}:not_ready`]
    return blockers.map((blocker) => `${key}:${blocker}`)
  })
  return {
    backendReady: `${backendKeys.filter((key) => localItems[key]?.ready === true).length}/${backendKeys.length}`,
    backendMissingItems,
    backendBlockers,
    wechatExcludedBlockers: localItems.wechatOpenPlatform?.blockers || [],
  }
}

function buildEvidenceWritebackBrief({
  args,
  rdsMigration,
  cloudInventoryResults,
  cloudConfirmations,
  imagePublishPlan,
  actionAuthorization,
}) {
  const backendCloudConfirmations = buildBackendCloudConfirmationWritebackStatus(cloudConfirmations)
  const groups = [
    {
      key: "rdsMigration",
      file: args.rdsMigrationFile,
      ready: rdsMigration.local?.ready === true,
      gaps: rdsMigration.summary?.totalBlockers || rdsMigration.local?.blockers?.length || 0,
      requiredAuthorizationPackets: rdsMigration.summary?.requiredAuthorizationPackets || ["P11_ALIYUN_RDS_DATA_MIGRATION"],
      strictVerifyCommands: ["corepack pnpm aliyun:rds:migration:evidence:strict"],
    },
    {
      key: "cloudInventoryResults",
      file: args.cloudInventoryResultsFile,
      ready: cloudInventoryResults.local?.ready === true,
      gaps: cloudInventoryResults.local?.ready === true ? 0 : (cloudInventoryResults.local?.blockers || []).length,
      requiredAuthorizationPackets: cloudInventoryResults.local?.ready === true ? [] : ["P00_ALIYUN_READONLY_INVENTORY_IDENTITY"],
      strictVerifyCommands: ["corepack pnpm aliyun:cloud:inventory-results:strict"],
    },
    {
      key: "cloudConfirmations",
      file: args.cloudConfirmationsFile,
      ready: backendCloudConfirmations.ready,
      gaps: backendCloudConfirmations.gaps,
      requiredAuthorizationPackets: backendCloudConfirmations.requiredAuthorizationPackets,
      strictVerifyCommands: ["corepack pnpm aliyun:cloud:confirmations:strict"],
    },
    {
      key: "imagePublish",
      file: args.imagePublishFile,
      ready: imagePublishPlan.ready === true || imagePublishPlan.local?.ready === true,
      gaps: imagePublishPlan.writebackPlan?.totalBlockers || imagePublishPlan.summary?.totalBlockers || 0,
      requiredAuthorizationPackets: imagePublishPlan.summary?.requiredAuthorizationPackets || [],
      strictVerifyCommands: ["corepack pnpm aliyun:image:plan:strict"],
    },
  ]
  const totalGaps = groups.reduce((sum, group) => sum + group.gaps, 0)
  const readyFiles = groups.filter((group) => group.ready).length
  const openGroups = groups.filter((group) => group.gaps > 0 || group.ready !== true)
  const openRequiredPacketIds = sortEvidencePackets(uniqueStrings(openGroups.flatMap((group) =>
    group.requiredAuthorizationPackets || []
  )))
  const openRequiredPacketIdSet = new Set(openRequiredPacketIds)
  const authorizedPacketIds = sortEvidencePackets(actionAuthorization.canStartNowPackets || actionAuthorization.nextActionTimeConfirmationPacketIds || [])
  const canStartNowPacketIds = authorizedPacketIds.filter((packetId) => openRequiredPacketIdSet.has(packetId))
  const canStartNowPacketIdSet = new Set(canStartNowPacketIds)
  const blockedByDependencyPacketIds = openRequiredPacketIds.filter((packetId) => !canStartNowPacketIdSet.has(packetId))
  return {
    ready: totalGaps === 0,
    evidenceWritebackReady: `${readyFiles}/${groups.length}`,
    totalGaps,
    gapSummary: {
      rdsMigrationGaps: groups.find((group) => group.key === "rdsMigration")?.gaps || 0,
      cloudInventoryResultGaps: groups.find((group) => group.key === "cloudInventoryResults")?.gaps || 0,
      cloudConfirmationGaps: groups.find((group) => group.key === "cloudConfirmations")?.gaps || 0,
      imagePublishGaps: groups.find((group) => group.key === "imagePublish")?.gaps || 0,
    },
    canStartNowPacketIds,
    blockedByDependencyPacketIds,
    secretOrCredentialPacketIds: openRequiredPacketIds.filter((packetId) =>
      EVIDENCE_WRITEBACK_SECRET_OR_CREDENTIAL_PACKET_IDS.has(packetId)
    ),
    writeTargets: groups.map((group) => group.file).filter(Boolean),
    groupStatus: groups.map((group) => ({
      key: group.key,
      ready: group.ready === true,
      gaps: group.gaps,
      requiredAuthorizationPackets: group.requiredAuthorizationPackets || [],
      strictVerifyCommands: group.strictVerifyCommands || [],
    })),
    strictVerifyCommands: uniqueStrings(groups.flatMap((group) => group.strictVerifyCommands)),
  }
}

function buildBackendCloudConfirmationWritebackStatus(cloudConfirmations) {
  if (cloudConfirmations.local?.ready === true) {
    return {
      ready: true,
      gaps: 0,
      requiredAuthorizationPackets: [],
    }
  }

  const localBlockers = cloudConfirmations.local?.blockers || []
  const backendBlockers = localBlockers.filter((blocker) =>
    BACKEND_CLOUD_CONFIRMATION_KEYS.some((key) => String(blocker || "").startsWith(`${key}:`))
  )
  if (backendBlockers.length > 0) {
    return {
      ready: false,
      gaps: backendBlockers.length,
      requiredAuthorizationPackets: packetsForCloudConfirmationBlockers(backendBlockers),
    }
  }

  const localItems = cloudConfirmationItems(cloudConfirmations)
  const missingOrUnreadyKeys = BACKEND_CLOUD_CONFIRMATION_KEYS.filter((key) => localItems[key]?.ready !== true)
  return {
    ready: false,
    gaps: missingOrUnreadyKeys.length,
    requiredAuthorizationPackets: uniqueStrings(missingOrUnreadyKeys.flatMap((key) =>
      BACKEND_CLOUD_CONFIRMATION_PACKETS_BY_KEY[key] || []
    )),
  }
}

function cloudConfirmationItems(report) {
  const items = report.local?.items
  if (items && typeof items === "object" && !Array.isArray(items)) return items

  const itemStatus = report.local?.itemStatus
  if (!itemStatus || typeof itemStatus !== "object" || Array.isArray(itemStatus)) return {}

  return Object.fromEntries(Object.entries(itemStatus).map(([key, status]) => [
    key,
    {
      ready: status?.ready === true,
      blockers: Array.isArray(status?.blockers) ? status.blockers : [],
    },
  ]))
}

function packetsForCloudConfirmationBlockers(blockers) {
  return uniqueStrings(blockers.flatMap((blocker) => {
    const key = String(blocker || "").split(":")[0]
    return BACKEND_CLOUD_CONFIRMATION_PACKETS_BY_KEY[key] || []
  }))
}

function sortEvidencePackets(packetIds) {
  return uniqueStrings(packetIds).sort((left, right) =>
    evidencePacketSortIndex(left) - evidencePacketSortIndex(right)
  )
}

function evidencePacketSortIndex(packetId) {
  const index = EVIDENCE_WRITEBACK_PACKET_ORDER.indexOf(packetId)
  return index === -1 ? EVIDENCE_WRITEBACK_PACKET_ORDER.length : index
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
    `- childCommandTimeoutMs: ${report.childCommands.timeoutMs}`,
    `- childCommandFailureMode: ${report.childCommands.failureMode}`,
    `- backendRequiredBlocking: ${report.summary.backendRequiredBlocking.join(", ") || "none"}`,
    `- wechatDeferredBlocking: ${report.summary.wechatDeferredBlocking.join(", ")}`,
    "",
    "## Cloud Confirmations",
    "",
    `- backendReady: ${report.cloudConfirmations.backendReady}`,
    `- backendMissingItems: ${report.cloudConfirmations.backendMissingItems.join(", ") || "none"}`,
    `- backendBlockers: ${report.cloudConfirmations.backendBlockers.join(", ") || "none"}`,
    `- wechatExcludedBlockers: ${report.cloudConfirmations.wechatExcludedBlockers.join(", ") || "none"}`,
    "",
    "## Cloud Inventory",
    "",
    `- strictReady: ${report.cloudInventory.strictReady}`,
    `- readyLocalOperations: ${report.cloudInventory.readyLocalOperations}`,
    `- executedCommandResults: ${report.cloudInventory.executedCommandResults}`,
    `- mutationPerformedCommandResults: ${report.cloudInventory.mutationPerformedCommandResults}`,
    `- failureCategories: ${Object.keys(report.cloudInventory.failureCategories).length ? JSON.stringify(report.cloudInventory.failureCategories) : "none"}`,
    `- failedOperationIds: ${report.cloudInventory.failedOperationIds.join(", ") || "none"}`,
    `- nextEvidenceAction: ${report.cloudInventory.nextEvidenceAction}`,
    "",
    "## Evidence Writeback",
    "",
    `- evidenceWritebackReady: ${report.evidenceWriteback.evidenceWritebackReady}`,
    `- totalGaps: ${report.evidenceWriteback.totalGaps}`,
    `- rdsMigrationGaps: ${report.evidenceWriteback.gapSummary.rdsMigrationGaps}`,
    `- cloudInventoryResultGaps: ${report.evidenceWriteback.gapSummary.cloudInventoryResultGaps}`,
    `- cloudConfirmationGaps: ${report.evidenceWriteback.gapSummary.cloudConfirmationGaps}`,
    `- imagePublishGaps: ${report.evidenceWriteback.gapSummary.imagePublishGaps}`,
    `- canStartNowPacketIds: ${report.evidenceWriteback.canStartNowPacketIds.join(", ") || "none"}`,
    `- blockedByDependencyPacketIds: ${report.evidenceWriteback.blockedByDependencyPacketIds.join(", ") || "none"}`,
    `- secretOrCredentialPacketIds: ${report.evidenceWriteback.secretOrCredentialPacketIds.join(", ") || "none"}`,
    `- writeTargets: ${report.evidenceWriteback.writeTargets.join(", ") || "none"}`,
    ...report.evidenceWriteback.groupStatus.map((group) =>
      `- ${group.key}: ready=${group.ready}; gaps=${group.gaps}; packets=${group.requiredAuthorizationPackets.join(", ") || "none"}`
    ),
    "",
    "## Evidence Scope Breakdown",
    "",
    `- cloudConfirmationsBackendReady: ${report.backendEvidenceScopeBreakdown.summary.cloudConfirmationsBackendReady}`,
    `- cloudResourceEvidenceReady: ${report.backendEvidenceScopeBreakdown.summary.cloudResourceEvidenceReady}`,
    `- acrTrackedOutsideCloudConfirmations: ${report.backendEvidenceScopeBreakdown.summary.acrTrackedOutsideCloudConfirmations}`,
    `- deferredAppLaunchExcluded: ${report.backendEvidenceScopeBreakdown.summary.deferredAppLaunchExcluded}`,
    `- interpretation: ${report.backendEvidenceScopeBreakdown.interpretation.join(" ")}`,
    "",
    "## Structured Postdeploy Smoke",
    "",
    `- exists: ${report.postdeploySmoke.exists}`,
    `- ready: ${report.postdeploySmoke.ready}`,
    `- blockers: ${report.postdeploySmoke.blockers.join(", ") || "none"}`,
    `- expectedBaseUrl: ${report.postdeploySmoke.expectedBaseUrl}`,
    `- expectedProbeSetId: ${report.postdeploySmoke.expectedProbeSetId}`,
    `- expectedProbeCount: ${report.postdeploySmoke.expectedProbeCount}`,
    `- baseUrlMatchesExpected: ${report.postdeploySmoke.baseUrlMatchesExpected}`,
    `- probeSetIdMatchesExpected: ${report.postdeploySmoke.probeSetIdMatchesExpected}`,
    `- probeCountMatchesExpected: ${report.postdeploySmoke.probeCountMatchesExpected}`,
    `- deploymentIdentityMatchesExpected: ${report.postdeploySmoke.deploymentIdentityMatchesExpected}`,
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
    "## Action-Time Authorization Packets",
    "",
    `- nextActionTimeConfirmationPacketIds: ${report.actionAuthorization.nextActionTimeConfirmationPacketIds.join(", ") || "none"}`,
    `- canStartNowPackets: ${report.actionAuthorization.canStartNowPackets.join(", ") || "none"}`,
    `- blockedByPacketDependencies: ${report.actionAuthorization.blockedByPacketDependencies.join(", ") || "none"}`,
    ...report.actionAuthorization.nextActionTimeConfirmations.flatMap((packet) => [
      `- ${packet.packetId}: ${packet.title}`,
      `  - owner: ${packet.owner}`,
      `  - minimumUserPhrase: ${packet.minimumUserPhrase}`,
      `  - verifyCommands: ${packet.verifyCommands.join("; ") || "none"}`,
    ]),
    "",
    "## Credential Intervention",
    "",
    `- blockedCredentialNames: ${report.credentialIntervention.blockedCredentialNames.join(", ") || "none"}`,
    `- readySecretEnvVariableCount: ${report.credentialIntervention.readySecretEnvVariableNames.length}`,
    `- actionTimeConfirmationRequiredIds: ${report.credentialIntervention.actionTimeConfirmationRequiredIds.join(", ") || "none"}`,
    `- missingCredentialValues: ${report.credentialIntervention.interventionBreakdown.missingCredentialValues.names.join(", ") || "none"}`,
    `- readySecretsPendingCloudImport: ${report.credentialIntervention.interventionBreakdown.readySecretsPendingCloudImport.count}`,
    `- paidPurchaseConfirmationActionIds: ${report.credentialIntervention.interventionBreakdown.paidPurchaseConfirmationActionIds.join(", ") || "none"}`,
    `- controlledSecretChannelActionIds: ${report.credentialIntervention.interventionBreakdown.controlledSecretChannelActionIds.join(", ") || "none"}`,
    ...report.credentialIntervention.groups.flatMap((group) => [
      `- ${group.actionId}: ${group.category}; status=${group.status}; obtainFrom=${group.obtainFrom}; importTargets=${group.importTargets.join(", ") || "none"}`,
    ]),
    "",
    "## Credential / Password Intervention",
    "",
    `- required: ${report.credentialPasswordIntervention.required}`,
    `- missingCredentialValues: ${report.credentialPasswordIntervention.missingCredentialValues.names.join(", ") || "none"}`,
    `- readySecretsPendingCloudImport: ${report.credentialPasswordIntervention.readySecretsPendingCloudImport.count}`,
    `- paidPurchaseConfirmationActionIds: ${report.credentialPasswordIntervention.paidPurchaseConfirmationActionIds.join(", ") || "none"}`,
    `- controlledSecretChannelActionIds: ${report.credentialPasswordIntervention.controlledSecretChannelActionIds.join(", ") || "none"}`,
    ...report.credentialPasswordIntervention.userMustProvideOrConfirm.map((item) => `- ${item}`),
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
  for (const [index, [key, nested]] of Object.entries(value).entries()) {
    const safePath = `${path}.*[${index}]`
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(key))) matches.push(safePath)
    matches.push(...findSecretLikeValues(nested, safePath))
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
    "  node scripts/summarize-aliyun-backend-cn-status.mjs [--out path] [--markdown path] [--child-timeout-ms 120000]",
    "    [--env-file path] [--cloud-confirmations path] [--cloud-inventory-results path] [--rds-migration path] [--image-publish path]",
    "    [--postdeploy-smoke deploy/aliyun-production-cn.postdeploy-smoke.local.json]",
    "",
    "Summarizes the current backend-only Aliyun production-cn readiness.",
    "WeChat Open Platform mobile app blockers are explicitly deferred from this backend-only scope.",
    "B08 reads only the standard postdeploy-smoke.json written by run-aliyun-postdeploy-smoke.mjs; a missing or invalid report stays blocked.",
    "Child status commands are bounded and fail closed; this command does not create, modify, deploy, or import secrets.",
  ].join("\n"))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
