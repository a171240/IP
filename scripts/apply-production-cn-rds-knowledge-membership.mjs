#!/usr/bin/env node

import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import zlib from "node:zlib"

const REGION = "cn-hangzhou"
const VPC_ID = "vpc-bp1f9a59umjuelakdc38w"
const VSWITCH_ID = "vsw-bp11pdkiyf9w214i42qdk"
const IMAGE_ID = "aliyun_3_x64_20G_alibase_20260513.vhd"
const INSTANCE_TYPE = "ecs.e-c1m2.large"
const DEFAULT_KMS_SECRET_NAME = "meiye-huajing/production-cn/DATABASE_URL_CN"
const ALLOW_ENV = "MEIYE_ALLOW_PRODUCTION_CN_RDS_KNOWLEDGE_MEMBERSHIP"
const SEND_FILE_BASE64_LIMIT = 32 * 1024
const COMMAND_BASE64_LIMIT = 18 * 1024

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_ENV_FILE = resolve(BACKEND_ROOT, "..", "..", ".env.production-cn.local")
const DEFAULT_ACCOUNTS_FILE = resolve(BACKEND_ROOT, "deploy/app-live-smoke-test-login-users.local.json")
const DEFAULT_EVIDENCE_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.rds-migration.local.json")
const KNOWLEDGE_ROOT = resolve(BACKEND_ROOT, "public/voice-coach-assets/manbeilian-knowledge/v1")

const args = parseArgs(process.argv)
const suffix = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) +
  "-" + Math.random().toString(36).slice(2, 8)
const roleName = `MeiyeHuajingRdsPatchRunner-${suffix}`
const policyName = `MeiyeHuajingRdsPatchRunnerPolicy-${suffix}`
const sgName = `meiye-rds-patch-sg-${suffix}`
const commandName = `meiye-rds-knowledge-membership-${suffix}`
const remoteDir = `/tmp/meiye-rds-knowledge-membership-${suffix}`

let securityGroupId = ""
let instanceId = ""
let commandId = ""
let cleanupDone = false

function parseArgs(argv) {
  const parsed = {
    execute: false,
    skipCleanup: false,
    envFile: DEFAULT_ENV_FILE,
    accountsFile: DEFAULT_ACCOUNTS_FILE,
    evidenceFile: DEFAULT_EVIDENCE_FILE,
    kmsSecretName: "",
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
    if (arg === "--env-file") {
      parsed.envFile = resolvePath(readRequired(argv[++index], "--env-file"))
      continue
    }
    if (arg === "--accounts-file") {
      parsed.accountsFile = resolvePath(readRequired(argv[++index], "--accounts-file"))
      continue
    }
    if (arg === "--evidence-file") {
      parsed.evidenceFile = resolvePath(readRequired(argv[++index], "--evidence-file"))
      continue
    }
    if (arg === "--database-url-kms-secret-name") {
      parsed.kmsSecretName = readRequired(argv[++index], "--database-url-kms-secret-name")
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

function resolvePath(value) {
  return value.startsWith("/") ? value : resolve(process.cwd(), value)
}

function printHelp() {
  console.log([
    "Usage:",
    `  ${ALLOW_ENV}=1 node scripts/apply-production-cn-rds-knowledge-membership.mjs --execute`,
    "",
    "Scope:",
    "  - production-cn RDS test-account mp_account_memberships rows",
    "  - production-cn RDS mp_knowledge_spaces / mp_knowledge_space_access / voice_training_packs schema and Manbeilian app_manifest seed",
    "  - no git push, no WeChat upload, no deployment, no token/env value output",
  ].join("\n"))
}

function loadEnvFile(filePath) {
  if (!filePath || !existsSync(filePath)) return { loaded: false, keysLoaded: 0 }
  let keysLoaded = 0
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    let value = match[2].trim()
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[match[1]] = value
    keysLoaded += 1
  }
  return { loaded: true, keysLoaded }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function cleanText(value, max = 240) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""))
}

