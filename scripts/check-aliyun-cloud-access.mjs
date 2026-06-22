#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_RUNTIME_PLAN_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.runtime-plan.json")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const DEFAULT_IMAGE_PUBLISH_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.image-publish.local.json")
const DEFAULT_CLOUD_ACCESS_OBSERVATION_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-access.local.json")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const EXPECTED_ALIYUN_REGION = "cn-hangzhou"
const EXPECTED_SERVICE_RECORD_OSS_PREFIX = "service-records/production-cn"

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
    runtimePlanFile: DEFAULT_RUNTIME_PLAN_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    imagePublishFile: DEFAULT_IMAGE_PUBLISH_FILE,
    cloudAccessObservationFile: DEFAULT_CLOUD_ACCESS_OBSERVATION_FILE,
    envFile: DEFAULT_ENV_FILE,
    writeReport: "",
    strict: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--runtime-plan") {
      args.runtimePlanFile = resolveValue(argv[++index], "--runtime-plan")
      continue
    }
    if (arg === "--cloud-confirmations") {
      args.cloudConfirmationsFile = resolveValue(argv[++index], "--cloud-confirmations")
      continue
    }
    if (arg === "--image-publish") {
      args.imagePublishFile = resolveValue(argv[++index], "--image-publish")
      continue
    }
    if (arg === "--cloud-access-observation") {
      args.cloudAccessObservationFile = resolveValue(argv[++index], "--cloud-access-observation")
      continue
    }
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
      continue
    }
    if (arg === "--write-report") {
      args.writeReport = resolveValue(argv[++index], "--write-report")
      continue
    }
    if (arg === "--strict") {
      args.strict = true
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

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function shell(command) {
  const result = spawnSync("sh", ["-lc", command], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  }
}

function commandPath(name) {
  const result = shell(`command -v ${name}`)
  return result.status === 0 ? result.stdout.split(/\r?\n/)[0] || "" : ""
}

function commandVersion(binary) {
  if (!binary) return ""
  const result = shell(`${quoteShell(binary)} version 2>/dev/null || ${quoteShell(binary)} --version 2>/dev/null || true`)
  return result.stdout.split(/\r?\n/).filter(Boolean).slice(0, 3).join(" | ")
}

function quoteShell(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`
}

function candidateAliyunConfigFiles() {
  const home = process.env.HOME || ""
  if (!home) return []
  return [
    resolve(home, ".aliyun/config.json"),
    resolve(home, ".aliyun/config"),
    resolve(home, ".aliyun/credentials"),
  ].map((filePath) => ({
    path: filePath,
    exists: existsSync(filePath),
    inspected: false,
    reason: "config files may contain AccessKeySecret; this check only reports existence",
  }))
}

function findSecretLikeValues(value, path = "$", matches = []) {
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) matches.push(path)
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

function normalizeCloudAccessObservation(observation) {
  if (!observation) {
    return {
      exists: false,
      ready: false,
      blockers: ["cloud_access_observation_missing"],
      warnings: [],
      browserConsole: {
        chromeLoggedIn: false,
        observedAt: "",
        evidence: "",
        resourcesObserved: [],
      },
      cloudShell: {
        connected: false,
        regionLabel: "",
        cliAvailable: false,
        cliVersion: "",
        cliConfigFileExists: false,
        canRunReadOnlyInventory: false,
        cloudApiCalled: false,
        cloudMutationPerformed: false,
        lastReadOnlyCommand: "",
        blockers: [],
        evidence: "",
      },
    }
  }

  const blockers = []
  const warnings = []
  if (observation.schemaVersion !== 1) blockers.push("schemaVersion=1")
  if (observation.environment !== "production-cn") blockers.push("environment=production-cn")
  const browserConsole = observation.browserConsole || {}
  const cloudShell = observation.cloudShell || {}
  if (cloudShell.cloudMutationPerformed === true) blockers.push("cloudshell_mutation_observed")
  if (cloudShell.cloudApiCalled === true && cloudShell.canRunReadOnlyInventory !== true) {
    warnings.push("cloudshell_api_called_but_inventory_not_ready")
  }
  if (cloudShell.connected === true && cloudShell.cliAvailable === true && cloudShell.cliConfigFileExists !== true) {
    blockers.push("cloudshell_cli_config_missing_or_unread")
  }
  const canRunReadOnlyInventory = cloudShell.canRunReadOnlyInventory === true

  return {
    exists: true,
    ready: blockers.length === 0 && canRunReadOnlyInventory,
    blockers,
    warnings,
    browserConsole: {
      chromeLoggedIn: browserConsole.chromeLoggedIn === true,
      observedAt: String(browserConsole.observedAt || ""),
      evidence: String(browserConsole.evidence || ""),
      resourcesObserved: Array.isArray(browserConsole.resourcesObserved)
        ? browserConsole.resourcesObserved.map((item) => String(item))
        : [],
    },
    cloudShell: {
      connected: cloudShell.connected === true,
      regionLabel: String(cloudShell.regionLabel || ""),
      cliAvailable: cloudShell.cliAvailable === true,
      cliVersion: String(cloudShell.cliVersion || ""),
      cliConfigFileExists: cloudShell.cliConfigFileExists === true,
      canRunReadOnlyInventory,
      cloudApiCalled: cloudShell.cloudApiCalled === true,
      cloudMutationPerformed: cloudShell.cloudMutationPerformed === true,
      lastReadOnlyCommand: String(cloudShell.lastReadOnlyCommand || ""),
      blockers: Array.isArray(cloudShell.blockers) ? cloudShell.blockers.map((item) => String(item)) : [],
      evidence: String(cloudShell.evidence || ""),
    },
  }
}

function buildObservedResourceStatuses(cloudAccessObservation) {
  const lines = cloudAccessObservation.browserConsole?.resourcesObserved || []
  const saeLine = findObservedLine(lines, /SAE console accessible/i)
  const acrLine = findObservedLine(lines, /ACR Enterprise Economic/i)
  const ossLine = findObservedLine(lines, /OSS bucket/i)
  const dnsLine = findObservedLine(lines, /DNS ipgongchang\.xin/i)
  const slsLine = findObservedLine(lines, /SLS logsearch URL visible/i)
  const cloudShellLine = findObservedLine(lines, /Cloud Shell tab/i)
  const localCliLine = findObservedLine(lines, /Local macOS aliyun CLI installed/i)

  return [
    {
      id: "localAliyunCli",
      title: "本机 Aliyun CLI",
      status: localCliLine ? "cli_installed_config_missing_or_unread" : "not_observed",
      readiness: "blocked",
      observed: Boolean(localCliLine),
      currentObservation: localCliLine,
      nextAction: "通过阿里云官方登录/配置方式补齐只读 inventory 所需 CLI 配置；不要把 AccessKeySecret 写入仓库。",
      writeTarget: "deploy/aliyun-production-cn.cloud-access.local.json -> cloudShell / browserConsole non-secret evidence",
    },
    {
      id: "saeRuntime",
      title: "SAE production-cn 自定义容器应用",
      status: saeLine
        ? /not created|暂无实例|not proven created/i.test(saeLine)
          ? "not_created_or_not_confirmed"
          : "console_accessible_unconfirmed"
        : "not_observed",
      readiness: "blocked",
      observed: Boolean(saeLine),
      currentObservation: saeLine,
      nextAction: "创建或确认 cn-hangzhou SAE 应用 meiye-huajing-app-api-production-cn，容器端口 3000，健康检查 /api/healthz。",
      writeTarget: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime",
    },
    {
      id: "acrPurchase",
      title: "ACR 企业版实例和镜像仓库",
      status: acrLine
        ? /not purchased/i.test(acrLine)
          ? "purchase_candidate_visible_not_purchased"
          : "purchase_or_instance_visible_unconfirmed"
        : "not_observed",
      readiness: "blocked",
      observed: Boolean(acrLine),
      currentObservation: acrLine,
      nextAction: "动作时确认 ACR Enterprise Economic / cn-hangzhou / 1 month / CNY 117.00 后，购买实例并创建 namespace/repository。",
      writeTarget: "deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr non-secret evidence",
    },
    {
      id: "ossAudio",
      title: "服务记录音频 OSS Bucket",
      status: ossLine ? "bucket_visible_unconfirmed" : "not_observed",
      readiness: "partial",
      observed: Boolean(ossLine),
      currentObservation: ossLine,
      nextAction: "继续确认 CORS、RAM 最小权限和 service-records/production-cn 前缀；只记录 bucket/region/布尔证据。",
      writeTarget: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss",
    },
    {
      id: "domainDns",
      title: "ipgongchang.xin DNS 与 api-cn/assets-cn 记录",
      status: dnsLine
        ? /no explicit api-cn\/assets-cn|no api-cn\/assets-cn host record/i.test(dnsLine)
          ? "domain_visible_records_missing"
          : "domain_visible_unconfirmed"
        : "not_observed",
      readiness: "blocked",
      observed: Boolean(dnsLine),
      currentObservation: dnsLine,
      nextAction: "补齐 api-cn.ipgongchang.xin 与 assets-cn.ipgongchang.xin 解析到阿里云入口，并确认 HTTPS/ICP。",
      writeTarget: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps / items.assetDomainHttps",
    },
    {
      id: "slsAlerts",
      title: "SLS 日志项目和 health/5xx 告警",
      status: slsLine
        ? /alerts still pending/i.test(slsLine)
          ? "project_logstore_visible_alerts_pending"
          : "project_logstore_visible_unconfirmed"
        : "not_observed",
      readiness: "partial",
      observed: Boolean(slsLine),
      currentObservation: slsLine,
      nextAction: "SAE runtime ready 后配置日志采集、/api/healthz 健康告警和 5xx 告警。",
      writeTarget: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts",
    },
    {
      id: "cloudShellInventory",
      title: "Cloud Shell 只读盘点能力",
      status: cloudAccessObservation.cloudShell?.canRunReadOnlyInventory === true
        ? "readonly_inventory_ready"
        : cloudShellLine
          ? "cloudshell_disconnected_or_config_missing"
          : "not_observed",
      readiness: cloudAccessObservation.cloudShell?.canRunReadOnlyInventory === true ? "ready" : "blocked",
      observed: Boolean(cloudShellLine) || cloudAccessObservation.cloudShell?.connected === true,
      currentObservation: cloudShellLine || cloudAccessObservation.cloudShell?.evidence || "",
      nextAction: "只有 Cloud Shell/CLI 配置 ready 后，才运行受控只读 inventory runner；否则继续用控制台人工证据。",
      writeTarget: "deploy/aliyun-production-cn.cloud-inventory-results.local.json",
    },
  ]
}

function findObservedLine(lines, pattern) {
  return lines.find((line) => pattern.test(line)) || ""
}

function summarizeObservedResourceStatuses(items) {
  return {
    total: items.length,
    ready: items.filter((item) => item.readiness === "ready").length,
    partial: items.filter((item) => item.readiness === "partial").length,
    blocked: items.filter((item) => item.readiness === "blocked").length,
    observed: items.filter((item) => item.observed === true).length,
    notObserved: items.filter((item) => item.observed !== true).length,
    blockedIds: items.filter((item) => item.readiness === "blocked").map((item) => item.id),
  }
}

function buildConsoleChecklist(runtimePlan, cloudConfirmations, imagePublish) {
  const target = runtimePlan?.target || {}
  const image = runtimePlan?.image || {}
  const domains = runtimePlan?.domains || {}
  const cloudItems = cloudConfirmations?.items || {}
  const localImage = imagePublish?.image || {}
  const acr = imagePublish?.acr || {}
  return [
    {
      id: "saeRuntime",
      title: "SAE production-cn 自定义容器应用",
      consolePath: "阿里云控制台 -> SAE -> cn-hangzhou -> 应用列表",
      expected: {
        provider: "SAE",
        region: target.region || EXPECTED_ALIYUN_REGION,
        appName: target.appName || "meiye-huajing-app-api-production-cn",
        containerPort: target.containerPort || 3000,
        healthPath: target.healthPath || "/api/healthz",
      },
      currentLocalEvidence: cloudItems.runtime?.evidence || "",
      writeTo: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime",
      nonSecretFieldsToRecord: ["confirmed", "provider", "region", "appName", "containerPort", "healthPath", "evidence"],
    },
    {
      id: "acrImage",
      title: "ACR 镜像仓库与 production-cn 镜像 digest",
      consolePath: "阿里云控制台 -> 容器镜像服务 ACR -> cn-hangzhou -> 命名空间/仓库",
      expected: {
        provider: "Aliyun ACR",
        region: acr.region || EXPECTED_ALIYUN_REGION,
        repository: image.repository || acr.repository || "meiye-huajing-app-api",
        tag: image.tag || acr.remoteTag || "production-cn",
        localTag: localImage.localTag || image.localImage || "meiye-huajing-app-api:production-cn",
      },
      currentLocalEvidence: acr.evidence || "",
      writeTo: "deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime",
      nonSecretFieldsToRecord: [
        "registryHost",
        "namespace",
        "remoteImage",
        "remoteDigest",
        "imagePushed",
        "digestVerified",
        "runtime.remoteImageConfigured",
        "runtime.imagePullConfigured",
        "evidence",
      ],
    },
    {
      id: "apiDomain",
      title: "api-cn DNS、HTTPS、ICP",
      consolePath: "阿里云控制台 -> 云解析 DNS / 数字证书管理服务 / SAE 或网关入口",
      expected: {
        host: domains.apiHost || "api-cn.ipgongchang.xin",
        healthUrl: domains.apiHealthUrl || "https://api-cn.ipgongchang.xin/api/healthz",
      },
      currentLocalEvidence: cloudItems.apiDomainHttps?.evidence || "",
      writeTo: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps",
      nonSecretFieldsToRecord: ["confirmed", "dnsResolvedToAliyun", "httpsEnabled", "icpReady", "evidence"],
    },
    {
      id: "assetDomain",
      title: "assets-cn DNS、HTTPS、ICP",
      consolePath: "阿里云控制台 -> 云解析 DNS / CDN 或 OSS 自定义域名 / 数字证书管理服务",
      expected: {
        host: domains.assetHost || "assets-cn.ipgongchang.xin",
      },
      currentLocalEvidence: cloudItems.assetDomainHttps?.evidence || "",
      writeTo: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps",
      nonSecretFieldsToRecord: ["confirmed", "dnsResolvedToAliyun", "httpsEnabled", "icpReady", "evidence"],
    },
    {
      id: "ossAudio",
      title: "服务记录音频 OSS、CORS、RAM 最小权限",
      consolePath: "阿里云控制台 -> OSS Bucket / RAM 访问控制",
      expected: {
        region: EXPECTED_ALIYUN_REGION,
        serviceRecordPrefix: EXPECTED_SERVICE_RECORD_OSS_PREFIX,
      },
      currentLocalEvidence: cloudItems.oss?.evidence || "",
      writeTo: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss",
      nonSecretFieldsToRecord: ["confirmed", "bucket", "region", "corsConfigured", "ramLeastPrivilege", "serviceRecordPrefix", "evidence"],
    },
    {
      id: "envImport",
      title: "SAE/KMS/Secrets Manager 环境变量导入",
      consolePath: "阿里云控制台 -> SAE 应用 -> 环境变量 / KMS / Secrets Manager",
      expected: {
        envFile: DEFAULT_ENV_FILE,
        planCommand: "corepack pnpm aliyun:env:plan",
      },
      currentLocalEvidence: cloudItems.envImport?.evidence || "",
      writeTo: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport",
      nonSecretFieldsToRecord: ["confirmed", "target", "importedAt", "secretNotInImage", "evidence"],
    },
    {
      id: "slsAlerts",
      title: "SLS 日志和 health/5xx 告警",
      consolePath: "阿里云控制台 -> 日志服务 SLS / 应用监控告警",
      expected: {
        healthPath: target.healthPath || "/api/healthz",
        serverErrorAlert: "5xx",
      },
      currentLocalEvidence: cloudItems.slsAlerts?.evidence || "",
      writeTo: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts",
      nonSecretFieldsToRecord: ["confirmed", "slsProject", "healthAlertConfigured", "serverErrorAlertConfigured", "evidence"],
    },
  ].map((item) => ({
    ...item,
    forbidden: [
      "AccessKeySecret",
      "AppSecret",
      "registry password",
      "RAM Secret",
      "token",
      "cookie",
      "Supabase service role key",
    ],
  }))
}

function main() {
  const args = parseArgs(process.argv)
  const aliyunPath = commandPath("aliyun")
  const aliyuncliPath = commandPath("aliyuncli")
  const runtimePlan = readJsonIfExists(args.runtimePlanFile)
  const cloudConfirmations = readJsonIfExists(args.cloudConfirmationsFile)
  const imagePublish = readJsonIfExists(args.imagePublishFile)
  const cloudAccessObservation = normalizeCloudAccessObservation(readJsonIfExists(args.cloudAccessObservationFile))
  const configFiles = candidateAliyunConfigFiles()
  const cliConfigExists = configFiles.some((item) => item.exists)
  const cliAvailable = Boolean(aliyunPath || aliyuncliPath)
  const observedResourceStatuses = buildObservedResourceStatuses(cloudAccessObservation)
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    cloudMutationPerformed: false,
    cloudApiCalled: false,
    canReadCloudNow: (cliAvailable && cliConfigExists) || cloudAccessObservation.ready,
    files: {
      runtimePlanFile: args.runtimePlanFile,
      runtimePlanFileExists: existsSync(args.runtimePlanFile),
      cloudConfirmationsFile: args.cloudConfirmationsFile,
      cloudConfirmationsFileExists: existsSync(args.cloudConfirmationsFile),
      imagePublishFile: args.imagePublishFile,
      imagePublishFileExists: existsSync(args.imagePublishFile),
      cloudAccessObservationFile: args.cloudAccessObservationFile,
      cloudAccessObservationFileExists: existsSync(args.cloudAccessObservationFile),
      envFile: args.envFile,
      envFileExists: existsSync(args.envFile),
    },
    cli: {
      available: cliAvailable,
      binary: aliyunPath || aliyuncliPath || "",
      version: commandVersion(aliyunPath || aliyuncliPath),
      configFileExists: cliConfigExists,
      configFiles,
      note: "No Aliyun cloud API is called by this script. It only checks whether this machine can plausibly run read-only Aliyun CLI inventory later.",
    },
    cloudShellObservation: cloudAccessObservation,
    observedResourceStatusSummary: summarizeObservedResourceStatuses(observedResourceStatuses),
    observedResourceStatuses,
    targets: {
      provider: runtimePlan?.target?.provider || "SAE",
      region: runtimePlan?.target?.region || EXPECTED_ALIYUN_REGION,
      appName: runtimePlan?.target?.appName || "meiye-huajing-app-api-production-cn",
      apiHost: runtimePlan?.domains?.apiHost || "api-cn.ipgongchang.xin",
      assetHost: runtimePlan?.domains?.assetHost || "assets-cn.ipgongchang.xin",
      imageRepository: runtimePlan?.image?.repository || "meiye-huajing-app-api",
      imageTag: runtimePlan?.image?.tag || "production-cn",
    },
    consoleEvidenceChecklist: buildConsoleChecklist(runtimePlan, cloudConfirmations, imagePublish),
    blockers: [],
    nextActions: [],
  }

  if (!cliAvailable) {
    report.blockers.push("aliyun_cli_missing")
    report.nextActions.push("本机未发现 aliyun CLI；继续使用阿里云控制台只读确认，或安装/登录 aliyun CLI 后再补自动 inventory。")
  }
  if (cliAvailable && !cliConfigExists) {
    report.blockers.push("aliyun_cli_config_missing_or_unread")
    report.nextActions.push("本机发现 aliyun CLI，但未发现常见配置文件；不要把 AccessKey 写入仓库，优先使用阿里云官方登录/配置方式。")
  }
  if (cloudAccessObservation.exists && cloudAccessObservation.ready !== true) {
    report.blockers.push(...cloudAccessObservation.blockers)
    if (cloudAccessObservation.cloudShell.connected && cloudAccessObservation.cloudShell.cliAvailable) {
      report.nextActions.push("Cloud Shell 已能启动 aliyun CLI，但当前观察显示缺 CLI 配置；只能继续用控制台页面核验证据，不能声称已具备自动云 API inventory。")
    }
  }
  if (!cloudAccessObservation.exists) {
    report.nextActions.push("如使用已登录 Chrome 或 Cloud Shell 做云侧只读核验，把非密钥观察写入 deploy/aliyun-production-cn.cloud-access.local.json。")
  }
  report.nextActions.push("从控制台读取资源名、布尔状态、digest 和证据编号后，只写入 ignored 的 .local.json；不要写入任何密钥。")
  report.nextActions.push("云资源配置完成后运行 corepack pnpm aliyun:cloud:confirmations:strict、corepack pnpm aliyun:image:plan:strict、corepack pnpm aliyun:domain:strict。")

  const secretLikePaths = findSecretLikeValues(report)
  if (secretLikePaths.length) {
    report.ok = false
    report.blockers.push(`report_contains_secret_like_values:${secretLikePaths.join(",")}`)
  }

  const json = JSON.stringify(report, null, 2)
  if (args.writeReport) writeFileSync(args.writeReport, `${json}\n`, { mode: 0o600 })
  console.log(json)
  if (args.strict && !report.canReadCloudNow) process.exit(1)
  if (!report.ok) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-aliyun-cloud-access.mjs [--strict] [--write-report /tmp/report.json]",
    "  node scripts/check-aliyun-cloud-access.mjs --cloud-access-observation deploy/aliyun-production-cn.cloud-access.local.json",
    "",
    "Checks whether this machine can perform read-only Aliyun cloud inventory and prints",
    "a non-secret console evidence checklist for production-cn cloud confirmations.",
    "It does not call Aliyun cloud APIs, create resources, change DNS, push images, or read CLI secrets.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
