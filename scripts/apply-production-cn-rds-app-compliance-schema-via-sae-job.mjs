#!/usr/bin/env node

import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"

const REGION = "cn-hangzhou"
const SOURCE_APP_ID = "41b347a0-ae54-4215-9ee6-8dc82c427dd2"
const ALLOW_ENV = "MEIYE_ALLOW_PRODUCTION_CN_RDS_APP_COMPLIANCE_SCHEMA"
const BACKEND_ROOT = resolve(import.meta.dirname, "..")
const SCHEMA_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.app-compliance-requests-schema.sql")

const suffix = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) +
  "-" + Math.random().toString(36).slice(2, 7)
const jobName = `meiye-compliance-schema-${suffix.slice(-10)}`
const eventId = `app-compliance-schema-${suffix}`

const args = parseArgs(process.argv)
let createdJobAppId = ""
let executedJobId = ""

function parseArgs(argv) {
  const parsed = {
    execute: false,
    skipCleanup: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--execute") {
      parsed.execute = true
      continue
    }
    if (arg === "--skip-cleanup") {
      parsed.skipCleanup = true
      continue
    }
    if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    }
    throw new Error(`unknown_arg:${arg}`)
  }
  return parsed
}

function printHelp() {
  console.log([
    "Usage:",
    `  ${ALLOW_ENV}=1 node scripts/apply-production-cn-rds-app-compliance-schema-via-sae-job.mjs --execute`,
    "",
    "Scope:",
    "  - creates one temporary SAE job template from the current production-cn image",
    "  - injects DATABASE_URL_CN only into one job execution from current SAE app config",
    "  - applies schema-only SQL for public.app_compliance_requests",
    "  - deletes the job history and job template after execution",
    "  - never prints database URLs, tokens, passwords, AccessKeySecret, or env values",
  ].join("\n"))
}

function main() {
  const schemaSql = readSchema()
  const schemaBase64 = Buffer.from(schemaSql, "utf8").toString("base64")
  const plan = {
    ok: true,
    dryRun: !args.execute,
    runId: suffix,
    sourceAppId: SOURCE_APP_ID,
    jobName,
    schema: {
      file: SCHEMA_FILE,
      sha256: sha256(schemaSql),
      bytes: Buffer.byteLength(schemaSql),
      schemaOnly: true,
    },
    cloudAction: {
      provider: "SAE Job",
      region: REGION,
      createTemporaryJobTemplate: true,
      executeOneJob: true,
      deleteJobHistory: true,
      deleteJobTemplate: true,
    },
    writes: [
      "create table if not exists public.app_compliance_requests",
      "create index if not exists app_compliance_requests_user_requested_idx",
      "create index if not exists app_compliance_requests_scope_kind_status_requested_idx",
    ],
    forbidden: [
      "business row reads",
      "token/env value output",
      "customer data output",
      "destructive SQL",
      "deployment",
      "git push",
    ],
  }

  if (!args.execute) {
    console.log(JSON.stringify(plan, null, 2))
    return
  }
  if (process.env[ALLOW_ENV] !== "1") throw new Error(`missing_execution_guard:${ALLOW_ENV}=1`)

  try {
    const sourceConfig = readSourceApplicationConfig()
    console.log(`[sae-app-compliance-schema] run=${suffix}`)
    console.log(`[sae-app-compliance-schema] schemaSha256=${plan.schema.sha256}`)
    createdJobAppId = createJobTemplate(sourceConfig)
    executedJobId = execSchemaJob(sourceConfig.databaseUrl, schemaBase64)
    const jobStatus = waitForJobSuccess(createdJobAppId, executedJobId)
    console.log(JSON.stringify({
      ok: true,
      runId: suffix,
      jobAppId: createdJobAppId,
      jobId: executedJobId || null,
      status: jobStatus,
      cleanupSkipped: args.skipCleanup,
      secretValuesPrinted: false,
    }, null, 2))
  } finally {
    if (args.skipCleanup) {
      console.log("[sae-app-compliance-schema] cleanup skipped by flag")
    } else {
      cleanup()
    }
  }
}

