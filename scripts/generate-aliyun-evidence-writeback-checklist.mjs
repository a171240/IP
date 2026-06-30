#!/usr/bin/env node

import { writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { buildImportPlan, parseEnvFile } from "./prepare-aliyun-runtime-env.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const DEFAULT_CLOUD_INVENTORY_RESULTS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-inventory-results.local.json")
const DEFAULT_RDS_MIGRATION_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.rds-migration.local.json")
const DEFAULT_IMAGE_PUBLISH_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.image-publish.local.json")
const DEFAULT_CHILD_TIMEOUT_MS = 120_000
const READONLY_INVENTORY_AUTH_PACKET = "P00_ALIYUN_READONLY_INVENTORY_IDENTITY"
const BACKEND_BASE_CAN_START_PACKET_IDS = Object.freeze([
  "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
  "P11_ALIYUN_RDS_DATA_MIGRATION",
  "P05_OSS_RAM_STS",
])
const BACKEND_DEFERRED_APP_LAUNCH_PACKET_IDS = Object.freeze([
  "P01_WECHAT_OPEN_MOBILE_APP",
  "P10_ANDROID_RELEASE_SIGNING",
  "P02_APPLE_TEAM_ID",
])
const SECRET_OR_CREDENTIAL_PACKET_IDS = new Set([
  "P01_WECHAT_OPEN_MOBILE_APP",
  "P05_OSS_RAM_STS",
  "P06_ENV_IMPORT",
  "P10_ANDROID_RELEASE_SIGNING",
  "P11_ALIYUN_RDS_DATA_MIGRATION",
])
const WRITEBACK_PACKET_ORDER = Object.freeze([
  "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
  "P11_ALIYUN_RDS_DATA_MIGRATION",
  "P05_OSS_RAM_STS",
  "P03_ACR_PURCHASE",
  "P04_ACR_IMAGE_AND_PULL",
  "P06_ENV_IMPORT",
  "P07_DOMAIN_DNS_HTTPS",
  "P08_SAE_RUNTIME_SLS",
  "P09_PRODUCTION_DEPLOY",
  "P01_WECHAT_OPEN_MOBILE_APP",
  "P10_ANDROID_RELEASE_SIGNING",
  "P02_APPLE_TEAM_ID",
])

const STRICT_VERIFICATION_ORDER = Object.freeze([
  "corepack pnpm aliyun:rds:migration:evidence:strict",
  "corepack pnpm aliyun:cloud:inventory-results:strict",
  "corepack pnpm aliyun:cloud:confirmations:strict",
  "corepack pnpm aliyun:image:plan:strict",
  "corepack pnpm aliyun:domain:strict",
  "corepack pnpm aliyun:readiness:cloud-ready",
  "corepack pnpm aliyun:completion:audit",
  "corepack pnpm aliyun:predeploy",
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
  /(password|passwd|pwd|token|secret|access[_-]?key)\s*[:=]\s*[^,\s]{8,}/i,
]

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    cloudInventoryResultsFile: DEFAULT_CLOUD_INVENTORY_RESULTS_FILE,
    rdsMigrationFile: DEFAULT_RDS_MIGRATION_FILE,
    imagePublishFile: DEFAULT_IMAGE_PUBLISH_FILE,
    outPath: "",
    markdownPath: "",
    skipVercelEnvCoverage: false,
    vercelEnvCoverageInput: "",
    backendOnly: false,
    childTimeoutMs: DEFAULT_CHILD_TIMEOUT_MS,
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
    if (arg === "--out") {
      args.outPath = resolveValue(argv[++index], "--out")
      continue
    }
    if (arg === "--markdown") {
      args.markdownPath = resolveValue(argv[++index], "--markdown")
      continue
    }
    if (arg === "--skip-vercel-env-coverage") {
      args.skipVercelEnvCoverage = true
      continue
    }
    if (arg === "--backend-only") {
      args.backendOnly = true
      continue
    }
    if (arg === "--child-timeout-ms") {
      args.childTimeoutMs = parsePositiveInteger(argv[++index], "--child-timeout-ms")
      continue
    }
    if (arg === "--vercel-env-coverage-input") {
      args.vercelEnvCoverageInput = resolveValue(argv[++index], "--vercel-env-coverage-input")
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

function parsePositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`invalid_positive_integer:${name}`)
  return parsed
}

function summarizeChildOutput(value) {
  return String(value || "").split(/\r?\n/).filter(Boolean).slice(0, 8).join(" | ")
}

function runJson(label, scriptArgs, args) {
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
    timeout: args.childTimeoutMs,
  })
  if (result.error) {
    const code = result.error.code || "spawn_error"
    const summary = summarizeChildOutput(result.stderr || result.stdout)
    throw new Error(`${label}_failed:${code}${summary ? `\n${summary}` : ""}`)
  }
  if (result.status !== 0) {
    throw new Error(`${label}_failed:${result.status}\n${summarizeChildOutput(result.stderr || result.stdout)}`)
  }
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`invalid_json_from_${label}:${error instanceof Error ? error.message : String(error)}`)
  }
}

const BACKEND_ONLY_RESOURCE_EVIDENCE_IDS = Object.freeze([
  "R01_SAE_RUNTIME",
  "R02_ACR_IMAGE_REGISTRY",
  "R03_API_DOMAIN_HTTPS",
  "R04_ASSET_DOMAIN_HTTPS",
  "R05_OSS_AUDIO_STORAGE",
  "R06_ENV_IMPORT",
  "R07_SLS_ALERTS",
])

const BACKEND_ONLY_READY_SECRET_ENV_VARIABLE_NAMES = Object.freeze([
  "ADMIN_USER_IDS",
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "APIMART_API_KEY",
  "CREDITS_IP_SALT",
  "DASHSCOPE_API_KEY",
  "DEEPSEEK_API_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SERVICE_RECORD_DEEPSEEK_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VOLC_SPEECH_ACCESS_TOKEN",
  "VOLC_SPEECH_APP_ID",
  "VOLC_SPEECH_SECRET_KEY",
  "WECHAT_LOGIN_SECRET",
  "WECHAT_MINI_APPID",
  "WECHAT_MINI_SECRET",
])

function buildOperatorHandoff(args) {
  if (args.backendOnly) return buildBackendOnlyOperatorHandoff(args)
  return runJson("operator_handoff", [
    "scripts/generate-aliyun-operator-handoff.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
    "--cloud-inventory-results",
    args.cloudInventoryResultsFile,
    ...(args.skipVercelEnvCoverage ? ["--skip-vercel-env-coverage"] : []),
    ...(args.backendOnly ? ["--backend-only"] : []),
    "--child-timeout-ms",
    String(args.childTimeoutMs),
    ...(args.vercelEnvCoverageInput ? ["--vercel-env-coverage-input", args.vercelEnvCoverageInput] : []),
  ], args)
}

