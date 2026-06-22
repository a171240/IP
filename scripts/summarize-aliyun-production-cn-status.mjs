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

function buildStatus({ readiness, operatorTasks, args }) {
  const tasks = operatorTasks.tasks || []
  const notReadyTasks = tasks.filter((task) => !task.ready)
  const readyTasks = tasks.filter((task) => task.ready)
  const wechatTask = taskById(tasks, "T01_WECHAT_OPEN_PLATFORM_APP_LOGIN")
  const legalTask = taskById(tasks, "T02_APP_LEGAL_LINKS")
  const domainTask = taskById(tasks, "T04_ALIYUN_DOMAIN_DNS_HTTPS")
  const envTask = taskById(tasks, "T06_ALIYUN_ENV_IMPORT")
  const cloudReady = countCloudReady(readiness)
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
  const wechatReviewStatus = readiness.checks?.wechatOpenPlatform?.reviewStatus || "unknown"

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
      : `微信开放平台移动应用状态：${wechatReviewStatus}；AppID/Secret 只能等移动应用审核通过后从微信开放平台获取。`,
    `Apple Universal Link：${universalLink?.ok ? "ready" : "blocked"}；${(universalLink?.blockers || []).join(", ") || "no blockers"}。`,
    `阿里云云资源确认：${cloudReady.ready}/${cloudReady.total} ready；还缺 SAE、DNS/HTTPS/ICP、OSS/CORS/RAM、微信开放平台 approved、env import、SLS 中未完成项。`,
    `域名门禁：${operatorTasks.domain?.ok ? "ready" : "blocked"}；当前 api-cn/assets-cn 仍未证明解析到阿里云 HTTPS 入口。`,
    `镜像发布计划：${imagePlan?.ready ? "ready" : "blocked"}；本地 Docker 镜像 ${imagePlan?.localDockerImage?.status || operatorTasks.imagePublishPlan?.localDockerImage || "unknown"}，ACR/runtime 拉取证据未完成。`,
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
      operatorTasks: operatorTasks.summary || {},
      cloudConfirmations: cloudReady,
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
    },
    tasks: {
      ready: readyTasks.map(compactTask),
      notReady: notReadyTasks.map(compactTask),
      keyBlocked: [wechatTask, domainTask, envTask].filter(Boolean).map(compactTask),
      legal: legalTask ? compactTask(legalTask) : null,
      waitingWechatReview: wechatTask?.status === "waiting_wechat_review" ? compactTask(wechatTask) : null,
    },
    nextCommandOrder: [
      "corepack pnpm aliyun:operator:tasks",
      "corepack pnpm aliyun:cloud:check",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:readiness:cloud-ready",
      "corepack pnpm aliyun:docker:build",
      "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin",
    ],
    humanSummary,
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

  const status = buildStatus({ readiness, operatorTasks, args })
  const output = `${JSON.stringify(status, null, 2)}\n`
  if (args.outPath) writeFileSync(args.outPath, output)
  if (args.markdownPath) writeFileSync(args.markdownPath, renderMarkdown(status))
  process.stdout.write(output)
}

main()
