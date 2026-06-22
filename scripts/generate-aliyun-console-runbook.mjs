#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")

const TASK_SEQUENCE_BY_ID = Object.freeze({
  C01_SAE_RUNTIME: Object.freeze({
    sequencePhase: "runtime",
    dependsOn: ["C02_ACR_IMAGE_AND_PULL", "C05_OSS_AUDIO_RAM_STS", "C06_ENV_IMPORT"],
  }),
  C02_ACR_IMAGE_AND_PULL: Object.freeze({
    sequencePhase: "image_runtime",
    dependsOn: [],
  }),
  C03_API_DOMAIN_HTTPS_ICP: Object.freeze({
    sequencePhase: "public_entry",
    dependsOn: ["C01_SAE_RUNTIME"],
  }),
  C04_ASSET_DOMAIN_HTTPS_ICP: Object.freeze({
    sequencePhase: "asset_entry",
    dependsOn: ["C05_OSS_AUDIO_RAM_STS"],
  }),
  C05_OSS_AUDIO_RAM_STS: Object.freeze({
    sequencePhase: "cloud_foundation",
    dependsOn: [],
  }),
  C06_ENV_IMPORT: Object.freeze({
    sequencePhase: "runtime_config",
    dependsOn: ["C05_OSS_AUDIO_RAM_STS"],
  }),
  C07_SLS_ALERTS: Object.freeze({
    sequencePhase: "observability",
    dependsOn: ["C01_SAE_RUNTIME"],
  }),
})

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

function mapById(items = []) {
  return new Map(items.map((item) => [item.id, item]))
}

function envArgs(args) {
  return [
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ]
}

function buildTask({
  id,
  title,
  resource,
  userAction,
  targetFields,
  actionTimeConfirmationReason = "",
}) {
  return {
    id,
    title,
    status: resource?.status || userAction?.status || "blocked",
    ready: resource?.ready === true || userAction?.status === "ready",
    consolePath: userAction?.obtainFrom || resource?.consolePath || "",
    mutationRequiredInConsole: true,
    mutationPerformedByThisCommand: false,
    requiresActionTimeConfirmation: resource?.requiresActionTimeConfirmation === true || userAction?.requiresActionTimeConfirmation === true,
    actionTimeConfirmationReason,
    targetFields,
    writeTargets: unique([...(resource?.writeTargets || []), ...(userAction?.writeTargets || [])]),
    nonSecretFieldsToRecord: resource?.nonSecretFieldsToRecord || [],
    currentBlockers: unique([...(resource?.blockers || []), ...(userAction?.currentBlockers || [])]),
    currentEvidence: unique([...(resource?.currentEvidence || []), ...(userAction?.currentEvidence || [])]),
    nextActions: unique([...(resource?.nextActions || []), userAction?.requiredUserAction].filter(Boolean)),
    verifyCommands: unique([...(resource?.verifyCommands || []), ...(userAction?.verifyCommands || [])]),
    completionEvidence: resource?.evidenceExpected || [],
    forbidden: unique([...(resource?.forbidden || []), ...(userAction?.forbidden || [])]),
  }
}