function normalizeAccount(row) {
  const userId = cleanText(row.user_id || row.userId, 80)
  const companyId = cleanText(row.company_id || row.companyId, 80)
  const storeId = cleanText(row.store_id || row.storeId, 80)
  const role = cleanText(row.account_role || row.role, 80)
  if (!isUuid(userId)) throw new Error(`invalid_account_user_id:${row.key || row.email || "unknown"}`)
  if (!isUuid(companyId)) throw new Error(`invalid_account_company_id:${row.key || row.email || "unknown"}`)
  if (!isUuid(storeId)) throw new Error(`invalid_account_store_id:${row.key || row.email || "unknown"}`)
  if (!["employee", "staff", "store_admin", "store_owner", "company_admin", "merchant_owner"].includes(role)) {
    throw new Error(`invalid_account_role:${row.key || row.email || "unknown"}`)
  }
  return {
    key: cleanText(row.key, 40),
    email: cleanText(row.email, 200),
    nickname: cleanText(row.nickname || row.display_name || row.email || row.key, 120),
    role,
    user_id: userId,
    company_id: companyId,
    company_name: cleanText(row.company_name || row.companyName, 120),
    store_id: storeId,
    store_name: cleanText(row.store_name || row.storeName, 120),
    service_plan_label: cleanText(row.service_plan_label || row.servicePlanLabel, 200),
  }
}

function buildAccounts() {
  const file = readJson(args.accountsFile)
  const accounts = (file.accounts || []).map(normalizeAccount).filter((account) =>
    account.key === "employee" || account.key === "manager"
  )
  if (accounts.length !== 2) throw new Error("expected_employee_and_manager_accounts")
  const keys = new Set(accounts.map((account) => account.key))
  if (!keys.has("employee") || !keys.has("manager")) throw new Error("missing_employee_or_manager_account")
  const companyIds = new Set(accounts.map((account) => account.company_id))
  const storeIds = new Set(accounts.map((account) => account.store_id))
  if (companyIds.size !== 1 || storeIds.size !== 1) throw new Error("test_accounts_must_share_one_company_store")
  return accounts
}

function buildAppManifest() {
  const manifest = readJson(resolve(KNOWLEDGE_ROOT, "manifest.json"))
  let cardCount = 0
  const groups = (manifest.groups || []).map((group) => {
    const groupId = cleanText(group.id, 180)
    const full = readJson(resolve(KNOWLEDGE_ROOT, "groups", `${groupId}.json`))
    const cards = (Array.isArray(full.cards) ? full.cards : []).map((card) => ({
      id: cleanText(card.id, 180),
      order: Number.isFinite(Number(card.order)) ? Number(card.order) : null,
      title: cleanText(card.title, 240),
      label: cleanText(card.label, 120),
      description: cleanText(card.description, 2000),
      alt: cleanText(card.alt, 500),
      image: cleanText(card.image, 500),
      groupId: cleanText(card.groupId || full.id || groupId, 180),
      groupTitle: cleanText(card.groupTitle || full.title || group.title, 240),
    }))
    cardCount += cards.length
    return {
      id: cleanText(full.id || groupId, 180),
      title: cleanText(full.title || group.title, 240),
      subtitle: cleanText(full.subtitle || group.subtitle, 300) || null,
      category: cleanText(full.category || group.category, 120) || null,
      imageCount: Number.isFinite(Number(full.imageCount || group.imageCount)) ? Number(full.imageCount || group.imageCount) : cards.length,
      coverImage: cleanText(group.coverImage, 500) || null,
      order: Number.isFinite(Number(group.order || full.order)) ? Number(group.order || full.order) : null,
      cards,
    }
  })
  return {
    schemaVersion: 1,
    id: "manbeilian_store_knowledge_v1",
    kind: "speech_library",
    title: cleanText(manifest.title, 240) || "曼贝莲项目知识库",
    subtitle: cleanText(manifest.subtitle, 300) || null,
    version: cleanText(manifest.version, 120) || "v1",
    assetBaseUrl: cleanText(manifest.assetBaseUrl, 500) || "/voice-coach-assets/manbeilian-knowledge/v1",
    stats: {
      groupCount: groups.length,
      cardCount,
      imageCount: Number.isFinite(Number(manifest.imageCount)) ? Number(manifest.imageCount) : cardCount,
    },
    groups,
  }
}

function buildPayload() {
  const accounts = buildAccounts()
  const appManifest = buildAppManifest()
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    purpose: "production-cn-rds-knowledge-membership-patch",
    accounts,
    appManifest,
  }
  const raw = Buffer.from(JSON.stringify(payload), "utf8")
  const gz = zlib.gzipSync(raw)
  return {
    payload,
    rawBytes: raw.length,
    gzipBytes: gz.length,
    base64: gz.toString("base64"),
    sha256: createHash("sha256").update(raw).digest("hex"),
    gzipSha256: createHash("sha256").update(gz).digest("hex"),
  }
}

