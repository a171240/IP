/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|DATABASE_URL_CN\s*=\s*\S{8,})/i

function requiredColumn(name, dataType, udtName, nullable, defaultExpression = null) {
  return { name, dataType, udtName, nullable, defaultExpression }
}

function requiredIndex(name, unique, columns) {
  return {
    name,
    method: "btree",
    unique,
    columns: columns.map(([columnName, direction]) => ({ name: columnName, direction })),
    predicate: null,
    expression: null,
    valid: true,
    ready: true,
  }
}

test("Aliyun RDS schema map admits the exact voice coach runtime contract", () => {
  const schemaMap = readJson("deploy", "aliyun-production-cn.rds-first-version-schema-map.json")
  const voiceTables = schemaMap.requiredTables
    .filter((item) => item.name.startsWith("voice_coach_"))
  const byName = new Map(voiceTables.map((item) => [item.name, item]))

  assert.ok(schemaMap.firstVersionCapabilities.includes("voice_coach_text_training"))
  assert.deepEqual([...byName.keys()].sort(), [
    "voice_coach_customer_profiles",
    "voice_coach_scene_cards",
    "voice_coach_sessions",
    "voice_coach_turns",
  ])
  assert.ok(voiceTables.every((item) => item.capabilities.includes("voice_coach_text_training")))
  assert.deepEqual(byName.get("voice_coach_scene_cards").capabilities, ["voice_coach_text_training"])
  assert.deepEqual(byName.get("voice_coach_customer_profiles").requiredColumns, [
    requiredColumn("id", "uuid", "uuid", false, "gen_random_uuid()"),
    requiredColumn("created_at", "timestamp with time zone", "timestamptz", false, "now()"),
    requiredColumn("updated_at", "timestamp with time zone", "timestamptz", false, "now()"),
    requiredColumn("user_id", "uuid", "uuid", false),
    requiredColumn("name", "text", "text", false),
    requiredColumn("age_label", "text", "text", true),
    requiredColumn("occupation", "text", "text", true),
    requiredColumn("personality_tags", "jsonb", "jsonb", false, "'[]'::jsonb"),
    requiredColumn("communication_style", "text", "text", true),
    requiredColumn("core_concerns", "jsonb", "jsonb", false, "'[]'::jsonb"),
    requiredColumn("trust_triggers", "jsonb", "jsonb", false, "'[]'::jsonb"),
    requiredColumn("past_experience", "text", "text", true),
    requiredColumn("notes", "text", "text", true),
  ])
  assert.deepEqual(byName.get("voice_coach_scene_cards").requiredColumns, [
    requiredColumn("id", "uuid", "uuid", false, "gen_random_uuid()"),
    requiredColumn("created_at", "timestamp with time zone", "timestamptz", false, "now()"),
    requiredColumn("updated_at", "timestamp with time zone", "timestamptz", false, "now()"),
    requiredColumn("user_id", "uuid", "uuid", false),
    requiredColumn("name", "text", "text", false),
    requiredColumn("scene_kind", "text", "text", false, "'customer_visit'::text"),
    requiredColumn("service_name", "text", "text", true),
    requiredColumn("customer_stage", "text", "text", true),
    requiredColumn("scene_goal", "text", "text", true),
    requiredColumn("focus_stages", "jsonb", "jsonb", false, "'[]'::jsonb"),
    requiredColumn("likely_questions", "jsonb", "jsonb", false, "'[]'::jsonb"),
    requiredColumn("target_objections", "jsonb", "jsonb", false, "'[]'::jsonb"),
    requiredColumn("communication_method_tags", "jsonb", "jsonb", false, "'[]'::jsonb"),
    requiredColumn("must_cover_points", "jsonb", "jsonb", false, "'[]'::jsonb"),
    requiredColumn("do_not_say", "jsonb", "jsonb", false, "'[]'::jsonb"),
    requiredColumn("notes", "text", "text", true),
  ])
  assert.deepEqual(byName.get("voice_coach_sessions").requiredColumns, [
    requiredColumn("id", "uuid", "uuid", false, "gen_random_uuid()"),
    requiredColumn("created_at", "timestamp with time zone", "timestamptz", false, "now()"),
    requiredColumn("user_id", "uuid", "uuid", false),
    requiredColumn("company_id", "uuid", "uuid", true),
    requiredColumn("store_id", "uuid", "uuid", true),
    requiredColumn("membership_id", "uuid", "uuid", true),
    requiredColumn("scenario_id", "text", "text", false, "'objection_safety'::text"),
    requiredColumn("status", "text", "text", false, "'active'::text"),
    requiredColumn("started_at", "timestamp with time zone", "timestamptz", false, "now()"),
    requiredColumn("ended_at", "timestamp with time zone", "timestamptz", true),
    requiredColumn("report_json", "jsonb", "jsonb", true),
    requiredColumn("total_score", "numeric", "numeric", true),
    requiredColumn("dimension_scores", "jsonb", "jsonb", true),
    requiredColumn("customer_profile_id", "uuid", "uuid", true),
    requiredColumn("scene_card_id", "uuid", "uuid", true),
    requiredColumn("session_context_json", "jsonb", "jsonb", true),
    requiredColumn("scenario_snapshot_json", "jsonb", "jsonb", true),
  ])
  assert.deepEqual(byName.get("voice_coach_turns").requiredColumns, [
    requiredColumn("id", "uuid", "uuid", false, "gen_random_uuid()"),
    requiredColumn("created_at", "timestamp with time zone", "timestamptz", false, "now()"),
    requiredColumn("session_id", "uuid", "uuid", false),
    requiredColumn("turn_index", "integer", "int4", false),
    requiredColumn("role", "text", "text", false),
    requiredColumn("text", "text", "text", false, "''::text"),
    requiredColumn("emotion", "text", "text", true),
    requiredColumn("audio_path", "text", "text", true),
    requiredColumn("audio_seconds", "numeric", "numeric", true),
    requiredColumn("asr_confidence", "numeric", "numeric", true),
    requiredColumn("analysis_json", "jsonb", "jsonb", true),
    requiredColumn("features_json", "jsonb", "jsonb", true),
  ])

  assert.equal(voiceTables.flatMap((item) => item.requiredColumns).length, 58)
  assert.equal(voiceTables.flatMap((item) => item.requiredConstraints).length, 13)
  assert.equal(voiceTables.flatMap((item) => item.requiredIndexes).length, 11)
  assert.deepEqual(byName.get("voice_coach_customer_profiles").requiredConstraints, [
    { name: "voice_coach_customer_profiles_pkey", type: "primary_key", columns: ["id"], validated: true },
  ])
  assert.deepEqual(byName.get("voice_coach_scene_cards").requiredConstraints, [
    { name: "voice_coach_scene_cards_pkey", type: "primary_key", columns: ["id"], validated: true },
    {
      name: "voice_coach_scene_cards_scene_kind_check",
      type: "check",
      columns: ["scene_kind"],
      checkExpression: "scene_kind = ANY (ARRAY['customer_visit'::text, 'offer_promo'::text])",
      validated: true,
    },
  ])
  assert.deepEqual(byName.get("voice_coach_sessions").requiredConstraints, [
    { name: "voice_coach_sessions_pkey", type: "primary_key", columns: ["id"], validated: true },
    {
      name: "voice_coach_sessions_status_check",
      type: "check",
      columns: ["status"],
      checkExpression: "status = ANY (ARRAY['active'::text, 'ended'::text])",
      validated: true,
    },
    { name: "voice_coach_sessions_company_id_fkey", type: "foreign_key", columns: ["company_id"], referencedTable: "mp_companies", referencedColumns: ["id"], onDelete: "set_null", validated: true },
    { name: "voice_coach_sessions_store_id_fkey", type: "foreign_key", columns: ["store_id"], referencedTable: "mp_stores", referencedColumns: ["id"], onDelete: "set_null", validated: true },
    { name: "voice_coach_sessions_membership_id_fkey", type: "foreign_key", columns: ["membership_id"], referencedTable: "mp_account_memberships", referencedColumns: ["id"], onDelete: "set_null", validated: true },
    { name: "voice_coach_sessions_customer_profile_id_fkey", type: "foreign_key", columns: ["customer_profile_id"], referencedTable: "voice_coach_customer_profiles", referencedColumns: ["id"], onDelete: "set_null", validated: true },
    { name: "voice_coach_sessions_scene_card_id_fkey", type: "foreign_key", columns: ["scene_card_id"], referencedTable: "voice_coach_scene_cards", referencedColumns: ["id"], onDelete: "set_null", validated: true },
  ])
  assert.deepEqual(byName.get("voice_coach_turns").requiredConstraints, [
    { name: "voice_coach_turns_pkey", type: "primary_key", columns: ["id"], validated: true },
    { name: "voice_coach_turns_session_id_fkey", type: "foreign_key", columns: ["session_id"], referencedTable: "voice_coach_sessions", referencedColumns: ["id"], onDelete: "cascade", validated: true },
    {
      name: "voice_coach_turns_role_check",
      type: "check",
      columns: ["role"],
      checkExpression: "role = ANY (ARRAY['customer'::text, 'beautician'::text])",
      validated: true,
    },
  ])
  assert.deepEqual(byName.get("voice_coach_customer_profiles").requiredIndexes, [
    requiredIndex("voice_coach_customer_profiles_user_updated_idx", false, [["user_id", "ASC"], ["updated_at", "DESC"]]),
  ])
  assert.deepEqual(byName.get("voice_coach_scene_cards").requiredIndexes, [
    requiredIndex("voice_coach_scene_cards_user_updated_idx", false, [["user_id", "ASC"], ["updated_at", "DESC"]]),
  ])
  assert.deepEqual(byName.get("voice_coach_sessions").requiredIndexes, [
    requiredIndex("voice_coach_sessions_user_created_at_idx", false, [["user_id", "ASC"], ["created_at", "DESC"]]),
    requiredIndex("voice_coach_sessions_status_idx", false, [["status", "ASC"]]),
    requiredIndex("voice_coach_sessions_company_started_idx", false, [["company_id", "ASC"], ["started_at", "DESC"]]),
    requiredIndex("voice_coach_sessions_store_started_idx", false, [["store_id", "ASC"], ["started_at", "DESC"]]),
    requiredIndex("voice_coach_sessions_membership_started_idx", false, [["membership_id", "ASC"], ["started_at", "DESC"]]),
    requiredIndex("voice_coach_sessions_customer_profile_idx", false, [["customer_profile_id", "ASC"]]),
    requiredIndex("voice_coach_sessions_scene_card_idx", false, [["scene_card_id", "ASC"]]),
  ])
  assert.deepEqual(byName.get("voice_coach_turns").requiredIndexes, [
    requiredIndex("voice_coach_turns_session_turn_index_key", true, [["session_id", "ASC"], ["turn_index", "ASC"]]),
    requiredIndex("voice_coach_turns_session_created_at_idx", false, [["session_id", "ASC"], ["created_at", "ASC"]]),
  ])

  const repositoryByTable = new Map([
    ["voice_coach_customer_profiles", read("lib", "aliyun-rds", "repositories", "customer-profiles.server.ts")],
    ["voice_coach_scene_cards", read("lib", "aliyun-rds", "repositories", "scene-cards.server.ts")],
    ["voice_coach_sessions", read("lib", "aliyun-rds", "repositories", "app-voice-coach-rds.server.ts")],
    ["voice_coach_turns", read("lib", "aliyun-rds", "repositories", "app-voice-coach-rds.server.ts")],
  ])
  for (const [tableName, repositorySource] of repositoryByTable) {
    for (const column of byName.get(tableName).requiredColumns) {
      assert.match(repositorySource, new RegExp(`\\b${column.name}\\b`), `${tableName}.${column.name}`)
    }
  }
})

