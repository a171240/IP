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
const DEFAULT_CLOUD_INVENTORY_RESULTS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-inventory-results.local.json")
const APP_LAUNCH_BLOCKING_VARIABLE_NAMES = new Set(["APPLE_TEAM_ID"])

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    cloudInventoryResultsFile: DEFAULT_CLOUD_INVENTORY_RESULTS_FILE,
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
    if (arg === "--cloud-inventory-results") {
      args.cloudInventoryResultsFile = resolveValue(argv[++index], "--cloud-inventory-results")
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
  const cloudShell = report.cloudShellObservation?.cloudShell || {}
  const browserConsole = report.cloudShellObservation?.browserConsole || {}
  const workbenchTerminal = report.terminalAccess?.workbenchTerminal || report.cloudShellObservation?.workbenchTerminal || {}
  return {
    readOnlyOnly: report.readOnlyOnly === true,
    cloudApiCalled: report.cloudApiCalled === true,
    cloudMutationPerformed: report.cloudMutationPerformed === true,
    canReadCloudNow: report.canReadCloudNow === true,
    cliAvailable: report.cli?.available === true,
    cliBinary: report.cli?.binary || "",
    cliConfigFileExists: report.cli?.configFileExists === true,
    cliConfigProbe: report.cli?.configProbe || null,
    blockers: report.blockers || [],
    targets: report.targets || {},
    browserConsole: {
      chromeLoggedIn: browserConsole.chromeLoggedIn === true,
      observedAt: browserConsole.observedAt || "",
      evidence: browserConsole.evidence || "",
      resourcesObserved: browserConsole.resourcesObserved || [],
    },
    cloudShell: {
      connected: cloudShell.connected === true,
      regionLabel: cloudShell.regionLabel || "",
      cliAvailable: cloudShell.cliAvailable === true,
      cliVersion: cloudShell.cliVersion || "",
      cliConfigFileExists: cloudShell.cliConfigFileExists === true,
      canRunReadOnlyInventory: cloudShell.canRunReadOnlyInventory === true,
      cloudApiCalled: cloudShell.cloudApiCalled === true,
      cloudMutationPerformed: cloudShell.cloudMutationPerformed === true,
      blockers: cloudShell.blockers || [],
      evidence: cloudShell.evidence || "",
    },
    workbenchTerminal: {
      observed: workbenchTerminal.observed === true,
      connected: workbenchTerminal.connected === true,
      title: workbenchTerminal.title || "",
      urlHostPath: workbenchTerminal.urlHostPath || "",
      loginUser: workbenchTerminal.loginUser || "",
      hostLabel: workbenchTerminal.hostLabel || "",
      observedAt: workbenchTerminal.observedAt || "",
      cliInventoryAttempted: workbenchTerminal.cliInventoryAttempted === true,
      cloudApiCalled: workbenchTerminal.cloudApiCalled === true,
      cloudMutationPerformed: workbenchTerminal.cloudMutationPerformed === true,
      readiness: workbenchTerminal.readiness || "not_observed",
      blockers: workbenchTerminal.blockers || [],
      evidence: workbenchTerminal.evidence || "",
    },
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

function compactConsoleTask(task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    ready: task.ready === true,
    sequencePhase: task.sequencePhase || "",
    dependsOn: task.dependsOn || [],
    blockingDependencies: task.blockingDependencies || [],
    canStartNow: task.canStartNow === true,
    requiresActionTimeConfirmation: task.requiresActionTimeConfirmation === true,
    consolePath: task.consolePath || "",
    currentBlockers: task.currentBlockers || [],
    verifyCommands: task.verifyCommands || [],
  }
}

function buildAliyunConsoleTaskOrder(consoleRunbook) {
  const tasks = (consoleRunbook.consoleTasks || []).map(compactConsoleTask)
  return {
    sourceCommand: "corepack pnpm aliyun:console:runbook",
    resourceReady: consoleRunbook.summary?.resourceReady || "unknown",
    userActionReady: consoleRunbook.summary?.userActionReady || "unknown",
    canStartNow: consoleRunbook.summary?.canStartNowConsoleTasks || tasks
      .filter((task) => task.canStartNow)
      .map((task) => task.id),
    blockedByDependencies: consoleRunbook.summary?.blockedByTaskDependencies || tasks
      .filter((task) => task.blockingDependencies.length > 0)
      .map((task) => task.id),
    tasks,
  }
}

function buildAliyunConsoleActionNow(consoleTaskOrder) {
  const tasks = consoleTaskOrder.tasks || []
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const canStartNow = (consoleTaskOrder.canStartNow || [])
    .map((id) => byId.get(id))
    .filter(Boolean)
  const blockedByDependencies = (consoleTaskOrder.blockedByDependencies || [])
    .map((id) => byId.get(id))
    .filter(Boolean)

  return [
    ...canStartNow.map((task) =>
      `当前可先处理 ${task.id}：${task.title}；consolePath=${task.consolePath}；requiresActionTimeConfirmation=${task.requiresActionTimeConfirmation}`,
    ),
    ...blockedByDependencies.map((task) =>
      `先暂缓 ${task.id}：${task.title}；dependsOn=${task.dependsOn.join(", ") || "none"}；blockingDependencies=${task.blockingDependencies.join(", ") || "none"}`,
    ),
  ]
}

function buildWechatUserActionNow(machineBlocking) {
  const base = {
    owner: "用户/微信开放平台操作员",
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
  }

  if (machineBlocking.includes("wechat_open_platform_mobile_app_not_ready")) {
    return {
      ...base,
      title: "创建微信开放平台移动应用并提交审核",
      where: "微信开放平台 -> 管理中心 -> 移动应用 -> 创建移动应用 -> 美业话镜 App",
    }
  }

  if (machineBlocking.includes("wechat_open_platform_mobile_app_reviewing")) {
    return {
      ...base,
      title: "等待微信开放平台移动应用审核通过",
      where: "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App",
    }
  }

  if (machineBlocking.includes("wechat_open_platform_mobile_app_rejected")) {
    return {
      ...base,
      title: "处理微信开放平台移动应用审核驳回并重新提交",
      where: "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 审核反馈",
    }
  }

  return {
    ...base,
    title: "确认微信开放平台移动应用状态",
    where: "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App",
  }
}

function buildHandoff({
  args,
  envPlan,
  status,
  operatorTasks,
  cloudAccess,
  cloudConfirmationsCheck,
  imagePublishPlan,
  consoleRunbook,
  vercelEnvCoverage,
}) {
  const tasks = operatorTasks.tasks || []
  const aliyunConsoleTaskOrder = buildAliyunConsoleTaskOrder(consoleRunbook)
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
      cloudInventoryResultsFile: args.cloudInventoryResultsFile,
      cloudInventoryResultsFileExists: existsSync(args.cloudInventoryResultsFile),
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
    localEvidenceGaps: buildLocalEvidenceGaps({ args, status, cloudAccess, cloudConfirmationsCheck, imagePublishPlan }),
    vercelEnvCoverage: compactVercelEnvCoverage(vercelEnvCoverage),
    bridgeDataLayer: status.summary?.bridgeDataLayer || status.localReadiness?.bridgeDataLayer || {
      current: "Supabase",
      target: "Aliyun RDS PostgreSQL",
      status: "RDS migration is not included in the first bridge deployment",
      firstBridgeDeploymentUses: "Supabase bridge env",
      supabaseBridgeReady: false,
      databaseUrlCnStatus: "unknown",
      redisUrlCnStatus: "unknown",
      rdsMigrationIncludedInThisRelease: false,
      rdsMigrationRequiredForFinalProductionCn: true,
      notes: [],
    },
    missingVariables: {
      required: blockingRequiredVariables,
      optionalDeferred: optionalDeferredVariables,
    },
    appLaunchBlocking,
    sensitiveActionItems: operatorTasks.sensitiveActionItems || status.tasks?.sensitiveActionItems || [],
    userActionNow: [
      buildWechatUserActionNow(machineBlocking),
      {
        title: "确认 Apple Team ID",
        owner: "Apple Developer 操作员",
        where: "Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID",
        needAfterApproval: ["APPLE_TEAM_ID"],
        mustNotUse: ["APPLE_TEAM_ID 不是密钥，但仍不要猜测；必须从 Apple Developer 当前团队读取"],
      },
    ],
    aliyunConsoleTaskOrder,
    aliyunConsoleActionNow: buildAliyunConsoleActionNow(aliyunConsoleTaskOrder),
    priorityTasks: priorityTaskIds.map((id) => compactTask(taskById(tasks, id))).filter(Boolean),
    nextCommandOrder: status.nextCommandOrder || [],
    safetyBoundary: [
      "本操作包不包含任何密钥值。",
      "本操作包不代表已授权阿里云部署、ACR push、DNS 修改、微信操作、Supabase 生产写入、微信上传或 git push。",
      "cloud-confirmations.local.json 只能写资源名、布尔值、控制台路径或证据编号。",
      "cloud-inventory-results.local.json 只能写只读 CLI/Cloud Shell 盘点摘要、退出码、布尔值和非密钥 evidence handle。",
      "image-publish.local.json 只能写镜像名、digest、布尔状态和证据编号，不能写 registry 密码或 RAM Secret。",
    ],
  }
}

