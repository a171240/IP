#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { buildImportPlan, parseEnvFile } from "./prepare-aliyun-runtime-env.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")

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

function runJson(label, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
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

function readJsonIfExists(filePath) {
  if (!filePath || !existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function buildCloudConfirmationIndex(readiness) {
  const items = readiness.checks?.cloudConfirmations?.items || []
  return new Map(items.map((item) => [item.key, item]))
}

function buildTasks({ envPlan, readiness, domain, imagePublishPlan }) {
  const cloud = buildCloudConfirmationIndex(readiness)
  const tasks = []

  addTask(tasks, {
    id: "T01_WECHAT_OPEN_PLATFORM_APP_LOGIN",
    title: "微信开放平台移动应用审核和 APP 登录凭证",
    status: readiness.checks?.wechatOpenPlatform?.ready ? "ready" : "blocked",
    blockerCodes: readiness.machineBlocking.filter((item) =>
      item.includes("WECHAT_OPEN") ||
      item.includes("wechat_open_platform") ||
      item.includes("invalid_app_native_release_config") ||
      item.includes("app_native:") ||
      item.includes("invalid_app_universal_link_config") ||
      item.includes("app_universal_link:")
    ),
    owner: "用户/微信开放平台操作员",
    consolePath: "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App",
    actions: [
      "等待移动应用审核状态从 reviewing 变为 approved。",
      "确认移动应用名称为“美业话镜”，对应本机 APP 工程，而不是小程序应用。",
      "审核通过后获取移动应用 AppID，填入 WECHAT_OPEN_APP_ID。",
      "获取移动应用 AppSecret，填入 WECHAT_OPEN_APP_SECRET。",
      "确认 Android 包名为 com.ipgongchang.meiyehuajing，并从 release 签名证书取得微信开放平台要求的 Android 应用签名。",
      "确认 iOS Bundle ID 为 com.ipgongchang.meiyehuajing，并配置 HTTPS Universal Link。",
      "从 Apple Developer 确认 10 位 Team ID，填入 APPLE_TEAM_ID，用于后端 AASA 路由生成 iOS appID。",
      "运行 corepack pnpm aliyun:app-native:check，确认 APP 原生发布配置状态进入 release audit。",
      "运行 corepack pnpm aliyun:aasa:check，确认后端 AASA 路由和 APPLE_TEAM_ID 状态。",
      "在 deploy/aliyun-production-cn.cloud-confirmations.local.json 的 wechatOpenPlatform 项记录非密钥证据。",
    ],
    evidence: [
      "reviewStatus=approved",
      "mobileAppName=美业话镜",
      "mobileAppIdReady=true",
      "mobileAppSecretReady=true",
      "androidPackageName=com.ipgongchang.meiyehuajing",
      "androidSignature=<release 签名证据，不是 debug keystore>",
      "androidConfigured=true",
      "iosBundleId=com.ipgongchang.meiyehuajing",
      "iosUniversalLink=https://...",
      "APPLE_TEAM_ID ready",
      "iosConfigured=true",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:app-native:check",
      "corepack pnpm aliyun:aasa:check",
      "corepack pnpm aliyun:readiness",
      "curl -i https://api-cn.ipgongchang.xin/.well-known/apple-app-site-association after deployment",
      "GET https://api-cn.ipgongchang.xin/api/app/health?strict=1 after deployment",
    ],
    notes: [
      "不能用小程序 AppID/Secret 替代 APP 微信登录。",
      "脚本只记录变量名和状态，不输出 AppSecret。",
    ],
  })

  const legalBlocking = envPlan.summary.requiredBlocking
    .filter((key) => key === "PRIVACY_POLICY_URL" || key === "TERMS_URL")
    .map((key) => `missing_required_env:${key}`)
  addTask(tasks, {
    id: "T02_APP_LEGAL_LINKS",
    title: "国内 APP 隐私政策和用户协议正式 URL",
    status: legalBlocking.length ? "blocked" : "ready",
    blockerCodes: legalBlocking,
    owner: "产品/法务/发布操作员",
    consolePath: "自有备案 HTTPS 域名或可公开访问的正式协议页面",
    actions: [
      "先确认后端包内 /privacy 与 /terms 页面存在，并由运营者复核协议文本。",
      "确认隐私政策正式页面 URL，并填入 PRIVACY_POLICY_URL。",
      "确认用户协议或服务条款正式页面 URL，并填入 TERMS_URL。",
      "两个 URL 必须是正式 HTTPS 页面，不能是 TODO、localhost、临时预览或仅本地文件。",
      "APP 国内发布材料、登录/注册入口和后端 health 门禁应使用同一组正式 URL。",
      "导入阿里云运行环境后，/api/app/health?strict=1 不应再缺 legalLinks。",
    ],
    evidence: [
      "corepack pnpm aliyun:legal:check 通过",
      "PRIVACY_POLICY_URL ready",
      "TERMS_URL ready",
      "GET /privacy 和 GET /terms 返回美业话镜 APP 协议页面",
      "GET /api/app/health?strict=1 missing 不包含 legalLinks",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:legal:check",
      "corepack pnpm aliyun:env:check",
      "corepack pnpm aliyun:health:smoke",
      "corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin",
    ],
  })

  const runtime = cloud.get("runtime")
  addTask(tasks, {
    id: "T03_ALIYUN_RUNTIME_CONTAINER",
    title: "创建或确认阿里云后端运行容器",
    status: runtime?.ready ? "ready" : "pending_cloud",
    blockerCodes: missingList(runtime),
    owner: "阿里云操作员",
    consolePath: "阿里云控制台 -> SAE 或 ECS/容器服务",
    actions: [
      "创建或确认 production-cn 后端应用，建议名称 meiye-huajing-app-api-production-cn。",
      "运行区域使用 cn-hangzhou，容器监听端口 3000。",
      "健康检查路径配置为 /api/healthz。",
      "镜像或构建上下文使用后端仓库 Dockerfile，密钥通过运行环境变量或 KMS/Secrets Manager 导入。",
      "在 cloud-confirmations.local.json 的 runtime 项写入应用名、端口和非密钥证据。",
    ],
    evidence: [
      "provider=SAE 或 ECS",
      "containerPort=3000",
      "healthPath=/api/healthz",
      "confirmed=true",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:docker:check",
      "corepack pnpm aliyun:health:smoke",
    ],
  })

  addTask(tasks, {
    id: "T03B_ALIYUN_ACR_IMAGE_PUBLISH",
    title: "发布后端 Docker 镜像到阿里云 ACR 并配置运行时拉取",
    status: imagePublishPlan?.ready ? "ready" : imagePublishPlan?.template?.ready === false ? "blocked" : "pending_cloud",
    blockerCodes: [
      ...(imagePublishPlan?.template?.blockers || []).map((item) => `imagePublishTemplate:${item}`),
      ...(imagePublishPlan?.local?.blockers || []).map((item) => `imagePublishLocal:${item}`),
    ],
    owner: "阿里云 ACR/后端发布操作员",
    consolePath: "阿里云控制台 -> 容器镜像服务 ACR / SAE 或 ECS 容器运行时",
    actions: [
      "复制 deploy/aliyun-production-cn.image-publish.example.json 到 deploy/aliyun-production-cn.image-publish.local.json。",
      "确认 ACR region 为 cn-hangzhou，repository 为 meiye-huajing-app-api，tag 为 production-cn。",
      "先运行 corepack pnpm aliyun:docker:build 和 corepack pnpm aliyun:container:smoke。",
      "通过 docker login 或阿里云镜像构建服务把镜像推送/导入 ACR；不要把 registry 密码、RAM Secret 或 token 写入 JSON、文档或 git。",
      "配置 SAE/ECS 使用 ACR remoteImage，并确认运行时有镜像拉取权限。",
      "把 remote image、digest、push evidence 和 runtime image pull evidence 写入 image-publish.local.json。",
    ],
    evidence: [
      "acr.confirmed=true",
      "imagePushed=true",
      "digestVerified=true",
      "runtime.remoteImageConfigured=true",
      "runtime.imagePullConfigured=true",
      "corepack pnpm aliyun:image:plan:strict pass",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:image:plan",
      "corepack pnpm aliyun:docker:build",
      "corepack pnpm aliyun:container:smoke",
      "corepack pnpm aliyun:image:plan:strict",
    ],
    notes: [
      "image-publish.local.json 只记录非密钥镜像发布证据。",
      "ACR 登录凭证只能放在 docker credential helper、RAM/KMS/Secrets Manager 或阿里云运行时配置里。",
    ],
  })

  const apiDomain = cloud.get("apiDomainHttps")
  addTask(tasks, {
    id: "T04_ALIYUN_DOMAIN_DNS_HTTPS",
    title: "配置 api-cn/assets-cn DNS、HTTPS 和 ICP 证据",
    status: domain.ok && apiDomain?.ready ? "ready" : "blocked",
    blockerCodes: [
      ...domain.machineBlocking,
      ...missingList(apiDomain),
    ],
    owner: "阿里云域名/证书操作员",
    consolePath: "阿里云控制台 -> 云解析 DNS / 数字证书管理服务 / SAE 或 SLB/网关 / CDN 或 OSS 域名",
    actions: [
      "把 api-cn.ipgongchang.xin 解析到公网可访问的 SAE/SLB/ECS 后端入口。",
      "把 assets-cn.ipgongchang.xin 解析到公网可访问的 OSS/CDN/静态资源入口。",
      "不要把 APP production-cn 正式域名指向 Vercel、localhost、example 或 198.18.0.x 特殊用途网段。",
      "给 api-cn 和 assets-cn 配置 HTTPS 证书。",
      "确认 ICP 备案状态满足国内 APP 正式访问要求。",
      "配置完成后运行严格域名门禁，并把证据写入 cloud-confirmations.local.json 的 apiDomainHttps 项。",
    ],
    evidence: [
      "dnsResolvedToAliyun=true",
      "httpsEnabled=true",
      "icpReady=true",
      "corepack pnpm aliyun:domain:strict pass",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin",
    ],
  })

  const oss = cloud.get("oss")
  addTask(tasks, {
    id: "T05_ALIYUN_OSS_AUDIO_STORAGE",
    title: "确认服务记录音频 OSS、CORS 和 RAM 最小权限",
    status: oss?.ready ? "ready" : "pending_cloud",
    blockerCodes: missingList(oss),
    owner: "阿里云 OSS/RAM 操作员",
    consolePath: "阿里云控制台 -> OSS Bucket / RAM 访问控制",
    actions: [
      "确认服务记录音频使用的 OSS Bucket 名称和 region。",
      "确认 CORS 允许 APP 所需上传/下载方法和 Header。",
      "确认 RAM 权限限制到服务记录音频前缀 service-records/production-cn。",
      "确认 ALIYUN_OSS_ACCESS_KEY_ID、ALIYUN_OSS_ACCESS_KEY_SECRET、ALIYUN_OSS_BUCKET、ALIYUN_OSS_REGION 已通过密钥环境变量导入。",
      "在 cloud-confirmations.local.json 的 oss 项记录 Bucket、region 和非密钥证据。",
    ],
    evidence: [
      "corsConfigured=true",
      "ramLeastPrivilege=true",
      "serviceRecordPrefix=service-records/production-cn",
      "confirmed=true",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:app-api:smoke",
      "postdeploy service-records upload smoke after API deployment",
    ],
  })

  const envImport = cloud.get("envImport")
  addTask(tasks, {
    id: "T06_ALIYUN_ENV_IMPORT",
    title: "导入 production-cn 运行环境变量",
    status: envImport?.ready && envPlan.summary.requiredBlocking.length === 0 ? "ready" : "blocked",
    blockerCodes: [
      ...envPlan.summary.requiredBlocking.map((key) => `missing_required_env:${key}`),
      ...missingList(envImport),
    ],
    owner: "阿里云运行环境/密钥操作员",
    consolePath: "阿里云 SAE/ECS 环境变量 / KMS / Secrets Manager",
    actions: [
      "使用 corepack pnpm aliyun:env:plan 生成不含 value 的变量名核对清单。",
      "从现有 Vercel production、Supabase、阿里云 OSS/百炼、DeepSeek、火山引擎、微信开放平台等来源迁移变量值。",
      "密钥值只导入阿里云运行环境、KMS 或 Secrets Manager，不写入 Docker 镜像、文档或 git。",
      "导入后在 cloud-confirmations.local.json 的 envImport 项记录 importedAt、target 和 secretNotInImage=true。",
    ],
    evidence: [
      "secretNotInImage=true",
      "importedAt=实际导入时间",
      `requiredReady=${envPlan.summary.requiredReady}/${envPlan.summary.requiredTotal}`,
      `requiredBlocking=${envPlan.summary.requiredBlocking.length ? envPlan.summary.requiredBlocking.join(",") : "none"}`,
    ],
    verifyCommands: [
      "corepack pnpm aliyun:env:check",
      "corepack pnpm aliyun:readiness:strict",
    ],
  })

  const sls = cloud.get("slsAlerts")
  addTask(tasks, {
    id: "T07_ALIYUN_SLS_ALERTS",
    title: "配置 SLS 日志和健康/5xx 告警",
    status: sls?.ready ? "ready" : "pending_cloud",
    blockerCodes: missingList(sls),
    owner: "阿里云运维操作员",
    consolePath: "阿里云控制台 -> 日志服务 SLS / 应用监控告警",
    actions: [
      "创建或确认 SLS Project 和日志采集配置。",
      "配置 /api/healthz 健康检查失败告警。",
      "配置 5xx 错误率或错误数告警。",
      "建议补 ASR、OSS 上传失败相关告警。",
      "在 cloud-confirmations.local.json 的 slsAlerts 项记录项目名和非密钥证据。",
    ],
    evidence: [
      "healthAlertConfigured=true",
      "serverErrorAlertConfigured=true",
      "confirmed=true",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:cloud:check",
    ],
  })

  addTask(tasks, {
    id: "T08_POSTDEPLOY_REMOTE_SMOKE",
    title: "阿里云部署后远端 smoke 验收",
    status: readiness.productionReady ? "ready" : "waiting_for_deploy",
    blockerCodes: readiness.productionReady ? [] : ["requires_runtime_domain_env_wechat_cloud_confirmations"],
    owner: "后端发布操作员",
    consolePath: "本机终端 + 阿里云部署控制台",
    actions: [
      "完成前置微信、协议、运行时、ACR 镜像、域名、OSS、环境变量和 SLS 任务后部署 production-cn 后端。",
      "先运行 domain strict，确认 api-cn/assets-cn DNS 和 HTTPS 可用。",
      "再运行统一 postdeploy smoke，验证 health 和 APP API guard。",
      "微信开放平台或正式协议 URL 未补齐时只能使用 --allow-missing appWechatLogin,legalLinks 做桥接调试，不能作为正式上线结论。",
    ],
    evidence: [
      "corepack pnpm aliyun:domain:strict pass",
      "corepack pnpm aliyun:postdeploy:smoke pass",
      "strict health 不再缺 appWechatLogin 或 legalLinks",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin",
    ],
  })

  return tasks
}

function addTask(tasks, task) {
  const blockerCodes = Array.from(new Set((task.blockerCodes || []).filter(Boolean)))
  tasks.push({
    ...task,
    blockerCodes,
    ready: task.status === "ready",
  })
}

function missingList(item) {
  if (!item || item.ready) return []
  return (item.missing || []).map((field) => `${item.key || "cloud"}:${field}`)
}

function summarizeTasks(tasks) {
  return {
    total: tasks.length,
    ready: tasks.filter((task) => task.ready).length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    pendingCloud: tasks.filter((task) => task.status === "pending_cloud").length,
    waitingForDeploy: tasks.filter((task) => task.status === "waiting_for_deploy").length,
  }
}

function renderMarkdown(report) {
  const lines = [
    "# 美业话镜 APP production-cn 操作员任务清单",
    "",
    `生成时间：${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- productionReady: ${report.readiness.productionReady}`,
    `- localCodeReady: ${report.readiness.localCodeReady}`,
    `- domainReady: ${report.domain.ok}`,
    `- imagePublishReady: ${report.imagePublishPlan.ready}`,
    `- env requiredReady: ${report.env.summary.requiredReady} / ${report.env.summary.requiredTotal}`,
    `- tasks ready: ${report.summary.ready} / ${report.summary.total}`,
    "",
    "## 当前阻塞",
    "",
    ...(report.readiness.machineBlocking.length
      ? report.readiness.machineBlocking.map((item) => `- ${item}`)
      : ["- none"]),
    ...(report.domain.machineBlocking.length
      ? report.domain.machineBlocking.map((item) => `- ${item}`)
      : []),
    "",
    "## 环境变量来源清单",
    "",
    `- containsValues: ${report.env.containsValues === false ? "false" : "unknown"}`,
    `- variables: ${report.env.summary.total}`,
    `- sourceMetadataReady: ${report.env.summary.sourceMetadataReady} / ${report.env.summary.total}`,
    "",
    ...(report.env.requiredBlockingDetails.length
      ? report.env.requiredBlockingDetails.flatMap((item) => [
          `### ${item.name}`,
          "",
          `- owner: ${item.owner}`,
          `- consolePath: ${item.consolePath}`,
          `- obtain: ${item.obtain}`,
          `- importTarget: ${item.importTarget}`,
          `- cloudConfirmationKey: ${item.cloudConfirmationKey}`,
          "",
        ])
      : ["- requiredBlocking: none", ""]),
    "",
    "## 任务",
    "",
  ]

  for (const task of report.tasks) {
    lines.push(
      `### ${task.id} ${task.title}`,
      "",
      `- status: ${task.status}`,
      `- owner: ${task.owner}`,
      `- consolePath: ${task.consolePath}`,
      `- blockers: ${task.blockerCodes.length ? task.blockerCodes.join(", ") : "none"}`,
      "- actions:",
      ...task.actions.map((item) => `  - ${item}`),
      "- evidence:",
      ...task.evidence.map((item) => `  - ${item}`),
      "- verifyCommands:",
      ...task.verifyCommands.map((item) => `  - ${item}`),
      "",
    )
  }

  lines.push(
    "## 安全边界",
    "",
    "- 本清单不包含任何密钥值。",
    "- 不要把 AppSecret、Service Role Key、OSS Secret、语音/LLM Token 写入文档或 git。",
    "- 生产部署、DNS 改动、资源创建、环境变量导入、微信上传和 git push 都需要单独授权。",
  )
  return `${lines.join("\n")}\n`
}

function writeOutput(filePath, content) {
  if (!filePath) return
  if (!isAbsolute(filePath)) throw new Error("output_path_must_be_absolute")
  writeFileSync(filePath, content, { mode: 0o600 })
}

function main() {
  const args = parseArgs(process.argv)
  const env = parseEnvFile(args.envFile)
  const envPlan = buildImportPlan(env)
  const readiness = runJson("readiness", [
    "scripts/check-aliyun-production-cn-readiness.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
    "--allow-blocking",
  ])
  const domain = runJson("domain", [
    "scripts/check-aliyun-domain-readiness.mjs",
    "--env-file",
    args.envFile,
    "--allow-blocking",
  ])
  const cloudConfirmations = readJsonIfExists(args.cloudConfirmationsFile)
  const imagePublishPlan = runJson("image_publish_plan", [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--allow-incomplete",
  ])
  const tasks = buildTasks({ envPlan, readiness, domain, cloudConfirmations, imagePublishPlan })
  const report = {
    generatedAt: new Date().toISOString(),
    containsValues: false,
    envFile: args.envFile,
    cloudConfirmationsFile: existsSync(args.cloudConfirmationsFile) ? args.cloudConfirmationsFile : null,
    summary: summarizeTasks(tasks),
    readiness: {
      productionReady: readiness.productionReady,
      localCodeReady: readiness.localCodeReady,
      machineBlocking: readiness.machineBlocking,
      manualBlocking: readiness.manualBlocking,
    },
    domain: {
      ok: domain.ok,
      targetReady: domain.targetReady,
      targetTotal: domain.targetTotal,
      machineBlocking: domain.machineBlocking,
    },
    imagePublishPlan: {
      ready: imagePublishPlan.ready === true,
      templateReady: imagePublishPlan.summary?.templateReady === true,
      localExists: imagePublishPlan.summary?.localExists === true,
      localReady: imagePublishPlan.summary?.localReady === true,
      totalBlockers: imagePublishPlan.summary?.totalBlockers ?? 0,
      localDockerImage: imagePublishPlan.localDockerImage?.status || "unknown",
    },
    env: {
      containsValues: false,
      summary: envPlan.summary,
      requiredBlocking: envPlan.summary.requiredBlocking,
      requiredBlockingDetails: envPlan.variables
        .filter((item) => envPlan.summary.requiredBlocking.includes(item.name))
        .map((item) => ({
          name: item.name,
          sensitivity: item.sensitivity,
          owner: item.owner,
          consolePath: item.consolePath,
          obtain: item.obtain,
          importTarget: item.importTarget,
          cloudConfirmationKey: item.cloudConfirmationKey,
        })),
    },
    tasks,
    nextCommandOrder: [
      "corepack pnpm aliyun:operator:tasks",
      "corepack pnpm aliyun:cloud:check",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:readiness:cloud-ready",
      "corepack pnpm aliyun:docker:build",
      "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin",
    ],
  }

  const json = JSON.stringify(report, null, 2)
  console.log(json)
  writeOutput(args.outPath, `${json}\n`)
  writeOutput(args.markdownPath, renderMarkdown(report))
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-aliyun-operator-tasks.mjs [--env-file path] [--cloud-confirmations path] [--out /tmp/tasks.json] [--markdown /tmp/tasks.md]",
    "",
    "Generates a non-secret Aliyun/WeChat operator task list from env plan, readiness, cloud confirmations, and domain probes.",
    "It does not create cloud resources, import secrets, deploy, or push.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
