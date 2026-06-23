#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_TEMPLATE_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-inventory-results.example.json")
const DEFAULT_LOCAL_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-inventory-results.local.json")

const EXPECTED_OPERATIONS = Object.freeze([
  ["I01_SAE_RUNTIME", "sae"],
  ["I02_ACR_IMAGE", "cr"],
  ["I03_DNS_API_DOMAIN", "alidns"],
  ["I04_DNS_ASSET_DOMAIN", "alidns"],
  ["I05_OSS_AUDIO_BUCKET", "oss"],
  ["I06_SLS_ALERTS", "sls"],
  ["I07_CERT_HTTPS", "cas"],
])

const TOP_LEVEL_FIELDS = new Set([
  "schemaVersion",
  "environment",
  "updatedAt",
  "operator",
  "sourcePlanCommand",
  "notes",
  "operations",
])

const OPERATION_FIELDS = new Set([
  "id",
  "title",
  "product",
  "readOnly",
  "status",
  "commandResults",
  "writesTo",
  "evidence",
])

const RESULT_FIELDS = new Set([
  "command",
  "executed",
  "exitStatus",
  "cloudApiCalled",
  "mutationPerformed",
  "observedAt",
  "outputSummary",
  "evidence",
])

const ALLOWED_LOCAL_STATUS = new Set(["observed", "not_found", "blocked", "skipped"])
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
    localFile: DEFAULT_LOCAL_FILE,
    allowIncomplete: false,
    out: "",
    markdown: "",
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--template") {
      args.templateFile = resolveValue(argv[++index], "--template")
      continue
    }
    if (arg === "--local") {
      args.localFile = resolveValue(argv[++index], "--local")
      continue
    }
    if (arg === "--allow-incomplete") {
      args.allowIncomplete = true
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
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function validateFile(filePath, mode) {
  if (!existsSync(filePath)) {
    return {
      file: filePath,
      mode,
      exists: false,
      ready: false,
      blockers: ["file_missing"],
      warnings: [],
      operations: [],
    }
  }

  const data = readJson(filePath)
  const blockers = []
  const warnings = []
  const topLevelUnknown = Object.keys(data).filter((field) => !TOP_LEVEL_FIELDS.has(field))
  if (topLevelUnknown.length) warnings.push(`unknown_top_level_fields:${topLevelUnknown.join(",")}`)
  if (data.schemaVersion !== 1) blockers.push("schemaVersion=1")
  if (data.environment !== "production-cn") blockers.push("environment=production-cn")
  if (data.sourcePlanCommand !== "corepack pnpm aliyun:cloud:inventory-plan") {
    blockers.push("sourcePlanCommand")
  }
  if (!Array.isArray(data.operations)) blockers.push("operations_array_required")

  const secretMatches = findSecretLikeValues(data)
  if (secretMatches.length) blockers.push(`contains_secret_like_values:${secretMatches.join(",")}`)

  const operations = Array.isArray(data.operations) ? data.operations.map((operation) => validateOperation(operation, mode)) : []
  const byId = new Map(operations.map((operation) => [operation.id, operation]))
  for (const [id] of EXPECTED_OPERATIONS) {
    if (!byId.has(id)) blockers.push(`missing_operation:${id}`)
  }
  for (const operation of operations) {
    if (!EXPECTED_OPERATIONS.some(([id]) => id === operation.id)) warnings.push(`unknown_operation:${operation.id}`)
    blockers.push(...operation.blockers.map((blocker) => `${operation.id}:${blocker}`))
    warnings.push(...operation.warnings.map((warning) => `${operation.id}:${warning}`))
  }

  return {
    file: filePath,
    mode,
    exists: true,
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    operations,
  }
}

function validateOperation(rawOperation, mode) {
  const blockers = []
  const warnings = []
  const id = String(rawOperation?.id || "")
  const expected = EXPECTED_OPERATIONS.find(([operationId]) => operationId === id)
  if (!rawOperation || typeof rawOperation !== "object" || Array.isArray(rawOperation)) {
    return { id: "unknown", ready: false, blockers: ["operation_object_required"], warnings: [] }
  }
  const unknownFields = Object.keys(rawOperation).filter((field) => !OPERATION_FIELDS.has(field))
  if (unknownFields.length) warnings.push(`unknown_fields:${unknownFields.join(",")}`)
  for (const field of OPERATION_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(rawOperation, field)) blockers.push(`missing:${field}`)
  }
  if (!expected) warnings.push("operation_not_in_plan")
  if (expected && String(rawOperation.product || "") !== expected[1]) blockers.push(`product=${expected[1]}`)
  if (rawOperation.readOnly !== true) blockers.push("readOnly=true")
  if (mode === "template") {
    if (!["pending", "observed", "not_found", "blocked", "skipped"].includes(String(rawOperation.status || ""))) {
      blockers.push("status")
    }
  } else if (!ALLOWED_LOCAL_STATUS.has(String(rawOperation.status || ""))) {
    blockers.push("status")
  }
  if (mode === "local" && String(rawOperation.status || "") === "pending") blockers.push("status_not_pending")
  if (!Array.isArray(rawOperation.commandResults) || rawOperation.commandResults.length === 0) {
    blockers.push("commandResults")
  }
  if (!Array.isArray(rawOperation.writesTo) || rawOperation.writesTo.length === 0) blockers.push("writesTo")
  if (mode === "local" && isPlaceholder(rawOperation.evidence)) blockers.push("evidence")

  const commandResults = Array.isArray(rawOperation.commandResults)
    ? rawOperation.commandResults.map((result, index) => validateCommandResult(result, mode, index))
    : []
  for (const result of commandResults) {
    blockers.push(...result.blockers.map((blocker) => `commandResults[${result.index}]:${blocker}`))
    warnings.push(...result.warnings.map((warning) => `commandResults[${result.index}]:${warning}`))
  }
  return {
    id,
    status: String(rawOperation.status || ""),
    evidenceReady: !isPlaceholder(rawOperation.evidence),
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    commandResults,
  }
}

