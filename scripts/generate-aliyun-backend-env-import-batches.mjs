#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /:\/\/[^\s:@]+:[^\s@]+@/,
  /DATABASE_URL_CN\s*=\s*\S{8,}/i,
  /AccessKeySecret\s*[:=]\s*\S{8,}/i,
]

function parseArgs(argv) {
  const args = {
    out: "",
    markdown: "",
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
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

function writeText(filePath, content) {
  if (!filePath) return
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function runSensitiveBlockersBackend() {
  const result = spawnSync(process.execPath, [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--backend-only",
  ], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`sensitive_blockers_backend_failed:${result.status}\n${result.stderr || result.stdout}`)
  }
  return JSON.parse(result.stdout)
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort()
}

function flattenBlockedRows(groups) {
  return groups.flatMap((group) =>
    (group.blockedCredentialNames || []).map((name) => ({
      variable: name,
      blockingAction: group.actionId,
      owner: group.owner,
      importTarget: (group.importTargets || []).join("; ") || "Aliyun controlled secret channel",
    })),
  )
}

function normalizeReadySecretGroup(group) {
  if (group.category !== "legacy_database_migration_source") return group
  return {
    ...group,
    importTarget: "migration source / legacy compatibility only; formal database target is Aliyun RDS PostgreSQL",
  }
}

function buildReport() {
  const sensitive = runSensitiveBlockersBackend()
  const brief = sensitive.credentialInterventionBrief || {}
  const groups = brief.groups || []
  const readyGroups = (sensitive.summary?.readySensitiveEnvVariableGroups || []).map(normalizeReadySecretGroup)
  const notYetImportable = flattenBlockedRows(groups)
  const actionIds = brief.actionTimeConfirmationRequiredIds || sensitive.summary?.actionTimeConfirmationRequired || []

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    currentScope: "backend_aliyun_only",
    sourceCommand: "corepack pnpm aliyun:sensitive:blockers:backend",
    containsValues: false,
    readOnlyOnly: true,
    cloudApiCalled: false,
    mutationPerformed: false,
    blockedCredentialCount: brief.blockedCredentialCount || 0,
    blockedCredentialNames: brief.blockedCredentialNames || [],
    readySecretEnvVariableCount: brief.readySecretEnvVariableCount || 0,
    readySecretEnvVariableNames: brief.readySecretEnvVariableNames || [],
    readySecretEnvVariableGroupCount: readyGroups.length,
    readySecretEnvVariableGroups: readyGroups,
    actionTimeConfirmationRequiredIds: actionIds,
    deferredAppLaunchSensitiveActionIds: sensitive.deferredAppLaunchSensitiveActionIds || [],
    notYetImportable,
    backendBlockerNotes: [
      "S03_ACR_PAID_PURCHASE and S04_ACR_REGISTRY_AUTH remain backend blockers, but registry secret material stays in ACR/Docker credential helper, RAM/KMS/Secrets Manager, or SAE runtime pull settings.",
      "Supabase variables in legacy_database_migration_source are migration source / legacy compatibility only; formal production-cn database target is Aliyun RDS PostgreSQL.",
      "WeChat Open Platform mobile app, Apple Team ID, and Android release signing variables are deferred full App launch items, not current backend import blockers.",
    ],
    importEvidenceTargets: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport.importedAt",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport.evidence",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport.confirmed=true",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport.secretNotInImage=true",
      "deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres.databaseUrlCnSecretImported=true",
      "deploy/aliyun-production-cn.rds-migration.local.json -> migration.* non-secret validation handles",
    ],
    verificationCommands: [
      "corepack pnpm aliyun:sensitive:blockers:backend",
      "corepack pnpm aliyun:env:checklist",
      "corepack pnpm aliyun:backend-cn:status",
      "corepack pnpm aliyun:rds:migration:evidence:strict",
      "corepack pnpm aliyun:cloud:confirmations:strict",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:readiness:cloud-ready",
      "corepack pnpm aliyun:predeploy",
    ],
    forbiddenStorage: [
      "JSON/Markdown reports",
      "Docker images",
      "App bundles",
      "shell history",
      "git",
    ],
  }

  report.deferredFullAppLaunchVariables = [
    { variable: "WECHAT_OPEN_APP_ID", deferredAction: "S01_WECHAT_OPEN_APP_LOGIN", currentBackendMeaning: "deferred_until_wechat_open_mobile_app_created_and_approved" },
    { variable: "WECHAT_OPEN_APP_SECRET", deferredAction: "S01_WECHAT_OPEN_APP_LOGIN", currentBackendMeaning: "deferred_until_wechat_open_mobile_app_created_and_approved" },
    { variable: "APPLE_TEAM_ID", deferredAction: "S02_APPLE_TEAM_ID", currentBackendMeaning: "deferred_until_ios_universal_link_aasa_work_resumes" },
    { variable: "MEIYE_RELEASE_STORE_FILE", deferredAction: "S07_ANDROID_RELEASE_SIGNING", currentBackendMeaning: "deferred_until_android_release_signing_work_resumes" },
    { variable: "MEIYE_RELEASE_STORE_PASSWORD", deferredAction: "S07_ANDROID_RELEASE_SIGNING", currentBackendMeaning: "deferred_until_android_release_signing_work_resumes" },
    { variable: "MEIYE_RELEASE_KEY_ALIAS", deferredAction: "S07_ANDROID_RELEASE_SIGNING", currentBackendMeaning: "deferred_until_android_release_signing_work_resumes" },
    { variable: "MEIYE_RELEASE_KEY_PASSWORD", deferredAction: "S07_ANDROID_RELEASE_SIGNING", currentBackendMeaning: "deferred_until_android_release_signing_work_resumes" },
  ]

  const secretLikeMatches = findSecretLikeValues(JSON.stringify(report))
  report.secretLeakCheck = {
    ok: secretLikeMatches.length === 0,
    matches: secretLikeMatches,
  }
  report.ok = report.secretLeakCheck.ok
  report.summary = {
    blockedCredentialCount: report.blockedCredentialCount,
    blockedCredentialNames: report.blockedCredentialNames,
    readySecretEnvVariableCount: report.readySecretEnvVariableCount,
    readySecretEnvVariableGroupCount: report.readySecretEnvVariableGroupCount,
    readySecretEnvVariableGroupNames: report.readySecretEnvVariableGroups.map((group) => group.category),
    actionTimeConfirmationRequiredIds: actionIds,
    deferredAppLaunchSensitiveActionIds: report.deferredAppLaunchSensitiveActionIds,
    notYetImportableVariableNames: unique(notYetImportable.map((row) => row.variable)),
  }

  return report
}

