#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const APP_ENV_FILE = resolve(__dirname, "../../../.env.production-cn.local")

const REQUIRED_KEYS = [
  "APP_ENV",
  "APP_REGION",
  "APP_API_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WECHAT_LOGIN_SECRET",
  "WECHAT_OPEN_APP_ID",
  "WECHAT_OPEN_APP_SECRET",
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_REGION",
  "SERVICE_RECORD_OSS_PREFIX",
  "DASHSCOPE_API_KEY",
  "BAILIAN_ASR_MODEL",
  "SERVICE_RECORD_ASR_PROVIDER",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "VOLC_SPEECH_APP_ID",
  "VOLC_SPEECH_ACCESS_TOKEN",
]

const OPTIONAL_KEYS = [
  "APP_ASSET_BASE_URL",
  "PRIVACY_POLICY_URL",
  "TERMS_URL",
  "DATABASE_URL_CN",
  "REDIS_URL_CN",
  "BAILIAN_ASR_LANGUAGE_HINTS",
  "BAILIAN_ASR_DIARIZATION_ENABLED",
  "BAILIAN_ASR_SPEAKER_COUNT",
  "BAILIAN_ASR_AUDIO_URL_EXPIRES_SECONDS",
  "SERVICE_RECORD_DEEPSEEK_API_KEY",
  "SERVICE_RECORD_DEEPSEEK_BASE_URL",
  "SERVICE_RECORD_DEEPSEEK_MODEL",
  "VOLC_SPEECH_SECRET_KEY",
  "VOLC_ASR_RESOURCE_ID",
  "VOLC_ASR_FLASH_RESOURCE_ID",
  "VOLC_TTS_CLUSTER",
  "VOLC_TTS_VOICE_TYPE",
  "VOLC_TTS_LANGUAGE",
  "VOICE_COACH_ENABLED",
  "VOICE_COACH_ALLOW_USER_IDS",
  "VOICE_COACH_MAX_TURNS",
  "VOICE_COACH_REPLY_PROVIDER",
  "VOICE_COACH_ANALYSIS_PROVIDER",
  "VOICE_COACH_FIRST_TURN_MODE",
  "VOICE_COACH_FIRST_TTS_MODE",
  "CRON_SECRET",
  "CREDITS_IP_SALT",
  "ADMIN_EMAILS",
  "ADMIN_USER_IDS",
  "WECHAT_OPEN_APP_REVIEW_STATUS",
  "APIMART_API_KEY",
  "APIMART_BASE_URL",
  "APIMART_MODEL",
  "APIMART_IMAGE_API_KEY",
  "APIMART_IMAGE_BASE_URL",
  "APIMART_IMAGE_MODEL",
  "WECHAT_MINI_APPID",
  "WECHAT_MINI_SECRET",
]

function parseArgs(argv) {
  const args = {
    envFile: APP_ENV_FILE,
    writePath: "",
    writePlanPath: "",
    allowTodo: false,
    includeTodoInWrite: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
      continue
    }
    if (arg === "--write") {
      args.writePath = resolveValue(argv[++index], "--write")
      continue
    }
    if (arg === "--write-plan") {
      args.writePlanPath = resolveValue(argv[++index], "--write-plan")
      continue
    }
    if (arg === "--allow-todo") {
      args.allowTodo = true
      continue
    }
    if (arg === "--include-todo-in-write") {
      args.includeTodoInWrite = true
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

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) throw new Error(`env_file_not_found:${filePath}`)
  const env = new Map()
  const raw = readFileSync(filePath, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    env.set(match[1], unquote(match[2]))
  }
  return env
}

