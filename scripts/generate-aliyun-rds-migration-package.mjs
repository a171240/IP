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
    code: "supabase_auth_schema",
    pattern: /\bauth\.(?!uid\s*\()[A-Za-z_][A-Za-z0-9_]*\b/i,
    severity: "replace_supabase_auth_schema",
    action: "Replace Supabase auth schema references such as auth.users/auth.jwt with APP-owned identity tables or backend auth context before applying to Aliyun RDS.",
  },
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
  supabase_auth_schema: {
    defaultProposedDisposition: "replace_supabase_auth_schema_with_app_identity_model",
    requiredOperatorDecision: "Replace Supabase auth schema references such as auth.users and auth.jwt() with APP-owned identity tables, controlled user ids, or backend-provided auth context before applying schema SQL.",
    operatorChecklist: [
      "Map auth.users foreign keys or triggers to public.profiles, controlled UUID user ids, or another APP-owned identity boundary.",
      "Remove Supabase auth triggers from the final RDS apply candidate unless an APP-owned replacement trigger is explicitly reviewed.",
      "Replace auth.jwt() claim reads with backend-provided request claims or repository parameters.",
    ],
    writeBackFields: [
      "migration.schemaCompatibilityReviewed",
      "migration.supabaseSpecificSqlResolved",
    ],
    acceptanceEvidence: "No unresolved Supabase auth schema references such as auth.users or auth.jwt() remain in the reviewed RDS apply candidate.",
  },
  supabase_auth_uid: {
    defaultProposedDisposition: "rewrite_to_backend_enforced_identity_and_tenant_scope",
    requiredOperatorDecision: "Replace auth.uid() dependent SQL with backend-enforced user, company, store, and role checks before applying schema SQL.",
    operatorChecklist: [
      "Map each auth.uid() predicate to request user identity provided by the APP API auth layer.",
      "Confirm company_id, store_id, and role checks are enforced in the Aliyun RDS repository layer.",
      "Remove or rewrite the Supabase policy statement from the final RDS apply candidate.",
    ],
    writeBackFields: [
      "migration.schemaCompatibilityReviewed",
      "migration.supabaseSpecificSqlResolved",
    ],
    acceptanceEvidence: "All auth.uid() findings have a reviewed rewrite, removal, or backend-owned authorization note.",
  },
  supabase_storage_schema: {
    defaultProposedDisposition: "exclude_from_rds_apply_and_replace_with_oss_boundary",
    requiredOperatorDecision: "Replace Supabase storage schema usage with Aliyun OSS bucket/prefix/CORS/RAM/STS evidence and application-level access checks.",
    operatorChecklist: [
      "Exclude storage.* statements from the RDS apply candidate.",
      "Confirm OSS bucket, prefix, CORS, and RAM/STS least-privilege evidence for service-record audio.",
      "Record upload/download smoke evidence handles without payloads or credentials.",
    ],
    writeBackFields: [
      "migration.supabaseSpecificSqlResolved",
      "cloudConfirmations.items.oss",
    ],
    acceptanceEvidence: "No storage.* SQL is applied to RDS; OSS/RAM/STS evidence covers the equivalent storage boundary.",
  },
  supabase_service_role: {
    defaultProposedDisposition: "replace_with_backend_service_account_and_rds_roles",
    requiredOperatorDecision: "Replace Supabase service_role grants or policy references with Aliyun RDS roles plus backend service credentials.",
    operatorChecklist: [
      "Remove Supabase service_role references from the RDS apply candidate.",
      "Confirm the backend service account can perform required server-side operations through Aliyun RDS.",
      "Keep service credentials only in Aliyun secret env or runtime credential stores.",
    ],
    writeBackFields: [
      "migration.schemaCompatibilityReviewed",
      "migration.supabaseSpecificSqlResolved",
    ],
    acceptanceEvidence: "No Supabase service_role grant or policy remains in the reviewed RDS apply candidate.",
  },
  row_level_security: {
    defaultProposedDisposition: "choose_rds_rls_or_backend_authorization_owner_before_apply",
    requiredOperatorDecision: "Decide and document whether RLS stays in Aliyun RDS or whether tenant authorization is fully enforced in lib/aliyun-rds repositories.",
    operatorChecklist: [
      "Pick one authorization owner for each table: Aliyun RDS RLS or backend repository checks.",
      "Ensure store manager and company-scope reads still match first-version APP permissions.",
      "Do not leave Supabase-only policies as the assumed enforcement layer.",
    ],
    writeBackFields: [
      "migration.schemaCompatibilityReviewed",
      "migration.supabaseSpecificSqlResolved",
    ],
    acceptanceEvidence: "Every RLS statement has an RDS-compatible authorization model before schema apply.",
  },
  policy_statement: {
    defaultProposedDisposition: "rewrite_remove_or_replace_each_supabase_policy",
    requiredOperatorDecision: "Review every Supabase create policy statement and rewrite, remove, or replace it with backend-enforced tenant authorization.",
    operatorChecklist: [
      "Classify each create policy statement as rewrite, remove, or replace with backend enforcement.",
      "Confirm login/profile/invite/service-record routes still enforce tenant scope after the change.",
      "Record disposition by category and source file without copying customer data.",
    ],
    writeBackFields: [
      "migration.schemaCompatibilityReviewed",
      "migration.supabaseSpecificSqlResolved",
    ],
    acceptanceEvidence: "Every policy statement has a recorded disposition before schema apply.",
  },
  extension_review: {
    defaultProposedDisposition: "confirm_rds_extension_support_or_replace_function_usage",
    requiredOperatorDecision: "Confirm Aliyun RDS PostgreSQL engine/version supports required extensions before applying schema SQL.",
    operatorChecklist: [
      "Confirm the target RDS PostgreSQL engine version.",
      "Confirm pgcrypto or equivalent function support for gen_random_uuid().",
      "Record whether each extension statement is kept, replaced, or removed before schema apply.",
    ],
    writeBackFields: [
      "migration.rdsExtensionSupportConfirmed",
    ],
    acceptanceEvidence: "Target RDS engine/version and extension support evidence are recorded without secrets.",
  },
})