function findSecretLikeValues(text) {
  return SECRET_VALUE_PATTERNS.flatMap((pattern) => {
    const match = text.match(pattern)
    return match ? [match[0].slice(0, 80)] : []
  })
}

function renderMarkdown(report) {
  return [
    "# APP production-cn backend-only secret env import batches",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Source command: \`${report.sourceCommand}\``,
    "",
    "This file is the backend-only import batching guide for the current `backend_aliyun_only` target. It lists variable names, owners, and allowed import targets only. It does not contain secret values and does not authorize Aliyun env import, resource creation, image push, DNS changes, or production deployment.",
    "",
    "## Current Backend Verdict",
    "",
    "Production-cn backend cannot be deployed now.",
    "",
    "Current backend-only sensitive gate:",
    "",
    "```text",
    `blockedCredentialCount=${report.blockedCredentialCount}`,
    `readySecretEnvVariableCount=${report.readySecretEnvVariableCount}`,
    `readySecretEnvVariableGroupCount=${report.readySecretEnvVariableGroupCount}`,
    "canCodexProceedWithoutUser=false",
    "actionTimeConfirmationRequired=true",
    `actionTimeConfirmationRequiredIds=${report.actionTimeConfirmationRequiredIds.join(", ")}`,
    "```",
    "",
    "Deferred full App launch sensitive actions:",
    "",
    "```text",
    ...(report.deferredAppLaunchSensitiveActionIds.length ? report.deferredAppLaunchSensitiveActionIds : ["none"]),
    "```",
    "",
    "## Not Yet Importable For Current Backend",
    "",
    "These names are still blocked by Aliyun backend resource or credential decisions. Do not mark them ready until their owner action is complete.",
    "",
    "| Variable | Blocking action | Owner | Import target after unblock |",
    "| --- | --- | --- | --- |",
    ...report.notYetImportable.map((row) =>
      `| \`${row.variable}\` | \`${row.blockingAction}\` | ${row.owner} | ${row.importTarget} |`,
    ),
    "",
    ...report.backendBlockerNotes.map((note) => `- ${note}`),
    "",
    "## Conditional OSS STS Token",
    "",
    "`ALIYUN_OSS_SECURITY_TOKEN` is optional. Import it only when the OSS runtime path uses temporary STS credentials. If the backend uses a least-privilege RAM AccessKey or an SAE runtime role path that does not issue an STS session token to the app, leave this variable empty and do not count it as a backend-only blocked credential.",
    "",
    "## Ready Secret Env Import Batches",
    "",
    "These variables are ready by name, but their values still must be imported only during an authorized backend secret-env action. They must not be written to JSON, Markdown, Docker images, App bundles, shell history, or git.",
    "",
    "| Batch | Owner | Count | Import target | Variable names |",
    "| --- | --- | ---: | --- | --- |",
    ...report.readySecretEnvVariableGroups.map((group) =>
      `| \`${group.category}\` | ${group.owner} | ${group.count} | ${group.importTarget} | ${(group.variableNames || []).map((name) => `\`${name}\``).join(", ")} |`,
    ),
    "",
    "## Deferred Full App Launch Variables",
    "",
    "The following names are not current backend import blockers. They remain deferred until the App launch phase.",
    "",
    "| Variable | Deferred action | Current backend meaning |",
    "| --- | --- | --- |",
    ...report.deferredFullAppLaunchVariables.map((row) =>
      `| \`${row.variable}\` | \`${row.deferredAction}\` | ${row.currentBackendMeaning} |`,
    ),
    "",
    "`WECHAT_MINI_APPID`, `WECHAT_MINI_SECRET`, and `WECHAT_LOGIN_SECRET` may remain necessary for old mini-program or compatibility paths. They do not unblock native APP WeChat login.",
    "",
    "## Import Evidence To Record",
    "",
    "After an authorized backend import action, record only non-secret evidence:",
    "",
    "```text",
    ...report.importEvidenceTargets,
    "```",
    "",
    "## Verification After Import",
    "",
    "Run the backend-only checks first, then strict production gates before deployment:",
    "",
    "```bash",
    ...report.verificationCommands,
    "```",
    "",
    "## Forbidden",
    "",
    "```text",
    "Do not output, paste, or commit secret values.",
    "Do not import env values without action-time authorization.",
    "Do not store AppSecret, AccessKeySecret, registry password, RAM Secret, STS token, database password, DATABASE_URL_CN value, Supabase service role key, Android keystore password, or certificate private key in JSON, Markdown, Docker images, App bundles, shell history, or git.",
    "Do not deploy production-cn after env import alone; RDS migration, cloud confirmations, image publish, domain, and smoke evidence must also pass strict gates.",
    "```",
  ].join("\n")
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-aliyun-backend-env-import-batches.mjs [--out path] [--markdown path]",
    "",
    "Builds a value-free backend-only Aliyun secret-env import batch report from aliyun:sensitive:blockers:backend.",
  ].join("\n"))
}

try {
  const args = parseArgs(process.argv)
  const report = buildReport()
  const json = JSON.stringify(report, null, 2)
  console.log(json)
  if (args.out) writeText(args.out, json)
  if (args.markdown) writeText(args.markdown, renderMarkdown(report))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
