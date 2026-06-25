#!/usr/bin/env node

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_SCHEMA_MAP = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.rds-first-version-schema-map.json")
const DEFAULT_OUT_PARENT = "/tmp"

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

const RDS_SQL_COMPATIBILITY_RULES = Object.freeze([
  {
    code: "supabase_auth_uid",
    pattern: /\bauth\.uid\s*\(/i,
    severity: "rewrite_or_replace_before_apply",
    action: "Replace Supabase auth.uid dependent predicates with backend-enforced user or tenant checks before applying to Aliyun RDS.",
  },
  {
    code: "supabase_storage_schema",
    pattern: /\bstorage\./i,
    severity: "replace_with_oss_boundary",
    action: "Replace Supabase storage schema statements with Aliyun OSS bucket/prefix/RAM/STS evidence and application code checks.",
  },
  {
    code: "supabase_service_role",
    pattern: /\bservice_role\b/i,
    severity: "replace_role_model",
    action: "Replace Supabase service_role grants or policies with Aliyun RDS roles and backend service credentials.",
  },
  {
    code: "row_level_security",
    pattern: /\benable\s+row\s+level\s+security\b/i,
    severity: "review_authorization_model",
    action: "Review whether RLS remains enabled on Aliyun RDS or whether the backend repository layer owns tenant authorization.",
  },
  {
    code: "policy_statement",
    pattern: /\bcreate\s+policy\b/i,
    severity: "review_authorization_model",
    action: "Review every Supabase policy statement before applying it to Aliyun RDS.",
  },
  {
    code: "extension_review",
    pattern: /\bcreate\s+extension\b|\bgen_random_uuid\s*\(/i,
    severity: "confirm_rds_extension_support",
    action: "Confirm the target Aliyun RDS PostgreSQL engine supports the required extension before applying schema SQL.",
  },
])

const RDS_SQL_COMPATIBILITY_DISPOSITIONS = Object.freeze({
  supabase_auth_uid: {
    requiredOperatorDecision: "Replace auth.uid() dependent SQL with backend-enforced user, company, store, and role checks before applying schema SQL.",
    writeBackFields: [
      "migration.schemaCompatibilityReviewed",
      "migration.supabaseSpecificSqlResolved",
    ],
    acceptanceEvidence: "All auth.uid() findings have a reviewed rewrite, removal, or backend-owned authorization note.",
  },
  supabase_storage_schema: {
    requiredOperatorDecision: "Replace Supabase storage schema usage with Aliyun OSS bucket/prefix/CORS/RAM/STS evidence and application-level access checks.",
    writeBackFields: [
      "migration.supabaseSpecificSqlResolved",
      "cloudConfirmations.items.oss",
    ],
    acceptanceEvidence: "No storage.* SQL is applied to RDS; OSS/RAM/STS evidence covers the equivalent storage boundary.",
  },
  supabase_service_role: {
    requiredOperatorDecision: "Replace Supabase service_role grants or policy references with Aliyun RDS roles plus backend service credentials.",
    writeBackFields: [
      "migration.schemaCompatibilityReviewed",
      "migration.supabaseSpecificSqlResolved",
    ],
    acceptanceEvidence: "No Supabase service_role grant or policy remains in the reviewed RDS apply candidate.",
  },
  row_level_security: {
    requiredOperatorDecision: "Decide and document whether RLS stays in Aliyun RDS or whether tenant authorization is fully enforced in lib/aliyun-rds repositories.",
    writeBackFields: [
      "migration.schemaCompatibilityReviewed",
      "migration.supabaseSpecificSqlResolved",
    ],
    acceptanceEvidence: "Every RLS statement has an RDS-compatible authorization model before schema apply.",
  },
  policy_statement: {
    requiredOperatorDecision: "Review every Supabase create policy statement and rewrite, remove, or replace it with backend-enforced tenant authorization.",
    writeBackFields: [
      "migration.schemaCompatibilityReviewed",
      "migration.supabaseSpecificSqlResolved",
    ],
    acceptanceEvidence: "Every policy statement has a recorded disposition before schema apply.",
  },
  extension_review: {
    requiredOperatorDecision: "Confirm Aliyun RDS PostgreSQL engine/version supports required extensions before applying schema SQL.",
    writeBackFields: [
      "migration.rdsExtensionSupportConfirmed",
    ],
    acceptanceEvidence: "Target RDS engine/version and extension support evidence are recorded without secrets.",
  },
})

function parseArgs(argv) {
  const args = {
    schemaMap: DEFAULT_SCHEMA_MAP,
    outDir: "",
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--schema-map") {
      args.schemaMap = resolveValue(argv[++index], "--schema-map")
      continue
    }
    if (arg === "--out-dir") {
      args.outDir = resolveValue(argv[++index], "--out-dir")
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
    args.outDir = resolve(DEFAULT_OUT_PARENT, `meiye-huajing-rds-migration-package-${stamp}`)
  }
  return args
}

function resolveValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function readText(filePath) {
  return readFileSync(filePath, "utf8")
}

function readJson(filePath) {
  return JSON.parse(readText(filePath))
}

function writeText(filePath, value) {
  writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`, { mode: 0o600 })
}

function rel(filePath) {
  return relative(BACKEND_ROOT, filePath).replaceAll("\\", "/")
}

function resolveRepoPath(relativePath) {
  const filePath = resolve(BACKEND_ROOT, relativePath)
  if (filePath !== BACKEND_ROOT && !filePath.startsWith(`${BACKEND_ROOT}/`)) {
    throw new Error(`source_path_outside_repo:${relativePath}`)
  }
  return filePath
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex")
}

function assertSafeIdentifier(name, kind) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name || ""))) {
    throw new Error(`unsafe_${kind}_identifier:${name}`)
  }
  return name
}

function quoteLiteral(value) {
  return String(value).replaceAll("'", "''")
}

function findSecretLikeValues(text) {
  const matches = []
  for (const pattern of SECRET_VALUE_PATTERNS) {
    const match = text.match(pattern)
    if (match) matches.push(match[0].slice(0, 80))
  }
  return matches
}

function lineNumbersForPattern(text, pattern) {
  return text
    .split(/\r?\n/)
    .map((line, index) => pattern.test(line) ? index + 1 : 0)
    .filter(Boolean)
}

function auditRdsSqlCompatibility(sourcePath, content) {
  const findings = []
  for (const rule of RDS_SQL_COMPATIBILITY_RULES) {
    const lineNumbers = lineNumbersForPattern(content, rule.pattern)
    if (!lineNumbers.length) continue
    findings.push({
      sourcePath,
      code: rule.code,
      severity: rule.severity,
      lineCount: lineNumbers.length,
      sampleLineNumbers: lineNumbers.slice(0, 8),
      action: rule.action,
    })
  }
  return findings
}

function summarizeCompatibilityReview(findings) {
  const codes = new Map()
  const sources = new Map()

  for (const finding of findings) {
    if (!codes.has(finding.code)) {
      codes.set(finding.code, {
        code: finding.code,
        severity: finding.severity,
        findingCount: 0,
        affectedSourceCount: 0,
        action: finding.action,
        sourcePaths: new Set(),
      })
    }
    const codeSummary = codes.get(finding.code)
    codeSummary.findingCount += finding.lineCount
    codeSummary.sourcePaths.add(finding.sourcePath)
    codeSummary.affectedSourceCount = codeSummary.sourcePaths.size

    if (!sources.has(finding.sourcePath)) {
      sources.set(finding.sourcePath, {
        sourcePath: finding.sourcePath,
        codes: [],
        findingCount: 0,
      })
    }
    const sourceSummary = sources.get(finding.sourcePath)
    sourceSummary.codes.push(finding.code)
    sourceSummary.findingCount += finding.lineCount
  }

  return {
    required: findings.length > 0,
    appliesTo: "schema_sql_before_aliyun_rds_apply",
    policy: "The package can be generated locally, but schema SQL must not be applied to Aliyun RDS until these compatibility findings are reviewed or rewritten.",
    findingCount: findings.reduce((sum, finding) => sum + finding.lineCount, 0),
    affectedSourceCount: sources.size,
    categories: [...codes.keys()].sort(),
    byCode: [...codes.values()]
      .map((item) => ({
        code: item.code,
        severity: item.severity,
        findingCount: item.findingCount,
        affectedSourceCount: item.affectedSourceCount,
        sourcePaths: [...item.sourcePaths].sort(),
        action: item.action,
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    bySource: [...sources.values()]
      .map((item) => ({
        sourcePath: item.sourcePath,
        codes: [...new Set(item.codes)].sort(),
        findingCount: item.findingCount,
      }))
      .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)),
    findings: findings
      .map((finding) => ({
        sourcePath: finding.sourcePath,
        code: finding.code,
        severity: finding.severity,
        lineCount: finding.lineCount,
        sampleLineNumbers: finding.sampleLineNumbers,
        action: finding.action,
      }))
      .sort((a, b) => `${a.sourcePath}:${a.code}`.localeCompare(`${b.sourcePath}:${b.code}`)),
  }
}

function buildCompatibilityReviewChecklist(compatibilityReview) {
  return compatibilityReview.byCode.map((item) => {
    const disposition = RDS_SQL_COMPATIBILITY_DISPOSITIONS[item.code] || {}
    return {
      code: item.code,
      statusBeforeP11Apply: "must_resolve_before_schema_apply",
      severity: item.severity,
      findingCount: item.findingCount,
      affectedSourceCount: item.affectedSourceCount,
      sourcePaths: item.sourcePaths || [],
      requiredOperatorDecision: disposition.requiredOperatorDecision || item.action,
      evidenceWriteBackFields: disposition.writeBackFields || ["migration.schemaCompatibilityReviewed"],
      acceptanceEvidence: disposition.acceptanceEvidence || "Record a non-secret compatibility disposition before applying schema SQL.",
      forbiddenValues: [
        "DATABASE_URL_CN value",
        "database password",
        "customer row payloads",
        "dump contents",
        "Supabase service role key",
        "AccessKeySecret",
        "STS token",
      ],
    }
  })
}

function renderSchemaSql(schemaMap, sourceFiles) {
  const lines = [
    "-- Meiye Huajing APP production-cn Aliyun RDS PostgreSQL schema package.",
    "-- Generated from non-secret schema sources declared in deploy/aliyun-production-cn.rds-first-version-schema-map.json.",
    "-- Do not paste DATABASE_URL_CN, database passwords, dump contents, Supabase service role keys, AccessKeySecret, tokens, or cookies into this file.",
    "-- Review Supabase-specific auth/storage/RLS statements before applying to Aliyun RDS PostgreSQL.",
    "",
    `-- Environment: ${schemaMap.environment}`,
    `-- Formal target: ${schemaMap.formalTarget}`,
    `-- Source file count: ${sourceFiles.length}`,
    "",
  ]

  for (const source of sourceFiles) {
    lines.push(
      "",
      "-- -----------------------------------------------------------------------------",
      `-- Source: ${source.path}`,
      `-- sha256: ${source.sha256}`,
      "-- -----------------------------------------------------------------------------",
      "",
      source.content.trimEnd(),
      "",
    )
  }

  return lines.join("\n")
}

function renderValidationSql(schemaMap) {
  const lines = [
    "-- Meiye Huajing APP production-cn Aliyun RDS validation queries.",
    "-- These queries are non-destructive. They should be run on the Aliyun RDS PostgreSQL target after schema/data migration.",
    "-- They intentionally return counts and existence booleans only; do not export row contents into evidence files.",
    "",
    "select current_database() as database_name, current_user as database_user, now() as checked_at;",
    "",
    "-- Required table existence and row-count checks.",
  ]

  for (const table of schemaMap.requiredTables || []) {
    const name = assertSafeIdentifier(table.name, "table")
    lines.push(
      `select '${quoteLiteral(name)}' as object_name, to_regclass('public.${name}') is not null as exists_in_public;`,
      `select '${quoteLiteral(name)}' as table_name, count(*)::bigint as row_count from public.${name};`,
    )
  }

  lines.push("", "-- Required function checks.")
  for (const fn of schemaMap.requiredFunctions || []) {
    const name = assertSafeIdentifier(fn.name, "function")
    lines.push([
      "select",
      `  '${quoteLiteral(name)}' as function_name,`,
      "  exists (",
      "    select 1",
      "    from pg_proc p",
      "    join pg_namespace n on n.oid = p.pronamespace",
      `    where n.nspname = 'public' and p.proname = '${quoteLiteral(name)}'`,
      "  ) as exists_in_public;",
    ].join("\n"))
  }

  lines.push(
    "",
    "-- APP smoke gates after DATABASE_URL_CN is imported as a secret env.",
    "-- Run: corepack pnpm aliyun:app-api:smoke -- --base-url https://api-cn.ipgongchang.xin",
    "-- Run: corepack pnpm aliyun:rds:migration:evidence:strict",
  )

  return lines.join("\n")
}

function renderRollbackChecklist(schemaMap) {
  return [
    "# Aliyun RDS Rollback Checklist",
    "",
    "- Keep Supabase as migration source until RDS schema, data, APP API smoke, and rollback validation pass.",
    "- Do not store DATABASE_URL_CN, database password, dump contents, Supabase service role key, AccessKeySecret, token, or cookie in this package.",
    "- Before production switch, record the RDS instance id, schema package digest, validation report id, and operator name in the local evidence JSON without secrets.",
    "- Before production switch, prove that APP API can be pointed back to the previous data layer or previous deployment if RDS smoke fails.",
    "- After rollback rehearsal, write only non-secret evidence to deploy/aliyun-production-cn.rds-migration.local.json.",
    "",
    "## First Version Scope",
    "",
    ...(schemaMap.firstVersionCapabilities || []).map((item) => `- ${item}`),
    "",
    "## Required Tables",
    "",
    ...(schemaMap.requiredTables || []).map((item) => `- ${item.name}: ${(item.validation || []).join(", ")}`),
    "",
    "## Required Functions",
    "",
    ...((schemaMap.requiredFunctions || []).length
      ? schemaMap.requiredFunctions.map((item) => `- ${item.name}: ${(item.validation || []).join(", ")}`)
      : ["- none"]),
  ].join("\n")
}

function renderMarkdown(report) {
  return [
    "# Aliyun RDS Migration Package",
    "",
    `- ok: ${report.ok}`,
    `- containsValues: ${report.containsValues}`,
    `- readOnlyOnly: ${report.readOnlyOnly}`,
    `- cloudApiCalled: ${report.cloudApiCalled}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- sourceFileCount: ${report.summary.sourceFileCount}`,
    `- requiredTableCount: ${report.summary.requiredTableCount}`,
    `- requiredFunctionCount: ${report.summary.requiredFunctionCount}`,
    `- requiredStorageCount: ${report.summary.requiredStorageCount}`,
    `- schemaSqlSha256: ${report.summary.schemaSqlSha256}`,
    `- validationSqlSha256: ${report.summary.validationSqlSha256}`,
    `- blockers: ${report.blockers.length ? report.blockers.join(", ") : "none"}`,
    `- warnings: ${report.warnings.length ? report.warnings.join(", ") : "none"}`,
    `- rdsCompatibilityReviewRequired: ${report.compatibilityReview.required}`,
    `- rdsCompatibilityFindingCount: ${report.compatibilityReview.findingCount}`,
    `- rdsCompatibilityAffectedSourceCount: ${report.compatibilityReview.affectedSourceCount}`,
    "",
    "## Files",
    "",
    `- manifest: ${report.files.manifest}`,
    `- markdown: ${report.files.markdown}`,
    `- schemaSql: ${report.files.schemaSql}`,
    `- validationSql: ${report.files.validationSql}`,
    `- rollbackChecklist: ${report.files.rollbackChecklist}`,
    "",
    "## Source Files",
    "",
    ...report.sourceFiles.map((item) => `- ${item.path}: ${item.sha256}`),
    "",
    "## RDS Compatibility Review",
    "",
    `- required: ${report.compatibilityReview.required}`,
    `- appliesTo: ${report.compatibilityReview.appliesTo}`,
    `- categories: ${report.compatibilityReview.categories.join(", ") || "none"}`,
    `- policy: ${report.compatibilityReview.policy}`,
    "",
    ...report.compatibilityReview.byCode.map((item) =>
      `- ${item.code}: findings=${item.findingCount}, sources=${item.affectedSourceCount}, action=${item.action}`,
    ),
    "",
    "## RDS Compatibility Review Checklist",
    "",
    ...report.compatibilityReviewChecklist.flatMap((item) => [
      `### ${item.code}`,
      "",
      `- statusBeforeP11Apply: ${item.statusBeforeP11Apply}`,
      `- findingCount: ${item.findingCount}`,
      `- affectedSourceCount: ${item.affectedSourceCount}`,
      `- sourcePaths: ${item.sourcePaths.join(", ") || "none"}`,
      `- requiredOperatorDecision: ${item.requiredOperatorDecision}`,
      `- evidenceWriteBackFields: ${item.evidenceWriteBackFields.join(", ")}`,
      `- acceptanceEvidence: ${item.acceptanceEvidence}`,
      `- forbiddenValues: ${item.forbiddenValues.join(", ")}`,
      "",
    ]),
    "## Next Required Evidence",
    "",
    "- Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou.",
    "- Import DATABASE_URL_CN only through Aliyun KMS / Secrets Manager / SAE secret env.",
    "- Record schemaCompatibilityReviewed, supabaseSpecificSqlResolved, and rdsExtensionSupportConfirmed before applying schema SQL.",
    "- Apply reviewed schema and migrate data without writing data dumps into git or reports.",
    "- Run row-count, critical-record, APP API smoke, and rollback validation.",
  ].join("\n")
}

