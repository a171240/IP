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
  const appClientContract = audit.checks.appClientContract
  const appApiSmokeCoverage = audit.checks.appApiSmokeCoverage
  const docker = audit.checks.dockerContext
  const bundle = audit.bundle
  const vercelEnvCoverage = audit.checks.vercelEnvCoverage
  const domain = audit.checks.domain
  const deploymentSpec = audit.checks.deploymentSpec
  const legalPages = audit.checks.legalPages
  const imagePublishPlan = audit.checks.imagePublishPlan
  const operatorTasks = audit.checks.operatorTasks
  const cloudConfirmationsCheck = audit.checks.cloudConfirmationsCheck
  const cloudConfirmations = readiness.checks?.cloudConfirmations
  const appProductionConfig = readiness.checks?.appProductionConfig
  const appEnvTemplate = appProductionConfig?.envTemplate
  const appNativeRelease = appProductionConfig?.nativeRelease
  return [
    "# 美业话镜 APP production-cn 阿里云发布审计",
    "",
    `生成时间：${audit.generatedAt}`,
    "",
    "## 结论",
    "",
    `- productionReady: ${readiness.productionReady}`,
    `- localCodeReady: ${readiness.localCodeReady}`,
    `- env requiredReady: ${env.requiredReady} / ${env.requiredTotal}`,
    `- env sourceMetadataReady: ${env.planSourceMetadataReady || 0} / ${env.planVariables || 0}`,
    `- routes: ${routes.checkedRoutes} checked, ${routes.failures.length} failures`,
    `- appClientContract: ${appClientContract.auditedClientApiCalls} audited calls, ${appClientContract.uniqueAuditedClientRoutes} unique client routes`,
    `- appApiSmokeCoverage: ${appApiSmokeCoverage.coveredBusinessRoutes} / ${appApiSmokeCoverage.businessRoutes} business routes`,
    `- dockerContext: ${docker.ok ? "ok" : "not ok"}`,
    `- deploymentSpec: ${deploymentSpec.ok ? "ok" : "not ready"}`,
    `- legalPages: ${legalPages.ok ? "ok" : "not ready"}`,
    `- imagePublishPlan: ${imagePublishPlan.ready === true ? "ready" : "not ready"}`,
    `- domainReadiness: ${domain.ok ? "ok" : "not ready"} (${domain.targetReady} / ${domain.targetTotal})`,
    `- appNativeRelease: ${appNativeRelease?.ok === true ? "ready" : "not ready"}`,
    `- operatorTasks: ${operatorTasks.summary.ready} / ${operatorTasks.summary.total} ready`,
    `- cloudConfirmations: ${cloudConfirmations?.ready ? "ready" : "not ready"}`,
    `- cloudConfirmationsCheck: template ${cloudConfirmationsCheck?.template?.ready ? "ready" : "not ready"}, local ${cloudConfirmationsCheck?.local?.ready ? "ready" : "not ready"}`,
    `- vercelEnvCoverage: ${vercelEnvCoverage?.ok ? "ok" : vercelEnvCoverage?.skipped ? "skipped" : "not ok"}`,
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
    "## APP production-cn 配置模板",
    "",
    `- files: ${appProductionConfig?.files?.ready === true ? "ready" : "not ready"} (${appProductionConfig?.files?.checked ?? 0} checked)`,
    `- scripts: ${appProductionConfig?.scripts?.ready === true ? "ready" : "not ready"} (${appProductionConfig?.scripts?.checked ?? 0} checked)`,
    `- envTemplate: ${appEnvTemplate?.ready === true ? "ready" : "not ready"} (${appEnvTemplate?.checked ?? 0} canonical keys checked)`,
    `- envTemplateKeyCount: ${appEnvTemplate?.keyCount ?? 0}`,
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
    `- predeployChecks: ${deploymentSpec.predeployChecks}`,
    `- postdeployChecks: ${deploymentSpec.postdeployChecks}`,
    ...(deploymentSpec.blockers?.length
      ? deploymentSpec.blockers.map((item) => `- ${item}`)
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
    `- pendingCloud: ${operatorTasks.summary.pendingCloud}`,
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
    "- containsValues: false",
    `- sourceMetadataReady: ${env.planSourceMetadataReady || 0} / ${env.planVariables || 0}`,
    `- requiredBlocking: ${env.planRequiredBlocking?.length ? env.planRequiredBlocking.join(", ") : "none"}`,
    "- per-variable fields: sensitivity, owner, consolePath, obtain, importTarget, cloudConfirmationKey",
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
  const deploymentSpec = runJson("deployment_spec", ["scripts/check-aliyun-deployment-spec.mjs"])
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
  const cloudConfirmationsCheck = runJson("cloud_confirmations", [
    "scripts/check-aliyun-cloud-confirmations.mjs",
    ...(args.cloudConfirmationsFile ? ["--local", args.cloudConfirmationsFile] : []),
    "--allow-incomplete",
  ])
  const routes = runJson("routes", ["scripts/check-app-api-production-cn-routes.mjs"])
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
    git: {
      branch: git(["branch", "--show-current"]),
      head: git(["rev-parse", "HEAD"]),
      statusShort: git(["status", "--short"]),
    },
    checks: {
      env,
      readiness,
      domain,
      deploymentSpec,
      legalPages,
      imagePublishPlan,
      operatorTasks,
      cloudConfirmationsCheck,
      routes,
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
      vercelEnvCoverage: vercelEnvCoverage.ok ? resolve(args.outDir, "vercel-env-coverage.json") : null,
      domainReadiness: resolve(args.outDir, "domain-readiness.json"),
      cloudConfirmationsCheck: cloudConfirmationsCheckPath,
      legalPages: resolve(args.outDir, "legal-pages.json"),
      imagePublishPlan: resolve(args.outDir, "image-publish-plan-check.json"),
      operatorTasksJson: operatorTasksJsonPath,
      operatorTasksMarkdown: operatorTasksMarkdownPath,
      bundle: bundle?.path || null,
    },
  }

  writeText(audit.outputFiles.auditJson, JSON.stringify(audit, null, 2))
  writeText(audit.outputFiles.auditMarkdown, renderMarkdown(audit))
  writeText(audit.outputFiles.domainReadiness, JSON.stringify(domain, null, 2))
  writeText(audit.outputFiles.cloudConfirmationsCheck, JSON.stringify(cloudConfirmationsCheck, null, 2))
  writeText(audit.outputFiles.legalPages, JSON.stringify(legalPages, null, 2))
  writeText(audit.outputFiles.imagePublishPlan, JSON.stringify(imagePublishPlan, null, 2))

  console.log(JSON.stringify({
    ok: true,
    outDir: args.outDir,
    productionReady: readiness.productionReady,
    localCodeReady: readiness.localCodeReady,
    machineBlocking: readiness.machineBlocking,
    manualBlockingCount: readiness.manualBlocking.length,
    cloudConfirmationsReady: readiness.checks?.cloudConfirmations?.ready === true,
    deploymentSpec: {
      ok: deploymentSpec.ok === true,
      image: deploymentSpec.image,
      port: deploymentSpec.port,
      apiHost: deploymentSpec.apiHost,
      predeployChecks: deploymentSpec.predeployChecks,
      postdeployChecks: deploymentSpec.postdeployChecks,
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
    appProductionConfig: {
      filesReady: readiness.checks?.appProductionConfig?.files?.ready === true,
      scriptsReady: readiness.checks?.appProductionConfig?.scripts?.ready === true,
      envTemplateReady: readiness.checks?.appProductionConfig?.envTemplate?.ready === true,
      envTemplateKeyCount: readiness.checks?.appProductionConfig?.envTemplate?.keyCount ?? 0,
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
    vercelEnvCoverageReport: audit.outputFiles.vercelEnvCoverage,
    domainReadinessReport: audit.outputFiles.domainReadiness,
    cloudConfirmationsCheckReport: audit.outputFiles.cloudConfirmationsCheck,
    operatorTasksJson: audit.outputFiles.operatorTasksJson,
    operatorTasksMarkdown: audit.outputFiles.operatorTasksMarkdown,
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
    "  node scripts/prepare-aliyun-release-artifacts.mjs [--env-file path] [--cloud-confirmations path] [--out-dir /tmp/path] [--skip-bundle] [--skip-vercel-env-coverage] [--vercel-env-coverage-input /tmp/vercel-env.json]",
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
