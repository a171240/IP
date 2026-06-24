#!/usr/bin/env node

import { existsSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const DEFAULT_CLOUD_INVENTORY_RESULTS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-inventory-results.local.json")

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    cloudInventoryResultsFile: DEFAULT_CLOUD_INVENTORY_RESULTS_FILE,
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

function taskById(tasks, id) {
  return tasks.find((task) => task.id === id) || null
}

function countCloudReady(readiness) {
  const items = readiness.checks?.cloudConfirmations?.items || []
  return {
    ready: items.filter((item) => item.ready).length,
    total: items.length,
    pending: items
      .filter((item) => !item.ready)
      .map((item) => ({
        key: item.key,
        label: item.label,
        missing: item.missing || [],
      })),
  }
}

function compactTask(task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    owner: task.owner,
    consolePath: task.consolePath,
    blockerCodes: task.blockerCodes || [],
    nextActions: (task.actions || []).slice(0, 4),
    verifyCommands: task.verifyCommands || [],
  }
}

function buildStatus({ readiness, operatorTasks, cloudInventoryResults, args }) {
  const tasks = operatorTasks.tasks || []
  const notReadyTasks = tasks.filter((task) => !task.ready)
  const readyTasks = tasks.filter((task) => task.ready)
  const wechatTask = taskById(tasks, "T01_WECHAT_OPEN_PLATFORM_APP_LOGIN")
  const legalTask = taskById(tasks, "T02_APP_LEGAL_LINKS")
  const domainTask = taskById(tasks, "T04_ALIYUN_DOMAIN_DNS_HTTPS")
  const envTask = taskById(tasks, "T06_ALIYUN_ENV_IMPORT")
  const cloudReady = countCloudReady(readiness)
  const cloudInventoryLocal = cloudInventoryResults.local || {}
  const cloudInventorySummary = cloudInventoryResults.summary || {}
  const cloudInventoryObservationSummary = cloudInventoryLocal.observationSummary || {
    operations: 0,
    strictReadyOperations: 0,
    evidenceReadyOperations: 0,
    consoleObservationOperations: 0,
    safeConsoleOnly: false,
    commandResults: 0,
    executedCommandResults: 0,
    cloudApiCalledCommandResults: 0,
    mutationPerformedCommandResults: 0,
    observedOperationIds: [],
    notFoundOperationIds: [],
    blockedOperationIds: [],
  }
  const missingRequiredEnv = readiness.checks?.env?.missingRequired || operatorTasks.env?.requiredBlocking || []
  const machineBlocking = readiness.machineBlocking || []
  const manualBlocking = readiness.manualBlocking || []
  const bridgeMap = readiness.checks?.backend?.appApiBridgeMap || null
  const legalPages = readiness.checks?.backend?.legalPages || null
  const appRuntimeConfig = readiness.checks?.appProductionConfig?.runtimeConfig || null
  const nativeRelease = readiness.checks?.appProductionConfig?.nativeRelease || null
  const universalLink = readiness.checks?.appProductionConfig?.universalLink || null
  const imagePlan = readiness.checks?.imagePublishPlan || null
  const docker = readiness.checks?.docker || null
  const bridgeDataLayer = readiness.checks?.bridgeDataLayer || null
  const wechatReviewStatus = readiness.checks?.wechatOpenPlatform?.reviewStatus || "unknown"
  const sensitiveActionItems = operatorTasks.sensitiveActionItems || []

  const verdict = readiness.productionReady ? "ready_to_deploy_after_authorization" : "blocked"
  const canDeployNow = false
  const authorizationNote = "本命令只读汇总状态，不代表已授权阿里云部署、ACR push、DNS 修改、微信操作或 git push。"

  const humanSummary = [
    readiness.productionReady
      ? "机器门禁显示 productionReady=true；仍需单独取得生产部署授权。"
      : `现在不能上线/部署：productionReady=false，operator tasks ${operatorTasks.summary?.ready || 0}/${operatorTasks.summary?.total || tasks.length} ready。`,
    `必填环境变量 ready ${readiness.checks?.env?.requiredReady || 0}/${readiness.checks?.env?.requiredTotal || 0}；缺 ${missingRequiredEnv.length ? missingRequiredEnv.join(", ") : "none"}。`,
    `APP production-cn runtime config：${appRuntimeConfig?.ok ? "ready" : "blocked"}；apiBaseUrl ${appRuntimeConfig?.productionRuntime?.apiBaseUrl || "unknown"}，assetBaseUrl ${appRuntimeConfig?.productionRuntime?.assetBaseUrl || "unknown"}。`,
    wechatReviewStatus === "reviewing"
      ? "微信开放平台移动应用状态：reviewing；这表示 APP 已进入审核流程，不是缺创建 APP。AppID/Secret 仍只能等审核通过后获取。"
      : wechatReviewStatus === "not_started"
        ? "微信开放平台移动应用状态：not_started；移动应用还没创建，下一步是在微信开放平台创建“美业话镜”移动应用并提交审核。"
        : `微信开放平台移动应用状态：${wechatReviewStatus}；AppID/Secret 只能等移动应用审核通过后从微信开放平台获取。`,
    `Apple Universal Link：${universalLink?.ok ? "ready" : "blocked"}；${(universalLink?.blockers || []).join(", ") || "no blockers"}。`,
    bridgeDataLayer
      ? `数据层：正式 production-cn 目标 ${bridgeDataLayer.target}，当前 ${bridgeDataLayer.current}；RDS migration included=${bridgeDataLayer.rdsMigrationIncludedInThisRelease === true}，DATABASE_URL_CN=${bridgeDataLayer.databaseUrlCnStatus || "unknown"}。`
      : "数据层：unknown。",
    `阿里云云资源确认：${cloudReady.ready}/${cloudReady.total} ready；还缺 SAE、DNS/HTTPS/ICP、OSS/CORS/RAM、微信开放平台 approved、env import、SLS 中未完成项。`,
    `阿里云 CLI 只读盘点结果：${cloudInventoryLocal.ready ? "ready" : "not ready"}；localExists=${cloudInventoryLocal.exists === true}，local operations ${cloudInventorySummary.readyLocalOperations || 0}/${cloudInventorySummary.localOperations || 0} ready，blockers ${(cloudInventoryLocal.blockers || []).join(", ") || "none"}。`,
    `阿里云控制台观察证据：safeConsoleOnly=${cloudInventoryObservationSummary.safeConsoleOnly === true}，consoleObservationOperations=${cloudInventoryObservationSummary.consoleObservationOperations || 0}/${cloudInventoryObservationSummary.operations || 0}，executedCommandResults=${cloudInventoryObservationSummary.executedCommandResults || 0}/${cloudInventoryObservationSummary.commandResults || 0}，cloudApiCalledCommandResults=${cloudInventoryObservationSummary.cloudApiCalledCommandResults || 0}。`,
    `域名门禁：${operatorTasks.domain?.ok ? "ready" : "blocked"}；当前 api-cn/assets-cn 仍未证明解析到阿里云 HTTPS 入口。`,
    `镜像发布计划：${imagePlan?.ready ? "ready" : "blocked"}；本地 Docker 镜像 ${imagePlan?.localDockerImage?.status || operatorTasks.imagePublishPlan?.localDockerImage || "unknown"}，ACR/runtime 拉取证据未完成。`,
    `密钥/密码/token/付款/受控标识符类人工介入项：${sensitiveActionItems.length} 项；脚本只输出变量名、控制台路径和动作，不输出任何 value。`,
  ]

  return {
    generatedAt: new Date().toISOString(),
    containsValues: false,
    diagnosticOnly: readiness.diagnosticOnly === true,
    releaseEvidenceUsable: readiness.releaseEvidenceUsable !== false,
    verdict,
    canDeployNow,
    authorizationNote,
    files: {
      envFile: args.envFile,
      envFileExists: existsSync(args.envFile),
      cloudConfirmationsFile: args.cloudConfirmationsFile,
      cloudConfirmationsFileExists: existsSync(args.cloudConfirmationsFile),
      cloudInventoryResultsFile: args.cloudInventoryResultsFile,
      cloudInventoryResultsFileExists: existsSync(args.cloudInventoryResultsFile),
    },
    summary: {
      productionReady: readiness.productionReady,
      diagnosticOnly: readiness.diagnosticOnly === true,
      releaseEvidenceUsable: readiness.releaseEvidenceUsable !== false,
      localCodeReady: readiness.localCodeReady,
      requiredReady: readiness.checks?.env?.requiredReady || 0,
      requiredTotal: readiness.checks?.env?.requiredTotal || 0,
      requiredBlocking: missingRequiredEnv,
      machineBlocking,
      manualBlocking,
      sensitiveActionItems: {
        total: sensitiveActionItems.length,
        blocked: sensitiveActionItems.filter((item) => item.status !== "ready").length,
        types: Array.from(new Set(sensitiveActionItems.map((item) => item.type))).sort(),
      },
      bridgeDataLayer,
      operatorTasks: operatorTasks.summary || {},
      cloudConfirmations: cloudReady,
      cloudInventoryResults: {
        templateReady: cloudInventoryResults.template?.ready === true,
        localExists: cloudInventoryLocal.exists === true,
        localReady: cloudInventoryLocal.ready === true,
        localCheckedOperations: cloudInventoryLocal.checkedOperations || 0,
        localOperations: cloudInventorySummary.localOperations || 0,
        readyLocalOperations: cloudInventorySummary.readyLocalOperations || 0,
        localBlockers: cloudInventoryLocal.blockers || [],
        observationSummary: cloudInventoryObservationSummary,
      },
    },
    localReadiness: {
      backendBridgeMap: bridgeMap
        ? {
            ok: bridgeMap.ok,
            mappedRoutes: bridgeMap.mappedRoutes,
            bridgeReadyRoutes: bridgeMap.bridgeReadyRoutes,
            externalEnvBlockedRoutes: bridgeMap.externalEnvBlockedRoutes,
            sourceTypes: bridgeMap.sourceTypes,
          }
        : null,
      legalPages: legalPages
        ? {
            ok: legalPages.ok,
            blockers: legalPages.blockers || [],
            urls: Object.fromEntries((legalPages.pages || []).map((page) => [page.key, page.envUrl?.status || "unknown"])),
          }
        : null,
      appRuntimeConfig: appRuntimeConfig
        ? {
            ok: appRuntimeConfig.ok,
            containsSecretValues: appRuntimeConfig.containsSecretValues,
            environment: appRuntimeConfig.productionRuntime?.environment || "",
            apiBaseUrl: appRuntimeConfig.productionRuntime?.apiBaseUrl || "",
            assetBaseUrl: appRuntimeConfig.productionRuntime?.assetBaseUrl || "",
            wroteKeys: appRuntimeConfig.productionRuntime?.wroteKeys || [],
            blockers: appRuntimeConfig.blockers || [],
          }
        : null,
      nativeRelease: nativeRelease
        ? {
            ok: nativeRelease.ok,
            androidReady: nativeRelease.android?.ready,
            iosReady: nativeRelease.ios?.ready,
            associatedDomainsConfigured: nativeRelease.ios?.associatedDomainsConfigured,
          }
        : null,
      universalLink: universalLink
        ? {
            ok: universalLink.ok,
            blockers: universalLink.blockers || [],
            universalLinkPath: universalLink.universalLinkPath,
          }
        : null,
      docker: docker || null,
      imagePublishPlan: imagePlan
        ? {
            ready: imagePlan.ready,
            localDockerImageStatus: imagePlan.localDockerImage?.status || "unknown",
            localReady: imagePlan.summary?.localReady,
            blockers: imagePlan.local?.blockers || [],
          }
        : null,
      bridgeDataLayer,
      cloudInventoryResults: {
        ok: cloudInventoryResults.ok === true,
        readOnlyOnly: cloudInventoryResults.readOnlyOnly === true,
        cloudMutationPerformed: cloudInventoryResults.cloudMutationPerformed === true,
        localFile: cloudInventoryLocal.file || args.cloudInventoryResultsFile,
        localReady: cloudInventoryLocal.ready === true,
        localExists: cloudInventoryLocal.exists === true,
        localCheckedOperations: cloudInventoryLocal.checkedOperations || 0,
        localBlockers: cloudInventoryLocal.blockers || [],
        observationSummary: cloudInventoryObservationSummary,
      },
    },
    tasks: {
      ready: readyTasks.map(compactTask),
      notReady: notReadyTasks.map(compactTask),
      keyBlocked: [wechatTask, domainTask, envTask].filter(Boolean).map(compactTask),
      sensitiveActionItems: sensitiveActionItems.map(compactSensitiveActionItem),
      legal: legalTask ? compactTask(legalTask) : null,
      waitingWechatReview: wechatTask?.status === "waiting_wechat_review" ? compactTask(wechatTask) : null,
    },
    nextCommandOrder: [
      "corepack pnpm aliyun:operator:tasks",
      "corepack pnpm aliyun:cloud:check",
      "corepack pnpm aliyun:cloud:inventory-results",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
      "corepack pnpm aliyun:cloud:confirmations:strict",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:readiness:cloud-ready",
      "corepack pnpm aliyun:release:artifacts",
      "corepack pnpm aliyun:docker:build",
      "corepack pnpm aliyun:container:smoke",
      "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin",
    ],
    humanSummary,
  }
}

