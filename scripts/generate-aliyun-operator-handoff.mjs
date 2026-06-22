#!/usr/bin/env node

import { existsSync, writeFileSync } from "node:fs"
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
const APP_LAUNCH_BLOCKING_VARIABLE_NAMES = new Set(["APPLE_TEAM_ID"])

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    outPath: "",
    markdownPath: "",
    skipVercelEnvCoverage: false,
    vercelEnvCoverageInput: "",
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
    if (arg === "--skip-vercel-env-coverage") {
      args.skipVercelEnvCoverage = true
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
    maxBuffer: 1024 * 1024 * 30,
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

function runJsonAllowFailure(label, scriptArgs) {
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  if (result.error) {
    return {
      ok: false,
      report: null,
      error: result.error.message,
    }
  }
  if (result.status !== 0) {
    return {
      ok: false,
      report: null,
      error: (result.stderr || result.stdout || `exit ${result.status}`).split(/\r?\n/).slice(0, 8).join(" | "),
    }
  }
  try {
    return {
      ok: true,
      report: JSON.parse(result.stdout),
      error: null,
    }
  } catch (error) {
    return {
      ok: false,
      report: null,
      error: `invalid_json_from_${label}:${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function runVercelEnvCoverage(args) {
  if (args.skipVercelEnvCoverage) {
    return {
      ok: false,
      skipped: true,
      report: null,
      error: null,
    }
  }
  const scriptArgs = [resolve(BACKEND_ROOT, "scripts/check-vercel-env-coverage.mjs")]
  if (args.vercelEnvCoverageInput) {
    scriptArgs.push("--input", args.vercelEnvCoverageInput)
  }
  return {
    skipped: false,
    ...runJsonAllowFailure("vercel_env_coverage", scriptArgs),
  }
}

function compactVariable(item) {
  return {
    name: item.name,
    required: item.required,
    status: item.status,
    sensitivity: item.sensitivity,
    owner: item.owner,
    consolePath: item.consolePath,
    obtain: item.obtain,
    importTarget: item.importTarget,
    cloudConfirmationKey: item.cloudConfirmationKey,
    action: item.action,
    notes: item.notes,
  }
}

function variableByName(variables, name) {
  return variables.find((item) => item.name === name) || null
}

function compactLaunchBlockingVariable(item, blockingReason) {
  return {
    ...compactVariable(item),
    launchBlocking: true,
    blockingReason,
  }
}

function compactVercelEnvCoverage(result) {
  if (!result.ok || !result.report) {
    return {
      ok: false,
      skipped: result.skipped === true,
      containsValues: false,
      project: "",
      scope: "",
      environment: "",
      source: "",
      requiredCovered: "0/0",
      optionalCovered: "0/0",
      vercelEntries: 0,
      productionNames: 0,
      extraProductionKeys: 0,
      requiredMissingInVercelProduction: [],
      optionalMissingInVercelProduction: [],
      appSpecificKeysMissingInVercelProduction: [],
      bridgeKeysPresentInVercelProduction: [],
      notes: result.skipped === true
        ? ["Skipped by --skip-vercel-env-coverage."]
        : ["Vercel coverage could not be read; this does not include or expose any values."],
      error: result.error || null,
    }
  }

  const report = result.report
  const totals = report.totals || {}
  return {
    ok: true,
    skipped: false,
    containsValues: report.containsValues === true,
    project: report.project || "",
    scope: report.scope || "",
    environment: report.environment || "",
    source: report.source || "",
    requiredCovered: `${totals.requiredPresentInVercelProduction ?? 0}/${totals.requiredTotal ?? 0}`,
    optionalCovered: `${totals.optionalPresentInVercelProduction ?? 0}/${totals.optionalTotal ?? 0}`,
    vercelEntries: totals.vercelEntries ?? 0,
    productionNames: totals.productionNames ?? 0,
    extraProductionKeys: totals.extraProductionKeys ?? 0,
    requiredMissingInVercelProduction: report.requiredMissingInVercelProduction || [],
    optionalMissingInVercelProduction: report.optionalMissingInVercelProduction || [],
    appSpecificKeysMissingInVercelProduction: report.appSpecificKeysMissingInVercelProduction || [],
    bridgeKeysPresentInVercelProduction: report.bridgeKeysPresentInVercelProduction || [],
    notes: report.notes || [],
    error: null,
  }
}

function compactCloudAccess(report) {
  const checklist = report.consoleEvidenceChecklist || []
  return {
    readOnlyOnly: report.readOnlyOnly === true,
    cloudApiCalled: report.cloudApiCalled === true,
    cloudMutationPerformed: report.cloudMutationPerformed === true,
    canReadCloudNow: report.canReadCloudNow === true,
    cliAvailable: report.cli?.available === true,
    cliBinary: report.cli?.binary || "",
    cliConfigFileExists: report.cli?.configFileExists === true,
    blockers: report.blockers || [],
    targets: report.targets || {},
    consoleEvidenceChecklist: checklist.map((item) => ({
      id: item.id,
      title: item.title,
      consolePath: item.consolePath,
      writeTo: item.writeTo,
      currentLocalEvidence: item.currentLocalEvidence || "",
      nonSecretFieldsToRecord: item.nonSecretFieldsToRecord || [],
      forbidden: item.forbidden || [],
    })),
    nextActions: report.nextActions || [],
  }
}

function taskById(tasks, id) {
  return tasks.find((task) => task.id === id) || null
}

function compactTask(task) {
  if (!task) return null
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    ready: task.ready === true,
    owner: task.owner,
    consolePath: task.consolePath,
    blockerCodes: task.blockerCodes || [],
    actions: task.actions || [],
    evidence: task.evidence || [],
    verifyCommands: task.verifyCommands || [],
    notes: task.notes || [],
  }
}

function buildHandoff({ args, envPlan, status, operatorTasks, cloudAccess, vercelEnvCoverage }) {
  const tasks = operatorTasks.tasks || []
  const machineBlocking = status.summary?.machineBlocking || []
  const waitingWechatReview = status.summary?.operatorTasks?.waitingWechatReview || 0
  const appLaunchBlocking = buildAppLaunchBlocking(envPlan.variables, machineBlocking)
  const blockingRequiredVariables = envPlan.variables
    .filter((item) => item.required && item.status !== "ready")
    .map(compactVariable)
  const optionalDeferredVariables = envPlan.variables
    .filter((item) => !item.required && item.status !== "ready" && !APP_LAUNCH_BLOCKING_VARIABLE_NAMES.has(item.name))
    .map(compactVariable)
  const priorityTaskIds = [
    "T01_WECHAT_OPEN_PLATFORM_APP_LOGIN",
    "T04_ALIYUN_DOMAIN_DNS_HTTPS",
    "T03_ALIYUN_RUNTIME_CONTAINER",
    "T03B_ALIYUN_ACR_IMAGE_PUBLISH",
    "T05_ALIYUN_OSS_AUDIO_STORAGE",
    "T06_ALIYUN_ENV_IMPORT",
    "T07_ALIYUN_SLS_ALERTS",
    "T08_POSTDEPLOY_REMOTE_SMOKE",
  ]

  return {
    generatedAt: new Date().toISOString(),
    containsValues: false,
    canDeployNow: status.canDeployNow === true,
    verdict: status.verdict,
    currentAnswer: status.canDeployNow === true
      ? "机器门禁显示可部署，但仍需要单独授权生产部署。"
      : waitingWechatReview > 0
        ? "现在不能上线/部署；微信开放平台移动应用已在审核中，审核通过前不能取得生产 AppID/AppSecret，同时还要补阿里云运行资源、DNS/HTTPS/ICP、OSS、环境变量导入和 SLS 证据。"
      : "现在不能上线/部署；先补微信开放平台移动应用、阿里云运行资源、DNS/HTTPS/ICP、OSS、环境变量导入和 SLS 证据。",
    files: {
      envFile: args.envFile,
      envFileExists: existsSync(args.envFile),
      cloudConfirmationsFile: args.cloudConfirmationsFile,
      cloudConfirmationsFileExists: existsSync(args.cloudConfirmationsFile),
      imagePublishLocalFile: resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.image-publish.local.json"),
    },
    localReady: {
      appApiBridgeMap: status.localReadiness?.backendBridgeMap?.ok === true,
      appRuntimeConfig: status.localReadiness?.appRuntimeConfig?.ok === true,
      appRuntimeApiBaseUrl: status.localReadiness?.appRuntimeConfig?.apiBaseUrl || "",
      appRuntimeAssetBaseUrl: status.localReadiness?.appRuntimeConfig?.assetBaseUrl || "",
      legalPages: status.localReadiness?.legalPages?.ok === true,
      nativeRelease: status.localReadiness?.nativeRelease?.ok === true,
      docker: status.localReadiness?.docker?.ready === true,
    },
    cloudAccess: compactCloudAccess(cloudAccess),
    vercelEnvCoverage: compactVercelEnvCoverage(vercelEnvCoverage),
    missingVariables: {
      required: blockingRequiredVariables,
      optionalDeferred: optionalDeferredVariables,
    },
    appLaunchBlocking,
    userActionNow: [
      {
        title: "等待微信开放平台移动应用审核通过",
        owner: "用户/微信开放平台操作员",
        where: "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App",
        needAfterApproval: [
          "WECHAT_OPEN_APP_ID",
          "WECHAT_OPEN_APP_SECRET",
          "Android release 签名",
          "iOS Universal Link",
        ],
        mustNotUse: [
          "不要用小程序 AppID 代替移动应用 AppID",
          "不要用小程序 Secret 代替移动应用 AppSecret",
          "不要把 AppSecret 写入文档、JSON、Docker 镜像或 git",
        ],
      },
      {
        title: "确认 Apple Team ID",
        owner: "Apple Developer 操作员",
        where: "Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID",
        needAfterApproval: ["APPLE_TEAM_ID"],
        mustNotUse: ["APPLE_TEAM_ID 不是密钥，但仍不要猜测；必须从 Apple Developer 当前团队读取"],
      },
    ],
    aliyunConsoleActionNow: [
      "创建或确认 SAE 容器应用：cn-hangzhou，端口 3000，健康检查 /api/healthz。",
      "创建或确认 ACR 仓库：meiye-huajing-app-api:production-cn，并记录 remote image 和 digest。",
      "把 api-cn.ipgongchang.xin / assets-cn.ipgongchang.xin 指到阿里云公网入口并启用 HTTPS，补 ICP 证据。",
      "确认 OSS Bucket、CORS、RAM 最小权限和 service-records/production-cn 前缀。",
      "把 ready 的环境变量导入 SAE/KMS/Secrets Manager，密钥不进镜像。",
      "配置 SLS 日志、/api/healthz 健康告警和 5xx 告警。",
    ],
    priorityTasks: priorityTaskIds.map((id) => compactTask(taskById(tasks, id))).filter(Boolean),
    nextCommandOrder: status.nextCommandOrder || [],
    safetyBoundary: [
      "本操作包不包含任何密钥值。",
      "本操作包不代表已授权阿里云部署、ACR push、DNS 修改、微信操作、Supabase 生产写入、微信上传或 git push。",
      "cloud-confirmations.local.json 只能写资源名、布尔值、控制台路径或证据编号。",
      "image-publish.local.json 只能写镜像名、digest、布尔状态和证据编号，不能写 registry 密码或 RAM Secret。",
    ],
  }
}

function buildAppLaunchBlocking(variables, machineBlocking) {
  const blockingVariables = []
  const appleTeamId = variableByName(variables, "APPLE_TEAM_ID")
  if (appleTeamId && appleTeamId.status !== "ready") {
    blockingVariables.push(compactLaunchBlockingVariable(
      appleTeamId,
      "iOS Universal Link 的 AASA appID 需要 Apple Team ID；它不是后端必填密钥，但会阻塞 iOS APP 微信登录发布验收。",
    ))
  }

  const states = []
  if (machineBlocking.includes("wechat_open_platform_mobile_app_reviewing")) {
    states.push({
      name: "WECHAT_OPEN_APP_REVIEW_STATUS",
      status: "reviewing",
      launchBlocking: true,
      owner: "用户/微信开放平台操作员",
      where: "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App",
      obtain: "移动应用审核通过后把状态更新为 approved，再读取 AppID/AppSecret。",
      action: "等待审核通过；不能用小程序凭证绕过。",
    })
  }
  if (machineBlocking.includes("invalid_app_universal_link_config")) {
    states.push({
      name: "IOS_UNIVERSAL_LINK_AASA",
      status: "blocked",
      launchBlocking: true,
      owner: "Apple Developer / iOS 发布操作员",
      where: "Apple Developer -> Identifiers -> 美业话镜 App ID；阿里云部署后 GET /.well-known/apple-app-site-association",
      obtain: "确认 APPLE_TEAM_ID、iOS Bundle ID com.ipgongchang.meiyehuajing、Associated Domains applinks:api-cn.ipgongchang.xin 和微信开放平台 Universal Link 一致。",
      action: "补 APPLE_TEAM_ID，部署 api-cn 后验证 AASA 路由 200。",
    })
  }

  return {
    variables: blockingVariables,
    states,
    machineBlocking,
  }
}

function renderMarkdown(handoff) {
  const lines = [
    "# 美业话镜 APP production-cn 操作包",
    "",
    `Generated: ${handoff.generatedAt}`,
    "",
    "## 当前结论",
    "",
    `- ${handoff.currentAnswer}`,
    `- verdict: ${handoff.verdict}`,
    `- canDeployNow: ${handoff.canDeployNow}`,
    "",
    "## 本地已经 ready",
    "",
    `- APP API bridge map: ${handoff.localReady.appApiBridgeMap}`,
    `- APP runtime config: ${handoff.localReady.appRuntimeConfig}`,
    `- APP runtime apiBaseUrl: ${handoff.localReady.appRuntimeApiBaseUrl}`,
    `- APP runtime assetBaseUrl: ${handoff.localReady.appRuntimeAssetBaseUrl}`,
    `- legal pages: ${handoff.localReady.legalPages}`,
    `- native release config: ${handoff.localReady.nativeRelease}`,
    `- docker local gate: ${handoff.localReady.docker}`,
    "",
    "## 阿里云云侧访问能力",
    "",
    `- readOnlyOnly: ${handoff.cloudAccess.readOnlyOnly}`,
    `- cloudApiCalled: ${handoff.cloudAccess.cloudApiCalled}`,
    `- cloudMutationPerformed: ${handoff.cloudAccess.cloudMutationPerformed}`,
    `- canReadCloudNow: ${handoff.cloudAccess.canReadCloudNow}`,
    `- cliAvailable: ${handoff.cloudAccess.cliAvailable}`,
    `- cliConfigFileExists: ${handoff.cloudAccess.cliConfigFileExists}`,
    `- blockers: ${handoff.cloudAccess.blockers.length ? handoff.cloudAccess.blockers.join(", ") : "none"}`,
    `- target: ${handoff.cloudAccess.targets.provider || "unknown"} / ${handoff.cloudAccess.targets.region || "unknown"} / ${handoff.cloudAccess.targets.appName || "unknown"}`,
    "",
    "### 控制台证据清单",
    "",
    ...handoff.cloudAccess.consoleEvidenceChecklist.flatMap((item) => [
      `- ${item.id}: ${item.title}`,
      `  - consolePath: ${item.consolePath}`,
      `  - writeTo: ${item.writeTo}`,
      `  - nonSecretFieldsToRecord: ${item.nonSecretFieldsToRecord.join(", ")}`,
    ]),
    "",
    "### 云侧访问下一步",
    "",
    ...handoff.cloudAccess.nextActions.map((item) => `- ${item}`),
    "",
    "## Vercel production 变量名覆盖",
    "",
    `- status: ${handoff.vercelEnvCoverage.ok ? "ok" : handoff.vercelEnvCoverage.skipped ? "skipped" : "not ok"}`,
    `- containsValues: ${handoff.vercelEnvCoverage.containsValues}`,
    `- project: ${handoff.vercelEnvCoverage.project || "unknown"}`,
    `- scope: ${handoff.vercelEnvCoverage.scope || "unknown"}`,
    `- environment: ${handoff.vercelEnvCoverage.environment || "production"}`,
    `- requiredCovered: ${handoff.vercelEnvCoverage.requiredCovered}`,
    `- optionalCovered: ${handoff.vercelEnvCoverage.optionalCovered}`,
    `- productionNames: ${handoff.vercelEnvCoverage.productionNames}`,
    `- extraProductionKeys: ${handoff.vercelEnvCoverage.extraProductionKeys}`,
    ...(handoff.vercelEnvCoverage.error ? [`- error: ${handoff.vercelEnvCoverage.error}`] : []),
    "",
    "### Vercel 中已存在、可作为迁移来源的桥接变量名",
    "",
    ...(handoff.vercelEnvCoverage.bridgeKeysPresentInVercelProduction.length
      ? handoff.vercelEnvCoverage.bridgeKeysPresentInVercelProduction.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "### Vercel production 仍缺的必填变量名",
    "",
    ...(handoff.vercelEnvCoverage.requiredMissingInVercelProduction.length
      ? handoff.vercelEnvCoverage.requiredMissingInVercelProduction.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "### 其中属于国内 APP / 微信开放平台 / 正式域名新增项",
    "",
    ...(handoff.vercelEnvCoverage.appSpecificKeysMissingInVercelProduction.length
      ? handoff.vercelEnvCoverage.appSpecificKeysMissingInVercelProduction.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "### Vercel 覆盖说明",
    "",
    ...handoff.vercelEnvCoverage.notes.map((item) => `- ${item}`),
    "",
    "## 现在缺的必填环境变量",
    "",
    ...(handoff.missingVariables.required.length
      ? handoff.missingVariables.required.flatMap((item) => renderVariable(item))
      : ["- none", ""]),
    "## APP 发布阻塞但不属于后端必填密钥",
    "",
    ...(handoff.appLaunchBlocking.variables.length
      ? handoff.appLaunchBlocking.variables.flatMap((item) => renderVariable(item))
      : ["- no launch-blocking variables", ""]),
    ...(handoff.appLaunchBlocking.states.length
      ? handoff.appLaunchBlocking.states.flatMap((item) => renderBlockingState(item))
      : ["- no launch-blocking states", ""]),
    "## 可后置或可选但未 ready 的变量",
    "",
    ...(handoff.missingVariables.optionalDeferred.length
      ? handoff.missingVariables.optionalDeferred.flatMap((item) => renderVariable(item))
      : ["- none", ""]),
    "## 用户现在要做",
    "",
    ...handoff.userActionNow.flatMap((item) => [
      `### ${item.title}`,
      "",
      `- owner: ${item.owner}`,
      `- where: ${item.where}`,
      "- needAfterApproval:",
      ...item.needAfterApproval.map((value) => `  - ${value}`),
      "- mustNotUse:",
      ...item.mustNotUse.map((value) => `  - ${value}`),
      "",
    ]),
    "## 阿里云控制台要做",
    "",
    ...handoff.aliyunConsoleActionNow.map((item) => `- ${item}`),
    "",
    "## 本地要补证据的文件",
    "",
    `- cloud confirmations: ${handoff.files.cloudConfirmationsFile}`,
    `- image publish plan: ${handoff.files.imagePublishLocalFile}`,
    "",
    "## 优先任务",
    "",
    ...handoff.priorityTasks.flatMap((task) => renderTask(task)),
    "## 下一组验证命令",
    "",
    ...handoff.nextCommandOrder.map((command) => `- \`${command}\``),
    "",
    "## 安全边界",
    "",
    ...handoff.safetyBoundary.map((item) => `- ${item}`),
  ]
  return `${lines.join("\n")}\n`
}

