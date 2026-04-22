import { createHash, randomUUID } from "crypto"
import { after, NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { llmGenerateCustomerTurn } from "@/lib/voice-coach/llm.server"
import {
  buildVoiceCoachFirstTurnTarget,
  buildVoiceCoachSessionSnapshot,
  getVoiceCoachSessionClientContext,
  getVoiceCoachSessionPromptContext,
  voiceCoachSessionCreateSchema,
} from "@/lib/voice-coach/session-context"
import { getScenario, type VoiceCoachEmotion, type VoiceCoachOpening } from "@/lib/voice-coach/scenarios"
import { doubaoTts, type DoubaoTtsEmotion } from "@/lib/voice-coach/speech/doubao.server"
import { signVoiceCoachAudio, uploadVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { normalizeScenarioTag } from "@/lib/voice-coach/tag-utils"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

type RequestSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>

function mapEmotionToTts(emotion?: VoiceCoachEmotion): DoubaoTtsEmotion | undefined {
  void emotion
  return "neutral"
}

function fallbackFirstCustomerTurn(): VoiceCoachOpening {
  const scenario = getScenario("objection_safety")
  return scenario.firstTurnPool?.[0] || {
    text: "我先说最担心的点吧，这种护理会不会有安全隐患或者恢复期问题？",
    emotion: "worried",
    tag: "安全顾虑",
  }
}

function getPresetFirstTurnPool(scenarioId: string | undefined | null): VoiceCoachOpening[] {
  const scenario = getScenario(scenarioId)
  return Array.isArray(scenario.firstTurnPool) ? scenario.firstTurnPool : []
}

function quickHash(input: string): number {
  const text = String(input || "")
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 131 + text.charCodeAt(i)) >>> 0
  }
  return hash
}

function pickPresetFirstTurn(
  scenarioId: string | undefined | null,
  ordinal?: number | null,
  stableSeed?: string,
): VoiceCoachOpening {
  const scenario = getScenario(scenarioId)
  const pool = getPresetFirstTurnPool(scenario.id)
  if (!pool.length) return fallbackFirstCustomerTurn()

  const normalizedOrdinal = Number(ordinal)
  const seedHash = quickHash(String(stableSeed || scenario.id || "voice-coach"))
  const baseIndex =
    Number.isFinite(normalizedOrdinal) && normalizedOrdinal >= 0 ? normalizedOrdinal : 0
  const index = (baseIndex + seedHash) % pool.length

  return pool[index] || fallbackFirstCustomerTurn()
}

function pickPresetFirstTurnAvoidRepeat(
  scenarioId: string | undefined | null,
  previousText?: string | null,
  ordinal?: number | null,
  stableSeed?: string,
): VoiceCoachOpening {
  const scenario = getScenario(scenarioId)
  const pool = getPresetFirstTurnPool(scenario.id)
  if (!pool.length) return fallbackFirstCustomerTurn()

  const normalizedPreviousText = String(previousText || "").trim()
  if (normalizedPreviousText) {
    const previousIndex = pool.findIndex((item) => String(item.text || "").trim() === normalizedPreviousText)
    if (previousIndex >= 0) {
      return pool[(previousIndex + 1) % pool.length] || fallbackFirstCustomerTurn()
    }
  }

  return pickPresetFirstTurn(scenario.id, ordinal, stableSeed)
}

function shouldUseLlmForFirstTurn(): boolean {
  const raw = String(process.env.VOICE_COACH_FIRST_TURN_MODE || "preset")
    .trim()
    .toLowerCase()
  return raw === "llm"
}

function shouldGenerateFirstTurnTtsSynchronously(scenarioId?: string | null): boolean {
  if (getPresetFirstTurnPool(scenarioId).length) return false

  const raw = String(process.env.VOICE_COACH_FIRST_TTS_MODE || "async")
    .trim()
    .toLowerCase()
  return raw === "sync"
}

function getSeedOpeningAudioPath(scenarioId: string): string {
  const fromEnv = (process.env.VOICE_COACH_SEED_OPENING_AUDIO_PATH || "").trim()
  if (fromEnv) return fromEnv
  if (getPresetFirstTurnPool(scenarioId).length) return ""
  if (scenarioId === "objection_safety") return "seed/opening/objection_safety_v1.mp3"
  return ""
}