test("Aliyun RDS migration package command is wired into scripts, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")

  assert.equal(pkg.scripts["aliyun:rds:migration:package"], "node ./scripts/generate-aliyun-rds-migration-package.mjs")
  assert.equal(pkg.scripts["aliyun:rds:migration:package:test"], "node --test tests/aliyun-rds-migration-package.static.test.js")
  assert.match(predeploy, /aliyun:rds:migration:package:test/)
  assert.match(predeploy, /aliyun:rds:migration:package/)
  assert.match(deploySpecChecker, /corepack pnpm aliyun:rds:migration:package/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:rds:migration:package:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:rds:migration:package"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:rds:migration:package"))
  assert.match(releaseArtifacts, /rdsMigrationPackage/)
  assert.match(releaseArtifacts, /rds-migration-package\.json/)
  assert.match(releaseArtifacts, /rds-schema\.sql/)
  assert.match(releaseArtifacts, /rds-validation\.sql/)
  assert.match(releaseArtifacts, /compatibilityReviewChecklistItemCount/)
  assert.match(releaseArtifacts, /compatibilityChecklistCodes/)
})

test("Aliyun RDS migration package generates non-secret SQL and validation artifacts", () => {
  const outDir = path.join(os.tmpdir(), `aliyun-rds-migration-package-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-rds-migration-package.mjs",
    "--out-dir",
    outDir,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)
  const schemaSql = fs.readFileSync(path.join(outDir, "rds-schema.sql"), "utf8")
  const rdsApplyCandidateSql = fs.readFileSync(path.join(outDir, "rds-apply-candidate.sql"), "utf8")
  const validationSql = fs.readFileSync(path.join(outDir, "rds-validation.sql"), "utf8")
  const rollback = fs.readFileSync(path.join(outDir, "rds-rollback-checklist.md"), "utf8")
  const markdown = fs.readFileSync(path.join(outDir, "rds-migration-package.md"), "utf8")
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "rds-migration-package.json"), "utf8"))

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.summary.sourceFileCount, 12)
  assert.equal(report.summary.requiredTableCount, 19)
  assert.equal(report.summary.requiredColumnCount, 58)
  assert.equal(report.summary.requiredConstraintCount, 13)
  assert.equal(report.summary.requiredIndexCount, 11)
  assert.equal(report.summary.requiredFunctionCount, 0)
  assert.equal(report.summary.requiredStorageCount, 1)
  assert.equal(report.summary.compatibilityReviewRequired, true)
  assert.ok(report.summary.compatibilityFindingCount > 0)
  assert.equal(report.summary.compatibilityAffectedSourceFileCount, 10)
  assert.equal(report.summary.compatibilityReviewChecklistItemCount, 7)
  assert.equal(report.summary.compatibilityDispositionPlanItemCount, 7)
  assert.equal(report.summary.schemaApplyCandidateReady, false)
  assert.equal(report.summary.schemaApplyCandidateStatus, "blocked_supabase_specific_sql_present")
  assert.equal(report.summary.schemaApplyCandidateFindingCount, 182)
  assert.ok(report.summary.schemaApplyCandidateCategories.includes("supabase_auth_schema"))
  assert.ok(report.summary.schemaApplyCandidateCategories.includes("supabase_auth_uid"))
  assert.equal(report.summary.rdsApplyCandidateReady, true)
  assert.equal(report.summary.rdsApplyCandidateStatus, "ready_after_target_rds_engine_confirmation")
  assert.equal(report.summary.rdsApplyCandidateFindingCount, 0)
  assert.deepEqual(report.summary.rdsApplyCandidateCategories, [])
  assert.equal(report.summary.rdsApplyCandidateRemovedStatementCount, 113)
  assert.equal(report.summary.rdsApplyCandidateReviewPlanReady, true)
  assert.equal(report.summary.rdsApplyCandidateReviewPlanItemCount, 0)
  assert.equal(report.summary.rdsApplyCandidateReviewPlanFindingCount, 0)
  assert.equal(report.summary.rdsApplyCandidateReviewPlanResolvedItemCount, 1)
  assert.equal(report.summary.rdsApplyCandidateReviewPlanResolvedFindingCount, 23)
  assert.equal(report.summary.targetRdsExtensionSupportConfirmed, true)
  assert.equal(report.compatibilityReview.required, true)
  assert.match(report.compatibilityReview.policy, /must not be applied to Aliyun RDS/)
  assert.ok(report.compatibilityReview.categories.includes("supabase_auth_schema"))
  assert.ok(report.compatibilityReview.categories.includes("supabase_auth_uid"))
  assert.ok(report.compatibilityReview.categories.includes("supabase_storage_schema"))
  assert.ok(report.compatibilityReview.categories.includes("supabase_service_role"))
  assert.ok(report.compatibilityReview.categories.includes("row_level_security"))
  assert.ok(report.compatibilityReview.categories.includes("policy_statement"))
  assert.ok(report.compatibilityReview.categories.includes("extension_review"))
  assert.ok(report.compatibilityReview.bySource.some((item) => item.sourcePath === "lib/supabase/schema.sql"))
  assert.ok(report.compatibilityReview.byCode.every((item) => Array.isArray(item.sourcePaths) && item.sourcePaths.length > 0))
  assert.ok(report.compatibilityReview.findings.every((item) => !("lineText" in item)))
  assert.equal(report.compatibilityReviewChecklist.length, 7)
  const checklistByCode = new Map(report.compatibilityReviewChecklist.map((item) => [item.code, item]))
  assert.ok(checklistByCode.get("supabase_auth_schema").evidenceWriteBackFields.includes("migration.supabaseSpecificSqlResolved"))
  assert.ok(checklistByCode.get("supabase_auth_uid").evidenceWriteBackFields.includes("migration.supabaseSpecificSqlResolved"))
  assert.ok(checklistByCode.get("supabase_storage_schema").evidenceWriteBackFields.includes("cloudConfirmations.items.oss"))
  assert.ok(checklistByCode.get("supabase_service_role").requiredOperatorDecision.includes("Aliyun RDS roles"))
  assert.ok(checklistByCode.get("row_level_security").requiredOperatorDecision.includes("tenant authorization"))
  assert.ok(checklistByCode.get("policy_statement").acceptanceEvidence.includes("recorded disposition"))
  assert.ok(checklistByCode.get("extension_review").evidenceWriteBackFields.includes("migration.rdsExtensionSupportConfirmed"))
  assert.equal(checklistByCode.get("supabase_auth_uid").defaultProposedDisposition, "rewrite_to_backend_enforced_identity_and_tenant_scope")
  assert.ok(checklistByCode.get("supabase_storage_schema").operatorChecklist.some((item) => item.includes("OSS bucket")))
  assert.ok(report.compatibilityReviewChecklist.every((item) => item.statusBeforeP11Apply === "must_resolve_before_schema_apply"))
  assert.ok(report.compatibilityReviewChecklist.every((item) => item.forbiddenValues.includes("DATABASE_URL_CN value")))
  assert.equal(report.compatibilityDispositionPlan.status, "open")
  assert.equal(report.compatibilityDispositionPlan.readyToApplySchema, false)
  assert.equal(report.compatibilityDispositionPlan.itemCount, 7)
  assert.ok(report.compatibilityDispositionPlan.requiredWriteBackFields.includes("migration.schemaCompatibilityReviewed"))
  assert.ok(report.compatibilityDispositionPlan.requiredWriteBackFields.includes("migration.rdsExtensionSupportConfirmed"))
  assert.ok(report.compatibilityDispositionPlan.items.some((item) =>
    item.code === "supabase_auth_schema" &&
    item.defaultProposedDisposition === "replace_supabase_auth_schema_with_app_identity_model"))
  assert.ok(report.compatibilityDispositionPlan.items.some((item) =>
    item.code === "policy_statement" &&
    item.defaultProposedDisposition === "rewrite_remove_or_replace_each_supabase_policy"))
  assert.equal(report.schemaApplyCandidateAudit.readyToApplySchema, false)
  assert.equal(report.schemaApplyCandidateAudit.status, "blocked_supabase_specific_sql_present")
  assert.equal(report.schemaApplyCandidateAudit.findingCount, 182)
  assert.equal(report.schemaApplyCandidateAudit.affectedGeneratedFileCount, 1)
  assert.ok(report.schemaApplyCandidateAudit.categories.includes("supabase_auth_schema"))
  assert.ok(report.schemaApplyCandidateAudit.categories.includes("supabase_storage_schema"))
  assert.ok(report.schemaApplyCandidateAudit.byCode.some((item) =>
    item.code === "supabase_auth_uid" &&
    item.sourcePaths.includes("rds-schema.sql")))
  assert.ok(report.schemaApplyCandidateAudit.requiredBeforeApply.some((item) => item.includes("auth.uid")))
  assert.ok(report.schemaApplyCandidateAudit.requiredBeforeApply.some((item) => item.includes("auth.users")))
  assert.equal(report.rdsApplyCandidateAudit.readyToApplySchema, true)
  assert.equal(report.rdsApplyCandidateAudit.status, "ready_after_target_rds_engine_confirmation")
  assert.equal(report.rdsApplyCandidateAudit.findingCount, 0)
  assert.deepEqual(report.rdsApplyCandidateAudit.categories, [])
  assert.equal(report.rdsApplyCandidateAudit.resolvedByTargetRds.ready, true)
  assert.equal(report.rdsApplyCandidateAudit.resolvedByTargetRds.target, "Aliyun RDS PostgreSQL 16.0")
  assert.equal(report.rdsApplyCandidateAudit.resolvedByTargetRds.resolvedFindingCount, 23)
  assert.ok(report.rdsApplyCandidateAudit.resolvedByTargetRds.resolvedCodes.includes("extension_review"))
  assert.ok(report.rdsApplyCandidateAudit.resolvedByTargetRds.supportedExtensions.some((item) =>
    item.name === "pgcrypto" &&
    item.version === "1.3" &&
    item.requiredFor.includes("gen_random_uuid()")))
  assert.equal(report.rdsApplyCandidate.removalSummary.status, "supabase_only_statements_removed")
  assert.equal(report.rdsApplyCandidate.removalSummary.removedStatementCount, 113)
  assert.ok(report.rdsApplyCandidate.removalSummary.removedCategories.some((item) => item.code === "policy_statement"))
  assert.ok(report.rdsApplyCandidate.removalSummary.removedCategories.some((item) => item.code === "row_level_security"))
  assert.ok(report.rdsApplyCandidate.removalSummary.removedCategories.some((item) =>
    item.code === "supabase_auth_schema" && item.statementCount === 3))
  assert.ok(report.rdsApplyCandidate.removalSummary.removedCategories.some((item) =>
    item.code === "deferred_auth_uid_function:update_profile_public" && item.statementCount === 1))
  assert.ok(report.rdsApplyCandidate.removalSummary.removedCategories.some((item) =>
    item.code === "deferred_auth_uid_function:grant_trial_credits" && item.statementCount === 1))
  assert.ok(report.rdsApplyCandidate.removalSummary.removedCategories.some((item) =>
    item.code === "deferred_auth_uid_function:consume_credits" && item.statementCount === 1))
  assert.ok(report.rdsApplyCandidate.removalSummary.removedCategories.some((item) =>
    item.code === "deferred_out_of_scope_xhs_drafts" && item.statementCount === 12))
  assert.ok(report.rdsApplyCandidate.removalSummary.removedCategories.some((item) => item.code === "supabase_service_role"))
  assert.ok(report.rdsApplyCandidate.removalSummary.removedCategories.some((item) => item.code === "supabase_storage_schema"))
  assert.equal(report.rdsApplyCandidate.removalSummary.rewrittenStatementCount, 9)
  assert.ok(report.rdsApplyCandidate.removalSummary.rewrittenCategories.some((item) =>
    item.code === "supabase_auth_schema" && item.statementCount === 9))
  assert.equal(report.rdsApplyCandidate.removalSummary.rewrittenCategories.some((item) =>
    item.code === "supabase_auth_uid"), false)
  assert.match(report.rdsApplyCandidate.removalSummary.policy, /Removed statements are not applied to Aliyun RDS/)
  assert.match(report.rdsApplyCandidate.removalSummary.policy, /deferred auth\.uid\(\) RPC functions and out-of-scope XHS draft statements are excluded/)
  assert.equal(report.rdsApplyCandidateReviewPlan.status, "ready_after_target_rds_engine_confirmation")
  assert.equal(report.rdsApplyCandidateReviewPlan.readyToApplySchema, true)
  assert.equal(report.rdsApplyCandidateReviewPlan.itemCount, 0)
  assert.equal(report.rdsApplyCandidateReviewPlan.findingCount, 0)
  assert.deepEqual(report.rdsApplyCandidateReviewPlan.categories, [])
  assert.equal(report.rdsApplyCandidateReviewPlan.requiredWriteBackFields.includes("migration.schemaCompatibilityReviewed"), false)
  assert.equal(report.rdsApplyCandidateReviewPlan.requiredWriteBackFields.includes("migration.appApiSmokeOnRdsPassed"), false)
  assert.equal(report.rdsApplyCandidateReviewPlan.requiredWriteBackFields.includes("migration.rdsExtensionSupportConfirmed"), false)
  assert.equal(report.rdsApplyCandidateReviewPlan.resolvedItemCount, 1)
  assert.equal(report.rdsApplyCandidateReviewPlan.resolvedFindingCount, 23)
  assert.deepEqual(report.rdsApplyCandidateReviewPlan.resolvedCategories, ["extension_review"])
  const applyReviewByCode = new Map(report.rdsApplyCandidateReviewPlan.items.map((item) => [item.code, item]))
  assert.equal(applyReviewByCode.has("backend_request_context"), false)
  assert.equal(applyReviewByCode.has("extension_review"), false)
  assert.equal(applyReviewByCode.has("supabase_auth_schema"), false)
  assert.equal(applyReviewByCode.has("supabase_auth_uid"), false)
  const resolvedApplyReviewByCode = new Map(report.rdsApplyCandidateReviewPlan.resolvedItems.map((item) => [item.code, item]))
  assert.equal(resolvedApplyReviewByCode.get("extension_review").findingCount, 23)
  assert.equal(
    resolvedApplyReviewByCode.get("extension_review").acceptanceEvidence,
    "aliyun_official_rds_postgresql_extensions_standard_edition_pg16_pgcrypto_1_3_2026-06-27",
  )
  assert.equal(report.rdsApplyCandidateReviewPlan.targetRdsReviewResolution.sourceTitle, "Alibaba Cloud RDS PostgreSQL supported extensions")
  assert.ok(report.rdsApplyCandidateReviewPlan.targetRdsReviewResolution.supportedExtensions.some((item) =>
    item.name === "pgcrypto" &&
    item.requiredFor.includes("gen_random_uuid()")))
  assert.ok(report.rdsApplyCandidateReviewPlan.items.every((item) => !("lineText" in item)))
  assert.equal(report.files.schemaSql, path.join(outDir, "rds-schema.sql"))
  assert.equal(report.files.rdsApplyCandidateSql, path.join(outDir, "rds-apply-candidate.sql"))
  assert.equal(report.summary.schemaSqlSha256, manifest.summary.schemaSqlSha256)
  assert.equal(report.summary.rdsApplyCandidateSqlSha256, manifest.summary.rdsApplyCandidateSqlSha256)
  assert.ok(report.sourceFiles.some((item) => item.path === "supabase/migrations/20260513085315_add_service_record_sessions.sql"))
  assert.ok(report.sourceFiles.some((item) => item.path === "supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql"))
  assert.ok(report.sourceFiles.some((item) => item.path === "deploy/aliyun-production-cn.app-auth-revocations-schema.sql"))
  assert.ok(report.sourceFiles.some((item) => item.path === "deploy/aliyun-production-cn.app-compliance-requests-schema.sql"))
  assert.ok(report.sourceFiles.some((item) => item.path === "deploy/aliyun-production-cn.app-learning-progress-schema.sql"))
  const sourcePaths = report.sourceFiles.map((item) => item.path)
  assert.ok(
    sourcePaths.indexOf("deploy/aliyun-production-cn.app-learning-progress-schema.sql") >
    sourcePaths.indexOf("supabase/migrations/20260513085315_add_service_record_sessions.sql"),
  )
  assert.ok(manifest.sourceFiles.some((item) => item.path === "deploy/aliyun-production-cn.app-auth-revocations-schema.sql"))
  assert.ok(manifest.sourceFiles.some((item) => item.path === "deploy/aliyun-production-cn.app-compliance-requests-schema.sql"))
  assert.ok(manifest.sourceFiles.some((item) => item.path === "deploy/aliyun-production-cn.app-learning-progress-schema.sql"))
  assert.ok(manifest.requiredTables.some((item) =>
    item.name === "app_learning_progress_events" &&
    item.capabilities.includes("professional_learning_progress")))
  assert.match(schemaSql, /create table if not exists public\.service_record_sessions/)
  assert.match(schemaSql, /create table if not exists public\.voice_coach_sessions/)
  assert.match(schemaSql, /create table if not exists public\.entitlements/)
  assert.match(schemaSql, /create table if not exists public\.app_auth_token_revocations/)
  assert.match(schemaSql, /create table if not exists public\.app_compliance_requests/)
  assert.match(schemaSql, /create table if not exists public\.app_learning_progress_events/)
  assert.doesNotMatch(schemaSql, /app_account_compliance_requests/)
  assert.doesNotMatch(schemaSql, /app_cn\.app_compliance_requests/)
  assert.match(schemaSql, /Source: supabase\/migrations\/20260513085315_add_service_record_sessions\.sql/)
  assert.match(schemaSql, /Source: deploy\/aliyun-production-cn\.app-auth-revocations-schema\.sql/)
  assert.match(schemaSql, /Source: deploy\/aliyun-production-cn\.app-compliance-requests-schema\.sql/)
  assert.match(schemaSql, /Source: deploy\/aliyun-production-cn\.app-learning-progress-schema\.sql/)
  assert.match(rdsApplyCandidateSql, /create table if not exists public\.service_record_sessions/)
  assert.match(rdsApplyCandidateSql, /create table if not exists public\.voice_coach_sessions/)
  assert.match(rdsApplyCandidateSql, /create table if not exists public\.app_auth_token_revocations/)
  assert.match(rdsApplyCandidateSql, /create table if not exists public\.app_compliance_requests/)
  assert.match(rdsApplyCandidateSql, /create table if not exists public\.app_learning_progress_events/)
  const normalizedApplyCandidateSql = rdsApplyCandidateSql.toLowerCase()
  const learningProgressCreateIndex = normalizedApplyCandidateSql.indexOf(
    "create table if not exists public.app_learning_progress_events",
  )
  for (const dependency of ["profiles", "mp_companies", "mp_stores", "mp_account_memberships"]) {
    const dependencyCreateIndex = normalizedApplyCandidateSql.indexOf(
      `create table if not exists public.${dependency}`,
    )
    assert.ok(dependencyCreateIndex >= 0, `missing dependency create: ${dependency}`)
    assert.ok(dependencyCreateIndex < learningProgressCreateIndex, `dependency must precede learning table: ${dependency}`)
  }
  assert.doesNotMatch(rdsApplyCandidateSql, /app_account_compliance_requests/)
  assert.doesNotMatch(rdsApplyCandidateSql, /app_cn\.app_compliance_requests/)
  assert.doesNotMatch(rdsApplyCandidateSql, /auth\.users/i)
  assert.doesNotMatch(rdsApplyCandidateSql, /auth\.uid\s*\(/i)
  assert.doesNotMatch(rdsApplyCandidateSql, /app\.current_user_id/)
  assert.doesNotMatch(rdsApplyCandidateSql, /create or replace function public\.update_profile_public/i)
  assert.doesNotMatch(rdsApplyCandidateSql, /create or replace function public\.grant_trial_credits/i)
  assert.doesNotMatch(rdsApplyCandidateSql, /create or replace function public\.consume_credits/i)
  assert.doesNotMatch(rdsApplyCandidateSql, /public\.xhs_drafts/i)
  assert.match(rdsApplyCandidateSql, /gen_random_uuid\(\)/)
  assert.doesNotMatch(rdsApplyCandidateSql, /\b(create|drop)\s+policy\b/i)
  assert.doesNotMatch(rdsApplyCandidateSql, /\benable\s+row\s+level\s+security\b/i)
  assert.doesNotMatch(rdsApplyCandidateSql, /\bservice_role\b/i)
  assert.doesNotMatch(rdsApplyCandidateSql, /\bstorage\./i)
  assert.match(validationSql, /to_regclass\('public\.service_record_sessions'\)/)
  assert.match(validationSql, /to_regclass\('public\.entitlements'\)/)
  assert.match(validationSql, /to_regclass\('public\.voice_coach_turns'\)/)
  assert.match(validationSql, /to_regclass\('public\.app_auth_token_revocations'\)/)
  assert.match(validationSql, /to_regclass\('public\.app_compliance_requests'\)/)
  assert.match(validationSql, /to_regclass\('public\.app_learning_progress_events'\)/)
  assert.match(validationSql, /from public\.service_record_sessions/)
  assert.match(validationSql, /^BEGIN READ ONLY;$/m)
  assert.match(validationSql, /^ROLLBACK;$/m)
  assert.match(validationSql, /to_regclass\('public\.voice_coach_scene_cards'\)/)
  assert.match(validationSql, /information_schema\.columns/)
  assert.match(validationSql, /data_type/)
  assert.match(validationSql, /udt_name/)
  assert.match(validationSql, /is_nullable/)
  assert.match(validationSql, /column_default/)
  assert.match(validationSql, /voice_coach_sessions.*company_id/s)
  assert.match(validationSql, /voice_coach_sessions.*scenario_snapshot_json/s)
  assert.match(validationSql, /voice_coach_turns.*features_json/s)
  assert.match(validationSql, /pg_constraint/)
  assert.match(validationSql, /pg_get_expr/)
  assert.match(validationSql, /convalidated/)
  assert.match(validationSql, /confdeltype/)
  assert.match(validationSql, /voice_coach_sessions_company_id_fkey/)
  assert.match(validationSql, /pg_index/)
  assert.match(validationSql, /pg_am/)
  assert.match(validationSql, /method_matches/)
  assert.match(validationSql, /indkey/)
  assert.match(validationSql, /indoption/)
  assert.match(validationSql, /indpred is null/)
  assert.match(validationSql, /indexprs is null/)
  assert.match(validationSql, /indnatts/)
  assert.match(validationSql, /indnkeyatts/)
  assert.match(validationSql, /indisvalid/)
  assert.match(validationSql, /indisready/)
  assert.equal((validationSql.match(/attribute\.attname::text/g) || []).length, 30)
  assert.doesNotMatch(validationSql, /attribute\.attname(?!::text)/)
  assert.match(validationSql, /voice_coach_turns_session_turn_index_key/)
  assert.doesNotMatch(validationSql, /select current_database\(\)|current_user|now\(\) as checked_at/i)
  assert.doesNotMatch(validationSql, /\bANALYZE\b/i)
  assert.doesNotMatch(validationSql, /select\s+\*/i)
  assert.doesNotMatch(validationSql, /p\.proname = 'consume_credits'/)
  assert.doesNotMatch(validationSql, /p\.proname = 'grant_trial_credits'/)
  assert.match(rollback, /Supabase as migration source/)
  assert.match(markdown, /schemaSqlSha256/)
  assert.match(markdown, /RDS Compatibility Review/)
  assert.match(markdown, /RDS Schema Apply Candidate Audit/)
  assert.match(markdown, /schemaApplyCandidateStatus: blocked_supabase_specific_sql_present/)
  assert.match(markdown, /RDS Apply Candidate/)
  assert.match(markdown, /RDS Apply Candidate Review Plan/)
  assert.doesNotMatch(markdown, /apply-review:backend_request_context/)
  assert.doesNotMatch(markdown, /apply-review:extension_review/)
  assert.match(markdown, /apply-resolved:extension_review/)
  assert.doesNotMatch(markdown, /apply-review:supabase_auth_schema/)
  assert.doesNotMatch(markdown, /apply-review:supabase_auth_uid/)
  assert.match(markdown, /rdsApplyCandidateRemovedStatements: 113/)
  assert.match(markdown, /rdsApplyCandidateFindingCount: 0/)
  assert.match(markdown, /ready_after_target_rds_engine_confirmation/)
  assert.match(markdown, /readyToApplySchema: true/)
  assert.match(markdown, /reviewPlanResolvedItemCount: 1/)
  assert.match(markdown, /reviewPlanResolvedFindingCount: 23/)
  assert.match(markdown, /targetRdsExtensionSupportConfirmed: true/)
  assert.match(markdown, /RDS Compatibility Review Checklist/)
  assert.match(markdown, /RDS Compatibility Disposition Plan/)
  assert.match(markdown, /supabase_auth_schema/)
  assert.match(markdown, /supabase_auth_uid/)
  assert.match(markdown, /supabase_storage_schema/)
  assert.match(markdown, /cloudConfirmations\.items\.oss/)
  assert.match(markdown, /migration\.rdsExtensionSupportConfirmed/)
  assert.match(markdown, /must_resolve_before_schema_apply/)
  assert.match(markdown, /defaultProposedDisposition: rewrite_to_backend_enforced_identity_and_tenant_scope/)
  assert.match(markdown, /defaultProposedDisposition: exclude_from_rds_apply_and_replace_with_oss_boundary/)
  assert.match(markdown, /schemaCompatibilityReviewed, supabaseSpecificSqlResolved, and rdsExtensionSupportConfirmed/)
  assert.doesNotMatch(output + schemaSql + rdsApplyCandidateSql + validationSql + rollback + markdown, secretLike)
})

test("tracked Aliyun RDS migration package handoff pins non-secret package digests", () => {
  const doc = read("docs", "app-production-cn-rds-migration-package.md")
  const outDir = path.join(os.tmpdir(), `aliyun-rds-tracked-package-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const report = JSON.parse(execFileSync(process.execPath, [
    "scripts/generate-aliyun-rds-migration-package.mjs",
    "--out-dir",
    outDir,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  }))

  assert.match(doc, /APP production-cn RDS Migration Package Handoff/)
  assert.match(doc, /requiredAuthorizationPacket: P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(doc, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(doc, /sourceFileCount: 12/)
  assert.match(doc, new RegExp(`requiredTableCount: ${report.summary.requiredTableCount}`))
  assert.match(doc, new RegExp(`requiredColumnCount: ${report.summary.requiredColumnCount}`))
  assert.match(doc, new RegExp(`requiredConstraintCount: ${report.summary.requiredConstraintCount}`))
  assert.match(doc, new RegExp(`requiredIndexCount: ${report.summary.requiredIndexCount}`))
  assert.match(doc, /requiredFunctionCount: 0/)
  assert.match(doc, /requiredStorageCount: 1/)
  assert.match(doc, new RegExp(`schemaSqlSha256: ${report.summary.schemaSqlSha256}`))
  assert.match(doc, new RegExp(`rdsApplyCandidateSqlSha256: ${report.summary.rdsApplyCandidateSqlSha256}`))
  assert.match(doc, new RegExp(`validationSqlSha256: ${report.summary.validationSqlSha256}`))
  assert.match(doc, new RegExp(`rollbackChecklistSha256: ${report.summary.rollbackChecklistSha256}`))
  assert.match(doc, /RDS Compatibility Review/)
  assert.match(doc, /rdsCompatibilityReviewRequired: true/)
  assert.match(doc, /rdsCompatibilityAffectedSourceCount: 10/)
  assert.match(doc, /RDS Compatibility Review Checklist/)
  assert.match(doc, /schemaApplyCandidateReady: false/)
  assert.match(doc, /schemaApplyCandidateStatus: blocked_supabase_specific_sql_present/)
  assert.match(doc, /schemaApplyCandidateFindingCount: 182/)
  assert.match(doc, /RDS Schema Apply Candidate Audit/)
  assert.match(doc, /Do not apply rds-schema\.sql to Aliyun RDS while Supabase-specific auth\/storage\/RLS\/policy\/service_role SQL remains/)
  assert.match(doc, /RDS Apply Candidate/)
  assert.match(doc, /rds-apply-candidate\.sql/)
  assert.match(doc, /removedStatementCount: 113/)
  assert.match(doc, /rewrittenStatementCount: 9/)
  assert.match(doc, /findingCount: 0/)
  assert.match(doc, /categories: none/)
  assert.match(doc, /RDS Apply Candidate Review Plan/)
  assert.match(doc, /reviewPlanItemCount: 0/)
  assert.match(doc, /reviewPlanFindingCount: 0/)
  assert.match(doc, /reviewPlanResolvedItemCount: 1/)
  assert.match(doc, /reviewPlanResolvedFindingCount: 23/)
  assert.doesNotMatch(doc, /apply-review:backend_request_context/)
  assert.doesNotMatch(doc, /apply-review:extension_review/)
  assert.match(doc, /apply-resolved:extension_review/)
  assert.match(doc, /ready_after_target_rds_engine_confirmation/)
  assert.match(doc, /targetRdsExtensionSupportConfirmed: true/)
  assert.match(doc, /supabase_auth_schema/)
  assert.match(doc, /supabase_auth_uid/)
  assert.match(doc, /supabase_storage_schema/)
  assert.match(doc, /row_level_security/)
  assert.match(doc, /RDS Compatibility Review Checklist/)
  assert.match(doc, /RDS Compatibility Disposition Plan/)
  assert.match(doc, /must_resolve_before_schema_apply/)
  assert.match(doc, /defaultProposedDisposition: rewrite_to_backend_enforced_identity_and_tenant_scope/)
  assert.match(doc, /defaultProposedDisposition: exclude_from_rds_apply_and_replace_with_oss_boundary/)
  assert.match(doc, /cloudConfirmations\.items\.oss/)
  assert.match(doc, /migration\.rdsExtensionSupportConfirmed/)
  assert.match(doc, /Every policy statement has a recorded disposition before schema apply/)
  assert.match(doc, /Do not apply unreviewed Supabase-specific SQL to Aliyun RDS/)
  assert.match(doc, /migration\.schemaCompatibilityReviewed=true/)
  assert.match(doc, /migration\.supabaseSpecificSqlResolved=true/)
  assert.match(doc, /migration\.rdsExtensionSupportConfirmed=true/)
  assert.match(doc, /APP API smoke/)
  assert.match(doc, /MEIYE_ALLOW_ALIYUN_RDS_RUNTIME_SMOKE=1 corepack pnpm aliyun:rds:runtime-smoke:strict/)
  assert.match(doc, /service_record_sessions/)
  assert.match(doc, /app_auth_token_revocations/)
  assert.match(doc, /app_compliance_requests/)
  assert.match(doc, /app_learning_progress_events/)
  assert.match(doc, /credit_transactions/)
  assert.match(doc, /deferred_auth_uid_function:consume_credits/)
  assert.match(doc, /deferred_auth_uid_function:grant_trial_credits/)
  assert.match(doc, /sourceBucket: delivery-packs/)
  assert.match(doc, /deploy\/aliyun-production-cn\.rds-migration\.local\.json/)
  assert.doesNotMatch(doc, secretLike)
})