function buildRunbook(args) {
  const runtimePlan = runJson("runtime_plan", ["scripts/check-aliyun-runtime-plan.mjs"])
  const imagePlan = runJson("image_publish_plan", ["scripts/check-aliyun-image-publish-plan.mjs", "--allow-incomplete"])
  const resourcesMatrix = runJson("resources_matrix", [
    "scripts/summarize-aliyun-resource-matrix.mjs",
    ...envArgs(args),
  ])
  const userActions = runJson("user_actions", [
    "scripts/summarize-aliyun-user-action-brief.mjs",
    ...envArgs(args),
  ])
  const cloudAccess = runJson("cloud_access", [
    "scripts/check-aliyun-cloud-access.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const status = runJson("production_status", [
    "scripts/summarize-aliyun-production-cn-status.mjs",
    ...envArgs(args),
  ])

  const resources = mapById(resourcesMatrix.resources || [])
  const actions = mapById(userActions.actions || [])
  const acr = imagePlan.local?.acr || {}
  const purchaseCandidate = acr.purchaseCandidate || {}
  const runtime = imagePlan.local?.runtime || {}
  const localDockerDigest =
    imagePlan.localDockerImage?.repoDigests?.[0] ||
    imagePlan.localDockerImage?.id ||
    (imagePlan.local?.image?.localDigestReady ? "ready" : "missing")

  const tasks = applyTaskSequencing([
    buildTask({
      id: "C01_SAE_RUNTIME",
      title: "创建或确认 SAE production-cn 自定义容器应用",
      resource: resources.get("R01_SAE_RUNTIME"),
      userAction: actions.get("U08_SAE_RUNTIME_AND_SLS"),
      targetFields: [
        field("region", runtimePlan.region, "runtime plan"),
        field("appName", runtimePlan.appName, "runtime plan"),
        field("runtime", runtimePlan.runtime, "runtime plan"),
        field("containerPort", runtimePlan.containerPort, "runtime plan"),
        field("healthPath", runtimePlan.healthPath, "runtime plan"),
        field("strictHealthPath", runtimePlan.strictHealthPath || "/api/app/health?strict=1", "runtime plan"),
        field("publicIngress", true, "runtime plan"),
        field("remoteImage", "填 ACR remote image，必须等 C02 镜像仓库 ready 后再配置", "dependency"),
      ],
    }),
    buildTask({
      id: "C02_ACR_IMAGE_AND_PULL",
      title: "购买/确认 ACR 并配置镜像仓库、push digest 和 SAE 拉取权限",
      resource: resources.get("R02_ACR_IMAGE_REGISTRY"),
      userAction: actions.get("U03_ACR_PURCHASE_CONFIRMATION"),
      actionTimeConfirmationReason: "ACR 购买页当前候选为付费动作；付款前必须由用户确认规格和金额。",
      targetFields: [
        field("edition", purchaseCandidate.edition || "ACR Enterprise Economic", "image publish plan"),
        field("region", purchaseCandidate.region || "cn-hangzhou", "image publish plan"),
        field("duration", purchaseCandidate.duration || "1 month", "image publish plan"),
        field("quotedAmount", purchaseCandidate.quotedAmount || "CNY 117.00", "read-only console evidence"),
        field("repository", acr.repository || "meiye-huajing-app-api", "image publish plan"),
        field("remoteTag", acr.remoteTag || "production-cn", "image publish plan"),
        field("localImage", imagePlan.local?.image?.localTag || "meiye-huajing-app-api:production-cn", "image publish plan"),
        field("localDigest", localDockerDigest, "local docker evidence"),
        field("runtimeAppName", runtime.appName || runtimePlan.appName, "image publish plan"),
      ],
    }),
    buildTask({
      id: "C03_API_DOMAIN_HTTPS_ICP",
      title: "配置 api-cn DNS、HTTPS、ICP 和后端公网入口",
      resource: resources.get("R03_API_DOMAIN_HTTPS"),
      userAction: actions.get("U07_DOMAIN_DNS_HTTPS_ICP"),
      actionTimeConfirmationReason: "DNS/HTTPS 会改变公网访问入口，动作前需要确认目标入口。",
      targetFields: [
        field("host", runtimePlan.apiHost || "api-cn.ipgongchang.xin", "runtime plan"),
        field("target", "SAE/SLB/网关公网入口，不能指向 198.18.0.x、localhost、example 或 Vercel", "domain gate"),
        field("notAccepted", "现有 api/ip A 106.14.241.129 是旧记录，不是 api-cn 主机记录，不能当作 APP production-cn API ready 证据", "read-only DNS evidence"),
        field("httpsRequired", true, "deployment spec"),
        field("icpReadyRequired", true, "domestic app release"),
      ],
    }),
    buildTask({
      id: "C04_ASSET_DOMAIN_HTTPS_ICP",
      title: "配置 assets-cn DNS、HTTPS、ICP 和 OSS/CDN 资源入口",
      resource: resources.get("R04_ASSET_DOMAIN_HTTPS"),
      userAction: actions.get("U07_DOMAIN_DNS_HTTPS_ICP"),
      actionTimeConfirmationReason: "DNS/HTTPS 会改变静态资源公网访问入口，动作前需要确认目标入口。",
      targetFields: [
        field("host", runtimePlan.assetHost || "assets-cn.ipgongchang.xin", "runtime plan"),
        field("target", "OSS/CDN 静态资源入口，不能只用 Bucket/CORS 证据替代域名证据", "domain gate"),
        field("notAccepted", "现有 api/ip A 106.14.241.129 不是 assets-cn 主机记录，不能当作 APP production-cn 资产域名 ready 证据", "read-only DNS evidence"),
        field("httpsRequired", true, "deployment spec"),
        field("icpReadyRequired", true, "domestic app release"),
      ],
    }),
    buildTask({
      id: "C05_OSS_AUDIO_RAM_STS",
      title: "确认 OSS 音频 bucket、CORS、RAM 最小权限或 STS/运行时角色",
      resource: resources.get("R05_OSS_AUDIO_STORAGE"),
      userAction: actions.get("U05_OSS_RAM_OR_STS"),
      targetFields: [
        field("bucket", "meiye-huajing-service-records-production-cn", "local cloud evidence"),
        field("region", "cn-hangzhou", "local cloud evidence"),
        field("serviceRecordPrefix", "service-records/production-cn", "runtime plan"),
        field("ramPolicyTemplate", "deploy/aliyun-production-cn.oss-ram-policy.json", "tracked policy"),
        field("secretImportTarget", "KMS/Secrets Manager/SAE secret env 或 STS/运行时角色", "security policy"),
      ],
    }),
    buildTask({
      id: "C06_ENV_IMPORT",
      title: "把 production-cn 变量导入 SAE/KMS/Secrets Manager",
      resource: resources.get("R06_ENV_IMPORT"),
      userAction: actions.get("U06_ENV_IMPORT"),
      actionTimeConfirmationReason: "该步骤涉及把本地 ready 的敏感变量导入阿里云受控环境，必须动作时确认。",
      targetFields: [
        field("planCommand", "corepack pnpm aliyun:env:checklist", "local generated checklist"),
        field("plainEnvTarget", "SAE plain env for non-secret identifiers only", "env plan"),
        field("secretEnvTarget", "KMS/Secrets Manager/SAE secret env for secret or connection values", "env plan"),
        field("requiredBlocking", status.summary?.requiredBlocking?.join(", ") || "none", "current status"),
        field("secretNotInImage", true, "completion evidence"),
      ],
    }),
    buildTask({
      id: "C07_SLS_ALERTS",
      title: "配置 SLS 日志采集、/api/healthz 健康告警和 5xx 告警",
      resource: resources.get("R07_SLS_ALERTS"),
      userAction: actions.get("U08_SAE_RUNTIME_AND_SLS"),
      targetFields: [
        field("slsProject", "meiye-huajing-app-prod-cn", "local cloud evidence"),
        field("logstore", "app-api", "local cloud evidence"),
        field("healthPath", "/api/healthz", "runtime plan"),
        field("healthAlertConfigured", true, "completion evidence"),
        field("serverErrorAlertConfigured", true, "completion evidence"),
      ],
    }),
  ])

  const runbook = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    currentAnswer: status.canDeployNow === true
      ? "机器门禁接近可部署，但生产部署仍需单独授权；本 runbook 只负责控制台字段核对。"
      : "现在不能部署；本 runbook 列出阿里云控制台需要创建、确认或补证据的字段，不执行任何云侧写操作。",
    summary: {
      productionReady: status.summary?.productionReady === true,
      canDeployNow: status.canDeployNow === true,
      resourceReady: `${resourcesMatrix.summary.ready}/${resourcesMatrix.summary.total}`,
      userActionReady: `${userActions.summary.ready}/${userActions.summary.total}`,
      requiredBlocking: status.summary?.requiredBlocking || [],
      blockedResourceIds: resourcesMatrix.summary.blockedIds || [],
      blockedUserActionIds: userActions.summary.blockedIds || [],
      canStartNowConsoleTasks: tasks
        .filter((task) => task.canStartNow)
        .map((task) => task.id),
      blockedByTaskDependencies: tasks
        .filter((task) => task.blockingDependencies.length > 0)
        .map((task) => task.id),
      actionTimeConfirmationRequired: unique([
        ...(resourcesMatrix.summary.actionTimeConfirmationRequired || []),
        ...(userActions.summary.actionTimeConfirmationRequired || []),
      ]),
    },
    cloudAccess: {
      browserLoggedIn: cloudAccess.cloudShellObservation?.browserConsole?.chromeLoggedIn === true,
      browserEvidence: cloudAccess.cloudShellObservation?.browserConsole?.evidence || "",
      cloudShellConnected: cloudAccess.cloudShellObservation?.cloudShell?.connected === true,
      cloudShellCanRunReadOnlyInventory: cloudAccess.cloudShellObservation?.cloudShell?.canRunReadOnlyInventory === true,
      blockers: cloudAccess.blockers || [],
    },
    target: {
      provider: runtimePlan.provider,
      region: runtimePlan.region,
      appName: runtimePlan.appName,
      runtime: runtimePlan.runtime,
      apiHost: runtimePlan.apiHost,
      assetHost: runtimePlan.assetHost,
    },
    consoleTasks: tasks,
    nextVerifyCommands: [
      "corepack pnpm aliyun:console:runbook",
      "corepack pnpm aliyun:cloud:confirmations:strict",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:readiness:cloud-ready",
      "corepack pnpm aliyun:release:artifacts",
    ],
    safetyBoundary: [
      "本 runbook 不创建资源、不付款、不修改 DNS、不导入环境变量、不推送镜像、不部署。",
      "只在 .local.json 中记录资源名、布尔值、控制台路径或截图编号；不要写入 secret value。",
      "ACR 付款、DNS 修改、环境变量导入、生产部署和 git push 都需要动作时确认。",
      "不要把 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie 或 Supabase service role key 写入仓库、文档、镜像或 JSON。",
    ],
  }
  const secretLikePaths = findSecretLikeValues(runbook)
  runbook.secretLeakCheck = {
    ok: secretLikePaths.length === 0,
    secretLikePaths,
  }
  runbook.ok = runbook.secretLeakCheck.ok
  return runbook
}