function unquote(value) {
  const trimmed = String(value || "").trim()
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function isFilled(value) {
  const text = String(value || "").trim()
  return Boolean(text && text !== "\"\"" && text !== "''")
}

function isTodo(value) {
  return String(value || "").trim().startsWith("TODO_")
}

function summarize(env, allowTodo) {
  const required = REQUIRED_KEYS.map((key) => ({
    key,
    status: statusOf(env.get(key), allowTodo),
  }))
  const optional = OPTIONAL_KEYS.map((key) => ({
    key,
    status: statusOf(env.get(key), true),
  }))
  const missingRequired = required.filter((item) => item.status !== "ready")
  const readyCount = [...required, ...optional].filter((item) => item.status === "ready").length
  const todoCount = [...required, ...optional].filter((item) => item.status === "todo").length
  const emptyCount = [...required, ...optional].filter((item) => item.status === "empty").length
  return {
    readyCount,
    todoCount,
    emptyCount,
    required,
    optional,
    missingRequired,
  }
}

function statusOf(value, allowTodo) {
  if (!isFilled(value)) return "empty"
  if (isTodo(value)) return allowTodo ? "todo" : "todo_blocking"
  return "ready"
}

function writeImportFile(env, writePath, opts = {}) {
  const allKeys = Array.from(new Set([...REQUIRED_KEYS, ...OPTIONAL_KEYS])).sort()
  const payload = allKeys
    .filter((key) => isFilled(env.get(key)))
    .filter((key) => opts.includeTodoInWrite || !isTodo(env.get(key)))
    .map((key) => ({
      name: key,
      value: env.get(key),
    }))
  writeFileSync(writePath, JSON.stringify(payload, null, 2), { mode: 0o600 })
  return payload.length
}

function writeImportPlan(env, writePath) {
  const plan = buildImportPlan(env)
  writeFileSync(writePath, JSON.stringify(plan, null, 2), { mode: 0o600 })
  return plan
}

function buildImportPlan(env) {
  const variables = [
    ...REQUIRED_KEYS.map((key) => buildPlanItem(env, key, true)),
    ...OPTIONAL_KEYS.map((key) => buildPlanItem(env, key, false)),
  ]
  return {
    generatedAt: new Date().toISOString(),
    target: "aliyun-production-cn-runtime-env",
    containsValues: false,
    importPolicy: "Import ready values from the local env file into Aliyun SAE/ECS/KMS/Secrets Manager. Do not paste values into docs or commit them.",
    summary: {
      total: variables.length,
      requiredTotal: variables.filter((item) => item.required).length,
      requiredReady: variables.filter((item) => item.required && item.status === "ready").length,
      requiredBlocking: variables.filter((item) => item.required && item.status !== "ready").map((item) => item.name),
      readyTotal: variables.filter((item) => item.status === "ready").length,
      todoTotal: variables.filter((item) => item.status === "todo").length,
      emptyTotal: variables.filter((item) => item.status === "empty").length,
      secretOrSensitiveTotal: variables.filter((item) => item.sensitivity !== "public").length,
    },
    variables,
  }
}

function buildPlanItem(env, key, required) {
  const status = rawStatusOf(env.get(key))
  return {
    name: key,
    required,
    status,
    sensitivity: sensitivityOf(key),
    source: sourceOf(key),
    action: actionFor(key, status, required),
  }
}

function rawStatusOf(value) {
  if (!isFilled(value)) return "empty"
  if (isTodo(value)) return "todo"
  return "ready"
}

function sensitivityOf(key) {
  if (/^(APP_ENV|APP_REGION|APP_API_BASE_URL|APP_ASSET_BASE_URL|NEXT_PUBLIC_SITE_URL|PRIVACY_POLICY_URL|TERMS_URL|SERVICE_RECORD_OSS_PREFIX|BAILIAN_ASR_MODEL|BAILIAN_ASR_LANGUAGE_HINTS|BAILIAN_ASR_DIARIZATION_ENABLED|BAILIAN_ASR_SPEAKER_COUNT|BAILIAN_ASR_AUDIO_URL_EXPIRES_SECONDS|SERVICE_RECORD_ASR_PROVIDER|DEEPSEEK_BASE_URL|DEEPSEEK_MODEL|SERVICE_RECORD_DEEPSEEK_BASE_URL|SERVICE_RECORD_DEEPSEEK_MODEL|VOLC_ASR_RESOURCE_ID|VOLC_ASR_FLASH_RESOURCE_ID|VOLC_TTS_CLUSTER|VOLC_TTS_VOICE_TYPE|VOLC_TTS_LANGUAGE|VOICE_COACH_ENABLED|VOICE_COACH_MAX_TURNS|VOICE_COACH_REPLY_PROVIDER|VOICE_COACH_ANALYSIS_PROVIDER|VOICE_COACH_FIRST_TURN_MODE|VOICE_COACH_FIRST_TTS_MODE|WECHAT_OPEN_APP_REVIEW_STATUS|APIMART_BASE_URL|APIMART_MODEL|APIMART_IMAGE_BASE_URL|APIMART_IMAGE_MODEL)$/.test(key)) {
    return "public"
  }
  if (/(_ID|_USER_IDS|_EMAILS|_BUCKET|_REGION|DATABASE_URL_CN|REDIS_URL_CN|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|WECHAT_MINI_APPID|WECHAT_OPEN_APP_ID)$/.test(key)) {
    return "identifier_or_connection"
  }
  return "secret"
}

function sourceOf(key) {
  if (/^APP_|^NEXT_PUBLIC_SITE_URL|^PRIVACY_POLICY_URL|^TERMS_URL/.test(key)) return "阿里云域名、备案、HTTPS 和 APP production-cn 配置"
  if (/SUPABASE|DATABASE_URL_CN|REDIS_URL_CN/.test(key)) return "现有 Vercel/Supabase 桥接配置；RDS/Redis 后续迁移时替换"
  if (/^WECHAT_OPEN_/.test(key)) return "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App"
  if (/^WECHAT_MINI_/.test(key)) return "微信公众平台小程序后台，仅用于兼容旧链路，不能替代 APP 登录"
  if (/^ALIYUN_OSS|SERVICE_RECORD_OSS_PREFIX/.test(key)) return "阿里云 OSS Bucket、RAM 最小权限策略和服务记录音频前缀"
  if (/DASHSCOPE|BAILIAN/.test(key)) return "阿里云百炼 / DashScope 控制台"
  if (/DEEPSEEK|SERVICE_RECORD_DEEPSEEK/.test(key)) return "DeepSeek 控制台或现有 Vercel 环境变量"
  if (/^VOLC_/.test(key)) return "火山引擎语音控制台或现有 Vercel 环境变量"
  if (/^APIMART/.test(key)) return "旧内容供应商兼容配置；桥接期保留"
  if (/CRON_SECRET|CREDITS_IP_SALT|ADMIN_/.test(key)) return "后端运维自定义值；从现有 Vercel 配置或管理员名单确认"
  if (/VOICE_COACH/.test(key)) return "语音陪练运行策略；从现有 Vercel 配置迁移"
  return "现有 production 配置或对应云服务控制台"
}

function actionFor(key, status, required) {
  if (status === "ready") {
    return sensitivityOf(key) === "public"
      ? "导入阿里云运行环境变量"
      : "通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入"
  }
  if (key === "WECHAT_OPEN_APP_ID" || key === "WECHAT_OPEN_APP_SECRET") {
    return "等待微信开放平台移动应用审核通过后获取并导入"
  }
  if (required) return "补齐后才能进入 production-cn 发布门禁"
  return "可后置；功能启用或正式迁移时再补齐"
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/prepare-aliyun-runtime-env.mjs [--env-file path] [--allow-todo] [--write /tmp/env.json] [--write-plan /tmp/env-plan.json]",
    "",
    "Default mode only validates variable names and never prints values.",
    "--write emits a value-bearing JSON file for manual import; write it outside the repo or delete it after use.",
    "--write-plan emits a value-free Aliyun console import checklist with variable names, status, sensitivity, source, and action.",
    "--include-todo-in-write keeps TODO placeholders in the value-bearing JSON. Defaults to excluding TODOs.",
  ].join("\n"))
}