function validateCommandResult(rawResult, mode, index) {
  const blockers = []
  const warnings = []
  if (!rawResult || typeof rawResult !== "object" || Array.isArray(rawResult)) {
    return { index, ready: false, blockers: ["result_object_required"], warnings }
  }
  const unknownFields = Object.keys(rawResult).filter((field) => !RESULT_FIELDS.has(field))
  if (unknownFields.length) warnings.push(`unknown_fields:${unknownFields.join(",")}`)
  for (const field of RESULT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(rawResult, field)) blockers.push(`missing:${field}`)
  }
  if (!String(rawResult.command || "").startsWith("aliyun ")) blockers.push("command=aliyun")
  if (rawResult.mutationPerformed !== false) blockers.push("mutationPerformed=false")
  if (mode === "template") {
    return {
      index,
      ready: blockers.length === 0,
      blockers,
      warnings,
      executed: rawResult.executed === true,
      exitStatus: typeof rawResult.exitStatus === "number" ? rawResult.exitStatus : null,
      cloudApiCalled: rawResult.cloudApiCalled === true,
      mutationPerformed: rawResult.mutationPerformed === true,
      observedAtReady: !isPlaceholder(rawResult.observedAt),
      outputSummaryReady: !isPlaceholder(rawResult.outputSummary),
      evidenceReady: !isPlaceholder(rawResult.evidence),
    }
  }
  if (rawResult.executed !== true) blockers.push("executed=true")
  if (rawResult.exitStatus !== 0) blockers.push("exitStatus=0")
  if (rawResult.cloudApiCalled !== true) blockers.push("cloudApiCalled=true")
  if (isPlaceholder(rawResult.observedAt)) blockers.push("observedAt")
  if (isPlaceholder(rawResult.outputSummary)) blockers.push("outputSummary")
  if (isPlaceholder(rawResult.evidence)) blockers.push("evidence")
  return {
    index,
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings,
    executed: rawResult.executed === true,
    exitStatus: typeof rawResult.exitStatus === "number" ? rawResult.exitStatus : null,
    cloudApiCalled: rawResult.cloudApiCalled === true,
    mutationPerformed: rawResult.mutationPerformed === true,
    observedAtReady: !isPlaceholder(rawResult.observedAt),
    outputSummaryReady: !isPlaceholder(rawResult.outputSummary),
    evidenceReady: !isPlaceholder(rawResult.evidence),
  }
}