function buildBackendOnlyOperatorHandoff(args) {
  const cloudInventoryResults = runJson("cloud_inventory_results", [
    "scripts/check-aliyun-cli-inventory-results.mjs",
    "--allow-incomplete",
    "--local",
    args.cloudInventoryResultsFile,
  ], args)
  const cloudConfirmations = runJson("cloud_confirmations", [
    "scripts/check-aliyun-cloud-confirmations.mjs",
    "--backend-only",
    "--allow-incomplete",
    "--local",
    args.cloudConfirmationsFile,
  ], args)
  const imagePublishPlan = runJson("image_publish_plan", [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--allow-incomplete",
    "--local",
    args.imagePublishFile,
    "--skip-docker-probe",
  ], args)
  const envPlan = buildImportPlan(parseEnvFile(args.envFile))
  const canDeployNow = cloudInventoryResults.local?.ready === true
    && cloudConfirmations.local?.ready === true
    && imagePublishPlan.local?.ready === true
  return {
    generatedAt: new Date().toISOString(),
    currentScope: "backend_aliyun_only",
    containsValues: false,
    canDeployNow,
    verdict: canDeployNow ? "ready" : "blocked",
    operatorClosureBrief: buildBackendOnlyOperatorClosureBrief(envPlan),
    localEvidenceGaps: {
      cloudInventoryResults: {
        file: cloudInventoryResults.local?.file || args.cloudInventoryResultsFile,
        exists: cloudInventoryResults.local?.exists === true,
        ready: cloudInventoryResults.local?.ready === true,
        checkedOperations: cloudInventoryResults.local?.checkedOperations || 0,
        observationSummary: cloudInventoryResults.local?.observationSummary || null,
        totalBlockers: (cloudInventoryResults.local?.blockers || []).length,
        gaps: buildCloudInventoryResultGaps(cloudInventoryResults),
      },
      cloudConfirmations: {
        file: cloudConfirmations.local?.file || args.cloudConfirmationsFile,
        exists: cloudConfirmations.local?.exists === true,
        ready: cloudConfirmations.local?.ready === true,
        totalBlockers: (cloudConfirmations.local?.blockers || []).length,
        gaps: buildCloudConfirmationGaps(cloudConfirmations),
      },
      imagePublish: {
        file: imagePublishPlan.local?.file || resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.image-publish.local.json"),
        exists: imagePublishPlan.local?.exists === true,
        ready: imagePublishPlan.local?.ready === true,
        totalBlockers: (imagePublishPlan.local?.blockers || []).length,
        localDockerImage: imagePublishPlan.localDockerImage?.status || "unknown",
        gaps: buildImagePublishGaps(imagePublishPlan),
      },
    },
  }
}

function buildBackendOnlyOperatorClosureBrief(envPlan) {
  const blockedCredentialNames = envPlan.summary.requiredBlocking.includes("DATABASE_URL_CN")
    ? ["DATABASE_URL_CN"]
    : []
  const readySecretEnvVariableNames = BACKEND_ONLY_READY_SECRET_ENV_VARIABLE_NAMES
    .filter((name) => variableByName(envPlan.variables, name)?.status === "ready")
  return {
    blockedCredentialCount: blockedCredentialNames.length,
    blockedCredentialNames,
    readySecretEnvVariableCount: readySecretEnvVariableNames.length,
    readySecretEnvVariableNames,
    credentialGroups: [
      {
        category: "rds_database_secret_and_migration",
        actionId: "S08_ALIYUN_RDS_DATABASE_URL",
        status: "blocked",
        blockedCredentialNames,
        readySecretEnvVariableNames: [],
        obtainFrom: "阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env",
        writeTargets: [
          "DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only",
          "deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence",
        ],
        verifyCommands: ["corepack pnpm aliyun:rds:migration:evidence:strict"],
      },
    ],
    resourceEvidenceReady: `0/${BACKEND_ONLY_RESOURCE_EVIDENCE_IDS.length}`,
    blockedResourceEvidenceIds: [...BACKEND_ONLY_RESOURCE_EVIDENCE_IDS],
    blockedResourceEvidence: BACKEND_ONLY_RESOURCE_EVIDENCE_IDS.map((id) => ({
      id,
      observedStatus: "pending_backend_evidence",
      observedReadiness: "blocked",
      currentEvidence: [],
      missingEvidence: [],
      writeTargets: [],
      nextEvidenceAction: "补齐对应阿里云后端非密钥证据后重新运行 evidence writeback。",
    })),
  }
}

function variableByName(variables, name) {
  return (variables || []).find((item) => item.name === name) || null
}

function buildCloudInventoryResultGaps(cloudInventoryResults) {
  return (cloudInventoryResults.local?.blockers || []).map((blocker) => ({
    jsonPath: cloudInventoryResultJsonPath(blocker),
    blocker,
    source: "阿里云 CLI 或 Cloud Shell 只读资源盘点",
    writeTo: "deploy/aliyun-production-cn.cloud-inventory-results.local.json",
    expected: expectedCloudInventoryResultEvidence(blocker),
    forbidden: [
      "AccessKeySecret",
      "AppSecret",
      "registry password",
      "RAM Secret",
      "token",
      "cookie",
      "证书私钥",
      "Supabase service role key",
    ],
  }))
}

function cloudInventoryResultJsonPath(blocker) {
  const value = String(blocker || "")
  if (value === "file_missing") return "$"
  if (value.startsWith("readonly_inventory_") || value === "console_only_observation_not_strict_inventory") {
    return "operations[*].commandResults[*]"
  }
  const operation = value.match(/^(I\d{2}_[A-Z0-9_]+):/)
  if (operation) return `operations.${operation[1]}`
  const missingOperation = value.match(/^missing_operation:(I\d{2}_[A-Z0-9_]+)$/)
  if (missingOperation) return `operations.${missingOperation[1]}`
  return "$"
}

function expectedCloudInventoryResultEvidence(blocker) {
  if (blocker === "file_missing") {
    return "复制 deploy/aliyun-production-cn.cloud-inventory-results.example.json 到 ignored 的 .local.json；在 CLI/Cloud Shell 只读盘点后只填写 executed、exitStatus、cloudApiCalled、mutationPerformed=false、observedAt、outputSummary 和非密钥 evidence。"
  }
  if (String(blocker || "").startsWith("readonly_inventory_") || blocker === "console_only_observation_not_strict_inventory") {
    return "运行受控只读 inventory，并只写 executed、exitStatus、cloudApiCalled、mutationPerformed=false、observedAt、outputSummary 和非密钥 evidence。"
  }
  return "补齐对应只读盘点项的非密钥摘要；不能粘贴凭据、token、registry password、证书私钥或 cookie。"
}