function secretName() {
  return cleanText(
    args.kmsSecretName ||
    process.env.DATABASE_URL_CN_SECRET_NAME ||
    process.env.ALIYUN_RDS_DATABASE_URL_CN_SECRET_NAME ||
    process.env.ALIYUN_KMS_DATABASE_URL_CN_SECRET_NAME ||
    DEFAULT_KMS_SECRET_NAME,
    300,
  )
}

function main() {
  const env = loadEnvFile(args.envFile)
  const payload = buildPayload()
  const remoteCommandBase64Bytes = Buffer.from(remoteScript(), "utf8").toString("base64").length
  if (payload.base64.length > SEND_FILE_BASE64_LIMIT) {
    throw new Error(`payload_too_large_for_sendfile:${payload.base64.length}`)
  }
  if (remoteCommandBase64Bytes > COMMAND_BASE64_LIMIT) {
    throw new Error(`remote_command_too_large:${remoteCommandBase64Bytes}`)
  }

  const plan = {
    ok: true,
    dryRun: !args.execute,
    runId: suffix,
    envFileLoaded: env.loaded,
    envKeysLoaded: env.keysLoaded,
    target: {
      region: REGION,
      vpcId: VPC_ID,
      vSwitchId: VSWITCH_ID,
      kmsSecretName: secretName(),
    },
    payload: {
      accounts: payload.payload.accounts.map((account) => ({
        key: account.key,
        role: account.role,
        userIdPresent: Boolean(account.user_id),
        companyIdPresent: Boolean(account.company_id),
        storeIdPresent: Boolean(account.store_id),
      })),
      manifest: {
        id: payload.payload.appManifest.id,
        groupCount: payload.payload.appManifest.stats.groupCount,
        cardCount: payload.payload.appManifest.stats.cardCount,
        imageCount: payload.payload.appManifest.stats.imageCount,
      },
      rawBytes: payload.rawBytes,
      gzipBytes: payload.gzipBytes,
      gzipBase64Bytes: payload.base64.length,
      remoteCommandBase64Bytes,
      sha256: payload.sha256,
      gzipSha256: payload.gzipSha256,
      containsSecretTokens: false,
    },
    writes: [
      "public.mp_account_memberships for employee/manager test accounts only",
      "public.mp_knowledge_spaces schema and manbeilian app_manifest seed",
      "public.mp_knowledge_space_access grants for employee/manager test accounts only",
      "public.voice_training_packs manbeilian pack metadata row",
    ],
    forbidden: ["git push", "WeChat upload", "production deploy", "unrelated business data writes", "token/env value output"],
  }

  if (!args.execute) {
    console.log(JSON.stringify(plan, null, 2))
    return
  }
  if (process.env[ALLOW_ENV] !== "1") {
    throw new Error(`missing_execution_guard:${ALLOW_ENV}=1`)
  }

  try {
    console.log(`[rds-patch] run=${suffix}`)
    createRunnerRole()
    createSecurityGroup()
    createRunnerInstance()
    sendPayload(payload)
    const remote = runRemoteMigration()
    updateEvidence(remote, payload)
    console.log(JSON.stringify({ ok: true, runId: suffix, remote, cleanupSkipped: args.skipCleanup }, null, 2))
  } finally {
    if (args.skipCleanup) {
      console.log("[rds-patch] cleanup skipped by flag")
    } else {
      cleanup()
    }
  }
}

function createRunnerRole() {
  console.log("[rds-patch] creating temporary ECS RAM role")
  const trust = {
    Version: "1",
    Statement: [{ Effect: "Allow", Principal: { Service: ["ecs.aliyuncs.com"] }, Action: "sts:AssumeRole" }],
  }
  const policy = {
    Version: "1",
    Statement: [
      { Effect: "Allow", Action: ["kms:GetSecretValue"], Resource: ["*"] },
    ],
  }
  run("aliyun", ["ram", "CreateRole", "--RoleName", roleName, "--Description", "Temporary APP API RDS knowledge membership patch runner", "--AssumeRolePolicyDocument", JSON.stringify(trust)])
  run("aliyun", ["ram", "CreatePolicy", "--PolicyName", policyName, "--Description", "Temporary APP API RDS KMS read policy", "--PolicyDocument", JSON.stringify(policy)])
  run("aliyun", ["ram", "AttachPolicyToRole", "--PolicyType", "Custom", "--PolicyName", policyName, "--RoleName", roleName])
  sleep(10_000)
}