function getSeedOpeningAudioSeconds(): number | null {
  const n = Number(process.env.VOICE_COACH_SEED_OPENING_SECONDS || 3)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

async function trySignSeedAudio(path: string): Promise<string | null> {
  if (!path) return null
  try {
    return await signVoiceCoachAudio(path)
  } catch {
    return null
  }
}

function getGeneratedOpeningAudioPath(scenarioId: string, text: string): string {
  const normalizedScenarioId = String(scenarioId || "voice-coach").trim() || "voice-coach"
  const normalizedText = String(text || "").trim()
  if (!normalizedText) return ""

  const key = createHash("sha1")
    .update(`${normalizedScenarioId}:${normalizedText}`)
    .digest("hex")
    .slice(0, 16)

  return `seed/opening/generated/${normalizedScenarioId}_${key}.mp3`
}

async function warmFirstTurnTts(params: {
  supabase: RequestSupabaseClient
  userId: string
  sessionId: string
  turnId: string
  sharedAudioPath: string
  text: string
  emotion: VoiceCoachEmotion
}) {
  const { supabase, userId, sessionId, turnId, sharedAudioPath, text, emotion } = params
  if (!text) return

  try {
    const { data: existingTurn } = await supabase
      .from("voice_coach_turns")
      .select("audio_path")
      .eq("id", turnId)
      .eq("session_id", sessionId)
      .maybeSingle()

    if (existingTurn?.audio_path) return

    const tts = await doubaoTts({
      text,
      emotion: mapEmotionToTts(emotion),
      uid: userId,
    })

    if (!tts.audio) return

    const audioPath = sharedAudioPath || `${userId}/${sessionId}/${turnId}.mp3`
    await uploadVoiceCoachAudio({
      path: audioPath,
      data: tts.audio,
      contentType: "audio/mpeg",
    })

    const { data: refreshedTurn } = await supabase
      .from("voice_coach_turns")
      .select("audio_path")
      .eq("id", turnId)
      .eq("session_id", sessionId)
      .maybeSingle()

    if (refreshedTurn?.audio_path) return

    await supabase
      .from("voice_coach_turns")
      .update({
        audio_path: audioPath,
        audio_seconds: tts.durationSeconds ?? null,
        status: "audio_ready",
      })
      .eq("id", turnId)
      .eq("session_id", sessionId)
  } catch {
    // Best-effort warmup only. The client /tts path remains the source of truth.
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as unknown
    const parsed = voiceCoachSessionCreateSchema.safeParse(body || {})
    if (!parsed.success) {
      return jsonError(400, "invalid_payload", { details: parsed.error.issues })
    }

    const scenarioId =
      typeof parsed.data.scenario_id === "string" && parsed.data.scenario_id.trim()
        ? parsed.data.scenario_id.trim()
        : null
    const scenario = getScenario(scenarioId)

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const liveNotes = String(parsed.data.live_notes || "").trim()
    const [customerProfileResult, sceneCardResult] = await Promise.all([
      parsed.data.customer_profile_id
        ? supabase
            .from("voice_coach_customer_profiles")
            .select("*")
            .eq("id", parsed.data.customer_profile_id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      parsed.data.scene_card_id
        ? supabase
            .from("voice_coach_scene_cards")
            .select("*")
            .eq("id", parsed.data.scene_card_id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (parsed.data.customer_profile_id && (customerProfileResult.error || !customerProfileResult.data)) {
      return jsonError(400, "customer_profile_not_found")
    }

    if (parsed.data.scene_card_id && (sceneCardResult.error || !sceneCardResult.data)) {
      return jsonError(400, "scene_card_not_found")
    }

    const sessionSnapshot =
      customerProfileResult.data || sceneCardResult.data || liveNotes
        ? buildVoiceCoachSessionSnapshot({
            customerProfile: customerProfileResult.data || null,
            sceneCard: sceneCardResult.data || null,
            liveNotes,
          })
        : null
    const sessionContext = sessionSnapshot ? { live_notes: sessionSnapshot.live_notes } : null
    const sessionContextText = getVoiceCoachSessionPromptContext(sessionSnapshot)

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .insert({
        user_id: user.id,
        scenario_id: scenario.id,
        status: "active",
        customer_profile_id: customerProfileResult.data?.id || null,
        scene_card_id: sceneCardResult.data?.id || null,
        session_context_json: sessionContext,
        scenario_snapshot_json: sessionSnapshot,
      })
      .select(
        "id, scenario_id, status, started_at, customer_profile_id, scene_card_id, session_context_json, scenario_snapshot_json",
      )
      .single()

    if (sessionError || !session) {
      return jsonError(500, "create_session_failed", { message: sessionError?.message })
    }

    const { count: scenarioSessionCount } = await supabase
      .from("voice_coach_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("scenario_id", scenario.id)

    const firstTurnOrdinal = Math.max(0, Number(scenarioSessionCount || 1) - 1)
    let previousOpeningText = ""

    const { data: previousSession } = await supabase
      .from("voice_coach_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("scenario_id", scenario.id)
      .neq("id", session.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (previousSession?.id) {
      const { data: previousOpeningTurn } = await supabase
        .from("voice_coach_turns")
        .select("text")
        .eq("session_id", previousSession.id)
        .eq("role", "customer")
        .eq("turn_index", 0)
        .maybeSingle()
      previousOpeningText = String(previousOpeningTurn?.text || "").trim()
    }

    let first = pickPresetFirstTurnAvoidRepeat(
      scenario.id,
      previousOpeningText,
      firstTurnOrdinal,
      session.id,
    )

    if (sessionContextText || shouldUseLlmForFirstTurn()) {
      try {
        first = await llmGenerateCustomerTurn({
          scenario,
          history: [],
          target: sessionContextText
            ? buildVoiceCoachFirstTurnTarget(sessionSnapshot, session.id)
            : "提出对安全性的担忧并追问是否安全",
          sessionContextText: sessionContextText || undefined,
          variationSeed: session.id,
        })
      } catch {
        first = pickPresetFirstTurnAvoidRepeat(
          scenario.id,
          previousOpeningText,
          firstTurnOrdinal,
          session.id,
        )
      }
    }

    const turnId = randomUUID()

    let audioPath: string | null = null
    let audioUrl: string | null = null
    let audioSeconds: number | null = getSeedOpeningAudioSeconds()
    let ttsFailed = false
    let audioSource: "seed" | "tts" | "none" = "none"

    const seedAudioPath = getSeedOpeningAudioPath(scenario.id)
    const generatedOpeningAudioPath = getGeneratedOpeningAudioPath(scenario.id, first.text)

    if (seedAudioPath) {
      const signed = await trySignSeedAudio(seedAudioPath)
      if (signed) {
        audioPath = seedAudioPath
        audioUrl = signed
        audioSource = "seed"
      }
    }

    if (!audioUrl && generatedOpeningAudioPath) {
      const signed = await trySignSeedAudio(generatedOpeningAudioPath)
      if (signed) {
        audioPath = generatedOpeningAudioPath
        audioUrl = signed
        audioSource = "tts"
      }
    }

    if (!audioUrl && shouldGenerateFirstTurnTtsSynchronously(scenario.id)) {
      try {
        const tts = await doubaoTts({
          text: first.text,
          emotion: mapEmotionToTts(first.emotion),
          uid: user.id,
        })
        audioSeconds = tts.durationSeconds ?? null
        if (tts.audio) {
          audioPath = `${user.id}/${session.id}/${turnId}.mp3`
          await uploadVoiceCoachAudio({
            path: audioPath,
            data: tts.audio,
            contentType: "audio/mpeg",
          })
          audioUrl = await signVoiceCoachAudio(audioPath)
          audioSource = "tts"
        } else {
          ttsFailed = true
        }
      } catch {
        audioPath = null
        audioUrl = null
        audioSeconds = null
        ttsFailed = true
      }
    }

    if (!audioUrl) {
      audioSeconds = null
    }

    const { error: turnError } = await supabase.from("voice_coach_turns").insert({
      id: turnId,
      session_id: session.id,
      turn_index: 0,
      role: "customer",
      text: first.text,
      emotion: first.emotion,
      audio_path: audioPath,
      audio_seconds: audioSeconds,
      status: audioUrl ? "audio_ready" : "text_ready",
      features_json: { tag: normalizeScenarioTag(first.tag, scenario) },
    })

    if (turnError) {
      return jsonError(500, "create_turn_failed", { message: turnError.message })
    }

    if (!audioUrl && first.text && !ttsFailed) {
      const warmPromise = warmFirstTurnTts({
        supabase,
        userId: user.id,
        sessionId: session.id,
        turnId,
        sharedAudioPath: generatedOpeningAudioPath,
        text: first.text,
        emotion: first.emotion,
      })
      after(async () => {
        await warmPromise
      })
    }

    return NextResponse.json({
      session_id: session.id,
      scenario: {
        id: scenario.id,
        name: scenario.name,
        goal: scenario.goal,
        seedTopics: scenario.seedTopics,
      },
      session_context: getVoiceCoachSessionClientContext({
        snapshot: session.scenario_snapshot_json,
        customerProfileId: session.customer_profile_id,
        sceneCardId: session.scene_card_id,
        sessionContext: session.session_context_json,
      }),
      first_customer_turn: {
        turn_id: turnId,
        turn_index: 0,
        text: first.text,
        emotion: first.emotion,
        audio_url: audioUrl,
        audio_seconds: audioSeconds,
        tts_failed: ttsFailed,
        tts_pending: !audioUrl,
        audio_source: audioSource,
      },
    })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