function readSchema() {
  if (!existsSync(SCHEMA_FILE)) throw new Error(`schema_file_missing:${SCHEMA_FILE}`)
  const sql = readFileSync(SCHEMA_FILE, "utf8")
  const compact = sql.replace(/\s+/g, " ").trim().toLowerCase()
  const forbidden = [
    /\binsert\s+into\b/,
    /\bupdate\s+public\./,
    /\bdelete\s+from\b/,
    /\btruncate\s+/,
    /\bdrop\s+/,
    /postgres(?:ql)?:\/\//,
    /authorization|bearer|raw_token|plain_token/,
    /app_account_compliance_requests/,
    /app_cn\.app_compliance_requests/,
    /references public\.app_users/,
  ]
  for (const pattern of forbidden) {
    if (pattern.test(compact)) throw new Error(`schema_contains_forbidden_statement:${pattern}`)
  }
  if (!/create table if not exists public\.app_compliance_requests/.test(compact)) {
    throw new Error("schema_missing_app_compliance_requests_table")
  }
  if (!/confirm_text text/.test(compact)) throw new Error("schema_missing_confirm_text")
  return sql
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function readSourceApplicationConfig() {
  const result = runJson("aliyun", [
    "sae", "DescribeApplicationConfig",
    "--region", REGION,
    "--AppId", SOURCE_APP_ID,
  ])
  const config = result.Data || result
  const envs = parseJsonArray(config.Envs, "source_app_envs")
  const databaseUrl = envValue(envs, "DATABASE_URL_CN")
  if (!databaseUrl) throw new Error("source_app_database_url_cn_missing")
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) throw new Error("source_app_database_url_cn_invalid")

  const imageUrl = requiredText(config.ImageUrl, "source_app_image_url")
  return {
    databaseUrl,
    imageUrl,
    imagePullSecrets: optionalText(config.ImagePullSecrets),
    acrInstanceId: optionalText(config.AcrInstanceId) || "custom-repository",
    namespaceId: optionalText(config.NamespaceId) || REGION,
    vpcId: requiredText(config.VpcId, "source_app_vpc_id"),
    vSwitchId: requiredText(config.VSwitchId, "source_app_vswitch_id"),
    securityGroupId: requiredText(config.SecurityGroupId, "source_app_security_group_id"),
    cpu: String(config.Cpu || 500),
    memory: String(config.Memory || 1024),
  }
}

function parseJsonArray(value, label) {
  if (Array.isArray(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed
  }
  throw new Error(`${label}_must_be_array`)
}

function envValue(envs, name) {
  const found = envs.find((item) => (item?.name || item?.Name) === name)
  return String(found?.value || found?.Value || "").trim()
}

function requiredText(value, label) {
  const text = optionalText(value)
  if (!text) throw new Error(`${label}_missing`)
  return text
}

function optionalText(value) {
  return String(value || "").trim()
}

function createJobTemplate(config) {
  console.log("[sae-app-compliance-schema] creating temporary SAE job template")
  const commandArgs = JSON.stringify(["-e", "console.log('schema_job_template_ready')"])
  const cliArgs = [
    "sae", "CreateJob",
    "--region", REGION,
    "--AppName", jobName,
    "--PackageType", "Image",
    "--Replicas", "1",
    "--Workload", "job",
    "--ImageUrl", config.imageUrl,
    "--AcrInstanceId", config.acrInstanceId,
    "--NamespaceId", config.namespaceId,
    "--VpcId", config.vpcId,
    "--VSwitchId", config.vSwitchId,
    "--SecurityGroupId", config.securityGroupId,
    "--Cpu", config.cpu,
    "--Memory", config.memory,
    "--BackoffLimit", "0",
    "--Timeout", "600",
    "--TriggerConfig", JSON.stringify({
      type: "http",
      config: {
        type: "HTTPS",
        method: ["GET"],
        ip: [],
        referer: [],
        securityConfig: "none",
      },
    }),
    "--ConcurrencyPolicy", "Forbid",
    "--Command", "node",
    "--CommandArgs", commandArgs,
  ]
  if (config.imagePullSecrets) cliArgs.push("--ImagePullSecrets", config.imagePullSecrets)

  const result = runJson("aliyun", cliArgs)
  const appId = findStringByKey(result, "AppId") || findStringByKey(result, "appId")
  if (!appId) throw new Error(`create_job_missing_app_id:${shapeOf(result)}`)
  console.log(`[sae-app-compliance-schema] jobAppId=${appId}`)
  return appId
}

function execSchemaJob(databaseUrl, schemaBase64) {
  console.log("[sae-app-compliance-schema] executing schema job")
  const commandArgs = JSON.stringify(["-e", buildRunnerScript()])
  const envs = JSON.stringify([
    { name: "DATABASE_URL_CN", value: databaseUrl },
    { name: "MEIYE_APP_COMPLIANCE_SCHEMA_B64", value: schemaBase64 },
  ])
  const cliArgs = [
    "sae", "ExecJob",
    "--region", REGION,
    "--AppId", createdJobAppId,
    "--EventId", eventId,
    "--Replicas", "1",
    "--Command", "node",
    "--CommandArgs", commandArgs,
    "--Envs", envs,
  ]
  let result
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      result = runJson("aliyun", cliArgs)
      break
    } catch (error) {
      if (!/Change?r?OrderRunning|ChangerOrderRunning/i.test(String(error?.message || error))) throw error
      if (attempt % 3 === 0) {
        console.log(`[sae-app-compliance-schema] template change order still running elapsed=${attempt * 10}s`)
      }
      sleep(10_000)
    }
  }
  if (!result) throw new Error("exec_job_wait_for_template_change_order_timeout")
  const jobId = findStringByKey(result, "JobId") || findStringByKey(result, "jobId")
  if (jobId) console.log(`[sae-app-compliance-schema] jobId=${jobId}`)
  return jobId
}