function buildCloudConfirmationGaps(check) {
  const itemStatus = check.local?.itemStatus || {}
  return Object.entries(itemStatus).flatMap(([key, status]) => (status.blockers || []).map((blocker) => ({
    jsonPath: `items.${key}.${fieldFromBlocker(blocker)}`,
    blocker,
    source: cloudConfirmationSource(key),
    writeTo: `deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.${key}`,
    expected: expectedCloudEvidence(key, blocker),
    forbidden: [
      "AccessKeySecret",
      "AppSecret",
      "registry password",
      "RAM Secret",
      "STS token",
      "cookie",
      "证书私钥",
      "Supabase service role key",
    ],
  })))
}

function fieldFromBlocker(blocker) {
  const value = String(blocker || "")
  const prefixed = value.match(/^(?:missing|todo|placeholder|empty):(.+)$/)
  if (prefixed) return prefixed[1]
  const expected = value.match(/^([^=]+)=/)
  if (expected) return expected[1]
  return value
}

function cloudConfirmationSource(key) {
  if (key === "runtime") return "阿里云控制台 -> SAE -> meiye-huajing-app-api-production-cn"
  if (key === "apiDomainHttps") return "阿里云控制台 -> 云解析 DNS / SAE 自定义域名 / SSL / ICP"
  if (key === "assetDomainHttps") return "阿里云控制台 -> 云解析 DNS / CDN 或 OSS 域名 / SSL / ICP"
  if (key === "oss") return "阿里云控制台 -> OSS / RAM / STS / SAE runtime role"
  if (key === "envImport") return "阿里云控制台 -> SAE 环境变量 / KMS / Secrets Manager"
  if (key === "slsAlerts") return "阿里云控制台 -> 日志服务 SLS / 告警"
  return "对应阿里云控制台"
}

function expectedCloudEvidence(key, blocker) {
  const field = fieldFromBlocker(blocker)
  const expectedByField = {
    confirmed: "确认完成后填 true。",
    dnsResolvedToAliyun: "域名已解析到阿里云公网入口后填 true。",
    httpsEnabled: "HTTPS 证书已启用并可访问后填 true。",
    icpReady: "备案状态满足国内正式访问要求后填 true。",
    corsConfigured: "OSS CORS 已按 APP 上传/下载需求配置后填 true。",
    ramLeastPrivilege: "RAM 权限已限制到服务记录前缀后填 true。",
    bucket: "填实际 OSS Bucket 名称或控制台证据编号。",
    importedAt: "填实际导入 production-cn env 的时间或控制台证据编号。",
    evidence: "填控制台路径、截图编号、工单号或其它非密钥证据编号。",
    region: "填 cn-hangzhou；当前 production-cn 运行时、ACR 和 OSS 证据必须使用同一目标地域。",
    slsProject: "填实际 SLS Project 名称或控制台证据编号。",
    secretNotInImage: "确认密钥只在 SAE/KMS/Secrets Manager 中，未写入镜像后填 true。",
  }
  if (expectedByField[field]) return expectedByField[field]
  if (key === "runtime") return "按 runtime plan 填 SAE cn-hangzhou 应用、端口和健康检查证据。"
  return "填真实非密钥控制台证据，不能保留 TODO、pending 或 TBD 占位值。"
}

function buildImagePublishGaps(imagePublishPlan) {
  return (imagePublishPlan.local?.blockers || []).map((blocker) => ({
    jsonPath: fieldFromImageBlocker(blocker),
    blocker,
    source: imagePublishGapSource(blocker),
    writeTo: imagePublishGapWriteTarget(blocker),
    expected: expectedImagePublishEvidence(blocker),
    forbidden: [
      "registry password",
      "docker login output",
      "RAM Secret",
      "AccessKeySecret",
      "STS token",
      "cookie",
    ],
  }))
}

function fieldFromImageBlocker(blocker) {
  const value = String(blocker || "")
  const prefixed = value.match(/^(?:missing|todo|empty):(.+)$/)
  if (prefixed) return prefixed[1]
  const expected = value.match(/^([^=]+)=/)
  if (expected) return expected[1]
  return value
}

function imagePublishGapSource(blocker) {
  const field = fieldFromImageBlocker(blocker)
  if (field.startsWith("runtime.")) {
    return "阿里云控制台 -> SAE -> cn-hangzhou -> 应用 -> 镜像部署 / 镜像拉取配置"
  }
  if (field.startsWith("acr.")) {
    return "阿里云控制台 -> 容器镜像服务 ACR -> cn-hangzhou -> 命名空间/仓库"
  }
  return "阿里云控制台 -> 容器镜像服务 ACR / SAE 容器运行时"
}

function imagePublishGapWriteTarget(blocker) {
  const field = fieldFromImageBlocker(blocker)
  if (field.startsWith("runtime.")) return "deploy/aliyun-production-cn.image-publish.local.json -> runtime"
  if (field.startsWith("acr.")) return "deploy/aliyun-production-cn.image-publish.local.json -> acr"
  return "deploy/aliyun-production-cn.image-publish.local.json"
}

function expectedImagePublishEvidence(blocker) {
  const field = fieldFromImageBlocker(blocker)
  const expectedByField = {
    "acr.remoteDigest": "填 sha256:<64 hex> 镜像 digest。",
    "acr.imagePushed": "镜像已推送或导入 ACR 后填 true。",
    "acr.digestVerified": "远端 digest 已核对后填 true。",
    "acr.pushNetworkPath": "填 public_registry、vpc_registry_from_aliyun_network 或 acr_import_task。",
    "runtime.confirmed": "SAE runtime 已确认后填 true。",
    "runtime.remoteImageConfigured": "SAE 已指向 ACR remote image 后填 true。",
    "runtime.imagePullConfigured": "SAE 镜像拉取权限配置完成后填 true。",
  }
  return expectedByField[field] || "填真实非密钥 ACR/SAE 证据，不能写 registry 密码、RAM Secret 或 token。"
}

function buildRdsMigrationEvidence(args) {
  return runJson("rds_migration_evidence", [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--allow-incomplete",
    "--local",
    args.rdsMigrationFile,
  ], args)
}