function isPlaceholder(value) {
  const text = String(value ?? "").trim()
  return !text || /^(TODO|TBD|pending)(?:_|$)/i.test(text)
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

function summarize(files) {
  const operations = files.flatMap((file) => file.operations || [])
  const templateOperations = files.filter((file) => file.mode === "template").flatMap((file) => file.operations || [])
  const localOperations = files.filter((file) => file.mode === "local").flatMap((file) => file.operations || [])
  return {
    files: files.length,
    readyFiles: files.filter((file) => file.ready).length,
    blockingFiles: files.filter((file) => !file.ready).length,
    operations: operations.length,
    readyOperations: operations.filter((operation) => operation.ready).length,
    templateOperations: templateOperations.length,
    readyTemplateOperations: templateOperations.filter((operation) => operation.ready).length,
    localOperations: localOperations.length,
    readyLocalOperations: localOperations.filter((operation) => operation.ready).length,
    totalBlockers: files.reduce((sum, file) => sum + file.blockers.length, 0),
    totalWarnings: files.reduce((sum, file) => sum + file.warnings.length, 0),
  }
}

function summarizeLocalObservation(localFile) {
  const operations = localFile.operations || []
  const commandResults = operations.flatMap((operation) => operation.commandResults || [])
  const statusCounts = {}
  for (const operation of operations) {
    const status = operation.status || "unknown"
    statusCounts[status] = (statusCounts[status] || 0) + 1
  }
  const evidenceReadyOperations = operations.filter((operation) => operation.evidenceReady === true).length
  const consoleObservationOperations = operations.filter((operation) =>
    ["observed", "not_found", "blocked", "skipped"].includes(operation.status) &&
    operation.evidenceReady === true &&
    (operation.commandResults || []).every((result) =>
      result.mutationPerformed !== true &&
      result.observedAtReady === true &&
      result.outputSummaryReady === true &&
      result.evidenceReady === true
    ),
  ).length
  return {
    statusCounts,
    operations: operations.length,
    strictReadyOperations: operations.filter((operation) => operation.ready).length,
    evidenceReadyOperations,
    consoleObservationOperations,
    safeConsoleOnly: operations.length > 0 &&
      consoleObservationOperations === operations.length &&
      commandResults.every((result) => result.cloudApiCalled !== true && result.mutationPerformed !== true),
    commandResults: commandResults.length,
    executedCommandResults: commandResults.filter((result) => result.executed === true).length,
    cloudApiCalledCommandResults: commandResults.filter((result) => result.cloudApiCalled === true).length,
    mutationPerformedCommandResults: commandResults.filter((result) => result.mutationPerformed === true).length,
    observedOperationIds: operations.filter((operation) => operation.status === "observed").map((operation) => operation.id),
    notFoundOperationIds: operations.filter((operation) => operation.status === "not_found").map((operation) => operation.id),
    blockedOperationIds: operations.filter((operation) => operation.status === "blocked").map((operation) => operation.id),
  }
}

function buildHumanLocalBlockers(localFile) {
  if (!localFile.exists) return localFile.blockers
  const summary = summarizeLocalObservation(localFile)
  const blockers = []
  if (summary.operations === 0) blockers.push("readonly_inventory_operations_missing")
  if (summary.strictReadyOperations < summary.operations) {
    blockers.push(`readonly_inventory_strict_ready=${summary.strictReadyOperations}/${summary.operations}`)
  }
  if (summary.executedCommandResults < summary.commandResults) {
    blockers.push(`readonly_inventory_commands_executed=${summary.executedCommandResults}/${summary.commandResults}`)
  }
  if (summary.cloudApiCalledCommandResults < summary.commandResults) {
    blockers.push(`readonly_inventory_cloud_api_called=${summary.cloudApiCalledCommandResults}/${summary.commandResults}`)
  }
  if (summary.safeConsoleOnly === true && summary.strictReadyOperations === 0) {
    blockers.push("console_only_observation_not_strict_inventory")
  }
  if (!blockers.length && localFile.blockers.length) return localFile.blockers
  return blockers
}

function renderMarkdown(report) {
  return [
    "# 阿里云 CLI 只读盘点结果校验",
    "",
    `- ok: ${report.ok}`,
    `- allowIncomplete: ${report.allowIncomplete}`,
    `- containsValues: ${report.containsValues}`,
    `- cloudMutationPerformed: ${report.cloudMutationPerformed}`,
    `- templateReady: ${report.template.ready}`,
    `- localReady: ${report.local.ready}`,
    `- localFile: ${report.local.file}`,
    `- localConsoleObservationSafe: ${report.local.observationSummary.safeConsoleOnly}`,
    `- localConsoleObservationOperations: ${report.local.observationSummary.consoleObservationOperations} / ${report.local.observationSummary.operations}`,
    `- executedCommandResults: ${report.local.observationSummary.executedCommandResults} / ${report.local.observationSummary.commandResults}`,
    `- cloudApiCalledCommandResults: ${report.local.observationSummary.cloudApiCalledCommandResults}`,
    "",
    "## Local Blockers",
    "",
    ...(report.local.blockers.length ? report.local.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Technical Blockers",
    "",
    ...(report.local.technicalBlockers.length ? report.local.technicalBlockers.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Operation Status",
    "",
    ...Object.entries(report.local.operationStatus).map(([id, status]) => `- ${id}: ${status.ready ? "ready" : "blocked"} (${status.blockers.join(", ") || "none"})`),
    "",
  ].join("\n")
}

function main() {
  const args = parseArgs(process.argv)
  const template = validateFile(args.templateFile, "template")
  const local = validateFile(args.localFile, "local")
  const localObservationSummary = summarizeLocalObservation(local)
  const localHumanBlockers = buildHumanLocalBlockers(local)
  const ok = template.ready && local.ready
  const report = {
    ok,
    allowIncomplete: args.allowIncomplete,
    containsValues: false,
    readOnlyOnly: true,
    cloudMutationPerformed: false,
    summary: summarize([template, local]),
    template: {
      file: template.file,
      ready: template.ready,
      blockers: template.blockers,
      warnings: template.warnings,
      checkedOperations: template.operations.length,
    },
    local: {
      file: local.file,
      exists: local.exists,
      ready: local.ready,
      blockers: localHumanBlockers,
      technicalBlockers: local.blockers,
      warnings: local.warnings,
      checkedOperations: local.operations.length,
      observationSummary: localObservationSummary,
      operationStatus: Object.fromEntries(local.operations.map((operation) => [operation.id, {
        status: operation.status,
        ready: operation.ready,
        evidenceReady: operation.evidenceReady,
        blockers: operation.blockers,
        commandExecution: {
          results: operation.commandResults.length,
          executed: operation.commandResults.filter((result) => result.executed === true).length,
          cloudApiCalled: operation.commandResults.filter((result) => result.cloudApiCalled === true).length,
          mutationPerformed: operation.commandResults.filter((result) => result.mutationPerformed === true).length,
        },
      }])),
    },
    nextActions: [
      "Copy deploy/aliyun-production-cn.cloud-inventory-results.example.json to deploy/aliyun-production-cn.cloud-inventory-results.local.json after CLI or Cloud Shell read-only inventory is available.",
      "Summarize command output into non-secret status/evidence fields only; do not paste full secrets, tokens, cookies, registry passwords, or certificates.",
      "After local inventory results are ready, copy only final non-secret booleans/evidence handles into cloud-confirmations.local.json and image-publish.local.json.",
      "Run corepack pnpm aliyun:cloud:inventory-results:strict before claiming cloud inventory evidence is complete.",
    ],
  }
  if (args.out) writeText(args.out, JSON.stringify(report, null, 2))
  if (args.markdown) writeText(args.markdown, renderMarkdown(report))
  console.log(JSON.stringify(report, null, 2))
  if (!ok && !args.allowIncomplete) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-aliyun-cli-inventory-results.mjs [--allow-incomplete] [--template path] [--local path]",
    "",
    "Validates non-secret Aliyun CLI read-only inventory result summaries.",
    "This script never runs Aliyun commands and never reads credentials.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