function renderVariable(item) {
  return [
    `### ${item.name}`,
    "",
    `- status: ${item.status}`,
    `- required: ${item.required}`,
    `- sensitivity: ${item.sensitivity}`,
    `- owner: ${item.owner}`,
    `- consolePath: ${item.consolePath}`,
    `- obtain: ${item.obtain}`,
    `- importTarget: ${item.importTarget}`,
    `- cloudConfirmationKey: ${item.cloudConfirmationKey}`,
    `- action: ${item.action}`,
    item.launchBlocking ? `- launchBlocking: ${item.launchBlocking}` : "",
    item.blockingReason ? `- blockingReason: ${item.blockingReason}` : "",
    item.notes ? `- notes: ${item.notes}` : "",
    "",
  ].filter(Boolean)
}

function renderBlockingState(item) {
  return [
    `### ${item.name}`,
    "",
    `- status: ${item.status}`,
    `- launchBlocking: ${item.launchBlocking}`,
    `- owner: ${item.owner}`,
    `- where: ${item.where}`,
    `- obtain: ${item.obtain}`,
    `- action: ${item.action}`,
    "",
  ]
}

function renderTask(task) {
  return [
    `### ${task.id} ${task.title}`,
    "",
    `- status: ${task.status}`,
    `- owner: ${task.owner}`,
    `- consolePath: ${task.consolePath}`,
    `- blockers: ${task.blockerCodes.length ? task.blockerCodes.join(", ") : "none"}`,
    "- actions:",
    ...task.actions.slice(0, 6).map((item) => `  - ${item}`),
    "- verifyCommands:",
    ...task.verifyCommands.map((item) => `  - ${item}`),
    "",
  ]
}

