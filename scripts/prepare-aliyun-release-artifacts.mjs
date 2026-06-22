#!/usr/bin/env node

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_OUT_PARENT = "/tmp"
const ARCHIVE_NAME = "meiye-huajing-app-api-production-cn-context.tar.gz"

const TAR_EXCLUDES = [
  ".git",
  ".next",
  ".vercel",
  "node_modules",
  "coverage",
  "logs",
  "tmp",
  "tmpshots",
  "artifacts",
  "codex-plugin-library",
  "output",
  "xiaoshouzhushou1",
  "提示词",
  ".env",
  ".env.*",
  "*.log",
  "*.tsbuildinfo",
  "voice-coach-ws-deploy.tar.gz",
  ".DS_Store",
  ".claude",
  "./.claude",
  "tmp-*",
  "./tmp-*",
  "li-ke-*.png",
  "./li-ke-*.png",
  "feishu_page.html",
  "./feishu_page.html",
]

const FORBIDDEN_ARCHIVE_PATTERNS = [
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.next(\/|$)/,
  /(^|\/)\.vercel(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.env($|\.|\/)/,
  /(^|\/).*\.log$/,
  /(^|\/).*\.tsbuildinfo$/,
]

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: "",
    cloudInventoryResultsFile: "",
    outDir: "",
    skipBundle: false,
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
    if (arg === "--out-dir") {
      args.outDir = resolveValue(argv[++index], "--out-dir")
      continue
    }
    if (arg === "--skip-bundle") {
      args.skipBundle = true
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
  if (!args.outDir) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    args.outDir = resolve(DEFAULT_OUT_PARENT, `meiye-huajing-aliyun-production-cn-${stamp}`)
  }
  return args
}

function resolveValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: opts.cwd || BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const stdout = (result.stdout || "").trim()
  const stderr = (result.stderr || "").trim()
  if (result.error) throw result.error
  if (result.status !== 0 && !opts.allowFailure) {
    throw new Error(`${opts.label || command}_failed:${result.status}\n${stderr || stdout}`)
  }
  return {
    status: result.status,
    stdout,
    stderr,
  }
}

function parseJsonOutput(label, output) {
  try {
    return JSON.parse(output.stdout)
  } catch (error) {
    throw new Error(`invalid_json_from_${label}:${error instanceof Error ? error.message : String(error)}`)
  }
}

function runJson(label, args, opts = {}) {
  return parseJsonOutput(label, run(process.execPath, args, opts))
}

function git(args) {
  return run("git", ["-C", BACKEND_ROOT, ...args], { allowFailure: true }).stdout
}

