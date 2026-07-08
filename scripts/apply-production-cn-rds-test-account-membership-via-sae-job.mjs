#!/usr/bin/env node

import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"

const REGION = "cn-hangzhou"
const SOURCE_APP_ID = "41b347a0-ae54-4215-9ee6-8dc82c427dd2"
const ALLOW_ENV = "MEIYE_ALLOW_PRODUCTION_CN_RDS_TEST_ACCOUNT_MEMBERSHIP"
const BACKEND_ROOT = resolve(import.meta.dirname, "..")
const DEFAULT_ACCOUNTS_FILE = resolve(BACKEND_ROOT, "deploy/app-live-smoke-test-login-users.local.json")

const suffix = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) +
  "-" + Math.random().toString(36).slice(2, 7)
const jobName = `meiye-membership-${suffix.slice(-10)}`
const eventId = `test-account-membership-${suffix}`

const args = parseArgs(process.argv)
let createdJobAppId = ""
let executedJobId = ""

function parseArgs(argv) {
  const parsed = {
    execute: false,
    skipCleanup: false,
    accountsFile: DEFAULT_ACCOUNTS_FILE,
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
    if (arg === "--accounts-file") {
      parsed.accountsFile = resolve(readRequired(argv[++index], "--accounts-file"))
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

function readRequired(value, flag) {
  if (!value) throw new Error(`missing_value:${flag}`)
  return value
}

function printHelp() {
  console.log([
    "Usage:",
    `  ${ALLOW_ENV}=1 node scripts/apply-production-cn-rds-test-account-membership-via-sae-job.mjs --execute`,
    "",
    "Scope:",
    "  - creates one temporary SAE job template from the current production-cn image",
    "  - injects DATABASE_URL_CN only into one job execution from current SAE app config",
    "  - upserts public.mp_account_memberships for employee and manager test accounts only",
    "  - deletes the job history and job template after execution",
    "  - never prints token values, database URLs, raw user ids, raw company ids, or raw store ids",
  ].join("\n"))
}

function main() {
  const accounts = buildAccounts(args.accountsFile)
  const payload = {
    schemaVersion: 1,
    runId: suffix,
    purpose: "production-cn employee/manager test-account membership repair",
    accounts,
  }
  const payloadJson = JSON.stringify(payload)
  const payloadBase64 = Buffer.from(payloadJson, "utf8").toString("base64")
  const plan = {
    ok: true,
    dryRun: !args.execute,
    runId: suffix,
    sourceAppId: SOURCE_APP_ID,
    jobName,
    accountsFile: args.accountsFile,
    payload: {
      accountCount: accounts.length,
      accountKeys: accounts.map((account) => account.key),
      roles: accounts.map((account) => account.role),
      scopeHash12: hash12(`${accounts[0].company_id}:${accounts[0].store_id}`),
      userHash12ByKey: Object.fromEntries(accounts.map((account) => [account.key, hash12(account.user_id)])),
      containsSecretTokens: false,
      rawIdsPrinted: false,
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
      "upsert public.mp_account_memberships for employee and manager test accounts only",
    ],
    forbidden: [
      "token/env value output",
      "raw user/company/store id output",
      "profile writes",
      "knowledge-space writes",
      "business row reads beyond active scope and membership verification",
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
    console.log(`[sae-test-account-membership] run=${suffix}`)
    console.log(`[sae-test-account-membership] payloadSha256=${sha256(payloadJson)}`)
    createdJobAppId = createJobTemplate(sourceConfig)
    executedJobId = execMembershipJob(sourceConfig.databaseUrl, payloadBase64)
    const jobStatus = waitForJobSuccess(createdJobAppId, executedJobId)
    console.log(JSON.stringify({
      ok: true,
      runId: suffix,
      jobAppId: createdJobAppId,
      jobId: executedJobId || null,
      status: jobStatus,
      cleanupSkipped: args.skipCleanup,
      secretValuesPrinted: false,
      rawIdsPrinted: false,
    }, null, 2))
  } finally {
    if (args.skipCleanup) {
      console.log("[sae-test-account-membership] cleanup skipped by flag")
    } else {
      cleanup()
    }
  }
}

function buildAccounts(filePath) {
  if (!existsSync(filePath)) throw new Error(`accounts_file_missing:${filePath}`)
  const doc = JSON.parse(readFileSync(filePath, "utf8"))
  const accounts = (doc.accounts || [])
    .filter((account) => account.key === "employee" || account.key === "manager")
    .map(normalizeAccount)

  if (accounts.length !== 2) throw new Error("expected_employee_and_manager_accounts")
  const keys = new Set(accounts.map((account) => account.key))
  if (!keys.has("employee") || !keys.has("manager")) throw new Error("missing_employee_or_manager_account")
  const companyIds = new Set(accounts.map((account) => account.company_id))
  const storeIds = new Set(accounts.map((account) => account.store_id))
  if (companyIds.size !== 1 || storeIds.size !== 1) throw new Error("test_accounts_must_share_one_company_store")
  return accounts
}

function normalizeAccount(row) {
  const key = cleanText(row.key, 40)
  const role = cleanText(row.account_role || row.role, 80)
  if (key === "employee" && !["employee", "staff"].includes(role)) {
    throw new Error("employee_account_role_mismatch")
  }
  if (key === "manager" && !["store_admin", "store_owner", "company_admin", "merchant_owner"].includes(role)) {
    throw new Error("manager_account_role_mismatch")
  }
  return {
    key,
    email: cleanText(row.email, 200),
    nickname: cleanText(row.nickname || row.display_name || row.email || row.key, 120),
    role,
    user_id: requireUuid(row.user_id || row.userId, `${key}.user_id`),
    company_id: requireUuid(row.company_id || row.companyId, `${key}.company_id`),
    store_id: requireUuid(row.store_id || row.storeId, `${key}.store_id`),
  }
}

function cleanText(value, max) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function requireUuid(value, label) {
  const text = String(value || "").trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error(`invalid_uuid:${label}`)
  }
  return text
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function hash12(value) {
  return sha256(value).slice(0, 12)
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
  console.log("[sae-test-account-membership] creating temporary SAE job template")
  const commandArgs = JSON.stringify(["-e", "console.log('membership_job_template_ready')"])
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
  console.log(`[sae-test-account-membership] jobAppId=${appId}`)
  return appId
}

function execMembershipJob(databaseUrl, payloadBase64) {
  console.log("[sae-test-account-membership] executing membership job")
  const runnerBase64 = Buffer.from(buildRunnerScript(), "utf8").toString("base64")
  const commandArgs = JSON.stringify([
    "-e",
    "eval(Buffer.from(process.env.MEIYE_MEMBERSHIP_RUNNER_B64, 'base64').toString('utf8'))",
  ])
  const envs = JSON.stringify([
    { name: "DATABASE_URL_CN", value: databaseUrl },
    { name: "MEIYE_TEST_ACCOUNT_MEMBERSHIP_B64", value: payloadBase64 },
    { name: "MEIYE_MEMBERSHIP_RUNNER_B64", value: runnerBase64 },
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
        console.log(`[sae-test-account-membership] template change order still running elapsed=${attempt * 10}s`)
      }
      sleep(10_000)
    }
  }
  if (!result) throw new Error("exec_job_wait_for_template_change_order_timeout")
  const jobId = findStringByKey(result, "JobId") || findStringByKey(result, "jobId")
  if (jobId) console.log(`[sae-test-account-membership] jobId=${jobId}`)
  return jobId
}

function buildRunnerScript() {
  return `
const crypto = require("crypto");
const { Client } = require("pg");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function hash12(value) {
  return sha256(value).slice(0, 12);
}

function redact(text) {
  const databaseUrl = process.env.DATABASE_URL_CN || "";
  return String(text || "")
    .replace(databaseUrl, "[DATABASE_URL_CN_REDACTED]")
    .replace(/postgres(?:ql)?:\\/\\/[^\\s"']+/gi, "[DATABASE_URL_REDACTED]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[UUID_REDACTED]")
    .replace(/(password|token|secret|access[_-]?key)\\s*[:=]\\s*[^,\\s"']{6,}/gi, "$1=[REDACTED]");
}

function requireUuid(value, label) {
  const text = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error("invalid_uuid:" + label);
  }
  return text;
}

function readPayload() {
  const payloadBase64 = String(process.env.MEIYE_TEST_ACCOUNT_MEMBERSHIP_B64 || "").trim();
  if (!payloadBase64) throw new Error("membership_payload_required");
  const payload = JSON.parse(Buffer.from(payloadBase64, "base64").toString("utf8"));
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  if (accounts.length !== 2) throw new Error("expected_two_accounts");
  const keys = new Set(accounts.map((account) => account.key));
  if (!keys.has("employee") || !keys.has("manager")) throw new Error("missing_employee_or_manager");
  for (const account of accounts) {
    requireUuid(account.user_id, account.key + ".user_id");
    requireUuid(account.company_id, account.key + ".company_id");
    requireUuid(account.store_id, account.key + ".store_id");
  }
  if (new Set(accounts.map((account) => account.company_id)).size !== 1) throw new Error("company_scope_mismatch");
  if (new Set(accounts.map((account) => account.store_id)).size !== 1) throw new Error("store_scope_mismatch");
  return { ...payload, accounts };
}

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL_CN || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL_CN_required");
  const payload = readPayload();
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "meiye-test-account-membership-job",
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    await client.query("begin");
    const companyId = payload.accounts[0].company_id;
    const storeId = payload.accounts[0].store_id;
    const scope = await client.query(
      "select company.id as company_id, store.id as store_id " +
      "from public.mp_companies company " +
      "join public.mp_stores store on store.company_id = company.id " +
      "where company.id = $1 and store.id = $2 and company.status = 'active' and store.status = 'active'",
      [companyId, storeId],
    );
    if (scope.rowCount !== 1) throw new Error("declared_scope_not_active");

    const result = await client.query(
      "with payload as (select $1::jsonb as doc), " +
      "accounts as (" +
      "  select * from jsonb_to_recordset((select doc->'accounts' from payload)) as x(" +
      "    key text, email text, nickname text, role text, user_id uuid, company_id uuid, store_id uuid" +
      "  )" +
      "), upsert as (" +
      "  insert into public.mp_account_memberships " +
      "    (user_id, company_id, store_id, role, status, display_name, accepted_at, last_seen_at) " +
      "  select user_id, company_id, store_id, role, 'active', coalesce(nullif(nickname, ''), email, key), now(), now() " +
      "  from accounts " +
      "  on conflict (user_id, company_id, store_id, role) do update " +
      "    set status = 'active', " +
      "        display_name = excluded.display_name, " +
      "        accepted_at = coalesce(public.mp_account_memberships.accepted_at, excluded.accepted_at), " +
      "        last_seen_at = excluded.last_seen_at, " +
      "        updated_at = now() " +
      "  returning user_id, company_id, store_id, role, status" +
      ") select role, status, user_id, company_id, store_id from upsert order by role",
      [JSON.stringify({ accounts: payload.accounts })],
    );
    if (result.rowCount !== 2) throw new Error("membership_upsert_count_mismatch:" + result.rowCount);
    await client.query("commit");
    const roles = result.rows.map((row) => row.role).sort();
    console.log("MEMBERSHIP_APPLY_RESULT=" + JSON.stringify({
      ok: true,
      membershipCount: result.rowCount,
      roles,
      statuses: result.rows.map((row) => row.status).sort(),
      scopeHash12: hash12(result.rows[0].company_id + ":" + result.rows[0].store_id),
      userHash12ByRole: Object.fromEntries(result.rows.map((row) => [row.role, hash12(row.user_id)])),
      secretValuesPrinted: false,
      rawIdsPrinted: false,
    }));
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("MEMBERSHIP_APPLY_FAILED=" + redact(error && error.message ? error.message : error));
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
      throw new Error(`membership_job_failed:${JSON.stringify(normalized)}`)
    }
    if (attempt % 6 === 0) {
      console.log(`[sae-test-account-membership] job status=${normalized.label} elapsed=${attempt * 10}s`)
    }
    sleep(10_000)
  }
  throw new Error("membership_job_timeout")
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
  console.log("[sae-test-account-membership] cleanup started")
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
  console.log("[sae-test-account-membership] cleanup finished")
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
    console.log(`[sae-test-account-membership] cleanup warning: ${command} ${cliArgs.slice(0, 4).join(" ")}: ${output}`)
    return false
  }
  return true
}

function redactOutput(value) {
  return String(value || "")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[DATABASE_URL_REDACTED]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[UUID_REDACTED]")
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