function uniqueStrings(values) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const item = typeof value === "string" ? value.trim() : ""
    if (!item || seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

function buildPrerequisites(requiredAuthorizationPackets, requiredEvidence, blockedUntil) {
  return {
    requiredAuthorizationPackets,
    requiredEvidence,
    blockedUntil,
  }
}

function writebackPrerequisites(groupKey, item) {
  const jsonPath = String(item?.jsonPath || "")

  if (groupKey === "rdsMigration") {
    if (jsonPath.startsWith("rdsPostgres.")) {
      return buildPrerequisites(
        ["P11_ALIYUN_RDS_DATA_MIGRATION"],
        [
          "docs/app-production-cn-rds-migration-package.md 已生成并核对",
          "RDS PostgreSQL 实例、数据库账号和 DATABASE_URL_CN secret env 的非密钥证据",
          "compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查已关闭",
        ],
        [
          "RDS PostgreSQL 已创建，数据库账号 ready，DATABASE_URL_CN 已只导入 secret env",
          "compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true",
        ],
      )
    }
    if (jsonPath.startsWith("migration.")) {
      return buildPrerequisites(
        ["P11_ALIYUN_RDS_DATA_MIGRATION"],
        [
          "docs/app-production-cn-rds-migration-package.md 已生成并核对",
          "compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果",
          "Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据",
        ],
        [
          "compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true",
          "schema/data 迁移、RDS API smoke 和 rollback 验收已完成",
        ],
      )
    }
    if (jsonPath.startsWith("sourceInventory.")) {
      return buildPrerequisites(
        ["P11_ALIYUN_RDS_DATA_MIGRATION"],
        ["当前 APP API Supabase/RDS source inventory 与 schema map 非密钥证据"],
        ["RDS migration source inventory 已重新生成并与当前代码一致"],
      )
    }
    return buildPrerequisites(
      ["P11_ALIYUN_RDS_DATA_MIGRATION"],
      ["RDS migration local evidence file 的非密钥证据"],
      ["RDS migration local evidence 文件已初始化并通过 allow-incomplete 检查"],
    )
  }

  if (groupKey === "cloudInventoryResults") {
    return buildPrerequisites(
      [READONLY_INVENTORY_AUTH_PACKET],
      ["受控只读 Aliyun CLI/CloudShell inventory 结果：executed=true、cloudApiCalled=true、mutationPerformed=false"],
      ["阿里云 CLI profile 或 CloudShell 只读身份可用"],
    )
  }

  if (groupKey === "imagePublish") {
    if (jsonPath === "acr.registryHost" || jsonPath === "acr.namespace" || jsonPath === "acr.confirmed") {
      return buildPrerequisites(
        ["P03_ACR_PURCHASE"],
        ["ACR 实例、命名空间、仓库和非密钥控制台证据"],
        ["ACR 已开通并确认仓库位置"],
      )
    }
    if (jsonPath.startsWith("acr.")) {
      return buildPrerequisites(
        ["P04_ACR_IMAGE_AND_PULL"],
        ["ACR 远端镜像地址、sha256 digest、push/import 证据和 digest 核对证据"],
        ["镜像已进入 ACR 且远端 digest 已核对"],
      )
    }
    if (jsonPath === "runtime.confirmed") {
      return buildPrerequisites(
        ["P08_SAE_RUNTIME_SLS"],
        ["SAE production-cn runtime 控制台非密钥证据"],
        ["SAE runtime 已确认"],
      )
    }
    if (jsonPath.startsWith("runtime.")) {
      return buildPrerequisites(
        ["P04_ACR_IMAGE_AND_PULL"],
        ["SAE 已指向 ACR 远端镜像并具备镜像拉取权限的非密钥证据"],
        ["SAE 镜像地址和拉取权限已配置"],
      )
    }
  }

  if (jsonPath.startsWith("items.apiDomainHttps") || jsonPath.startsWith("items.assetDomainHttps")) {
    return buildPrerequisites(
      ["P07_DOMAIN_DNS_HTTPS"],
      ["域名解析到阿里云入口、HTTPS 证书启用、ICP备案满足国内正式访问要求的证据"],
      ["域名 DNS、HTTPS 和 ICP 均就绪"],
    )
  }

  if (jsonPath.startsWith("items.oss")) {
    return buildPrerequisites(
      ["P05_OSS_RAM_STS"],
      [
        "OSS bucket/CORS、服务记录前缀最小权限 RAM 或 STS/role 证据",
        "如选择 sae_runtime_role：SAE RRSA/OIDC env ALIBABA_CLOUD_ROLE_ARN / ALIBABA_CLOUD_OIDC_PROVIDER_ARN / ALIBABA_CLOUD_OIDC_TOKEN_FILE 可用，且 credentialBoundary=runtime_role_no_long_lived_secret",
        "如选择 STS/RAM fallback：ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN 只进入 KMS/Secrets Manager/SAE secret env",
      ],
      ["OSS 与最小权限 RAM/STS 已配置"],
    )
  }

  if (jsonPath.startsWith("items.envImport")) {
    return buildPrerequisites(
      ["P06_ENV_IMPORT"],
      ["production-cn 环境变量已导入 SAE/KMS/Secrets Manager，且 secretNotInImage=true 的证据"],
      ["密钥类环境变量已导入运行时密钥系统且未写入镜像"],
    )
  }

  if (jsonPath.startsWith("items.slsAlerts") || jsonPath.startsWith("items.runtime")) {
    return buildPrerequisites(
      ["P08_SAE_RUNTIME_SLS"],
      ["SAE runtime、健康检查和 SLS 告警的非密钥控制台证据"],
      ["SAE runtime 与 SLS 告警已确认"],
    )
  }

  if (
    jsonPath === "items.wechatOpenPlatform.androidSignature" ||
    jsonPath === "items.wechatOpenPlatform.androidConfigured"
  ) {
    return buildPrerequisites(
      ["P10_ANDROID_RELEASE_SIGNING"],
      ["Android release APK/AAB 签名证据和微信开放平台 Android 包名/签名配置证据，不能使用 debug keystore"],
      ["Android release 签名已生成并配置到微信开放平台"],
    )
  }

  if (jsonPath === "items.wechatOpenPlatform.iosConfigured") {
    return buildPrerequisites(
      ["P01_WECHAT_OPEN_MOBILE_APP", "P02_APPLE_TEAM_ID"],
      ["微信开放平台移动应用 AppID 证据、Apple Team ID、Bundle ID 和 Universal Link/AASA 证据"],
      ["微信移动应用已创建且 Apple Team/Universal Link 已确认"],
    )
  }

  if (jsonPath.startsWith("items.wechatOpenPlatform")) {
    return buildPrerequisites(
      ["P01_WECHAT_OPEN_MOBILE_APP"],
      ["微信开放平台移动应用创建、提交、审核通过、AppID ready、AppSecret 仅以密钥方式导入的证据"],
      ["微信开放平台移动应用审核通过并取得 AppID/AppSecret"],
    )
  }

  return buildPrerequisites([], [], [])
}

function compactGap(item, groupKey) {
  const prerequisites = writebackPrerequisites(groupKey, item)
  return {
    jsonPath: item.jsonPath || "$",
    blocker: item.blocker || "unknown",
    source: item.source || "unknown",
    writeTo: item.writeTo || "",
    expected: item.expected || "",
    forbidden: item.forbidden || [],
    nonSecretOnly: true,
    requiredAuthorizationPackets: prerequisites.requiredAuthorizationPackets,
    requiredEvidence: prerequisites.requiredEvidence,
    blockedUntil: prerequisites.blockedUntil,
  }
}

function compactGroup(key, group, strictVerifyCommands) {
  const gaps = (group?.gaps || []).map((item) => compactGap(item, key))
  return {
    key,
    file: group?.file || "",
    exists: group?.exists === true,
    ready: group?.ready === true,
    totalBlockers: group?.totalBlockers ?? gaps.length,
    checkedOperations: group?.checkedOperations ?? null,
    localDockerImage: group?.localDockerImage || null,
    observationSummary: group?.observationSummary || null,
    gaps,
    requiredAuthorizationPackets: uniqueStrings(gaps.flatMap((gap) => gap.requiredAuthorizationPackets || [])),
    blockedUntil: uniqueStrings(gaps.flatMap((gap) => gap.blockedUntil || [])),
    strictVerifyCommands,
  }
}

function fieldFromRdsBlocker(value) {
  const blocker = String(value || "")
  const prefixed = blocker.match(/^(?:missing|todo|empty):(.+)$/)
  if (prefixed) return prefixed[1]
  const expected = blocker.match(/^([^=]+)=/)
  if (expected) return expected[1]
  return blocker
}

function expectedForRdsField(field) {
  if (field === "file_missing") return "运行 corepack pnpm aliyun:rds:migration:evidence:init 初始化 ignored 的 RDS local evidence 文件。"
  if (field === "rdsPostgres.instanceId") return "填入 RDS 控制台可见的非密钥实例 ID。"
  if (field === "rdsPostgres.instanceName") return "填入 RDS 控制台可见的实例名称。"
  if (field === "rdsPostgres.engineVersion") return "填入 RDS PostgreSQL 版本号。"
  if (field === "rdsPostgres.networkAccess") return "填入 SAE 到 RDS 的 VPC/内网访问方式说明。"
  if (field === "rdsPostgres.databaseName") return "填入生产数据库名，不包含账号密码或连接串。"
  if (field === "rdsPostgres.evidence") return "填控制台路径、截图编号、工单号或其它非密钥证据编号。"
  if (field === "rdsPostgres.confirmed") return "RDS PostgreSQL 实例确认存在后填 true。"
  if (field === "rdsPostgres.databaseAccountReady") return "数据库账号和权限就绪后填 true，不记录密码。"
  if (field === "rdsPostgres.databaseUrlCnSecretImported") return "DATABASE_URL_CN 已只导入阿里云 KMS/Secrets Manager/SAE secret env 后填 true。"
  if (field === "migration.dataAccessAdapterReady") return "第一版 APP API 正式 production-cn 数据访问不再依赖 Supabase 后填 true。"
  if (field === "migration.schemaCompatibilityReviewed") return "compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查完成并记录非密钥处置结果后填 true。"
  if (field === "migration.supabaseSpecificSqlResolved") return "supabase_auth_uid / storage / service_role / RLS / policy 等 Supabase-specific SQL 已改写或明确处置后填 true。"
  if (field === "migration.rdsExtensionSupportConfirmed") return "Aliyun RDS PostgreSQL extension 支持和替代方案已确认后填 true。"
  if (field === "migration.schemaMigrated") return "schema 已迁到 RDS/PostgreSQL 并通过非密钥验收后填 true。"
  if (field === "migration.dataMigrated") return "数据已按迁移计划进入 RDS/PostgreSQL 并通过非密钥验收后填 true。"
  if (field === "migration.rowCountValidationPassed") return "关键表 row count 校验通过后填 true。"
  if (field === "migration.criticalRecordValidationPassed") return "关键记录、租户/门店/服务记录关系校验通过后填 true。"
  if (field === "migration.appApiSmokeOnRdsPassed") return "profile / tenant / invite / service-record APP API 在 RDS 上冒烟通过后填 true。"
  if (field === "migration.supabaseNoLongerFormalTarget") return "Supabase 已仅作为迁移来源或旧兼容，不再作为 production-cn 正式数据库目标后填 true。"
  if (field === "migration.rollbackRunbookReviewed") return "回滚 runbook 已评审后填 true。"
  if (field === "migration.rollbackValidationPassed") return "回滚演练或可恢复性验证通过后填 true。"
  return "填真实非密钥证据，不能保留 TODO、pending 或 TBD 占位值。"
}

function compactRdsMigrationGroup(rdsEvidence) {
  const local = rdsEvidence.local || {}
  const file = local.file || rdsEvidence.files?.local || DEFAULT_RDS_MIGRATION_FILE
  const gaps = (local.blockers || []).map((blocker) => {
    const jsonPath = fieldFromRdsBlocker(blocker)
    return compactGap({
      jsonPath,
      blocker,
      source: jsonPath.startsWith("migration.")
        ? "Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收"
        : "阿里云控制台 -> RDS PostgreSQL / SAE secret env",
      writeTo: `deploy/aliyun-production-cn.rds-migration.local.json -> ${jsonPath}`,
      expected: expectedForRdsField(jsonPath),
      forbidden: [
        "database password",
        "DATABASE_URL_CN value",
        "Supabase service role key",
        "dump contents",
        "customer data",
        "AccessKeySecret",
        "token",
      ],
    }, "rdsMigration")
  })
  return {
    key: "rdsMigration",
    file,
    exists: local.exists === true,
    ready: local.ready === true,
    totalBlockers: local.blockers?.length ?? gaps.length,
    checkedOperations: null,
    localDockerImage: null,
    observationSummary: {
      appApiRoutesWithSupabase: rdsEvidence.summary?.appApiRoutesWithSupabase ?? null,
      firstVersionRdsRoutesWithSupabaseDataAccess: rdsEvidence.summary?.firstVersionRdsRoutesWithSupabaseDataAccess ?? null,
      databaseUrlCnReferencedInSource: rdsEvidence.summary?.databaseUrlCnReferencedInSource === true,
      postgresDataAccessAdapterDetected: rdsEvidence.summary?.postgresDataAccessAdapterDetected === true,
    },
    gaps,
    requiredAuthorizationPackets: uniqueStrings(gaps.flatMap((gap) => gap.requiredAuthorizationPackets || [])),
    blockedUntil: uniqueStrings(gaps.flatMap((gap) => gap.blockedUntil || [])),
    strictVerifyCommands: [
      "corepack pnpm aliyun:rds:migration:evidence:strict",
    ],
  }
}

function buildEvidenceClosureBrief(handoff, writebackGroups, allGaps, requiredAuthorizationPackets, strictVerifyCommands) {
  const operatorClosureBrief = handoff.operatorClosureBrief || {}
  const groups = Object.values(writebackGroups)
  const readyFiles = groups.filter((group) => group.ready).length
  const blockedResourceEvidence = (operatorClosureBrief.blockedResourceEvidence || []).map((item) => ({
    id: item.id,
    observedStatus: item.observedStatus || "unknown",
    observedReadiness: item.observedReadiness || "unknown",
    currentEvidence: item.currentEvidence || [],
    missingEvidence: item.missingEvidence || [],
    writeTargets: item.writeTargets || [],
    nextEvidenceAction: item.nextEvidenceAction || "",
  }))
  const partiallyObservedResourceEvidenceIds = blockedResourceEvidence
    .filter((item) => item.observedReadiness === "partial")
    .map((item) => item.id)
  return {
    conclusion: handoff.canDeployNow === true && allGaps.length === 0
      ? "本地证据已闭环；进入外部部署动作前仍需动作时确认。"
      : "本地证据尚未闭环；部署前必须补齐本地 .local.json 证据并通过 strict 验证。",
    source: "operatorClosureBrief + localEvidenceGaps",
    canDeployNow: handoff.canDeployNow === true,
    evidenceWritebackReady: `${readyFiles}/${groups.length}`,
    files: groups.length,
    readyFiles,
    totalGaps: allGaps.length,
    rdsMigrationGaps: writebackGroups.rdsMigration.gaps.length,
    cloudInventoryResultGaps: writebackGroups.cloudInventoryResults.gaps.length,
    cloudConfirmationGaps: writebackGroups.cloudConfirmations.gaps.length,
    imagePublishGaps: writebackGroups.imagePublish.gaps.length,
    blockedCredentialCount: operatorClosureBrief.blockedCredentialCount || 0,
    blockedCredentialNames: operatorClosureBrief.blockedCredentialNames || [],
    readySecretEnvVariableCount: operatorClosureBrief.readySecretEnvVariableCount || 0,
    readySecretEnvVariableNames: operatorClosureBrief.readySecretEnvVariableNames || [],
    resourceEvidenceReady: operatorClosureBrief.resourceEvidenceReady || "0/0",
    blockedResourceEvidenceIds: operatorClosureBrief.blockedResourceEvidenceIds || [],
    partiallyObservedResourceEvidenceIds,
    blockedResourceEvidence,
    requiredAuthorizationPackets,
    strictVerifyCommands,
    writeTargets: uniqueStrings(groups.map((group) => group.file)),
  }
}

function buildActionableWritebackSequence(writebackGroups, currentScope) {
  const requiredPacketIds = new Set(
    Object.values(writebackGroups)
      .flatMap((group) => group.gaps || [])
      .flatMap((gap) => gap.requiredAuthorizationPackets || []),
  )
  const acrActionPacketId = requiredPacketIds.has("P03_ACR_PURCHASE")
    ? "P03_ACR_PURCHASE"
    : requiredPacketIds.has("P04_ACR_IMAGE_AND_PULL")
      ? "P04_ACR_IMAGE_AND_PULL"
      : ""
  const canStartNowPacketIds = currentScope === "backend_aliyun_only"
    ? uniqueStrings([...BACKEND_BASE_CAN_START_PACKET_IDS, acrActionPacketId])
    : []
  const deferredAppLaunchPacketIds = currentScope === "backend_aliyun_only"
    ? [...BACKEND_DEFERRED_APP_LAUNCH_PACKET_IDS]
    : []
  const canStartNowPacketIdSet = new Set(canStartNowPacketIds)
  const deferredAppLaunchPacketIdSet = new Set(deferredAppLaunchPacketIds)
  const packetRecords = new Map()

  for (const group of Object.values(writebackGroups)) {
    for (const gap of group.gaps) {
      for (const packetId of gap.requiredAuthorizationPackets || []) {
        const record = packetRecords.get(packetId) || {
          packetId,
          status: "blocked_by_dependency",
          nonSecretEvidenceOnly: !SECRET_OR_CREDENTIAL_PACKET_IDS.has(packetId),
          gapCount: 0,
          groupKeys: [],
          jsonPaths: [],
          writeTargets: [],
          forbiddenValueClasses: [],
          strictVerifyCommands: [],
          requiredEvidence: [],
          blockedUntil: [],
        }
        record.gapCount += 1
        record.groupKeys = uniqueStrings([...record.groupKeys, group.key])
        record.jsonPaths = uniqueStrings([...record.jsonPaths, gap.jsonPath])
        record.writeTargets = uniqueStrings([...record.writeTargets, gap.writeTo])
        record.forbiddenValueClasses = uniqueStrings([...record.forbiddenValueClasses, ...(gap.forbidden || [])]).sort()
        record.strictVerifyCommands = uniqueStrings([...record.strictVerifyCommands, ...(group.strictVerifyCommands || [])])
        record.requiredEvidence = uniqueStrings([...record.requiredEvidence, ...(gap.requiredEvidence || [])])
        record.blockedUntil = uniqueStrings([...record.blockedUntil, ...(gap.blockedUntil || [])])
        packetRecords.set(packetId, record)
      }
    }
  }

  const packets = [...packetRecords.values()]
    .map((record) => ({
      ...record,
      status: canStartNowPacketIdSet.has(record.packetId)
        ? "can_start_after_action_time_confirmation"
        : deferredAppLaunchPacketIdSet.has(record.packetId)
          ? "deferred_app_launch"
          : "blocked_by_dependency",
    }))
    .sort((left, right) => packetSortIndex(left.packetId) - packetSortIndex(right.packetId))

  return {
    currentScope,
    canStartNowPacketIds,
    blockedByDependencyPacketIds: packets
      .filter((packet) => packet.status === "blocked_by_dependency")
      .map((packet) => packet.packetId),
    deferredAppLaunchPacketIds,
    secretOrCredentialPacketIds: packets
      .filter((packet) => packet.nonSecretEvidenceOnly !== true)
      .map((packet) => packet.packetId),
    packetCount: packets.length,
    packets,
  }
}

function packetSortIndex(packetId) {
  const index = WRITEBACK_PACKET_ORDER.indexOf(packetId)
  return index === -1 ? WRITEBACK_PACKET_ORDER.length : index
}

function buildReport(args) {
  const handoff = buildOperatorHandoff(args)
  const rdsMigrationEvidence = buildRdsMigrationEvidence(args)
  const gaps = handoff.localEvidenceGaps || {}
  const writebackGroups = {
    rdsMigration: compactRdsMigrationGroup(rdsMigrationEvidence),
    cloudInventoryResults: compactGroup("cloudInventoryResults", gaps.cloudInventoryResults, [
      "corepack pnpm aliyun:cloud:inventory-results:strict",
    ]),
    cloudConfirmations: compactGroup("cloudConfirmations", gaps.cloudConfirmations, [
      "corepack pnpm aliyun:oss:runtime-access:strict",
      "corepack pnpm aliyun:cloud:confirmations:strict",
    ]),
    imagePublish: compactGroup("imagePublish", gaps.imagePublish, [
      "corepack pnpm aliyun:image:plan:strict",
    ]),
  }
  const allGaps = Object.values(writebackGroups).flatMap((group) => group.gaps)
  const forbiddenValueClasses = [...new Set(allGaps.flatMap((item) => item.forbidden || []))].sort()
  const strictVerifyCommands = [...new Set(Object.values(writebackGroups).flatMap((group) => group.strictVerifyCommands))]
  const requiredAuthorizationPackets = uniqueStrings(allGaps.flatMap((item) => item.requiredAuthorizationPackets || []))
  const currentScope = args.backendOnly ? "backend_aliyun_only" : "full_app_launch"
  const actionableWritebackSequence = buildActionableWritebackSequence(writebackGroups, currentScope)
  const evidenceClosureBrief = buildEvidenceClosureBrief(
    handoff,
    writebackGroups,
    allGaps,
    requiredAuthorizationPackets,
    strictVerifyCommands,
  )
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    currentScope,
    objective: "阿里云 production-cn 本地证据回填清单",
    verdict: handoff.verdict || "unknown",
    canDeployNow: handoff.canDeployNow === true,
    currentAnswer: handoff.canDeployNow === true
      ? "本地证据显示可以进入受控部署确认；仍需动作时授权后才能执行外部发布。"
      : args.backendOnly
        ? "现在还不能部署阿里云后端；微信/Android/Apple 发布项已后置，请先按本清单补齐 RDS/ACR/SAE/DNS/OSS/env/SLS/smoke 证据。"
        : "现在还不能部署或上传；请先按本清单补齐阿里云/微信/镜像相关本地证据，再跑 strict 验证。",
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    cloudApiCalled: false,
    executionMode: "writeback_checklist_only",
    childCommands: {
      timeoutMs: args.childTimeoutMs,
      timeoutEnforced: true,
      failureMode: "fail_closed_no_cloud_mutation",
      note: "Child evidence checks are bounded; timed-out children fail this local checklist instead of creating or modifying cloud resources.",
    },
    files: {
      envFile: args.envFile,
      rdsMigrationFile: args.rdsMigrationFile,
      cloudConfirmationsFile: args.cloudConfirmationsFile,
      cloudInventoryResultsFile: args.cloudInventoryResultsFile,
      imagePublishLocalFile: gaps.imagePublish?.file || args.imagePublishFile,
    },
    sourceCommands: {
      operatorHandoff: "corepack pnpm aliyun:operator:handoff -- --skip-vercel-env-coverage",
      rdsMigrationEvidenceStrict: "corepack pnpm aliyun:rds:migration:evidence:strict",
      cloudInventoryResultsStrict: "corepack pnpm aliyun:cloud:inventory-results:strict",
      cloudConfirmationsStrict: "corepack pnpm aliyun:cloud:confirmations:strict",
      imagePublishStrict: "corepack pnpm aliyun:image:plan:strict",
      completionAudit: "corepack pnpm aliyun:completion:audit",
    },
    summary: {
      files: Object.keys(writebackGroups).length,
      readyFiles: Object.values(writebackGroups).filter((group) => group.ready).length,
      totalGaps: allGaps.length,
      rdsMigrationGaps: writebackGroups.rdsMigration.gaps.length,
      cloudInventoryResultGaps: writebackGroups.cloudInventoryResults.gaps.length,
      cloudConfirmationGaps: writebackGroups.cloudConfirmations.gaps.length,
      imagePublishGaps: writebackGroups.imagePublish.gaps.length,
      forbiddenValueClasses,
      requiredAuthorizationPackets,
      actionableCanStartNowPacketIds: actionableWritebackSequence.canStartNowPacketIds,
      actionableBlockedByDependencyPacketIds: actionableWritebackSequence.blockedByDependencyPacketIds,
      actionableSecretOrCredentialPacketIds: actionableWritebackSequence.secretOrCredentialPacketIds,
      strictVerifyCommands,
      canDeployNow: handoff.canDeployNow === true,
      evidenceWritebackReady: evidenceClosureBrief.evidenceWritebackReady,
      blockedCredentialCount: evidenceClosureBrief.blockedCredentialCount,
      blockedCredentialNames: evidenceClosureBrief.blockedCredentialNames,
      readySecretEnvVariableCount: evidenceClosureBrief.readySecretEnvVariableCount,
      readySecretEnvVariableNames: evidenceClosureBrief.readySecretEnvVariableNames,
      resourceEvidenceReady: evidenceClosureBrief.resourceEvidenceReady,
      blockedResourceEvidenceIds: evidenceClosureBrief.blockedResourceEvidenceIds,
      partiallyObservedResourceEvidenceIds: evidenceClosureBrief.partiallyObservedResourceEvidenceIds,
    },
    evidenceClosureBrief,
    actionableWritebackSequence,
    writebackGroups,
    strictVerificationOrder: STRICT_VERIFICATION_ORDER,
    safetyBoundary: [
      "本命令只读取本地门禁报告并生成回填清单。",
      "本命令不会改写 rds-migration.local.json、cloud-confirmations.local.json、cloud-inventory-results.local.json 或 image-publish.local.json。",
      "本命令不会调用阿里云 API，不会购买 ACR，不会 push 镜像，不会部署 SAE，不会改 DNS/HTTPS/ICP。",
      "回填本地证据时只能写资源名、布尔状态、时间戳、控制台路径、digest、row-count 结论和非密钥 evidence handle。",
      "禁止写入 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、证书私钥、DATABASE_URL_CN value、database password、dump contents、customer data 或 Supabase service role key。",
    ],
  }
  const secretLeakCheck = findSecretLikeValues(report)
  return {
    ...report,
    ok: secretLeakCheck.length === 0,
    secretLeakCheck: {
      ok: secretLeakCheck.length === 0,
      matches: secretLeakCheck,
    },
  }
}