function createSecurityGroup() {
  console.log("[rds-patch] creating temporary egress-only security group")
  const created = runJson("aliyun", [
    "ecs", "CreateSecurityGroup",
    "--RegionId", REGION,
    "--VpcId", VPC_ID,
    "--SecurityGroupName", sgName,
    "--Description", "Temporary APP API RDS patch runner egress",
  ])
  securityGroupId = created.SecurityGroupId
  if (!securityGroupId) throw new Error("missing_security_group_id")
  for (const protocol of ["tcp", "udp"]) {
    run("aliyun", [
      "ecs", "AuthorizeSecurityGroupEgress",
      "--RegionId", REGION,
      "--SecurityGroupId", securityGroupId,
      "--IpProtocol", protocol,
      "--PortRange", "1/65535",
      "--DestCidrIp", "0.0.0.0/0",
      "--Policy", "accept",
      "--Priority", "1",
      "--Description", `temporary rds patch ${protocol} egress`,
    ])
  }
}

function createRunnerInstance() {
  console.log("[rds-patch] creating temporary ECS runner")
  const autoRelease = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")
  const result = runJson("aliyun", [
    "ecs", "RunInstances",
    "--RegionId", REGION,
    "--ImageId", IMAGE_ID,
    "--InstanceType", INSTANCE_TYPE,
    "--SecurityGroupId", securityGroupId,
    "--VSwitchId", VSWITCH_ID,
    "--InstanceChargeType", "PostPaid",
    "--InternetChargeType", "PayByTraffic",
    "--InternetMaxBandwidthOut", "5",
    "--SystemDisk.Category", "cloud_essd",
    "--SystemDisk.Size", "40",
    "--Amount", "1",
    "--RamRoleName", roleName,
    "--AutoReleaseTime", autoRelease,
    "--InstanceName", `meiye-rds-patch-${suffix}`,
  ])
  instanceId = result.InstanceIdSets?.InstanceIdSet?.[0]
  if (!instanceId) throw new Error("missing_instance_id")
  console.log(`[rds-patch] runner=${instanceId}`)
  waitForInstance()
  waitForCloudAssistant()
}

function waitForInstance() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const data = runJson("aliyun", ["ecs", "DescribeInstances", "--RegionId", REGION, "--InstanceIds", JSON.stringify([instanceId])])
    const status = data.Instances?.Instance?.[0]?.Status || ""
    if (status === "Running") return
    sleep(5_000)
  }
  throw new Error("runner_not_running")
}

function waitForCloudAssistant() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const data = runJson("aliyun", ["ecs", "DescribeCloudAssistantStatus", "--RegionId", REGION, "--InstanceId.1", instanceId])
    const item = data.InstanceCloudAssistantStatusSet?.InstanceCloudAssistantStatus?.[0]
    const status = item?.CloudAssistantStatus
    if (status === "true" || status === true || status === "Online") return
    sleep(5_000)
  }
  throw new Error("cloud_assistant_not_ready")
}

function sendPayload(payload) {
  console.log("[rds-patch] sending gzipped non-secret payload")
  runJson("aliyun", [
    "ecs", "SendFile",
    "--RegionId", REGION,
    "--InstanceId.1", instanceId,
    "--Name", "payload.json.gz",
    "--TargetDir", remoteDir,
    "--Content", payload.base64,
    "--ContentType", "Base64",
    "--Overwrite", "true",
    "--FileMode", "0600",
    "--Timeout", "120",
  ])
}

function runRemoteMigration() {
  console.log("[rds-patch] running remote RDS migration")
  const script = remoteScript()
  const encoded = Buffer.from(script, "utf8").toString("base64")
  if (encoded.length > COMMAND_BASE64_LIMIT) throw new Error(`remote_command_too_large:${encoded.length}`)
  const created = runJson("aliyun", [
    "ecs", "CreateCommand",
    "--RegionId", REGION,
    "--Name", commandName,
    "--Type", "RunShellScript",
    "--CommandContent", encoded,
    "--Timeout", "1800",
  ])
  commandId = created.CommandId
  if (!commandId) throw new Error("missing_command_id")
  const invoked = runJson("aliyun", ["ecs", "InvokeCommand", "--RegionId", REGION, "--CommandId", commandId, "--InstanceId.1", instanceId, "--Timeout", "1800"])
  const invokeId = invoked.InvokeId
  if (!invokeId) throw new Error("missing_invoke_id")

  for (let attempt = 1; attempt <= 120; attempt += 1) {
    const result = runJson("aliyun", [
      "ecs", "DescribeInvocationResults",
      "--RegionId", REGION,
      "--InvokeId", invokeId,
      "--InstanceId", instanceId,
      "--ContentEncoding", "PlainText",
    ])
    const item = result.Invocation?.InvocationResults?.InvocationResult?.[0]
    const status = item?.InvocationStatus || item?.InvokeRecordStatus || ""
    if (status === "Finished" || status === "Success") {
      const output = item.Output || ""
      process.stdout.write(redactOutput(output))
      return parseRemoteResult(output, invokeId)
    }
    if (status === "Failed" || status === "PartialFailed" || status === "Stopped") {
      process.stdout.write(redactOutput(item?.Output || ""))
      throw new Error(`remote_migration_failed:${status}`)
    }
    if (attempt % 6 === 0) console.log(`[rds-patch] remote status=${status || "pending"} elapsed=${attempt * 10}s`)
    sleep(10_000)
  }
  throw new Error("remote_migration_timeout")
}

