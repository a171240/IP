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
  const appApiSmokeCoverage = audit.checks.appApiSmokeCoverage
  const docker = audit.checks.dockerContext
  const bundle = audit.bundle
  const vercelEnvCoverage = audit.checks.vercelEnvCoverage
  const domain = audit.checks.domain
  const operatorTasks = audit.checks.operatorTasks
  const cloudConfirmations = readiness.checks?.cloudConfirmations
  const appProductionConfig = readiness.checks?.appProductionConfig
  const appEnvTemplate = appProductionConfig?.envTemplate
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
    `- routes: ${routes.checkedRoutes} checked, ${routes.failures.length} failures`,
    `- appApiSmokeCoverage: ${appApiSmokeCoverage.coveredBusinessRoutes} / ${appApiSmokeCoverage.businessRoutes} business routes`,
    `- dockerContext: ${docker.ok ? "ok" : "not ok"}`,
    `- domainReadiness: ${domain.ok ? "ok" : "not ready"} (${domain.targetReady} / ${domain.targetTotal})`,
    `- operatorTasks: ${operatorTasks.summary.ready} / ${operatorTasks.summary.total} ready`,
    `- cloudConfirmations: ${cloudConfirmations?.ready ? "ready" : "not ready"}`,
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
    ...(appEnvTemplate?.deprecatedKeys?.length
      ? [
          "- deprecatedKeys:",
          ...appEnvTemplate.deprecatedKeys.map((item) => `  - ${item}`),
        ]
      : []),
    "",
    "## 域名 DNS / HTTPS 检查",
    "",
    `- ready: ${domain.ok}`,
    `- targetReady: ${domain.targetReady} / ${domain.targetTotal}`,
    ...(domain.machineBlocking?.length
      ? domain.machineBlocking.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## 操作员任务清单",
    "",
    `- json: ${audit.outputFiles.operatorTasksJson}`,
    `- markdown: ${audit.outputFiles.operatorTasksMarkdown}`,
    `- ready: ${operatorTasks.summary.ready} / ${operatorTasks.summary.total}`,
    `- blocked: ${operatorTasks.summary.blocked}`,
    `- pendingCloud: ${operatorTasks.summary.pendingCloud}`,
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
    `- requiredBlocking: ${env.planRequiredBlocking?.length ? env.planRequiredBlocking.join(", ") : "none"}`,
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
  const operatorTasksJsonPath = resolve(args.outDir, "operator-tasks.json")
  const operatorTasksMarkdownPath = resolve(args.outDir, "operator-tasks.md")
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
  const routes = runJson("routes", ["scripts/check-app-api-production-cn-routes.mjs"])
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
      operatorTasks,
      routes,
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
      operatorTasksJson: operatorTasksJsonPath,
      operatorTasksMarkdown: operatorTasksMarkdownPath,
      bundle: bundle?.path || null,
    },
  }

  writeText(audit.outputFiles.auditJson, JSON.stringify(audit, null, 2))
  writeText(audit.outputFiles.auditMarkdown, renderMarkdown(audit))
  writeText(audit.outputFiles.domainReadiness, JSON.stringify(domain, null, 2))

  console.log(JSON.stringify({
    ok: true,
    outDir: args.outDir,
    productionReady: readiness.productionReady,
    localCodeReady: readiness.localCodeReady,
    machineBlocking: readiness.machineBlocking,
    manualBlockingCount: readiness.manualBlocking.length,
    cloudConfirmationsReady: readiness.checks?.cloudConfirmations?.ready === true,
    appProductionConfig: {
      filesReady: readiness.checks?.appProductionConfig?.files?.ready === true,
      scriptsReady: readiness.checks?.appProductionConfig?.scripts?.ready === true,
      envTemplateReady: readiness.checks?.appProductionConfig?.envTemplate?.ready === true,
      envTemplateKeyCount: readiness.checks?.appProductionConfig?.envTemplate?.keyCount ?? 0,
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
