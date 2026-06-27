#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_TEMPLATE_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-inventory-results.example.json")
const DEFAULT_SCRIPT_FILE = "/tmp/meiye-aliyun-cloudshell-readonly-collector.py"
const DEFAULT_BOOTSTRAP_FILE = "/tmp/meiye-aliyun-cloudshell-readonly-bootstrap.sh"
const DEFAULT_CLOUDSHELL_SCRIPT_FILE = "/tmp/meiye-aliyun-cloudshell-readonly-collector.py"
const DEFAULT_CLOUDSHELL_OUTPUT_FILE = "/tmp/meiye-aliyun-readonly-inventory.local.json"
const ALLOW_ENV = "MEIYE_ALLOW_ALIYUN_CLOUDSHELL_READONLY"
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
    out: DEFAULT_SCRIPT_FILE,
    report: "",
    markdown: "",
    bootstrap: DEFAULT_BOOTSTRAP_FILE,
    cloudshellScriptFile: DEFAULT_CLOUDSHELL_SCRIPT_FILE,
    cloudshellOutputFile: DEFAULT_CLOUDSHELL_OUTPUT_FILE,
    printScript: false,
    printBootstrap: false,
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
    if (arg === "--report") {
      args.report = resolveValue(argv[++index], "--report")
      continue
    }
    if (arg === "--markdown") {
      args.markdown = resolveValue(argv[++index], "--markdown")
      continue
    }
    if (arg === "--bootstrap") {
      args.bootstrap = resolveValue(argv[++index], "--bootstrap")
      continue
    }
    if (arg === "--cloudshell-script-file") {
      args.cloudshellScriptFile = argv[++index] || ""
      if (!args.cloudshellScriptFile) throw new Error("missing_value:--cloudshell-script-file")
      continue
    }
    if (arg === "--cloudshell-output-file") {
      args.cloudshellOutputFile = argv[++index] || ""
      if (!args.cloudshellOutputFile) throw new Error("missing_value:--cloudshell-output-file")
      continue
    }
    if (arg === "--print-script") {
      args.printScript = true
      continue
    }
    if (arg === "--print-bootstrap") {
      args.printBootstrap = true
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

function writeText(filePath, content, mode = 0o600) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode })
}

function extractOperations(template) {
  const blockers = []
  if (template.schemaVersion !== 1) blockers.push("schemaVersion=1")
  if (template.environment !== "production-cn") blockers.push("environment=production-cn")
  if (template.sourcePlanCommand !== EXPECTED_SOURCE_PLAN_COMMAND) blockers.push("sourcePlanCommand")
  if (!Array.isArray(template.operations) || template.operations.length === 0) blockers.push("operations")

  const operations = (template.operations || []).map((operation) => {
    const commandResult = operation.commandResults?.[0] || {}
    const command = String(commandResult.command || "")
    if (!operation.id) blockers.push("operation.id")
    if (operation.readOnly !== true) blockers.push(`${operation.id}:readOnly=true`)
    if (!command.startsWith("aliyun ")) blockers.push(`${operation.id}:command=aliyun`)
    if (/[<>]/.test(command)) blockers.push(`${operation.id}:placeholder_command_not_supported`)
    if (isUnsafeCommand(command)) blockers.push(`${operation.id}:unsafe_command:${command}`)
    return {
      id: operation.id,
      title: operation.title,
      product: operation.product,
      command,
      writesTo: operation.writesTo || [],
    }
  })

  const secretMatches = findSecretLikeValues({ operations })
  if (secretMatches.length) blockers.push(`contains_secret_like_values:${secretMatches.join(",")}`)

  return {
    operations,
    blockers: [...new Set(blockers)],
  }
}

function isUnsafeCommand(command) {
  return /\b(Create|Update|Delete|DeployApplication|StartApplication|StopApplication|GetAuthorizationToken|GetUserCertificateDetail)\b|\s(cp|cat|sign|rm|mb|set-acl)\s/i.test(command)
}