const COMPATIBILITY_FORBIDDEN_VALUES = Object.freeze([
  "DATABASE_URL_CN value",
  "database password",
  "customer row payloads",
  "dump contents",
  "Supabase service role key",
  "AccessKeySecret",
  "STS token",
])

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
      defaultProposedDisposition: disposition.defaultProposedDisposition || "record_non_secret_disposition_before_apply",
      requiredOperatorDecision: disposition.requiredOperatorDecision || item.action,
      operatorChecklist: disposition.operatorChecklist || [
        "Review the finding category before applying schema SQL to Aliyun RDS.",
        "Record a non-secret disposition and acceptance evidence handle.",
      ],
      evidenceWriteBackFields: disposition.writeBackFields || ["migration.schemaCompatibilityReviewed"],
      acceptanceEvidence: disposition.acceptanceEvidence || "Record a non-secret compatibility disposition before applying schema SQL.",
      forbiddenValues: [...COMPATIBILITY_FORBIDDEN_VALUES],
    }
  })
}

function uniqueStrings(values) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const item = String(value || "").trim()
    if (!item || seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

function buildCompatibilityDispositionPlan(compatibilityReview, compatibilityReviewChecklist) {
  const requiredWriteBackFields = uniqueStrings(
    compatibilityReviewChecklist.flatMap((item) => item.evidenceWriteBackFields || []),
  )
  return {
    status: compatibilityReview.required ? "open" : "not_required",
    appliesTo: compatibilityReview.appliesTo,
    readyToApplySchema: compatibilityReview.required === false,
    defaultDispositionPolicy: "Do not apply unreviewed Supabase-specific SQL to Aliyun RDS.",
    itemCount: compatibilityReviewChecklist.length,
    findingCount: compatibilityReview.findingCount,
    affectedSourceFileCount: compatibilityReview.affectedSourceCount,
    requiredWriteBackFields,
    closeConditions: [
      "Every category has a reviewed non-secret disposition.",
      "schemaApplyCandidateAudit.readyToApplySchema=true after Supabase-specific SQL is removed or rewritten from rds-schema.sql.",
      "migration.schemaCompatibilityReviewed=true is recorded only after the reviewed RDS apply candidate is prepared.",
      "migration.supabaseSpecificSqlResolved=true is recorded only after Supabase auth schema/auth.uid/storage/service_role/RLS/policy findings are resolved.",
      "migration.rdsExtensionSupportConfirmed=true is recorded only after target RDS engine and extension support are confirmed.",
    ],
    forbiddenValues: [...COMPATIBILITY_FORBIDDEN_VALUES],
    items: compatibilityReviewChecklist.map((item) => ({
      code: item.code,
      statusBeforeP11Apply: item.statusBeforeP11Apply,
      defaultProposedDisposition: item.defaultProposedDisposition,
      findingCount: item.findingCount,
      affectedSourceCount: item.affectedSourceCount,
      sourcePaths: item.sourcePaths,
      requiredOperatorDecision: item.requiredOperatorDecision,
      operatorChecklist: item.operatorChecklist,
      evidenceWriteBackFields: item.evidenceWriteBackFields,
      acceptanceEvidence: item.acceptanceEvidence,
      forbiddenValues: item.forbiddenValues,
    })),
  }
}

function buildSchemaApplyCandidateAudit(schemaSql) {
  const findings = auditRdsSqlCompatibility("rds-schema.sql", schemaSql)
  const review = summarizeCompatibilityReview(findings)
  const hasSupabaseSpecificFindings = review.categories.some((code) => code !== "extension_review")
  return {
    readyToApplySchema: review.required === false,
    status: review.required
      ? hasSupabaseSpecificFindings
        ? "blocked_supabase_specific_sql_present"
        : "blocked_extension_support_unconfirmed"
      : "ready_after_target_rds_engine_confirmation",
    appliesTo: "generated_rds_schema_sql",
    policy: "Do not apply rds-schema.sql to Aliyun RDS while Supabase-specific auth/storage/RLS/policy/service_role SQL remains in the generated candidate.",
    findingCount: review.findingCount,
    affectedGeneratedFileCount: review.affectedSourceCount,
    categories: review.categories,
    byCode: review.byCode,
    findings: review.findings.map((finding) => ({
      code: finding.code,
      severity: finding.severity,
      lineCount: finding.lineCount,
      sampleLineNumbers: finding.sampleLineNumbers,
      action: finding.action,
    })),
    requiredBeforeApply: [
      "Replace Supabase auth schema references such as auth.users and auth.jwt() with APP-owned identity tables or backend auth context.",
      "Remove or rewrite auth.uid() predicates for backend-enforced identity and tenant checks.",
      "Exclude storage.* SQL and replace it with OSS bucket/prefix/RAM/STS evidence.",
      "Replace Supabase service_role grants/policies with Aliyun RDS roles and backend service credentials.",
      "Choose RDS RLS or backend repository authorization for each table before schema apply.",
      "Rewrite/remove Supabase create policy statements before schema apply.",
      "Confirm target RDS PostgreSQL extension support for pgcrypto/gen_random_uuid() before keeping extension-dependent SQL.",
    ],
    forbiddenValues: [...COMPATIBILITY_FORBIDDEN_VALUES],
  }
}

function buildGeneratedSqlLineSourceIndex(sql) {
  const result = []
  let currentSource = "generated_header"
  const lines = sql.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const sourceMatch = lines[index].match(/^-- Source: (.+)$/)
    if (sourceMatch) currentSource = sourceMatch[1].trim()
    result.push({
      lineNumber: index + 1,
      sourcePath: currentSource,
    })
  }
  return result
}