function buildLocalEvidenceGaps({ args, status, cloudAccess, cloudConfirmationsCheck, imagePublishPlan }) {
  const cloudChecklistByTarget = buildCloudChecklistByTarget(cloudAccess)
  const cloudInventoryResults = status.localReadiness?.cloudInventoryResults || {}
  return {
    cloudInventoryResults: {
      file: cloudInventoryResults.localFile || args.cloudInventoryResultsFile,
      exists: cloudInventoryResults.localExists === true,
      ready: cloudInventoryResults.localReady === true,
      checkedOperations: cloudInventoryResults.localCheckedOperations || 0,
      observationSummary: compactCloudInventoryObservationSummary(cloudInventoryResults.observationSummary),
      totalBlockers: (cloudInventoryResults.localBlockers || []).length,
      gaps: buildCloudInventoryResultGaps(cloudInventoryResults),
    },
    cloudConfirmations: {
      file: args.cloudConfirmationsFile,
      ready: cloudConfirmationsCheck.local?.ready === true,
      totalBlockers: cloudConfirmationsCheck.summary?.totalBlockers ?? 0,
      gaps: buildCloudConfirmationGaps(cloudConfirmationsCheck, cloudChecklistByTarget),
    },
    imagePublish: {
      file: resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.image-publish.local.json"),
      ready: imagePublishPlan.local?.ready === true,
      totalBlockers: imagePublishPlan.summary?.totalBlockers ?? 0,
      localDockerImage: imagePublishPlan.localDockerImage?.status || "unknown",
      gaps: buildImagePublishGaps(imagePublishPlan, cloudAccess),
    },
  }
}

