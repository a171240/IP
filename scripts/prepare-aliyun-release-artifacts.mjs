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
    backendOnly: false,
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
    if (arg === "--backend-only") {
      args.backendOnly = true
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

function progressLine(phase, label, details = "") {
  if (process.env.MEIYE_RELEASE_ARTIFACTS_PROGRESS === "0") return
  const suffix = details ? ` ${details}` : ""
  process.stderr.write(`[aliyun-release-artifacts] ${phase} ${label}${suffix}\n`)
}

function runJson(label, args, opts = {}) {
  const startedAt = Date.now()
  progressLine("start", label)
  try {
    const parsed = parseJsonOutput(label, run(process.execPath, args, opts))
    progressLine("done", label, `${Date.now() - startedAt}ms`)
    return parsed
  } catch (error) {
    progressLine("failed", label, `${Date.now() - startedAt}ms`)
    throw error
  }
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

function buildDeferredAppLaunchPackage(kind, jsonPath, markdownPath) {
  const titleByKind = {
    wechat: "微信开放平台移动应用材料包",
    android: "Android Release Signing 动作确认包",
    apple: "Apple Team ID / AASA 动作确认包",
  }
  const title = titleByKind[kind] || "APP 发布延期材料包"
  const reason = "微信开放平台移动应用、Android release signing、Apple Team ID/AASA 已延期到阿里云后端上线后处理；当前 backend-only 总包不生成这些专项材料。"
  const base = {
    ok: true,
    deferred: true,
    status: "deferred_after_backend_online",
    currentScope: "backend_aliyun_only",
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    cloudApiCalled: false,
    mutationPerformed: false,
    reason,
    summary: {
      status: "deferred_after_backend_online",
      blockers: ["deferred_after_backend_online"],
    },
    actionPacket: null,
  }
  const report = {
    ...base,
    ...(kind === "wechat"
      ? {
          summary: {
            ...base.summary,
            accountVerified: false,
            mobileAppCreated: false,
            reviewStatus: "deferred_after_backend_online",
            readyToSubmitForReview: false,
            submissionBlockers: ["deferred_after_backend_online"],
          },
          credentialBoundary: {
            appLoginCredentialSource: "deferred_after_backend_online",
            miniProgramCredentialsReusableForAppLogin: false,
            miniProgramCompatVariableNames: [],
          },
          mobileAppCreationPackage: {
            android: { packageName: "deferred_after_backend_online" },
            androidSignaturePackage: {
              status: "deferred_after_backend_online",
              releaseArtifactReady: false,
              wechatSignatureRecorded: false,
            },
            ios: { bundleId: "deferred_after_backend_online" },
          },
        }
      : {}),
    ...(kind === "android"
      ? {
          summary: {
            ...base.summary,
            canStartNow: false,
            readyForWechatAndroidSignature: false,
            androidPackageName: "deferred_after_backend_online",
            releaseSigningConfig: "deferred_after_backend_online",
            releaseSigningConfigReady: false,
            releaseUsesDebugSigning: false,
            releaseArtifactReady: false,
            wechatSignatureRecorded: false,
            androidConfigured: false,
          },
          currentBlockers: ["deferred_after_backend_online"],
          signingInputs: { variableNames: [] },
        }
      : {}),
    ...(kind === "apple"
      ? {
          summary: {
            ...base.summary,
            teamIdStatus: "deferred_after_backend_online",
            aasaOk: false,
            routeFilesReady: false,
            iosNativeReady: false,
            expectedIosBundleId: "deferred_after_backend_online",
            associatedDomain: "deferred_after_backend_online",
            universalLink: "deferred_after_backend_online",
            aasaUrl: "deferred_after_backend_online",
          },
        }
      : {}),
  }
  writeText(jsonPath, JSON.stringify(report, null, 2))
  writeText(markdownPath, [
    `# ${title}`,
    "",
    "- status: deferred_after_backend_online",
    "- currentScope: backend_aliyun_only",
    "- containsValues: false",
    "- mutationPerformed: false",
    `- reason: ${reason}`,
  ].join("\n"))
  return report
}

function runAppLaunchPackage(args, kind, label, scriptArgs, jsonPath, markdownPath) {
  if (args.backendOnly) {
    progressLine("defer", label, "backend-only")
    return buildDeferredAppLaunchPackage(kind, jsonPath, markdownPath)
  }
  return runJson(label, scriptArgs)
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
  const cloudshellReadonlyCollector = audit.checks.cloudshellReadonlyCollector
  const cloudshellInventoryHandoff = audit.checks.cloudshellInventoryHandoff
  const cloudInventoryResults = audit.checks.cloudInventoryResults
  const deploymentSpec = audit.checks.deploymentSpec
  const runtimePlan = audit.checks.runtimePlan
  const legalPages = audit.checks.legalPages
  const imagePublishPlan = audit.checks.imagePublishPlan
  const operatorTasks = audit.checks.operatorTasks
  const envHandoff = audit.checks.envHandoff
  const envSourceMap = audit.checks.envSourceMap
  const sensitiveBlockers = audit.checks.sensitiveBlockers
  const resourcesMatrix = audit.checks.resourcesMatrix
  const userActionBrief = audit.checks.userActionBrief
  const consoleRunbook = audit.checks.consoleRunbook
  const cloudActionsPackage = audit.checks.cloudActionsPackage
  const provisioningPlan = audit.checks.provisioningPlan
  const actionAuthorization = audit.checks.actionAuthorization
  const completionAudit = audit.checks.completionAudit
  const rdsMigrationPlan = audit.checks.rdsMigrationPlan
  const rdsRouteMigrationMap = audit.checks.rdsRouteMigrationMap
  const rdsMigrationPackage = audit.checks.rdsMigrationPackage
  const rdsMigrationEvidence = audit.checks.rdsMigrationEvidence
  const backendCnStatus = audit.checks.backendCnStatus
  const backendApplyPackage = audit.checks.backendApplyPackage
  const blockerBrief = audit.checks.blockerBrief
  const evidenceWriteback = audit.checks.evidenceWriteback
  const wechatOpenMobileAppPackage = audit.checks.wechatOpenMobileAppPackage
  const androidReleaseSigningPackage = audit.checks.androidReleaseSigningPackage
  const appleTeamAasaPackage = audit.checks.appleTeamAasaPackage
  const operatorHandoff = audit.checks.operatorHandoff
  const productionStatus = audit.checks.productionStatus
  const cloudConfirmationsCheck = audit.checks.cloudConfirmationsCheck
  const cloudConfirmations = readiness.checks?.cloudConfirmations
  const cloudInventoryObservation = cloudInventoryResults.local?.observationSummary || {}
  const productionCloudInventoryObservation = productionStatus.summary.cloudInventoryResults?.observationSummary || {}
  const operatorHandoffCloudInventoryObservation = operatorHandoff.localEvidenceGaps?.cloudInventoryResults?.observationSummary || {}
  const appProductionConfig = readiness.checks?.appProductionConfig
  const appEnvTemplate = appProductionConfig?.envTemplate
  const appRuntimeConfig = appProductionConfig?.runtimeConfig
  const appNativeRelease = appProductionConfig?.nativeRelease
  const bridgeDataLayer = readiness.checks?.bridgeDataLayer || {}
  const currentScopeReady = audit.currentScope === "backend_aliyun_only"
    ? backendCnStatus.canDeployBackendNow === true
    : readiness.productionReady === true
  const currentScopeBlocking = audit.currentScope === "backend_aliyun_only"
    ? backendCnStatus.summary.backendRequiredBlocking || []
    : readiness.machineBlocking || []
  const machineBlockingForScope = audit.currentScope === "backend_aliyun_only"
    ? blockerBrief.summary.machineBlocking || []
    : readiness.machineBlocking || []
  const manualBlockingForScope = audit.currentScope === "backend_aliyun_only"
    ? (backendApplyPackage.applySteps || []).map((item) =>
      `${item.id}: canStart=${item.canStartAfterActionTimeConfirmation === true}; blockers=${item.currentBlockers?.length ? item.currentBlockers.join(", ") : "none"}`)
    : readiness.manualBlocking || []
  const cloudConfirmationLinesForScope = audit.currentScope === "backend_aliyun_only"
    ? Object.entries(cloudConfirmationsCheck?.local?.itemStatus || {}).map(([key, item]) =>
      `- ${key}: ${item.ready ? "ready" : "incomplete"}${item.blockers?.length ? ` (${item.blockers.join(", ")})` : ""}`)
    : (cloudConfirmations?.items?.length
      ? cloudConfirmations.items.map((item) => `- ${item.key}: ${item.status}${item.missing?.length ? ` (${item.missing.join(", ")})` : ""}`)
      : ["- none"])
  return [
    "# 美业话镜 APP production-cn 阿里云发布审计",
    "",
    `生成时间：${audit.generatedAt}`,
    "",
    "## 结论",
    "",
    `- currentScope: ${audit.currentScope}`,
    `- currentScopeReady: ${currentScopeReady}`,
    `- currentScopeBlocking: ${currentScopeBlocking.join(", ") || "none"}`,
    `- deferredAppLaunchBlocking: ${(backendCnStatus.summary.appLaunchDeferredBlocking || []).join(", ") || "none"}`,
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
    `- cloudInventoryRunnerFailureCategories: ${Object.keys(cloudInventoryRunner.summary.failureCategories || {}).length ? JSON.stringify(cloudInventoryRunner.summary.failureCategories) : "none"}`,
    `- cloudshellReadonlyCollector: script ${basename(cloudshellReadonlyCollector.scriptFile || "")}, commands ${cloudshellReadonlyCollector.summary?.commands || 0}, cloudApiCalled ${cloudshellReadonlyCollector.cloudApiCalled === true}`,
    `- cloudshellInventoryHandoff: canReadCloudNow ${cloudshellInventoryHandoff.cliReadiness.canReadCloudNow}, strictInventoryAlreadyReady ${cloudshellInventoryHandoff.existingInventoryEvidence?.ready === true}, operations ${cloudshellInventoryHandoff.inventoryPlan.totalOperations}`,
    `- cloudInventoryResults: ${cloudInventoryResults.local?.ready ? "ready" : "not ready"} (${cloudInventoryResults.local?.checkedOperations || 0} local operations)`,
    `- cloudInventoryConsoleOnly: safe ${cloudInventoryObservation.safeConsoleOnly === true}, console observations ${cloudInventoryObservation.consoleObservationOperations || 0}/${cloudInventoryObservation.operations || 0}, executed commands ${cloudInventoryObservation.executedCommandResults || 0}/${cloudInventoryObservation.commandResults || 0}, cloud API calls ${cloudInventoryObservation.cloudApiCalledCommandResults || 0}`,
    `- appRuntimeConfig: ${appRuntimeConfig?.ok === true ? "ready" : "not ready"}`,
    `- appNativeRelease: ${appNativeRelease?.ok === true ? "ready" : "not ready"}`,
    `- operatorTasks: ${operatorTasks.summary.ready} / ${operatorTasks.summary.total} ready`,
    `- operatorHandoff: ${operatorHandoff.verdict}, missing required env ${operatorHandoff.missingVariables.required.length}`,
    `- productionStatus: ${productionStatus.verdict}, canDeployNow ${productionStatus.canDeployNow === true}`,
    `- envHandoff: ${envHandoff.summary.requiredBlocking.length} required blocked, ${envHandoff.summary.appLaunchBlocking.length} app launch blocked, ${envHandoff.summary.readySecretEnv} ready secret env`,
    `- envSourceMap: Vercel ${envSourceMap.vercelCoverage.ok ? "checked" : envSourceMap.vercelCoverage.skipped ? "skipped" : "not ok"}, migrate ${envSourceMap.summary.canMigrateFromVercelProduction}, app/Aliyun new ${envSourceMap.summary.appAliyunOwnedNotInVercel}`,
    `- sensitiveActionItems: ${sensitiveBlockers.summary.total} total, ${sensitiveBlockers.summary.blocked} blocked`,
    `- aliyunResources: ${resourcesMatrix.summary.ready} / ${resourcesMatrix.summary.total} ready, ${resourcesMatrix.summary.blocked} blocked`,
    `- userActionBrief: ${userActionBrief.summary.ready} / ${userActionBrief.summary.total} ready, ${userActionBrief.summary.blocked} blocked`,
    `- actionAuthorization: ${actionAuthorization.summary.actions} actions, ${actionAuthorization.summary.actionTimeConfirmationRequired.length} action-time confirmations`,
    `- provisioningPlan: ${provisioningPlan.summary.readyToStartPhases.length}/${provisioningPlan.summary.phases} phases ready to start, executionMode ${provisioningPlan.executionMode}`,
    `- completionAudit: ${completionAudit.verdict}, complete ${completionAudit.complete === true}, proved ${completionAudit.summary.proved}/${completionAudit.summary.requirements}`,
    `- rdsMigrationPlan: first-version RDS routes ${rdsMigrationPlan.summary.firstVersionRdsRoutesWithSupabaseDataAccess}/${rdsMigrationPlan.summary.firstVersionRdsRouteCount} still use Supabase data access; full app routes ${rdsMigrationPlan.summary.appApiRoutesWithSupabase}/${rdsMigrationPlan.summary.appApiRouteCount} touch Supabase, migrationReady ${rdsMigrationPlan.migrationReady}`,
    `- rdsRouteMigrationMap: first-version routes ${rdsRouteMigrationMap.summary.routesStillUsingSupabaseDataAccess}/${rdsRouteMigrationMap.summary.firstVersionRouteCount} still use Supabase data access, observed tables ${rdsRouteMigrationMap.summary.observedTableCount}/${rdsRouteMigrationMap.summary.requiredTableCount}, schema gaps ${rdsRouteMigrationMap.summary.schemaMapMissingObservedTables.length}`,
    `- rdsMigrationPackage: ${rdsMigrationPackage.ok === true ? "ready" : "not ready"} (${rdsMigrationPackage.summary.sourceFileCount} source files, ${rdsMigrationPackage.summary.requiredTableCount} tables)`,
    `- rdsMigrationEvidence: localExists ${rdsMigrationEvidence.summary.localExists === true}, localReady ${rdsMigrationEvidence.summary.localReady === true}, required packets ${rdsMigrationEvidence.summary.requiredAuthorizationPackets.join(", ") || "none"}`,
    `- backendCnStatus: ${backendCnStatus.currentScope}, canDeployBackendNow ${backendCnStatus.canDeployBackendNow === true}, blockers ${backendCnStatus.summary.backendRequiredBlockingCount}`,
    `- backendApplyPackage: immediate ${backendApplyPackage.summary.immediateBackendSteps.join(", ") || "none"}, blocked ${backendApplyPackage.summary.blockedBackendSteps.length}`,
    `- blockerBrief: requiredEnv ${blockerBrief.summary.requiredEnv}, immediate packets ${blockerBrief.summary.immediateAuthorizationPackets.join(", ") || "none"}`,
    `- evidenceWriteback: ${evidenceWriteback.summary.readyFiles}/${evidenceWriteback.summary.files} files ready, gaps ${evidenceWriteback.summary.totalGaps}`,
    `- cloudConfirmations: ${cloudConfirmations?.ready ? "ready" : "not ready"}`,
    `- cloudConfirmationsCheck: template ${cloudConfirmationsCheck?.template?.ready ? "ready" : "not ready"}, local ${cloudConfirmationsCheck?.local?.ready ? "ready" : "not ready"}`,
    `- vercelEnvCoverage: ${vercelEnvCoverage?.ok ? "ok" : vercelEnvCoverage?.skipped ? "skipped" : "not ok"}`,
    `- bridgeDataLayer: ${bridgeDataLayer.current || "unknown"} -> ${bridgeDataLayer.target || "unknown"} (${bridgeDataLayer.status || "unknown"})`,
    `- bundle: ${bundle ? basename(bundle.path) : "skipped"}`,
    "",
    "## 机器可验证阻塞",
    "",
    ...(machineBlockingForScope.length
      ? machineBlockingForScope.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## 仍需人工确认",
    "",
    ...(manualBlockingForScope.length
      ? manualBlockingForScope.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## 云资源确认文件",
    "",
    `- mode: ${cloudConfirmations?.mode || "unknown"}`,
    `- path: ${cloudConfirmations?.path || "not provided"}`,
    `- ready: ${cloudConfirmations?.ready === true}`,
    "",
    ...cloudConfirmationLinesForScope,
    "",
    "## 云确认文件结构校验",
    "",
    `- templateReady: ${cloudConfirmationsCheck?.template?.ready === true}`,
    `- localReady: ${cloudConfirmationsCheck?.local?.ready === true}`,
    `- totalBlockers: ${cloudConfirmationsCheck?.summary?.totalBlockers ?? 0}`,
    `- writebackBlockingGroups: ${cloudConfirmationsCheck?.summary?.writebackBlockingGroups?.length ? cloudConfirmationsCheck.summary.writebackBlockingGroups.join(", ") : "none"}`,
    `- requiredAuthorizationPackets: ${cloudConfirmationsCheck?.summary?.requiredAuthorizationPackets?.length ? cloudConfirmationsCheck.summary.requiredAuthorizationPackets.join(", ") : "none"}`,
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
    `- cliConfigProbeReady: ${cloudAccess.cli?.configProbe?.ready === true}`,
    `- cliConfigProbeFailureCategory: ${cloudAccess.cli?.configProbe?.failureCategory || "none"}`,
    `- currentBrowserCanUseCurrentConsole: ${cloudAccess.localBrowserProbe?.canUseCurrentConsole === true}`,
    `- currentBrowserAliyunConsoleTabCount: ${cloudAccess.localBrowserProbe?.aliyunConsoleTabCount || 0}`,
    `- currentBrowserAliyunConsoleHostPaths: ${formatCurrentBrowserHostPaths(cloudAccess.localBrowserProbe?.aliyunConsoleTabs || [])}`,
    `- currentBrowserCloudApiCalled: ${cloudAccess.localBrowserProbe?.cloudApiCalled === true}`,
    `- currentBrowserCloudMutationPerformed: ${cloudAccess.localBrowserProbe?.cloudMutationPerformed === true}`,
    `- workbenchTerminalConnected: ${cloudAccess.terminalAccess?.workbenchTerminal?.connected === true}`,
    `- workbenchTerminalReadiness: ${cloudAccess.terminalAccess?.workbenchTerminal?.readiness || "not_observed"}`,
    `- workbenchTerminalCliInventoryAttempted: ${cloudAccess.terminalAccess?.workbenchTerminal?.cliInventoryAttempted === true}`,
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
    `- failureCategories: ${Object.keys(cloudInventoryRunner.summary.failureCategories || {}).length ? JSON.stringify(cloudInventoryRunner.summary.failureCategories) : "none"}`,
    ...(cloudInventoryRunner.blockers?.length
      ? cloudInventoryRunner.blockers.map((item) => `- ${item}`)
      : ["- blockers: none"]),
    ...(cloudInventoryRunner.executionDiagnostics?.nextActions?.length
      ? cloudInventoryRunner.executionDiagnostics.nextActions.map((item) => `- nextAction: ${item}`)
      : []),
    "",
    "## CloudShell 只读采集器",
    "",
    `- script: ${audit.outputFiles.cloudshellReadonlyCollectorScript}`,
    `- json: ${audit.outputFiles.cloudshellReadonlyCollectorJson}`,
    `- markdown: ${audit.outputFiles.cloudshellReadonlyCollectorMarkdown}`,
    `- ok: ${cloudshellReadonlyCollector.ok === true}`,
    `- executionMode: ${cloudshellReadonlyCollector.executionMode}`,
    `- allowEnv: ${cloudshellReadonlyCollector.allowEnv}`,
    `- containsValues: ${cloudshellReadonlyCollector.containsValues === true}`,
    `- readOnlyOnly: ${cloudshellReadonlyCollector.readOnlyOnly === true}`,
    `- cloudApiCalled: ${cloudshellReadonlyCollector.cloudApiCalled === true}`,
    `- mutationPerformed: ${cloudshellReadonlyCollector.mutationPerformed === true}`,
    `- commands: ${cloudshellReadonlyCollector.summary?.commands || 0}`,
    `- secretLeakCheck: ${cloudshellReadonlyCollector.secretLeakCheck?.ok === true}`,
    ...(cloudshellReadonlyCollector.blockers?.length
      ? cloudshellReadonlyCollector.blockers.map((item) => `- ${item}`)
      : ["- blockers: none"]),
    "",
    "## CloudShell / CLI 只读盘点交接包",
    "",
    `- json: ${audit.outputFiles.cloudshellInventoryHandoffJson}`,
    `- markdown: ${audit.outputFiles.cloudshellInventoryHandoffMarkdown}`,
    `- ok: ${cloudshellInventoryHandoff.ok === true}`,
    `- executionMode: ${cloudshellInventoryHandoff.executionMode}`,
    `- canReadCloudNow: ${cloudshellInventoryHandoff.cliReadiness.canReadCloudNow}`,
    `- cliConfigProbeReady: ${cloudshellInventoryHandoff.cliReadiness.configProbe?.ready === true}`,
    `- cliConfigProbeFailureCategory: ${cloudshellInventoryHandoff.cliReadiness.configProbe?.failureCategory || "none"}`,
    `- currentBrowserCanUseCurrentConsole: ${cloudshellInventoryHandoff.currentBrowser?.canUseCurrentConsole === true}`,
    `- currentBrowserAliyunConsoleTabCount: ${cloudshellInventoryHandoff.currentBrowser?.aliyunConsoleTabCount || 0}`,
    `- currentBrowserAliyunConsoleHostPaths: ${formatStringList(cloudshellInventoryHandoff.currentBrowser?.aliyunConsoleHostPaths || [])}`,
    `- currentBrowserCloudApiCalled: ${cloudshellInventoryHandoff.currentBrowser?.cloudApiCalled === true}`,
    `- currentBrowserCloudMutationPerformed: ${cloudshellInventoryHandoff.currentBrowser?.cloudMutationPerformed === true}`,
    `- strictInventoryAlreadyReady: ${cloudshellInventoryHandoff.existingInventoryEvidence?.ready === true}`,
    `- strictInventoryReadyLocalOperations: ${cloudshellInventoryHandoff.existingInventoryEvidence?.readyLocalOperations || 0}/${cloudshellInventoryHandoff.existingInventoryEvidence?.localOperations || 0}`,
    `- strictInventoryExecutedCommandResults: ${cloudshellInventoryHandoff.existingInventoryEvidence?.executedCommandResults || 0}/${cloudshellInventoryHandoff.existingInventoryEvidence?.commandResults || 0}`,
    `- strictInventoryCloudApiCalledCommandResults: ${cloudshellInventoryHandoff.existingInventoryEvidence?.cloudApiCalledCommandResults || 0}`,
    `- strictInventoryMutationPerformedCommandResults: ${cloudshellInventoryHandoff.existingInventoryEvidence?.mutationPerformedCommandResults || 0}`,
    `- inventoryPlanStatus: ${cloudshellInventoryHandoff.inventoryPlan.status}`,
    `- totalOperations: ${cloudshellInventoryHandoff.inventoryPlan.totalOperations}`,
    `- commandTemplates: ${cloudshellInventoryHandoff.inventoryPlan.commandTemplates}`,
    `- writebackTargets: ${cloudshellInventoryHandoff.writebackTargets.join("; ")}`,
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
    `- safeConsoleOnly: ${cloudInventoryObservation.safeConsoleOnly === true}`,
    `- consoleObservationOperations: ${cloudInventoryObservation.consoleObservationOperations || 0}/${cloudInventoryObservation.operations || 0}`,
    `- executedCommandResults: ${cloudInventoryObservation.executedCommandResults || 0}/${cloudInventoryObservation.commandResults || 0}`,
    `- cloudApiCalledCommandResults: ${cloudInventoryObservation.cloudApiCalledCommandResults || 0}`,
    `- mutationPerformedCommandResults: ${cloudInventoryObservation.mutationPerformedCommandResults || 0}`,
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
    `- canCodexProceedWithoutUser: ${sensitiveBlockers.summary.userIntervention?.canCodexProceedWithoutUser === true}`,
    `- blockedVariableNames: ${sensitiveBlockers.summary.userIntervention?.blockedVariableNames?.length ? sensitiveBlockers.summary.userIntervention.blockedVariableNames.join(", ") : "none"}`,
    `- readySecretEnvVariableCount: ${sensitiveBlockers.summary.userIntervention?.readySecretEnvVariableCount ?? 0}`,
    `- userInterventionGroups: ${formatUserInterventionGroups(sensitiveBlockers.summary.userIntervention?.groups || {})}`,
    ...renderSensitiveBlockerSummaryLines(sensitiveBlockers.items || []),
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
    `- nextActionTimeConfirmations: ${(userActionBrief.summary.nextActionTimeConfirmations || []).join(", ") || "none"}`,
    `- blockedCredentialCount: ${userActionBrief.summary.blockedCredentialCount || 0}`,
    `- readySecretEnvVariableCount: ${userActionBrief.summary.readySecretEnvVariableCount || 0}`,
    `- blockedCredentialNames: ${userActionBrief.summary.blockedCredentialNames?.length ? userActionBrief.summary.blockedCredentialNames.join(", ") : "none"}`,
    `- readySecretEnvVariableNames: ${userActionBrief.summary.readySecretEnvVariableNames?.length ? userActionBrief.summary.readySecretEnvVariableNames.join(", ") : "none"}`,
    `- actionTimeAuthorizationRequest.required: ${userActionBrief.actionTimeAuthorizationRequest?.required === true}`,
    `- actionTimeAuthorizationRequest.packetIds: ${userActionBrief.actionTimeAuthorizationRequest?.packetIds?.join(", ") || "none"}`,
    `- actionTimeAuthorizationRequest.recommendedUserReply: ${userActionBrief.actionTimeAuthorizationRequest?.recommendedUserReply || "none"}`,
    ...(userActionBrief.nextActionTimeConfirmations?.length
      ? userActionBrief.nextActionTimeConfirmations.map((item) => `- ${item.packetId}: ${item.minimumUserPhrase}`)
      : ["- nextActionTimeConfirmations: none"]),
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
    `- consoleClosureBrief: ${consoleRunbook.consoleClosureBrief ? "present" : "missing"}`,
    `- blockedCredentialCount: ${consoleRunbook.consoleClosureBrief?.blockedCredentialCount ?? consoleRunbook.summary?.blockedCredentialCount ?? 0}`,
    `- readySecretEnvVariableCount: ${consoleRunbook.consoleClosureBrief?.readySecretEnvVariableCount ?? consoleRunbook.summary?.readySecretEnvVariableCount ?? 0}`,
    `- resourceEvidenceReady: ${consoleRunbook.consoleClosureBrief?.resourceEvidenceReady || consoleRunbook.summary?.resourceEvidenceReady || "unknown"}`,
    `- blockedResourceEvidenceIds: ${consoleRunbook.consoleClosureBrief?.blockedResourceEvidenceIds?.length ? consoleRunbook.consoleClosureBrief.blockedResourceEvidenceIds.join(", ") : consoleRunbook.summary?.blockedResourceEvidenceIds?.length ? consoleRunbook.summary.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- partiallyObservedResourceEvidenceIds: ${consoleRunbook.consoleClosureBrief?.partiallyObservedResourceEvidenceIds?.length ? consoleRunbook.consoleClosureBrief.partiallyObservedResourceEvidenceIds.join(", ") : consoleRunbook.summary?.partiallyObservedResourceEvidenceIds?.length ? consoleRunbook.summary.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
    `- canStartNowConsoleTasks: ${consoleRunbook.summary?.canStartNowConsoleTasks?.length ? consoleRunbook.summary.canStartNowConsoleTasks.join(", ") : "none"}`,
    `- readyActionPackets: ${consoleRunbook.summary?.readyActionPackets ?? 0}`,
    `- blockedByTaskDependencies: ${consoleRunbook.summary?.blockedByTaskDependencies?.length ? consoleRunbook.summary.blockedByTaskDependencies.join(", ") : "none"}`,
    `- actionTimeConfirmationRequired: ${consoleRunbook.summary?.actionTimeConfirmationRequired?.length ? consoleRunbook.summary.actionTimeConfirmationRequired.join(", ") : "none"}`,
    ...(consoleRunbook.consoleTasks?.length
      ? consoleRunbook.consoleTasks.map((item) => `- ${item.id}: ${item.status}, canStartNow=${item.canStartNow}, dependsOn=${item.dependsOn?.join(", ") || "none"} (${item.consolePath})`)
      : ["- none"]),
    "",
    "## 阿里云控制台短动作包",
    "",
    `- json: ${audit.outputFiles.cloudActionsPackageJson}`,
    `- markdown: ${audit.outputFiles.cloudActionsPackageMarkdown}`,
    `- ok: ${cloudActionsPackage.ok === true}`,
    `- packageId: ${cloudActionsPackage.packageId}`,
    `- containsValues: ${cloudActionsPackage.containsValues === true}`,
    `- mutationPerformed: ${cloudActionsPackage.mutationPerformed === true}`,
    `- cloudApiCalled: ${cloudActionsPackage.cloudApiCalled === true}`,
    `- cloudActionClosureBrief: ${cloudActionsPackage.cloudActionClosureBrief ? "present" : "missing"}`,
    `- blockedCredentialCount: ${cloudActionsPackage.cloudActionClosureBrief?.blockedCredentialCount ?? cloudActionsPackage.summary?.blockedCredentialCount ?? 0}`,
    `- readySecretEnvVariableCount: ${cloudActionsPackage.cloudActionClosureBrief?.readySecretEnvVariableCount ?? cloudActionsPackage.summary?.readySecretEnvVariableCount ?? 0}`,
    `- resourceEvidenceReady: ${cloudActionsPackage.cloudActionClosureBrief?.resourceEvidenceReady || cloudActionsPackage.summary?.resourceEvidenceReady || "unknown"}`,
    `- blockedResourceEvidenceIds: ${cloudActionsPackage.cloudActionClosureBrief?.blockedResourceEvidenceIds?.length ? cloudActionsPackage.cloudActionClosureBrief.blockedResourceEvidenceIds.join(", ") : cloudActionsPackage.summary?.blockedResourceEvidenceIds?.length ? cloudActionsPackage.summary.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- partiallyObservedResourceEvidenceIds: ${cloudActionsPackage.cloudActionClosureBrief?.partiallyObservedResourceEvidenceIds?.length ? cloudActionsPackage.cloudActionClosureBrief.partiallyObservedResourceEvidenceIds.join(", ") : cloudActionsPackage.summary?.partiallyObservedResourceEvidenceIds?.length ? cloudActionsPackage.summary.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
    `- canStartNowConsoleTasks: ${cloudActionsPackage.summary?.canStartNowConsoleTasks?.length ? cloudActionsPackage.summary.canStartNowConsoleTasks.join(", ") : "none"}`,
    `- blockedByDependencies: ${cloudActionsPackage.summary?.blockedByDependencies?.length ? cloudActionsPackage.summary.blockedByDependencies.join(", ") : "none"}`,
    `- cloudConsolePackets: ${cloudActionsPackage.summary?.cloudConsolePackets?.length ? cloudActionsPackage.summary.cloudConsolePackets.join(", ") : "none"}`,
    `- executionQueueCanStartNow: ${cloudActionsPackage.executionQueue?.canStartNow?.length ? cloudActionsPackage.executionQueue.canStartNow.map((item) => item.id).join(", ") : "none"}`,
    `- executionQueueExternalAppPrerequisites: ${cloudActionsPackage.executionQueue?.externalAppPrerequisites?.length ? cloudActionsPackage.executionQueue.externalAppPrerequisites.map((item) => item.packetId).join(", ") : "none"}`,
    `- executionQueueBlockedByDependencies: ${cloudActionsPackage.executionQueue?.blockedByDependencies?.length ? cloudActionsPackage.executionQueue.blockedByDependencies.map((item) => item.id).join(", ") : "none"}`,
    `- canReadCloudNow: ${cloudActionsPackage.summary?.canReadCloudNow === true}`,
    `- cloudInventoryResultsReady: ${cloudActionsPackage.summary?.cloudInventoryResultsReady === true}`,
    `- cloudInventoryReadyLocalOperations: ${cloudActionsPackage.summary?.cloudInventoryReadyLocalOperations || "unknown"}`,
    `- cloudInventoryExecutedCommandResults: ${cloudActionsPackage.summary?.cloudInventoryExecutedCommandResults || "unknown"}`,
    `- imagePublishWritebackBlockingGroups: ${cloudActionsPackage.summary?.imagePublishWritebackBlockingGroups?.length ? cloudActionsPackage.summary.imagePublishWritebackBlockingGroups.join(", ") : "none"}`,
    `- readonlyInventoryStatus: ${cloudActionsPackage.readonlyInventoryUnblock?.status || "unknown"}`,
    `- cliConfigProbeFailureCategory: ${cloudActionsPackage.summary?.cliConfigProbeFailureCategory || "none"}`,
    ...(cloudActionsPackage.immediateConsoleTasks?.length
      ? cloudActionsPackage.immediateConsoleTasks.map((item) => `- ${item.id}: canStartNow=${item.canStartNow}, scope=${item.currentActionScope || "full_task"}, phrase=${item.minimumAuthorizationPhrase}`)
      : ["- immediateConsoleTasks: none"]),
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
    `- provisioningClosureBrief: ${provisioningPlan.provisioningClosureBrief ? "present" : "missing"}`,
    `- blockedCredentialCount: ${provisioningPlan.provisioningClosureBrief?.blockedCredentialCount ?? provisioningPlan.summary?.blockedCredentialCount ?? 0}`,
    `- readySecretEnvVariableCount: ${provisioningPlan.provisioningClosureBrief?.readySecretEnvVariableCount ?? provisioningPlan.summary?.readySecretEnvVariableCount ?? 0}`,
    `- resourceEvidenceReady: ${provisioningPlan.provisioningClosureBrief?.resourceEvidenceReady || provisioningPlan.summary?.resourceEvidenceReady || "unknown"}`,
    `- blockedResourceEvidenceIds: ${provisioningPlan.provisioningClosureBrief?.blockedResourceEvidenceIds?.length ? provisioningPlan.provisioningClosureBrief.blockedResourceEvidenceIds.join(", ") : provisioningPlan.summary?.blockedResourceEvidenceIds?.length ? provisioningPlan.summary.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- partiallyObservedResourceEvidenceIds: ${provisioningPlan.provisioningClosureBrief?.partiallyObservedResourceEvidenceIds?.length ? provisioningPlan.provisioningClosureBrief.partiallyObservedResourceEvidenceIds.join(", ") : provisioningPlan.summary?.partiallyObservedResourceEvidenceIds?.length ? provisioningPlan.summary.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
    `- readyToStartPhases: ${provisioningPlan.summary.readyToStartPhases.length ? provisioningPlan.summary.readyToStartPhases.join(", ") : "none"}`,
    `- blockedPhases: ${provisioningPlan.summary.blockedPhases.length ? provisioningPlan.summary.blockedPhases.join(", ") : "none"}`,
    `- readyAuthorizationPackets: ${provisioningPlan.readyAuthorizationPackets?.length ? provisioningPlan.readyAuthorizationPackets.map((item) => item.packetId).join(", ") : "none"}`,
    `- readyActionPackets: ${provisioningPlan.readyActionPackets?.length ? provisioningPlan.readyActionPackets.map((item) => item.taskId).join(", ") : "none"}`,
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
    `- authorizationClosureBrief: ${actionAuthorization.authorizationClosureBrief ? "present" : "missing"}`,
    `- blockedCredentialCount: ${actionAuthorization.authorizationClosureBrief?.blockedCredentialCount ?? actionAuthorization.summary?.blockedCredentialCount ?? 0}`,
    `- readySecretEnvVariableCount: ${actionAuthorization.authorizationClosureBrief?.readySecretEnvVariableCount ?? actionAuthorization.summary?.readySecretEnvVariableCount ?? 0}`,
    `- resourceEvidenceReady: ${actionAuthorization.authorizationClosureBrief?.resourceEvidenceReady || actionAuthorization.summary?.resourceEvidenceReady || "unknown"}`,
    `- blockedResourceEvidenceIds: ${actionAuthorization.authorizationClosureBrief?.blockedResourceEvidenceIds?.length ? actionAuthorization.authorizationClosureBrief.blockedResourceEvidenceIds.join(", ") : actionAuthorization.summary?.blockedResourceEvidenceIds?.length ? actionAuthorization.summary.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- partiallyObservedResourceEvidenceIds: ${actionAuthorization.authorizationClosureBrief?.partiallyObservedResourceEvidenceIds?.length ? actionAuthorization.authorizationClosureBrief.partiallyObservedResourceEvidenceIds.join(", ") : actionAuthorization.summary?.partiallyObservedResourceEvidenceIds?.length ? actionAuthorization.summary.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
    `- canCodexProceedWithoutUser: ${actionAuthorization.summary.canCodexProceedWithoutUser.length ? actionAuthorization.summary.canCodexProceedWithoutUser.join(", ") : "none"}`,
    `- authorizationPackets: ${actionAuthorization.summary.authorizationPackets || 0}`,
    `- authorizationPacketIds: ${(actionAuthorization.authorizationPackets || []).map((item) => item.packetId).join(", ") || "none"}`,
    `- canStartNowPackets: ${(actionAuthorization.summary.canStartNowPackets || []).join(", ") || "none"}`,
    `- nextActionTimeConfirmations: ${(actionAuthorization.summary.nextActionTimeConfirmations || []).join(", ") || "none"}`,
    `- actionTimeConfirmationRequired: ${actionAuthorization.summary.actionTimeConfirmationRequired.join(", ")}`,
    ...(actionAuthorization.nextActionTimeConfirmations?.length
      ? actionAuthorization.nextActionTimeConfirmations.map((item) => `- ${item.packetId}: ${item.minimumUserPhrase}`)
      : ["- nextActionTimeConfirmations: none"]),
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
    `- nextActionTimeConfirmations: ${completionAudit.summary.nextActionTimeConfirmations.length ? completionAudit.summary.nextActionTimeConfirmations.map((item) => item.packetId).join(", ") : "none"}`,
    ...(completionAudit.summary.nextActionTimeConfirmations?.length
      ? completionAudit.summary.nextActionTimeConfirmations.map((item) => `- ${item.packetId}: ${item.minimumUserPhrase}`)
      : ["- nextActionTimeConfirmations: none"]),
    ...(completionAudit.requirements?.length
      ? completionAudit.requirements.map((item) => `- ${item.id}: ${item.status}${item.blockers?.length ? ` (${item.blockers.join(", ")})` : ""}`)
      : ["- none"]),
    "",
    "## RDS/PostgreSQL 迁移库存",
    "",
    `- json: ${audit.outputFiles.rdsMigrationPlanJson}`,
    `- markdown: ${audit.outputFiles.rdsMigrationPlanMarkdown}`,
    `- ok: ${rdsMigrationPlan.ok === true}`,
    `- containsValues: ${rdsMigrationPlan.containsValues === true}`,
    `- secretLeakCheck: ${rdsMigrationPlan.secretLeakCheck?.ok === true}`,
    `- currentDataLayer: ${rdsMigrationPlan.currentDataLayer}`,
    `- formalTarget: ${rdsMigrationPlan.formalTarget}`,
    `- migrationReady: ${rdsMigrationPlan.migrationReady === true}`,
    `- appApiRoutesWithSupabase: ${rdsMigrationPlan.summary.appApiRoutesWithSupabase}/${rdsMigrationPlan.summary.appApiRouteCount}`,
    `- appApiRoutesWithSupabaseDataAccess: ${rdsMigrationPlan.summary.appApiRoutesWithSupabaseDataAccess}/${rdsMigrationPlan.summary.appApiRouteCount}`,
    `- firstVersionRdsRoutesWithSupabaseDataAccess: ${rdsMigrationPlan.summary.firstVersionRdsRoutesWithSupabaseDataAccess}/${rdsMigrationPlan.summary.firstVersionRdsRouteCount}`,
    `- deferredAppApiRoutesWithSupabaseDataAccess: ${rdsMigrationPlan.summary.deferredAppApiRoutesWithSupabaseDataAccess}/${rdsMigrationPlan.summary.deferredAppApiRouteCount}`,
    `- appApiRoutesWithDirectSupabase: ${rdsMigrationPlan.summary.appApiRoutesWithDirectSupabase}`,
    `- sharedSupabaseFileCount: ${rdsMigrationPlan.summary.sharedSupabaseFileCount}`,
    `- tableCount: ${rdsMigrationPlan.summary.tableCount}`,
    `- rpcCount: ${rdsMigrationPlan.summary.rpcCount}`,
    `- storageBucketCount: ${rdsMigrationPlan.summary.storageBucketCount}`,
    `- databaseUrlCnReferencedInSource: ${rdsMigrationPlan.summary.databaseUrlCnReferencedInSource === true}`,
    `- postgresDataAccessAdapterDetected: ${rdsMigrationPlan.summary.postgresDataAccessAdapterDetected === true}`,
    `- requiredBlocking: ${rdsMigrationPlan.summary.requiredBlocking.join(", ")}`,
    ...(rdsMigrationPlan.migrationPhases?.length
      ? rdsMigrationPlan.migrationPhases.map((item) => `- ${item.id}: canStartNow=${item.canStartNow}`)
      : ["- phases: none"]),
    "",
    "## RDS/PostgreSQL 路由迁移图",
    "",
    `- json: ${audit.outputFiles.rdsRouteMigrationMapJson}`,
    `- markdown: ${audit.outputFiles.rdsRouteMigrationMapMarkdown}`,
    `- ok: ${rdsRouteMigrationMap.ok === true}`,
    `- containsValues: ${rdsRouteMigrationMap.containsValues === true}`,
    `- secretLeakCheck: ${rdsRouteMigrationMap.secretLeakCheck?.ok === true}`,
    `- firstVersionRouteCount: ${rdsRouteMigrationMap.summary.firstVersionRouteCount}`,
    `- routesStillUsingSupabaseDataAccess: ${rdsRouteMigrationMap.summary.routesStillUsingSupabaseDataAccess}`,
    `- observedTables: ${rdsRouteMigrationMap.summary.observedTableCount}/${rdsRouteMigrationMap.summary.requiredTableCount}`,
    `- observedRpcs: ${rdsRouteMigrationMap.summary.observedRpcCount}/${rdsRouteMigrationMap.summary.requiredFunctionCount}`,
    `- schemaMapMissingObservedTables: ${rdsRouteMigrationMap.summary.schemaMapMissingObservedTables.join(", ") || "none"}`,
    `- schemaMapMissingObservedRpcs: ${rdsRouteMigrationMap.summary.schemaMapMissingObservedRpcs.join(", ") || "none"}`,
    `- sharedDataAccessFileCount: ${rdsRouteMigrationMap.summary.sharedDataAccessFileCount}`,
    `- blockedCredentialNames: ${rdsRouteMigrationMap.summary.blockedCredentialNames.join(", ") || "none"}`,
    ...(rdsRouteMigrationMap.routeGroups?.length
      ? rdsRouteMigrationMap.routeGroups.map((item) => `- ${item.scope}: routes=${item.routeCount}; tables=${item.tableNames.join(", ") || "none"}`)
      : ["- routeGroups: none"]),
    "",
    "## RDS/PostgreSQL 迁移包",
    "",
    `- dir: ${audit.outputFiles.rdsMigrationPackageDir}`,
    `- json: ${audit.outputFiles.rdsMigrationPackageJson}`,
    `- markdown: ${audit.outputFiles.rdsMigrationPackageMarkdown}`,
    `- schemaSql: ${audit.outputFiles.rdsMigrationPackageSchemaSql}`,
    `- validationSql: ${audit.outputFiles.rdsMigrationPackageValidationSql}`,
    `- rollbackChecklist: ${audit.outputFiles.rdsMigrationPackageRollbackChecklist}`,
    `- ok: ${rdsMigrationPackage.ok === true}`,
    `- containsValues: ${rdsMigrationPackage.containsValues === true}`,
    `- sourceFileCount: ${rdsMigrationPackage.summary.sourceFileCount}`,
    `- requiredTableCount: ${rdsMigrationPackage.summary.requiredTableCount}`,
    `- requiredFunctionCount: ${rdsMigrationPackage.summary.requiredFunctionCount}`,
    `- requiredStorageCount: ${rdsMigrationPackage.summary.requiredStorageCount}`,
    `- schemaSqlSha256: ${rdsMigrationPackage.summary.schemaSqlSha256}`,
    `- compatibilityReviewRequired: ${rdsMigrationPackage.summary.compatibilityReviewRequired === true}`,
    `- compatibilityFindingCount: ${rdsMigrationPackage.summary.compatibilityFindingCount ?? 0}`,
    `- compatibilityAffectedSourceFileCount: ${rdsMigrationPackage.summary.compatibilityAffectedSourceFileCount ?? 0}`,
    `- compatibilityCategories: ${(rdsMigrationPackage.compatibilityReview?.categories || []).join(", ") || "none"}`,
    `- blockers: ${rdsMigrationPackage.blockers?.length ? rdsMigrationPackage.blockers.join(", ") : "none"}`,
    `- warnings: ${rdsMigrationPackage.warnings?.length ? rdsMigrationPackage.warnings.join(", ") : "none"}`,
    "",
    "## RDS/PostgreSQL 迁移证据",
    "",
    `- json: ${audit.outputFiles.rdsMigrationEvidenceJson}`,
    `- markdown: ${audit.outputFiles.rdsMigrationEvidenceMarkdown}`,
    `- ok: ${rdsMigrationEvidence.ok === true}`,
    `- containsValues: ${rdsMigrationEvidence.containsValues === true}`,
    `- secretLeakCheck: ${rdsMigrationEvidence.secretLeakCheck?.ok === true}`,
    `- templateReady: ${rdsMigrationEvidence.summary.templateReady === true}`,
    `- localExists: ${rdsMigrationEvidence.summary.localExists === true}`,
    `- localReady: ${rdsMigrationEvidence.summary.localReady === true}`,
    `- migrationReady: ${rdsMigrationEvidence.summary.migrationReady === true}`,
    `- appApiRoutesWithSupabase: ${rdsMigrationEvidence.summary.appApiRoutesWithSupabase}/${rdsMigrationEvidence.summary.appApiRouteCount}`,
    `- appApiRoutesWithSupabaseDataAccess: ${rdsMigrationEvidence.summary.appApiRoutesWithSupabaseDataAccess}/${rdsMigrationEvidence.summary.appApiRouteCount}`,
    `- firstVersionRdsRoutesWithSupabaseDataAccess: ${rdsMigrationEvidence.summary.firstVersionRdsRoutesWithSupabaseDataAccess}/${rdsMigrationEvidence.summary.firstVersionRdsRouteCount}`,
    `- deferredAppApiRoutesWithSupabaseDataAccess: ${rdsMigrationEvidence.summary.deferredAppApiRoutesWithSupabaseDataAccess}/${rdsMigrationEvidence.summary.deferredAppApiRouteCount}`,
    `- postgresDataAccessAdapterDetected: ${rdsMigrationEvidence.summary.postgresDataAccessAdapterDetected === true}`,
    `- writebackBlockingGroups: ${rdsMigrationEvidence.summary.writebackBlockingGroups.join(", ") || "none"}`,
    `- requiredAuthorizationPackets: ${rdsMigrationEvidence.summary.requiredAuthorizationPackets.join(", ") || "none"}`,
    ...(rdsMigrationEvidence.local?.blockers?.length
      ? rdsMigrationEvidence.local.blockers.map((item) => `- ${item}`)
      : ["- localBlockers: none"]),
    "",
    "## backend-cn 专用状态",
    "",
    `- json: ${audit.outputFiles.backendCnStatusJson}`,
    `- markdown: ${audit.outputFiles.backendCnStatusMarkdown}`,
    `- currentScope: ${backendCnStatus.currentScope}`,
    `- fullAppLaunchScope: ${backendCnStatus.fullAppLaunchScope}`,
    `- canProceedWithoutWechat: ${backendCnStatus.canProceedWithoutWechat === true}`,
    `- canDeployBackendNow: ${backendCnStatus.canDeployBackendNow === true}`,
    `- backendTargetReady: ${backendCnStatus.summary.backendTargetReady}`,
    `- backendRequiredBlocking: ${backendCnStatus.summary.backendRequiredBlocking.join(", ") || "none"}`,
    `- wechatDeferredBlocking: ${backendCnStatus.summary.wechatDeferredBlocking.join(", ") || "none"}`,
    `- cloudInventoryStrictReady: ${backendCnStatus.summary.cloudInventoryStrictReady === true}`,
    `- cloudResourceEvidenceReady: ${backendCnStatus.summary.cloudResourceEvidenceReady || "unknown"}`,
    `- rdsMigrationReady: ${backendCnStatus.summary.rdsMigrationReady === true}`,
    `- imagePublishReady: ${backendCnStatus.summary.imagePublishReady === true}`,
    ...(backendCnStatus.backendTargets?.length
      ? backendCnStatus.backendTargets.map((item) => `- ${item.id}: ready=${item.ready === true}; blockers=${item.blockers?.length ? item.blockers.join(", ") : "none"}`)
      : ["- backendTargets: none"]),
    "",
    "## backend-cn 执行包",
    "",
    `- json: ${audit.outputFiles.backendApplyPackageJson}`,
    `- markdown: ${audit.outputFiles.backendApplyPackageMarkdown}`,
    `- packageId: ${backendApplyPackage.packageId}`,
    `- currentScope: ${backendApplyPackage.currentScope}`,
    `- canApplyBackendNowWithoutUserIntervention: ${backendApplyPackage.canApplyBackendNowWithoutUserIntervention === true}`,
    `- immediateBackendSteps: ${backendApplyPackage.summary.immediateBackendSteps.join(", ") || "none"}`,
    `- blockedBackendSteps: ${backendApplyPackage.summary.blockedBackendSteps.join(", ") || "none"}`,
    `- userInterventionRequired: ${backendApplyPackage.summary.userInterventionRequired.join(", ") || "none"}`,
    `- blockedCredentialCount: ${backendApplyPackage.summary.blockedCredentialCount || 0}`,
    `- readySecretEnvVariableCount: ${backendApplyPackage.summary.readySecretEnvVariableCount || 0}`,
    `- missingCredentialValues: ${backendApplyPackage.credentialPasswordIntervention?.missingCredentialValues?.names?.join(", ") || "none"}`,
    `- readySecretsPendingCloudImport: ${backendApplyPackage.credentialPasswordIntervention?.readySecretsPendingCloudImport?.count ?? 0}`,
    `- paidPurchaseConfirmationActionIds: ${backendApplyPackage.credentialPasswordIntervention?.paidPurchaseConfirmationActionIds?.join(", ") || "none"}`,
    `- controlledSecretChannelActionIds: ${backendApplyPackage.credentialPasswordIntervention?.controlledSecretChannelActionIds?.join(", ") || "none"}`,
    `- actionTimeAuthorizationRequest.required: ${backendApplyPackage.actionTimeAuthorizationRequest?.required === true}`,
    `- actionTimeAuthorizationRequest.packetIds: ${backendApplyPackage.actionTimeAuthorizationRequest?.packetIds?.join(", ") || "none"}`,
    `- actionTimeAuthorizationRequest.recommendedUserReply: ${backendApplyPackage.actionTimeAuthorizationRequest?.recommendedUserReply || "none"}`,
    ...(backendApplyPackage.applySteps?.length
      ? backendApplyPackage.applySteps.map((item) => `- ${item.id}: canStart=${item.canStartAfterActionTimeConfirmation === true}; mutationType=${item.mutationType}; blockers=${item.currentBlockers?.length ? item.currentBlockers.join(", ") : "none"}`)
      : ["- applySteps: none"]),
    "",
    "## 当前阻塞简报",
    "",
    `- json: ${audit.outputFiles.blockerBriefJson}`,
    `- markdown: ${audit.outputFiles.blockerBriefMarkdown}`,
    `- ok: ${blockerBrief.ok === true}`,
    `- verdict: ${blockerBrief.verdict}`,
    `- canDeployNow: ${blockerBrief.canDeployNow === true}`,
    `- containsValues: ${blockerBrief.containsValues === true}`,
    `- mutationPerformed: ${blockerBrief.mutationPerformed === true}`,
    `- requiredEnv: ${blockerBrief.summary.requiredEnv}`,
    `- requiredBlocking: ${blockerBrief.summary.requiredBlocking.join(", ") || "none"}`,
    `- localCodeReady: ${blockerBrief.summary.localCodeReady === true}`,
    `- releaseEvidenceUsable: ${blockerBrief.summary.releaseEvidenceUsable === true}`,
    `- machineBlocking: ${blockerBrief.summary.machineBlocking?.length ? blockerBrief.summary.machineBlocking.join(", ") : "none"}`,
    `- manualBlockingCount: ${blockerBrief.summary.manualBlockingCount || 0}`,
    `- bridgeDataLayerCurrent: ${blockerBrief.summary.bridgeDataLayerCurrent || "unknown"}`,
    `- bridgeDataLayerTarget: ${blockerBrief.summary.bridgeDataLayerTarget || "unknown"}`,
    `- bridgeDataLayerStatus: ${blockerBrief.summary.bridgeDataLayerStatus || "unknown"}`,
    `- rdsMigrationIncludedInThisRelease: ${blockerBrief.summary.rdsMigrationIncludedInThisRelease === true}`,
    `- rdsMigrationRequiredForFinalProductionCn: ${blockerBrief.summary.rdsMigrationRequiredForFinalProductionCn === true}`,
    `- cloudResourceEvidenceReady: ${blockerBrief.summary.cloudResourceEvidenceReady || "unknown"}`,
    `- cloudResourceObserved: ready ${blockerBrief.summary.cloudResourceObservedReady || 0}/${blockerBrief.summary.cloudResourceObservedTotal || 0}, partial ${blockerBrief.summary.cloudResourceObservedPartial || 0}, blocked ${blockerBrief.summary.cloudResourceObservedBlocked || 0}`,
    `- cloudResourceBlockedIds: ${blockerBrief.summary.cloudResourceBlockedIds?.length ? blockerBrief.summary.cloudResourceBlockedIds.join(", ") : "none"}`,
    `- cloudResourceObservedPartialIds: ${blockerBrief.summary.cloudResourceObservedPartialIds?.length ? blockerBrief.summary.cloudResourceObservedPartialIds.join(", ") : "none"}`,
    `- cloudResourceObservedBlockedIds: ${blockerBrief.summary.cloudResourceObservedBlockedIds?.length ? blockerBrief.summary.cloudResourceObservedBlockedIds.join(", ") : "none"}`,
    `- cloudResourceActionTimeConfirmations: ${blockerBrief.summary.cloudResourceActionTimeConfirmations?.length ? blockerBrief.summary.cloudResourceActionTimeConfirmations.join(", ") : "none"}`,
    `- canStartNowConsoleTasks: ${blockerBrief.summary.canStartNowConsoleTasks?.length ? blockerBrief.summary.canStartNowConsoleTasks.join(", ") : "none"}`,
    `- canStartNowWritebackTaskCount: ${blockerBrief.summary.canStartNowWritebackTaskCount || 0}`,
    `- blockedByConsoleTaskDependencies: ${blockerBrief.summary.blockedByConsoleTaskDependencies?.length ? blockerBrief.summary.blockedByConsoleTaskDependencies.join(", ") : "none"}`,
    `- canStartNowAuthorizationPackets: ${blockerBrief.summary.canStartNowAuthorizationPackets?.length ? blockerBrief.summary.canStartNowAuthorizationPackets.join(", ") : "none"}`,
    `- blockedByAuthorizationPacketDependencies: ${blockerBrief.summary.blockedByAuthorizationPacketDependencies?.length ? blockerBrief.summary.blockedByAuthorizationPacketDependencies.join(", ") : "none"}`,
    `- cloudConfirmationsReady: ${blockerBrief.summary.cloudConfirmationsReady}`,
    `- sensitiveBlocked: ${blockerBrief.summary.sensitiveBlocked}`,
    `- blockedVariableAcquisitionCount: ${blockerBrief.summary.blockedVariableAcquisitionCount || 0}`,
    `- readySecretEnvImportGroupCount: ${blockerBrief.summary.readySecretEnvImportGroupCount || 0}`,
    `- immediateAuthorizationPackets: ${blockerBrief.summary.immediateAuthorizationPackets.join(", ") || "none"}`,
    `- cloudInventoryStrictReady: ${blockerBrief.summary.cloudInventoryStrictReady}`,
    `- cloudInventoryInterpretation: ${blockerBrief.summary.cloudInventoryInterpretation || "unknown"}`,
    `- strictInventoryEvidenceReady: ${blockerBrief.cloudInventoryReadinessInterpretation?.strictInventoryEvidenceReady === true}`,
    `- freshCloudReadAvailableNow: ${blockerBrief.cloudInventoryReadinessInterpretation?.freshCloudReadAvailableNow === true}`,
    `- notACloudResourceReadyProof: ${blockerBrief.cloudInventoryReadinessInterpretation?.notACloudResourceReadyProof === true}`,
    `- nextEvidenceAction: ${blockerBrief.cloudInventoryReadinessInterpretation?.nextEvidenceAction || "unknown"}`,
    `- canReadCloudNow: ${blockerBrief.summary.canReadCloudNow}`,
    `- cliConfigProbeFailureCategory: ${blockerBrief.summary.cliConfigProbeFailureCategory || "none"}`,
    `- currentBrowserCanUseCurrentConsole: ${blockerBrief.summary.currentBrowserCanUseCurrentConsole === true}`,
    `- currentBrowserAliyunConsoleTabCount: ${blockerBrief.summary.currentBrowserAliyunConsoleTabCount || 0}`,
    `- wechatOpenAccountVerified: ${blockerBrief.summary.wechatOpenAccountVerified === true}`,
    `- wechatOpenMobileAppCreated: ${blockerBrief.summary.wechatOpenMobileAppCreated === true}`,
    `- wechatOpenCanCreateDraft: ${blockerBrief.summary.wechatOpenCanCreateDraft === true}`,
    `- wechatOpenReadyToSubmitForReview: ${blockerBrief.summary.wechatOpenReadyToSubmitForReview === true}`,
    `- envSourceVercelRequiredCovered: ${blockerBrief.summary.envSourceVercelRequiredCovered || "unknown"}`,
    `- envSourceCanMigrateFromVercelProduction: ${blockerBrief.summary.envSourceCanMigrateFromVercelProduction || 0}`,
    `- envSourceAppAliyunOwnedNotInVercel: ${blockerBrief.summary.envSourceAppAliyunOwnedNotInVercel || 0}`,
    `- envSourceBlockedExternalRequired: ${blockerBrief.summary.envSourceBlockedExternalRequired?.length ? blockerBrief.summary.envSourceBlockedExternalRequired.join(", ") : "none"}`,
    `- envSourceReadyLocalButMissingFromVercel: ${blockerBrief.summary.envSourceReadyLocalButMissingFromVercel?.length ? blockerBrief.summary.envSourceReadyLocalButMissingFromVercel.join(", ") : "none"}`,
    `- envSourceSecretOrSensitiveToImport: ${blockerBrief.summary.envSourceSecretOrSensitiveToImport || 0}`,
    ...(blockerBrief.wechatOpenMobileApp
      ? [
        `- wechatOpenReviewStatus: ${blockerBrief.wechatOpenMobileApp.reviewStatus || "unknown"}`,
        `- wechatOpenSubmissionBlockers: ${blockerBrief.wechatOpenMobileApp.submissionBlockers?.length ? blockerBrief.wechatOpenMobileApp.submissionBlockers.join(", ") : "none"}`,
        `- wechatOpenAndroidPackageName: ${blockerBrief.wechatOpenMobileApp.androidPackageName || "unknown"}`,
        `- wechatOpenAndroidSignatureStatus: ${blockerBrief.wechatOpenMobileApp.androidSignatureStatus || "unknown"}`,
        `- wechatOpenAppleTeamIdMissing: ${blockerBrief.wechatOpenMobileApp.appleTeamIdMissing === true}`,
      ]
      : []),
    ...(blockerBrief.cloudResourceObservations
      ? [
        `- cloudResourceObservedReady: ${blockerBrief.cloudResourceObservations.observedStatuses?.ready || 0}/${blockerBrief.cloudResourceObservations.observedStatuses?.total || 0}`,
        `- cloudResourceObservedPartial: ${blockerBrief.cloudResourceObservations.observedStatuses?.partial || 0}`,
        `- cloudResourceObservedBlocked: ${blockerBrief.cloudResourceObservations.observedStatuses?.blocked || 0}`,
        ...(blockerBrief.cloudResourceObservations.items || []).map((item) => `- ${item.id}: observed=${item.observedStatus}; readiness=${item.observedReadiness}; ready=${item.ready === true}; actionTimeConfirmation=${item.requiresActionTimeConfirmation === true}`),
      ]
      : []),
    ...(blockerBrief.canStartNowWritebackPlan?.length
      ? blockerBrief.canStartNowWritebackPlan.map((item) => `- writeback ${item.id}: targets=${(item.writeTargets || []).join("; ") || "none"}; acceptance=${(item.acceptanceEvidence || []).join("; ") || "none"}`)
      : ["- canStartNowWritebackPlan: none"]),
    ...(blockerBrief.immediateAuthorizationPackets?.length
      ? blockerBrief.immediateAuthorizationPackets.map((item) => `- ${item.packetId}: ${item.minimumUserPhrase}`)
      : ["- immediateAuthorizationPackets: none"]),
    ...(blockerBrief.requiredEnvBlockers?.length
      ? blockerBrief.requiredEnvBlockers.map((item) => (
        `- ${item.name}: ${item.status}; obtainFrom=${item.obtainFrom || item.consolePath || "unknown"}; importTarget=${item.importTarget}; valueHandling=${item.valueHandling || "unknown"}`
      ))
      : ["- requiredEnvBlockers: none"]),
    ...(blockerBrief.blockedVariableAcquisitionPlan?.length
      ? blockerBrief.blockedVariableAcquisitionPlan.map((item) => `- ${item.name}: packets=${(item.requiredAuthorizationPackets || []).join(", ") || "none"}; obtainFrom=${item.obtainFrom}; importTarget=${item.importTarget}`)
      : ["- blockedVariableAcquisitionPlan: none"]),
    ...(blockerBrief.readySecretEnvImportGroups?.length
      ? blockerBrief.readySecretEnvImportGroups.map((group) => `- ${group.category}: count=${group.count}; target=${group.importTarget}`)
      : ["- readySecretEnvImportGroups: none"]),
    "",
    "## 本地证据回填清单",
    "",
    `- json: ${audit.outputFiles.evidenceWritebackJson}`,
    `- markdown: ${audit.outputFiles.evidenceWritebackMarkdown}`,
    `- ok: ${evidenceWriteback.ok === true}`,
    `- executionMode: ${evidenceWriteback.executionMode}`,
    `- containsValues: ${evidenceWriteback.containsValues === true}`,
    `- mutationPerformed: ${evidenceWriteback.mutationPerformed === true}`,
    `- cloudApiCalled: ${evidenceWriteback.cloudApiCalled === true}`,
    `- readyFiles: ${evidenceWriteback.summary.readyFiles} / ${evidenceWriteback.summary.files}`,
    `- totalGaps: ${evidenceWriteback.summary.totalGaps}`,
    `- rdsMigrationGaps: ${evidenceWriteback.summary.rdsMigrationGaps}`,
    `- cloudInventoryResultGaps: ${evidenceWriteback.summary.cloudInventoryResultGaps}`,
    `- cloudConfirmationGaps: ${evidenceWriteback.summary.cloudConfirmationGaps}`,
    `- imagePublishGaps: ${evidenceWriteback.summary.imagePublishGaps}`,
    `- evidenceClosureBrief: ${evidenceWriteback.evidenceClosureBrief?.conclusion || "none"}`,
    `- evidenceWritebackReady: ${evidenceWriteback.evidenceClosureBrief?.evidenceWritebackReady || `${evidenceWriteback.summary.readyFiles}/${evidenceWriteback.summary.files}`}`,
    `- blockedCredentialCount: ${evidenceWriteback.evidenceClosureBrief?.blockedCredentialCount ?? evidenceWriteback.summary.blockedCredentialCount ?? 0}`,
    `- readySecretEnvVariableCount: ${evidenceWriteback.evidenceClosureBrief?.readySecretEnvVariableCount ?? evidenceWriteback.summary.readySecretEnvVariableCount ?? 0}`,
    `- resourceEvidenceReady: ${evidenceWriteback.evidenceClosureBrief?.resourceEvidenceReady || evidenceWriteback.summary.resourceEvidenceReady || "unknown"}`,
    `- blockedResourceEvidenceIds: ${evidenceWriteback.evidenceClosureBrief?.blockedResourceEvidenceIds?.length ? evidenceWriteback.evidenceClosureBrief.blockedResourceEvidenceIds.join(", ") : evidenceWriteback.summary.blockedResourceEvidenceIds?.length ? evidenceWriteback.summary.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- partiallyObservedResourceEvidenceIds: ${evidenceWriteback.evidenceClosureBrief?.partiallyObservedResourceEvidenceIds?.length ? evidenceWriteback.evidenceClosureBrief.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
    `- strictVerifyCommands: ${evidenceWriteback.summary.strictVerifyCommands.join("; ")}`,
    ...(Object.values(evidenceWriteback.writebackGroups || {}).length
      ? Object.values(evidenceWriteback.writebackGroups).map((group) => `- ${group.key}: ready=${group.ready}, blockers=${group.totalBlockers}, file=${group.file}`)
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
    `- appLoginCredentialSource: ${wechatOpenMobileAppPackage.credentialBoundary?.appLoginCredentialSource || "unknown"}`,
    `- miniProgramCredentialsReusableForAppLogin: ${wechatOpenMobileAppPackage.credentialBoundary?.miniProgramCredentialsReusableForAppLogin === true}`,
    `- miniProgramCompatVariableNames: ${wechatOpenMobileAppPackage.credentialBoundary?.miniProgramCompatVariableNames?.length ? wechatOpenMobileAppPackage.credentialBoundary.miniProgramCompatVariableNames.join(", ") : "none"}`,
    `- actionPacket: ${wechatOpenMobileAppPackage.actionPacket?.packetId || "none"}`,
    `- submissionBlockers: ${wechatOpenMobileAppPackage.summary?.submissionBlockers?.length ? wechatOpenMobileAppPackage.summary.submissionBlockers.join(", ") : "none"}`,
    `- androidPackageName: ${wechatOpenMobileAppPackage.mobileAppCreationPackage?.android?.packageName || "unknown"}`,
    `- androidSignatureStatus: ${wechatOpenMobileAppPackage.mobileAppCreationPackage?.androidSignaturePackage?.status || "unknown"}`,
    `- androidReleaseArtifactReady: ${wechatOpenMobileAppPackage.mobileAppCreationPackage?.androidSignaturePackage?.releaseArtifactReady === true}`,
    `- androidWechatSignatureRecorded: ${wechatOpenMobileAppPackage.mobileAppCreationPackage?.androidSignaturePackage?.wechatSignatureRecorded === true}`,
    `- iosBundleId: ${wechatOpenMobileAppPackage.mobileAppCreationPackage?.ios?.bundleId || "unknown"}`,
    "",
    "## Android Release Signing 动作确认包",
    "",
    `- json: ${audit.outputFiles.androidReleaseSigningPackageJson}`,
    `- markdown: ${audit.outputFiles.androidReleaseSigningPackageMarkdown}`,
    `- ok: ${androidReleaseSigningPackage.ok === true}`,
    `- containsValues: ${androidReleaseSigningPackage.containsValues === true}`,
    `- mutationPerformed: ${androidReleaseSigningPackage.mutationPerformed === true}`,
    `- canStartNow: ${androidReleaseSigningPackage.summary?.canStartNow === true}`,
    `- readyForWechatAndroidSignature: ${androidReleaseSigningPackage.summary?.readyForWechatAndroidSignature === true}`,
    `- androidPackageName: ${androidReleaseSigningPackage.summary?.androidPackageName || "unknown"}`,
    `- releaseSigningConfig: ${androidReleaseSigningPackage.summary?.releaseSigningConfig || "unknown"}`,
    `- releaseSigningConfigReady: ${androidReleaseSigningPackage.summary?.releaseSigningConfigReady === true}`,
    `- releaseUsesDebugSigning: ${androidReleaseSigningPackage.summary?.releaseUsesDebugSigning === true}`,
    `- releaseArtifactReady: ${androidReleaseSigningPackage.summary?.releaseArtifactReady === true}`,
    `- wechatSignatureRecorded: ${androidReleaseSigningPackage.summary?.wechatSignatureRecorded === true}`,
    `- androidConfigured: ${androidReleaseSigningPackage.summary?.androidConfigured === true}`,
    `- currentBlockers: ${androidReleaseSigningPackage.currentBlockers?.length ? androidReleaseSigningPackage.currentBlockers.join(", ") : "none"}`,
    `- actionPacket: ${androidReleaseSigningPackage.actionPacket?.packetId || "none"}`,
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
    `- actionTimeAuthorizationRequest.required: ${operatorHandoff.actionTimeAuthorizationRequest?.required === true}`,
    `- actionTimeAuthorizationRequest.packetIds: ${operatorHandoff.actionTimeAuthorizationRequest?.packetIds?.join(", ") || "none"}`,
    `- actionTimeAuthorizationRequest.recommendedUserReply: ${operatorHandoff.actionTimeAuthorizationRequest?.recommendedUserReply || "none"}`,
    `- blockingRequiredEnv: ${operatorHandoff.missingVariables.required.length ? operatorHandoff.missingVariables.required.map((item) => item.name).join(", ") : "none"}`,
    `- appLaunchBlockingVariables: ${operatorHandoff.appLaunchBlocking.variables.length ? operatorHandoff.appLaunchBlocking.variables.map((item) => item.name).join(", ") : "none"}`,
    `- appLaunchBlockingStates: ${operatorHandoff.appLaunchBlocking.states.length ? operatorHandoff.appLaunchBlocking.states.map((item) => `${item.name}:${item.status}`).join(", ") : "none"}`,
    `- optionalDeferredEnv: ${operatorHandoff.missingVariables.optionalDeferred.length}`,
    `- sensitiveActionItems: ${operatorHandoff.sensitiveActionItems?.length || 0}`,
    `- blockedCredentialCount: ${operatorHandoff.operatorClosureBrief?.blockedCredentialCount ?? 0}`,
    `- readySecretEnvVariableCount: ${operatorHandoff.operatorClosureBrief?.readySecretEnvVariableCount ?? 0}`,
    `- resourceEvidenceReady: ${operatorHandoff.operatorClosureBrief?.resourceEvidenceReady || "unknown"}`,
    `- blockedResourceEvidenceIds: ${operatorHandoff.operatorClosureBrief?.blockedResourceEvidenceIds?.length ? operatorHandoff.operatorClosureBrief.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- localEvidenceGaps: cloudInventoryResults=${operatorHandoff.localEvidenceGaps?.cloudInventoryResults?.totalBlockers ?? 0}; cloudConfirmations=${operatorHandoff.localEvidenceGaps?.cloudConfirmations?.totalBlockers ?? 0}; rdsMigration=${operatorHandoff.localEvidenceGaps?.rdsMigration?.totalBlockers ?? 0}; imagePublish=${operatorHandoff.localEvidenceGaps?.imagePublish?.totalBlockers ?? 0}`,
    `- canStartNowConsoleTasks: ${operatorHandoff.aliyunConsoleTaskOrder?.canStartNow?.length ? operatorHandoff.aliyunConsoleTaskOrder.canStartNow.join(", ") : "none"}`,
    `- blockedByConsoleTaskDependencies: ${operatorHandoff.aliyunConsoleTaskOrder?.blockedByDependencies?.length ? operatorHandoff.aliyunConsoleTaskOrder.blockedByDependencies.join(", ") : "none"}`,
    `- cloudInventoryConsoleOnly: safe ${operatorHandoffCloudInventoryObservation.safeConsoleOnly === true}, console observations ${operatorHandoffCloudInventoryObservation.consoleObservationOperations || 0}/${operatorHandoffCloudInventoryObservation.operations || 0}, executed commands ${operatorHandoffCloudInventoryObservation.executedCommandResults || 0}/${operatorHandoffCloudInventoryObservation.commandResults || 0}, cloud API calls ${operatorHandoffCloudInventoryObservation.cloudApiCalledCommandResults || 0}`,
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
    `- cloudInventoryConsoleOnly: safe ${productionCloudInventoryObservation.safeConsoleOnly === true}, console observations ${productionCloudInventoryObservation.consoleObservationOperations || 0}/${productionCloudInventoryObservation.operations || 0}, executed commands ${productionCloudInventoryObservation.executedCommandResults || 0}/${productionCloudInventoryObservation.commandResults || 0}, cloud API calls ${productionCloudInventoryObservation.cloudApiCalledCommandResults || 0}`,
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
    "## Vercel 到阿里云环境变量来源映射",
    "",
    `- json: ${audit.outputFiles.envSourceMapJson}`,
    `- markdown: ${audit.outputFiles.envSourceMapMarkdown}`,
    `- ok: ${envSourceMap.ok === true}`,
    `- containsValues: ${envSourceMap.containsValues === false ? "false" : "unknown"}`,
    `- vercelCoverage: ${envSourceMap.vercelCoverage.ok ? "checked" : envSourceMap.vercelCoverage.skipped ? "skipped" : "failed"}`,
    `- vercelRequiredCovered: ${envSourceMap.summary.vercelRequiredCovered}`,
    `- canMigrateFromVercelProduction: ${envSourceMap.summary.canMigrateFromVercelProduction}`,
    `- appAliyunOwnedNotInVercel: ${envSourceMap.summary.appAliyunOwnedNotInVercel}`,
    `- blockedExternalRequired: ${envSourceMap.summary.blockedExternalRequired.length ? envSourceMap.summary.blockedExternalRequired.join(", ") : "none"}`,
    ...(envSourceMap.summary.requiredMissingInVercelProduction.length
      ? [
          "- requiredMissingInVercelProduction:",
          ...envSourceMap.summary.requiredMissingInVercelProduction.map((item) => `  - ${item}`),
        ]
      : ["- requiredMissingInVercelProduction: none"]),
    ...(envSourceMap.groups.miniProgramCompatOnly.length
      ? [
          "- miniProgramCompatOnly:",
          ...envSourceMap.groups.miniProgramCompatOnly.map((item) => `  - ${item.name}: ${item.forbidden}`),
        ]
      : ["- miniProgramCompatOnly: none"]),
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

function renderSensitiveBlockerSummaryLines(items) {
  if (!items.length) return ["- none"]
  return items.flatMap((item) => {
    const variableDetails = item.variableDetails || []
    const blockedVariables = variableDetails.filter((variable) => variable.status !== "ready")
    const secretOrSensitive = variableDetails.filter((variable) => variable.sensitivity !== "public")
    return [
      `- ${item.id}: ${item.status} (${item.type})`,
      `  - owner: ${item.owner || "unknown"}`,
      `  - obtainFrom: ${item.obtainFrom || item.consolePath || "none"}`,
      `  - writeTargets: ${(item.writeTargets || []).length ? item.writeTargets.join("; ") : "none"}`,
      `  - verifyCommands: ${(item.verifyCommands || []).length ? item.verifyCommands.join("; ") : "none"}`,
      `  - completionEvidence: ${(item.completionEvidence || []).length ? item.completionEvidence.join("; ") : "none"}`,
      `  - variableDetails: total=${variableDetails.length}, blocked=${blockedVariables.length}, secretOrSensitive=${secretOrSensitive.length}`,
      `  - variables: ${variableDetails.length ? variableDetails.map(formatSensitiveVariableSummary).join("; ") : "none"}`,
    ]
  })
}

function formatSensitiveVariableSummary(variable) {
  const target = variable.importTarget || "unknown target"
  return `${variable.name}:${variable.status}->${target}`
}

function formatUserInterventionGroups(groups) {
  const entries = Object.entries(groups)
  if (!entries.length) return "none"
  return entries.map(([mode, ids]) => `${mode}=${Array.isArray(ids) ? ids.join("|") : String(ids)}`).join("; ")
}

function formatCurrentBrowserHostPaths(tabs) {
  const hostPaths = (tabs || []).map((item) => item.hostPath).filter(Boolean)
  return hostPaths.length ? hostPaths.join(", ") : "none"
}

function formatStringList(items) {
  return Array.isArray(items) && items.length ? items.join(", ") : "none"
}

function compactSensitiveBlockerForAudit(item) {
  const variableDetails = item.variableDetails || []
  return {
    id: item.id,
    type: item.type,
    status: item.status,
    owner: item.owner,
    obtainFrom: item.obtainFrom || item.consolePath || "",
    writeTargets: item.writeTargets || [],
    verifyCommands: item.verifyCommands || [],
    requiresActionTimeConfirmation: item.requiresActionTimeConfirmation === true,
    completionEvidence: item.completionEvidence || [],
    variableNames: item.variableNames || [],
    variableDetailsSummary: {
      total: variableDetails.length,
      blocked: variableDetails.filter((variable) => variable.status !== "ready").length,
      ready: variableDetails.filter((variable) => variable.status === "ready").length,
      secretOrSensitive: variableDetails.filter((variable) => variable.sensitivity !== "public").length,
    },
    variableDetails: variableDetails.map((variable) => ({
      name: variable.name,
      status: variable.status,
      sensitivity: variable.sensitivity,
      sourceCategory: variable.sourceCategory,
      owner: variable.owner,
      consolePath: variable.consolePath,
      obtain: variable.obtain,
      importTarget: variable.importTarget,
      cloudConfirmationKey: variable.cloudConfirmationKey,
      action: variable.action,
      notes: variable.notes,
    })),
    requiredUserAction: item.requiredUserAction,
    unblockCondition: item.unblockCondition,
    forbidden: item.forbidden,
  }
}

function main() {
  const args = parseArgs(process.argv)
  const currentScope = args.backendOnly ? "backend_aliyun_only" : "full_app_launch"
  const backendOnlyArg = args.backendOnly ? ["--backend-only"] : []
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
  const cloudshellReadonlyCollectorJsonPath = resolve(args.outDir, "cloudshell-readonly-collector.json")
  const cloudshellReadonlyCollectorMarkdownPath = resolve(args.outDir, "cloudshell-readonly-collector.md")
  const cloudshellReadonlyCollectorScriptPath = resolve(args.outDir, "cloudshell-readonly-collector.py")
  const cloudshellReadonlyCollector = runJson("cloudshell_readonly_collector", [
    "scripts/generate-aliyun-cloudshell-readonly-collector.mjs",
    "--out",
    cloudshellReadonlyCollectorScriptPath,
    "--report",
    cloudshellReadonlyCollectorJsonPath,
    "--markdown",
    cloudshellReadonlyCollectorMarkdownPath,
  ])
  const cloudshellInventoryHandoffJsonPath = resolve(args.outDir, "cloudshell-inventory-handoff.json")
  const cloudshellInventoryHandoffMarkdownPath = resolve(args.outDir, "cloudshell-inventory-handoff.md")
  const cloudshellInventoryHandoff = runJson("cloudshell_inventory_handoff", [
    "scripts/generate-aliyun-cloudshell-inventory-handoff.mjs",
    "--out",
    cloudshellInventoryHandoffJsonPath,
    "--markdown",
    cloudshellInventoryHandoffMarkdownPath,
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
  const envSourceMapJsonPath = resolve(args.outDir, "env-source-map.json")
  const envSourceMapMarkdownPath = resolve(args.outDir, "env-source-map.md")
  const vercelEnvCoveragePath = resolve(args.outDir, "vercel-env-coverage.json")
  const sensitiveBlockersJsonPath = resolve(args.outDir, "sensitive-blockers.json")
  const sensitiveBlockersMarkdownPath = resolve(args.outDir, "sensitive-blockers.md")
  const resourcesMatrixJsonPath = resolve(args.outDir, "resource-matrix.json")
  const resourcesMatrixMarkdownPath = resolve(args.outDir, "resource-matrix.md")
  const userActionBriefJsonPath = resolve(args.outDir, "user-action-brief.json")
  const userActionBriefMarkdownPath = resolve(args.outDir, "user-action-brief.md")
  const consoleRunbookJsonPath = resolve(args.outDir, "console-runbook.json")
  const consoleRunbookMarkdownPath = resolve(args.outDir, "console-runbook.md")
  const cloudActionsPackageJsonPath = resolve(args.outDir, "cloud-actions-package.json")
  const cloudActionsPackageMarkdownPath = resolve(args.outDir, "cloud-actions-package.md")
  const provisioningPlanJsonPath = resolve(args.outDir, "provisioning-plan.json")
  const provisioningPlanMarkdownPath = resolve(args.outDir, "provisioning-plan.md")
  const actionAuthorizationJsonPath = resolve(args.outDir, "action-authorization.json")
  const actionAuthorizationMarkdownPath = resolve(args.outDir, "action-authorization.md")
  const completionAuditJsonPath = resolve(args.outDir, "completion-audit.json")
  const completionAuditMarkdownPath = resolve(args.outDir, "completion-audit.md")
  const rdsMigrationPlanJsonPath = resolve(args.outDir, "rds-migration-plan.json")
  const rdsMigrationPlanMarkdownPath = resolve(args.outDir, "rds-migration-plan.md")
  const rdsRouteMigrationMapJsonPath = resolve(args.outDir, "rds-route-migration-map.json")
  const rdsRouteMigrationMapMarkdownPath = resolve(args.outDir, "rds-route-migration-map.md")
  const rdsMigrationPackageDir = resolve(args.outDir, "rds-migration-package")
  const rdsMigrationPackageJsonPath = resolve(rdsMigrationPackageDir, "rds-migration-package.json")
  const rdsMigrationPackageMarkdownPath = resolve(rdsMigrationPackageDir, "rds-migration-package.md")
  const rdsMigrationPackageSchemaSqlPath = resolve(rdsMigrationPackageDir, "rds-schema.sql")
  const rdsMigrationPackageValidationSqlPath = resolve(rdsMigrationPackageDir, "rds-validation.sql")
  const rdsMigrationPackageRollbackChecklistPath = resolve(rdsMigrationPackageDir, "rds-rollback-checklist.md")
  const rdsMigrationEvidenceJsonPath = resolve(args.outDir, "rds-migration-evidence.json")
  const rdsMigrationEvidenceMarkdownPath = resolve(args.outDir, "rds-migration-evidence.md")
  const backendCnStatusJsonPath = resolve(args.outDir, "backend-cn-status.json")
  const backendCnStatusMarkdownPath = resolve(args.outDir, "backend-cn-status.md")
  const backendApplyPackageJsonPath = resolve(args.outDir, "backend-apply-package.json")
  const backendApplyPackageMarkdownPath = resolve(args.outDir, "backend-apply-package.md")
  const blockerBriefJsonPath = resolve(args.outDir, "blocker-brief.json")
  const blockerBriefMarkdownPath = resolve(args.outDir, "blocker-brief.md")
  const evidenceWritebackJsonPath = resolve(args.outDir, "evidence-writeback.json")
  const evidenceWritebackMarkdownPath = resolve(args.outDir, "evidence-writeback.md")
  const wechatOpenMobileAppPackageJsonPath = resolve(args.outDir, "wechat-open-mobile-app-package.json")
  const wechatOpenMobileAppPackageMarkdownPath = resolve(args.outDir, "wechat-open-mobile-app-package.md")
  const androidReleaseSigningPackageJsonPath = resolve(args.outDir, "android-release-signing-package.json")
  const androidReleaseSigningPackageMarkdownPath = resolve(args.outDir, "android-release-signing-package.md")
  const appleTeamAasaPackageJsonPath = resolve(args.outDir, "apple-team-aasa-package.json")
  const appleTeamAasaPackageMarkdownPath = resolve(args.outDir, "apple-team-aasa-package.md")
  const operatorHandoffJsonPath = resolve(args.outDir, "operator-handoff.json")
  const operatorHandoffMarkdownPath = resolve(args.outDir, "operator-handoff.md")
  const productionStatusJsonPath = resolve(args.outDir, "production-cn-status.json")
  const productionStatusMarkdownPath = resolve(args.outDir, "production-cn-status.md")
  const cloudConfirmationsCheckPath = resolve(args.outDir, "cloud-confirmations-check.json")
  const operatorTasks = runJson("operator_tasks", [
    "scripts/generate-aliyun-operator-tasks.mjs",
    ...backendOnlyArg,
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
    ...backendOnlyArg,
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
    ...backendOnlyArg,
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
    ...backendOnlyArg,
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
  const cloudActionsPackage = runJson("cloud_actions_package", [
    "scripts/generate-aliyun-cloud-actions-package.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    "--out",
    cloudActionsPackageJsonPath,
    "--markdown",
    cloudActionsPackageMarkdownPath,
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
    ...backendOnlyArg,
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
  const rdsMigrationPlan = runJson("rds_migration_plan", [
    "scripts/summarize-aliyun-rds-migration-plan.mjs",
    "--out",
    rdsMigrationPlanJsonPath,
    "--markdown",
    rdsMigrationPlanMarkdownPath,
  ])
  const rdsRouteMigrationMap = runJson("rds_route_migration_map", [
    "scripts/generate-aliyun-rds-route-migration-map.mjs",
    "--out",
    rdsRouteMigrationMapJsonPath,
    "--markdown",
    rdsRouteMigrationMapMarkdownPath,
  ])
  const rdsMigrationPackage = runJson("rds_migration_package", [
    "scripts/generate-aliyun-rds-migration-package.mjs",
    "--out-dir",
    rdsMigrationPackageDir,
  ])
  const rdsMigrationEvidence = runJson("rds_migration_evidence", [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--allow-incomplete",
    "--out",
    rdsMigrationEvidenceJsonPath,
    "--markdown",
    rdsMigrationEvidenceMarkdownPath,
  ])
  const backendCnStatus = runJson("backend_cn_status", [
    "scripts/summarize-aliyun-backend-cn-status.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    ...(args.cloudInventoryResultsFile ? ["--cloud-inventory-results", args.cloudInventoryResultsFile] : []),
    "--out",
    backendCnStatusJsonPath,
    "--markdown",
    backendCnStatusMarkdownPath,
  ])
  const backendApplyPackage = runJson("backend_apply_package", [
    "scripts/generate-aliyun-backend-apply-package.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    ...(args.cloudInventoryResultsFile ? ["--cloud-inventory-results", args.cloudInventoryResultsFile] : []),
    "--out",
    backendApplyPackageJsonPath,
    "--markdown",
    backendApplyPackageMarkdownPath,
  ])
  const vercelEnvCoverage = runVercelEnvCoverage(args, vercelEnvCoveragePath)
  const blockerBrief = runJson("blocker_brief", [
    "scripts/summarize-aliyun-blocker-brief.mjs",
    ...backendOnlyArg,
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    ...(vercelEnvCoverage.ok
      ? ["--vercel-env-coverage-report", vercelEnvCoveragePath]
      : []),
    ...(args.skipVercelEnvCoverage && !vercelEnvCoverage.ok
      ? ["--skip-vercel-env-coverage"]
      : []),
    ...(args.vercelEnvCoverageInput && !vercelEnvCoverage.ok && !args.skipVercelEnvCoverage
      ? ["--vercel-env-coverage-input", args.vercelEnvCoverageInput]
      : []),
    "--out",
    blockerBriefJsonPath,
    "--markdown",
    blockerBriefMarkdownPath,
  ])
  const evidenceWriteback = runJson("evidence_writeback", [
    "scripts/generate-aliyun-evidence-writeback-checklist.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    ...(args.cloudInventoryResultsFile ? ["--cloud-inventory-results", args.cloudInventoryResultsFile] : []),
    ...(args.skipVercelEnvCoverage ? ["--skip-vercel-env-coverage"] : []),
    ...(args.vercelEnvCoverageInput ? ["--vercel-env-coverage-input", args.vercelEnvCoverageInput] : []),
    ...backendOnlyArg,
    "--out",
    evidenceWritebackJsonPath,
    "--markdown",
    evidenceWritebackMarkdownPath,
  ])
  const wechatOpenMobileAppPackage = runAppLaunchPackage(args, "wechat", "wechat_open_mobile_app_package", [
    "scripts/generate-wechat-open-mobile-app-package.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    "--out",
    wechatOpenMobileAppPackageJsonPath,
    "--markdown",
    wechatOpenMobileAppPackageMarkdownPath,
  ], wechatOpenMobileAppPackageJsonPath, wechatOpenMobileAppPackageMarkdownPath)
  const androidReleaseSigningPackage = runAppLaunchPackage(args, "android", "android_release_signing_package", [
    "scripts/generate-android-release-signing-package.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    "--out",
    androidReleaseSigningPackageJsonPath,
    "--markdown",
    androidReleaseSigningPackageMarkdownPath,
  ], androidReleaseSigningPackageJsonPath, androidReleaseSigningPackageMarkdownPath)
  const appleTeamAasaPackage = runAppLaunchPackage(args, "apple", "apple_team_aasa_package", [
    "scripts/generate-apple-team-aasa-package.mjs",
    "--env-file",
    args.envFile,
    "--out",
    appleTeamAasaPackageJsonPath,
    "--markdown",
    appleTeamAasaPackageMarkdownPath,
  ], appleTeamAasaPackageJsonPath, appleTeamAasaPackageMarkdownPath)
  const operatorHandoff = runJson("operator_handoff", [
    "scripts/generate-aliyun-operator-handoff.mjs",
    "--env-file",
    args.envFile,
    ...(args.cloudConfirmationsFile ? ["--cloud-confirmations", args.cloudConfirmationsFile] : []),
    ...(args.cloudInventoryResultsFile ? ["--cloud-inventory-results", args.cloudInventoryResultsFile] : []),
    ...(args.skipVercelEnvCoverage ? ["--skip-vercel-env-coverage"] : []),
    ...(args.vercelEnvCoverageInput ? ["--vercel-env-coverage-input", args.vercelEnvCoverageInput] : []),
    ...backendOnlyArg,
    "--out",
    operatorHandoffJsonPath,
    "--markdown",
    operatorHandoffMarkdownPath,
  ])
  const productionStatus = runJson("production_status", [
    "scripts/summarize-aliyun-production-cn-status.mjs",
    ...backendOnlyArg,
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
    ...backendOnlyArg,
    "--allow-incomplete",
  ])
  const routes = runJson("routes", ["scripts/check-app-api-production-cn-routes.mjs"])
  const appApiBridgeMap = runJson("app_api_bridge_map", ["scripts/check-app-api-bridge-map.mjs"])
  const appClientContract = runJson("app_client_contract", ["scripts/check-app-client-api-contract.mjs"])
  const appApiSmokeCoverage = runJson("app_api_smoke_coverage", ["scripts/check-app-api-smoke-coverage.mjs"])
  const dockerContext = runJson("docker_context", ["scripts/check-aliyun-docker-context.mjs"])
  const envSourceMap = runJson("env_source_map", [
    "scripts/summarize-aliyun-env-source-map.mjs",
    "--env-file",
    args.envFile,
    ...(vercelEnvCoverage.ok
      ? ["--vercel-env-coverage-report", vercelEnvCoveragePath]
      : ["--skip-vercel-env-coverage"]),
    "--out",
    envSourceMapJsonPath,
    "--markdown",
    envSourceMapMarkdownPath,
  ])

  const bundle = args.skipBundle ? null : createArchive(args.outDir)
  const audit = {
    generatedAt: new Date().toISOString(),
    currentScope,
    backendOnly: args.backendOnly,
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
      cloudshellReadonlyCollector,
      cloudshellInventoryHandoff,
      cloudInventoryResults,
      deploymentSpec,
      runtimePlan,
      legalPages,
      imagePublishPlan,
      operatorTasks,
      envHandoff,
      envSourceMap,
      sensitiveBlockers,
      resourcesMatrix,
      userActionBrief,
      consoleRunbook,
      cloudActionsPackage,
      provisioningPlan,
      actionAuthorization,
      completionAudit,
      rdsMigrationPlan,
      rdsRouteMigrationMap,
      rdsMigrationPackage,
      rdsMigrationEvidence,
      backendCnStatus,
      backendApplyPackage,
      blockerBrief,
      evidenceWriteback,
      wechatOpenMobileAppPackage,
      androidReleaseSigningPackage,
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
      envSourceMapJson: envSourceMapJsonPath,
      envSourceMapMarkdown: envSourceMapMarkdownPath,
      vercelEnvCoverage: vercelEnvCoverage.ok ? vercelEnvCoveragePath : null,
      domainReadiness: resolve(args.outDir, "domain-readiness.json"),
      cloudAccess: cloudAccessPath,
      cloudInventoryPlanJson: cloudInventoryPlanJsonPath,
      cloudInventoryPlanMarkdown: cloudInventoryPlanMarkdownPath,
      cloudInventoryRunnerJson: cloudInventoryRunnerJsonPath,
      cloudInventoryRunnerMarkdown: cloudInventoryRunnerMarkdownPath,
      cloudshellReadonlyCollectorJson: cloudshellReadonlyCollectorJsonPath,
      cloudshellReadonlyCollectorMarkdown: cloudshellReadonlyCollectorMarkdownPath,
      cloudshellReadonlyCollectorScript: cloudshellReadonlyCollectorScriptPath,
      cloudshellInventoryHandoffJson: cloudshellInventoryHandoffJsonPath,
      cloudshellInventoryHandoffMarkdown: cloudshellInventoryHandoffMarkdownPath,
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
      cloudActionsPackageJson: cloudActionsPackageJsonPath,
      cloudActionsPackageMarkdown: cloudActionsPackageMarkdownPath,
      provisioningPlanJson: provisioningPlanJsonPath,
      provisioningPlanMarkdown: provisioningPlanMarkdownPath,
      actionAuthorizationJson: actionAuthorizationJsonPath,
      actionAuthorizationMarkdown: actionAuthorizationMarkdownPath,
      completionAuditJson: completionAuditJsonPath,
      completionAuditMarkdown: completionAuditMarkdownPath,
      rdsMigrationPlanJson: rdsMigrationPlanJsonPath,
      rdsMigrationPlanMarkdown: rdsMigrationPlanMarkdownPath,
      rdsRouteMigrationMapJson: rdsRouteMigrationMapJsonPath,
      rdsRouteMigrationMapMarkdown: rdsRouteMigrationMapMarkdownPath,
      rdsMigrationPackageDir,
      rdsMigrationPackageJson: rdsMigrationPackageJsonPath,
      rdsMigrationPackageMarkdown: rdsMigrationPackageMarkdownPath,
      rdsMigrationPackageSchemaSql: rdsMigrationPackageSchemaSqlPath,
      rdsMigrationPackageValidationSql: rdsMigrationPackageValidationSqlPath,
      rdsMigrationPackageRollbackChecklist: rdsMigrationPackageRollbackChecklistPath,
      rdsMigrationEvidenceJson: rdsMigrationEvidenceJsonPath,
      rdsMigrationEvidenceMarkdown: rdsMigrationEvidenceMarkdownPath,
      backendCnStatusJson: backendCnStatusJsonPath,
      backendCnStatusMarkdown: backendCnStatusMarkdownPath,
      backendApplyPackageJson: backendApplyPackageJsonPath,
      backendApplyPackageMarkdown: backendApplyPackageMarkdownPath,
      blockerBriefJson: blockerBriefJsonPath,
      blockerBriefMarkdown: blockerBriefMarkdownPath,
      evidenceWritebackJson: evidenceWritebackJsonPath,
      evidenceWritebackMarkdown: evidenceWritebackMarkdownPath,
      wechatOpenMobileAppPackageJson: wechatOpenMobileAppPackageJsonPath,
      wechatOpenMobileAppPackageMarkdown: wechatOpenMobileAppPackageMarkdownPath,
      androidReleaseSigningPackageJson: androidReleaseSigningPackageJsonPath,
      androidReleaseSigningPackageMarkdown: androidReleaseSigningPackageMarkdownPath,
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
    currentScope,
    currentScopeReady: args.backendOnly ? backendCnStatus.canDeployBackendNow === true : readiness.productionReady === true,
    currentScopeBlocking: args.backendOnly
      ? backendCnStatus.summary.backendRequiredBlocking || []
      : readiness.machineBlocking || [],
    deferredAppLaunchBlocking: backendCnStatus.summary.appLaunchDeferredBlocking || [],
    productionReady: readiness.productionReady,
    diagnosticOnly: readiness.diagnosticOnly === true,
    releaseEvidenceUsable: readiness.releaseEvidenceUsable !== false,
    localCodeReady: args.backendOnly ? blockerBrief.summary.localCodeReady === true : readiness.localCodeReady,
    machineBlocking: args.backendOnly ? blockerBrief.summary.machineBlocking || [] : readiness.machineBlocking,
    fullAppMachineBlocking: readiness.machineBlocking,
    manualBlockingCount: readiness.manualBlocking.length,
    cloudConfirmationsReady: readiness.checks?.cloudConfirmations?.ready === true,
    cloudAccess: {
      report: audit.outputFiles.cloudAccess,
      canReadCloudNow: cloudAccess.canReadCloudNow === true,
      cliAvailable: cloudAccess.cli?.available === true,
      cliConfigFileExists: cloudAccess.cli?.configFileExists === true,
      cliConfigProbeReady: cloudAccess.cli?.configProbe?.ready === true,
      cliConfigProbeFailureCategory: cloudAccess.cli?.configProbe?.failureCategory || "",
      currentBrowserCanUseCurrentConsole: cloudAccess.localBrowserProbe?.canUseCurrentConsole === true,
      currentBrowserAliyunConsoleTabCount: cloudAccess.localBrowserProbe?.aliyunConsoleTabCount || 0,
      currentBrowserAliyunConsoleHostPaths: (cloudAccess.localBrowserProbe?.aliyunConsoleTabs || [])
        .map((item) => item.hostPath)
        .filter(Boolean),
      currentBrowserCloudApiCalled: cloudAccess.localBrowserProbe?.cloudApiCalled === true,
      currentBrowserCloudMutationPerformed: cloudAccess.localBrowserProbe?.cloudMutationPerformed === true,
      workbenchTerminalConnected: cloudAccess.terminalAccess?.workbenchTerminal?.connected === true,
      workbenchTerminalReadiness: cloudAccess.terminalAccess?.workbenchTerminal?.readiness || "not_observed",
      workbenchTerminalCliInventoryAttempted: cloudAccess.terminalAccess?.workbenchTerminal?.cliInventoryAttempted === true,
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
      failedCommands: cloudInventoryRunner.summary.failedCommands,
      dryRunCommands: cloudInventoryRunner.summary.dryRunCommands,
      failureCategories: cloudInventoryRunner.summary.failureCategories || {},
      diagnosticsNextActions: cloudInventoryRunner.executionDiagnostics?.nextActions || [],
      blockers: cloudInventoryRunner.blockers || [],
    },
    cloudshellReadonlyCollector: {
      report: audit.outputFiles.cloudshellReadonlyCollectorJson,
      markdown: audit.outputFiles.cloudshellReadonlyCollectorMarkdown,
      script: audit.outputFiles.cloudshellReadonlyCollectorScript,
      ok: cloudshellReadonlyCollector.ok === true,
      executionMode: cloudshellReadonlyCollector.executionMode,
      allowEnv: cloudshellReadonlyCollector.allowEnv,
      containsValues: cloudshellReadonlyCollector.containsValues === true,
      readOnlyOnly: cloudshellReadonlyCollector.readOnlyOnly === true,
      cloudApiCalled: cloudshellReadonlyCollector.cloudApiCalled === true,
      mutationPerformed: cloudshellReadonlyCollector.mutationPerformed === true,
      commands: cloudshellReadonlyCollector.summary?.commands || 0,
      secretLeakCheck: cloudshellReadonlyCollector.secretLeakCheck?.ok === true,
      blockers: cloudshellReadonlyCollector.blockers || [],
    },
    cloudshellInventoryHandoff: {
      report: audit.outputFiles.cloudshellInventoryHandoffJson,
      markdown: audit.outputFiles.cloudshellInventoryHandoffMarkdown,
      ok: cloudshellInventoryHandoff.ok === true,
      executionMode: cloudshellInventoryHandoff.executionMode,
      containsValues: cloudshellInventoryHandoff.containsValues === true,
      readOnlyOnly: cloudshellInventoryHandoff.readOnlyOnly === true,
      cloudApiCalled: cloudshellInventoryHandoff.cloudApiCalled === true,
      mutationPerformed: cloudshellInventoryHandoff.mutationPerformed === true,
      canReadCloudNow: cloudshellInventoryHandoff.cliReadiness.canReadCloudNow === true,
      cliConfigProbeReady: cloudshellInventoryHandoff.cliReadiness.configProbe?.ready === true,
      cliConfigProbeFailureCategory: cloudshellInventoryHandoff.cliReadiness.configProbe?.failureCategory || "",
      currentBrowserCanUseCurrentConsole: cloudshellInventoryHandoff.currentBrowser?.canUseCurrentConsole === true,
      currentBrowserAliyunConsoleTabCount: cloudshellInventoryHandoff.currentBrowser?.aliyunConsoleTabCount || 0,
      currentBrowserAliyunConsoleHostPaths: cloudshellInventoryHandoff.currentBrowser?.aliyunConsoleHostPaths || [],
      currentBrowserCloudApiCalled: cloudshellInventoryHandoff.currentBrowser?.cloudApiCalled === true,
      currentBrowserCloudMutationPerformed: cloudshellInventoryHandoff.currentBrowser?.cloudMutationPerformed === true,
      strictInventoryAlreadyReady: cloudshellInventoryHandoff.existingInventoryEvidence?.ready === true,
      strictInventoryReadyLocalOperations: cloudshellInventoryHandoff.existingInventoryEvidence?.readyLocalOperations || 0,
      strictInventoryLocalOperations: cloudshellInventoryHandoff.existingInventoryEvidence?.localOperations || 0,
      strictInventoryExecutedCommandResults: cloudshellInventoryHandoff.existingInventoryEvidence?.executedCommandResults || 0,
      strictInventoryCommandResults: cloudshellInventoryHandoff.existingInventoryEvidence?.commandResults || 0,
      strictInventoryCloudApiCalledCommandResults: cloudshellInventoryHandoff.existingInventoryEvidence?.cloudApiCalledCommandResults || 0,
      strictInventoryMutationPerformedCommandResults: cloudshellInventoryHandoff.existingInventoryEvidence?.mutationPerformedCommandResults || 0,
      strictInventoryObservedOperationIds: cloudshellInventoryHandoff.existingInventoryEvidence?.observedOperationIds || [],
      strictInventoryNotFoundOperationIds: cloudshellInventoryHandoff.existingInventoryEvidence?.notFoundOperationIds || [],
      strictInventoryBlockedOperationIds: cloudshellInventoryHandoff.existingInventoryEvidence?.blockedOperationIds || [],
      operatorPathIds: (cloudshellInventoryHandoff.operatorPaths || []).map((item) => item.id),
      totalOperations: cloudshellInventoryHandoff.inventoryPlan.totalOperations,
      commandTemplates: cloudshellInventoryHandoff.inventoryPlan.commandTemplates,
      writebackTargets: cloudshellInventoryHandoff.writebackTargets,
      strictVerificationOrder: cloudshellInventoryHandoff.strictVerificationOrder,
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
      observationSummary: cloudInventoryResults.local?.observationSummary || {},
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
      writebackBlockingGroups: imagePublishPlan.summary?.writebackBlockingGroups || [],
      requiredAuthorizationPackets: imagePublishPlan.summary?.requiredAuthorizationPackets || [],
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
      writebackBlockingGroups: cloudConfirmationsCheck.summary?.writebackBlockingGroups || [],
      requiredAuthorizationPackets: cloudConfirmationsCheck.summary?.requiredAuthorizationPackets || [],
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
    envSourceMap: {
      report: audit.outputFiles.envSourceMapJson,
      markdown: audit.outputFiles.envSourceMapMarkdown,
      ok: envSourceMap.ok === true,
      containsValues: envSourceMap.containsValues === true,
      secretLeakCheck: envSourceMap.secretLeakCheck?.ok === true,
      vercelCoverage: {
        ok: envSourceMap.vercelCoverage.ok === true,
        skipped: envSourceMap.vercelCoverage.skipped === true,
        requiredCovered: envSourceMap.vercelCoverage.requiredCovered,
        productionNames: envSourceMap.vercelCoverage.productionNames,
      },
      canMigrateFromVercelProduction: envSourceMap.summary.canMigrateFromVercelProduction,
      appAliyunOwnedNotInVercel: envSourceMap.summary.appAliyunOwnedNotInVercel,
      requiredMissingInVercelProduction: envSourceMap.summary.requiredMissingInVercelProduction,
      blockedExternalRequired: envSourceMap.summary.blockedExternalRequired,
      miniProgramCompatOnly: envSourceMap.summary.miniProgramCompatOnly,
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
      variableDetails: sensitiveBlockers.summary.variableDetails || {},
      userIntervention: sensitiveBlockers.summary.userIntervention || {},
      credentialInterventionBrief: sensitiveBlockers.credentialInterventionBrief
        || sensitiveBlockers.summary.credentialInterventionBrief
        || {},
      items: (sensitiveBlockers.items || []).map(compactSensitiveBlockerForAudit),
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
      resourceEvidenceReady: resourcesMatrix.summary.resourceEvidenceReady || "",
      blockedResourceEvidenceIds: resourcesMatrix.summary.blockedResourceEvidenceIds || [],
      resourceEvidenceBrief: resourcesMatrix.resourceEvidenceBrief || {},
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
      credentialAcquisitionSummary: userActionBrief.credentialAcquisitionSummary || null,
      blockedCredentialCount: userActionBrief.summary.blockedCredentialCount || 0,
      blockedCredentialNames: userActionBrief.summary.blockedCredentialNames || [],
      readySecretEnvVariableCount: userActionBrief.summary.readySecretEnvVariableCount || 0,
      readySecretEnvVariableNames: userActionBrief.summary.readySecretEnvVariableNames || [],
      nextActionTimeConfirmations: userActionBrief.nextActionTimeConfirmations || [],
      actionTimeAuthorizationRequest: userActionBrief.actionTimeAuthorizationRequest || null,
    },
    consoleRunbook: {
      report: audit.outputFiles.consoleRunbookJson,
      markdown: audit.outputFiles.consoleRunbookMarkdown,
      ok: consoleRunbook.ok === true,
      containsValues: consoleRunbook.containsValues === true,
      mutationPerformed: consoleRunbook.mutationPerformed === true,
      resourceReady: consoleRunbook.summary?.resourceReady || "unknown",
      userActionReady: consoleRunbook.summary?.userActionReady || "unknown",
      consoleClosureBrief: consoleRunbook.consoleClosureBrief || {},
      blockedCredentialCount: consoleRunbook.consoleClosureBrief?.blockedCredentialCount ?? consoleRunbook.summary?.blockedCredentialCount ?? 0,
      blockedCredentialNames: consoleRunbook.consoleClosureBrief?.blockedCredentialNames || [],
      readySecretEnvVariableCount: consoleRunbook.consoleClosureBrief?.readySecretEnvVariableCount ?? consoleRunbook.summary?.readySecretEnvVariableCount ?? 0,
      readySecretEnvVariableNames: consoleRunbook.consoleClosureBrief?.readySecretEnvVariableNames || [],
      resourceEvidenceReady: consoleRunbook.consoleClosureBrief?.resourceEvidenceReady || consoleRunbook.summary?.resourceEvidenceReady || "",
      blockedResourceEvidenceIds: consoleRunbook.consoleClosureBrief?.blockedResourceEvidenceIds || consoleRunbook.summary?.blockedResourceEvidenceIds || [],
      partiallyObservedResourceEvidenceIds: consoleRunbook.consoleClosureBrief?.partiallyObservedResourceEvidenceIds || consoleRunbook.summary?.partiallyObservedResourceEvidenceIds || [],
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
      provisioningClosureBrief: provisioningPlan.provisioningClosureBrief || {},
      blockedCredentialCount: provisioningPlan.provisioningClosureBrief?.blockedCredentialCount ?? provisioningPlan.summary?.blockedCredentialCount ?? 0,
      blockedCredentialNames: provisioningPlan.provisioningClosureBrief?.blockedCredentialNames || [],
      readySecretEnvVariableCount: provisioningPlan.provisioningClosureBrief?.readySecretEnvVariableCount ?? provisioningPlan.summary?.readySecretEnvVariableCount ?? 0,
      readySecretEnvVariableNames: provisioningPlan.provisioningClosureBrief?.readySecretEnvVariableNames || [],
      resourceEvidenceReady: provisioningPlan.provisioningClosureBrief?.resourceEvidenceReady || provisioningPlan.summary?.resourceEvidenceReady || "",
      blockedResourceEvidenceIds: provisioningPlan.provisioningClosureBrief?.blockedResourceEvidenceIds || provisioningPlan.summary?.blockedResourceEvidenceIds || [],
      partiallyObservedResourceEvidenceIds: provisioningPlan.provisioningClosureBrief?.partiallyObservedResourceEvidenceIds || provisioningPlan.summary?.partiallyObservedResourceEvidenceIds || [],
      readyAuthorizationPackets: (provisioningPlan.readyAuthorizationPackets || []).map((item) =>
        `${item.packetId}:${item.actionId}:${item.nonSecretEvidenceOnly ? "non_secret" : "controlled"}`),
      readyActionPackets: (provisioningPlan.readyActionPackets || []).map((item) =>
        `${item.taskId}:${item.currentActionScope}:${item.nonSecretEvidenceOnly ? "non_secret" : "controlled"}`),
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
      authorizationClosureBrief: actionAuthorization.authorizationClosureBrief || {},
      blockedCredentialCount: actionAuthorization.authorizationClosureBrief?.blockedCredentialCount ?? actionAuthorization.summary?.blockedCredentialCount ?? 0,
      blockedCredentialNames: actionAuthorization.authorizationClosureBrief?.blockedCredentialNames || [],
      readySecretEnvVariableCount: actionAuthorization.authorizationClosureBrief?.readySecretEnvVariableCount ?? actionAuthorization.summary?.readySecretEnvVariableCount ?? 0,
      readySecretEnvVariableNames: actionAuthorization.authorizationClosureBrief?.readySecretEnvVariableNames || [],
      resourceEvidenceReady: actionAuthorization.authorizationClosureBrief?.resourceEvidenceReady || actionAuthorization.summary?.resourceEvidenceReady || "",
      blockedResourceEvidenceIds: actionAuthorization.authorizationClosureBrief?.blockedResourceEvidenceIds || actionAuthorization.summary?.blockedResourceEvidenceIds || [],
      partiallyObservedResourceEvidenceIds: actionAuthorization.authorizationClosureBrief?.partiallyObservedResourceEvidenceIds || actionAuthorization.summary?.partiallyObservedResourceEvidenceIds || [],
      authorizationPacketIds: (actionAuthorization.authorizationPackets || []).map((item) => item.packetId),
      canStartNowPackets: actionAuthorization.summary.canStartNowPackets || [],
      nextActionTimeConfirmations: actionAuthorization.nextActionTimeConfirmations || [],
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
      blockedCredentialCount: completionAudit.summary.blockedCredentialCount || 0,
      blockedCredentialNames: completionAudit.summary.blockedCredentialNames || [],
      readySecretEnvVariableCount: completionAudit.summary.readySecretEnvVariableCount || 0,
      readySecretEnvVariableNames: completionAudit.summary.readySecretEnvVariableNames || [],
      resourceEvidenceReady: completionAudit.summary.resourceEvidenceReady || "",
      blockedResourceEvidenceIds: completionAudit.summary.blockedResourceEvidenceIds || [],
      goalClosureEvidenceBrief: completionAudit.goalClosureEvidenceBrief || {},
      canStartNowConsoleTasks: completionAudit.summary.canStartNowConsoleTasks,
      canStartNowAuthorizationPackets: completionAudit.summary.canStartNowAuthorizationPackets,
      nextActionTimeConfirmations: completionAudit.summary.nextActionTimeConfirmations || [],
      requirementStatuses: (completionAudit.requirements || []).map((item) => `${item.id}:${item.status}`),
    },
    rdsMigrationPlan: {
      report: audit.outputFiles.rdsMigrationPlanJson,
      markdown: audit.outputFiles.rdsMigrationPlanMarkdown,
      ok: rdsMigrationPlan.ok === true,
      containsValues: rdsMigrationPlan.containsValues === true,
      secretLeakCheck: rdsMigrationPlan.secretLeakCheck?.ok === true,
      currentDataLayer: rdsMigrationPlan.currentDataLayer,
      formalTarget: rdsMigrationPlan.formalTarget,
      migrationReady: rdsMigrationPlan.migrationReady === true,
      appApiRouteCount: rdsMigrationPlan.summary.appApiRouteCount,
      appApiRoutesWithSupabase: rdsMigrationPlan.summary.appApiRoutesWithSupabase,
      appApiRoutesWithSupabaseDataAccess: rdsMigrationPlan.summary.appApiRoutesWithSupabaseDataAccess,
      appApiRoutesWithDirectSupabase: rdsMigrationPlan.summary.appApiRoutesWithDirectSupabase,
      appApiRoutesWithDirectSupabaseDataAccess: rdsMigrationPlan.summary.appApiRoutesWithDirectSupabaseDataAccess,
      firstVersionRdsRouteCount: rdsMigrationPlan.summary.firstVersionRdsRouteCount,
      firstVersionRdsRoutesWithSupabase: rdsMigrationPlan.summary.firstVersionRdsRoutesWithSupabase,
      firstVersionRdsRoutesWithSupabaseDataAccess: rdsMigrationPlan.summary.firstVersionRdsRoutesWithSupabaseDataAccess,
      deferredAppApiRouteCount: rdsMigrationPlan.summary.deferredAppApiRouteCount,
      deferredAppApiRoutesWithSupabaseDataAccess: rdsMigrationPlan.summary.deferredAppApiRoutesWithSupabaseDataAccess,
      sharedSupabaseFileCount: rdsMigrationPlan.summary.sharedSupabaseFileCount,
      sharedSupabaseDataAccessFileCount: rdsMigrationPlan.summary.sharedSupabaseDataAccessFileCount,
      supabaseUsageFileCount: rdsMigrationPlan.summary.supabaseUsageFileCount,
      tableCount: rdsMigrationPlan.summary.tableCount,
      rpcCount: rdsMigrationPlan.summary.rpcCount,
      storageBucketCount: rdsMigrationPlan.summary.storageBucketCount,
      databaseUrlCnReferencedInSource: rdsMigrationPlan.summary.databaseUrlCnReferencedInSource === true,
      postgresDataAccessAdapterDetected: rdsMigrationPlan.summary.postgresDataAccessAdapterDetected === true,
      requiredBlocking: rdsMigrationPlan.summary.requiredBlocking || [],
      migrationPhases: (rdsMigrationPlan.migrationPhases || []).map((item) => `${item.id}:canStartNow=${item.canStartNow}`),
    },
    rdsRouteMigrationMap: {
      report: audit.outputFiles.rdsRouteMigrationMapJson,
      markdown: audit.outputFiles.rdsRouteMigrationMapMarkdown,
      ok: rdsRouteMigrationMap.ok === true,
      containsValues: rdsRouteMigrationMap.containsValues === true,
      secretLeakCheck: rdsRouteMigrationMap.secretLeakCheck?.ok === true,
      firstVersionRouteCount: rdsRouteMigrationMap.summary.firstVersionRouteCount,
      routesStillUsingSupabaseDataAccess: rdsRouteMigrationMap.summary.routesStillUsingSupabaseDataAccess,
      observedTableCount: rdsRouteMigrationMap.summary.observedTableCount,
      requiredTableCount: rdsRouteMigrationMap.summary.requiredTableCount,
      observedRpcCount: rdsRouteMigrationMap.summary.observedRpcCount,
      requiredFunctionCount: rdsRouteMigrationMap.summary.requiredFunctionCount,
      schemaMapMissingObservedTables: rdsRouteMigrationMap.summary.schemaMapMissingObservedTables || [],
      schemaMapMissingObservedRpcs: rdsRouteMigrationMap.summary.schemaMapMissingObservedRpcs || [],
      requiredTablesWithoutRouteObservation: rdsRouteMigrationMap.summary.requiredTablesWithoutRouteObservation || [],
      sharedDataAccessFileCount: rdsRouteMigrationMap.summary.sharedDataAccessFileCount,
      routeGroups: (rdsRouteMigrationMap.routeGroups || []).map((item) => `${item.scope}:${item.routeCount}`),
      blockedCredentialNames: rdsRouteMigrationMap.summary.blockedCredentialNames || [],
    },
    rdsMigrationPackage: {
      dir: audit.outputFiles.rdsMigrationPackageDir,
      report: audit.outputFiles.rdsMigrationPackageJson,
      markdown: audit.outputFiles.rdsMigrationPackageMarkdown,
      schemaSql: audit.outputFiles.rdsMigrationPackageSchemaSql,
      validationSql: audit.outputFiles.rdsMigrationPackageValidationSql,
      rollbackChecklist: audit.outputFiles.rdsMigrationPackageRollbackChecklist,
      ok: rdsMigrationPackage.ok === true,
      containsValues: rdsMigrationPackage.containsValues === true,
      readOnlyOnly: rdsMigrationPackage.readOnlyOnly === true,
      cloudApiCalled: rdsMigrationPackage.cloudApiCalled === true,
      mutationPerformed: rdsMigrationPackage.mutationPerformed === true,
      sourceFileCount: rdsMigrationPackage.summary.sourceFileCount,
      requiredTableCount: rdsMigrationPackage.summary.requiredTableCount,
      requiredFunctionCount: rdsMigrationPackage.summary.requiredFunctionCount,
      requiredStorageCount: rdsMigrationPackage.summary.requiredStorageCount,
      schemaSqlSha256: rdsMigrationPackage.summary.schemaSqlSha256,
      validationSqlSha256: rdsMigrationPackage.summary.validationSqlSha256,
      compatibilityReviewRequired: rdsMigrationPackage.summary.compatibilityReviewRequired === true,
      compatibilityFindingCount: rdsMigrationPackage.summary.compatibilityFindingCount || 0,
      compatibilityAffectedSourceFileCount: rdsMigrationPackage.summary.compatibilityAffectedSourceFileCount || 0,
      compatibilityCategories: rdsMigrationPackage.compatibilityReview?.categories || [],
      blockers: rdsMigrationPackage.blockers || [],
      warnings: rdsMigrationPackage.warnings || [],
    },
    rdsMigrationEvidence: {
      report: audit.outputFiles.rdsMigrationEvidenceJson,
      markdown: audit.outputFiles.rdsMigrationEvidenceMarkdown,
      ok: rdsMigrationEvidence.ok === true,
      containsValues: rdsMigrationEvidence.containsValues === true,
      secretLeakCheck: rdsMigrationEvidence.secretLeakCheck?.ok === true,
      templateReady: rdsMigrationEvidence.summary.templateReady === true,
      localExists: rdsMigrationEvidence.summary.localExists === true,
      localReady: rdsMigrationEvidence.summary.localReady === true,
      migrationReady: rdsMigrationEvidence.summary.migrationReady === true,
      appApiRouteCount: rdsMigrationEvidence.summary.appApiRouteCount,
      appApiRoutesWithSupabase: rdsMigrationEvidence.summary.appApiRoutesWithSupabase,
      appApiRoutesWithSupabaseDataAccess: rdsMigrationEvidence.summary.appApiRoutesWithSupabaseDataAccess,
      firstVersionRdsRouteCount: rdsMigrationEvidence.summary.firstVersionRdsRouteCount,
      firstVersionRdsRoutesWithSupabase: rdsMigrationEvidence.summary.firstVersionRdsRoutesWithSupabase,
      firstVersionRdsRoutesWithSupabaseDataAccess: rdsMigrationEvidence.summary.firstVersionRdsRoutesWithSupabaseDataAccess,
      deferredAppApiRouteCount: rdsMigrationEvidence.summary.deferredAppApiRouteCount,
      deferredAppApiRoutesWithSupabaseDataAccess: rdsMigrationEvidence.summary.deferredAppApiRoutesWithSupabaseDataAccess,
      postgresDataAccessAdapterDetected: rdsMigrationEvidence.summary.postgresDataAccessAdapterDetected === true,
      writebackBlockingGroups: rdsMigrationEvidence.summary.writebackBlockingGroups || [],
      requiredAuthorizationPackets: rdsMigrationEvidence.summary.requiredAuthorizationPackets || [],
      localBlockers: rdsMigrationEvidence.local?.blockers || [],
    },
    backendCnStatus: {
      report: audit.outputFiles.backendCnStatusJson,
      markdown: audit.outputFiles.backendCnStatusMarkdown,
      ok: backendCnStatus.ok === true,
      currentScope: backendCnStatus.currentScope,
      fullAppLaunchScope: backendCnStatus.fullAppLaunchScope,
      canProceedWithoutWechat: backendCnStatus.canProceedWithoutWechat === true,
      canDeployBackendNow: backendCnStatus.canDeployBackendNow === true,
      backendTargetReady: backendCnStatus.summary.backendTargetReady,
      backendRequiredBlocking: backendCnStatus.summary.backendRequiredBlocking || [],
      wechatDeferredBlocking: backendCnStatus.summary.wechatDeferredBlocking || [],
      appLaunchDeferredBlocking: backendCnStatus.summary.appLaunchDeferredBlocking || [],
      cloudInventoryStrictReady: backendCnStatus.summary.cloudInventoryStrictReady === true,
      cloudResourceEvidenceReady: backendCnStatus.summary.cloudResourceEvidenceReady || "",
      rdsMigrationReady: backendCnStatus.summary.rdsMigrationReady === true,
      rdsLocalExists: backendCnStatus.summary.rdsLocalExists === true,
      imagePublishReady: backendCnStatus.summary.imagePublishReady === true,
      backendTargets: (backendCnStatus.backendTargets || []).map((item) => `${item.id}:ready=${item.ready === true}:blockers=${(item.blockers || []).join("|") || "none"}`),
    },
    backendApplyPackage: {
      report: audit.outputFiles.backendApplyPackageJson,
      markdown: audit.outputFiles.backendApplyPackageMarkdown,
      ok: backendApplyPackage.ok === true,
      packageId: backendApplyPackage.packageId,
      currentScope: backendApplyPackage.currentScope,
      canApplyBackendNowWithoutUserIntervention: backendApplyPackage.canApplyBackendNowWithoutUserIntervention === true,
      canDeployBackendNow: backendApplyPackage.canDeployBackendNow === true,
      immediateBackendSteps: backendApplyPackage.summary.immediateBackendSteps || [],
      blockedBackendSteps: backendApplyPackage.summary.blockedBackendSteps || [],
      actionTimeConfirmationRequired: backendApplyPackage.summary.actionTimeConfirmationRequired || [],
      userInterventionRequired: backendApplyPackage.summary.userInterventionRequired || [],
      deferredAppLaunchBlocking: backendApplyPackage.summary.deferredAppLaunchBlocking || [],
      blockedCredentialCount: backendApplyPackage.summary.blockedCredentialCount || 0,
      readySecretEnvVariableCount: backendApplyPackage.summary.readySecretEnvVariableCount || 0,
      missingCredentialValues: backendApplyPackage.credentialPasswordIntervention?.missingCredentialValues?.names || [],
      missingCredentialValueActionIds: backendApplyPackage.credentialPasswordIntervention?.missingCredentialValues?.actionIds || [],
      readySecretsPendingCloudImport: backendApplyPackage.credentialPasswordIntervention?.readySecretsPendingCloudImport?.count || 0,
      readySecretsPendingCloudImportActionIds: backendApplyPackage.credentialPasswordIntervention?.readySecretsPendingCloudImport?.actionIds || [],
      paidPurchaseConfirmationActionIds: backendApplyPackage.credentialPasswordIntervention?.paidPurchaseConfirmationActionIds || [],
      controlledSecretChannelActionIds: backendApplyPackage.credentialPasswordIntervention?.controlledSecretChannelActionIds || [],
      credentialPasswordIntervention: backendApplyPackage.credentialPasswordIntervention || {},
      actionTimeAuthorizationRequest: backendApplyPackage.actionTimeAuthorizationRequest || null,
      applySteps: (backendApplyPackage.applySteps || []).map((item) =>
        `${item.id}:canStart=${item.canStartAfterActionTimeConfirmation === true}:mutationType=${item.mutationType}:blockers=${(item.currentBlockers || []).join("|") || "none"}`),
    },
    blockerBrief: {
      report: audit.outputFiles.blockerBriefJson,
      markdown: audit.outputFiles.blockerBriefMarkdown,
      ok: blockerBrief.ok === true,
      verdict: blockerBrief.verdict,
      canDeployNow: blockerBrief.canDeployNow === true,
      containsValues: blockerBrief.containsValues === true,
      mutationPerformed: blockerBrief.mutationPerformed === true,
      requiredEnv: blockerBrief.summary.requiredEnv,
      requiredBlocking: blockerBrief.summary.requiredBlocking,
      localCodeReady: blockerBrief.summary.localCodeReady === true,
      releaseEvidenceUsable: blockerBrief.summary.releaseEvidenceUsable === true,
      machineBlocking: blockerBrief.summary.machineBlocking || [],
      manualBlockingCount: blockerBrief.summary.manualBlockingCount || 0,
      bridgeDataLayer: blockerBrief.bridgeDataLayer || null,
      cloudResourceObservations: blockerBrief.cloudResourceObservations || null,
      cloudResourceObservedPartialIds: blockerBrief.summary.cloudResourceObservedPartialIds || [],
      cloudResourceObservedBlockedIds: blockerBrief.summary.cloudResourceObservedBlockedIds || [],
      nextActionSequencing: blockerBrief.nextActionSequencing || null,
      canStartNowWritebackPlan: blockerBrief.canStartNowWritebackPlan || [],
      cloudConfirmationsReady: blockerBrief.summary.cloudConfirmationsReady,
      operatorTasksReady: blockerBrief.summary.operatorTasksReady,
      sensitiveBlocked: blockerBrief.summary.sensitiveBlocked,
      blockedCredentialCount: blockerBrief.summary.blockedCredentialCount || 0,
      blockedCredentialNames: blockerBrief.summary.blockedCredentialNames || [],
      readySecretEnvVariableCount: blockerBrief.summary.readySecretEnvVariableCount || 0,
      readySecretEnvVariableNames: blockerBrief.summary.readySecretEnvVariableNames || [],
      blockedVariableAcquisitionCount: blockerBrief.summary.blockedVariableAcquisitionCount || 0,
      readySecretEnvImportGroupCount: blockerBrief.summary.readySecretEnvImportGroupCount || 0,
      envSourceVercelRequiredCovered: blockerBrief.summary.envSourceVercelRequiredCovered || "unknown",
      envSourceCanMigrateFromVercelProduction: blockerBrief.summary.envSourceCanMigrateFromVercelProduction || 0,
      envSourceAppAliyunOwnedNotInVercel: blockerBrief.summary.envSourceAppAliyunOwnedNotInVercel || 0,
      envSourceBlockedExternalRequired: blockerBrief.summary.envSourceBlockedExternalRequired || [],
      envSourceReadyLocalButMissingFromVercel: blockerBrief.summary.envSourceReadyLocalButMissingFromVercel || [],
      envSourceSecretOrSensitiveToImport: blockerBrief.summary.envSourceSecretOrSensitiveToImport || 0,
      immediateAuthorizationPackets: blockerBrief.summary.immediateAuthorizationPackets,
      cloudInventoryStrictReady: blockerBrief.summary.cloudInventoryStrictReady,
      cloudInventoryInterpretation: blockerBrief.summary.cloudInventoryInterpretation || "",
      cloudInventoryReadinessInterpretation: blockerBrief.cloudInventoryReadinessInterpretation || null,
      canReadCloudNow: blockerBrief.summary.canReadCloudNow === true,
      cliConfigProbeFailureCategory: blockerBrief.summary.cliConfigProbeFailureCategory,
      currentBrowserCanUseCurrentConsole: blockerBrief.summary.currentBrowserCanUseCurrentConsole === true,
      currentBrowserAliyunConsoleTabCount: blockerBrief.summary.currentBrowserAliyunConsoleTabCount || 0,
      wechatOpenAccountVerified: blockerBrief.summary.wechatOpenAccountVerified === true,
      wechatOpenMobileAppCreated: blockerBrief.summary.wechatOpenMobileAppCreated === true,
      wechatOpenCanCreateDraft: blockerBrief.summary.wechatOpenCanCreateDraft === true,
      wechatOpenReadyToSubmitForReview: blockerBrief.summary.wechatOpenReadyToSubmitForReview === true,
      wechatOpenMobileApp: blockerBrief.wechatOpenMobileApp || null,
      envSourceMap: blockerBrief.envSourceMap || null,
      credentialInterventionBrief: blockerBrief.credentialInterventionBrief || {},
      requiredEnvBlockers: blockerBrief.requiredEnvBlockers.map((item) => `${item.name}:${item.status}:${item.importTarget}`),
      requiredEnvBlockerDetails: blockerBrief.requiredEnvBlockers.map((item) => ({
        name: item.name,
        status: item.status,
        required: item.required === true,
        sensitivity: item.sensitivity || "",
        obtainFrom: item.obtainFrom || item.consolePath || "",
        obtain: item.obtain || "",
        importTarget: item.importTarget || "",
        valueHandling: item.valueHandling || "",
        action: item.action || "",
      })),
      blockedVariableAcquisitionPlan: (blockerBrief.blockedVariableAcquisitionPlan || []).map((item) =>
        `${item.name}:${(item.requiredAuthorizationPackets || []).join("|")}:${item.importTarget}`),
      readySecretEnvImportGroups: (blockerBrief.readySecretEnvImportGroups || []).map((group) =>
        `${group.category}:${group.count}:${group.importTarget}`),
    },
    evidenceWriteback: {
      report: audit.outputFiles.evidenceWritebackJson,
      markdown: audit.outputFiles.evidenceWritebackMarkdown,
      ok: evidenceWriteback.ok === true,
      executionMode: evidenceWriteback.executionMode,
      containsValues: evidenceWriteback.containsValues === true,
      secretLeakCheck: evidenceWriteback.secretLeakCheck?.ok === true,
      mutationPerformed: evidenceWriteback.mutationPerformed === true,
      cloudApiCalled: evidenceWriteback.cloudApiCalled === true,
      readyFiles: `${evidenceWriteback.summary.readyFiles}/${evidenceWriteback.summary.files}`,
      totalGaps: evidenceWriteback.summary.totalGaps,
      rdsMigrationGaps: evidenceWriteback.summary.rdsMigrationGaps,
      cloudInventoryResultGaps: evidenceWriteback.summary.cloudInventoryResultGaps,
      cloudConfirmationGaps: evidenceWriteback.summary.cloudConfirmationGaps,
      imagePublishGaps: evidenceWriteback.summary.imagePublishGaps,
      evidenceClosureBrief: evidenceWriteback.evidenceClosureBrief || {},
      blockedCredentialCount: evidenceWriteback.evidenceClosureBrief?.blockedCredentialCount ?? evidenceWriteback.summary?.blockedCredentialCount ?? 0,
      blockedCredentialNames: evidenceWriteback.evidenceClosureBrief?.blockedCredentialNames || evidenceWriteback.summary?.blockedCredentialNames || [],
      readySecretEnvVariableCount: evidenceWriteback.evidenceClosureBrief?.readySecretEnvVariableCount ?? evidenceWriteback.summary?.readySecretEnvVariableCount ?? 0,
      readySecretEnvVariableNames: evidenceWriteback.evidenceClosureBrief?.readySecretEnvVariableNames || evidenceWriteback.summary?.readySecretEnvVariableNames || [],
      resourceEvidenceReady: evidenceWriteback.evidenceClosureBrief?.resourceEvidenceReady || evidenceWriteback.summary?.resourceEvidenceReady || "",
      blockedResourceEvidenceIds: evidenceWriteback.evidenceClosureBrief?.blockedResourceEvidenceIds || evidenceWriteback.summary?.blockedResourceEvidenceIds || [],
      partiallyObservedResourceEvidenceIds: evidenceWriteback.evidenceClosureBrief?.partiallyObservedResourceEvidenceIds || evidenceWriteback.summary?.partiallyObservedResourceEvidenceIds || [],
      blockedResourceEvidence: (evidenceWriteback.evidenceClosureBrief?.blockedResourceEvidence || []).map((item) =>
        `${item.id}:observed=${item.observedStatus}:readiness=${item.observedReadiness}`),
      strictVerificationOrder: evidenceWriteback.strictVerificationOrder || [],
      writebackGroups: Object.values(evidenceWriteback.writebackGroups || {}).map((group) => `${group.key}:ready=${group.ready}:blockers=${group.totalBlockers}`),
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
      credentialBoundary: wechatOpenMobileAppPackage.credentialBoundary || null,
      actionPacket: wechatOpenMobileAppPackage.actionPacket || null,
      submissionBlockers: wechatOpenMobileAppPackage.summary?.submissionBlockers || [],
      androidPackageName: wechatOpenMobileAppPackage.mobileAppCreationPackage?.android?.packageName || "",
      androidSignatureStatus: wechatOpenMobileAppPackage.mobileAppCreationPackage?.androidSignaturePackage?.status || "unknown",
      androidReleaseArtifactReady: wechatOpenMobileAppPackage.mobileAppCreationPackage?.androidSignaturePackage?.releaseArtifactReady === true,
      androidWechatSignatureRecorded: wechatOpenMobileAppPackage.mobileAppCreationPackage?.androidSignaturePackage?.wechatSignatureRecorded === true,
      iosBundleId: wechatOpenMobileAppPackage.mobileAppCreationPackage?.ios?.bundleId || "",
    },
    cloudActionsPackage: {
      report: audit.outputFiles.cloudActionsPackageJson,
      markdown: audit.outputFiles.cloudActionsPackageMarkdown,
      ok: cloudActionsPackage.ok === true,
      packageId: cloudActionsPackage.packageId || "",
      containsValues: cloudActionsPackage.containsValues === true,
      mutationPerformed: cloudActionsPackage.mutationPerformed === true,
      cloudApiCalled: cloudActionsPackage.cloudApiCalled === true,
      cloudActionClosureBrief: cloudActionsPackage.cloudActionClosureBrief || {},
      blockedCredentialCount: cloudActionsPackage.cloudActionClosureBrief?.blockedCredentialCount ?? cloudActionsPackage.summary?.blockedCredentialCount ?? 0,
      blockedCredentialNames: cloudActionsPackage.cloudActionClosureBrief?.blockedCredentialNames || [],
      readySecretEnvVariableCount: cloudActionsPackage.cloudActionClosureBrief?.readySecretEnvVariableCount ?? cloudActionsPackage.summary?.readySecretEnvVariableCount ?? 0,
      readySecretEnvVariableNames: cloudActionsPackage.cloudActionClosureBrief?.readySecretEnvVariableNames || [],
      resourceEvidenceReady: cloudActionsPackage.cloudActionClosureBrief?.resourceEvidenceReady || cloudActionsPackage.summary?.resourceEvidenceReady || "",
      blockedResourceEvidenceIds: cloudActionsPackage.cloudActionClosureBrief?.blockedResourceEvidenceIds || cloudActionsPackage.summary?.blockedResourceEvidenceIds || [],
      partiallyObservedResourceEvidenceIds: cloudActionsPackage.cloudActionClosureBrief?.partiallyObservedResourceEvidenceIds || cloudActionsPackage.summary?.partiallyObservedResourceEvidenceIds || [],
      canStartNowConsoleTasks: cloudActionsPackage.summary?.canStartNowConsoleTasks || [],
      blockedByDependencies: cloudActionsPackage.summary?.blockedByDependencies || [],
      cloudConsolePackets: cloudActionsPackage.summary?.cloudConsolePackets || [],
      executionQueue: cloudActionsPackage.executionQueue || null,
      canReadCloudNow: cloudActionsPackage.summary?.canReadCloudNow === true,
      cloudInventoryResultsReady: cloudActionsPackage.summary?.cloudInventoryResultsReady === true,
      cloudInventoryReadyLocalOperations: cloudActionsPackage.summary?.cloudInventoryReadyLocalOperations || "unknown",
      cloudInventoryExecutedCommandResults: cloudActionsPackage.summary?.cloudInventoryExecutedCommandResults || "unknown",
      imagePublishWritebackBlockingGroups: cloudActionsPackage.summary?.imagePublishWritebackBlockingGroups || [],
      readonlyInventoryStatus: cloudActionsPackage.readonlyInventoryUnblock?.status || "unknown",
      readonlyInventoryCurrentEvidence: cloudActionsPackage.readonlyInventoryUnblock?.currentEvidence || [],
      cliConfigProbeFailureCategory: cloudActionsPackage.summary?.cliConfigProbeFailureCategory || "none",
    },
    androidReleaseSigningPackage: {
      report: audit.outputFiles.androidReleaseSigningPackageJson,
      markdown: audit.outputFiles.androidReleaseSigningPackageMarkdown,
      ok: androidReleaseSigningPackage.ok === true,
      containsValues: androidReleaseSigningPackage.containsValues === true,
      mutationPerformed: androidReleaseSigningPackage.mutationPerformed === true,
      canStartNow: androidReleaseSigningPackage.summary?.canStartNow === true,
      readyForWechatAndroidSignature: androidReleaseSigningPackage.summary?.readyForWechatAndroidSignature === true,
      androidPackageName: androidReleaseSigningPackage.summary?.androidPackageName || "",
      releaseSigningConfig: androidReleaseSigningPackage.summary?.releaseSigningConfig || "",
      releaseSigningConfigReady: androidReleaseSigningPackage.summary?.releaseSigningConfigReady === true,
      releaseUsesDebugSigning: androidReleaseSigningPackage.summary?.releaseUsesDebugSigning === true,
      releaseArtifactReady: androidReleaseSigningPackage.summary?.releaseArtifactReady === true,
      wechatSignatureRecorded: androidReleaseSigningPackage.summary?.wechatSignatureRecorded === true,
      androidConfigured: androidReleaseSigningPackage.summary?.androidConfigured === true,
      currentBlockers: androidReleaseSigningPackage.currentBlockers || [],
      variableNames: androidReleaseSigningPackage.signingInputs?.variableNames || [],
      actionPacket: androidReleaseSigningPackage.actionPacket || null,
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
      actionTimeAuthorizationRequest: operatorHandoff.actionTimeAuthorizationRequest || null,
      blockingRequiredEnv: operatorHandoff.missingVariables.required.map((item) => item.name),
      appLaunchBlockingVariables: operatorHandoff.appLaunchBlocking.variables.map((item) => item.name),
      appLaunchBlockingStates: operatorHandoff.appLaunchBlocking.states.map((item) => `${item.name}:${item.status}`),
      optionalDeferredEnv: operatorHandoff.missingVariables.optionalDeferred.map((item) => item.name),
      sensitiveActionItems: (operatorHandoff.sensitiveActionItems || []).map((item) => `${item.id}:${item.status}`),
      operatorClosureBrief: operatorHandoff.operatorClosureBrief || {},
      blockedCredentialCount: operatorHandoff.operatorClosureBrief?.blockedCredentialCount || 0,
      readySecretEnvVariableCount: operatorHandoff.operatorClosureBrief?.readySecretEnvVariableCount || 0,
      resourceEvidenceReady: operatorHandoff.operatorClosureBrief?.resourceEvidenceReady || "",
      blockedResourceEvidenceIds: operatorHandoff.operatorClosureBrief?.blockedResourceEvidenceIds || [],
      canStartNowConsoleTasks: operatorHandoff.aliyunConsoleTaskOrder?.canStartNow || [],
      blockedByConsoleTaskDependencies: operatorHandoff.aliyunConsoleTaskOrder?.blockedByDependencies || [],
      aliyunConsoleTasks: (operatorHandoff.aliyunConsoleTaskOrder?.tasks || []).map((task) => `${task.id}:${task.status}:canStartNow=${task.canStartNow}`),
      bridgeDataLayer: operatorHandoff.bridgeDataLayer || null,
      localEvidenceGaps: {
        cloudInventoryResults: {
          exists: operatorHandoff.localEvidenceGaps?.cloudInventoryResults?.exists === true,
          ready: operatorHandoff.localEvidenceGaps?.cloudInventoryResults?.ready === true,
          checkedOperations: operatorHandoff.localEvidenceGaps?.cloudInventoryResults?.checkedOperations ?? 0,
          observationSummary: operatorHandoff.localEvidenceGaps?.cloudInventoryResults?.observationSummary || {},
          totalBlockers: operatorHandoff.localEvidenceGaps?.cloudInventoryResults?.totalBlockers ?? 0,
        },
        cloudConfirmations: {
          ready: operatorHandoff.localEvidenceGaps?.cloudConfirmations?.ready === true,
          totalBlockers: operatorHandoff.localEvidenceGaps?.cloudConfirmations?.totalBlockers ?? 0,
        },
        rdsMigration: {
          exists: operatorHandoff.localEvidenceGaps?.rdsMigration?.exists === true,
          ready: operatorHandoff.localEvidenceGaps?.rdsMigration?.ready === true,
          totalBlockers: operatorHandoff.localEvidenceGaps?.rdsMigration?.totalBlockers ?? 0,
          appApiRoutesWithSupabase: operatorHandoff.localEvidenceGaps?.rdsMigration?.appApiRoutesWithSupabase ?? 0,
          firstVersionRdsRoutesWithSupabaseDataAccess: operatorHandoff.localEvidenceGaps?.rdsMigration?.firstVersionRdsRoutesWithSupabaseDataAccess ?? 0,
          postgresDataAccessAdapterDetected: operatorHandoff.localEvidenceGaps?.rdsMigration?.postgresDataAccessAdapterDetected === true,
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
    envSourceMapJson: audit.outputFiles.envSourceMapJson,
    envSourceMapMarkdown: audit.outputFiles.envSourceMapMarkdown,
    vercelEnvCoverageReport: audit.outputFiles.vercelEnvCoverage,
    domainReadinessReport: audit.outputFiles.domainReadiness,
    cloudAccessReport: audit.outputFiles.cloudAccess,
    cloudInventoryPlanJson: audit.outputFiles.cloudInventoryPlanJson,
    cloudInventoryPlanMarkdown: audit.outputFiles.cloudInventoryPlanMarkdown,
    cloudInventoryRunnerJson: audit.outputFiles.cloudInventoryRunnerJson,
    cloudInventoryRunnerMarkdown: audit.outputFiles.cloudInventoryRunnerMarkdown,
    cloudshellReadonlyCollectorJson: audit.outputFiles.cloudshellReadonlyCollectorJson,
    cloudshellReadonlyCollectorMarkdown: audit.outputFiles.cloudshellReadonlyCollectorMarkdown,
    cloudshellReadonlyCollectorScript: audit.outputFiles.cloudshellReadonlyCollectorScript,
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
    cloudActionsPackageJson: audit.outputFiles.cloudActionsPackageJson,
    cloudActionsPackageMarkdown: audit.outputFiles.cloudActionsPackageMarkdown,
    provisioningPlanJson: audit.outputFiles.provisioningPlanJson,
    provisioningPlanMarkdown: audit.outputFiles.provisioningPlanMarkdown,
    actionAuthorizationJson: audit.outputFiles.actionAuthorizationJson,
    actionAuthorizationMarkdown: audit.outputFiles.actionAuthorizationMarkdown,
    completionAuditJson: audit.outputFiles.completionAuditJson,
    completionAuditMarkdown: audit.outputFiles.completionAuditMarkdown,
    rdsMigrationPlanJson: audit.outputFiles.rdsMigrationPlanJson,
    rdsMigrationPlanMarkdown: audit.outputFiles.rdsMigrationPlanMarkdown,
    rdsRouteMigrationMapJson: audit.outputFiles.rdsRouteMigrationMapJson,
    rdsRouteMigrationMapMarkdown: audit.outputFiles.rdsRouteMigrationMapMarkdown,
    rdsMigrationPackageDir: audit.outputFiles.rdsMigrationPackageDir,
    rdsMigrationPackageJson: audit.outputFiles.rdsMigrationPackageJson,
    rdsMigrationPackageMarkdown: audit.outputFiles.rdsMigrationPackageMarkdown,
    rdsMigrationPackageSchemaSql: audit.outputFiles.rdsMigrationPackageSchemaSql,
    rdsMigrationPackageValidationSql: audit.outputFiles.rdsMigrationPackageValidationSql,
    rdsMigrationPackageRollbackChecklist: audit.outputFiles.rdsMigrationPackageRollbackChecklist,
    rdsMigrationEvidenceJson: audit.outputFiles.rdsMigrationEvidenceJson,
    rdsMigrationEvidenceMarkdown: audit.outputFiles.rdsMigrationEvidenceMarkdown,
    backendCnStatusJson: audit.outputFiles.backendCnStatusJson,
    backendCnStatusMarkdown: audit.outputFiles.backendCnStatusMarkdown,
    backendApplyPackageJson: audit.outputFiles.backendApplyPackageJson,
    backendApplyPackageMarkdown: audit.outputFiles.backendApplyPackageMarkdown,
    evidenceWritebackJson: audit.outputFiles.evidenceWritebackJson,
    evidenceWritebackMarkdown: audit.outputFiles.evidenceWritebackMarkdown,
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
    "  node scripts/prepare-aliyun-release-artifacts.mjs [--env-file path] [--cloud-confirmations path] [--cloud-inventory-results path] [--out-dir /tmp/path] [--skip-bundle] [--skip-vercel-env-coverage] [--vercel-env-coverage-input /tmp/vercel-env.json] [--backend-only]",
    "",
    "Creates non-secret production-cn release audit files and a Docker context tarball outside the repo by default.",
    "--backend-only keeps deferred WeChat/Android/Apple launch gaps out of the current backend deployment scope.",
    "Progress is written to stderr by default; set MEIYE_RELEASE_ARTIFACTS_PROGRESS=0 to suppress it.",
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