function summarizeReviewLinesBySource(lineNumbers, lineSourceIndex) {
  const bySource = new Map()
  for (const lineNumber of lineNumbers) {
    const sourcePath = lineSourceIndex[lineNumber - 1]?.sourcePath || "unknown"
    if (!bySource.has(sourcePath)) {
      bySource.set(sourcePath, {
        sourcePath,
        lineCount: 0,
        sampleLineNumbers: [],
      })
    }
    const summary = bySource.get(sourcePath)
    summary.lineCount += 1
    if (summary.sampleLineNumbers.length < 8) summary.sampleLineNumbers.push(lineNumber)
  }
  return [...bySource.values()].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath))
}

function buildRdsApplyCandidateReviewPlan(rdsApplyCandidateSql) {
  const lineSourceIndex = buildGeneratedSqlLineSourceIndex(rdsApplyCandidateSql)
  const items = []

  for (const rule of RDS_SQL_COMPATIBILITY_RULES) {
    const lineNumbers = lineNumbersForPattern(rdsApplyCandidateSql, rule.pattern)
    if (!lineNumbers.length) continue
    const disposition = RDS_SQL_COMPATIBILITY_DISPOSITIONS[rule.code] || {}
    const sourceSummaries = summarizeReviewLinesBySource(lineNumbers, lineSourceIndex)
    items.push({
      code: rule.code,
      statusBeforeApply: "must_resolve_before_schema_apply",
      severity: rule.severity,
      findingCount: lineNumbers.length,
      affectedSourceCount: sourceSummaries.length,
      sourceSummaries,
      sampleLineNumbers: lineNumbers.slice(0, 12),
      locationPolicy: "Line numbers refer to generated rds-apply-candidate.sql; source line text is intentionally omitted.",
      defaultProposedDisposition: disposition.defaultProposedDisposition || "record_non_secret_disposition_before_apply",
      requiredOperatorDecision: disposition.requiredOperatorDecision || rule.action,
      operatorChecklist: disposition.operatorChecklist || [
        "Review the generated RDS apply candidate finding before applying schema SQL.",
        "Record a non-secret disposition and acceptance evidence handle.",
      ],
      evidenceWriteBackFields: disposition.writeBackFields || ["migration.schemaCompatibilityReviewed"],
      acceptanceEvidence: disposition.acceptanceEvidence || "Record a non-secret compatibility disposition before applying schema SQL.",
      forbiddenValues: [...COMPATIBILITY_FORBIDDEN_VALUES],
    })
  }

  const sortedItems = items.sort((a, b) => a.code.localeCompare(b.code))
  const requiredWriteBackFields = uniqueStrings(sortedItems.flatMap((item) => item.evidenceWriteBackFields || []))
  return {
    status: sortedItems.length ? "open" : "ready_after_target_rds_engine_confirmation",
    appliesTo: "generated_rds_apply_candidate_sql",
    readyToApplySchema: sortedItems.length === 0,
    itemCount: sortedItems.length,
    findingCount: sortedItems.reduce((sum, item) => sum + item.findingCount, 0),
    categories: sortedItems.map((item) => item.code),
    requiredWriteBackFields,
    policy: "Close every remaining rds-apply-candidate.sql review item before applying schema SQL to Aliyun RDS.",
    closeConditions: [
      "No unresolved Supabase auth schema references remain in rds-apply-candidate.sql.",
      "No unresolved auth.uid() calls remain in rds-apply-candidate.sql.",
      "Target Aliyun RDS PostgreSQL extension support or replacement SQL is confirmed.",
      "migration.schemaCompatibilityReviewed=true, migration.supabaseSpecificSqlResolved=true, and migration.rdsExtensionSupportConfirmed=true are recorded only after review closure.",
    ],
    items: sortedItems,
    forbiddenValues: [...COMPATIBILITY_FORBIDDEN_VALUES],
  }
}