function compactCloudInventoryObservationSummary(summary = {}) {
  return {
    safeConsoleOnly: summary.safeConsoleOnly === true,
    operations: summary.operations || 0,
    strictReadyOperations: summary.strictReadyOperations || 0,
    evidenceReadyOperations: summary.evidenceReadyOperations || 0,
    consoleObservationOperations: summary.consoleObservationOperations || 0,
    commandResults: summary.commandResults || 0,
    executedCommandResults: summary.executedCommandResults || 0,
    cloudApiCalledCommandResults: summary.cloudApiCalledCommandResults || 0,
    mutationPerformedCommandResults: summary.mutationPerformedCommandResults || 0,
    observedOperationIds: summary.observedOperationIds || [],
    notFoundOperationIds: summary.notFoundOperationIds || [],
    blockedOperationIds: summary.blockedOperationIds || [],
  }
}

function buildCloudInventoryResultGaps(cloudInventoryResults) {
  const blockers = cloudInventoryResults.localBlockers || []
  return blockers.map((blocker) => ({
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
  return "补齐对应只读盘点项的非密钥摘要；不能粘贴完整命令输出里的凭据、token、registry password、证书私钥或 cookie。"
}

function buildCloudChecklistByTarget(cloudAccess) {
  const result = new Map()
  for (const item of cloudAccess.consoleEvidenceChecklist || []) {
    const writeTo = String(item.writeTo || "")
    if (writeTo.includes("items.runtime")) result.set("runtime", item)
    if (writeTo.includes("items.apiDomainHttps")) result.set("apiDomainHttps", item)
    if (writeTo.includes("items.assetDomainHttps")) result.set("assetDomainHttps", item)
    if (writeTo.includes("items.oss")) result.set("oss", item)
    if (writeTo.includes("items.envImport")) result.set("envImport", item)
    if (writeTo.includes("items.slsAlerts")) result.set("slsAlerts", item)
  }
  result.set("wechatOpenPlatform", {
    consolePath: "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App",
    writeTo: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform",
    forbidden: [
      "AppSecret",
      "小程序 AppID/Secret",
      "token",
      "cookie",
    ],
  })
  return result
}

function buildCloudConfirmationGaps(check, checklistByTarget) {
  const itemStatus = check.local?.itemStatus || {}
  return Object.entries(itemStatus).flatMap(([key, status]) => {
    const checklist = checklistByTarget.get(key) || {}
    return (status.blockers || []).map((blocker) => ({
      jsonPath: `items.${key}.${fieldFromBlocker(blocker)}`,
      blocker,
      source: checklist.consolePath || "对应控制台",
      writeTo: checklist.writeTo || `deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.${key}`,
      expected: expectedCloudEvidence(key, blocker),
      forbidden: checklist.forbidden || [],
    }))
  })
}

function buildImagePublishGaps(imagePublishPlan, cloudAccess) {
  const acrChecklist = (cloudAccess.consoleEvidenceChecklist || []).find((item) =>
    String(item.writeTo || "").includes("image-publish.local.json")
  ) || {}
  return (imagePublishPlan.local?.blockers || []).map((blocker) => ({
    jsonPath: fieldFromImageBlocker(blocker),
    blocker,
    source: imagePublishGapSource(blocker, acrChecklist),
    writeTo: imagePublishGapWriteTarget(blocker),
    expected: expectedImagePublishEvidence(blocker),
    forbidden: acrChecklist.forbidden || [],
  }))
}

function imagePublishGapSource(blocker, acrChecklist) {
  const field = fieldFromImageBlocker(blocker)
  if (field.startsWith("runtime.")) {
    return "阿里云控制台 -> SAE -> cn-hangzhou -> 应用 -> 镜像部署 / 镜像拉取配置"
  }
  if (field.startsWith("acr.")) {
    return acrChecklist.consolePath || "阿里云控制台 -> 容器镜像服务 ACR -> cn-hangzhou -> 命名空间/仓库"
  }
  return acrChecklist.consolePath || "阿里云控制台 -> 容器镜像服务 ACR / SAE 容器运行时"
}

function imagePublishGapWriteTarget(blocker) {
  const field = fieldFromImageBlocker(blocker)
  if (field.startsWith("runtime.")) return "deploy/aliyun-production-cn.image-publish.local.json -> runtime"
  if (field.startsWith("acr.")) return "deploy/aliyun-production-cn.image-publish.local.json -> acr"
  return "deploy/aliyun-production-cn.image-publish.local.json"
}

function fieldFromBlocker(blocker) {
  const value = String(blocker || "")
  const prefixed = value.match(/^(?:missing|todo|placeholder|empty):(.+)$/)
  if (prefixed) return prefixed[1]
  const expected = value.match(/^([^=]+)=/)
  if (expected) return expected[1]
  return value
}

function fieldFromImageBlocker(blocker) {
  const value = String(blocker || "")
  const prefixed = value.match(/^(?:missing|todo|empty):(.+)$/)
  if (prefixed) return prefixed[1]
  const expected = value.match(/^([^=]+)=/)
  if (expected) return expected[1]
  return value
}

function expectedCloudEvidence(key, blocker) {
  const field = fieldFromBlocker(blocker)
  const expectedByField = {
    confirmed: "确认完成后填 true。",
    accountVerified: "微信开放平台账号认证通过后填 true；这不代表移动应用已创建。",
    mobileAppCreated: "在微信开放平台移动应用列表创建“美业话镜”后填 true。",
    mobileAppSubmitted: "移动应用创建后已提交微信审核再填 true。",
    dnsResolvedToAliyun: "域名已解析到阿里云公网入口后填 true。",
    httpsEnabled: "HTTPS 证书已启用并可访问后填 true。",
    icpReady: "备案状态满足国内正式访问要求后填 true。",
    corsConfigured: "OSS CORS 已按 APP 上传/下载需求配置后填 true。",
    ramLeastPrivilege: "RAM 权限已限制到服务记录前缀后填 true。",
    mobileAppIdReady: "微信开放平台移动应用审核通过并取得 AppID 后填 true。",
    mobileAppSecretReady: "微信开放平台移动应用审核通过并取得 AppSecret 后填 true。",
    androidConfigured: "微信开放平台 Android 包名和 release 签名配置完成后填 true。",
    iosConfigured: "微信开放平台 iOS Bundle ID 和 Universal Link 配置完成后填 true。",
    reviewStatus: "微信开放平台移动应用审核通过后填 approved。",
    androidSignature: "填 Android release 签名证据或证据编号，不填 debug keystore。",
    iosUniversalLink: "填 https:// 开头的正式 Universal Link。",
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

function expectedImagePublishEvidence(blocker) {
  const field = fieldFromImageBlocker(blocker)
  const expectedByField = {
    "acr.registryHost": "填阿里云 ACR registry host。",
    "acr.namespace": "填阿里云 ACR namespace。",
    "acr.remoteImage": "填 production-cn 远端镜像完整地址。",
    "acr.remoteDigest": "填 sha256:<64 hex> 镜像 digest。",
    "acr.evidence": "填 ACR 推送/导入证据编号。",
    "acr.confirmed": "ACR 仓库确认后填 true。",
    "acr.imagePushed": "镜像已推送或导入 ACR 后填 true。",
    "acr.digestVerified": "远端 digest 已核对后填 true。",
    "runtime.target": "填 SAE。",
    "runtime.appName": "填 SAE 应用名。",
    "runtime.imagePullCredentialMode": "填 not_required 或 configured_outside_this_file 等非密钥说明。",
    "runtime.evidence": "填 SAE 运行时镜像拉取配置证据编号。",
    "runtime.confirmed": "SAE runtime 已确认后填 true。",
    "runtime.remoteImageConfigured": "SAE 已指向 ACR remote image 后填 true。",
    "runtime.imagePullConfigured": "SAE 镜像拉取权限配置完成后填 true。",
  }
  return expectedByField[field] || "填真实非密钥 ACR/SAE 证据，不能写 registry 密码、RAM Secret 或 token。"
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
  if (machineBlocking.includes("wechat_open_platform_mobile_app_not_ready")) {
    states.push({
      name: "WECHAT_OPEN_APP_REVIEW_STATUS",
      status: "not_started",
      launchBlocking: true,
      owner: "用户/微信开放平台操作员",
      where: "微信开放平台 -> 管理中心 -> 移动应用",
      obtain: "账号认证通过后创建“美业话镜”移动应用；提交审核后状态进入 reviewing，审核通过后更新为 approved。",
      action: "先创建移动应用并提交审核；不能创建小程序应用，也不能用小程序凭证替代 APP 微信登录。",
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
    `- cliConfigProbeReady: ${handoff.cloudAccess.cliConfigProbe?.ready === true}`,
    `- cliConfigProbeFailureCategory: ${handoff.cloudAccess.cliConfigProbe?.failureCategory || "none"}`,
    `- browserConsoleChromeLoggedIn: ${handoff.cloudAccess.browserConsole.chromeLoggedIn}`,
    `- cloudShellConnected: ${handoff.cloudAccess.cloudShell.connected}`,
    `- cloudShellCliAvailable: ${handoff.cloudAccess.cloudShell.cliAvailable}`,
    `- cloudShellCliConfigFileExists: ${handoff.cloudAccess.cloudShell.cliConfigFileExists}`,
    `- cloudShellCanRunReadOnlyInventory: ${handoff.cloudAccess.cloudShell.canRunReadOnlyInventory}`,
    `- workbenchTerminalConnected: ${handoff.cloudAccess.workbenchTerminal.connected}`,
    `- workbenchTerminalReadiness: ${handoff.cloudAccess.workbenchTerminal.readiness || "not_observed"}`,
    `- workbenchTerminalCliInventoryAttempted: ${handoff.cloudAccess.workbenchTerminal.cliInventoryAttempted}`,
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
    "## 本地证据待填字段",
    "",
    "### cloud-inventory-results.local.json",
    "",
    `- file: ${handoff.localEvidenceGaps.cloudInventoryResults.file}`,
    `- exists: ${handoff.localEvidenceGaps.cloudInventoryResults.exists}`,
    `- ready: ${handoff.localEvidenceGaps.cloudInventoryResults.ready}`,
    `- checkedOperations: ${handoff.localEvidenceGaps.cloudInventoryResults.checkedOperations}`,
    `- safeConsoleOnly: ${handoff.localEvidenceGaps.cloudInventoryResults.observationSummary.safeConsoleOnly}`,
    `- consoleObservationOperations: ${handoff.localEvidenceGaps.cloudInventoryResults.observationSummary.consoleObservationOperations}/${handoff.localEvidenceGaps.cloudInventoryResults.observationSummary.operations}`,
    `- executedCommandResults: ${handoff.localEvidenceGaps.cloudInventoryResults.observationSummary.executedCommandResults}/${handoff.localEvidenceGaps.cloudInventoryResults.observationSummary.commandResults}`,
    `- cloudApiCalledCommandResults: ${handoff.localEvidenceGaps.cloudInventoryResults.observationSummary.cloudApiCalledCommandResults}`,
    `- mutationPerformedCommandResults: ${handoff.localEvidenceGaps.cloudInventoryResults.observationSummary.mutationPerformedCommandResults}`,
    `- totalBlockers: ${handoff.localEvidenceGaps.cloudInventoryResults.totalBlockers}`,
    "",
    ...(handoff.localEvidenceGaps.cloudInventoryResults.gaps.length
      ? handoff.localEvidenceGaps.cloudInventoryResults.gaps.flatMap((item) => renderEvidenceGap(item))
      : ["- none"]),
    "",
    "### cloud-confirmations.local.json",
    "",
    `- file: ${handoff.localEvidenceGaps.cloudConfirmations.file}`,
    `- ready: ${handoff.localEvidenceGaps.cloudConfirmations.ready}`,
    `- totalBlockers: ${handoff.localEvidenceGaps.cloudConfirmations.totalBlockers}`,
    "",
    ...(handoff.localEvidenceGaps.cloudConfirmations.gaps.length
      ? handoff.localEvidenceGaps.cloudConfirmations.gaps.flatMap((item) => renderEvidenceGap(item))
      : ["- none"]),
    "",
    "### image-publish.local.json",
    "",
    `- file: ${handoff.localEvidenceGaps.imagePublish.file}`,
    `- ready: ${handoff.localEvidenceGaps.imagePublish.ready}`,
    `- totalBlockers: ${handoff.localEvidenceGaps.imagePublish.totalBlockers}`,
    `- localDockerImage: ${handoff.localEvidenceGaps.imagePublish.localDockerImage}`,
    "",
    ...(handoff.localEvidenceGaps.imagePublish.gaps.length
      ? handoff.localEvidenceGaps.imagePublish.gaps.flatMap((item) => renderEvidenceGap(item))
      : ["- none"]),
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
    "## 数据层桥接状态",
    "",
    `- current: ${handoff.bridgeDataLayer.current}`,
    `- target: ${handoff.bridgeDataLayer.target}`,
    `- status: ${handoff.bridgeDataLayer.status}`,
    `- firstBridgeDeploymentUses: ${handoff.bridgeDataLayer.firstBridgeDeploymentUses}`,
    `- supabaseBridgeReady: ${handoff.bridgeDataLayer.supabaseBridgeReady}`,
    `- DATABASE_URL_CN: ${handoff.bridgeDataLayer.databaseUrlCnStatus}`,
    `- REDIS_URL_CN: ${handoff.bridgeDataLayer.redisUrlCnStatus}`,
    `- rdsMigrationIncludedInThisRelease: ${handoff.bridgeDataLayer.rdsMigrationIncludedInThisRelease}`,
    `- rdsMigrationRequiredForFinalProductionCn: ${handoff.bridgeDataLayer.rdsMigrationRequiredForFinalProductionCn}`,
    ...(handoff.bridgeDataLayer.notes || []).map((item) => `- ${item}`),
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
    `- resourceReady: ${handoff.aliyunConsoleTaskOrder.resourceReady}`,
    `- userActionReady: ${handoff.aliyunConsoleTaskOrder.userActionReady}`,
    `- canStartNow: ${handoff.aliyunConsoleTaskOrder.canStartNow.length ? handoff.aliyunConsoleTaskOrder.canStartNow.join(", ") : "none"}`,
    `- blockedByDependencies: ${handoff.aliyunConsoleTaskOrder.blockedByDependencies.length ? handoff.aliyunConsoleTaskOrder.blockedByDependencies.join(", ") : "none"}`,
    "",
    ...handoff.aliyunConsoleActionNow.map((item) => `- ${item}`),
    "",
    "### 阿里云控制台任务顺序",
    "",
    ...handoff.aliyunConsoleTaskOrder.tasks.flatMap((task) => [
      `- ${task.id}: ${task.title}`,
      `  - status: ${task.status}`,
      `  - sequencePhase: ${task.sequencePhase}`,
      `  - dependsOn: ${task.dependsOn.join(", ") || "none"}`,
      `  - blockingDependencies: ${task.blockingDependencies.join(", ") || "none"}`,
      `  - canStartNow: ${task.canStartNow}`,
      `  - requiresActionTimeConfirmation: ${task.requiresActionTimeConfirmation}`,
    ]),
    "",
    "## 本地要补证据的文件",
    "",
    `- cloud inventory results: ${handoff.files.cloudInventoryResultsFile}`,
    `- cloud confirmations: ${handoff.files.cloudConfirmationsFile}`,
    `- image publish plan: ${handoff.files.imagePublishLocalFile}`,
    "",
    "## 优先任务",
    "",
    ...handoff.priorityTasks.flatMap((task) => renderTask(task)),
    "## 密钥/密码/token/付款/受控标识符类人工介入项",
    "",
    ...(handoff.sensitiveActionItems.length
      ? handoff.sensitiveActionItems.flatMap((item) => renderSensitiveActionItem(item))
      : ["- none", ""]),
    "",
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

function renderSensitiveActionItem(item) {
  return [
    `### ${item.id}`,
    "",
    `- type: ${item.type}`,
    `- status: ${item.status}`,
    `- owner: ${item.owner}`,
    `- consolePath: ${item.consolePath}`,
    `- obtainFrom: ${item.obtainFrom || item.consolePath}`,
    `- writeTargets: ${(item.writeTargets || []).length ? item.writeTargets.join("; ") : "none"}`,
    `- verifyCommands: ${(item.verifyCommands || []).length ? item.verifyCommands.join("; ") : "none"}`,
    `- requiresActionTimeConfirmation: ${item.requiresActionTimeConfirmation === true}`,
    `- completionEvidence: ${(item.completionEvidence || []).length ? item.completionEvidence.join("; ") : "none"}`,
    `- variables: ${(item.variableNames || []).length ? item.variableNames.join(", ") : "none"}`,
    item.variableGroups?.length
      ? `- variableGroups: ${item.variableGroups.map((group) => `${group.category || "unknown"}:${group.count}`).join(", ")}`
      : "",
    `- action: ${item.requiredUserAction}`,
    `- unblock: ${item.unblockCondition}`,
    `- forbidden: ${item.forbidden}`,
    "",
  ].filter(Boolean)
}

function renderEvidenceGap(item) {
  return [
    `- \`${item.jsonPath}\``,
    `  - blocker: ${item.blocker}`,
    `  - source: ${item.source}`,
    `  - writeTo: ${item.writeTo}`,
    `  - expected: ${item.expected}`,
    ...(item.forbidden?.length ? [`  - forbidden: ${item.forbidden.join(", ")}`] : []),
  ]
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
    "--cloud-inventory-results",
    args.cloudInventoryResultsFile,
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
  const cloudConfirmationsCheck = runJson("cloud_confirmations", [
    resolve(BACKEND_ROOT, "scripts/check-aliyun-cloud-confirmations.mjs"),
    "--allow-incomplete",
    "--local",
    args.cloudConfirmationsFile,
  ])
  const imagePublishPlan = runJson("image_publish_plan", [
    resolve(BACKEND_ROOT, "scripts/check-aliyun-image-publish-plan.mjs"),
    "--allow-incomplete",
  ])
  const consoleRunbook = runJson("console_runbook", [
    resolve(BACKEND_ROOT, "scripts/generate-aliyun-console-runbook.mjs"),
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const vercelEnvCoverage = runVercelEnvCoverage(args)
  const handoff = buildHandoff({
    args,
    envPlan,
    status,
    operatorTasks,
    cloudAccess,
    cloudConfirmationsCheck,
    imagePublishPlan,
    consoleRunbook,
    vercelEnvCoverage,
  })
  const output = `${JSON.stringify(handoff, null, 2)}\n`
  process.stdout.write(output)
  writeOutput(args.outPath, output)
  writeOutput(args.markdownPath, renderMarkdown(handoff))
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-aliyun-operator-handoff.mjs [--env-file path] [--cloud-confirmations path] [--cloud-inventory-results path] [--out /tmp/handoff.json] [--markdown /tmp/handoff.md] [--skip-vercel-env-coverage] [--vercel-env-coverage-input /tmp/vercel-env.json]",
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
