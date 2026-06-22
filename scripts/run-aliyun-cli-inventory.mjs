#!/usr/bin/env node

import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_TEMPLATE_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-inventory-results.example.json")
const DEFAULT_OUT_FILE = ""
const DEFAULT_MARKDOWN_FILE = ""
const DEFAULT_WRITE_LOCAL_FILE = ""
const ALLOW_ENV = "MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY"
const EXPECTED_SOURCE_PLAN_COMMAND = "corepack pnpm aliyun:cloud:inventory-plan"

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /:\/\/[^\s:@]+:[^\s@]+@/,
  /(password|passwd|pwd|token|secret|access[_-]?key)\s*[:=]\s*[^,\s]{8,}/i,
]

function parseArgs(argv) {
  const args = {
    templateFile: DEFAULT_TEMPLATE_FILE,
    out: DEFAULT_OUT_FILE,
    markdown: DEFAULT_MARKDOWN_FILE,
    writeLocal: DEFAULT_WRITE_LOCAL_FILE,
    executeReadonly: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--template") {
      args.templateFile = resolveValue(argv[++index], "--template")
      continue
    }
    if (arg === "--out") {
      args.out = resolveValue(argv[++index], "--out")
      continue
    }
    if (arg === "--markdown") {
      args.markdown = resolveValue(argv[++index], "--markdown")
      continue
    }
    if (arg === "--write-local") {
      args.writeLocal = resolveValue(argv[++index], "--write-local")
      continue
    }
    if (arg === "--execute-readonly") {
      args.executeReadonly = true
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

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function writeText(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function splitCommand(command) {
  const parts = String(command || "").trim().split(/\s+/).filter(Boolean)
  if (parts[0] !== "aliyun") throw new Error(`unsupported_command:${command}`)
  if (parts.some((part) => /[<>]/.test(part))) throw new Error(`placeholder_command_not_executable:${command}`)
  return parts
}

function validateTemplate(template) {
  const blockers = []
  if (template.schemaVersion !== 1) blockers.push("schemaVersion=1")
  if (template.environment !== "production-cn") blockers.push("environment=production-cn")
  if (template.sourcePlanCommand !== EXPECTED_SOURCE_PLAN_COMMAND) blockers.push("sourcePlanCommand")
  if (!Array.isArray(template.operations) || template.operations.length === 0) blockers.push("operations")
  for (const operation of template.operations || []) {
    if (operation.readOnly !== true) blockers.push(`${operation.id}:readOnly=true`)
    const command = operation.commandResults?.[0]?.command || ""
    if (!command.startsWith("aliyun ")) blockers.push(`${operation.id}:command=aliyun`)
    if (/\b(Create|Update|Delete|DeployApplication|StartApplication|StopApplication|GetAuthorizationToken|GetUserCertificateDetail)\b|\s(cp|cat|sign|rm|mb)\s/i.test(command)) {
      blockers.push(`${operation.id}:unsafe_command:${command}`)
    }
  }
  const secretMatches = findSecretLikeValues(template)
  if (secretMatches.length) blockers.push(`template_contains_secret_like_values:${secretMatches.join(",")}`)
  return blockers
}

function commandFingerprint(command, stdout, stderr) {
  return createHash("sha256")
    .update(JSON.stringify({
      command,
      stdout: stdout || "",
      stderr: stderr || "",
    }))
    .digest("hex")
}

function executeOperation(operation) {
  const command = operation.commandResults?.[0]?.command || ""
  const parts = splitCommand(command)
  const startedAt = new Date().toISOString()
  const result = spawnSync(parts[0], parts.slice(1), {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  })
  const stdout = result.stdout || ""
  const stderr = result.stderr || ""
  const status = typeof result.status === "number" ? result.status : 1
  const fingerprint = commandFingerprint(command, stdout, stderr)
  const stdoutLines = stdout ? stdout.trim().split(/\r?\n/).filter(Boolean).length : 0
  const stderrLines = stderr ? stderr.trim().split(/\r?\n/).filter(Boolean).length : 0
  return {
    command,
    executed: true,
    exitStatus: status,
    cloudApiCalled: true,
    mutationPerformed: false,
    observedAt: startedAt,
    outputSummary: `exit=${status}; stdoutLines=${stdoutLines}; stderrLines=${stderrLines}; outputSha256=${fingerprint}`,
    evidence: `readonly_cli_${operation.id}_${startedAt.replace(/[:.]/g, "-")}_${fingerprint.slice(0, 16)}`,
  }
}

function dryRunOperation(operation) {
  const command = operation.commandResults?.[0]?.command || ""
  return {
    command,
    executed: false,
    exitStatus: null,
    cloudApiCalled: false,
    mutationPerformed: false,
    observedAt: "DRY_RUN_NOT_EXECUTED",
    outputSummary: "DRY_RUN_NOT_EXECUTED",
    evidence: "DRY_RUN_NOT_EXECUTED",
  }
}

function buildLocalResults(template, args) {
  const executing = args.executeReadonly === true
  const operations = (template.operations || []).map((operation) => {
    const result = executing ? executeOperation(operation) : dryRunOperation(operation)
    return {
      id: operation.id,
      title: operation.title,
      product: operation.product,
      readOnly: true,
      status: executing && result.exitStatus === 0 ? "observed" : executing ? "blocked" : "skipped",
      commandResults: [result],
      writesTo: operation.writesTo || [],
      evidence: executing && result.exitStatus === 0
        ? `readonly_cli_${operation.id}_${result.observedAt.replace(/[:.]/g, "-")}`
        : "DRY_RUN_NOT_EXECUTED",
    }
  })
  return {
    schemaVersion: 1,
    environment: "production-cn",
    updatedAt: new Date().toISOString(),
    operator: executing ? "codex_readonly_inventory_runner" : "codex_dry_run",
    sourcePlanCommand: EXPECTED_SOURCE_PLAN_COMMAND,
    notes: executing
      ? "Generated by run-aliyun-cli-inventory.mjs using allowlisted read-only Aliyun CLI commands. No raw command output or secrets are stored."
      : "Dry run only. No Aliyun CLI command was executed.",
    operations,
  }
}

function buildReport(args) {
  if (!existsSync(args.templateFile)) throw new Error(`template_not_found:${args.templateFile}`)
  const template = readJson(args.templateFile)
  const templateBlockers = validateTemplate(template)
  const executeAllowed = args.executeReadonly === true && String(process.env[ALLOW_ENV] || "") === "1"
  if (args.executeReadonly && !executeAllowed) {
    throw new Error(`execute_readonly_requires_env:${ALLOW_ENV}=1`)
  }
  const localResults = buildLocalResults(template, args)
  const commandCount = localResults.operations.reduce((total, operation) => total + operation.commandResults.length, 0)
  const report = {
    ok: templateBlockers.length === 0,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    executionMode: args.executeReadonly ? "execute_readonly" : "dry_run",
    executeReadonlyRequested: args.executeReadonly === true,
    executeReadonlyAllowed: executeAllowed,
    containsValues: false,
    readOnlyOnly: true,
    cloudApiCalled: args.executeReadonly === true,
    cloudMutationPerformed: false,
    mutationPerformed: false,
    templateFile: args.templateFile,
    writeLocal: args.writeLocal || null,
    blockers: templateBlockers,
    summary: {
      operations: localResults.operations.length,
      commands: commandCount,
      executedCommands: localResults.operations.flatMap((operation) => operation.commandResults).filter((result) => result.executed).length,
      successfulCommands: localResults.operations.flatMap((operation) => operation.commandResults).filter((result) => result.exitStatus === 0).length,
      failedCommands: localResults.operations.flatMap((operation) => operation.commandResults).filter((result) => result.executed && result.exitStatus !== 0).length,
      dryRunCommands: localResults.operations.flatMap((operation) => operation.commandResults).filter((result) => !result.executed).length,
    },
    allowedCommandCatalog: localResults.operations.map((operation) => ({
      id: operation.id,
      product: operation.product,
      command: operation.commandResults[0]?.command || "",
      writesTo: operation.writesTo || [],
    })),
    localResults,
    safetyBoundary: [
      "Default mode is dry_run and executes no Aliyun command.",
      `Execution requires --execute-readonly and ${ALLOW_ENV}=1.`,
      "Only the allowlisted commandResults[0].command from the tracked inventory-results template is executable.",
      "Raw stdout/stderr are never written; only line counts and SHA-256 evidence handles are stored.",
      "Mutation commands, credential/token commands, docker login/push, OSS object reads/writes, and certificate private-key/detail reads are rejected.",
    ],
  }
  const secretMatches = findSecretLikeValues(report)
  report.secretLeakCheck = {
    ok: secretMatches.length === 0,
    matches: secretMatches,
  }
  if (secretMatches.length) {
    report.ok = false
    report.containsValues = true
    report.blockers.push(`contains_secret_like_values:${secretMatches.join(",")}`)
  }
  if (args.writeLocal) writeText(args.writeLocal, JSON.stringify(localResults, null, 2))
  return report
}

function renderMarkdown(report) {
  return [
    "# 阿里云 CLI 只读 Inventory Runner",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- executionMode: ${report.executionMode}`,
    `- executeReadonlyRequested: ${report.executeReadonlyRequested}`,
    `- executeReadonlyAllowed: ${report.executeReadonlyAllowed}`,
    `- cloudApiCalled: ${report.cloudApiCalled}`,
    `- cloudMutationPerformed: ${report.cloudMutationPerformed}`,
    `- containsValues: ${report.containsValues}`,
    `- operations: ${report.summary.operations}`,
    `- executedCommands: ${report.summary.executedCommands}`,
    `- successfulCommands: ${report.summary.successfulCommands}`,
    `- failedCommands: ${report.summary.failedCommands}`,
    `- dryRunCommands: ${report.summary.dryRunCommands}`,
    "",
    "## Allowed Commands",
    "",
    ...report.allowedCommandCatalog.map((item) => `- ${item.id}: \`${item.command}\` -> ${item.writesTo.join("; ")}`),
    "",
    "## Safety Boundary",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
    "",
  ].join("\n")
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

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/run-aliyun-cli-inventory.mjs [--template path] [--out report.json] [--markdown report.md] [--write-local result.local.json] [--execute-readonly]",
    "",
    "Dry-run is the default and executes no cloud command.",
    `Execution requires --execute-readonly and ${ALLOW_ENV}=1, then runs only allowlisted read-only Aliyun CLI commands from the tracked inventory-results template.`,
  ].join("\n"))
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildReport(args)
  const output = `${JSON.stringify(report, null, 2)}\n`
  if (args.out) writeText(args.out, output)
  if (args.markdown) writeText(args.markdown, renderMarkdown(report))
  process.stdout.write(output)
  if (!report.ok) process.exit(1)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
