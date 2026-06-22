#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { LOCAL_PREDEPLOY_CHECKS } from "./aliyun-predeploy-commands.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_SPEC_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.example.json")

const REQUIRED_PREDEPLOY_CHECKS = [
  "corepack pnpm aliyun:deploy:spec",
  "corepack pnpm aliyun:image:plan",
  "corepack pnpm aliyun:legal:check",
  "corepack pnpm aliyun:operator:tasks",
  "corepack pnpm aliyun:sensitive:blockers",
  "corepack pnpm aliyun:resources:matrix",
  "corepack pnpm aliyun:wechat-open:package",
  "corepack pnpm aliyun:status",
  "corepack pnpm aliyun:cloud:access",
  "corepack pnpm aliyun:cloud:confirmations",
  "corepack pnpm aliyun:readiness",
  "corepack pnpm aliyun:env:sources",
  "corepack pnpm aliyun:domain:check",
  "corepack pnpm aliyun:runtime:plan",
  "corepack pnpm aliyun:cloud:check",
  "corepack pnpm aliyun:readiness:cloud-ready",
  "corepack pnpm aliyun:release:artifacts",
  "corepack pnpm aliyun:app-api:bridge-map",
  "corepack pnpm aliyun:app-client:contract",
  "corepack pnpm aliyun:app-config:check",
  "corepack pnpm aliyun:app-native:check",
  "corepack pnpm aliyun:app-api:coverage",
  "corepack pnpm aliyun:predeploy",
  "corepack pnpm aliyun:docker:build",
  "corepack pnpm aliyun:container:smoke",
]

const REQUIRED_POSTDEPLOY_CHECKS = [
  "corepack pnpm aliyun:domain:strict",
  "corepack pnpm aliyun:cloud:confirmations:strict",
  "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin",
  "corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin",
  "corepack pnpm aliyun:app-api:smoke -- --base-url https://api-cn.ipgongchang.xin",
]

const REQUIRED_EXTERNAL_CONFIRMATIONS = [
  "SAE application created",
  "Aliyun ACR image pushed and runtime image pull configured",
  "api-cn DNS, HTTPS, and ICP configured",
  "assets-cn DNS, HTTPS, and ICP configured",
  "OSS CORS and RAM least-privilege policy confirmed",
  "WeChat Open Platform mobile app credentials configured",
  "Production environment variables imported without secrets in image",
  "SLS logging and alerts configured",
]

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
    specFile: DEFAULT_SPEC_FILE,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--spec") {
      args.specFile = resolveValue(argv[++index], "--spec")
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

function requireText(value) {
  return Boolean(String(value || "").trim())
}

