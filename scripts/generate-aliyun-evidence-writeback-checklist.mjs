#!/usr/bin/env node

import { writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const DEFAULT_CLOUD_INVENTORY_RESULTS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-inventory-results.local.json")
const DEFAULT_RDS_MIGRATION_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.rds-migration.local.json")
const READONLY_INVENTORY_AUTH_PACKET = "P00_ALIYUN_READONLY_INVENTORY_IDENTITY"

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
    outPath: "",
    markdownPath: "",
    skipVercelEnvCoverage: false,
    vercelEnvCoverageInput: "",
    backendOnly: false,
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
    if (arg === "--skip-vercel-env-coverage") {
      args.skipVercelEnvCoverage = true
      continue
    }
    if (arg === "--backend-only") {
      args.backendOnly = true
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

function runJson(label, scriptArgs) {
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
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

function buildOperatorHandoff(args) {
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
    ...(args.vercelEnvCoverageInput ? ["--vercel-env-coverage-input", args.vercelEnvCoverageInput] : []),
  ])
}

function buildRdsMigrationEvidence(args) {
  return runJson("rds_migration_evidence", [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--allow-incomplete",
    "--local",
    args.rdsMigrationFile,
  ])
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
        ["RDS PostgreSQL 实例、数据库账号和 DATABASE_URL_CN secret env 的非密钥证据"],
        ["RDS PostgreSQL 已创建，数据库账号 ready，DATABASE_URL_CN 已只导入 secret env"],
      )
    }
    if (jsonPath.startsWith("migration.")) {
      return buildPrerequisites(
        ["P11_ALIYUN_RDS_DATA_MIGRATION"],
        ["Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据"],
        ["schema/data 迁移、RDS API smoke 和 rollback 验收已完成"],
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
      ["P07_DOMAIN_DNS_HTTPS_ICP"],
      ["域名解析到阿里云入口、HTTPS 证书启用、ICP备案满足国内正式访问要求的证据"],
      ["域名 DNS、HTTPS 和 ICP 均就绪"],
    )
  }

  if (jsonPath.startsWith("items.oss")) {
    return buildPrerequisites(
      ["P05_OSS_RAM_STS"],
      ["OSS bucket/CORS、服务记录前缀最小权限 RAM 或 STS/role 证据"],
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
    currentScope: args.backendOnly ? "backend_aliyun_only" : "full_app_launch",
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
    files: {
      envFile: args.envFile,
      rdsMigrationFile: args.rdsMigrationFile,
      cloudConfirmationsFile: args.cloudConfirmationsFile,
      cloudInventoryResultsFile: args.cloudInventoryResultsFile,
      imagePublishLocalFile: gaps.imagePublish?.file || resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.image-publish.local.json"),
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
  --out <path>                      write JSON report
  --markdown <path>                 write Markdown report
  --skip-vercel-env-coverage        skip Vercel env name coverage while reading operator handoff
  --vercel-env-coverage-input <path> use a captured Vercel env coverage fixture
  --backend-only                    exclude deferred WeChat/Android/Apple launch evidence from the current report
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