function matchSqlDollarTag(text, index) {
  const match = text.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
  return match ? match[0] : ""
}

function splitSqlStatements(sql) {
  const statements = []
  let current = ""
  let inSingleQuote = false
  let inLineComment = false
  let inBlockComment = false
  let dollarTag = ""

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1] || ""

    if (inLineComment) {
      current += char
      if (char === "\n") inLineComment = false
      continue
    }

    if (inBlockComment) {
      current += char
      if (char === "*" && next === "/") {
        current += next
        index += 1
        inBlockComment = false
      }
      continue
    }

    if (inSingleQuote) {
      current += char
      if (char === "'" && next === "'") {
        current += next
        index += 1
        continue
      }
      if (char === "'") inSingleQuote = false
      continue
    }

    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        current += dollarTag
        index += dollarTag.length - 1
        dollarTag = ""
        continue
      }
      current += char
      continue
    }

    if (char === "-" && next === "-") {
      current += char + next
      index += 1
      inLineComment = true
      continue
    }

    if (char === "/" && next === "*") {
      current += char + next
      index += 1
      inBlockComment = true
      continue
    }

    if (char === "'") {
      current += char
      inSingleQuote = true
      continue
    }

    const matchedDollarTag = matchSqlDollarTag(sql, index)
    if (matchedDollarTag) {
      current += matchedDollarTag
      index += matchedDollarTag.length - 1
      dollarTag = matchedDollarTag
      continue
    }

    current += char
    if (char === ";") {
      const statement = current.trim()
      if (statement) statements.push(statement)
      current = ""
    }
  }

  const trailing = current.trim()
  if (trailing) statements.push(trailing)
  return statements
}

function classifyStatementForRdsApplyCandidate(statement) {
  const categories = []
  if (/\b(create|drop)\s+policy\b/i.test(statement)) categories.push("policy_statement")
  if (/\benable\s+row\s+level\s+security\b/i.test(statement)) categories.push("row_level_security")
  if (/\bstorage\./i.test(statement)) categories.push("supabase_storage_schema")
  if (/\bservice_role\b/i.test(statement)) categories.push("supabase_service_role")
  if (/\bcreate\s+(?:or\s+replace\s+)?function\s+public\.handle_new_user\b/i.test(statement)) {
    categories.push("supabase_auth_schema")
  }
  if (/\b(?:drop|create)\s+trigger\b[\s\S]*\bon\s+auth\.users\b/i.test(statement)) {
    categories.push("supabase_auth_schema")
  }
  return categories
}