function compactSensitiveActionItem(item) {
  return {
    id: item.id,
    type: item.type,
    status: item.status,
    owner: item.owner,
    consolePath: item.consolePath,
    obtainFrom: item.obtainFrom || item.consolePath,
    writeTargets: item.writeTargets || [],
    verifyCommands: item.verifyCommands || [],
    requiresActionTimeConfirmation: item.requiresActionTimeConfirmation === true,
    completionEvidence: item.completionEvidence || [],
    variableNames: item.variableNames || [],
    variableGroupCount: Array.isArray(item.variableGroups) ? item.variableGroups.length : 0,
    requiredUserAction: item.requiredUserAction,
    unblockCondition: item.unblockCondition,
    forbidden: item.forbidden,
  }
}

function renderMarkdown(status) {
  const lines = [
    "# 美业话镜 APP production-cn 状态摘要",
    "",
    `Generated: ${status.generatedAt}`,
    "",
    `- Verdict: ${status.verdict}`,
    `- Can deploy now: ${status.canDeployNow ? "yes" : "no"}`,
    `- Diagnostic only: ${status.diagnosticOnly ? "yes" : "no"}`,
    `- Release evidence usable: ${status.releaseEvidenceUsable ? "yes" : "no"}`,
    `- Required env: ${status.summary.requiredReady}/${status.summary.requiredTotal}`,
    `- Missing required env: ${status.summary.requiredBlocking.length ? status.summary.requiredBlocking.join(", ") : "none"}`,
    `- Operator tasks: ready ${status.summary.operatorTasks.ready || 0}/${status.summary.operatorTasks.total || 0}, blocked ${status.summary.operatorTasks.blocked || 0}, waiting_wechat_review ${status.summary.operatorTasks.waitingWechatReview || 0}, pending_cloud ${status.summary.operatorTasks.pendingCloud || 0}, waiting_for_deploy ${status.summary.operatorTasks.waitingForDeploy || 0}`,
    `- Cloud confirmations: ${status.summary.cloudConfirmations.ready}/${status.summary.cloudConfirmations.total} ready`,
    `- Cloud inventory results: local ${status.summary.cloudInventoryResults.readyLocalOperations}/${status.summary.cloudInventoryResults.localOperations} operations ready, localReady ${status.summary.cloudInventoryResults.localReady}`,
    `- Sensitive action items: ${status.summary.sensitiveActionItems.total} total, ${status.summary.sensitiveActionItems.blocked} blocked`,
    `- Bridge data layer: ${status.summary.bridgeDataLayer?.current || "unknown"} -> ${status.summary.bridgeDataLayer?.target || "unknown"} (${status.summary.bridgeDataLayer?.status || "unknown"})`,
    "",
    "## Human Summary",
    "",
    ...status.humanSummary.map((line) => `- ${line}`),
    "",
    "## Not Ready Tasks",
    "",
    ...status.tasks.notReady.flatMap((task) => [
      `### ${task.id} ${task.title}`,
      "",
      `- Status: ${task.status}`,
      `- Owner: ${task.owner}`,
      `- Console path: ${task.consolePath}`,
      `- Blockers: ${task.blockerCodes.length ? task.blockerCodes.join(", ") : "none"}`,
      "",
    ]),
    "## Aliyun CLI Read-only Inventory Results",
    "",
    `- Local file: ${status.localReadiness.cloudInventoryResults.localFile}`,
    `- Local exists: ${status.localReadiness.cloudInventoryResults.localExists}`,
    `- Local ready: ${status.localReadiness.cloudInventoryResults.localReady}`,
    `- Local checked operations: ${status.localReadiness.cloudInventoryResults.localCheckedOperations}`,
    `- Read-only only: ${status.localReadiness.cloudInventoryResults.readOnlyOnly}`,
    `- Cloud mutation performed: ${status.localReadiness.cloudInventoryResults.cloudMutationPerformed}`,
    `- Safe console-only evidence: ${status.localReadiness.cloudInventoryResults.observationSummary?.safeConsoleOnly === true}`,
    `- Console observation operations: ${status.localReadiness.cloudInventoryResults.observationSummary?.consoleObservationOperations || 0}/${status.localReadiness.cloudInventoryResults.observationSummary?.operations || 0}`,
    `- Executed command results: ${status.localReadiness.cloudInventoryResults.observationSummary?.executedCommandResults || 0}/${status.localReadiness.cloudInventoryResults.observationSummary?.commandResults || 0}`,
    `- Cloud API called command results: ${status.localReadiness.cloudInventoryResults.observationSummary?.cloudApiCalledCommandResults || 0}`,
    `- Blockers: ${status.localReadiness.cloudInventoryResults.localBlockers.length ? status.localReadiness.cloudInventoryResults.localBlockers.join(", ") : "none"}`,
    "",
    "## Sensitive / Token / Payment / Controlled Identifier Action Items",
    "",
    ...status.tasks.sensitiveActionItems.flatMap((item) => [
      `### ${item.id}`,
      "",
      `- Type: ${item.type}`,
      `- Status: ${item.status}`,
      `- Owner: ${item.owner}`,
      `- Console path: ${item.consolePath}`,
      `- Obtain from: ${item.obtainFrom}`,
      `- Write targets: ${item.writeTargets.length ? item.writeTargets.join("; ") : "none"}`,
      `- Verify commands: ${item.verifyCommands.length ? item.verifyCommands.join("; ") : "none"}`,
      `- Requires action-time confirmation: ${item.requiresActionTimeConfirmation}`,
      `- Completion evidence: ${item.completionEvidence.length ? item.completionEvidence.join("; ") : "none"}`,
      `- Variables: ${item.variableNames.length ? item.variableNames.join(", ") : "none"}`,
      `- Action: ${item.requiredUserAction}`,
      `- Unblock: ${item.unblockCondition}`,
      `- Forbidden: ${item.forbidden}`,
      "",
    ]),
    "## Next Command Order",
    "",
    ...status.nextCommandOrder.map((command) => `- \`${command}\``),
    "",
    "本文件不包含任何密钥值，也不代表已执行生产部署。",
  ]
  return `${lines.join("\n")}\n`
}

