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
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")

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
        region: target.region || "cn-hangzhou",
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
        region: acr.region || "cn-hangzhou",
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
        region: cloudItems.oss?.region || "cn-hangzhou",
        serviceRecordPrefix: cloudItems.oss?.serviceRecordPrefix || "service-records/production-cn",
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
  const configFiles = candidateAliyunConfigFiles()
  const cliConfigExists = configFiles.some((item) => item.exists)
  const cliAvailable = Boolean(aliyunPath || aliyuncliPath)
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    cloudMutationPerformed: false,
    cloudApiCalled: false,
    canReadCloudNow: cliAvailable && cliConfigExists,
    files: {
      runtimePlanFile: args.runtimePlanFile,
      runtimePlanFileExists: existsSync(args.runtimePlanFile),
      cloudConfirmationsFile: args.cloudConfirmationsFile,
      cloudConfirmationsFileExists: existsSync(args.cloudConfirmationsFile),
      imagePublishFile: args.imagePublishFile,
      imagePublishFileExists: existsSync(args.imagePublishFile),
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
    targets: {
      provider: runtimePlan?.target?.provider || "SAE",
      region: runtimePlan?.target?.region || "cn-hangzhou",
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
