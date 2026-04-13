import "dotenv/config"

function readEnv(name: string, fallback = ""): string {
  const value = process.env[name]
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function readLegacyEnv(primary: string, legacy: string, fallback = ""): string {
  return readEnv(primary, readEnv(legacy, fallback))
}

function parseCsv(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = readEnv(name)
  if (!raw) return fallback
  return raw === "true"
}

function readNumberEnv(name: string, fallback: number, minimum = 0): number {
  const parsed = Number(readEnv(name, String(fallback)))
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(minimum, Math.round(parsed))
}

function readStreamingAsrResourceId(): string {
  const explicit = readEnv("VOLC_STREAMING_ASR_RESOURCE_ID")
  if (explicit) return explicit

  const shared = readEnv("VOLC_ASR_RESOURCE_ID")
  if (shared.includes(".sauc")) return shared
  if (shared === "volc.bigasr.auc" || shared === "volc.seedasr.auc") {
    return "volc.bigasr.sauc.duration"
  }
  return "volc.bigasr.sauc.duration"
}

function readTtsResourceId(): string {
  const explicit = readEnv("VOLC_TTS_RESOURCE_ID")
  if (explicit) return explicit

  const voiceType = readEnv("VOLC_TTS_VOICE_TYPE", "zh_female_vv_uranus_bigtts").toLowerCase()
  return voiceType.includes("bigtts") ? "seed-tts-2.0" : "volc.service_type.10029"
}

function readArkApiKey(): string {
  return readEnv("ARK_API_KEY", readEnv("DOUBAO_API_KEY", readEnv("VOLC_ARK_API_KEY")))
}

type ProviderKind = "ark" | "deepseek" | "glm" | "qwen" | "minimax"

export type VoiceCoachLlmProviderConfig = {
  name: ProviderKind
  apiKey: string
  baseUrl: string
  model: string
  fallbackModels: string[]
}

type ProviderMap = Record<ProviderKind, VoiceCoachLlmProviderConfig>

function buildProviderConfig(
  name: ProviderKind,
  input: {
    apiKey: string
    baseUrl: string
    model: string
    fallbackModels: string[]
  },
): VoiceCoachLlmProviderConfig {
  return {
    name,
    apiKey: input.apiKey.trim(),
    baseUrl: input.baseUrl.trim(),
    model: input.model.trim(),
    fallbackModels: input.fallbackModels.map((item) => item.trim()).filter(Boolean),
  }
}

function readProviderChoice(
  envNames: string[],
  providers: ProviderMap,
  fallback: ProviderKind,
): ProviderKind {
  for (const envName of envNames) {
    const raw = readEnv(envName).toLowerCase()
    if (!raw) continue
    if (raw in providers) {
      return raw as ProviderKind
    }
  }
  return fallback
}

function selectAvailableProvider(preferred: ProviderKind, providers: ProviderMap): VoiceCoachLlmProviderConfig {
  const order: ProviderKind[] = [preferred, "deepseek", "ark", "glm", "qwen", "minimax"]
  const seen = new Set<ProviderKind>()

  for (const name of order) {
    if (seen.has(name)) continue
    seen.add(name)

    const candidate = providers[name]
    if (candidate && candidate.apiKey) {
      return candidate
    }
  }

  return providers[preferred]
}

const providerConfigs: ProviderMap = {
  ark: buildProviderConfig("ark", {
    apiKey: readArkApiKey(),
    baseUrl: readEnv("ARK_BASE_URL", readEnv("VOLC_ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")),
    model: readEnv(
      "ARK_VOICE_COACH_FAST_MODEL",
      readEnv("ARK_MODEL", readEnv("DOUBAO_MODEL", "doubao-seed-1-6-flash-250828")),
    ),
    fallbackModels: parseCsv(readEnv("ARK_VOICE_COACH_FALLBACK_MODELS", readEnv("ARK_FALLBACK_MODELS")))
      .filter(Boolean)
      .length
      ? parseCsv(readEnv("ARK_VOICE_COACH_FALLBACK_MODELS", readEnv("ARK_FALLBACK_MODELS")))
      : ["doubao-seed-1-6-250615"],
  }),
  deepseek: buildProviderConfig("deepseek", {
    apiKey: readEnv("DEEPSEEK_API_KEY"),
    baseUrl: readEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
    model: readEnv("DEEPSEEK_MODEL", "deepseek-chat"),
    fallbackModels: (() => {
      const explicit = parseCsv(readEnv("DEEPSEEK_FALLBACK_MODELS"))
      return explicit.length ? explicit : ["deepseek-chat"]
    })(),
  }),
  glm: buildProviderConfig("glm", {
    apiKey: readEnv("GLM_API_KEY"),
    baseUrl: readEnv("GLM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"),
    model: readEnv("GLM_MODEL", "glm-4-flash"),
    fallbackModels: parseCsv(readEnv("GLM_FALLBACK_MODELS")),
  }),
  qwen: buildProviderConfig("qwen", {
    apiKey: readEnv("QWEN_API_KEY"),
    baseUrl: readEnv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
    model: readEnv("QWEN_MODEL", "qwen-turbo"),
    fallbackModels: parseCsv(readEnv("QWEN_FALLBACK_MODELS")),
  }),
  minimax: buildProviderConfig("minimax", {
    apiKey: readEnv("MINIMAX_API_KEY"),
    baseUrl: readEnv("MINIMAX_BASE_URL", "https://api.minimax.chat/v1"),
    model: readEnv("MINIMAX_MODEL", "minimax-abab6.5s-chat"),
    fallbackModels: parseCsv(readEnv("MINIMAX_FALLBACK_MODELS")),
  }),
}

const defaultReplyProvider: ProviderKind = providerConfigs.deepseek.apiKey ? "deepseek" : "ark"
const defaultAnalysisProvider: ProviderKind = providerConfigs.deepseek.apiKey ? "deepseek" : "ark"

const replyProvider = readProviderChoice(
  ["VOICE_COACH_REPLY_PROVIDER", "ARK_REPLY_PROVIDER"],
  providerConfigs,
  defaultReplyProvider,
)
const analysisProvider = readProviderChoice(
  ["VOICE_COACH_ANALYSIS_PROVIDER", "ARK_ANALYSIS_PROVIDER"],
  providerConfigs,
  defaultAnalysisProvider,
)

export type VoiceCoachWsConfig = {
  port: number
  supabase: {
    url: string
    anonKey: string
    serviceRoleKey: string
  }
  volc: {
    appId: string
    accessToken: string
    ttsCluster: string
    ttsResourceId: string
    ttsVoiceType: string
    ttsLanguage: string
    asrResourceId: string
  }
  ark: {
    replyProvider: ProviderKind
    analysisProvider: ProviderKind
    providers: ProviderMap
    replyTimeoutMs: number
    analysisTimeoutMs: number
  }
  voiceCoach: {
    enabled: boolean
    allowUserIds: string[]
    maxTurns: number
    earlyReplyEnabled: boolean
    earlyReplyMinChars: number
    earlyReplyStableMs: number
  }
}

export const config: VoiceCoachWsConfig = {
  port: Number(readEnv("WS_PORT", "8080")) || 8080,
  supabase: {
    url: readLegacyEnv("NEXT_PUBLIC_SUPABASE_URL", "IPgongchang_SUPABASE_URL"),
    anonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: readLegacyEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      "IPgongchang_SUPABASE_SERVICE_ROLE_KEY",
      readEnv("IPgongchang_SUPABASE_SECRET_KEY"),
    ),
  },
  volc: {
    appId: readEnv("VOLC_SPEECH_APP_ID"),
    accessToken: readEnv("VOLC_SPEECH_ACCESS_TOKEN"),
    ttsCluster: readEnv("VOLC_TTS_CLUSTER", "volcano_tts"),
    ttsResourceId: readTtsResourceId(),
    ttsVoiceType: readEnv("VOLC_TTS_VOICE_TYPE", "zh_female_vv_uranus_bigtts"),
    ttsLanguage: readEnv("VOLC_TTS_LANGUAGE", "cn"),
    asrResourceId: readStreamingAsrResourceId(),
  },
  ark: {
    replyProvider,
    analysisProvider,
    providers: providerConfigs,
    replyTimeoutMs: readNumberEnv("ARK_VOICE_COACH_REPLY_TIMEOUT_MS", readNumberEnv("ARK_VOICE_COACH_TIMEOUT_MS", 8000), 3000),
    analysisTimeoutMs: readNumberEnv("ARK_VOICE_COACH_ANALYSIS_TIMEOUT_MS", readNumberEnv("ARK_ANALYSIS_TIMEOUT_MS", 15000), 3000),
  },
  voiceCoach: {
    enabled: readEnv("VOICE_COACH_ENABLED", "true") === "true",
    allowUserIds: parseCsv(readEnv("VOICE_COACH_ALLOW_USER_IDS")),
    maxTurns: Math.max(1, Number(readEnv("VOICE_COACH_MAX_TURNS", "10")) || 10),
    earlyReplyEnabled: readBooleanEnv("VOICE_COACH_EARLY_REPLY_ENABLED", true),
    earlyReplyMinChars: readNumberEnv("VOICE_COACH_EARLY_REPLY_MIN_CHARS", 8, 4),
    earlyReplyStableMs: readNumberEnv("VOICE_COACH_EARLY_REPLY_STABLE_MS", 180, 80),
  },
}

export function getLlmProviderConfig(role: "reply" | "analysis"): VoiceCoachLlmProviderConfig {
  const preferred = role === "reply" ? config.ark.replyProvider : config.ark.analysisProvider
  return selectAvailableProvider(preferred, config.ark.providers)
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL && config.supabase.url) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = config.supabase.url
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && config.supabase.serviceRoleKey) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = config.supabase.serviceRoleKey
}