function printHelp() {
  console.log(`Usage: node scripts/summarize-aliyun-production-cn-status.mjs [options]

Options:
  --env-file <path>              Env file to check. Defaults to workspace .env.production-cn.local.
  --cloud-confirmations <path>   Non-secret cloud confirmation file.
  --cloud-inventory-results <path>
                                  Non-secret Aliyun CLI inventory result summary file.
  --out <path>                   Write JSON summary to a file.
  --markdown <path>              Write Markdown summary to a file.
  -h, --help                     Show this help.
`)
}

function main() {
  const args = parseArgs(process.argv)
  const readiness = runJson("readiness", [
    resolve(BACKEND_ROOT, "scripts/check-aliyun-production-cn-readiness.mjs"),
    "--allow-blocking",
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
  const cloudInventoryResults = runJson("cloud_inventory_results", [
    resolve(BACKEND_ROOT, "scripts/check-aliyun-cli-inventory-results.mjs"),
    "--allow-incomplete",
    "--local",
    args.cloudInventoryResultsFile,
  ])

  const status = buildStatus({ readiness, operatorTasks, cloudInventoryResults, args })
  const output = `${JSON.stringify(status, null, 2)}\n`
  if (args.outPath) writeFileSync(args.outPath, output)
  if (args.markdownPath) writeFileSync(args.markdownPath, renderMarkdown(status))
  process.stdout.write(output)
}

main()
