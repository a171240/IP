#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { OPTIONAL_KEYS, REQUIRED_KEYS } from "./prepare-aliyun-runtime-env.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const PROJECT_FILE = resolve(BACKEND_ROOT, ".vercel/project.json")

function parseArgs(argv) {
  const project = readProject()
  const args = {
    environment: "production",
    inputPath: "",
    writeReportPath: "",
    scope: project?.orgId || "",
    projectName: project?.projectName || "",
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--environment") {
      args.environment = requireValue(argv[++index], "--environment")
      continue
    }
    if (arg === "--input") {
      args.inputPath = resolveValue(argv[++index], "--input")
      continue
    }
    if (arg === "--write-report") {
      args.writeReportPath = resolveValue(argv[++index], "--write-report")
      continue
    }
    if (arg === "--scope") {
      args.scope = requireValue(argv[++index], "--scope")
      continue
    }
    if (arg === "--project") {
      args.projectName = requireValue(argv[++index], "--project")
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

function readProject() {
  if (!existsSync(PROJECT_FILE)) return null
  return JSON.parse(readFileSync(PROJECT_FILE, "utf8"))
}

function requireValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return value
}

function resolveValue(value, name) {
  return resolve(process.cwd(), requireValue(value, name))
}

function readVercelEnvList(args) {
  if (args.inputPath) return readFileSync(args.inputPath, "utf8")
  if (!args.scope) throw new Error("missing_scope:pass --scope or keep .vercel/project.json")
  const result = spawnSync("corepack", [
    "pnpm",
    "dlx",
    "vercel@latest",
    "env",
    "ls",
    args.environment,
    "--scope",
    args.scope,
    "--format",
    "json",
    "--non-interactive",
  ], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`vercel_env_ls_failed:${result.status}\n${result.stderr || result.stdout}`)
  }
  return result.stdout
}

function parseVercelJson(raw) {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end < start) throw new Error("vercel_env_json_not_found")
  const payload = JSON.parse(raw.slice(start, end + 1))
  if (!Array.isArray(payload.envs)) throw new Error("vercel_envs_array_missing")
  return payload.envs
}

function buildReport(args, envs) {
  const plannedKeys = new Set([...REQUIRED_KEYS, ...OPTIONAL_KEYS])
  const envNames = new Set(envs.map((item) => item.key).filter(Boolean))
  const productionEnvNames = new Set(
    envs
      .filter((item) => Array.isArray(item.target) && item.target.includes(args.environment))
      .map((item) => item.key)
      .filter(Boolean),
  )
  const requiredMissing = REQUIRED_KEYS.filter((key) => !productionEnvNames.has(key))
  const optionalMissing = OPTIONAL_KEYS.filter((key) => !productionEnvNames.has(key))
  const extraProductionKeys = Array.from(productionEnvNames).filter((key) => !plannedKeys.has(key)).sort()
  const knownBridgeKeys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "WECHAT_LOGIN_SECRET",
    "WECHAT_MINI_APPID",
    "WECHAT_MINI_SECRET",
    "ALIYUN_OSS_ACCESS_KEY_ID",
    "ALIYUN_OSS_ACCESS_KEY_SECRET",
    "ALIYUN_OSS_BUCKET",
    "ALIYUN_OSS_REGION",
    "SERVICE_RECORD_OSS_PREFIX",
    "DASHSCOPE_API_KEY",
    "DEEPSEEK_API_KEY",
    "VOLC_SPEECH_APP_ID",
    "VOLC_SPEECH_ACCESS_TOKEN",
  ]
  return {
    generatedAt: new Date().toISOString(),
    source: args.inputPath ? args.inputPath : "vercel env ls --format json",
    containsValues: false,
    project: args.projectName || "linked-vercel-project",
    scope: args.scope || "linked-scope",
    environment: args.environment,
    totals: {
      vercelEntries: envs.length,
      uniqueNames: envNames.size,
      productionNames: productionEnvNames.size,
      requiredTotal: REQUIRED_KEYS.length,
      requiredPresentInVercelProduction: REQUIRED_KEYS.length - requiredMissing.length,
      optionalTotal: OPTIONAL_KEYS.length,
      optionalPresentInVercelProduction: OPTIONAL_KEYS.length - optionalMissing.length,
      extraProductionKeys: extraProductionKeys.length,
    },
    requiredMissingInVercelProduction: requiredMissing,
    optionalMissingInVercelProduction: optionalMissing,
    bridgeKeysPresentInVercelProduction: knownBridgeKeys.filter((key) => productionEnvNames.has(key)),
    appSpecificKeysMissingInVercelProduction: requiredMissing.filter(isAppProductionCnOwnedKey),
    extraProductionKeys,
    notes: [
      "Vercel env ls returns names, target environments, and encrypted/sensitive metadata only; this report must not include values.",
      "WECHAT_OPEN_APP_ID and WECHAT_OPEN_APP_SECRET come from WeChat Open Platform mobile app approval, not from the mini program credentials.",
      "APP production-cn domain, legal URL, and WeChat Open Platform variables are new Aliyun/App-release values and may be absent from the legacy Vercel project by design.",
    ],
  }
}

function isAppProductionCnOwnedKey(key) {
  return (
    /^APP_/.test(key) ||
    key === "NEXT_PUBLIC_SITE_URL" ||
    key === "PRIVACY_POLICY_URL" ||
    key === "TERMS_URL" ||
    /^WECHAT_OPEN_/.test(key)
  )
}

function writeReport(report, writePath) {
  if (!isAbsolute(writePath)) throw new Error("write_report_path_must_be_absolute")
  if (!existsSync(dirname(writePath))) throw new Error(`write_report_dir_not_found:${dirname(writePath)}`)
  writeFileSync(writePath, JSON.stringify(report, null, 2), { mode: 0o600 })
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-vercel-env-coverage.mjs [--environment production] [--scope team-or-slug] [--input /tmp/vercel-env.json] [--write-report /tmp/coverage.json]",
    "",
    "Reads Vercel env metadata only and compares variable names against the Aliyun production-cn import plan.",
    "The report never includes environment variable values.",
  ].join("\n"))
}

function main() {
  const args = parseArgs(process.argv)
  const raw = readVercelEnvList(args)
  const report = buildReport(args, parseVercelJson(raw))
  if (args.writeReportPath) writeReport(report, args.writeReportPath)
  console.log(JSON.stringify(report, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