function writeOutput(filePath, content) {
  if (!filePath) return
  if (!isAbsolute(filePath)) throw new Error("output_path_must_be_absolute")
  writeFileSync(filePath, content, { mode: 0o600 })
}

function main() {
  const args = parseArgs(process.argv)
  const envPlan = buildImportPlan(parseEnvFile(args.envFile))
  const status = runJson("status", [
    resolve(BACKEND_ROOT, "scripts/summarize-aliyun-production-cn-status.mjs"),
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const operatorTasks = runJson("operator_tasks", [
    resolve(BACKEND_ROOT, "scripts/generate-aliyun-operator-tasks.mjs"),
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const cloudAccess = runJson("cloud_access", [
    resolve(BACKEND_ROOT, "scripts/check-aliyun-cloud-access.mjs"),
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const vercelEnvCoverage = runVercelEnvCoverage(args)
  const handoff = buildHandoff({ args, envPlan, status, operatorTasks, cloudAccess, vercelEnvCoverage })
  const output = `${JSON.stringify(handoff, null, 2)}\n`
  process.stdout.write(output)
  writeOutput(args.outPath, output)
  writeOutput(args.markdownPath, renderMarkdown(handoff))
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-aliyun-operator-handoff.mjs [--env-file path] [--cloud-confirmations path] [--out /tmp/handoff.json] [--markdown /tmp/handoff.md] [--skip-vercel-env-coverage] [--vercel-env-coverage-input /tmp/vercel-env.json]",
    "",
    "Generates a concise non-secret handoff for the user, Aliyun operator, WeChat Open Platform operator, and release owner.",
    "Vercel env coverage is metadata-only, non-blocking, and never includes values.",
    "It does not create resources, import secrets, deploy, upload, or push.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