function applyTaskSequencing(tasks) {
  const readyById = new Map(tasks.map((task) => [task.id, task.ready === true]))
  return tasks.map((task) => {
    const sequence = TASK_SEQUENCE_BY_ID[task.id] || { sequencePhase: "unknown", dependsOn: [] }
    const dependsOn = sequence.dependsOn || []
    const blockingDependencies = dependsOn.filter((taskId) => readyById.get(taskId) !== true)
    return {
      ...task,
      sequencePhase: sequence.sequencePhase,
      dependsOn,
      blockingDependencies,
      canStartNow: task.ready !== true && blockingDependencies.length === 0,
    }
  })
}

function field(name, value, source) {
  return {
    name,
    value,
    source,
  }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)))
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

function renderMarkdown(runbook) {
  const lines = [
    "# 美业话镜 APP production-cn 阿里云控制台 Runbook",
    "",
    `Generated: ${runbook.generatedAt}`,
    "",
    "## 结论",
    "",
    `- ${runbook.currentAnswer}`,
    `- ok: ${runbook.ok}`,
    `- containsValues: ${runbook.containsValues}`,
    `- mutationPerformed: ${runbook.mutationPerformed}`,
    `- productionReady: ${runbook.summary.productionReady}`,
    `- canDeployNow: ${runbook.summary.canDeployNow}`,
    `- resourceReady: ${runbook.summary.resourceReady}`,
    `- userActionReady: ${runbook.summary.userActionReady}`,
    `- requiredBlocking: ${runbook.summary.requiredBlocking.length ? runbook.summary.requiredBlocking.join(", ") : "none"}`,
    `- canStartNowConsoleTasks: ${runbook.summary.canStartNowConsoleTasks.length ? runbook.summary.canStartNowConsoleTasks.join(", ") : "none"}`,
    `- blockedByTaskDependencies: ${runbook.summary.blockedByTaskDependencies.length ? runbook.summary.blockedByTaskDependencies.join(", ") : "none"}`,
    `- actionTimeConfirmationRequired: ${runbook.summary.actionTimeConfirmationRequired.length ? runbook.summary.actionTimeConfirmationRequired.join(", ") : "none"}`,
    "",
    "## 目标",
    "",
    `- provider: ${runbook.target.provider}`,
    `- region: ${runbook.target.region}`,
    `- appName: ${runbook.target.appName}`,
    `- runtime: ${runbook.target.runtime}`,
    `- apiHost: ${runbook.target.apiHost}`,
    `- assetHost: ${runbook.target.assetHost}`,
    "",
    "## 云侧访问证据",
    "",
    `- browserLoggedIn: ${runbook.cloudAccess.browserLoggedIn}`,
    `- browserEvidence: ${runbook.cloudAccess.browserEvidence || "none"}`,
    `- cloudShellConnected: ${runbook.cloudAccess.cloudShellConnected}`,
    `- cloudShellCanRunReadOnlyInventory: ${runbook.cloudAccess.cloudShellCanRunReadOnlyInventory}`,
    `- blockers: ${runbook.cloudAccess.blockers.length ? runbook.cloudAccess.blockers.join(", ") : "none"}`,
    "",
    "## 控制台任务",
    "",
  ]

  for (const task of runbook.consoleTasks) {
    lines.push(
      `### ${task.id} ${task.title}`,
      "",
      `- status: ${task.status}`,
      `- ready: ${task.ready}`,
      `- sequencePhase: ${task.sequencePhase}`,
      `- dependsOn: ${task.dependsOn.join(", ") || "none"}`,
      `- blockingDependencies: ${task.blockingDependencies.join(", ") || "none"}`,
      `- canStartNow: ${task.canStartNow}`,
      `- consolePath: ${task.consolePath}`,
      `- mutationRequiredInConsole: ${task.mutationRequiredInConsole}`,
      `- mutationPerformedByThisCommand: ${task.mutationPerformedByThisCommand}`,
      `- requiresActionTimeConfirmation: ${task.requiresActionTimeConfirmation}`,
      task.actionTimeConfirmationReason ? `- actionTimeConfirmationReason: ${task.actionTimeConfirmationReason}` : "",
      "- targetFields:",
      ...task.targetFields.map((item) => `  - ${item.name}: ${item.value} (${item.source})`),
      "- writeTargets:",
      ...(task.writeTargets.length ? task.writeTargets.map((item) => `  - ${item}`) : ["  - none"]),
      "- currentBlockers:",
      ...(task.currentBlockers.length ? task.currentBlockers.map((item) => `  - ${item}`) : ["  - none"]),
      "- currentEvidence:",
      ...(task.currentEvidence.length ? task.currentEvidence.map((item) => `  - ${item}`) : ["  - none"]),
      "- verifyCommands:",
      ...(task.verifyCommands.length ? task.verifyCommands.map((item) => `  - ${item}`) : ["  - none"]),
      "- forbidden:",
      ...(task.forbidden.length ? task.forbidden.map((item) => `  - ${item}`) : ["  - none"]),
      "",
    )
  }

  lines.push(
    "## 下一组验证命令",
    "",
    ...runbook.nextVerifyCommands.map((command) => `- \`${command}\``),
    "",
    "## 安全边界",
    "",
    ...runbook.safetyBoundary.map((item) => `- ${item}`),
    "",
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
  const runbook = buildRunbook(args)
  writeOutput(args.outPath, `${JSON.stringify(runbook, null, 2)}\n`)
  writeOutput(args.markdownPath, renderMarkdown(runbook))
  console.log(JSON.stringify(runbook, null, 2))
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-aliyun-console-runbook.mjs [--env-file path] [--cloud-confirmations path] [--out /tmp/runbook.json] [--markdown /tmp/runbook.md]",
    "",
    "Builds a non-secret Aliyun console runbook from current production-cn resource, user-action, runtime, image, and cloud-access evidence.",
    "It does not create resources, import secrets, mutate DNS, push images, deploy, or pay for ACR.",
  ].join("\n"))
}

main()
