#!/usr/bin/env node

import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const REGION = "cn-hangzhou"
const VPC_ID = "vpc-bp1f9a59umjuelakdc38w"
const VSWITCH_ID = "vsw-bp11pdkiyf9w214i42qdk"
const IMAGE_ID = "aliyun_3_x64_20G_alibase_20260513.vhd"
const INSTANCE_TYPE = "ecs.e-c1m2.large"
const DEFAULT_KMS_SECRET_NAME = "meiye-huajing/production-cn/DATABASE_URL_CN"
const ALLOW_ENV = "MEIYE_ALLOW_PRODUCTION_CN_RDS_AUTH_REVOCATION_SCHEMA"
const BACKEND_ROOT = resolve(import.meta.dirname, "..")
const SCHEMA_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.app-auth-revocations-schema.sql")

const suffix = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) +
  "-" + Math.random().toString(36).slice(2, 8)
const roleName = `MeiyeHuajingAuthRevocationSchema-${suffix}`
const policyName = `MeiyeHuajingAuthRevocationSchemaPolicy-${suffix}`
const sgName = `meiye-auth-revocation-schema-sg-${suffix}`
const commandName = `meiye-auth-revocation-schema-${suffix}`
const remoteDir = `/tmp/meiye-auth-revocation-schema-${suffix}`

const args = parseArgs(process.argv)
let securityGroupId = ""
let instanceId = ""
let commandId = ""
let cleanupDone = false

function parseArgs(argv) {
  const parsed = {
    execute: false,
    skipCleanup: false,
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

function printHelp() {
  console.log([
    "Usage:",
    `  ${ALLOW_ENV}=1 node scripts/apply-production-cn-rds-auth-revocation-schema.mjs --execute`,
    "",
    "Scope:",
    "  - schema-only create table/index for public.app_auth_token_revocations",
    "  - no business row reads or writes",
    "  - no token, database URL, password, AccessKeySecret, or STS token output",
  ].join("\n"))
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
  ]
  for (const pattern of forbidden) {
    if (pattern.test(compact)) throw new Error(`schema_contains_forbidden_statement:${pattern}`)
  }
  if (!/create table if not exists public\.app_auth_token_revocations/.test(compact)) {
    throw new Error("schema_missing_app_auth_token_revocations_table")
  }
  return sql
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function secretName() {
  return String(
    args.kmsSecretName ||
    process.env.DATABASE_URL_CN_SECRET_NAME ||
    process.env.ALIYUN_RDS_DATABASE_URL_CN_SECRET_NAME ||
    process.env.ALIYUN_KMS_DATABASE_URL_CN_SECRET_NAME ||
    DEFAULT_KMS_SECRET_NAME,
  ).trim()
}

function main() {
  const schemaSql = readSchema()
  const schemaBase64 = Buffer.from(schemaSql, "utf8").toString("base64")
  const plan = {
    ok: true,
    dryRun: !args.execute,
    runId: suffix,
    target: {
      region: REGION,
      vpcId: VPC_ID,
      vSwitchId: VSWITCH_ID,
      kmsSecretName: secretName(),
    },
    schema: {
      file: SCHEMA_FILE,
      sha256: sha256(schemaSql),
      bytes: Buffer.byteLength(schemaSql),
      base64Bytes: schemaBase64.length,
      schemaOnly: true,
    },
    writes: [
      "create table if not exists public.app_auth_token_revocations",
      "create index if not exists app_auth_token_revocations_active_lookup_idx",
      "create index if not exists app_auth_token_revocations_expiring_lookup_idx",
      "create index if not exists app_auth_token_revocations_revoked_at_idx",
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
    console.log(`[auth-revocation-schema] run=${suffix}`)
    createRunnerRole()
    createSecurityGroup()
    createRunnerInstance()
    sendSchema(schemaBase64)
    const remote = runRemoteSchemaApply()
    console.log(JSON.stringify({ ok: true, runId: suffix, remote, cleanupSkipped: args.skipCleanup }, null, 2))
  } finally {
    if (args.skipCleanup) {
      console.log("[auth-revocation-schema] cleanup skipped by flag")
    } else {
      cleanup()
    }
  }
}

function createRunnerRole() {
  console.log("[auth-revocation-schema] creating temporary ECS RAM role")
  const trust = {
    Version: "1",
    Statement: [{ Effect: "Allow", Principal: { Service: ["ecs.aliyuncs.com"] }, Action: "sts:AssumeRole" }],
  }
  const policy = {
    Version: "1",
    Statement: [{ Effect: "Allow", Action: ["kms:GetSecretValue"], Resource: ["*"] }],
  }
  run("aliyun", ["ram", "CreateRole", "--RoleName", roleName, "--Description", "Temporary APP API auth revocation schema runner", "--AssumeRolePolicyDocument", JSON.stringify(trust)])
  run("aliyun", ["ram", "CreatePolicy", "--PolicyName", policyName, "--Description", "Temporary APP API RDS KMS read policy", "--PolicyDocument", JSON.stringify(policy)])
  run("aliyun", ["ram", "AttachPolicyToRole", "--PolicyType", "Custom", "--PolicyName", policyName, "--RoleName", roleName])
  sleep(10_000)
}

function createSecurityGroup() {
  console.log("[auth-revocation-schema] creating temporary egress-only security group")
  const created = runJson("aliyun", [
    "ecs", "CreateSecurityGroup",
    "--RegionId", REGION,
    "--VpcId", VPC_ID,
    "--SecurityGroupName", sgName,
    "--Description", "Temporary APP API auth revocation schema runner egress",
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
      "--Description", `temporary auth revocation schema ${protocol} egress`,
    ])
  }
}

function createRunnerInstance() {
  console.log("[auth-revocation-schema] creating temporary ECS runner")
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
    "--InstanceName", `meiye-auth-revocation-schema-${suffix}`,
  ])
  instanceId = result.InstanceIdSets?.InstanceIdSet?.[0]
  if (!instanceId) throw new Error("missing_instance_id")
  console.log(`[auth-revocation-schema] runner=${instanceId}`)
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

function sendSchema(schemaBase64) {
  console.log("[auth-revocation-schema] sending schema-only SQL")
  runJson("aliyun", [
    "ecs", "SendFile",
    "--RegionId", REGION,
    "--InstanceId.1", instanceId,
    "--Name", "schema.sql",
    "--TargetDir", remoteDir,
    "--Content", schemaBase64,
    "--ContentType", "Base64",
    "--Overwrite", "true",
    "--FileMode", "0600",
    "--Timeout", "120",
  ])
}

function runRemoteSchemaApply() {
  console.log("[auth-revocation-schema] applying schema inside VPC")
  const encoded = Buffer.from(remoteScript(), "utf8").toString("base64")
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
      throw new Error(`remote_schema_apply_failed:${status}`)
    }
    if (attempt % 6 === 0) console.log(`[auth-revocation-schema] remote status=${status || "pending"} elapsed=${attempt * 10}s`)
    sleep(10_000)
  }
  throw new Error("remote_schema_apply_timeout")
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

