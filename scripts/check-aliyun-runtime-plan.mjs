#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_PLAN_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.runtime-plan.json")
const VOICE_COACH_TEXT_REPOSITORY_MODE_ENV = "APP_VOICE_COACH_TEXT_REPOSITORY_MODE"
const PRODUCTION_VOICE_COACH_TEXT_REPOSITORY_MODE = "rds_voice_coach_text_session_contract"

const FORBIDDEN_HOSTS = new Set([
  "ip.ipgongchang.xin",
  "ipnrgc.com",
  "www.ipnrgc.com",
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
    planFile: DEFAULT_PLAN_FILE,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--plan") {
      args.planFile = resolveValue(argv[++index], "--plan")
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

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function assertNoSecretLikeValues(value, path = "$", matches = []) {
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) matches.push(path)
    return matches
  }
  if (!value || typeof value !== "object") return matches
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretLikeValues(item, `${path}[${index}]`, matches))
    return matches
  }
  for (const [key, nested] of Object.entries(value)) {
    assertNoSecretLikeValues(nested, `${path}.${key}`, matches)
  }
  return matches
}

function validatePlan(plan) {
  const blockers = []
  const warnings = []

  if (plan.schemaVersion !== 1) blockers.push("schemaVersion=1")
  if (plan.environment !== "production-cn") blockers.push("environment=production-cn")
  if (plan.containsValues !== false) blockers.push("containsValues=false")

  const target = plan.target || {}
  if (target.provider !== "SAE") blockers.push("target.provider=SAE")
  if (target.region !== "cn-hangzhou") blockers.push("target.region=cn-hangzhou")
  if (target.appName !== "meiye-huajing-app-api-production-cn") blockers.push("target.appName")
  if (target.runtime !== "custom-container") blockers.push("target.runtime=custom-container")
  if (Number(target.containerPort) !== 3000) blockers.push("target.containerPort=3000")
  if (target.healthPath !== "/api/healthz") blockers.push("target.healthPath")
  if (target.strictHealthPath !== "/api/app/health?strict=1") blockers.push("target.strictHealthPath")
  if (target.publicIngress !== true) blockers.push("target.publicIngress=true")

  const image = plan.image || {}
  if (image.provider !== "Aliyun ACR") blockers.push("image.provider=Aliyun ACR")
  if (image.localImage !== "meiye-huajing-app-api:production-cn") blockers.push("image.localImage")
  if (image.repository !== "meiye-huajing-app-api") blockers.push("image.repository")
  if (image.tag !== "production-cn") blockers.push("image.tag")
  if (!String(image.remoteImagePattern || "").includes("meiye-huajing-app-api:production-cn")) {
    blockers.push("image.remoteImagePattern")
  }
  if (image.publishPlanFile !== "deploy/aliyun-production-cn.image-publish.local.json") {
    blockers.push("image.publishPlanFile")
  }
  if (image.strictCheckCommand !== "corepack pnpm aliyun:image:plan:strict") {
    blockers.push("image.strictCheckCommand")
  }

  const domains = plan.domains || {}
  if (domains.apiHost !== "api-cn.ipgongchang.xin") blockers.push("domains.apiHost")
  if (domains.assetHost !== "assets-cn.ipgongchang.xin") blockers.push("domains.assetHost")
  for (const host of [domains.apiHost, domains.assetHost]) {
    const normalized = String(host || "")
    if (FORBIDDEN_HOSTS.has(normalized)) blockers.push(`forbidden_host:${normalized}`)
    if (normalized.endsWith(".vercel.app")) blockers.push(`forbidden_vercel_host:${normalized}`)
  }
  if (domains.apiHealthUrl !== "https://api-cn.ipgongchang.xin/api/healthz") {
    blockers.push("domains.apiHealthUrl")
  }
  if (domains.strictAppHealthUrl !== "https://api-cn.ipgongchang.xin/api/app/health?strict=1") {
    blockers.push("domains.strictAppHealthUrl")
  }
  if (domains.strictCheckCommand !== "corepack pnpm aliyun:domain:strict") {
    blockers.push("domains.strictCheckCommand")
  }

  const environmentImport = plan.environmentImport || {}
  if (environmentImport.sourcePlanCommand !== "corepack pnpm aliyun:env:plan") {
    blockers.push("environmentImport.sourcePlanCommand")
  }
  if (!String(environmentImport.target || "").includes("SAE")) blockers.push("environmentImport.target")
  if (!String(environmentImport.secretPolicy || "").includes("Do not bake secrets")) {
    blockers.push("environmentImport.secretPolicy")
  }
  if (environmentImport.strictCheckCommand !== "corepack pnpm aliyun:readiness:cloud-ready") {
    blockers.push("environmentImport.strictCheckCommand")
  }

  const dataLayer = plan.dataLayer || {}
  if (dataLayer.formalTarget !== "Aliyun RDS PostgreSQL") blockers.push("dataLayer.formalTarget")
  if (dataLayer.connectionEnvName !== "DATABASE_URL_CN") blockers.push("dataLayer.connectionEnvName=DATABASE_URL_CN")
  if (dataLayer.voiceCoachTextRepositoryModeEnvName !== VOICE_COACH_TEXT_REPOSITORY_MODE_ENV) {
    blockers.push(`dataLayer.voiceCoachTextRepositoryModeEnvName=${VOICE_COACH_TEXT_REPOSITORY_MODE_ENV}`)
  }
  if (dataLayer.voiceCoachTextRepositoryModeRequiredValue !== PRODUCTION_VOICE_COACH_TEXT_REPOSITORY_MODE) {
    blockers.push(`dataLayer.voiceCoachTextRepositoryModeRequiredValue=${PRODUCTION_VOICE_COACH_TEXT_REPOSITORY_MODE}`)
  }
  if (dataLayer.voiceCoachTextRepositoryFailClosed !== true) {
    blockers.push("dataLayer.voiceCoachTextRepositoryFailClosed=true")
  }
  if (!String(dataLayer.connectionSecretTarget || "").includes("Aliyun KMS")) {
    blockers.push("dataLayer.connectionSecretTarget")
  }
  if (dataLayer.migrationEvidenceCommand !== "corepack pnpm aliyun:rds:migration:evidence:strict") {
    blockers.push("dataLayer.migrationEvidenceCommand")
  }
  if (dataLayer.runtimeSmokeCommand !== "corepack pnpm aliyun:rds:runtime-smoke:strict") {
    blockers.push("dataLayer.runtimeSmokeCommand")
  }
  if (dataLayer.requiredBeforeRuntimeReady !== true) blockers.push("dataLayer.requiredBeforeRuntimeReady=true")

  const dependencies = Array.isArray(plan.predeployDependencies) ? plan.predeployDependencies : []
  const dependencyById = new Map(dependencies.map((item) => [item.id, item]))
  const requiredDependencyChecks = [
    ["RDS_POSTGRES_MIGRATION", "P11_ALIYUN_RDS_DATA_MIGRATION", "corepack pnpm aliyun:rds:migration:evidence:strict"],
    ["ACR_IMAGE_DIGEST_AND_PULL", "P04_ACR_IMAGE_AND_PULL", "corepack pnpm aliyun:image:plan:strict"],
    ["OSS_RUNTIME_ACCESS", "P05_OSS_RAM_STS", "corepack pnpm aliyun:cloud:confirmations:backend:strict"],
    ["BACKEND_ENV_IMPORT", "P06_ENV_IMPORT", "corepack pnpm aliyun:sensitive:blockers:backend"],
  ]
  for (const [id, authorizationPacket, evidenceCommand] of requiredDependencyChecks) {
    const item = dependencyById.get(id)
    if (!item) {
      blockers.push(`predeployDependencies:${id}`)
      continue
    }
    if (item.requiredBeforeRuntimeReady !== true) blockers.push(`predeployDependencies:${id}:requiredBeforeRuntimeReady=true`)
    if (item.authorizationPacket !== authorizationPacket) {
      blockers.push(`predeployDependencies:${id}:authorizationPacket=${authorizationPacket}`)
    }
    if (item.evidenceCommand !== evidenceCommand) blockers.push(`predeployDependencies:${id}:evidenceCommand`)
  }
  const rdsDependency = dependencyById.get("RDS_POSTGRES_MIGRATION") || {}
  if (!Array.isArray(rdsDependency.blockingCredentialNames) ||
    !rdsDependency.blockingCredentialNames.includes("DATABASE_URL_CN")) {
    blockers.push("predeployDependencies:RDS_POSTGRES_MIGRATION:blockingCredentialNames=DATABASE_URL_CN")
  }
  if (!Array.isArray(rdsDependency.supportingEvidenceCommands) ||
    !rdsDependency.supportingEvidenceCommands.includes("corepack pnpm aliyun:rds:runtime-smoke:strict")) {
    blockers.push("predeployDependencies:RDS_POSTGRES_MIGRATION:supportingEvidenceCommands")
  }

  const observability = plan.observability || {}
  if (observability.slsRequired !== true) blockers.push("observability.slsRequired")
  if (observability.healthAlertRequired !== true) blockers.push("observability.healthAlertRequired")
  if (observability.serverErrorAlertRequired !== true) blockers.push("observability.serverErrorAlertRequired")
  if (observability.cloudConfirmationKey !== "slsAlerts") blockers.push("observability.cloudConfirmationKey")

  const confirmations = plan.confirmations || {}
  if (confirmations.cloudConfirmationsFile !== "deploy/aliyun-production-cn.cloud-confirmations.local.json") {
    blockers.push("confirmations.cloudConfirmationsFile")
  }
  if (confirmations.strictCheckCommand !== "corepack pnpm aliyun:cloud:confirmations:strict") {
    blockers.push("confirmations.strictCheckCommand")
  }

  const notIncluded = Array.isArray(plan.notIncludedInFirstBridge) ? plan.notIncludedInFirstBridge : []
  if (notIncluded.some((item) => /RDS|DATABASE_URL_CN|PostgreSQL/i.test(String(item)))) {
    blockers.push("notIncludedInFirstBridge:must_not_exclude_rds")
  }
  for (const requiredText of ["Redis/Tair", "Mini-program", "Payment"]) {
    if (!notIncluded.some((item) => String(item).includes(requiredText))) {
      blockers.push(`notIncludedInFirstBridge:${requiredText}`)
    }
  }

  const security = plan.security || {}
  if (security.containsSecrets !== false) blockers.push("security.containsSecrets=false")
  if (!String(security.secretPolicy || "").includes("non-secret runtime target plan")) {
    blockers.push("security.secretPolicy")
  }

  const secretLikePaths = assertNoSecretLikeValues(plan)
  if (secretLikePaths.length) blockers.push(`contains_secret_like_values:${secretLikePaths.join(",")}`)

  if (target.provider === "ECS") warnings.push("ecs_target_requires_manual_nginx_pm2_ops")

  return {
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
  }
}

