#!/usr/bin/env node

import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_APP_ROOT = resolve(WORKSPACE_ROOT, "meiye-huajing-app")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_OUT_FILE = "/tmp/meiye-app-production-cn-build-config.generated.ts"

function parseArgs(argv) {
  const args = {
    appRoot: DEFAULT_APP_ROOT,
    envFile: DEFAULT_ENV_FILE,
    skipTemplate: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--app-root") {
      args.appRoot = resolveValue(argv[++index], "--app-root")
      continue
    }
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
      continue
    }
    if (arg === "--skip-template") {
      args.skipTemplate = true
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
  return resolve(process.cwd(), value)
}

function runGenerator(appRoot, args) {
  if (!existsSync(appRoot)) {
    return {
      ok: false,
      status: null,
      blockers: ["app_root_missing"],
      error: appRoot,
    }
  }
  const scriptPath = resolve(appRoot, "scripts/generate-app-runtime-config.mjs")
  if (!existsSync(scriptPath)) {
    return {
      ok: false,
      status: null,
      blockers: ["app_runtime_config_generator_missing"],
      error: scriptPath,
    }
  }
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: appRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  })
  const parsed = parseJson(result.stdout)
  const stderr = trimLines(result.stderr)
  const stdout = parsed ? [] : trimLines(result.stdout)
  return {
    ok: result.status === 0,
    status: result.status,
    ...sanitizeParsedOutput(parsed),
    blockers: result.status === 0 ? [] : inferBlockers(stderr, stdout),
    stderr,
    stdout,
  }
}

function parseJson(value) {
  const text = String(value || "").trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function sanitizeParsedOutput(parsed) {
  if (!parsed || typeof parsed !== "object") return {}
  return {
    envFile: parsed.envFile || "",
    outFile: parsed.outFile || "",
    checkOnly: parsed.checkOnly === true,
    environment: parsed.environment || "",
    apiBaseUrl: parsed.apiBaseUrl || "",
    assetBaseUrl: parsed.assetBaseUrl || "",
    privacyPolicyUrl: parsed.privacyPolicyUrl || "",
    termsUrl: parsed.termsUrl || "",
    wroteKeys: Array.isArray(parsed.wroteKeys) ? parsed.wroteKeys : [],
  }
}

function trimLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function inferBlockers(stderr, stdout) {
  const lines = [...stderr, ...stdout]
  return lines.length ? lines : ["app_runtime_config_check_failed"]
}

function main() {
  const args = parseArgs(process.argv)
  const productionRuntime = runGenerator(args.appRoot, [
    "--env-file",
    args.envFile,
    "--out",
    DEFAULT_OUT_FILE,
    "--require-production-ready",
    "--check",
  ])
  const template = args.skipTemplate
    ? { ok: true, skipped: true, blockers: [] }
    : runGenerator(args.appRoot, [
      "--env-file",
      resolve(args.appRoot, ".env.production-cn.example"),
      "--out",
      DEFAULT_OUT_FILE,
      "--strict-source-keys",
      "--check",
    ])

  const blockers = [
    ...productionRuntime.blockers.map((item) => `productionRuntime:${item}`),
    ...template.blockers.map((item) => `template:${item}`),
  ]

  const result = {
    ok: productionRuntime.ok === true && template.ok === true,
    containsSecretValues: false,
    appRoot: args.appRoot,
    envFile: args.envFile,
    productionRuntime,
    template,
    blockers,
  }

  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-app-production-runtime-config.mjs [--app-root ../meiye-huajing-app] [--env-file ../.env.production-cn.local]",
    "",
    "Runs the React Native APP runtime config generator in --check mode.",
    "The output contains only non-secret APP runtime fields and variable names.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