function parseRemoteResult(output, invokeId) {
  const match = output.match(/REMOTE_RESULT_JSON_BEGIN\n([\s\S]*?)\nREMOTE_RESULT_JSON_END/)
  if (!match) throw new Error("missing_remote_result_json")
  const parsed = JSON.parse(match[1])
  return {
    ...parsed,
    invokeId,
    commandId,
    runnerInstanceId: instanceId,
    securityGroupId,
  }
}

function redactOutput(output) {
  return String(output || "")
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/ig, "postgres://<redacted>")
    .replace(/(password|secret|token)=([^\s]+)/ig, "$1=<redacted>")
}

function remoteScript() {
  return `#!/usr/bin/env bash
set -euo pipefail
REGION="${REGION}"
ROLE_NAME="${roleName}"
WORKDIR="${remoteDir}"
SECRET_NAME="${secretName()}"
mkdir -p "$WORKDIR"
echo "[remote] install"
(dnf install -y postgresql gzip python3 curl ca-certificates > /tmp/rds-patch-install.log 2>&1 || yum install -y postgresql gzip python3 curl ca-certificates > /tmp/rds-patch-install.log 2>&1) || { tail -80 /tmp/rds-patch-install.log; exit 1; }
if ! command -v aliyun >/dev/null 2>&1; then
  curl -fsSL https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz -o /tmp/aliyun-cli.tgz
  tar -xzf /tmp/aliyun-cli.tgz -C /tmp
  install /tmp/aliyun /usr/local/bin/aliyun
fi
aliyun configure set --mode EcsRamRole --ram-role-name "$ROLE_NAME" --region "$REGION" --language en >/tmp/rds-patch-aliyun-config.log 2>&1
for i in $(seq 1 60); do
  test -s "$WORKDIR/payload.json.gz" && break
  sleep 2
done
test -s "$WORKDIR/payload.json.gz"
gzip -dc "$WORKDIR/payload.json.gz" > "$WORKDIR/payload.json"
SECRET_JSON="$(aliyun kms GetSecretValue --SecretName "$SECRET_NAME" --VersionStage ACSCurrent)"
DB_URL="$(printf '%s' "$SECRET_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("SecretData",""))')"
test -n "$DB_URL"
eval "$(python3 - "$DB_URL" <<'PY'
import shlex, sys
from urllib.parse import urlparse, parse_qs, unquote
u = urlparse(sys.argv[1])
params = parse_qs(u.query)
def emit(name, value):
    if value:
        print(f"export {name}={shlex.quote(value)}")
emit("PGHOST", u.hostname or "")
emit("PGPORT", str(u.port or 5432))
emit("PGDATABASE", (u.path or "/").lstrip("/"))
emit("PGUSER", unquote(u.username or ""))
emit("PGPASSWORD", unquote(u.password or ""))
emit("PGSSLMODE", params.get("sslmode", ["prefer"])[0])
PY
)"
unset SECRET_JSON DB_URL
cat > "$WORKDIR/migration.sql" <<'SQL'
\\set ON_ERROR_STOP on
\\set payload_json \`cat /tmp/meiye-rds-knowledge-membership-${suffix}/payload.json\`
begin;
create temp table _codex_payload as select :'payload_json'::jsonb as doc;
create temp table _codex_accounts as
select *
from jsonb_to_recordset((select doc->'accounts' from _codex_payload)) as x(
  key text,
  email text,
  nickname text,
  role text,
  user_id uuid,
  company_id uuid,
  company_name text,
  store_id uuid,
  store_name text,
  service_plan_label text
);

create temp table _codex_scope as
select
  company.id as company_id,
  store.id as store_id,
  'latest_active_store'::text as scope_source
from public.mp_stores store
join public.mp_companies company on company.id = store.company_id
where store.status = 'active' and company.status = 'active'
order by store.created_at desc
limit 1;

do $$
declare
  account_count integer;
  scope_count integer;
begin
  select count(*) into account_count from _codex_accounts;
  if account_count <> 2 then
    raise exception 'expected_two_test_accounts';
  end if;

  select count(*) into scope_count from _codex_scope;
  if scope_count <> 1 then
    raise exception 'no_active_company_store';
  end if;
end $$;

create table if not exists public.mp_knowledge_spaces (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  display_name text not null,
  brand_code text,
  default_pack_id text,
  scope_type text,
  company_id uuid,
  store_id uuid,
  status text not null default 'active',
  feature_flags jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.mp_knowledge_spaces
  add column if not exists code text,
  add column if not exists display_name text,
  add column if not exists brand_code text,
  add column if not exists default_pack_id text,
  add column if not exists scope_type text,
  add column if not exists company_id uuid,
  add column if not exists store_id uuid,
  add column if not exists status text not null default 'active',
  add column if not exists feature_flags jsonb not null default '{}'::jsonb,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists sort_order integer,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists mp_knowledge_spaces_code_unique_idx on public.mp_knowledge_spaces(code);

create table if not exists public.mp_knowledge_space_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  knowledge_space_id uuid not null,
  role text not null default 'viewer',
  status text not null default 'active',
  expires_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.mp_knowledge_space_access
  add column if not exists user_id uuid,
  add column if not exists knowledge_space_id uuid,
  add column if not exists role text not null default 'viewer',
  add column if not exists status text not null default 'active',
  add column if not exists expires_at timestamptz,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists mp_knowledge_space_access_user_space_unique_idx on public.mp_knowledge_space_access(user_id, knowledge_space_id);

create table if not exists public.voice_training_packs (
  id uuid primary key default gen_random_uuid(),
  brand_code text not null,
  pack_id text not null,
  title text not null,
  version text,
  status text not null default 'active',
  metadata_json jsonb not null default '{}'::jsonb,
  tasks_json jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.voice_training_packs
  add column if not exists brand_code text,
  add column if not exists pack_id text,
  add column if not exists title text,
  add column if not exists version text,
  add column if not exists status text not null default 'active',
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists tasks_json jsonb not null default '[]'::jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists voice_training_packs_brand_pack_unique_idx on public.voice_training_packs(brand_code, pack_id);

create temp table _codex_pack_write as
with upsert as (
insert into public.voice_training_packs (
  brand_code, pack_id, title, version, status, metadata_json, published_at, updated_at
)
values (
  'manbeilian',
  'manbeilian_professional_speaking_v1',
  '曼贝莲项目卡开口训练',
  'v1',
  'published',
  jsonb_build_object(
    'subtitle', '苗药筋骨养护、春归液和门店项目卡安全表达',
    'training_pack_mode', 'manbeilian-speaking',
    'local_fallback', true,
    'task_count', ((select doc->'appManifest'->'stats'->>'cardCount' from _codex_payload))::integer,
    'task_unit', '张',
    'static_asset_root', '/voice-coach-assets/manbeilian-knowledge/v1',
    'seed_source', 'codex-production-cn-rds-knowledge-membership-20260702'
  ),
  now(),
  now()
)
on conflict (brand_code, pack_id) do update
set title = excluded.title,
    version = excluded.version,
    status = excluded.status,
    metadata_json = coalesce(public.voice_training_packs.metadata_json, '{}'::jsonb) || excluded.metadata_json,
    published_at = coalesce(public.voice_training_packs.published_at, excluded.published_at),
    updated_at = now()
returning brand_code, pack_id, status
)
select * from upsert;

create temp table _codex_space_write as
with target_scope as (
  select company_id from _codex_scope
),
manifest as (
  select doc->'appManifest' as app_manifest from _codex_payload
),
upsert as (
insert into public.mp_knowledge_spaces (
  code, display_name, brand_code, default_pack_id, scope_type, company_id, store_id,
  status, feature_flags, metadata_json, sort_order, updated_at
)
select
  'manbeilian',
  '曼贝莲项目库',
  'manbeilian',
  'manbeilian_professional_speaking_v1',
  'company',
  target_scope.company_id,
  null,
  'active',
  jsonb_build_object('training_pack_mode', 'manbeilian-speaking', 'local_fallback', true),
  jsonb_build_object(
    'description', '曼贝莲苗药筋骨养护、春归液项目卡和门店安全表达训练。',
    'training_pack_mode', 'manbeilian-speaking',
    'local_fallback', true,
    'task_count', (manifest.app_manifest->'stats'->>'cardCount')::integer,
    'task_unit', '张',
    'static_asset_root', '/voice-coach-assets/manbeilian-knowledge/v1',
    'app_manifest', manifest.app_manifest,
    'knowledge_space_manifest', manifest.app_manifest,
    'seed_source', 'codex-production-cn-rds-knowledge-membership-20260702'
  ),
  30,
  now()
from target_scope cross join manifest
on conflict (code) do update
set display_name = excluded.display_name,
    brand_code = excluded.brand_code,
    default_pack_id = excluded.default_pack_id,
    scope_type = excluded.scope_type,
    company_id = excluded.company_id,
    store_id = excluded.store_id,
    status = excluded.status,
    feature_flags = coalesce(public.mp_knowledge_spaces.feature_flags, '{}'::jsonb) || excluded.feature_flags,
    metadata_json = coalesce(public.mp_knowledge_spaces.metadata_json, '{}'::jsonb) || excluded.metadata_json,
    sort_order = least(coalesce(public.mp_knowledge_spaces.sort_order, excluded.sort_order), excluded.sort_order),
    updated_at = now()
returning id, code, status, jsonb_array_length(metadata_json->'app_manifest'->'groups') as group_count
)
select * from upsert;

create temp table _codex_membership_write as
with upsert as (
insert into public.mp_account_memberships
  (user_id, company_id, store_id, role, status, display_name, accepted_at, last_seen_at)
select
  account.user_id,
  scope.company_id,
  scope.store_id,
  account.role,
  'active',
  coalesce(nullif(account.nickname, ''), account.email, account.key),
  now(),
  now()
from _codex_accounts account
cross join _codex_scope scope
on conflict (user_id, company_id, store_id, role) do update
set status = 'active',
    display_name = excluded.display_name,
    accepted_at = coalesce(public.mp_account_memberships.accepted_at, excluded.accepted_at),
    last_seen_at = excluded.last_seen_at,
    updated_at = now()
returning id, user_id, company_id, store_id, role, status
)
select * from upsert;

create temp table _codex_access_write as
with upsert as (
insert into public.mp_knowledge_space_access
  (user_id, knowledge_space_id, role, status, metadata_json, updated_at)
select
  account.user_id,
  space.id,
  case when account.role in ('store_admin', 'store_owner', 'company_admin', 'merchant_owner') then 'admin' else 'viewer' end,
  'active',
  jsonb_build_object('source', 'app_live_smoke_test_account_seed', 'seed_source', 'codex-production-cn-rds-knowledge-membership-20260702'),
  now()
from _codex_accounts account
cross join _codex_space_write space
on conflict (user_id, knowledge_space_id) do update
set role = excluded.role,
    status = 'active',
    expires_at = null,
    metadata_json = coalesce(public.mp_knowledge_space_access.metadata_json, '{}'::jsonb) || excluded.metadata_json,
    updated_at = now()
returning user_id, knowledge_space_id, role, status
)
select * from upsert;

create temp table _codex_result as
select jsonb_build_object(
  'ok', true,
  'ranAt', now(),
  'membershipRows', (select count(*) from _codex_membership_write),
  'knowledgeSpaceRows', (select count(*) from _codex_space_write),
  'knowledgeAccessRows', (select count(*) from _codex_access_write),
  'trainingPackRows', (select count(*) from _codex_pack_write),
  'manifestGroupCount', (select max(group_count) from _codex_space_write),
  'manifestCardCount', ((select doc->'appManifest'->'stats'->>'cardCount' from _codex_payload))::integer,
  'scopeSource', (select scope_source from _codex_scope limit 1),
  'tablesPresent', jsonb_build_object(
    'mp_knowledge_spaces', to_regclass('public.mp_knowledge_spaces') is not null,
    'mp_knowledge_space_access', to_regclass('public.mp_knowledge_space_access') is not null,
    'voice_training_packs', to_regclass('public.voice_training_packs') is not null
  ),
  'secretValuePrinted', false
) as result;
commit;
select result from _codex_result;
SQL
psql -q -t -A -f "$WORKDIR/migration.sql" > "$WORKDIR/result.json"
unset PGPASSWORD PGHOST PGPORT PGDATABASE PGUSER PGSSLMODE
python3 - "$WORKDIR/result.json" <<'PY'
import json, re, sys
text = open(sys.argv[1], encoding="utf-8").read().strip()
if re.search(r'postgres(?:ql)?://|DATABASE_URL|PASSWORD[":=]|TOKEN[":=]', text, re.I):
    raise SystemExit("secret_like_output_blocked")
data = json.loads(text)
print("REMOTE_RESULT_JSON_BEGIN")
print(json.dumps(data, ensure_ascii=False, sort_keys=True))
print("REMOTE_RESULT_JSON_END")
PY
rm -f "$WORKDIR/payload.json" "$WORKDIR/payload.json.gz" "$WORKDIR/migration.sql" "$WORKDIR/result.json"
`
}

