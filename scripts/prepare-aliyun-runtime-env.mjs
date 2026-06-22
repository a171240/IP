#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const APP_ENV_FILE = resolve(__dirname, "../../../.env.production-cn.local")

export const REQUIRED_KEYS = [
  "APP_ENV",
  "APP_REGION",
  "APP_API_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "PRIVACY_POLICY_URL",
  "TERMS_URL",
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

export const OPTIONAL_KEYS = [
  "APP_ASSET_BASE_URL",
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
  "APPLE_TEAM_ID",
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

export function parseEnvFile(filePath) {
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

export function summarize(env, allowTodo) {
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

export function buildImportPlan(env) {
  const variables = [
    ...REQUIRED_KEYS.map((key) => buildPlanItem(env, key, true)),
    ...OPTIONAL_KEYS.map((key) => buildPlanItem(env, key, false)),
  ]
  return {
    generatedAt: new Date().toISOString(),
    target: "aliyun-production-cn-runtime-env",
    containsValues: false,
    importPolicy: "Import ready values from the local env file into Aliyun SAE/KMS/Secrets Manager. Do not paste values into docs or commit them.",
    summary: {
      total: variables.length,
      requiredTotal: variables.filter((item) => item.required).length,
      requiredReady: variables.filter((item) => item.required && item.status === "ready").length,
      requiredBlocking: variables.filter((item) => item.required && item.status !== "ready").map((item) => item.name),
      readyTotal: variables.filter((item) => item.status === "ready").length,
      todoTotal: variables.filter((item) => item.status === "todo").length,
      emptyTotal: variables.filter((item) => item.status === "empty").length,
      secretOrSensitiveTotal: variables.filter((item) => item.sensitivity !== "public").length,
      sourceMetadataReady: variables.filter((item) => item.source && item.consolePath && item.obtain && item.importTarget).length,
    },
    variables,
  }
}

function buildPlanItem(env, key, required) {
  const status = rawStatusOf(env.get(key))
  const metadata = sourceMetadataOf(key)
  return {
    name: key,
    required,
    status,
    sensitivity: sensitivityOf(key),
    source: metadata.source,
    sourceCategory: metadata.category,
    owner: metadata.owner,
    consolePath: metadata.consolePath,
    obtain: metadata.obtain,
    importTarget: metadata.importTarget,
    cloudConfirmationKey: metadata.cloudConfirmationKey,
    notes: metadata.notes,
    action: actionFor(key, status, required),
  }
}

function rawStatusOf(value) {
  if (!isFilled(value)) return "empty"
  if (isTodo(value)) return "todo"
  return "ready"
}

function sensitivityOf(key) {
  if (/^(APP_ENV|APP_REGION|APP_API_BASE_URL|APP_ASSET_BASE_URL|NEXT_PUBLIC_SITE_URL|PRIVACY_POLICY_URL|TERMS_URL|SERVICE_RECORD_OSS_PREFIX|BAILIAN_ASR_MODEL|BAILIAN_ASR_LANGUAGE_HINTS|BAILIAN_ASR_DIARIZATION_ENABLED|BAILIAN_ASR_SPEAKER_COUNT|BAILIAN_ASR_AUDIO_URL_EXPIRES_SECONDS|SERVICE_RECORD_ASR_PROVIDER|DEEPSEEK_BASE_URL|DEEPSEEK_MODEL|SERVICE_RECORD_DEEPSEEK_BASE_URL|SERVICE_RECORD_DEEPSEEK_MODEL|VOLC_ASR_RESOURCE_ID|VOLC_ASR_FLASH_RESOURCE_ID|VOLC_TTS_CLUSTER|VOLC_TTS_VOICE_TYPE|VOLC_TTS_LANGUAGE|VOICE_COACH_ENABLED|VOICE_COACH_MAX_TURNS|VOICE_COACH_REPLY_PROVIDER|VOICE_COACH_ANALYSIS_PROVIDER|VOICE_COACH_FIRST_TURN_MODE|VOICE_COACH_FIRST_TTS_MODE|WECHAT_OPEN_APP_REVIEW_STATUS|APPLE_TEAM_ID|APIMART_BASE_URL|APIMART_MODEL|APIMART_IMAGE_BASE_URL|APIMART_IMAGE_MODEL)$/.test(key)) {
    return "public"
  }
  if (/(_ID|_USER_IDS|_EMAILS|_BUCKET|_REGION|DATABASE_URL_CN|REDIS_URL_CN|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|WECHAT_MINI_APPID|WECHAT_OPEN_APP_ID)$/.test(key)) {
    return "identifier_or_connection"
  }
  return "secret"
}

function sourceMetadataOf(key) {
  if (key === "APP_ENV") {
    return metadata({
      category: "runtime",
      owner: "后端发布操作员",
      consolePath: "本仓库 .env.production-cn.example / 阿里云 SAE 环境变量",
      obtain: "固定填写 production-cn，并在阿里云运行环境中保持一致。",
      importTarget: "阿里云 SAE plain env",
      cloudConfirmationKey: "envImport",
      notes: "非密钥。",
    })
  }
  if (key === "APP_REGION") {
    return metadata({
      category: "runtime",
      owner: "阿里云操作员",
      consolePath: "阿里云控制台 -> SAE 应用地域",
      obtain: "使用 production-cn 后端实际部署地域；当前建议 cn-hangzhou。",
      importTarget: "阿里云 SAE plain env",
      cloudConfirmationKey: "runtime",
      notes: "非密钥。",
    })
  }
  if (key === "APP_API_BASE_URL" || key === "NEXT_PUBLIC_SITE_URL") {
    return metadata({
      category: "domain",
      owner: "阿里云域名/证书操作员",
      consolePath: "阿里云控制台 -> 云解析 DNS / SAE 或 SLB 入口 / 数字证书管理服务",
      obtain: "配置 api-cn.ipgongchang.xin 到公网可访问的阿里云后端入口并启用 HTTPS 后填写。",
      importTarget: "阿里云 SAE plain env",
      cloudConfirmationKey: "apiDomainHttps",
      notes: "不能使用 Vercel、localhost、example 或 198.18.0.x 特殊用途地址。",
    })
  }
  if (key === "APP_ASSET_BASE_URL") {
    return metadata({
      category: "asset_domain",
      owner: "阿里云 OSS/CDN 操作员",
      consolePath: "阿里云控制台 -> OSS Bucket / CDN 或 OSS 绑定域名 / 数字证书管理服务",
      obtain: "配置 assets-cn.ipgongchang.xin 到 OSS/CDN 静态资源入口并启用 HTTPS 后填写。",
      importTarget: "阿里云 SAE plain env",
      cloudConfirmationKey: "assetDomainHttps",
      notes: "非必填；填写后需要 assets-cn DNS、HTTPS 和 ICP 证据；OSS Bucket CORS/RAM 证据由 oss 项单独确认。",
    })
  }
  if (key === "PRIVACY_POLICY_URL" || key === "TERMS_URL") {
    return metadata({
      category: "legal_links",
      owner: "产品/法务/发布操作员",
      consolePath: "自有备案 HTTPS 域名上的正式协议页面",
      obtain: "先运行 corepack pnpm aliyun:legal:check 确认 /privacy 与 /terms 页面存在；运营者复核文本后，建议填写 https://api-cn.ipgongchang.xin/privacy 与 https://api-cn.ipgongchang.xin/terms 或对应 app-cn 正式域名。",
      importTarget: "阿里云 SAE plain env",
      cloudConfirmationKey: "envImport",
      notes: "不能是 TODO、localhost、本地文件、临时预览或仅 Vercel 预览。",
    })
  }
  if (/SUPABASE/.test(key)) {
    return metadata({
      category: "bridge_database",
      owner: "Vercel/Supabase 操作员",
      consolePath: "Vercel 项目 ip -> Settings -> Environment Variables；Supabase 项目 -> Settings -> API",
      obtain: "从现有 Vercel production 或 Supabase 项目读取对应变量值，桥接期迁入阿里云运行环境。",
      importTarget: sensitivityOf(key) === "public" ? "阿里云 SAE plain env" : "阿里云 KMS/Secrets Manager/SAE secret env",
      cloudConfirmationKey: "envImport",
      notes: "桥接期仍使用 Supabase；最终 production-cn RDS 迁移另行处理。",
    })
  }
  if (key === "DATABASE_URL_CN") {
    return metadata({
      category: "future_rds",
      owner: "阿里云 RDS 操作员",
      consolePath: "阿里云控制台 -> RDS PostgreSQL -> 数据库连接",
      obtain: "创建或确认 production-cn RDS PostgreSQL 后生成连接串；第一版桥接部署可后置。",
      importTarget: "阿里云 KMS/Secrets Manager/SAE secret env",
      cloudConfirmationKey: "envImport",
      notes: "可后置；不能把存在该变量等同于完成数据层迁移。",
    })
  }
  if (key === "REDIS_URL_CN") {
    return metadata({
      category: "future_cache",
      owner: "阿里云 Tair/Redis 操作员",
      consolePath: "阿里云控制台 -> Tair/Redis -> 实例连接",
      obtain: "确认是否启用 production-cn Redis/Tair；第一版桥接部署可后置。",
      importTarget: "阿里云 KMS/Secrets Manager/SAE secret env",
      cloudConfirmationKey: "envImport",
      notes: "可后置。",
    })
  }
  if (key === "WECHAT_LOGIN_SECRET") {
    return metadata({
      category: "app_auth",
      owner: "后端发布操作员",
      consolePath: "本机安全随机生成 / 阿里云 KMS 或 Secrets Manager",
      obtain: "生成后端内部 APP 登录会话签名密钥；它不是微信开放平台 AppSecret。",
      importTarget: "阿里云 KMS/Secrets Manager/SAE secret env",
      cloudConfirmationKey: "envImport",
      notes: "密钥，不能提交或写入镜像。",
    })
  }
  if (/^WECHAT_OPEN_/.test(key)) {
    return metadata({
      category: "wechat_open_platform",
      owner: "用户/微信开放平台操作员",
      consolePath: "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App",
      obtain: "移动应用审核通过后读取 AppID/AppSecret；审核状态填 WECHAT_OPEN_APP_REVIEW_STATUS。",
      importTarget: key === "WECHAT_OPEN_APP_REVIEW_STATUS" ? "阿里云 SAE plain env" : "阿里云 KMS/Secrets Manager/SAE secret env",
      cloudConfirmationKey: "wechatOpenPlatform",
      notes: "小程序 AppID/Secret 不能替代 APP 微信登录。",
    })
  }
  if (key === "APPLE_TEAM_ID") {
    return metadata({
      category: "ios_universal_link",
      owner: "Apple Developer / iOS 发布操作员",
      consolePath: "Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID",
      obtain: "确认 10 位 Team ID，用于生成 apple-app-site-association 里的 appID；它不是密钥。",
      importTarget: "阿里云 SAE plain env",
      cloudConfirmationKey: "wechatOpenPlatform",
      notes: "需与 iOS Bundle ID com.ipgongchang.meiyehuajing 和 Associated Domains 保持一致。",
    })
  }
  if (/^WECHAT_MINI_/.test(key)) {
    return metadata({
      category: "mini_program_compat",
      owner: "微信公众平台小程序操作员",
      consolePath: "微信公众平台 -> 小程序后台 -> 开发管理 -> 开发设置",
      obtain: "仅用于兼容旧小程序链路；从现有 Vercel production 或小程序后台确认。",
      importTarget: "阿里云 KMS/Secrets Manager/SAE secret env",
      cloudConfirmationKey: "envImport",
      notes: "不能用于原生 APP 微信登录。",
    })
  }
  if (/^ALIYUN_OSS|SERVICE_RECORD_OSS_PREFIX/.test(key)) {
    return metadata({
      category: "aliyun_oss",
      owner: "阿里云 OSS/RAM 操作员",
      consolePath: "阿里云控制台 -> OSS Bucket / RAM 访问控制",
      obtain: "确认服务记录音频 Bucket、region、CORS 和 RAM 最小权限，生成受限 AccessKey。",
      importTarget: sensitivityOf(key) === "public" ? "阿里云 SAE plain env" : "阿里云 KMS/Secrets Manager/SAE secret env",
      cloudConfirmationKey: "oss",
      notes: "RAM 权限应限制到服务记录音频前缀。",
    })
  }
  if (/DASHSCOPE|BAILIAN/.test(key)) {
    return metadata({
      category: "bailian_asr",
      owner: "阿里云百炼/DashScope 操作员",
      consolePath: "阿里云控制台 -> 百炼 / DashScope -> API Key 与模型配置",
      obtain: "确认 paraformer ASR 模型和 API Key；桥接期用于服务记录长录音转写。",
      importTarget: sensitivityOf(key) === "public" ? "阿里云 SAE plain env" : "阿里云 KMS/Secrets Manager/SAE secret env",
      cloudConfirmationKey: "envImport",
      notes: "DASHSCOPE_API_KEY 是密钥。",
    })
  }
  if (/DEEPSEEK|SERVICE_RECORD_DEEPSEEK/.test(key)) {
    return metadata({
      category: "deepseek_summary",
      owner: "DeepSeek/API 操作员",
      consolePath: "DeepSeek 控制台 / 现有 Vercel production 环境变量",
      obtain: "从 DeepSeek 控制台或现有 Vercel production 变量迁移 API Key、base URL 和模型名。",
      importTarget: sensitivityOf(key) === "public" ? "阿里云 SAE plain env" : "阿里云 KMS/Secrets Manager/SAE secret env",
      cloudConfirmationKey: "envImport",
      notes: "用于服务复盘总结和语音对练回复。",
    })
  }
  if (/^VOLC_/.test(key)) {
    return metadata({
      category: "volc_speech",
      owner: "火山引擎语音操作员",
      consolePath: "火山引擎控制台 -> 语音技术 / 访问控制",
      obtain: "从火山引擎控制台或现有 Vercel production 变量迁移 AppID、Token、Secret 和资源 ID。",
      importTarget: sensitivityOf(key) === "public" ? "阿里云 SAE plain env" : "阿里云 KMS/Secrets Manager/SAE secret env",
      cloudConfirmationKey: "envImport",
      notes: "桥接期保留语音对练链路。",
    })
  }
  if (/VOICE_COACH/.test(key)) {
    return metadata({
      category: "voice_coach_policy",
      owner: "产品/后端发布操作员",
      consolePath: "现有 Vercel production 环境变量 / 本仓库语音对练配置",
      obtain: "按桥接期策略确认是否启用、允许用户、最大轮次和 provider。",
      importTarget: "阿里云 SAE plain env",
      cloudConfirmationKey: "envImport",
      notes: "第一版 APP 范围以服务记录为主，语音对练配置为兼容保留。",
    })
  }
  if (/CRON_SECRET|CREDITS_IP_SALT|ADMIN_/.test(key)) {
    return metadata({
      category: "backend_ops",
      owner: "后端运维/管理员",
      consolePath: "现有 Vercel production 环境变量 / 管理员名单 / 阿里云 KMS",
      obtain: "从现有 production 配置迁移，或为 production-cn 生成新的随机 secret 并确认管理员名单。",
      importTarget: sensitivityOf(key) === "public" ? "阿里云 SAE plain env" : "阿里云 KMS/Secrets Manager/SAE secret env",
      cloudConfirmationKey: "envImport",
      notes: "ADMIN_* 是标识符列表，不应公开在文档里。",
    })
  }
  if (/^APIMART/.test(key)) {
    return metadata({
      category: "legacy_content_provider",
      owner: "旧内容供应商/API 操作员",
      consolePath: "APIMART 控制台 / 现有 Vercel production 环境变量",
      obtain: "桥接兼容需要时从旧供应商或 Vercel production 迁移。",
      importTarget: sensitivityOf(key) === "public" ? "阿里云 SAE plain env" : "阿里云 KMS/Secrets Manager/SAE secret env",
      cloudConfirmationKey: "envImport",
      notes: "可选，第一版 APP 后端接入不依赖全量内容能力。",
    })
  }
  return metadata({
    category: "existing_production_config",
    owner: "后端发布操作员",
    consolePath: "现有 production 环境变量或对应云服务控制台",
    obtain: "从现有生产配置核对后迁移。",
    importTarget: "阿里云 KMS/Secrets Manager/SAE secret env",
    cloudConfirmationKey: "envImport",
    notes: "",
  })
}

function metadata(item) {
  return {
    source: item.source || item.consolePath,
    category: item.category,
    owner: item.owner,
    consolePath: item.consolePath,
    obtain: item.obtain,
    importTarget: item.importTarget,
    cloudConfirmationKey: item.cloudConfirmationKey,
    notes: item.notes || "",
  }
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
    result.planSourceMetadataReady = plan.summary.sourceMetadataReady
  }

  console.log(JSON.stringify(result, null, 2))
  if (summary.missingRequired.length && !args.allowTodo) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