function buildCollectorScript(operations) {
  const operationsJson = JSON.stringify(operations, null, 2)
  return `#!/usr/bin/env python3
import datetime
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

ALLOW_ENV = "${ALLOW_ENV}"
DEFAULT_OUT = str(Path.home() / "meiye-aliyun-readonly-inventory.local.json")
SOURCE_PLAN_COMMAND = "${EXPECTED_SOURCE_PLAN_COMMAND}"
OPERATIONS = ${operationsJson}
SECRET_VALUE_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{30,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"LTAI[A-Za-z0-9]{12,}"),
    re.compile(r"secret_[A-Za-z0-9]{20,}"),
    re.compile(r"eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{10,}"),
    re.compile(r"://[^\\\\s:@]+:[^\\\\s@]+@"),
    re.compile(r"(password|passwd|pwd|token|secret|access[_-]?key)\\\\s*[:=]\\\\s*[^,\\\\s]{8,}", re.IGNORECASE),
]

def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")

def contains_secret_like_value(text):
    return any(pattern.search(text or "") for pattern in SECRET_VALUE_PATTERNS)

def classify_failure(status, combined_output):
    if status == 0:
        return ""
    if re.search(r"profile\\\\s+default\\\\s+is\\\\s+not\\\\s+configure|Configuration failed|aliyun configure", combined_output or "", re.IGNORECASE):
        return "aliyun_cli_profile_not_configured"
    if re.search(r"config failed|region can't be empty|region cannot be empty|missing region", combined_output or "", re.IGNORECASE):
        return "aliyun_cli_config_incomplete"
    if re.search(r"command not found|ENOENT|not recognized", combined_output or "", re.IGNORECASE):
        return "aliyun_cli_binary_missing"
    if re.search(r"InvalidAccessKeyId|SignatureDoesNotMatch|Forbidden|Unauthorized|AccessDenied|NoPermission", combined_output or "", re.IGNORECASE):
        return "aliyun_cli_auth_or_permission_failed"
    if re.search(r"Unknown|InvalidAction|not support|unsupported|No such command", combined_output or "", re.IGNORECASE):
        return "aliyun_cli_command_or_api_not_supported"
    return "aliyun_cli_readonly_command_failed"

def first_json_payload(text):
    text = (text or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            return None
    return None

def walk_values(value, keys):
    wanted = {key.lower() for key in keys}
    found = []
    def walk(item):
        if isinstance(item, dict):
            for key, nested in item.items():
                if str(key).lower() in wanted and nested not in (None, ""):
                    found.append(str(nested))
                walk(nested)
        elif isinstance(item, list):
            for nested in item:
                walk(nested)
    walk(value)
    return found

def first_list(value, keys):
    wanted = {key.lower() for key in keys}
    queue = [value]
    while queue:
        item = queue.pop(0)
        if isinstance(item, dict):
            for key, nested in item.items():
                if str(key).lower() in wanted and isinstance(nested, list):
                    return nested
                queue.append(nested)
        elif isinstance(item, list):
            return item
    return []

def count_items(data, list_keys):
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        for key in ("TotalCount", "Total", "TotalRecordCount", "Count"):
            if key in data:
                try:
                    return int(data[key])
                except Exception:
                    pass
    items = first_list(data, list_keys)
    return len(items) if isinstance(items, list) else 0

def compact_text(value, limit=80):
    text = re.sub(r"[^A-Za-z0-9_.:/@+=,-]+", "_", str(value or "").strip())
    return text[:limit]

def bool_text(value):
    return "true" if value else "false"

def summarize_resource(operation_id, status, stdout, stderr):
    if status != 0:
        return {
            "status": "blocked",
            "parts": [],
        }
    data = first_json_payload(stdout)
    combined = (stdout or "") + "\\n" + (stderr or "")
    if operation_id == "I01_SAE_RUNTIME":
        target = "meiye-huajing-app-api-production-cn"
        names = walk_values(data, ["AppName", "ApplicationName", "Name"]) if data is not None else []
        count = count_items(data, ["Applications", "ApplicationList", "Data"]) if data is not None else 0
        present = target in names
        return {"status": "observed" if present else "not_found", "parts": [f"applicationCount={count}", f"targetAppPresent={bool_text(present)}", f"targetAppName={target}"]}
    if operation_id == "I02_ACR_IMAGE":
        target = "meiye-huajing-app-api"
        names = walk_values(data, ["InstanceName", "Name", "NamespaceName"]) if data is not None else []
        count = count_items(data, ["Instances", "InstanceList", "data"]) if data is not None else 0
        present = target in names
        return {"status": "observed" if present or count > 0 else "not_found", "parts": [f"instanceCount={count}", f"targetInstanceOrNamespacePresent={bool_text(present)}", f"targetName={target}"]}
    if operation_id in ("I03_DNS_API_DOMAIN", "I04_DNS_ASSET_DOMAIN"):
        target = "api-cn.ipgongchang.xin" if operation_id == "I03_DNS_API_DOMAIN" else "assets-cn.ipgongchang.xin"
        records = first_list(data, ["Record", "DomainRecords", "Records"]) if data is not None else []
        count = count_items(data, ["Record", "DomainRecords", "Records"]) if data is not None else 0
        record_types = []
        if isinstance(records, list):
            record_types = sorted(set(compact_text(item.get("Type", "")) for item in records if isinstance(item, dict) and item.get("Type")))
        return {"status": "observed" if count > 0 else "not_found", "parts": [f"subDomain={target}", f"recordCount={count}", f"recordTypes={','.join(record_types) if record_types else 'none'}"]}
    if operation_id == "I05_OSS_AUDIO_BUCKET":
        bucket = "meiye-huajing-service-records-production-cn"
        location = ""
        acl = ""
        storage_class = ""
        for line in combined.splitlines():
            lower = line.lower()
            if "location" in lower and not location:
                location = compact_text(line.split(":", 1)[-1])
            if "acl" in lower and not acl:
                acl = compact_text(line.split(":", 1)[-1])
            if "storage" in lower and "class" in lower and not storage_class:
                storage_class = compact_text(line.split(":", 1)[-1])
        parts = [f"bucket={bucket}", "bucketExists=true"]
        if location:
            parts.append(f"location={location}")
        if acl:
            parts.append(f"acl={acl}")
        if storage_class:
            parts.append(f"storageClass={storage_class}")
        return {"status": "observed", "parts": parts}
    if operation_id == "I06_SLS_ALERTS":
        target = "meiye-huajing-app-prod-cn"
        names = walk_values(data, ["projectName", "ProjectName", "name"]) if data is not None else []
        count = count_items(data, ["projects", "Project", "data"]) if data is not None else 0
        present = target in names
        return {"status": "observed" if present else "not_found", "parts": [f"projectCount={count}", f"targetProjectPresent={bool_text(present)}", f"targetProject={target}"]}
    if operation_id == "I07_CERT_HTTPS":
        count = count_items(data, ["CertificateOrderList", "Certificates", "data"]) if data is not None else 0
        return {"status": "observed" if count > 0 else "not_found", "parts": [f"certificateOrderCount={count}"]}
    if operation_id == "I08_RDS_POSTGRES":
        target = "meiye-huajing-app-api-production-cn"
        names = walk_values(data, ["DBInstanceDescription", "DBInstanceId", "DBInstanceName"]) if data is not None else []
        count = count_items(data, ["DBInstance", "Items", "DBInstances"]) if data is not None else 0
        present = target in names
        engines = sorted(set(walk_values(data, ["Engine"]))) if data is not None else []
        return {"status": "observed" if present or count > 0 else "not_found", "parts": [f"postgresInstanceCount={count}", f"targetInstancePresent={bool_text(present)}", f"targetInstanceName={target}", f"engines={','.join(compact_text(engine) for engine in engines[:5]) if engines else 'none'}"]}
    if operation_id == "I09_TAIR_REDIS":
        count = count_items(data, ["KVStoreInstance", "Instances", "data"]) if data is not None else 0
        return {"status": "observed" if count > 0 else "not_found", "parts": [f"redisOrTairInstanceCount={count}"]}
    return {"status": "observed", "parts": []}

def validate_command(command):
    if not command.startswith("aliyun "):
        raise RuntimeError("unsupported_command:" + command)
    if "<" in command or ">" in command:
        raise RuntimeError("placeholder_command_not_supported:" + command)
    if re.search(r"\\\\b(Create|Update|Delete|DeployApplication|StartApplication|StopApplication|GetAuthorizationToken|GetUserCertificateDetail)\\\\b|\\\\s(cp|cat|sign|rm|mb|set-acl)\\\\s", command, re.IGNORECASE):
        raise RuntimeError("unsafe_command:" + command)

def run_operation(operation):
    command = operation["command"]
    validate_command(command)
    started_at = now_iso()
    try:
        result = subprocess.run(
            shlex.split(command),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=120,
            check=False,
        )
        stdout = result.stdout or ""
        stderr = result.stderr or ""
        status = result.returncode
    except FileNotFoundError:
        stdout = ""
        stderr = "aliyun command not found"
        status = 127
    except subprocess.TimeoutExpired:
        stdout = ""
        stderr = "readonly command timed out"
        status = 124
    combined = stdout + "\\n" + stderr
    fingerprint = hashlib.sha256((command + "\\n" + combined).encode("utf-8", "replace")).hexdigest()
    stdout_lines = len([line for line in stdout.splitlines() if line.strip()])
    stderr_lines = len([line for line in stderr.splitlines() if line.strip()])
    failure_category = classify_failure(status, combined)
    resource_summary = summarize_resource(operation["id"], status, stdout, stderr)
    if contains_secret_like_value(combined):
        failure_category = "output_contains_secret_like_value_redacted"
        status = status if status != 0 else 1
        resource_summary = {"status": "blocked", "parts": []}
    summary_parts = [
        f"exit={status}",
        f"stdoutLines={stdout_lines}",
        f"stderrLines={stderr_lines}",
        f"outputSha256={fingerprint}",
    ]
    if failure_category:
        summary_parts.append(f"failureCategory={failure_category}")
    if resource_summary.get("parts"):
        summary_parts.append("resourceSummary=" + ",".join(resource_summary["parts"]))
    status_label = resource_summary.get("status") or ("observed" if status == 0 else "blocked")
    evidence = f"cloudshell_readonly_{operation['id']}_{started_at.replace(':', '-').replace('.', '-')}_{fingerprint[:16]}"
    return {
        "id": operation["id"],
        "title": operation["title"],
        "product": operation["product"],
        "readOnly": True,
        "status": status_label,
        "commandResults": [{
            "command": command,
            "executed": True,
            "exitStatus": status,
            "cloudApiCalled": True,
            "mutationPerformed": False,
            "observedAt": started_at,
            "outputSummary": "; ".join(summary_parts),
            "evidence": evidence,
        }],
        "writesTo": operation.get("writesTo", []),
        "evidence": evidence,
    }

def main():
    if os.environ.get(ALLOW_ENV) != "1":
        print(f"Refusing to run. Set {ALLOW_ENV}=1 in CloudShell for read-only Aliyun inventory.", file=sys.stderr)
        return 2
    out_file = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    operations = [run_operation(operation) for operation in OPERATIONS]
    payload = {
        "schemaVersion": 1,
        "environment": "production-cn",
        "updatedAt": now_iso(),
        "operator": "aliyun_cloudshell_readonly_collector",
        "sourcePlanCommand": SOURCE_PLAN_COMMAND,
        "notes": "Generated in Aliyun CloudShell by a read-only collector. Raw stdout/stderr are not stored or printed; only line counts, exit status, SHA-256 fingerprints, timestamps, and evidence handles are recorded.",
        "operations": operations,
    }
    rendered = json.dumps(payload, ensure_ascii=False, indent=2)
    if contains_secret_like_value(rendered):
        print("Refusing to write output: generated JSON contains secret-like values.", file=sys.stderr)
        return 3
    Path(out_file).write_text(rendered + "\\n", encoding="utf-8")
    print("MEIYE_CLOUDSHELL_READONLY_INVENTORY_JSON_BEGIN")
    print(rendered)
    print("MEIYE_CLOUDSHELL_READONLY_INVENTORY_JSON_END")
    print(f"wrote={out_file}", file=sys.stderr)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
`
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`
}

function buildBootstrapScript(args, collectorScript) {
  return `#!/usr/bin/env bash
set -euo pipefail

cat > ${shellQuote(args.cloudshellScriptFile)} <<'PY'
${collectorScript}
PY

chmod 700 ${shellQuote(args.cloudshellScriptFile)}
${ALLOW_ENV}=1 python3 ${shellQuote(args.cloudshellScriptFile)} ${shellQuote(args.cloudshellOutputFile)}
`
}

function buildReport(args, template, extraction, script, bootstrap) {
  const report = {
    ok: extraction.blockers.length === 0,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    currentScope: "backend_aliyun_only",
    executionMode: "generator_only",
    templateFile: args.templateFile,
    scriptFile: args.out,
    bootstrapFile: args.bootstrap,
    cloudShellScriptFile: args.cloudshellScriptFile,
    cloudShellOutputFile: args.cloudshellOutputFile,
    containsValues: false,
    readOnlyOnly: true,
    cloudApiCalled: false,
    mutationPerformed: false,
    allowEnv: ALLOW_ENV,
    operations: extraction.operations.map((operation) => ({
      id: operation.id,
      product: operation.product,
      command: operation.command,
      writesTo: operation.writesTo,
    })),
    summary: {
      operations: extraction.operations.length,
      commands: extraction.operations.length,
      forbiddenMutationCommands: 0,
      sourcePlanCommand: template.sourcePlanCommand || "",
    },
    blockers: extraction.blockers,
    clipboardCommand: "corepack pnpm aliyun:cloudshell:collector:bootstrap | pbcopy",
    runInstructions: [
      "Run locally: corepack pnpm aliyun:cloudshell:collector:bootstrap | pbcopy",
      "Paste the clipboard content into Aliyun CloudShell only after the terminal prompt is connected.",
      "The pasted bootstrap writes the Python collector inside CloudShell and runs it with the explicit allow env.",
      "Copy only the JSON between MEIYE_CLOUDSHELL_READONLY_INVENTORY_JSON_BEGIN/END into deploy/aliyun-production-cn.cloud-inventory-results.local.json.",
      "Do not copy raw Aliyun CLI stdout/stderr, AccessKeySecret, STS token, cookies, registry password, certificate private key, or database password.",
    ],
    safetyBoundary: [
      "This generator never calls Aliyun cloud APIs.",
      "The generated bootstrap only writes the collector file inside CloudShell and runs the same read-only collector.",
      "The generated CloudShell collector refuses to run unless the explicit allow env is set.",
      "The generated CloudShell collector runs only allowlisted read-only commands from the inventory-results example file.",
      "The generated CloudShell collector stores and prints no raw stdout/stderr.",
    ],
  }
  const secretMatches = findSecretLikeValues({ report, script, bootstrap })
  report.secretLeakCheck = {
    ok: secretMatches.length === 0,
    matches: secretMatches,
  }
  if (secretMatches.length) {
    report.ok = false
    report.containsValues = true
    report.blockers.push(`contains_secret_like_values:${secretMatches.join(",")}`)
  }
  return report
}

function renderMarkdown(report) {
  return [
    "# 阿里云 CloudShell 只读采集器",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- currentScope: ${report.currentScope}`,
    `- executionMode: ${report.executionMode}`,
    `- scriptFile: ${report.scriptFile}`,
    `- bootstrapFile: ${report.bootstrapFile}`,
    `- cloudShellScriptFile: ${report.cloudShellScriptFile}`,
    `- cloudShellOutputFile: ${report.cloudShellOutputFile}`,
    `- allowEnv: ${report.allowEnv}`,
    `- cloudApiCalled: ${report.cloudApiCalled}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- containsValues: ${report.containsValues}`,
    `- operations: ${report.summary.operations}`,
    `- secretLeakCheck: ${report.secretLeakCheck.ok}`,
    "",
    "## 运行方式",
    "",
    `- clipboardCommand: \`${report.clipboardCommand}\``,
    ...report.runInstructions.map((item) => `- ${item}`),
    "",
    "## 命令清单",
    "",
    ...report.operations.map((operation) => `- ${operation.id}: \`${operation.command}\``),
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
    "  node scripts/generate-aliyun-cloudshell-readonly-collector.mjs [--out /tmp/collector.py] [--bootstrap /tmp/bootstrap.sh] [--report report.json] [--markdown report.md] [--print-script] [--print-bootstrap]",
    "",
    "Generates a self-contained Python collector for Aliyun CloudShell read-only inventory.",
    "The generator never calls Aliyun APIs. The generated collector requires MEIYE_ALLOW_ALIYUN_CLOUDSHELL_READONLY=1.",
  ].join("\n"))
}

function main() {
  const args = parseArgs(process.argv)
  const template = readJson(args.templateFile)
  const extraction = extractOperations(template)
  const script = buildCollectorScript(extraction.operations)
  const bootstrap = buildBootstrapScript(args, script)
  writeText(args.out, script, 0o700)
  writeText(args.bootstrap, bootstrap, 0o700)
  const report = buildReport(args, template, extraction, script, bootstrap)
  const output = `${JSON.stringify(report, null, 2)}\n`
  if (args.report) writeText(args.report, output)
  if (args.markdown) writeText(args.markdown, renderMarkdown(report))
  if (args.printBootstrap) process.stdout.write(bootstrap)
  else if (args.printScript) process.stdout.write(script)
  else process.stdout.write(output)
  if (!report.ok) process.exit(1)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