function buildRunnerScript() {
  return `
const { Client } = require("pg");

function redact(text) {
  const databaseUrl = process.env.DATABASE_URL_CN || "";
  return String(text || "")
    .replace(databaseUrl, "[DATABASE_URL_CN_REDACTED]")
    .replace(/postgres(?:ql)?:\\/\\/[^\\s"']+/gi, "[DATABASE_URL_REDACTED]")
    .replace(/(password|token|secret|access[_-]?key)\\s*[:=]\\s*[^,\\s"']{6,}/gi, "$1=[REDACTED]");
}

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL_CN || "").trim();
  const schemaBase64 = String(process.env.MEIYE_APP_COMPLIANCE_SCHEMA_B64 || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL_CN_required");
  if (!schemaBase64) throw new Error("schema_base64_required");
  const schemaSql = Buffer.from(schemaBase64, "base64").toString("utf8");
  if (!/create table if not exists public\\.app_compliance_requests/i.test(schemaSql)) {
    throw new Error("schema_sql_missing_app_compliance_requests_table");
  }
  if (/app_account_compliance_requests|app_cn\\.app_compliance_requests|references public\\.app_users/i.test(schemaSql)) {
    throw new Error("schema_sql_contains_wrong_compliance_table_or_identity_reference");
  }
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "meiye-app-compliance-schema-job",
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    await client.query(schemaSql);
    const result = await client.query(
      "select to_regclass('public.app_compliance_requests')::text as table_name, " +
      "(select count(*)::int from pg_indexes where schemaname='public' and tablename='app_compliance_requests') as index_count, " +
      "exists (select 1 from information_schema.columns where table_schema='public' and table_name='app_compliance_requests' and column_name='confirm_text') as has_confirm_text"
    );
    const row = result.rows[0] || {};
    if (row.table_name !== "app_compliance_requests" && row.table_name !== "public.app_compliance_requests") {
      throw new Error("app_compliance_requests_table_not_found_after_schema_apply");
    }
    if (Number(row.index_count || 0) < 2) throw new Error("app_compliance_requests_index_count_too_low");
    if (row.has_confirm_text !== true) throw new Error("app_compliance_requests_confirm_text_missing");
    console.log("SCHEMA_APPLY_RESULT=" + JSON.stringify({
      ok: true,
      table: "public.app_compliance_requests",
      indexCount: Number(row.index_count || 0),
      hasConfirmText: true,
    }));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("SCHEMA_APPLY_FAILED=" + redact(error && error.message ? error.message : error));
  process.exit(1);
});
`.trim()
}

function waitForJobSuccess(appId, jobId) {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    const status = describeJobStatus(appId, jobId)
    const normalized = normalizeJobStatus(status)
    if (normalized.done && normalized.success) return normalized
    if (normalized.done && !normalized.success) {
      throw new Error(`schema_job_failed:${JSON.stringify(normalized)}`)
    }
    if (attempt % 6 === 0) {
      console.log(`[sae-app-compliance-schema] job status=${normalized.label} elapsed=${attempt * 10}s`)
    }
    sleep(10_000)
  }
  throw new Error("schema_job_timeout")
}