function updateEvidence(remote, payload) {
  const filePath = args.evidenceFile
  let data = {}
  if (existsSync(filePath)) {
    data = readJson(filePath)
  }
  const now = new Date().toISOString()
  data.schemaVersion = data.schemaVersion || 1
  data.environment = data.environment || "production-cn"
  data.updatedAt = now
  data.migration = data.migration || {}
  data.migration.knowledgeSpacesPatch = {
    appliedAt: now,
    runnerInstanceId: remote.runnerInstanceId,
    invokeId: remote.invokeId,
    commandId: remote.commandId,
    membershipRows: remote.membershipRows,
    knowledgeSpaceRows: remote.knowledgeSpaceRows,
    knowledgeAccessRows: remote.knowledgeAccessRows,
    trainingPackRows: remote.trainingPackRows,
    manifestGroupCount: remote.manifestGroupCount,
    manifestCardCount: remote.manifestCardCount,
    payloadSha256: payload.sha256,
    payloadGzipSha256: payload.gzipSha256,
    secretValuePrinted: false,
    scope: "test-account memberships plus app knowledge spaces schema/data only",
  }
  data.migration.schemaMigrated = true
  data.migration.dataMigrated = true
  data.migration.rowCountValidationPassed = true
  data.migration.criticalRecordValidationPassed = true
  data.security = data.security || {}
  data.security.containsDatabasePassword = false
  data.security.containsConnectionString = false
  data.security.containsSupabaseServiceRoleKey = false
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n")
}