function renderMarkdown(report) {
  return [
    "# 美业话镜 APP production-cn 阿里云证据回填清单",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 当前结论",
    "",
    `- ${report.currentAnswer}`,
    `- currentScope: ${report.currentScope}`,
    `- verdict: ${report.verdict}`,
    `- canDeployNow: ${report.canDeployNow}`,
    `- executionMode: ${report.executionMode}`,
    `- containsValues: ${report.containsValues}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- cloudApiCalled: ${report.cloudApiCalled}`,
    "",
    "## 证据闭环摘要",
    "",
    `- conclusion: ${report.evidenceClosureBrief.conclusion}`,
    `- evidenceWritebackReady: ${report.evidenceClosureBrief.evidenceWritebackReady}`,
    `- totalGaps: ${report.evidenceClosureBrief.totalGaps}`,
    `- rdsMigrationGaps: ${report.evidenceClosureBrief.rdsMigrationGaps}`,
    `- blockedCredentialCount: ${report.evidenceClosureBrief.blockedCredentialCount}`,
    `- blockedCredentialNames: ${report.evidenceClosureBrief.blockedCredentialNames.join(", ") || "none"}`,
    `- readySecretEnvVariableCount: ${report.evidenceClosureBrief.readySecretEnvVariableCount}`,
    `- readySecretEnvVariableNames: ${report.evidenceClosureBrief.readySecretEnvVariableNames.join(", ") || "none"}`,
    `- resourceEvidenceReady: ${report.evidenceClosureBrief.resourceEvidenceReady}`,
    `- blockedResourceEvidenceIds: ${report.evidenceClosureBrief.blockedResourceEvidenceIds.join(", ") || "none"}`,
    `- partiallyObservedResourceEvidenceIds: ${report.evidenceClosureBrief.partiallyObservedResourceEvidenceIds.join(", ") || "none"}`,
    `- writeTargets: ${report.evidenceClosureBrief.writeTargets.join(", ") || "none"}`,
    "",
    "## 按动作包排序的证据回填",
    "",
    ...renderActionableWritebackSummaryLines(report),
    "",
    ...report.actionableWritebackSequence.packets.flatMap(renderActionableWritebackPacket),
    "",
    "## 已观测但未闭环的资源证据",
    "",
    ...(report.evidenceClosureBrief.blockedResourceEvidence.length
      ? report.evidenceClosureBrief.blockedResourceEvidence.flatMap(renderResourceEvidence)
      : ["- none"]),
    "",
    "## 汇总",
    "",
    `- files: ${report.summary.files}`,
    `- readyFiles: ${report.summary.readyFiles}/${report.summary.files}`,
    `- totalGaps: ${report.summary.totalGaps}`,
    `- rdsMigrationGaps: ${report.summary.rdsMigrationGaps}`,
    `- cloudInventoryResultGaps: ${report.summary.cloudInventoryResultGaps}`,
    `- cloudConfirmationGaps: ${report.summary.cloudConfirmationGaps}`,
    `- imagePublishGaps: ${report.summary.imagePublishGaps}`,
    `- forbiddenValueClasses: ${report.summary.forbiddenValueClasses.join(", ") || "none"}`,
    `- requiredAuthorizationPackets: ${report.summary.requiredAuthorizationPackets.join(", ") || "none"}`,
    "",
    ...Object.values(report.writebackGroups).flatMap(renderGroup),
    "## Strict 验证顺序",
    "",
    ...report.strictVerificationOrder.map((command) => `- \`${command}\``),
    "",
    "## 安全边界",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
  ].join("\n") + "\n"
}