function main() {
  const args = parseArgs(process.argv)
  const env = parseEnvFile(args.envFile)
  const summary = summarize(env, args.allowTodo)
  const result = {
    envFile: args.envFile,
    requiredReady: summary.required.filter((item) => item.status === "ready").length,
    requiredTotal: summary.required.length,
    readyCount: summary.readyCount,
    todoCount: summary.todoCount,
    emptyCount: summary.emptyCount,
    blocking: summary.missingRequired.map((item) => item.key),
    todo: [...summary.required, ...summary.optional]
      .filter((item) => item.status === "todo" || item.status === "todo_blocking")
      .map((item) => item.key),
  }

  if (args.writePath) {
    if (!isAbsolute(args.writePath)) {
      throw new Error("write_path_must_be_absolute")
    }
    if (!existsSync(dirname(args.writePath))) {
      throw new Error(`write_dir_not_found:${dirname(args.writePath)}`)
    }
    result.writtenVariables = writeImportFile(env, args.writePath, {
      includeTodoInWrite: args.includeTodoInWrite,
    })
    result.writePath = args.writePath
  }
  if (args.writePlanPath) {
    if (!isAbsolute(args.writePlanPath)) {
      throw new Error("write_plan_path_must_be_absolute")
    }
    if (!existsSync(dirname(args.writePlanPath))) {
      throw new Error(`write_plan_dir_not_found:${dirname(args.writePlanPath)}`)
    }
    const plan = writeImportPlan(env, args.writePlanPath)
    result.writePlanPath = args.writePlanPath
    result.planVariables = plan.summary.total
    result.planRequiredBlocking = plan.summary.requiredBlocking
  }

  console.log(JSON.stringify(result, null, 2))
  if (summary.missingRequired.length && !args.allowTodo) process.exit(1)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