function buildReport(args) {
  if (existsSync(args.outDir)) throw new Error(`out_dir_already_exists:${args.outDir}`)
  mkdirSync(args.outDir, { recursive: false, mode: 0o700 })

  const schemaMap = readJson(args.schemaMap)
  const blockers = []
  const warnings = []

  if (schemaMap.schemaVersion !== 1) blockers.push("schemaVersion=1")
  if (schemaMap.environment !== "production-cn") blockers.push("environment=production-cn")
  if (schemaMap.formalTarget !== "Aliyun RDS PostgreSQL") blockers.push("formalTarget=Aliyun RDS PostgreSQL")
  if (schemaMap.containsValues !== false) blockers.push("containsValues=false")
  if (!Array.isArray(schemaMap.sourceMigrations) || schemaMap.sourceMigrations.length === 0) blockers.push("sourceMigrations")

  const sourceFiles = []
  const compatibilityFindings = []
  for (const sourcePath of schemaMap.sourceMigrations || []) {
    const filePath = resolveRepoPath(sourcePath)
    if (!existsSync(filePath)) {
      blockers.push(`missing_source:${sourcePath}`)
      continue
    }
    const content = readText(filePath)
    const secretMatches = findSecretLikeValues(content)
    if (secretMatches.length) blockers.push(`source_contains_secret_like_values:${sourcePath}`)
    const sourceCompatibilityFindings = auditRdsSqlCompatibility(sourcePath, content)
    compatibilityFindings.push(...sourceCompatibilityFindings)
    if (sourceCompatibilityFindings.length) {
      const codes = sourceCompatibilityFindings.map((finding) => finding.code).sort().join("+")
      warnings.push(`rds_sql_compatibility_review_required:${sourcePath}:${codes}`)
    }
    sourceFiles.push({
      path: rel(filePath),
      bytes: statSync(filePath).size,
      sha256: sha256(content),
      content,
    })
  }

  const schemaSql = renderSchemaSql(schemaMap, sourceFiles)
  const validationSql = renderValidationSql(schemaMap)
  const rollbackChecklist = renderRollbackChecklist(schemaMap)
  const combinedGenerated = `${schemaSql}\n${validationSql}\n${rollbackChecklist}`
  const generatedSecretMatches = findSecretLikeValues(combinedGenerated)
  if (generatedSecretMatches.length) blockers.push("generated_package_contains_secret_like_values")
  const compatibilityReview = summarizeCompatibilityReview(compatibilityFindings)
  const compatibilityReviewChecklist = buildCompatibilityReviewChecklist(compatibilityReview)

  const manifestPath = resolve(args.outDir, "rds-migration-package.json")
  const markdownPath = resolve(args.outDir, "rds-migration-package.md")
  const schemaSqlPath = resolve(args.outDir, "rds-schema.sql")
  const validationSqlPath = resolve(args.outDir, "rds-validation.sql")
  const rollbackChecklistPath = resolve(args.outDir, "rds-rollback-checklist.md")

  const report = {
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    environment: schemaMap.environment,
    scope: schemaMap.scope,
    formalTarget: schemaMap.formalTarget,
    currentSource: schemaMap.currentSource,
    containsValues: false,
    readOnlyOnly: true,
    cloudApiCalled: false,
    mutationPerformed: false,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    summary: {
      sourceFileCount: sourceFiles.length,
      requiredTableCount: (schemaMap.requiredTables || []).length,
      requiredFunctionCount: (schemaMap.requiredFunctions || []).length,
      requiredStorageCount: (schemaMap.requiredStorage || []).length,
      schemaSqlBytes: Buffer.byteLength(schemaSql),
      validationSqlBytes: Buffer.byteLength(validationSql),
      schemaSqlSha256: sha256(schemaSql),
      validationSqlSha256: sha256(validationSql),
      rollbackChecklistSha256: sha256(rollbackChecklist),
      compatibilityReviewRequired: compatibilityReview.required,
      compatibilityFindingCount: compatibilityReview.findingCount,
      compatibilityAffectedSourceFileCount: compatibilityReview.affectedSourceCount,
      compatibilityReviewChecklistItemCount: compatibilityReviewChecklist.length,
    },
    compatibilityReview,
    compatibilityReviewChecklist,
    files: {
      manifest: manifestPath,
      markdown: markdownPath,
      schemaSql: schemaSqlPath,
      validationSql: validationSqlPath,
      rollbackChecklist: rollbackChecklistPath,
    },
    sourceFiles: sourceFiles.map(({ content: _content, ...item }) => item),
    requiredTables: schemaMap.requiredTables || [],
    requiredFunctions: schemaMap.requiredFunctions || [],
    requiredStorage: schemaMap.requiredStorage || [],
    nextVerifyCommands: [
      "corepack pnpm aliyun:rds:migration:package",
      "corepack pnpm aliyun:rds:migration:evidence:strict",
      "corepack pnpm aliyun:app-api:smoke -- --base-url https://api-cn.ipgongchang.xin",
      "corepack pnpm aliyun:completion:audit",
    ],
    valueHandlingRules: [
      "This package must not contain DATABASE_URL_CN, database passwords, dump contents, Supabase service role keys, AccessKeySecret, tokens, or cookies.",
      "Row-count and critical-record validation evidence must contain counts, ids or evidence handles only, not customer row payloads.",
      "Apply/migration execution requires action-time confirmation and a real Aliyun RDS PostgreSQL target.",
    ],
  }

  writeText(schemaSqlPath, schemaSql)
  writeText(validationSqlPath, validationSql)
  writeText(rollbackChecklistPath, rollbackChecklist)
  writeText(markdownPath, renderMarkdown(report))
  writeText(manifestPath, JSON.stringify(report, null, 2))
  return report
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-aliyun-rds-migration-package.mjs [--schema-map path] [--out-dir /tmp/path]",
    "",
    "Builds a non-secret, read-only Aliyun RDS/PostgreSQL migration package from the first-version schema map.",
    "It does not connect to Supabase or Aliyun RDS and does not mutate cloud resources.",
  ].join("\n"))
}

try {
  console.log(JSON.stringify(buildReport(parseArgs(process.argv)), null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