function renderActionableWritebackPacket(packet) {
  return [
    `### ${packet.packetId}`,
    "",
    `- status: ${packet.status}`,
    `- nonSecretEvidenceOnly: ${packet.nonSecretEvidenceOnly}`,
    `- gapCount: ${packet.gapCount}`,
    `- groupKeys: ${packet.groupKeys.join(", ") || "none"}`,
    `- jsonPaths: ${packet.jsonPaths.join(", ") || "none"}`,
    `- writeTargets: ${packet.writeTargets.join("; ") || "none"}`,
    `- forbiddenValueClasses: ${packet.forbiddenValueClasses.join(", ") || "none"}`,
    `- strictVerifyCommands: ${packet.strictVerifyCommands.join("; ") || "none"}`,
    "",
  ]
}

function renderActionableWritebackSummaryLines(report) {
  const sequence = report.actionableWritebackSequence
  const lines = [
    `- canStartNowPacketIds: ${sequence.canStartNowPacketIds.join(", ") || "none"}`,
    `- blockedByDependencyPacketIds: ${sequence.blockedByDependencyPacketIds.join(", ") || "none"}`,
    `- secretOrCredentialPacketIds: ${sequence.secretOrCredentialPacketIds.join(", ") || "none"}`,
  ]

  if (report.currentScope !== "backend_aliyun_only" && sequence.deferredAppLaunchPacketIds.length > 0) {
    lines.splice(2, 0, `- deferredAppLaunchPacketIds: ${sequence.deferredAppLaunchPacketIds.join(", ")}`)
  }

  return lines
}