function createArchive(outDir) {
  const archivePath = resolve(outDir, ARCHIVE_NAME)
  const tarArgs = [
    "-czf",
    archivePath,
    ...TAR_EXCLUDES.flatMap((pattern) => [`--exclude=${pattern}`]),
    "-C",
    BACKEND_ROOT,
    ".",
  ]
  run("tar", tarArgs, { label: "tar_create_context" })
  const entries = listArchiveEntries(archivePath)
  const forbiddenEntries = entries.filter((entry) => {
    const normalized = entry.replace(/^\.\//, "")
    return FORBIDDEN_ARCHIVE_PATTERNS.some((pattern) => pattern.test(normalized))
  })
  if (forbiddenEntries.length > 0) {
    throw new Error(`archive_contains_forbidden_entries:${forbiddenEntries.slice(0, 20).join(",")}`)
  }
  return {
    path: archivePath,
    bytes: statSync(archivePath).size,
    entryCount: entries.length,
    forbiddenEntryCount: forbiddenEntries.length,
  }
}

function listArchiveEntries(archivePath) {
  const output = run("tar", ["-tzf", archivePath], { label: "tar_list_context" })
  return output.stdout.split(/\r?\n/).filter(Boolean)
}

function writeText(filePath, content) {
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function renderMarkdown(audit) {
  const readiness = audit.checks.readiness
  const env = audit.checks.env
  const routes = audit.checks.routes
  const appApiBridgeMap = audit.checks.appApiBridgeMap
  const appClientContract = audit.checks.appClientContract
  const appApiSmokeCoverage = audit.checks.appApiSmokeCoverage
  const docker = audit.checks.dockerContext
  const bundle = audit.bundle
  const vercelEnvCoverage = audit.checks.vercelEnvCoverage
  const domain = audit.checks.domain
  const cloudAccess = audit.checks.cloudAccess
  const cloudInventoryPlan = audit.checks.cloudInventoryPlan
  const cloudInventoryRunner = audit.checks.cloudInventoryRunner
  const cloudInventoryResults = audit.checks.cloudInventoryResults
  const deploymentSpec = audit.checks.deploymentSpec
  const runtimePlan = audit.checks.runtimePlan
  const legalPages = audit.checks.legalPages
  const imagePublishPlan = audit.checks.imagePublishPlan
  const operatorTasks = audit.checks.operatorTasks
  const envHandoff = audit.checks.envHandoff
  const sensitiveBlockers = audit.checks.sensitiveBlockers
  const resourcesMatrix = audit.checks.resourcesMatrix
  const userActionBrief = audit.checks.userActionBrief
  const consoleRunbook = audit.checks.consoleRunbook
  const provisioningPlan = audit.checks.provisioningPlan
  const actionAuthorization = audit.checks.actionAuthorization
  const completionAudit = audit.checks.completionAudit
  const wechatOpenMobileAppPackage = audit.checks.wechatOpenMobileAppPackage
  const appleTeamAasaPackage = audit.checks.appleTeamAasaPackage
  const operatorHandoff = audit.checks.operatorHandoff
  const productionStatus = audit.checks.productionStatus
  const cloudConfirmationsCheck = audit.checks.cloudConfirmationsCheck
  const cloudConfirmations = readiness.checks?.cloudConfirmations
  const appProductionConfig = readiness.checks?.appProductionConfig
  const appEnvTemplate = appProductionConfig?.envTemplate
  const appRuntimeConfig = appProductionConfig?.runtimeConfig
  const appNativeRelease = appProductionConfig?.nativeRelease
  const bridgeDataLayer = readiness.checks?.bridgeDataLayer || {}
  return [
    "# 美业话镜 APP production-cn 阿里云发布审计",
    "",
    `生成时间：${audit.generatedAt}`,
    "",
    "## 结论",
    "",
    `- productionReady: ${readiness.productionReady}`,
    `- diagnosticOnly: ${readiness.diagnosticOnly === true}`,
    `- releaseEvidenceUsable: ${readiness.releaseEvidenceUsable !== false}`,
    `- localCodeReady: ${readiness.localCodeReady}`,
    `- env requiredReady: ${env.requiredReady} / ${env.requiredTotal}`,
    `- env sourceMetadataReady: ${env.planSourceMetadataReady || 0} / ${env.planVariables || 0}`,
    `- routes: ${routes.checkedRoutes} checked, ${routes.failures.length} failures`,
    `- appApiBridgeMap: ${appApiBridgeMap.mappedRoutes} mapped routes, ${appApiBridgeMap.failures.length} failures`,
    `- appClientContract: ${appClientContract.auditedClientApiCalls} audited calls, ${appClientContract.uniqueAuditedClientRoutes} unique client routes`,
    `- appApiSmokeCoverage: ${appApiSmokeCoverage.coveredBusinessRoutes} / ${appApiSmokeCoverage.businessRoutes} business routes`,
    `- dockerContext: ${docker.ok ? "ok" : "not ok"}`,
    `- deploymentSpec: ${deploymentSpec.ok ? "ok" : "not ready"}`,
    `- runtimePlan: ${runtimePlan.ok ? "ok" : "not ready"} (${runtimePlan.provider || "unknown"} / ${runtimePlan.region || "unknown"} / ${runtimePlan.appName || "unknown"})`,
    `- legalPages: ${legalPages.ok ? "ok" : "not ready"}`,
    `- imagePublishPlan: ${imagePublishPlan.ready === true ? "ready" : "not ready"}`,
    `- domainReadiness: ${domain.ok ? "ok" : "not ready"} (${domain.targetReady} / ${domain.targetTotal})`,
    `- cloudAccess: ${cloudAccess.canReadCloudNow ? "cli-ready" : "manual-console"} (${cloudAccess.blockers?.length || 0} blockers)`,
    `- cloudInventoryPlan: ${cloudInventoryPlan.canRunReadOnlyInventoryNow ? "ready" : "blocked"} (${cloudInventoryPlan.summary?.totalOperations || 0} operations)`,
    `- cloudInventoryRunner: ${cloudInventoryRunner.executionMode}, executed ${cloudInventoryRunner.summary.executedCommands}/${cloudInventoryRunner.summary.commands}`,
    `- cloudInventoryResults: ${cloudInventoryResults.local?.ready ? "ready" : "not ready"} (${cloudInventoryResults.local?.checkedOperations || 0} local operations)`,
    `- appRuntimeConfig: ${appRuntimeConfig?.ok === true ? "ready" : "not ready"}`,
    `- appNativeRelease: ${appNativeRelease?.ok === true ? "ready" : "not ready"}`,
    `- operatorTasks: ${operatorTasks.summary.ready} / ${operatorTasks.summary.total} ready`,
    `- operatorHandoff: ${operatorHandoff.verdict}, missing required env ${operatorHandoff.missingVariables.required.length}`,
    `- productionStatus: ${productionStatus.verdict}, canDeployNow ${productionStatus.canDeployNow === true}`,
    `- envHandoff: ${envHandoff.summary.requiredBlocking.length} required blocked, ${envHandoff.summary.appLaunchBlocking.length} app launch blocked, ${envHandoff.summary.readySecretEnv} ready secret env`,
    `- sensitiveActionItems: ${sensitiveBlockers.summary.total} total, ${sensitiveBlockers.summary.blocked} blocked`,
    `- aliyunResources: ${resourcesMatrix.summary.ready} / ${resourcesMatrix.summary.total} ready, ${resourcesMatrix.summary.blocked} blocked`,
    `- userActionBrief: ${userActionBrief.summary.ready} / ${userActionBrief.summary.total} ready, ${userActionBrief.summary.blocked} blocked`,
    `- actionAuthorization: ${actionAuthorization.summary.actions} actions, ${actionAuthorization.summary.actionTimeConfirmationRequired.length} action-time confirmations`,
    `- provisioningPlan: ${provisioningPlan.summary.readyToStartPhases.length}/${provisioningPlan.summary.phases} phases ready to start, executionMode ${provisioningPlan.executionMode}`,
    `- completionAudit: ${completionAudit.verdict}, complete ${completionAudit.complete === true}, proved ${completionAudit.summary.proved}/${completionAudit.summary.requirements}`,
    `- cloudConfirmations: ${cloudConfirmations?.ready ? "ready" : "not ready"}`,
    `- cloudConfirmationsCheck: template ${cloudConfirmationsCheck?.template?.ready ? "ready" : "not ready"}, local ${cloudConfirmationsCheck?.local?.ready ? "ready" : "not ready"}`,
    `- vercelEnvCoverage: ${vercelEnvCoverage?.ok ? "ok" : vercelEnvCoverage?.skipped ? "skipped" : "not ok"}`,
    `- bridgeDataLayer: ${bridgeDataLayer.current || "unknown"} -> ${bridgeDataLayer.target || "unknown"} (${bridgeDataLayer.status || "unknown"})`,
    `- bundle: ${bundle ? basename(bundle.path) : "skipped"}`,
    "",
    "## 机器可验证阻塞",
    "",
    ...(readiness.machineBlocking.length
      ? readiness.machineBlocking.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## 仍需人工确认",
    "",
    ...(readiness.manualBlocking.length
      ? readiness.manualBlocking.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## 云资源确认文件",
    "",
    `- mode: ${cloudConfirmations?.mode || "unknown"}`,
    `- path: ${cloudConfirmations?.path || "not provided"}`,
    `- ready: ${cloudConfirmations?.ready === true}`,
    "",
    ...(cloudConfirmations?.items?.length
      ? cloudConfirmations.items.map((item) => `- ${item.key}: ${item.status}${item.missing?.length ? ` (${item.missing.join(", ")})` : ""}`)
      : ["- none"]),
    "",
    "## 云确认文件结构校验",
    "",
    `- templateReady: ${cloudConfirmationsCheck?.template?.ready === true}`,
    `- localReady: ${cloudConfirmationsCheck?.local?.ready === true}`,
    `- totalBlockers: ${cloudConfirmationsCheck?.summary?.totalBlockers ?? 0}`,
    ...(cloudConfirmationsCheck?.local?.blockers?.length
      ? cloudConfirmationsCheck.local.blockers.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## 阿里云云侧访问能力",
    "",
    `- path: ${audit.outputFiles.cloudAccess}`,
    `- readOnlyOnly: ${cloudAccess.readOnlyOnly === true}`,
    `- cloudApiCalled: ${cloudAccess.cloudApiCalled === true}`,
    `- cloudMutationPerformed: ${cloudAccess.cloudMutationPerformed === true}`,
    `- canReadCloudNow: ${cloudAccess.canReadCloudNow === true}`,
    `- cliAvailable: ${cloudAccess.cli?.available === true}`,
    `- cliBinary: ${cloudAccess.cli?.binary || "missing"}`,
    `- cliConfigFileExists: ${cloudAccess.cli?.configFileExists === true}`,
    `- checklistItems: ${cloudAccess.consoleEvidenceChecklist?.length || 0}`,
    ...(cloudAccess.blockers?.length
      ? cloudAccess.blockers.map((item) => `- ${item}`)
      : ["- blockers: none"]),
    "",
    "## 阿里云 CLI 只读资源盘点计划",
    "",
    `- json: ${audit.outputFiles.cloudInventoryPlanJson}`,
    `- markdown: ${audit.outputFiles.cloudInventoryPlanMarkdown}`,
    `- readOnlyOnly: ${cloudInventoryPlan.readOnlyOnly === true}`,
    `- cloudApiCalled: ${cloudInventoryPlan.cloudApiCalled === true}`,
    `- cloudMutationPerformed: ${cloudInventoryPlan.cloudMutationPerformed === true}`,
    `- canRunReadOnlyInventoryNow: ${cloudInventoryPlan.canRunReadOnlyInventoryNow === true}`,
    `- totalOperations: ${cloudInventoryPlan.summary?.totalOperations ?? 0}`,
    `- commandTemplates: ${cloudInventoryPlan.summary?.commandTemplates ?? 0}`,
    ...(cloudInventoryPlan.blockers?.length
      ? cloudInventoryPlan.blockers.map((item) => `- ${item}`)
      : ["- blockers: none"]),
    "",
    "## 阿里云 CLI 只读资源盘点 Runner",
    "",
    `- json: ${audit.outputFiles.cloudInventoryRunnerJson}`,
    `- markdown: ${audit.outputFiles.cloudInventoryRunnerMarkdown}`,
    `- executionMode: ${cloudInventoryRunner.executionMode}`,
    `- executeReadonlyRequested: ${cloudInventoryRunner.executeReadonlyRequested === true}`,
    `- executeReadonlyAllowed: ${cloudInventoryRunner.executeReadonlyAllowed === true}`,
    `- readOnlyOnly: ${cloudInventoryRunner.readOnlyOnly === true}`,
    `- cloudApiCalled: ${cloudInventoryRunner.cloudApiCalled === true}`,
    `- cloudMutationPerformed: ${cloudInventoryRunner.cloudMutationPerformed === true}`,
    `- commands: ${cloudInventoryRunner.summary.commands}`,
    `- executedCommands: ${cloudInventoryRunner.summary.executedCommands}`,
    `- dryRunCommands: ${cloudInventoryRunner.summary.dryRunCommands}`,
    ...(cloudInventoryRunner.blockers?.length
      ? cloudInventoryRunner.blockers.map((item) => `- ${item}`)
      : ["- blockers: none"]),
    "",
    "## 阿里云 CLI 只读盘点结果",
    "",
    `- json: ${audit.outputFiles.cloudInventoryResultsJson}`,
    `- markdown: ${audit.outputFiles.cloudInventoryResultsMarkdown}`,
    `- readOnlyOnly: ${cloudInventoryResults.readOnlyOnly === true}`,
    `- cloudMutationPerformed: ${cloudInventoryResults.cloudMutationPerformed === true}`,
    `- localExists: ${cloudInventoryResults.local?.exists === true}`,
    `- localReady: ${cloudInventoryResults.local?.ready === true}`,
    `- localCheckedOperations: ${cloudInventoryResults.local?.checkedOperations ?? 0}`,
    ...(cloudInventoryResults.local?.blockers?.length
      ? cloudInventoryResults.local.blockers.map((item) => `- ${item}`)
      : ["- blockers: none"]),
    "",
    "## APP production-cn 配置模板",
    "",
    `- files: ${appProductionConfig?.files?.ready === true ? "ready" : "not ready"} (${appProductionConfig?.files?.checked ?? 0} checked)`,
    `- scripts: ${appProductionConfig?.scripts?.ready === true ? "ready" : "not ready"} (${appProductionConfig?.scripts?.checked ?? 0} checked)`,
    `- envTemplate: ${appEnvTemplate?.ready === true ? "ready" : "not ready"} (${appEnvTemplate?.checked ?? 0} canonical keys checked)`,
    `- envTemplateKeyCount: ${appEnvTemplate?.keyCount ?? 0}`,
    `- runtimeConfig: ${appRuntimeConfig?.ok === true ? "ready" : "not ready"}`,
    `- runtimeContainsSecretValues: ${appRuntimeConfig?.containsSecretValues === true}`,
    `- runtimeApiBaseUrl: ${appRuntimeConfig?.productionRuntime?.apiBaseUrl || "unknown"}`,
    `- runtimeAssetBaseUrl: ${appRuntimeConfig?.productionRuntime?.assetBaseUrl || "unknown"}`,
    ...(appEnvTemplate?.missingCanonicalKeys?.length
      ? [
          "- missingCanonicalKeys:",
          ...appEnvTemplate.missingCanonicalKeys.map((item) => `  - ${item}`),
        ]
      : []),
    ...(appEnvTemplate?.forbiddenKeys?.length
      ? [
          "- forbiddenKeys:",
          ...appEnvTemplate.forbiddenKeys.map((item) => `  - ${item}`),
        ]
      : []),
    "",
    "## APP 原生发布配置",
    "",
    `- ready: ${appNativeRelease?.ok === true}`,
    `- appName: ${appNativeRelease?.expected?.appName || "unknown"}`,
    `- androidPackageName: ${appNativeRelease?.android?.applicationId || "unknown"}`,
    `- androidReleaseSigningConfig: ${appNativeRelease?.android?.releaseSigningConfig || "missing"}`,
    `- androidReleaseUsesDebugSigning: ${appNativeRelease?.android?.releaseUsesDebugSigning === true}`,
    `- iosBundleIds: ${appNativeRelease?.ios?.bundleIds?.length ? appNativeRelease.ios.bundleIds.join(", ") : "unknown"}`,
    `- iosAssociatedDomainsConfigured: ${appNativeRelease?.ios?.associatedDomainsConfigured === true}`,
    ...(appNativeRelease?.blockers?.length
      ? appNativeRelease.blockers.map((item) => `- ${item}`)
      : ["- blockers: none"]),
    "",
    "## 域名 DNS / HTTPS 检查",
    "",
    `- ready: ${domain.ok}`,
    `- targetReady: ${domain.targetReady} / ${domain.targetTotal}`,
    ...(domain.machineBlocking?.length
      ? domain.machineBlocking.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## 阿里云部署规格",
    "",
    `- ready: ${deploymentSpec.ok}`,
    `- image: ${deploymentSpec.image}`,
    `- port: ${deploymentSpec.port}`,
    `- apiHost: ${deploymentSpec.apiHost}`,
    `- assetHost: ${deploymentSpec.assetHost}`,
    `- localPredeployChecks: ${deploymentSpec.localPredeployChecks}`,
    `- predeployChecks: ${deploymentSpec.predeployChecks}`,
    `- postdeployChecks: ${deploymentSpec.postdeployChecks}`,
    `- requiredExternalConfirmations: ${deploymentSpec.requiredExternalConfirmations}`,
    ...(deploymentSpec.blockers?.length
      ? deploymentSpec.blockers.map((item) => `- ${item}`)
      : ["- blockers: none"]),
    "",
    "## 阿里云 SAE 运行时计划",
    "",
    `- ready: ${runtimePlan.ok === true}`,
    `- provider: ${runtimePlan.provider}`,
    `- region: ${runtimePlan.region}`,
    `- appName: ${runtimePlan.appName}`,
    `- runtime: ${runtimePlan.runtime}`,
    `- containerPort: ${runtimePlan.containerPort}`,
    `- healthPath: ${runtimePlan.healthPath}`,
    `- apiHost: ${runtimePlan.apiHost}`,
    `- assetHost: ${runtimePlan.assetHost}`,
    ...(runtimePlan.blockers?.length
      ? runtimePlan.blockers.map((item) => `- ${item}`)
      : ["- blockers: none"]),
    "",
    "## 阿里云 ACR 镜像发布计划",
    "",
    `- ready: ${imagePublishPlan.ready === true}`,
    `- templateReady: ${imagePublishPlan.summary?.templateReady === true}`,
    `- localExists: ${imagePublishPlan.summary?.localExists === true}`,
    `- localReady: ${imagePublishPlan.summary?.localReady === true}`,
    `- totalBlockers: ${imagePublishPlan.summary?.totalBlockers ?? 0}`,
    `- localDockerImage: ${imagePublishPlan.localDockerImage?.status || "unknown"}`,
    `- remoteImage: ${imagePublishPlan.local?.acr?.remoteImage || imagePublishPlan.template?.acr?.remoteImage || "unknown"}`,
    ...(imagePublishPlan.local?.blockers?.length
      ? imagePublishPlan.local.blockers.map((item) => `- ${item}`)
      : ["- blockers: none"]),
    "",
    "## 操作员任务清单",
    "",
    `- json: ${audit.outputFiles.operatorTasksJson}`,
    `- markdown: ${audit.outputFiles.operatorTasksMarkdown}`,
    `- ready: ${operatorTasks.summary.ready} / ${operatorTasks.summary.total}`,
    `- blocked: ${operatorTasks.summary.blocked}`,
    `- waitingWechatReview: ${operatorTasks.summary.waitingWechatReview || 0}`,
    `- pendingCloud: ${operatorTasks.summary.pendingCloud}`,
    `- sensitiveActionItems: ${operatorTasks.sensitiveActionItems?.length || 0}`,
    "",
    "## 密钥/密码/token/付款/受控标识符类人工介入项",
    "",
    `- json: ${audit.outputFiles.sensitiveBlockersJson}`,
    `- markdown: ${audit.outputFiles.sensitiveBlockersMarkdown}`,
    `- ok: ${sensitiveBlockers.ok === true}`,
    `- containsValues: ${sensitiveBlockers.containsValues === true}`,
    `- secretLeakCheck: ${sensitiveBlockers.secretLeakCheck?.ok === true}`,
    `- blocked: ${sensitiveBlockers.summary.blocked} / ${sensitiveBlockers.summary.total}`,
    ...(sensitiveBlockers.items?.length
      ? sensitiveBlockers.items.map((item) => `- ${item.id}: ${item.status} (${item.type})`)
      : ["- none"]),
    "",
    "## 阿里云资源矩阵",
    "",
    `- json: ${audit.outputFiles.resourcesMatrixJson}`,
    `- markdown: ${audit.outputFiles.resourcesMatrixMarkdown}`,
    `- ok: ${resourcesMatrix.ok === true}`,
    `- containsValues: ${resourcesMatrix.containsValues === true}`,
    `- secretLeakCheck: ${resourcesMatrix.secretLeakCheck?.ok === true}`,
    `- mutationPerformed: ${resourcesMatrix.mutationPerformed === true}`,
    `- ready: ${resourcesMatrix.summary.ready} / ${resourcesMatrix.summary.total}`,
    `- blocked: ${resourcesMatrix.summary.blocked}`,
    ...(resourcesMatrix.resources?.length
      ? resourcesMatrix.resources.map((item) => `- ${item.id}: ${item.status} (${item.provider})`)
      : ["- none"]),
    "",
    "## 用户动作简报",
    "",
    `- json: ${audit.outputFiles.userActionBriefJson}`,
    `- markdown: ${audit.outputFiles.userActionBriefMarkdown}`,
    `- ok: ${userActionBrief.ok === true}`,
    `- containsValues: ${userActionBrief.containsValues === true}`,
    `- secretLeakCheck: ${userActionBrief.secretLeakCheck?.ok === true}`,
    `- mutationPerformed: ${userActionBrief.mutationPerformed === true}`,
    `- canDeployNow: ${userActionBrief.canDeployNow === true}`,
    `- ready: ${userActionBrief.summary.ready} / ${userActionBrief.summary.total}`,
    `- blocked: ${userActionBrief.summary.blocked}`,
    ...(userActionBrief.actions?.length
      ? userActionBrief.actions.map((item) => `- ${item.id}: ${item.status} (${item.owner})`)
      : ["- none"]),
    "",
    "## 阿里云控制台 Runbook",
    "",
    `- json: ${audit.outputFiles.consoleRunbookJson}`,
    `- markdown: ${audit.outputFiles.consoleRunbookMarkdown}`,
    `- ok: ${consoleRunbook.ok === true}`,
    `- containsValues: ${consoleRunbook.containsValues === true}`,
    `- mutationPerformed: ${consoleRunbook.mutationPerformed === true}`,
    `- consoleTasks: ${consoleRunbook.consoleTasks?.length || 0}`,
    `- resourceReady: ${consoleRunbook.summary?.resourceReady || "unknown"}`,
    `- canStartNowConsoleTasks: ${consoleRunbook.summary?.canStartNowConsoleTasks?.length ? consoleRunbook.summary.canStartNowConsoleTasks.join(", ") : "none"}`,
    `- readyActionPackets: ${consoleRunbook.summary?.readyActionPackets ?? 0}`,
    `- blockedByTaskDependencies: ${consoleRunbook.summary?.blockedByTaskDependencies?.length ? consoleRunbook.summary.blockedByTaskDependencies.join(", ") : "none"}`,
    `- actionTimeConfirmationRequired: ${consoleRunbook.summary?.actionTimeConfirmationRequired?.length ? consoleRunbook.summary.actionTimeConfirmationRequired.join(", ") : "none"}`,
    ...(consoleRunbook.consoleTasks?.length
      ? consoleRunbook.consoleTasks.map((item) => `- ${item.id}: ${item.status}, canStartNow=${item.canStartNow}, dependsOn=${item.dependsOn?.join(", ") || "none"} (${item.consolePath})`)
      : ["- none"]),
    "",
    "## 阿里云 Provisioning Plan",
    "",
    `- json: ${audit.outputFiles.provisioningPlanJson}`,
    `- markdown: ${audit.outputFiles.provisioningPlanMarkdown}`,
    `- ok: ${provisioningPlan.ok === true}`,
    `- executionMode: ${provisioningPlan.executionMode}`,
    `- canCodexExecuteNow: ${provisioningPlan.canCodexExecuteNow === true}`,
    `- containsValues: ${provisioningPlan.containsValues === true}`,
    `- secretLeakCheck: ${provisioningPlan.secretLeakCheck?.ok === true}`,
    `- readyToStartPhases: ${provisioningPlan.summary.readyToStartPhases.length ? provisioningPlan.summary.readyToStartPhases.join(", ") : "none"}`,
    `- blockedPhases: ${provisioningPlan.summary.blockedPhases.length ? provisioningPlan.summary.blockedPhases.join(", ") : "none"}`,
    ...(provisioningPlan.phases?.length
      ? provisioningPlan.phases.map((item) => `- ${item.id}: ${item.status}, canStartNow=${item.canStartNow}`)
      : ["- none"]),
    "",
    "## 阿里云动作授权矩阵",
    "",
    `- json: ${audit.outputFiles.actionAuthorizationJson}`,
    `- markdown: ${audit.outputFiles.actionAuthorizationMarkdown}`,
    `- ok: ${actionAuthorization.ok === true}`,
    `- containsValues: ${actionAuthorization.containsValues === true}`,
    `- secretLeakCheck: ${actionAuthorization.secretLeakCheck?.ok === true}`,
    `- mutationPerformed: ${actionAuthorization.mutationPerformed === true}`,
    `- canDeployNow: ${actionAuthorization.canDeployNow === true}`,
    `- canCodexProceedWithoutUser: ${actionAuthorization.summary.canCodexProceedWithoutUser.length ? actionAuthorization.summary.canCodexProceedWithoutUser.join(", ") : "none"}`,
    `- authorizationPackets: ${actionAuthorization.summary.authorizationPackets || 0}`,
    `- authorizationPacketIds: ${(actionAuthorization.authorizationPackets || []).map((item) => item.packetId).join(", ") || "none"}`,
    `- canStartNowPackets: ${(actionAuthorization.summary.canStartNowPackets || []).join(", ") || "none"}`,
    `- actionTimeConfirmationRequired: ${actionAuthorization.summary.actionTimeConfirmationRequired.join(", ")}`,
    ...(actionAuthorization.actions?.length
      ? actionAuthorization.actions.map((item) => `- ${item.id}: ${item.automationPolicy} (${item.blockerClass})`)
      : ["- none"]),
    ...(actionAuthorization.authorizationPackets?.length
      ? actionAuthorization.authorizationPackets.map((item) => `- ${item.packetId}: ${item.minimumUserPhrase}`)
      : ["- authorization packets: none"]),
    "",
    "## 目标完成度审计",
    "",
    `- json: ${audit.outputFiles.completionAuditJson}`,
    `- markdown: ${audit.outputFiles.completionAuditMarkdown}`,
    `- ok: ${completionAudit.ok === true}`,
    `- verdict: ${completionAudit.verdict}`,
    `- complete: ${completionAudit.complete === true}`,
    `- canDeployNow: ${completionAudit.canDeployNow === true}`,
    `- containsValues: ${completionAudit.containsValues === true}`,
    `- secretLeakCheck: ${completionAudit.secretLeakCheck?.ok === true}`,
    `- requirements: proved ${completionAudit.summary.proved}/${completionAudit.summary.requirements}, blocked ${completionAudit.summary.blocked}, partial ${completionAudit.summary.partial}`,
    `- canStartNowConsoleTasks: ${completionAudit.summary.canStartNowConsoleTasks.length ? completionAudit.summary.canStartNowConsoleTasks.join(", ") : "none"}`,
    `- canStartNowAuthorizationPackets: ${completionAudit.summary.canStartNowAuthorizationPackets.length ? completionAudit.summary.canStartNowAuthorizationPackets.join(", ") : "none"}`,
    ...(completionAudit.requirements?.length
      ? completionAudit.requirements.map((item) => `- ${item.id}: ${item.status}${item.blockers?.length ? ` (${item.blockers.join(", ")})` : ""}`)
      : ["- none"]),
    "",
    "## 微信开放平台移动应用材料包",
    "",
    `- json: ${audit.outputFiles.wechatOpenMobileAppPackageJson}`,
    `- markdown: ${audit.outputFiles.wechatOpenMobileAppPackageMarkdown}`,
    `- ok: ${wechatOpenMobileAppPackage.ok === true}`,
    `- containsValues: ${wechatOpenMobileAppPackage.containsValues === true}`,
    `- mutationPerformed: ${wechatOpenMobileAppPackage.mutationPerformed === true}`,
    `- accountVerified: ${wechatOpenMobileAppPackage.summary?.accountVerified === true}`,
    `- mobileAppCreated: ${wechatOpenMobileAppPackage.summary?.mobileAppCreated === true}`,
    `- reviewStatus: ${wechatOpenMobileAppPackage.summary?.reviewStatus || "unknown"}`,
    `- readyToSubmitForReview: ${wechatOpenMobileAppPackage.summary?.readyToSubmitForReview === true}`,
    `- actionPacket: ${wechatOpenMobileAppPackage.actionPacket?.packetId || "none"}`,
    `- submissionBlockers: ${wechatOpenMobileAppPackage.summary?.submissionBlockers?.length ? wechatOpenMobileAppPackage.summary.submissionBlockers.join(", ") : "none"}`,
    `- androidPackageName: ${wechatOpenMobileAppPackage.mobileAppCreationPackage?.android?.packageName || "unknown"}`,
    `- iosBundleId: ${wechatOpenMobileAppPackage.mobileAppCreationPackage?.ios?.bundleId || "unknown"}`,
    "",
    "## Apple Team ID / AASA 动作确认包",
    "",
    `- json: ${audit.outputFiles.appleTeamAasaPackageJson}`,
    `- markdown: ${audit.outputFiles.appleTeamAasaPackageMarkdown}`,
    `- ok: ${appleTeamAasaPackage.ok === true}`,
    `- containsValues: ${appleTeamAasaPackage.containsValues === true}`,
    `- mutationPerformed: ${appleTeamAasaPackage.mutationPerformed === true}`,
    `- teamIdStatus: ${appleTeamAasaPackage.summary?.teamIdStatus || "unknown"}`,
    `- aasaOk: ${appleTeamAasaPackage.summary?.aasaOk === true}`,
    `- routeFilesReady: ${appleTeamAasaPackage.summary?.routeFilesReady === true}`,
    `- iosNativeReady: ${appleTeamAasaPackage.summary?.iosNativeReady === true}`,
    `- readyForAasa: ${appleTeamAasaPackage.actionPacket?.readyForAasa === true}`,
    `- actionPacket: ${appleTeamAasaPackage.actionPacket?.packetId || "none"}`,
    `- blockers: ${appleTeamAasaPackage.summary?.blockers?.length ? appleTeamAasaPackage.summary.blockers.join(", ") : "none"}`,
    `- iosBundleId: ${appleTeamAasaPackage.summary?.expectedIosBundleId || "unknown"}`,
    `- associatedDomain: ${appleTeamAasaPackage.summary?.associatedDomain || "unknown"}`,
    "",
    "## 操作员操作包",
    "",
    `- json: ${audit.outputFiles.operatorHandoffJson}`,
    `- markdown: ${audit.outputFiles.operatorHandoffMarkdown}`,
    `- verdict: ${operatorHandoff.verdict}`,
    `- canDeployNow: ${operatorHandoff.canDeployNow === true}`,
    `- blockingRequiredEnv: ${operatorHandoff.missingVariables.required.length ? operatorHandoff.missingVariables.required.map((item) => item.name).join(", ") : "none"}`,
    `- appLaunchBlockingVariables: ${operatorHandoff.appLaunchBlocking.variables.length ? operatorHandoff.appLaunchBlocking.variables.map((item) => item.name).join(", ") : "none"}`,
    `- appLaunchBlockingStates: ${operatorHandoff.appLaunchBlocking.states.length ? operatorHandoff.appLaunchBlocking.states.map((item) => `${item.name}:${item.status}`).join(", ") : "none"}`,
    `- optionalDeferredEnv: ${operatorHandoff.missingVariables.optionalDeferred.length}`,
    `- sensitiveActionItems: ${operatorHandoff.sensitiveActionItems?.length || 0}`,
    `- canStartNowConsoleTasks: ${operatorHandoff.aliyunConsoleTaskOrder?.canStartNow?.length ? operatorHandoff.aliyunConsoleTaskOrder.canStartNow.join(", ") : "none"}`,
    `- blockedByConsoleTaskDependencies: ${operatorHandoff.aliyunConsoleTaskOrder?.blockedByDependencies?.length ? operatorHandoff.aliyunConsoleTaskOrder.blockedByDependencies.join(", ") : "none"}`,
    "",
    "## 发布负责人状态总览",
    "",
    `- json: ${audit.outputFiles.productionStatusJson}`,
    `- markdown: ${audit.outputFiles.productionStatusMarkdown}`,
    `- verdict: ${productionStatus.verdict}`,
    `- canDeployNow: ${productionStatus.canDeployNow === true}`,
    `- requiredEnv: ${productionStatus.summary.requiredReady} / ${productionStatus.summary.requiredTotal}`,
    `- requiredBlocking: ${productionStatus.summary.requiredBlocking?.length ? productionStatus.summary.requiredBlocking.join(", ") : "none"}`,
    `- cloudInventoryResults: local ${productionStatus.summary.cloudInventoryResults?.readyLocalOperations || 0} / ${productionStatus.summary.cloudInventoryResults?.localOperations || 0} operations ready, localReady ${productionStatus.summary.cloudInventoryResults?.localReady === true}`,
    `- cloudInventoryResultBlockers: ${productionStatus.summary.cloudInventoryResults?.localBlockers?.length ? productionStatus.summary.cloudInventoryResults.localBlockers.join(", ") : "none"}`,
    `- sensitiveActionItems: ${productionStatus.summary.sensitiveActionItems?.total || 0} total, ${productionStatus.summary.sensitiveActionItems?.blocked || 0} blocked`,
    ...(productionStatus.humanSummary?.length
      ? productionStatus.humanSummary.map((item) => `- ${item}`)
      : ["- humanSummary: none"]),
    "",
    "## 数据层桥接状态",
    "",
    `- current: ${bridgeDataLayer.current || "unknown"}`,
    `- target: ${bridgeDataLayer.target || "unknown"}`,
    `- status: ${bridgeDataLayer.status || "unknown"}`,
    `- firstBridgeDeploymentUses: ${bridgeDataLayer.firstBridgeDeploymentUses || "unknown"}`,
    `- supabaseBridgeReady: ${bridgeDataLayer.supabaseBridgeReady === true}`,
    `- DATABASE_URL_CN: ${bridgeDataLayer.databaseUrlCnStatus || "unknown"}`,
    `- REDIS_URL_CN: ${bridgeDataLayer.redisUrlCnStatus || "unknown"}`,
    `- rdsMigrationIncludedInThisRelease: ${bridgeDataLayer.rdsMigrationIncludedInThisRelease === true}`,
    `- rdsMigrationRequiredForFinalProductionCn: ${bridgeDataLayer.rdsMigrationRequiredForFinalProductionCn === true}`,
    ...(bridgeDataLayer.notes?.length ? bridgeDataLayer.notes.map((item) => `- ${item}`) : []),
    "",
    "## APP API 小程序链路桥接清单",
    "",
    `- ok: ${appApiBridgeMap.ok === true}`,
    `- checkedRoutes: ${appApiBridgeMap.checkedRoutes}`,
    `- mappedRoutes: ${appApiBridgeMap.mappedRoutes}`,
    `- bridgeReadyRoutes: ${appApiBridgeMap.bridgeReadyRoutes}`,
    `- externalEnvBlockedRoutes: ${appApiBridgeMap.externalEnvBlockedRoutes}`,
    `- sourceTypes: ${Object.entries(appApiBridgeMap.sourceTypes || {}).map(([key, value]) => `${key} ${value}`).join(", ")}`,
    ...(appApiBridgeMap.failures?.length
      ? [
          "- failures:",
          ...appApiBridgeMap.failures.map((item) => `  - ${item.route || item.path || "unknown"}: ${item.error}`),
        ]
      : ["- failures: none"]),
    "",
    "## APP 客户端 API 契约",
    "",
    `- ok: ${appClientContract.ok === true}`,
    `- scannedFiles: ${appClientContract.scannedFiles}`,
    `- clientApiCalls: ${appClientContract.clientApiCalls}`,
    `- auditedClientApiCalls: ${appClientContract.auditedClientApiCalls}`,
    `- uniqueAuditedClientRoutes: ${appClientContract.uniqueAuditedClientRoutes}`,
    `- matchedBackendRoutes: ${appClientContract.matchedBackendRoutes}`,
    `- deferredClientApiCalls: ${appClientContract.deferredClientApiCalls}`,
    ...(appClientContract.failures?.missingBackendRoutes?.length
      ? [
          "- missingBackendRoutes:",
          ...appClientContract.failures.missingBackendRoutes.map((item) => `  - ${item.method} ${item.route} (${item.file}:${item.line})`),
        ]
      : ["- missingBackendRoutes: none"]),
    ...(appClientContract.failures?.methodMismatches?.length
      ? [
          "- methodMismatches:",
          ...appClientContract.failures.methodMismatches.map((item) => `  - ${item.method} ${item.route} -> ${item.backendMethods.join(",")}`),
        ]
      : ["- methodMismatches: none"]),
    ...(appClientContract.failures?.unclassifiedRoutes?.length
      ? [
          "- unclassifiedRoutes:",
          ...appClientContract.failures.unclassifiedRoutes.map((item) => `  - ${item.method} ${item.route} (${item.file}:${item.line})`),
        ]
      : ["- unclassifiedRoutes: none"]),
    ...(appClientContract.deferredRoutes?.length
      ? [
          "- deferredRoutes:",
          ...appClientContract.deferredRoutes.map((item) => `  - ${item.method} ${item.route} (${item.reason})`),
        ]
      : ["- deferredRoutes: none"]),
    "",
    "## APP API smoke 覆盖",
    "",
    `- ok: ${appApiSmokeCoverage.ok === true}`,
    `- businessRoutes: ${appApiSmokeCoverage.businessRoutes}`,
    `- smokeProbes: ${appApiSmokeCoverage.smokeProbes}`,
    `- coveredBusinessRoutes: ${appApiSmokeCoverage.coveredBusinessRoutes}`,
    ...(appApiSmokeCoverage.missingRoutes?.length
      ? [
          "- missingRoutes:",
          ...appApiSmokeCoverage.missingRoutes.map((item) => `  - ${item.route}`),
        ]
      : ["- missingRoutes: none"]),
    ...(appApiSmokeCoverage.unmatchedProbes?.length
      ? [
          "- unmatchedProbes:",
          ...appApiSmokeCoverage.unmatchedProbes.map((item) => `  - ${item.method} ${item.path}`),
        ]
      : ["- unmatchedProbes: none"]),
    "",
    "## Docker 上下文包",
    "",
    bundle
      ? `- path: ${bundle.path}`
      : "- path: skipped",
    bundle
      ? `- bytes: ${bundle.bytes}`
      : "- bytes: skipped",
    bundle
      ? `- entryCount: ${bundle.entryCount}`
      : "- entryCount: skipped",
    bundle
      ? `- forbiddenEntryCount: ${bundle.forbiddenEntryCount}`
      : "- forbiddenEntryCount: skipped",
    "",
    "## 阿里云环境变量导入计划",
    "",
    `- path: ${audit.outputFiles.envImportPlan}`,
    `- markdown: ${audit.outputFiles.envImportChecklist}`,
    "- containsValues: false",
    `- sourceMetadataReady: ${env.planSourceMetadataReady || 0} / ${env.planVariables || 0}`,
    `- requiredBlocking: ${env.planRequiredBlocking?.length ? env.planRequiredBlocking.join(", ") : "none"}`,
    "- per-variable fields: sensitivity, owner, consolePath, obtain, importTarget, cloudConfirmationKey",
    "",
    "## 环境变量获取与导入手册",
    "",
    `- json: ${audit.outputFiles.envHandoffJson}`,
    `- markdown: ${audit.outputFiles.envHandoffMarkdown}`,
    `- ok: ${envHandoff.ok === true}`,
    `- containsValues: ${envHandoff.containsValues === false ? "false" : "unknown"}`,
    `- secretLeakCheck: ${envHandoff.secretLeakCheck?.ok === true}`,
    `- requiredBlocking: ${envHandoff.summary.requiredBlocking.length ? envHandoff.summary.requiredBlocking.join(", ") : "none"}`,
    `- appLaunchBlocking: ${envHandoff.summary.appLaunchBlocking.length ? envHandoff.summary.appLaunchBlocking.join(", ") : "none"}`,
    `- readyPlainEnv: ${envHandoff.summary.readyPlainEnv}`,
    `- readySecretEnv: ${envHandoff.summary.readySecretEnv}`,
    `- deferred: ${envHandoff.summary.deferred}`,
    "",
    "## Vercel production 变量名覆盖",
    "",
    vercelEnvCoverage?.ok
      ? `- path: ${audit.outputFiles.vercelEnvCoverage}`
      : `- path: ${audit.outputFiles.vercelEnvCoverage || "not generated"}`,
    `- containsValues: ${vercelEnvCoverage?.report?.containsValues === false ? "false" : "unknown"}`,
    vercelEnvCoverage?.ok
      ? `- requiredCovered: ${vercelEnvCoverage.report.totals.requiredPresentInVercelProduction} / ${vercelEnvCoverage.report.totals.requiredTotal}`
      : `- status: ${vercelEnvCoverage?.skipped ? "skipped" : "not ok"}`,
    ...(vercelEnvCoverage?.report?.requiredMissingInVercelProduction?.length
      ? [
          "- requiredMissingInVercelProduction:",
          ...vercelEnvCoverage.report.requiredMissingInVercelProduction.map((item) => `  - ${item}`),
        ]
      : []),
    ...(vercelEnvCoverage?.report?.appSpecificKeysMissingInVercelProduction?.length
      ? [
          "- appSpecificKeysMissingInVercelProduction:",
          ...vercelEnvCoverage.report.appSpecificKeysMissingInVercelProduction.map((item) => `  - ${item}`),
        ]
      : []),
    vercelEnvCoverage?.error
      ? `- error: ${vercelEnvCoverage.error}`
      : "",
    "",
    "## 后续命令",
    "",
    "```bash",
    "corepack pnpm aliyun:cloud:check",
    "corepack pnpm aliyun:image:plan:strict",
    "corepack pnpm aliyun:domain:strict",
    "corepack pnpm aliyun:readiness:cloud-ready",
    "corepack pnpm aliyun:docker:build",
    "corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin",
    "corepack pnpm aliyun:app-api:smoke -- --base-url https://api-cn.ipgongchang.xin",
    "```",
  ].join("\n")
}

function main() {
  const args = parseArgs(process.argv)
  if (existsSync(args.outDir)) throw new Error(`out_dir_already_exists:${args.outDir}`)
  mkdirSync(args.outDir, { recursive: false, mode: 0o700 })

  const env = runJson("env_check", [
    "scripts/prepare-aliyun-runtime-env.mjs",
    "--env-file",
    args.envFile,
    "--allow-todo",
    "--write-plan",
    resolve(args.outDir, "env-import-plan.json"),
    "--write-plan-markdown",
    resolve(args.outDir, "env-import-checklist.md"),
  ])
  const readiness = runJson("readiness", [
    "scripts/check-aliyun-production-cn-readiness.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    "--allow-blocking",
  ])
  const domain = runJson("domain", [
    "scripts/check-aliyun-domain-readiness.mjs",
    "--env-file",
    args.envFile,
    "--allow-blocking",
  ])
  const cloudAccessPath = resolve(args.outDir, "cloud-access.json")
  const cloudAccess = runJson("cloud_access", [
    "scripts/check-aliyun-cloud-access.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    "--write-report",
    cloudAccessPath,
  ])
  const cloudInventoryPlanJsonPath = resolve(args.outDir, "cloud-inventory-plan.json")
  const cloudInventoryPlanMarkdownPath = resolve(args.outDir, "cloud-inventory-plan.md")
  const cloudInventoryPlan = runJson("cloud_inventory_plan", [
    "scripts/generate-aliyun-cli-inventory-plan.mjs",
    "--out",
    cloudInventoryPlanJsonPath,
    "--markdown",
    cloudInventoryPlanMarkdownPath,
  ])
  const cloudInventoryRunnerJsonPath = resolve(args.outDir, "cloud-inventory-runner.json")
  const cloudInventoryRunnerMarkdownPath = resolve(args.outDir, "cloud-inventory-runner.md")
  const cloudInventoryRunner = runJson("cloud_inventory_runner", [
    "scripts/run-aliyun-cli-inventory.mjs",
    "--out",
    cloudInventoryRunnerJsonPath,
    "--markdown",
    cloudInventoryRunnerMarkdownPath,
  ])
  const cloudInventoryResultsJsonPath = resolve(args.outDir, "cloud-inventory-results.json")
  const cloudInventoryResultsMarkdownPath = resolve(args.outDir, "cloud-inventory-results.md")
  const cloudInventoryResults = runJson("cloud_inventory_results", [
    "scripts/check-aliyun-cli-inventory-results.mjs",
    "--allow-incomplete",
    ...(args.cloudInventoryResultsFile ? ["--local", args.cloudInventoryResultsFile] : []),
    "--out",
    cloudInventoryResultsJsonPath,
    "--markdown",
    cloudInventoryResultsMarkdownPath,
  ])
  const deploymentSpec = runJson("deployment_spec", ["scripts/check-aliyun-deployment-spec.mjs"])
  const runtimePlan = runJson("runtime_plan", ["scripts/check-aliyun-runtime-plan.mjs"])
  const imagePublishPlan = runJson("image_publish_plan", [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--allow-incomplete",
  ])
  const legalPages = runJson("legal_pages", [
    "scripts/check-app-legal-pages.mjs",
    "--env-file",
    args.envFile,
    "--allow-missing-env",
  ])
  const operatorTasksJsonPath = resolve(args.outDir, "operator-tasks.json")
  const operatorTasksMarkdownPath = resolve(args.outDir, "operator-tasks.md")
  const envHandoffJsonPath = resolve(args.outDir, "env-handoff.json")
  const envHandoffMarkdownPath = resolve(args.outDir, "env-handoff.md")
  const sensitiveBlockersJsonPath = resolve(args.outDir, "sensitive-blockers.json")
  const sensitiveBlockersMarkdownPath = resolve(args.outDir, "sensitive-blockers.md")
  const resourcesMatrixJsonPath = resolve(args.outDir, "resource-matrix.json")
  const resourcesMatrixMarkdownPath = resolve(args.outDir, "resource-matrix.md")
  const userActionBriefJsonPath = resolve(args.outDir, "user-action-brief.json")
  const userActionBriefMarkdownPath = resolve(args.outDir, "user-action-brief.md")
  const consoleRunbookJsonPath = resolve(args.outDir, "console-runbook.json")
  const consoleRunbookMarkdownPath = resolve(args.outDir, "console-runbook.md")
  const provisioningPlanJsonPath = resolve(args.outDir, "provisioning-plan.json")
  const provisioningPlanMarkdownPath = resolve(args.outDir, "provisioning-plan.md")
  const actionAuthorizationJsonPath = resolve(args.outDir, "action-authorization.json")
  const actionAuthorizationMarkdownPath = resolve(args.outDir, "action-authorization.md")
  const completionAuditJsonPath = resolve(args.outDir, "completion-audit.json")
  const completionAuditMarkdownPath = resolve(args.outDir, "completion-audit.md")
  const wechatOpenMobileAppPackageJsonPath = resolve(args.outDir, "wechat-open-mobile-app-package.json")
  const wechatOpenMobileAppPackageMarkdownPath = resolve(args.outDir, "wechat-open-mobile-app-package.md")
  const appleTeamAasaPackageJsonPath = resolve(args.outDir, "apple-team-aasa-package.json")
  const appleTeamAasaPackageMarkdownPath = resolve(args.outDir, "apple-team-aasa-package.md")
  const operatorHandoffJsonPath = resolve(args.outDir, "operator-handoff.json")
  const operatorHandoffMarkdownPath = resolve(args.outDir, "operator-handoff.md")
  const productionStatusJsonPath = resolve(args.outDir, "production-cn-status.json")
  const productionStatusMarkdownPath = resolve(args.outDir, "production-cn-status.md")
  const cloudConfirmationsCheckPath = resolve(args.outDir, "cloud-confirmations-check.json")
  const operatorTasks = runJson("operator_tasks", [
    "scripts/generate-aliyun-operator-tasks.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    "--out",
    operatorTasksJsonPath,
    "--markdown",
    operatorTasksMarkdownPath,
  ])
  const envHandoff = runJson("env_handoff", [
    "scripts/summarize-aliyun-env-handoff.mjs",
    "--env-file",
    args.envFile,
    "--out",
    envHandoffJsonPath,
    "--markdown",
    envHandoffMarkdownPath,
  ])
  const sensitiveBlockers = runJson("sensitive_blockers", [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    "--out",
    sensitiveBlockersJsonPath,
    "--markdown",
    sensitiveBlockersMarkdownPath,
  ])
  const resourcesMatrix = runJson("resources_matrix", [
    "scripts/summarize-aliyun-resource-matrix.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    "--out",
    resourcesMatrixJsonPath,
    "--markdown",
    resourcesMatrixMarkdownPath,
  ])
  const userActionBrief = runJson("user_action_brief", [
    "scripts/summarize-aliyun-user-action-brief.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    "--out",
    userActionBriefJsonPath,
    "--markdown",
    userActionBriefMarkdownPath,
  ])
  const consoleRunbook = runJson("console_runbook", [
    "scripts/generate-aliyun-console-runbook.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    "--out",
    consoleRunbookJsonPath,
    "--markdown",
    consoleRunbookMarkdownPath,
  ])
  const provisioningPlan = runJson("provisioning_plan", [
    "scripts/generate-aliyun-provisioning-plan.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    "--out",
    provisioningPlanJsonPath,
    "--markdown",
    provisioningPlanMarkdownPath,
  ])
  const actionAuthorization = runJson("action_authorization", [
    "scripts/summarize-aliyun-action-authorization.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    "--out",
    actionAuthorizationJsonPath,
    "--markdown",
    actionAuthorizationMarkdownPath,
  ])
  const completionAudit = runJson("completion_audit", [
    "scripts/summarize-aliyun-completion-audit.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    ...(args.cloudInventoryResultsFile ? ["--cloud-inventory-results", args.cloudInventoryResultsFile] : []),
    "--out",
    completionAuditJsonPath,
    "--markdown",
    completionAuditMarkdownPath,
  ])
  const wechatOpenMobileAppPackage = runJson("wechat_open_mobile_app_package", [
    "scripts/generate-wechat-open-mobile-app-package.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    "--out",
    wechatOpenMobileAppPackageJsonPath,
    "--markdown",
    wechatOpenMobileAppPackageMarkdownPath,
  ])
  const appleTeamAasaPackage = runJson("apple_team_aasa_package", [
    "scripts/generate-apple-team-aasa-package.mjs",
    "--env-file",
    args.envFile,
    "--out",
    appleTeamAasaPackageJsonPath,
    "--markdown",
    appleTeamAasaPackageMarkdownPath,
  ])
  const operatorHandoff = runJson("operator_handoff", [
    "scripts/generate-aliyun-operator-handoff.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    ...(args.cloudInventoryResultsFile ? ["--cloud-inventory-results", args.cloudInventoryResultsFile] : []),
    ...(args.skipVercelEnvCoverage ? ["--skip-vercel-env-coverage"] : []),
    ...(args.vercelEnvCoverageInput ? ["--vercel-env-coverage-input", args.vercelEnvCoverageInput] : []),
    "--out",
    operatorHandoffJsonPath,
    "--markdown",
    operatorHandoffMarkdownPath,
  ])
  const productionStatus = runJson("production_status", [
    "scripts/summarize-aliyun-production-cn-status.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    ...(args.cloudInventoryResultsFile ? ["--cloud-inventory-results", args.cloudInventoryResultsFile] : []),
    "--out",
    productionStatusJsonPath,
    "--markdown",
    productionStatusMarkdownPath,
  ])
  const cloudConfirmationsCheck = runJson("cloud_confirmations", [
    "scripts/check-aliyun-cloud-confirmations.mjs",
    ...(args.cloudConfirmationsFile ? ["--local", args.cloudConfirmationsFile] : []),
    "--allow-incomplete",
  ])
  const routes = runJson("routes", ["scripts/check-app-api-production-cn-routes.mjs"])
  const appApiBridgeMap = runJson("app_api_bridge_map", ["scripts/check-app-api-bridge-map.mjs"])
  const appClientContract = runJson("app_client_contract", ["scripts/check-app-client-api-contract.mjs"])
  const appApiSmokeCoverage = runJson("app_api_smoke_coverage", ["scripts/check-app-api-smoke-coverage.mjs"])
  const dockerContext = runJson("docker_context", ["scripts/check-aliyun-docker-context.mjs"])
  const vercelEnvCoverage = runVercelEnvCoverage(args, resolve(args.outDir, "vercel-env-coverage.json"))

  const bundle = args.skipBundle ? null : createArchive(args.outDir)
  const audit = {
    generatedAt: new Date().toISOString(),
    backendRoot: BACKEND_ROOT,
    envFile: args.envFile,
    cloudConfirmationsFile: args.cloudConfirmationsFile || null,
    cloudInventoryResultsFile: args.cloudInventoryResultsFile || null,
    git: {
      branch: git(["branch", "--show-current"]),
      head: git(["rev-parse", "HEAD"]),
      statusShort: git(["status", "--short"]),
    },
    checks: {
      env,
      readiness,
      domain,
      cloudAccess,
      cloudInventoryPlan,
      cloudInventoryRunner,
      cloudInventoryResults,
      deploymentSpec,
      runtimePlan,
      legalPages,
      imagePublishPlan,
      operatorTasks,
      envHandoff,
      sensitiveBlockers,
      resourcesMatrix,
      userActionBrief,
      consoleRunbook,
      provisioningPlan,
      actionAuthorization,
      completionAudit,
      wechatOpenMobileAppPackage,
      appleTeamAasaPackage,
      operatorHandoff,
      productionStatus,
      cloudConfirmationsCheck,
      routes,
      appApiBridgeMap,
      appClientContract,
      appApiSmokeCoverage,
      dockerContext,
      vercelEnvCoverage,
    },
    bundle,
    outputFiles: {
      auditJson: resolve(args.outDir, "release-audit.json"),
      auditMarkdown: resolve(args.outDir, "release-audit.md"),
      envImportPlan: resolve(args.outDir, "env-import-plan.json"),
      envImportChecklist: resolve(args.outDir, "env-import-checklist.md"),
      envHandoffJson: envHandoffJsonPath,
      envHandoffMarkdown: envHandoffMarkdownPath,
      vercelEnvCoverage: vercelEnvCoverage.ok ? resolve(args.outDir, "vercel-env-coverage.json") : null,
      domainReadiness: resolve(args.outDir, "domain-readiness.json"),
      cloudAccess: cloudAccessPath,
      cloudInventoryPlanJson: cloudInventoryPlanJsonPath,
      cloudInventoryPlanMarkdown: cloudInventoryPlanMarkdownPath,
      cloudInventoryRunnerJson: cloudInventoryRunnerJsonPath,
      cloudInventoryRunnerMarkdown: cloudInventoryRunnerMarkdownPath,
      cloudInventoryResultsJson: cloudInventoryResultsJsonPath,
      cloudInventoryResultsMarkdown: cloudInventoryResultsMarkdownPath,
      cloudConfirmationsCheck: cloudConfirmationsCheckPath,
      legalPages: resolve(args.outDir, "legal-pages.json"),
      runtimePlan: resolve(args.outDir, "runtime-plan.json"),
      imagePublishPlan: resolve(args.outDir, "image-publish-plan-check.json"),
      appApiBridgeMap: resolve(args.outDir, "app-api-bridge-map-check.json"),
      operatorTasksJson: operatorTasksJsonPath,
      operatorTasksMarkdown: operatorTasksMarkdownPath,
      sensitiveBlockersJson: sensitiveBlockersJsonPath,
      sensitiveBlockersMarkdown: sensitiveBlockersMarkdownPath,
      resourcesMatrixJson: resourcesMatrixJsonPath,
      resourcesMatrixMarkdown: resourcesMatrixMarkdownPath,
      userActionBriefJson: userActionBriefJsonPath,
      userActionBriefMarkdown: userActionBriefMarkdownPath,
      consoleRunbookJson: consoleRunbookJsonPath,
      consoleRunbookMarkdown: consoleRunbookMarkdownPath,
      provisioningPlanJson: provisioningPlanJsonPath,
      provisioningPlanMarkdown: provisioningPlanMarkdownPath,
      actionAuthorizationJson: actionAuthorizationJsonPath,
      actionAuthorizationMarkdown: actionAuthorizationMarkdownPath,
      completionAuditJson: completionAuditJsonPath,
      completionAuditMarkdown: completionAuditMarkdownPath,
      wechatOpenMobileAppPackageJson: wechatOpenMobileAppPackageJsonPath,
      wechatOpenMobileAppPackageMarkdown: wechatOpenMobileAppPackageMarkdownPath,
      appleTeamAasaPackageJson: appleTeamAasaPackageJsonPath,
      appleTeamAasaPackageMarkdown: appleTeamAasaPackageMarkdownPath,
      operatorHandoffJson: operatorHandoffJsonPath,
      operatorHandoffMarkdown: operatorHandoffMarkdownPath,
      productionStatusJson: productionStatusJsonPath,
      productionStatusMarkdown: productionStatusMarkdownPath,
      bundle: bundle?.path || null,
    },
  }

  writeText(audit.outputFiles.auditJson, JSON.stringify(audit, null, 2))
  writeText(audit.outputFiles.auditMarkdown, renderMarkdown(audit))
  writeText(audit.outputFiles.domainReadiness, JSON.stringify(domain, null, 2))
  writeText(audit.outputFiles.cloudAccess, JSON.stringify(cloudAccess, null, 2))
  writeText(audit.outputFiles.cloudInventoryPlanJson, JSON.stringify(cloudInventoryPlan, null, 2))
  writeText(audit.outputFiles.cloudInventoryResultsJson, JSON.stringify(cloudInventoryResults, null, 2))
  writeText(audit.outputFiles.cloudConfirmationsCheck, JSON.stringify(cloudConfirmationsCheck, null, 2))
  writeText(audit.outputFiles.legalPages, JSON.stringify(legalPages, null, 2))
  writeText(audit.outputFiles.runtimePlan, JSON.stringify(runtimePlan, null, 2))
  writeText(audit.outputFiles.imagePublishPlan, JSON.stringify(imagePublishPlan, null, 2))
  writeText(audit.outputFiles.appApiBridgeMap, JSON.stringify(appApiBridgeMap, null, 2))

  console.log(JSON.stringify({
    ok: true,
    outDir: args.outDir,
    productionReady: readiness.productionReady,
    diagnosticOnly: readiness.diagnosticOnly === true,
    releaseEvidenceUsable: readiness.releaseEvidenceUsable !== false,
    localCodeReady: readiness.localCodeReady,
    machineBlocking: readiness.machineBlocking,
    manualBlockingCount: readiness.manualBlocking.length,
    cloudConfirmationsReady: readiness.checks?.cloudConfirmations?.ready === true,
    cloudAccess: {
      report: audit.outputFiles.cloudAccess,
      canReadCloudNow: cloudAccess.canReadCloudNow === true,
      cliAvailable: cloudAccess.cli?.available === true,
      cliConfigFileExists: cloudAccess.cli?.configFileExists === true,
      blockers: cloudAccess.blockers || [],
      checklistItems: cloudAccess.consoleEvidenceChecklist?.length || 0,
    },
    cloudInventoryPlan: {
      report: audit.outputFiles.cloudInventoryPlanJson,
      markdown: audit.outputFiles.cloudInventoryPlanMarkdown,
      readOnlyOnly: cloudInventoryPlan.readOnlyOnly === true,
      cloudApiCalled: cloudInventoryPlan.cloudApiCalled === true,
      cloudMutationPerformed: cloudInventoryPlan.cloudMutationPerformed === true,
      canRunReadOnlyInventoryNow: cloudInventoryPlan.canRunReadOnlyInventoryNow === true,
      status: cloudInventoryPlan.status,
      totalOperations: cloudInventoryPlan.summary?.totalOperations ?? 0,
      commandTemplates: cloudInventoryPlan.summary?.commandTemplates ?? 0,
      blockers: cloudInventoryPlan.blockers || [],
    },
    cloudInventoryRunner: {
      report: audit.outputFiles.cloudInventoryRunnerJson,
      markdown: audit.outputFiles.cloudInventoryRunnerMarkdown,
      ok: cloudInventoryRunner.ok === true,
      executionMode: cloudInventoryRunner.executionMode,
      executeReadonlyRequested: cloudInventoryRunner.executeReadonlyRequested === true,
      executeReadonlyAllowed: cloudInventoryRunner.executeReadonlyAllowed === true,
      readOnlyOnly: cloudInventoryRunner.readOnlyOnly === true,
      cloudApiCalled: cloudInventoryRunner.cloudApiCalled === true,
      cloudMutationPerformed: cloudInventoryRunner.cloudMutationPerformed === true,
      commands: cloudInventoryRunner.summary.commands,
      executedCommands: cloudInventoryRunner.summary.executedCommands,
      successfulCommands: cloudInventoryRunner.summary.successfulCommands,
      dryRunCommands: cloudInventoryRunner.summary.dryRunCommands,
      blockers: cloudInventoryRunner.blockers || [],
    },
    cloudInventoryResults: {
      report: audit.outputFiles.cloudInventoryResultsJson,
      markdown: audit.outputFiles.cloudInventoryResultsMarkdown,
      readOnlyOnly: cloudInventoryResults.readOnlyOnly === true,
      cloudMutationPerformed: cloudInventoryResults.cloudMutationPerformed === true,
      templateReady: cloudInventoryResults.template?.ready === true,
      localExists: cloudInventoryResults.local?.exists === true,
      localReady: cloudInventoryResults.local?.ready === true,
      localCheckedOperations: cloudInventoryResults.local?.checkedOperations ?? 0,
      localBlockers: cloudInventoryResults.local?.blockers || [],
    },
    deploymentSpec: {
      ok: deploymentSpec.ok === true,
      image: deploymentSpec.image,
      port: deploymentSpec.port,
      apiHost: deploymentSpec.apiHost,
      assetHost: deploymentSpec.assetHost,
      localPredeployChecks: deploymentSpec.localPredeployChecks,
      predeployChecks: deploymentSpec.predeployChecks,
      postdeployChecks: deploymentSpec.postdeployChecks,
      requiredExternalConfirmations: deploymentSpec.requiredExternalConfirmations,
      runtimePlan: deploymentSpec.runtimePlan,
    },
    runtimePlan: {
      report: audit.outputFiles.runtimePlan,
      ok: runtimePlan.ok === true,
      provider: runtimePlan.provider,
      region: runtimePlan.region,
      appName: runtimePlan.appName,
      runtime: runtimePlan.runtime,
      containerPort: runtimePlan.containerPort,
      healthPath: runtimePlan.healthPath,
      apiHost: runtimePlan.apiHost,
      assetHost: runtimePlan.assetHost,
    },
    imagePublishPlan: {
      report: audit.outputFiles.imagePublishPlan,
      ready: imagePublishPlan.ready === true,
      templateReady: imagePublishPlan.summary?.templateReady === true,
      localExists: imagePublishPlan.summary?.localExists === true,
      localReady: imagePublishPlan.summary?.localReady === true,
      totalBlockers: imagePublishPlan.summary?.totalBlockers ?? 0,
      localDockerImage: imagePublishPlan.localDockerImage?.status || "unknown",
    },
    legalPages: {
      report: audit.outputFiles.legalPages,
      ok: legalPages.ok === true,
      blockers: legalPages.blockers || [],
      pages: legalPages.pages?.map((page) => ({
        key: page.key,
        routePath: page.routePath,
        exists: page.exists,
        envStatus: page.envUrl?.status || "unknown",
      })) || [],
    },
    cloudConfirmationsCheck: {
      report: audit.outputFiles.cloudConfirmationsCheck,
      templateReady: cloudConfirmationsCheck.template?.ready === true,
      localReady: cloudConfirmationsCheck.local?.ready === true,
      totalBlockers: cloudConfirmationsCheck.summary?.totalBlockers ?? 0,
    },
    productionStatus: {
      report: audit.outputFiles.productionStatusJson,
      markdown: audit.outputFiles.productionStatusMarkdown,
      verdict: productionStatus.verdict,
      canDeployNow: productionStatus.canDeployNow === true,
      requiredReady: `${productionStatus.summary.requiredReady}/${productionStatus.summary.requiredTotal}`,
      requiredBlocking: productionStatus.summary.requiredBlocking || [],
      bridgeDataLayer: productionStatus.summary.bridgeDataLayer || null,
      operatorTasks: productionStatus.summary.operatorTasks || {},
      sensitiveActionItems: productionStatus.summary.sensitiveActionItems || {},
      cloudConfirmations: productionStatus.summary.cloudConfirmations || {},
      cloudInventoryResults: productionStatus.summary.cloudInventoryResults || {},
    },
    envHandoff: {
      report: audit.outputFiles.envHandoffJson,
      markdown: audit.outputFiles.envHandoffMarkdown,
      ok: envHandoff.ok === true,
      containsValues: envHandoff.containsValues === true,
      secretLeakCheck: envHandoff.secretLeakCheck?.ok === true,
      requiredBlocking: envHandoff.summary.requiredBlocking,
      appLaunchBlocking: envHandoff.summary.appLaunchBlocking,
      readyPlainEnv: envHandoff.summary.readyPlainEnv,
      readySecretEnv: envHandoff.summary.readySecretEnv,
      deferred: envHandoff.summary.deferred,
      acquisitionOrder: envHandoff.acquisitionOrder.map((item) => `${item.name}:${item.reason}`),
    },
    sensitiveBlockers: {
      report: audit.outputFiles.sensitiveBlockersJson,
      markdown: audit.outputFiles.sensitiveBlockersMarkdown,
      ok: sensitiveBlockers.ok === true,
      containsValues: sensitiveBlockers.containsValues === true,
      secretLeakCheck: sensitiveBlockers.secretLeakCheck?.ok === true,
      blocked: sensitiveBlockers.summary.blocked,
      total: sensitiveBlockers.summary.total,
      blockedIds: sensitiveBlockers.summary.blockedIds,
    },
    resourcesMatrix: {
      report: audit.outputFiles.resourcesMatrixJson,
      markdown: audit.outputFiles.resourcesMatrixMarkdown,
      ok: resourcesMatrix.ok === true,
      containsValues: resourcesMatrix.containsValues === true,
      secretLeakCheck: resourcesMatrix.secretLeakCheck?.ok === true,
      mutationPerformed: resourcesMatrix.mutationPerformed === true,
      ready: `${resourcesMatrix.summary.ready}/${resourcesMatrix.summary.total}`,
      blockedIds: resourcesMatrix.summary.blockedIds,
      actionTimeConfirmationRequired: resourcesMatrix.summary.actionTimeConfirmationRequired,
    },
    userActionBrief: {
      report: audit.outputFiles.userActionBriefJson,
      markdown: audit.outputFiles.userActionBriefMarkdown,
      ok: userActionBrief.ok === true,
      containsValues: userActionBrief.containsValues === true,
      secretLeakCheck: userActionBrief.secretLeakCheck?.ok === true,
      mutationPerformed: userActionBrief.mutationPerformed === true,
      canDeployNow: userActionBrief.canDeployNow === true,
      ready: `${userActionBrief.summary.ready}/${userActionBrief.summary.total}`,
      blockedIds: userActionBrief.summary.blockedIds,
      userMustAct: userActionBrief.summary.userMustAct,
      actionTimeConfirmationRequired: userActionBrief.summary.actionTimeConfirmationRequired,
    },
    consoleRunbook: {
      report: audit.outputFiles.consoleRunbookJson,
      markdown: audit.outputFiles.consoleRunbookMarkdown,
      ok: consoleRunbook.ok === true,
      containsValues: consoleRunbook.containsValues === true,
      mutationPerformed: consoleRunbook.mutationPerformed === true,
      resourceReady: consoleRunbook.summary?.resourceReady || "unknown",
      userActionReady: consoleRunbook.summary?.userActionReady || "unknown",
      canStartNowConsoleTasks: consoleRunbook.summary?.canStartNowConsoleTasks || [],
      readyActionPackets: consoleRunbook.readyActionPackets || [],
      blockedByTaskDependencies: consoleRunbook.summary?.blockedByTaskDependencies || [],
      consoleTasks: (consoleRunbook.consoleTasks || []).map((item) => `${item.id}:${item.status}:canStartNow=${item.canStartNow}`),
      actionTimeConfirmationRequired: consoleRunbook.summary?.actionTimeConfirmationRequired || [],
    },
    provisioningPlan: {
      report: audit.outputFiles.provisioningPlanJson,
      markdown: audit.outputFiles.provisioningPlanMarkdown,
      ok: provisioningPlan.ok === true,
      executionMode: provisioningPlan.executionMode,
      canCodexExecuteNow: provisioningPlan.canCodexExecuteNow === true,
      containsValues: provisioningPlan.containsValues === true,
      secretLeakCheck: provisioningPlan.secretLeakCheck?.ok === true,
      phases: provisioningPlan.summary.phases,
      readyToStartPhases: provisioningPlan.summary.readyToStartPhases,
      blockedPhases: provisioningPlan.summary.blockedPhases,
      requiredBlocking: provisioningPlan.summary.requiredBlocking,
    },
    actionAuthorization: {
      report: audit.outputFiles.actionAuthorizationJson,
      markdown: audit.outputFiles.actionAuthorizationMarkdown,
      ok: actionAuthorization.ok === true,
      containsValues: actionAuthorization.containsValues === true,
      secretLeakCheck: actionAuthorization.secretLeakCheck?.ok === true,
      mutationPerformed: actionAuthorization.mutationPerformed === true,
      canDeployNow: actionAuthorization.canDeployNow === true,
      actions: actionAuthorization.summary.actions,
      authorizationPackets: actionAuthorization.summary.authorizationPackets || 0,
      authorizationPacketIds: (actionAuthorization.authorizationPackets || []).map((item) => item.packetId),
      canStartNowPackets: actionAuthorization.summary.canStartNowPackets || [],
      blockedByPacketDependencies: actionAuthorization.summary.blockedByPacketDependencies || [],
      canCodexProceedWithoutUser: actionAuthorization.summary.canCodexProceedWithoutUser,
      currentExternalBlockers: actionAuthorization.summary.currentExternalBlockers,
      actionTimeConfirmationRequired: actionAuthorization.summary.actionTimeConfirmationRequired,
      policyClasses: actionAuthorization.summary.policyClasses,
    },
    completionAudit: {
      report: audit.outputFiles.completionAuditJson,
      markdown: audit.outputFiles.completionAuditMarkdown,
      ok: completionAudit.ok === true,
      verdict: completionAudit.verdict,
      complete: completionAudit.complete === true,
      canDeployNow: completionAudit.canDeployNow === true,
      containsValues: completionAudit.containsValues === true,
      secretLeakCheck: completionAudit.secretLeakCheck?.ok === true,
      requirements: completionAudit.summary.requirements,
      proved: completionAudit.summary.proved,
      blocked: completionAudit.summary.blocked,
      partial: completionAudit.summary.partial,
      canStartNowConsoleTasks: completionAudit.summary.canStartNowConsoleTasks,
      canStartNowAuthorizationPackets: completionAudit.summary.canStartNowAuthorizationPackets,
      requirementStatuses: (completionAudit.requirements || []).map((item) => `${item.id}:${item.status}`),
    },
    wechatOpenMobileAppPackage: {
      report: audit.outputFiles.wechatOpenMobileAppPackageJson,
      markdown: audit.outputFiles.wechatOpenMobileAppPackageMarkdown,
      ok: wechatOpenMobileAppPackage.ok === true,
      containsValues: wechatOpenMobileAppPackage.containsValues === true,
      mutationPerformed: wechatOpenMobileAppPackage.mutationPerformed === true,
      accountVerified: wechatOpenMobileAppPackage.summary?.accountVerified === true,
      mobileAppCreated: wechatOpenMobileAppPackage.summary?.mobileAppCreated === true,
      reviewStatus: wechatOpenMobileAppPackage.summary?.reviewStatus || "unknown",
      readyToSubmitForReview: wechatOpenMobileAppPackage.summary?.readyToSubmitForReview === true,
      actionPacket: wechatOpenMobileAppPackage.actionPacket || null,
      submissionBlockers: wechatOpenMobileAppPackage.summary?.submissionBlockers || [],
      androidPackageName: wechatOpenMobileAppPackage.mobileAppCreationPackage?.android?.packageName || "",
      iosBundleId: wechatOpenMobileAppPackage.mobileAppCreationPackage?.ios?.bundleId || "",
    },
    appleTeamAasaPackage: {
      report: audit.outputFiles.appleTeamAasaPackageJson,
      markdown: audit.outputFiles.appleTeamAasaPackageMarkdown,
      ok: appleTeamAasaPackage.ok === true,
      containsValues: appleTeamAasaPackage.containsValues === true,
      mutationPerformed: appleTeamAasaPackage.mutationPerformed === true,
      teamIdStatus: appleTeamAasaPackage.summary?.teamIdStatus || "unknown",
      aasaOk: appleTeamAasaPackage.summary?.aasaOk === true,
      routeFilesReady: appleTeamAasaPackage.summary?.routeFilesReady === true,
      iosNativeReady: appleTeamAasaPackage.summary?.iosNativeReady === true,
      readyForAasa: appleTeamAasaPackage.actionPacket?.readyForAasa === true,
      actionPacket: appleTeamAasaPackage.actionPacket || null,
      blockers: appleTeamAasaPackage.summary?.blockers || [],
      expectedIosBundleId: appleTeamAasaPackage.summary?.expectedIosBundleId || "",
      associatedDomain: appleTeamAasaPackage.summary?.associatedDomain || "",
      universalLink: appleTeamAasaPackage.summary?.universalLink || "",
      aasaUrl: appleTeamAasaPackage.summary?.aasaUrl || "",
    },
    operatorHandoff: {
      report: audit.outputFiles.operatorHandoffJson,
      markdown: audit.outputFiles.operatorHandoffMarkdown,
      verdict: operatorHandoff.verdict,
      canDeployNow: operatorHandoff.canDeployNow === true,
      blockingRequiredEnv: operatorHandoff.missingVariables.required.map((item) => item.name),
      appLaunchBlockingVariables: operatorHandoff.appLaunchBlocking.variables.map((item) => item.name),
      appLaunchBlockingStates: operatorHandoff.appLaunchBlocking.states.map((item) => `${item.name}:${item.status}`),
      optionalDeferredEnv: operatorHandoff.missingVariables.optionalDeferred.map((item) => item.name),
      sensitiveActionItems: (operatorHandoff.sensitiveActionItems || []).map((item) => `${item.id}:${item.status}`),
      canStartNowConsoleTasks: operatorHandoff.aliyunConsoleTaskOrder?.canStartNow || [],
      blockedByConsoleTaskDependencies: operatorHandoff.aliyunConsoleTaskOrder?.blockedByDependencies || [],
      aliyunConsoleTasks: (operatorHandoff.aliyunConsoleTaskOrder?.tasks || []).map((task) => `${task.id}:${task.status}:canStartNow=${task.canStartNow}`),
      bridgeDataLayer: operatorHandoff.bridgeDataLayer || null,
      localEvidenceGaps: {
        cloudInventoryResults: {
          exists: operatorHandoff.localEvidenceGaps?.cloudInventoryResults?.exists === true,
          ready: operatorHandoff.localEvidenceGaps?.cloudInventoryResults?.ready === true,
          totalBlockers: operatorHandoff.localEvidenceGaps?.cloudInventoryResults?.totalBlockers ?? 0,
        },
        cloudConfirmations: {
          ready: operatorHandoff.localEvidenceGaps?.cloudConfirmations?.ready === true,
          totalBlockers: operatorHandoff.localEvidenceGaps?.cloudConfirmations?.totalBlockers ?? 0,
        },
        imagePublish: {
          ready: operatorHandoff.localEvidenceGaps?.imagePublish?.ready === true,
          totalBlockers: operatorHandoff.localEvidenceGaps?.imagePublish?.totalBlockers ?? 0,
        },
      },
      vercelEnvCoverage: operatorHandoff.vercelEnvCoverage?.ok
        ? {
            containsValues: operatorHandoff.vercelEnvCoverage.containsValues,
            requiredCovered: operatorHandoff.vercelEnvCoverage.requiredCovered,
            requiredMissing: operatorHandoff.vercelEnvCoverage.requiredMissingInVercelProduction,
            appSpecificMissing: operatorHandoff.vercelEnvCoverage.appSpecificKeysMissingInVercelProduction,
          }
        : {
            ok: false,
            skipped: operatorHandoff.vercelEnvCoverage?.skipped === true,
            error: operatorHandoff.vercelEnvCoverage?.error || null,
          },
      priorityTasks: operatorHandoff.priorityTasks.map((task) => `${task.id}:${task.status}`),
    },
    appProductionConfig: {
      filesReady: readiness.checks?.appProductionConfig?.files?.ready === true,
      scriptsReady: readiness.checks?.appProductionConfig?.scripts?.ready === true,
      envTemplateReady: readiness.checks?.appProductionConfig?.envTemplate?.ready === true,
      envTemplateKeyCount: readiness.checks?.appProductionConfig?.envTemplate?.keyCount ?? 0,
      runtimeConfigReady: readiness.checks?.appProductionConfig?.runtimeConfig?.ok === true,
      runtimeContainsSecretValues: readiness.checks?.appProductionConfig?.runtimeConfig?.containsSecretValues === true,
      runtimeApiBaseUrl: readiness.checks?.appProductionConfig?.runtimeConfig?.productionRuntime?.apiBaseUrl || "",
      runtimeAssetBaseUrl: readiness.checks?.appProductionConfig?.runtimeConfig?.productionRuntime?.assetBaseUrl || "",
      nativeReleaseReady: readiness.checks?.appProductionConfig?.nativeRelease?.ok === true,
      nativeReleaseBlockers: readiness.checks?.appProductionConfig?.nativeRelease?.blockers || [],
    },
    envSourceCatalog: {
      containsValues: false,
      variables: env.planVariables,
      sourceMetadataReady: env.planSourceMetadataReady,
      report: audit.outputFiles.envImportPlan,
    },
    appClientContract: {
      ok: appClientContract.ok === true,
      auditedClientApiCalls: appClientContract.auditedClientApiCalls,
      uniqueAuditedClientRoutes: appClientContract.uniqueAuditedClientRoutes,
      matchedBackendRoutes: appClientContract.matchedBackendRoutes,
      deferredClientApiCalls: appClientContract.deferredClientApiCalls,
    },
    appApiBridgeMap: {
      report: audit.outputFiles.appApiBridgeMap,
      ok: appApiBridgeMap.ok === true,
      mappedRoutes: appApiBridgeMap.mappedRoutes,
      bridgeReadyRoutes: appApiBridgeMap.bridgeReadyRoutes,
      externalEnvBlockedRoutes: appApiBridgeMap.externalEnvBlockedRoutes,
      sourceTypes: appApiBridgeMap.sourceTypes,
    },
    appApiSmokeCoverage: {
      ok: appApiSmokeCoverage.ok === true,
      coveredBusinessRoutes: appApiSmokeCoverage.coveredBusinessRoutes,
      businessRoutes: appApiSmokeCoverage.businessRoutes,
      smokeProbes: appApiSmokeCoverage.smokeProbes,
    },
    vercelEnvCoverage: vercelEnvCoverage.ok
      ? {
          report: audit.outputFiles.vercelEnvCoverage,
          containsValues: vercelEnvCoverage.report.containsValues,
          requiredCovered: `${vercelEnvCoverage.report.totals.requiredPresentInVercelProduction}/${vercelEnvCoverage.report.totals.requiredTotal}`,
          requiredMissing: vercelEnvCoverage.report.requiredMissingInVercelProduction,
          appSpecificMissing: vercelEnvCoverage.report.appSpecificKeysMissingInVercelProduction,
        }
      : {
          ok: false,
          skipped: vercelEnvCoverage.skipped === true,
          error: vercelEnvCoverage.error || null,
        },
    bundle: audit.bundle,
    auditJson: audit.outputFiles.auditJson,
    auditMarkdown: audit.outputFiles.auditMarkdown,
    envImportPlan: audit.outputFiles.envImportPlan,
    envImportChecklist: audit.outputFiles.envImportChecklist,
    envHandoffJson: audit.outputFiles.envHandoffJson,
    envHandoffMarkdown: audit.outputFiles.envHandoffMarkdown,
    vercelEnvCoverageReport: audit.outputFiles.vercelEnvCoverage,
    domainReadinessReport: audit.outputFiles.domainReadiness,
    cloudAccessReport: audit.outputFiles.cloudAccess,
    cloudInventoryPlanJson: audit.outputFiles.cloudInventoryPlanJson,
    cloudInventoryPlanMarkdown: audit.outputFiles.cloudInventoryPlanMarkdown,
    cloudInventoryRunnerJson: audit.outputFiles.cloudInventoryRunnerJson,
    cloudInventoryRunnerMarkdown: audit.outputFiles.cloudInventoryRunnerMarkdown,
    cloudInventoryResultsJson: audit.outputFiles.cloudInventoryResultsJson,
    cloudInventoryResultsMarkdown: audit.outputFiles.cloudInventoryResultsMarkdown,
    cloudConfirmationsCheckReport: audit.outputFiles.cloudConfirmationsCheck,
    operatorTasksJson: audit.outputFiles.operatorTasksJson,
    operatorTasksMarkdown: audit.outputFiles.operatorTasksMarkdown,
    sensitiveBlockersJson: audit.outputFiles.sensitiveBlockersJson,
    sensitiveBlockersMarkdown: audit.outputFiles.sensitiveBlockersMarkdown,
    resourcesMatrixJson: audit.outputFiles.resourcesMatrixJson,
    resourcesMatrixMarkdown: audit.outputFiles.resourcesMatrixMarkdown,
    userActionBriefJson: audit.outputFiles.userActionBriefJson,
    userActionBriefMarkdown: audit.outputFiles.userActionBriefMarkdown,
    consoleRunbookJson: audit.outputFiles.consoleRunbookJson,
    consoleRunbookMarkdown: audit.outputFiles.consoleRunbookMarkdown,
    provisioningPlanJson: audit.outputFiles.provisioningPlanJson,
    provisioningPlanMarkdown: audit.outputFiles.provisioningPlanMarkdown,
    actionAuthorizationJson: audit.outputFiles.actionAuthorizationJson,
    actionAuthorizationMarkdown: audit.outputFiles.actionAuthorizationMarkdown,
    completionAuditJson: audit.outputFiles.completionAuditJson,
    completionAuditMarkdown: audit.outputFiles.completionAuditMarkdown,
    wechatOpenMobileAppPackageJson: audit.outputFiles.wechatOpenMobileAppPackageJson,
    wechatOpenMobileAppPackageMarkdown: audit.outputFiles.wechatOpenMobileAppPackageMarkdown,
    appleTeamAasaPackageJson: audit.outputFiles.appleTeamAasaPackageJson,
    appleTeamAasaPackageMarkdown: audit.outputFiles.appleTeamAasaPackageMarkdown,
    operatorHandoffJson: audit.outputFiles.operatorHandoffJson,
    operatorHandoffMarkdown: audit.outputFiles.operatorHandoffMarkdown,
  }, null, 2))
}

function runVercelEnvCoverage(args, reportPath) {
  if (args.skipVercelEnvCoverage) {
    return {
      ok: false,
      skipped: true,
      report: null,
      error: null,
    }
  }
  const commandArgs = [
    "scripts/check-vercel-env-coverage.mjs",
    "--write-report",
    reportPath,
  ]
  if (args.vercelEnvCoverageInput) {
    commandArgs.push("--input", args.vercelEnvCoverageInput)
  }
  const output = run(process.execPath, commandArgs, {
    allowFailure: true,
    label: "vercel_env_coverage",
  })
  if (output.status !== 0) {
    return {
      ok: false,
      skipped: false,
      report: null,
      error: (output.stderr || output.stdout || `exit ${output.status}`).split(/\r?\n/).slice(0, 8).join(" | "),
    }
  }
  return {
    ok: true,
    skipped: false,
    report: parseJsonOutput("vercel_env_coverage", output),
    error: null,
  }
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/prepare-aliyun-release-artifacts.mjs [--env-file path] [--cloud-confirmations path] [--cloud-inventory-results path] [--out-dir /tmp/path] [--skip-bundle] [--skip-vercel-env-coverage] [--vercel-env-coverage-input /tmp/vercel-env.json]",
    "",
    "Creates non-secret production-cn release audit files and a Docker context tarball outside the repo by default.",
    "Vercel env coverage is metadata-only and non-blocking; it never includes values.",
    "The tarball is scanned for forbidden entries such as .env files, .git, node_modules, .next, and logs.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