function remoteScript() {
  return `#!/usr/bin/env bash
set -euo pipefail
REGION="${REGION}"
ROLE_NAME="${roleName}"
WORKDIR="${remoteDir}"
SECRET_NAME="${secretName()}"
mkdir -p "$WORKDIR"
echo "[remote] install"
(dnf install -y postgresql python3 curl ca-certificates > /tmp/auth-revocation-schema-install.log 2>&1 || yum install -y postgresql python3 curl ca-certificates > /tmp/auth-revocation-schema-install.log 2>&1) || { tail -80 /tmp/auth-revocation-schema-install.log; exit 1; }
if ! command -v aliyun >/dev/null 2>&1; then
  curl -fsSL https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz -o /tmp/aliyun-cli.tgz
  tar -xzf /tmp/aliyun-cli.tgz -C /tmp
  install /tmp/aliyun /usr/local/bin/aliyun
fi
aliyun configure set --mode EcsRamRole --ram-role-name "$ROLE_NAME" --region "$REGION" --language en >/tmp/auth-revocation-schema-aliyun-config.log 2>&1
for i in $(seq 1 60); do
  test -s "$WORKDIR/schema.sql" && break
  sleep 2
done
test -s "$WORKDIR/schema.sql"
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
psql -q -v ON_ERROR_STOP=1 -f "$WORKDIR/schema.sql" >/tmp/auth-revocation-schema-apply.log
cat > "$WORKDIR/verify.sql" <<'SQL'
\\set ON_ERROR_STOP on
select jsonb_build_object(
  'ok', true,
  'tablePresent', to_regclass('public.app_auth_token_revocations') is not null,
  'columnCount', (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'app_auth_token_revocations'
  ),
  'indexesPresent', jsonb_build_object(
    'app_auth_token_revocations_pkey', to_regclass('public.app_auth_token_revocations_pkey') is not null,
    'app_auth_token_revocations_active_lookup_idx', to_regclass('public.app_auth_token_revocations_active_lookup_idx') is not null,
    'app_auth_token_revocations_expiring_lookup_idx', to_regclass('public.app_auth_token_revocations_expiring_lookup_idx') is not null,
    'app_auth_token_revocations_revoked_at_idx', to_regclass('public.app_auth_token_revocations_revoked_at_idx') is not null
  ),
  'secretValuePrinted', false
) as result;
SQL
psql -q -t -A -f "$WORKDIR/verify.sql" > "$WORKDIR/result.json"
unset PGPASSWORD PGHOST PGPORT PGDATABASE PGUSER PGSSLMODE
python3 - "$WORKDIR/result.json" <<'PY'
import json, re, sys
text = open(sys.argv[1], encoding="utf-8").read().strip()
if re.search(r'postgres(?:ql)?://|DATABASE_URL|PASSWORD[":=]|TOKEN[":=]', text, re.I):
    raise SystemExit("secret_like_output_blocked")
data = json.loads(text)
required_indexes = data.get("indexesPresent", {})
if not data.get("tablePresent") or data.get("columnCount", 0) < 8 or not all(required_indexes.values()):
    raise SystemExit("auth_revocation_schema_verification_failed")
print("REMOTE_RESULT_JSON_BEGIN")
print(json.dumps(data, ensure_ascii=False, sort_keys=True))
print("REMOTE_RESULT_JSON_END")
PY
rm -f "$WORKDIR/schema.sql" "$WORKDIR/verify.sql" "$WORKDIR/result.json"
`
}

function redactOutput(output) {
  return String(output || "")
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/ig, "postgres://<redacted>")
    .replace(/(password|secret|token)=([^\s]+)/ig, "$1=<redacted>")
}

function cleanup() {
  if (cleanupDone) return
  cleanupDone = true
  console.log("[auth-revocation-schema] cleanup started")
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
  console.log("[auth-revocation-schema] cleanup finished")
}

function runJson(command, commandArgs) {
  const output = run(command, commandArgs)
  try {
    return JSON.parse(output || "{}")
  } catch {
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
    console.log(`[auth-revocation-schema] cleanup warning: ${command} ${commandArgs.slice(0, 3).join(" ")}: ${text}`)
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
    secretValuesPrinted: false,
  }, null, 2))
  process.exit(1)
}