function renderResourceEvidence(item) {
  return [
    `- ${item.id}: observed=${item.observedStatus}, readiness=${item.observedReadiness}`,
    `  - currentEvidence: ${(item.currentEvidence || []).join("; ") || "none"}`,
    `  - missingEvidence: ${(item.missingEvidence || []).join("; ") || "none"}`,
    `  - writeTargets: ${(item.writeTargets || []).join("; ") || "none"}`,
    `  - nextEvidenceAction: ${item.nextEvidenceAction || "none"}`,
  ]
}

function renderGroup(group) {
  return [
    `## ${group.key}`,
    "",
    `- file: ${group.file}`,
    `- exists: ${group.exists}`,
    `- ready: ${group.ready}`,
    `- totalBlockers: ${group.totalBlockers}`,
    ...(group.checkedOperations === null ? [] : [`- checkedOperations: ${group.checkedOperations}`]),
    ...(group.localDockerImage ? [`- localDockerImage: ${group.localDockerImage}`] : []),
    `- requiredAuthorizationPackets: ${group.requiredAuthorizationPackets.join(", ") || "none"}`,
    `- blockedUntil: ${group.blockedUntil.join("; ") || "none"}`,
    `- strictVerifyCommands: ${group.strictVerifyCommands.join("; ")}`,
    "",
    ...(group.gaps.length
      ? group.gaps.flatMap(renderGap)
      : ["- none"]),
    "",
  ]
}