function describeJobStatus(appId, jobId) {
  const cliArgs = ["sae", "DescribeJobStatus", "--region", REGION, "--AppId", appId]
  if (jobId) cliArgs.push("--JobId", jobId)
  return runJson("aliyun", cliArgs)
}

function normalizeJobStatus(payload) {
  const state = findFirstPrimitiveByKeys(payload, ["State", "state", "Status", "status", "JobStatus", "jobStatus"])
  const text = String(state ?? "").toLowerCase()
  if (["1", "success", "succeeded", "completed", "finish", "finished"].includes(text)) {
    return { done: true, success: true, label: String(state) }
  }
  if (["2", "failed", "failure", "error"].includes(text)) {
    return { done: true, success: false, label: String(state) }
  }
  if (["3", "running", "executing", "active", "pending"].includes(text)) {
    return { done: false, success: false, label: String(state) }
  }
  const lower = JSON.stringify(payload).toLowerCase()
  if (lower.includes('"state":1') || lower.includes('"state":"1"')) {
    return { done: true, success: true, label: "1" }
  }
  if (lower.includes('"state":2') || lower.includes('"state":"2"')) {
    return { done: true, success: false, label: "2" }
  }
  if (lower.includes('"state":3') || lower.includes('"state":"3"')) {
    return { done: false, success: false, label: "3" }
  }
  return { done: false, success: false, label: `unknown:${shapeOf(payload)}` }
}

function findStringByKey(value, key) {
  const found = findFirstPrimitiveByKeys(value, [key])
  return typeof found === "string" && found.trim() ? found.trim() : ""
}

function findFirstPrimitiveByKeys(value, keys) {
  if (!value || typeof value !== "object") return undefined
  const stack = [value]
  while (stack.length) {
    const current = stack.pop()
    if (!current || typeof current !== "object") continue
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        const item = current[key]
        if (["string", "number", "boolean"].includes(typeof item)) return item
      }
    }
    for (const item of Object.values(current)) {
      if (item && typeof item === "object") stack.push(item)
    }
  }
  return undefined
}

function cleanup() {
  console.log("[sae-app-compliance-schema] cleanup started")
  if (createdJobAppId && executedJobId) {
    safeRun("aliyun", [
      "sae", "DeleteHistoryJob",
      "--region", REGION,
      "--AppId", createdJobAppId,
      "--JobId", executedJobId,
    ])
  }
  if (createdJobAppId) {
    safeRun("aliyun", [
      "sae", "DeleteJob",
      "--region", REGION,
      "--AppId", createdJobAppId,
    ])
  }
  console.log("[sae-app-compliance-schema] cleanup finished")
}

function runJson(command, cliArgs) {
  const output = run(command, cliArgs)
  try {
    return JSON.parse(output || "{}")
  } catch {
    throw new Error(`invalid_json:${command} ${cliArgs.slice(0, 4).join(" ")}:${redactOutput(output)}`)
  }
}

function run(command, cliArgs) {
  const result = spawnSync(command, cliArgs, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  if (result.status !== 0) {
    const output = redactOutput(result.stderr || result.stdout || `exit ${result.status}`)
    throw new Error(`${command} ${cliArgs.slice(0, 4).join(" ")} failed:${output}`)
  }
  return result.stdout
}

function safeRun(command, cliArgs) {
  const result = spawnSync(command, cliArgs, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 5,
  })
  if (result.status !== 0) {
    const output = redactOutput(result.stderr || result.stdout || `exit ${result.status}`).slice(0, 300)
    console.log(`[sae-app-compliance-schema] cleanup warning: ${command} ${cliArgs.slice(0, 4).join(" ")}: ${output}`)
    return false
  }
  return true
}

function redactOutput(value) {
  return String(value || "")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[DATABASE_URL_REDACTED]")
    .replace(/(password|passwd|pwd|token|secret|access[_-]?key)\s*[:=]\s*[^,\s"']{6,}/gi, "$1=[REDACTED]")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" | ")
}

function shapeOf(value) {
  if (!value || typeof value !== "object") return typeof value
  if (Array.isArray(value)) return `[${value.slice(0, 3).map(shapeOf).join(",")}]`
  return `{${Object.keys(value).slice(0, 12).join(",")}}`
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

main()