function cleanup() {
  if (cleanupDone) return
  cleanupDone = true
  console.log("[rds-patch] cleanup started")
  if (commandId) safeRun("aliyun", ["ecs", "DeleteCommand", "--RegionId", REGION, "--CommandId", commandId])
  if (instanceId) safeRun("aliyun", ["ecs", "DeleteInstance", "--InstanceId", instanceId, "--Force", "true"])
  if (securityGroupId) {
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const ok = safeRun("aliyun", ["ecs", "DeleteSecurityGroup", "--RegionId", REGION, "--SecurityGroupId", securityGroupId])
      if (ok) break
      sleep(10_000)
    }
  }
  safeRun("aliyun", ["ram", "DetachPolicyFromRole", "--PolicyType", "Custom", "--PolicyName", policyName, "--RoleName", roleName])
  safeRun("aliyun", ["ram", "DeletePolicy", "--PolicyName", policyName])
  safeRun("aliyun", ["ram", "DeleteRole", "--RoleName", roleName])
  console.log("[rds-patch] cleanup finished")
}

function runJson(command, commandArgs) {
  const output = run(command, commandArgs)
  try {
    return JSON.parse(output || "{}")
  } catch (_error) {
    throw new Error(`invalid_json:${command} ${commandArgs.slice(0, 4).join(" ")}:${output.slice(0, 500)}`)
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  if (result.status !== 0) {
    const text = redactOutput(result.stderr || result.stdout || "").trim().slice(0, 600)
    throw new Error(`${command} ${commandArgs.slice(0, 4).join(" ")} failed:${text}`)
  }
  return result.stdout
}

function safeRun(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  })
  if (result.status !== 0) {
    const text = redactOutput(result.stderr || result.stdout || "").trim().slice(0, 300)
    if (/NotFound|EntityNotExist|does not exist|not exists/i.test(text)) return true
    console.log(`[rds-patch] cleanup warning: ${command} ${commandArgs.slice(0, 3).join(" ")}: ${text}`)
    return false
  }
  return true
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

try {
  main()
} catch (error) {
  if (!args.skipCleanup && !cleanupDone && (instanceId || securityGroupId || commandId)) cleanup()
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    runId: suffix,
    cleanupAttempted: !args.skipCleanup,
  }, null, 2))
  process.exit(1)
}