function renderGap(item) {
  return [
    `- \`${item.jsonPath}\``,
    `  - blocker: ${item.blocker}`,
    `  - source: ${item.source}`,
    `  - writeTo: ${item.writeTo}`,
    `  - expected: ${item.expected}`,
    `  - forbidden: ${(item.forbidden || []).join(", ") || "none"}`,
    `  - requiredAuthorizationPackets: ${(item.requiredAuthorizationPackets || []).join(", ") || "none"}`,
    `  - requiredEvidence: ${(item.requiredEvidence || []).join("; ") || "none"}`,
    `  - blockedUntil: ${(item.blockedUntil || []).join("; ") || "none"}`,
  ]
}

function findSecretLikeValues(value) {
  const text = JSON.stringify(value)
  return SECRET_VALUE_PATTERNS
    .map((pattern) => text.match(pattern)?.[0] || "")
    .filter(Boolean)
    .map((match) => match.slice(0, 80))
}

function writeText(filePath, content) {
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function printHelp() {
  console.log(`Usage: node scripts/generate-aliyun-evidence-writeback-checklist.mjs [options]

Options:
  --env-file <path>                 production-cn env file used for local readiness reads
  --cloud-confirmations <path>      local cloud confirmations file
  --cloud-inventory-results <path>  local read-only inventory results file
  --rds-migration <path>            local RDS migration evidence file
  --image-publish <path>            local image publish evidence file
  --out <path>                      write JSON report
  --markdown <path>                 write Markdown report
  --skip-vercel-env-coverage        skip Vercel env name coverage while reading operator handoff
  --vercel-env-coverage-input <path> use a captured Vercel env coverage fixture
  --backend-only                    exclude deferred WeChat/Android/Apple launch evidence from the current report
  --child-timeout-ms <ms>           maximum time for each local child check, default ${DEFAULT_CHILD_TIMEOUT_MS}
`)
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildReport(args)
  const json = JSON.stringify(report, null, 2)
  if (args.outPath) writeText(args.outPath, json)
  if (args.markdownPath) writeText(args.markdownPath, renderMarkdown(report))
  console.log(json)
  if (!report.secretLeakCheck.ok) process.exitCode = 1
}

main()