function rewriteStatementForRdsApplyCandidate(statement) {
  const rewrittenCategories = []
  let next = statement

  const profileIdAuthUserReference =
    /\bid\s+uuid\s+references\s+auth\.users\s*\(\s*id\s*\)\s+on\s+delete\s+cascade\s+primary\s+key\b/i
  if (profileIdAuthUserReference.test(next)) {
    next = next.replace(profileIdAuthUserReference, "id UUID PRIMARY KEY")
    rewrittenCategories.push("supabase_auth_schema")
  }

  const authUsersReference = /\breferences\s+auth\.users\s*\(\s*id\s*\)/i
  if (authUsersReference.test(next)) {
    next = next.replace(/\breferences\s+auth\.users\s*\(\s*id\s*\)/gi, "references public.profiles(id)")
    rewrittenCategories.push("supabase_auth_schema")
  }

  const authUidCall = /\bauth\.uid\s*\(\s*\)/i
  if (authUidCall.test(next)) {
    next = next.replace(/\bauth\.uid\s*\(\s*\)/gi, "nullif(current_setting('app.current_user_id', true), '')::uuid")
    rewrittenCategories.push("supabase_auth_uid")
  }

  return {
    statement: next,
    rewrittenCategories: uniqueStrings(rewrittenCategories),
  }
}