function requireArray(value) {
  return Array.isArray(value) ? value : []
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

function validateSpec(spec) {
  const blockers = []
  const warnings = []

  if (spec.name !== "meiye-huajing-app-api") blockers.push("name")
  if (spec.environment !== "production-cn") blockers.push("environment")
  if (spec.region !== "cn-hangzhou") warnings.push("region_not_cn_hangzhou")
  if (spec.runtime !== "custom-container") blockers.push("runtime")

  const container = spec.container || {}
  if (container.image !== "meiye-huajing-app-api:production-cn") blockers.push("container.image")
  if (Number(container.port) !== 3000) blockers.push("container.port=3000")
  if (container.healthPath !== "/api/healthz") blockers.push("container.healthPath")
  if (container.strictHealthPath !== "/api/app/health?strict=1") blockers.push("container.strictHealthPath")

  const runtimePlan = spec.runtimePlan || {}
  if (runtimePlan.file !== "deploy/aliyun-production-cn.runtime-plan.json") blockers.push("runtimePlan.file")
  if (runtimePlan.checkCommand !== "corepack pnpm aliyun:runtime:plan") blockers.push("runtimePlan.checkCommand")
  if (runtimePlan.provider !== "SAE") blockers.push("runtimePlan.provider=SAE")
  if (runtimePlan.region !== "cn-hangzhou") blockers.push("runtimePlan.region=cn-hangzhou")
  if (runtimePlan.appName !== "meiye-huajing-app-api-production-cn") blockers.push("runtimePlan.appName")
  if (!String(runtimePlan.note || "").includes("SAE custom container")) blockers.push("runtimePlan.note")

  const imagePublish = spec.imagePublish || {}
  if (imagePublish.exampleFile !== "deploy/aliyun-production-cn.image-publish.example.json") {
    blockers.push("imagePublish.exampleFile")
  }
  if (imagePublish.localFile !== "deploy/aliyun-production-cn.image-publish.local.json") {
    blockers.push("imagePublish.localFile")
  }
  if (imagePublish.checkCommand !== "corepack pnpm aliyun:image:plan") {
    blockers.push("imagePublish.checkCommand")
  }
  if (imagePublish.strictCheckCommand !== "corepack pnpm aliyun:image:plan:strict") {
    blockers.push("imagePublish.strictCheckCommand")
  }
  if (imagePublish.provider !== "Aliyun ACR") blockers.push("imagePublish.provider")
  if (imagePublish.registryRegion !== "cn-hangzhou") blockers.push("imagePublish.registryRegion")
  if (imagePublish.remoteRepository !== "meiye-huajing-app-api") blockers.push("imagePublish.remoteRepository")
  if (imagePublish.remoteTag !== "production-cn") blockers.push("imagePublish.remoteTag")
  if (!String(imagePublish.secretsPolicy || "").includes("Do not store ACR username")) {
    blockers.push("imagePublish.secretsPolicy")
  }

  const domain = spec.domain || {}
  if (domain.apiHost !== "api-cn.ipgongchang.xin") blockers.push("domain.apiHost")
  if (domain.assetHost !== "assets-cn.ipgongchang.xin") blockers.push("domain.assetHost")
  if (domain.httpsRequired !== true) blockers.push("domain.httpsRequired")
  if (domain.dnsProvider !== "aliyun") blockers.push("domain.dnsProvider")
  for (const host of [domain.apiHost, domain.assetHost]) {
    if (FORBIDDEN_HOSTS.has(String(host || ""))) blockers.push(`forbidden_host:${host}`)
    if (String(host || "").endsWith(".vercel.app")) blockers.push(`forbidden_vercel_host:${host}`)
  }

  const environmentImport = spec.environmentImport || {}
  if (environmentImport.localEnvFile !== "/Users/Admin/Documents/美业话镜APP/.env.production-cn.local") {
    blockers.push("environmentImport.localEnvFile")
  }
  if (environmentImport.exampleEnvFile !== "/Users/Admin/Documents/美业话镜APP/.env.production-cn.example") {
    blockers.push("environmentImport.exampleEnvFile")
  }
  if (!String(environmentImport.secretsPolicy || "").includes("Do not bake secrets into the image")) {
    blockers.push("environmentImport.secretsPolicy")
  }

  const cloudConfirmations = spec.cloudConfirmations || {}
  if (cloudConfirmations.exampleFile !== "deploy/aliyun-production-cn.cloud-confirmations.example.json") {
    blockers.push("cloudConfirmations.exampleFile")
  }
  if (cloudConfirmations.localFile !== "deploy/aliyun-production-cn.cloud-confirmations.local.json") {
    blockers.push("cloudConfirmations.localFile")
  }
  if (cloudConfirmations.checkCommand !== "corepack pnpm aliyun:cloud:confirmations") {
    blockers.push("cloudConfirmations.checkCommand")
  }
  if (cloudConfirmations.strictCheckCommand !== "corepack pnpm aliyun:cloud:confirmations:strict") {
    blockers.push("cloudConfirmations.strictCheckCommand")
  }
  if (cloudConfirmations.operatorTasksCommand !== "corepack pnpm aliyun:operator:tasks") {
    blockers.push("cloudConfirmations.operatorTasksCommand")
  }
  if (cloudConfirmations.statusCommand !== "corepack pnpm aliyun:status") {
    blockers.push("cloudConfirmations.statusCommand")
  }

  const predeployChecks = requireArray(spec.predeployChecks)
  for (const command of REQUIRED_PREDEPLOY_CHECKS) {
    if (!predeployChecks.includes(command)) blockers.push(`predeployChecks:${command}`)
  }

  const localPredeployChecks = requireArray(spec.localPredeployChecks)
  if (localPredeployChecks.length !== LOCAL_PREDEPLOY_CHECKS.length) {
    blockers.push(`localPredeployChecks:length=${LOCAL_PREDEPLOY_CHECKS.length}`)
  }
  for (const command of LOCAL_PREDEPLOY_CHECKS) {
    if (!localPredeployChecks.includes(command)) blockers.push(`localPredeployChecks:${command}`)
  }
  for (const command of localPredeployChecks) {
    if (!LOCAL_PREDEPLOY_CHECKS.includes(command)) blockers.push(`localPredeployChecks:unexpected:${command}`)
  }

  const postdeployChecks = requireArray(spec.postdeployChecks)
  for (const command of REQUIRED_POSTDEPLOY_CHECKS) {
    if (!postdeployChecks.includes(command)) blockers.push(`postdeployChecks:${command}`)
  }

  const externalConfirmations = requireArray(spec.requiredExternalConfirmations)
  if (externalConfirmations.length !== REQUIRED_EXTERNAL_CONFIRMATIONS.length) {
    blockers.push(`requiredExternalConfirmations:length=${REQUIRED_EXTERNAL_CONFIRMATIONS.length}`)
  }
  for (const confirmation of REQUIRED_EXTERNAL_CONFIRMATIONS) {
    if (!externalConfirmations.includes(confirmation)) {
      blockers.push(`requiredExternalConfirmations:${confirmation}`)
    }
  }

  const bridgeDataLayer = spec.bridgeDataLayer || {}
  if (bridgeDataLayer.current !== "Supabase") blockers.push("bridgeDataLayer.current")
  if (bridgeDataLayer.target !== "Aliyun RDS PostgreSQL") blockers.push("bridgeDataLayer.target")
  if (!String(bridgeDataLayer.status || "").includes("not included")) blockers.push("bridgeDataLayer.status")

  const secretLikePaths = assertNoSecretLikeValues(spec)
  if (secretLikePaths.length) blockers.push(`contains_secret_like_values:${secretLikePaths.join(",")}`)

  if (!requireText(spec.name) || !requireText(spec.environment)) blockers.push("required_top_level_text")

  return {
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    predeployChecks: predeployChecks.length,
    postdeployChecks: postdeployChecks.length,
    requiredExternalConfirmations: externalConfirmations.length,
  }
}

function main() {
  const args = parseArgs(process.argv)
  if (!existsSync(args.specFile)) throw new Error(`spec_file_not_found:${args.specFile}`)
  const spec = readJson(args.specFile)
  const validation = validateSpec(spec)
  console.log(JSON.stringify({
    ok: validation.ready,
    specFile: args.specFile,
    containsValues: false,
    environment: spec.environment || "",
    image: spec.container?.image || "",
    runtimePlan: {
      provider: spec.runtimePlan?.provider || "",
      region: spec.runtimePlan?.region || "",
      appName: spec.runtimePlan?.appName || "",
      checkCommand: spec.runtimePlan?.checkCommand || "",
    },
    imagePublish: {
      provider: spec.imagePublish?.provider || "",
      registryRegion: spec.imagePublish?.registryRegion || "",
      remoteRepository: spec.imagePublish?.remoteRepository || "",
      remoteTag: spec.imagePublish?.remoteTag || "",
      checkCommand: spec.imagePublish?.checkCommand || "",
    },
    port: spec.container?.port || null,
    apiHost: spec.domain?.apiHost || "",
    assetHost: spec.domain?.assetHost || "",
    localPredeployChecks: requireArray(spec.localPredeployChecks).length,
    predeployChecks: validation.predeployChecks,
    postdeployChecks: validation.postdeployChecks,
    requiredExternalConfirmations: validation.requiredExternalConfirmations,
    blockers: validation.blockers,
    warnings: validation.warnings,
    nextActions: [
      "保持 deploy/aliyun-production-cn.example.json 只包含部署规格和命令，不包含密钥值。",
      "选择阿里云 ACR 后复制 image-publish example 到 .local.json，只填写非密钥镜像和运行时证据。",
      "云资源确认完成后先跑 corepack pnpm aliyun:cloud:confirmations:strict。",
      "正式部署前后按 predeployChecks / postdeployChecks 顺序执行。",
    ],
  }, null, 2))
  if (!validation.ready) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-aliyun-deployment-spec.mjs [--spec deploy/aliyun-production-cn.example.json]",
    "",
    "Validates the non-secret Aliyun production-cn deployment specification.",
    "It checks image, port, domains, health paths, required gate commands, and secret-like value patterns.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