function main() {
  const args = parseArgs(process.argv)
  if (!existsSync(args.planFile)) throw new Error(`runtime_plan_not_found:${args.planFile}`)
  const plan = readJson(args.planFile)
  const validation = validatePlan(plan)
  console.log(JSON.stringify({
    ok: validation.ready,
    planFile: args.planFile,
    containsValues: false,
    environment: plan.environment || "",
    provider: plan.target?.provider || "",
    region: plan.target?.region || "",
    appName: plan.target?.appName || "",
    runtime: plan.target?.runtime || "",
    containerPort: plan.target?.containerPort || null,
    healthPath: plan.target?.healthPath || "",
    apiHost: plan.domains?.apiHost || "",
    assetHost: plan.domains?.assetHost || "",
    imageProvider: plan.image?.provider || "",
    imageRepository: plan.image?.repository || "",
    imageTag: plan.image?.tag || "",
    dataLayerTarget: plan.dataLayer?.formalTarget || "",
    dataLayerConnectionEnvName: plan.dataLayer?.connectionEnvName || "",
    voiceCoachTextRepositoryModeEnvName:
      plan.dataLayer?.voiceCoachTextRepositoryModeEnvName || "",
    voiceCoachTextRepositoryModeRequiredValue:
      plan.dataLayer?.voiceCoachTextRepositoryModeRequiredValue || "",
    voiceCoachTextRepositoryFailClosed:
      plan.dataLayer?.voiceCoachTextRepositoryFailClosed === true,
    predeployDependencyIds: Array.isArray(plan.predeployDependencies)
      ? plan.predeployDependencies.map((item) => item.id)
      : [],
    blockers: validation.blockers,
    warnings: validation.warnings,
    nextActions: [
      "按 runtime plan 在阿里云 SAE 创建 production-cn 自定义容器应用，区域 cn-hangzhou，端口 3000。",
      "先完成 ACR image-publish.local.json 非密钥证据，再把 SAE runtime 指向远端镜像。",
      "运行 corepack pnpm aliyun:cloud:confirmations:strict 和 corepack pnpm aliyun:readiness:cloud-ready 后再部署。",
    ],
  }, null, 2))
  if (!validation.ready) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-aliyun-runtime-plan.mjs [--plan deploy/aliyun-production-cn.runtime-plan.json]",
    "",
    "Validates the non-secret Aliyun production-cn SAE runtime target plan.",
    "It checks region, app name, container port, health paths, domains, image references, and secret-like values.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