function buildRdsApplyCandidateSql(schemaMap, sourceFiles) {
  const lines = [
    "-- Meiye Huajing APP production-cn Aliyun RDS PostgreSQL apply candidate.",
    "-- Generated from rds-schema.sql sources after removing Supabase-only policy, RLS, OSS-equivalent, service role, and auth trigger statements.",
    "-- Supabase Auth foreign keys are rewritten to the APP-owned public.profiles identity boundary where possible.",
    "-- Supabase request-user calls are rewritten to read app.current_user_id, which must be set by backend-owned request context before such functions are used.",
    "-- This candidate is still not authorization to apply: run the attached audit and close remaining auth, extension, data migration, and rollback blockers first.",
    "-- Do not paste DATABASE_URL_CN, database passwords, dump contents, Supabase service role keys, AccessKeySecret, tokens, or cookies into this file.",
    "",
    `-- Environment: ${schemaMap.environment}`,
    `-- Formal target: ${schemaMap.formalTarget}`,
    `-- Source file count: ${sourceFiles.length}`,
    "",
  ]
  const removedByCode = new Map()
  const rewrittenByCode = new Map()
  const sourceSummaries = []
  let keptStatementCount = 0
  let removedStatementCount = 0
  let rewrittenStatementCount = 0

  for (const source of sourceFiles) {
    const statements = splitSqlStatements(source.content)
    const keptStatements = []
    const removedForSource = []
    const rewrittenForSource = []

    for (const statement of statements) {
      const categories = classifyStatementForRdsApplyCandidate(statement)
      if (categories.length) {
        removedStatementCount += 1
        removedForSource.push(...categories)
        for (const category of categories) {
          removedByCode.set(category, (removedByCode.get(category) || 0) + 1)
        }
        continue
      }
      const rewritten = rewriteStatementForRdsApplyCandidate(statement)
      if (rewritten.rewrittenCategories.length) {
        rewrittenStatementCount += 1
        rewrittenForSource.push(...rewritten.rewrittenCategories)
        for (const category of rewritten.rewrittenCategories) {
          rewrittenByCode.set(category, (rewrittenByCode.get(category) || 0) + 1)
        }
      }
      keptStatementCount += 1
      keptStatements.push(rewritten.statement)
    }

    sourceSummaries.push({
      sourcePath: source.path,
      sourceStatementCount: statements.length,
      keptStatementCount: keptStatements.length,
      removedStatementCount: statements.length - keptStatements.length,
      removedCategories: [...new Set(removedForSource)].sort(),
      rewrittenStatementCount: rewrittenForSource.length,
      rewrittenCategories: [...new Set(rewrittenForSource)].sort(),
    })

    lines.push(
      "",
      "-- -----------------------------------------------------------------------------",
      `-- Source: ${source.path}`,
      `-- sha256: ${source.sha256}`,
      `-- keptStatements: ${keptStatements.length}`,
      `-- removedSupabaseOnlyStatements: ${statements.length - keptStatements.length}`,
      `-- rewrittenRdsCompatibilityStatements: ${rewrittenForSource.length}`,
      "-- -----------------------------------------------------------------------------",
      "",
      keptStatements.join("\n\n").trimEnd(),
      "",
    )
  }

  const removedCategories = [...removedByCode.entries()]
    .map(([code, statementCount]) => ({ code, statementCount }))
    .sort((a, b) => a.code.localeCompare(b.code))
  const rewrittenCategories = [...rewrittenByCode.entries()]
    .map(([code, statementCount]) => ({ code, statementCount }))
    .sort((a, b) => a.code.localeCompare(b.code))

  return {
    sql: lines.join("\n"),
    removalSummary: {
      status: removedStatementCount > 0 ? "supabase_only_statements_removed" : "no_supabase_only_statements_detected",
      keptStatementCount,
      removedStatementCount,
      removedCategories,
      rewrittenStatementCount,
      rewrittenCategories,
      sourceSummaries,
      policy: "Removed statements are not applied to Aliyun RDS; rewritten statements move Supabase auth references to APP-owned identity context. Equivalent authorization and object storage boundaries must be enforced by APP API repositories, Aliyun OSS, RAM/STS, and runtime secret env.",
      remainingReviewRequired: true,
      remainingReviewReasons: [
        "Target Aliyun RDS PostgreSQL engine/version and extension support are not confirmed.",
        "Backend-owned request context must set app.current_user_id before any rewritten auth.uid-compatible function is used.",
        "Schema/data migration, APP API smoke, and rollback validation are not complete.",
      ],
    },
  }
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
    `- rdsApplyCandidateSqlSha256: ${report.summary.rdsApplyCandidateSqlSha256}`,
    `- validationSqlSha256: ${report.summary.validationSqlSha256}`,
    `- blockers: ${report.blockers.length ? report.blockers.join(", ") : "none"}`,
    `- warnings: ${report.warnings.length ? report.warnings.join(", ") : "none"}`,
    `- rdsCompatibilityReviewRequired: ${report.compatibilityReview.required}`,
    `- rdsCompatibilityFindingCount: ${report.compatibilityReview.findingCount}`,
    `- rdsCompatibilityAffectedSourceCount: ${report.compatibilityReview.affectedSourceCount}`,
    `- schemaApplyCandidateReady: ${report.schemaApplyCandidateAudit.readyToApplySchema}`,
    `- schemaApplyCandidateStatus: ${report.schemaApplyCandidateAudit.status}`,
    `- schemaApplyCandidateFindingCount: ${report.schemaApplyCandidateAudit.findingCount}`,
    `- schemaApplyCandidateCategories: ${report.schemaApplyCandidateAudit.categories.join(", ") || "none"}`,
    `- rdsApplyCandidateReady: ${report.rdsApplyCandidateAudit.readyToApplySchema}`,
    `- rdsApplyCandidateStatus: ${report.rdsApplyCandidateAudit.status}`,
    `- rdsApplyCandidateFindingCount: ${report.rdsApplyCandidateAudit.findingCount}`,
    `- rdsApplyCandidateCategories: ${report.rdsApplyCandidateAudit.categories.join(", ") || "none"}`,
    `- rdsApplyCandidateRemovedStatements: ${report.rdsApplyCandidate.removalSummary.removedStatementCount}`,
    "",
    "## Files",
    "",
    `- manifest: ${report.files.manifest}`,
    `- markdown: ${report.files.markdown}`,
    `- schemaSql: ${report.files.schemaSql}`,
    `- rdsApplyCandidateSql: ${report.files.rdsApplyCandidateSql}`,
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
    "## RDS Schema Apply Candidate Audit",
    "",
    `- readyToApplySchema: ${report.schemaApplyCandidateAudit.readyToApplySchema}`,
    `- status: ${report.schemaApplyCandidateAudit.status}`,
    `- findingCount: ${report.schemaApplyCandidateAudit.findingCount}`,
    `- categories: ${report.schemaApplyCandidateAudit.categories.join(", ") || "none"}`,
    `- policy: ${report.schemaApplyCandidateAudit.policy}`,
    "",
    ...report.schemaApplyCandidateAudit.byCode.map((item) =>
      `- ${item.code}: findings=${item.findingCount}, generatedFiles=${item.affectedSourceCount}, action=${item.action}`,
    ),
    "",
    "## RDS Apply Candidate",
    "",
    `- readyToApplySchema: ${report.rdsApplyCandidateAudit.readyToApplySchema}`,
    `- status: ${report.rdsApplyCandidateAudit.status}`,
    `- findingCount: ${report.rdsApplyCandidateAudit.findingCount}`,
    `- categories: ${report.rdsApplyCandidateAudit.categories.join(", ") || "none"}`,
    `- removedStatementCount: ${report.rdsApplyCandidate.removalSummary.removedStatementCount}`,
    `- keptStatementCount: ${report.rdsApplyCandidate.removalSummary.keptStatementCount}`,
    `- removalPolicy: ${report.rdsApplyCandidate.removalSummary.policy}`,
    "",
    ...report.rdsApplyCandidate.removalSummary.removedCategories.map((item) =>
      `- removed:${item.code}: statements=${item.statementCount}`,
    ),
    "",
    "## RDS Apply Candidate Review Plan",
    "",
    `- status: ${report.rdsApplyCandidateReviewPlan.status}`,
    `- readyToApplySchema: ${report.rdsApplyCandidateReviewPlan.readyToApplySchema}`,
    `- itemCount: ${report.rdsApplyCandidateReviewPlan.itemCount}`,
    `- findingCount: ${report.rdsApplyCandidateReviewPlan.findingCount}`,
    `- categories: ${report.rdsApplyCandidateReviewPlan.categories.join(", ") || "none"}`,
    `- requiredWriteBackFields: ${report.rdsApplyCandidateReviewPlan.requiredWriteBackFields.join(", ") || "none"}`,
    `- policy: ${report.rdsApplyCandidateReviewPlan.policy}`,
    `- closeConditions: ${report.rdsApplyCandidateReviewPlan.closeConditions.join("; ") || "none"}`,
    "",
    ...report.rdsApplyCandidateReviewPlan.items.flatMap((item) => [
      `### apply-review:${item.code}`,
      "",
      `- statusBeforeApply: ${item.statusBeforeApply}`,
      `- findingCount: ${item.findingCount}`,
      `- affectedSourceCount: ${item.affectedSourceCount}`,
      `- sampleLineNumbers: ${item.sampleLineNumbers.join(", ") || "none"}`,
      `- sourceSummaries: ${item.sourceSummaries.map((source) => `${source.sourcePath}:${source.lineCount}`).join("; ") || "none"}`,
      `- defaultProposedDisposition: ${item.defaultProposedDisposition}`,
      `- requiredOperatorDecision: ${item.requiredOperatorDecision}`,
      `- evidenceWriteBackFields: ${item.evidenceWriteBackFields.join(", ") || "none"}`,
      `- acceptanceEvidence: ${item.acceptanceEvidence}`,
      "",
    ]),
    "## RDS Compatibility Disposition Plan",
    "",
    `- status: ${report.compatibilityDispositionPlan.status}`,
    `- readyToApplySchema: ${report.compatibilityDispositionPlan.readyToApplySchema}`,
    `- defaultDispositionPolicy: ${report.compatibilityDispositionPlan.defaultDispositionPolicy}`,
    `- itemCount: ${report.compatibilityDispositionPlan.itemCount}`,
    `- requiredWriteBackFields: ${report.compatibilityDispositionPlan.requiredWriteBackFields.join(", ")}`,
    `- closeConditions: ${report.compatibilityDispositionPlan.closeConditions.join("; ")}`,
    `- forbiddenValues: ${report.compatibilityDispositionPlan.forbiddenValues.join(", ")}`,
    "",
    ...report.compatibilityDispositionPlan.items.flatMap((item) => [
      `### disposition:${item.code}`,
      "",
      `- defaultProposedDisposition: ${item.defaultProposedDisposition}`,
      `- operatorChecklist: ${item.operatorChecklist.join("; ")}`,
      `- acceptanceEvidence: ${item.acceptanceEvidence}`,
      "",
    ]),
    "## RDS Compatibility Review Checklist",
    "",
    ...report.compatibilityReviewChecklist.flatMap((item) => [
      `### ${item.code}`,
      "",
      `- statusBeforeP11Apply: ${item.statusBeforeP11Apply}`,
      `- findingCount: ${item.findingCount}`,
      `- affectedSourceCount: ${item.affectedSourceCount}`,
      `- sourcePaths: ${item.sourcePaths.join(", ") || "none"}`,
      `- defaultProposedDisposition: ${item.defaultProposedDisposition}`,
      `- requiredOperatorDecision: ${item.requiredOperatorDecision}`,
      `- operatorChecklist: ${item.operatorChecklist.join("; ")}`,
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
  const rdsApplyCandidate = buildRdsApplyCandidateSql(schemaMap, sourceFiles)
  const rdsApplyCandidateSql = rdsApplyCandidate.sql
  const validationSql = renderValidationSql(schemaMap)
  const rollbackChecklist = renderRollbackChecklist(schemaMap)
  const combinedGenerated = `${schemaSql}\n${rdsApplyCandidateSql}\n${validationSql}\n${rollbackChecklist}`
  const generatedSecretMatches = findSecretLikeValues(combinedGenerated)
  if (generatedSecretMatches.length) blockers.push("generated_package_contains_secret_like_values")
  const compatibilityReview = summarizeCompatibilityReview(compatibilityFindings)
  const compatibilityReviewChecklist = buildCompatibilityReviewChecklist(compatibilityReview)
  const schemaApplyCandidateAudit = buildSchemaApplyCandidateAudit(schemaSql)
  const rdsApplyCandidateAudit = {
    ...buildSchemaApplyCandidateAudit(rdsApplyCandidateSql),
    appliesTo: "generated_rds_apply_candidate_sql",
    policy: "Do not apply rds-apply-candidate.sql until remaining auth-dependent function/reference rewrites, extension support, data migration, APP API smoke, and rollback validation are closed.",
  }
  const rdsApplyCandidateReviewPlan = buildRdsApplyCandidateReviewPlan(rdsApplyCandidateSql)
  const compatibilityDispositionPlan = buildCompatibilityDispositionPlan(
    compatibilityReview,
    compatibilityReviewChecklist,
  )

  const manifestPath = resolve(args.outDir, "rds-migration-package.json")
  const markdownPath = resolve(args.outDir, "rds-migration-package.md")
  const schemaSqlPath = resolve(args.outDir, "rds-schema.sql")
  const rdsApplyCandidateSqlPath = resolve(args.outDir, "rds-apply-candidate.sql")
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
      rdsApplyCandidateSqlBytes: Buffer.byteLength(rdsApplyCandidateSql),
      validationSqlBytes: Buffer.byteLength(validationSql),
      schemaSqlSha256: sha256(schemaSql),
      rdsApplyCandidateSqlSha256: sha256(rdsApplyCandidateSql),
      validationSqlSha256: sha256(validationSql),
      rollbackChecklistSha256: sha256(rollbackChecklist),
      compatibilityReviewRequired: compatibilityReview.required,
      compatibilityFindingCount: compatibilityReview.findingCount,
      compatibilityAffectedSourceFileCount: compatibilityReview.affectedSourceCount,
      compatibilityReviewChecklistItemCount: compatibilityReviewChecklist.length,
      compatibilityDispositionPlanItemCount: compatibilityDispositionPlan.itemCount,
      schemaApplyCandidateReady: schemaApplyCandidateAudit.readyToApplySchema,
      schemaApplyCandidateStatus: schemaApplyCandidateAudit.status,
      schemaApplyCandidateFindingCount: schemaApplyCandidateAudit.findingCount,
      schemaApplyCandidateCategories: schemaApplyCandidateAudit.categories,
      rdsApplyCandidateReady: rdsApplyCandidateAudit.readyToApplySchema,
      rdsApplyCandidateStatus: rdsApplyCandidateAudit.status,
      rdsApplyCandidateFindingCount: rdsApplyCandidateAudit.findingCount,
      rdsApplyCandidateCategories: rdsApplyCandidateAudit.categories,
      rdsApplyCandidateRemovedStatementCount: rdsApplyCandidate.removalSummary.removedStatementCount,
      rdsApplyCandidateReviewPlanReady: rdsApplyCandidateReviewPlan.readyToApplySchema,
      rdsApplyCandidateReviewPlanItemCount: rdsApplyCandidateReviewPlan.itemCount,
      rdsApplyCandidateReviewPlanFindingCount: rdsApplyCandidateReviewPlan.findingCount,
    },
    compatibilityReview,
    compatibilityReviewChecklist,
    schemaApplyCandidateAudit,
    rdsApplyCandidate,
    rdsApplyCandidateAudit,
    rdsApplyCandidateReviewPlan,
    compatibilityDispositionPlan,
    files: {
      manifest: manifestPath,
      markdown: markdownPath,
      schemaSql: schemaSqlPath,
      rdsApplyCandidateSql: rdsApplyCandidateSqlPath,
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
  writeText(rdsApplyCandidateSqlPath, rdsApplyCandidateSql)
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
