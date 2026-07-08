/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

const ROUTES = [
  ["app", "api", "app", "voice-coach", "sessions", "route.ts"],
  ["app", "api", "app", "voice-coach", "sessions", "[sessionId]", "route.ts"],
  ["app", "api", "app", "voice-coach", "sessions", "[sessionId]", "events", "route.ts"],
  ["app", "api", "app", "voice-coach", "sessions", "[sessionId]", "turns", "[turnId]", "tts", "route.ts"],
  ["app", "api", "app", "voice-coach", "sessions", "[sessionId]", "asr-preview", "route.ts"],
  [
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "[sessionId]",
    "beautician-turn",
    "submit",
    "route.ts",
  ],
  ["app", "api", "app", "voice-coach", "sessions", "[sessionId]", "end", "route.ts"],
  ["app", "api", "app", "voice-coach", "sessions", "[sessionId]", "report", "route.ts"],
]

function routeSource(parts) {
  return read(...parts)
}

test("APP voiceCoach facade helper is App-auth gated and tenant scoped", () => {
  const helper = read("lib", "aliyun-rds", "repositories", "app-voice-coach-facade.server.ts")

  assert.match(helper, /resolveAliyunRdsAppAuthUser\(request\)/)
  assert.match(helper, /appAuthRequiredResponse\(\)/)
  assert.match(helper, /getAliyunRdsAppAccountContext\(auth\.user\)/)
  assert.match(helper, /accountContextPayload\(ctx\)/)
  assert.match(helper, /requestedCompanyId !== ctx\.companyId/)
  assert.match(helper, /requestedStoreId !== ctx\.storeId/)
  assert.match(helper, /tenant_scope_denied/)
  assert.match(helper, /voice_coach_scope/)
  assert.match(helper, /company_id: scope\.companyId/)
  assert.match(helper, /store_id: scope\.storeId/)
})

test("APP voiceCoach helper returns text-first local L4 shapes without provider or DB side effects", () => {
  const helper = read("lib", "aliyun-rds", "repositories", "app-voice-coach-facade.server.ts")
  const combinedRoutes = ROUTES.map(routeSource).join("\n")
  const combined = `${helper}\n${combinedRoutes}`

  assert.match(helper, /APP_VOICE_COACH_TEXT_SIDE_EFFECTS/)
  assert.match(helper, /"local_durable_session_write"/)
  assert.match(helper, /"local_durable_turn_write"/)
  assert.match(helper, /"local_durable_report_write"/)
  assert.match(helper, /TEXT_SESSION_REPOSITORY_MODE = "text_first_local_durable_session_store"/)
  assert.match(helper, /TEXT_SESSION_PROVIDER_MODE = "text_only_no_audio_provider"/)
  assert.match(helper, /APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH/)
  assert.match(helper, /createAppVoiceCoachTextSessionResponse/)
  assert.match(helper, /listAppVoiceCoachTextSessionsResponse/)
  assert.match(helper, /getAppVoiceCoachTextSessionResponse/)
  assert.match(helper, /listAppVoiceCoachTextEventsResponse/)
  assert.match(helper, /submitAppVoiceCoachTextBeauticianTurnResponse/)
  assert.match(helper, /endAppVoiceCoachTextSessionResponse/)
  assert.match(helper, /getAppVoiceCoachTextReportResponse/)
  assert.match(helper, /appVoiceCoachTtsProviderRequiredResponse/)
  assert.match(helper, /appVoiceCoachAsrProviderRequiredResponse/)

  assert.match(combinedRoutes, /resolveAppVoiceCoachFacadeContext\(request\)/)
  assert.match(combinedRoutes, /appVoiceCoachFacadeErrorResponse/)
  assert.match(combinedRoutes, /listAppVoiceCoachTextSessionsResponse/)
  assert.match(combinedRoutes, /createAppVoiceCoachTextSessionResponse/)
  assert.match(combinedRoutes, /getAppVoiceCoachTextSessionResponse/)
  assert.match(combinedRoutes, /listAppVoiceCoachTextEventsResponse/)
  assert.match(combinedRoutes, /submitAppVoiceCoachTextBeauticianTurnResponse/)
  assert.match(combinedRoutes, /endAppVoiceCoachTextSessionResponse/)
  assert.match(combinedRoutes, /getAppVoiceCoachTextReportResponse/)
  assert.match(combinedRoutes, /appVoiceCoachTtsProviderRequiredResponse/)
  assert.match(combinedRoutes, /appVoiceCoachAsrProviderRequiredResponse/)

  assert.doesNotMatch(combined, /capability_pending/)
  assert.doesNotMatch(combined, /no_voice_coach_persistence/)
  assert.doesNotMatch(combined, /safe_local_app_facade/)
  assert.doesNotMatch(combined, /appVoiceCoachSessionAcceptedResponse/)
  assert.doesNotMatch(combined, /appVoiceCoachSessionListResponse/)
  assert.doesNotMatch(combined, /appVoiceCoachSessionDetailResponse/)
  assert.doesNotMatch(combined, /appVoiceCoachEventsResponse/)
  assert.doesNotMatch(combined, /appVoiceCoachSubmitAcceptedResponse/)
  assert.doesNotMatch(combined, /appVoiceCoachEndAcceptedResponse/)
  assert.doesNotMatch(combined, /appVoiceCoachReportResponse/)
  assert.doesNotMatch(combined, /appVoiceCoachTtsAcceptedResponse/)
  assert.doesNotMatch(combined, /appVoiceCoachAsrPreviewAcceptedResponse/)
  assert.doesNotMatch(combined, /\{\s*status:\s*202\s*\}/)

  assert.doesNotMatch(combined, /createServerSupabaseClientForRequest/)
  assert.doesNotMatch(combined, /createAdminSupabaseClient/)
  assert.doesNotMatch(combined, /doubao(?:Tts|Asr|AsrFlash|AsrAuc)/i)
  assert.doesNotMatch(combined, /llm(?:Generate|Analyze)/i)
  assert.doesNotMatch(combined, /uploadVoiceCoachAudio/)
  assert.doesNotMatch(combined, /signVoiceCoachAudio/)
  assert.doesNotMatch(combined, /emitVoiceCoachEvent/)
  assert.doesNotMatch(combined, /pumpVoiceCoach/)
  assert.doesNotMatch(combined, /refreshVoiceCoachReport/)
  assert.doesNotMatch(combined, /queryAliyunRds/)
  assert.doesNotMatch(combined, /withAliyunRdsTransaction/)
  assert.doesNotMatch(combined, /insert into public\./i)
  assert.doesNotMatch(combined, /update public\./i)
  assert.doesNotMatch(combined, /delete from public\./i)
  assert.doesNotMatch(combined, /\bfetch\(/)
})

test("APP voiceCoach route, coverage, and client contract gates include the facade boundary", () => {
  const routes = read("scripts", "check-app-api-production-cn-routes.mjs")
  const coverage = read("scripts", "check-app-api-smoke-coverage.mjs")
  const contract = read("scripts", "check-app-client-api-contract.mjs")

  for (const route of [
    "/api/app/voice-coach/sessions",
    "/api/app/voice-coach/sessions/[sessionId]",
    "/api/app/voice-coach/sessions/[sessionId]/events",
    "/api/app/voice-coach/sessions/[sessionId]/turns/[turnId]/tts",
    "/api/app/voice-coach/sessions/[sessionId]/asr-preview",
    "/api/app/voice-coach/sessions/[sessionId]/beautician-turn/submit",
    "/api/app/voice-coach/sessions/[sessionId]/end",
    "/api/app/voice-coach/sessions/[sessionId]/report",
  ]) {
    assert.match(routes, new RegExp(route.replaceAll("/", "\\/").replaceAll("[", "\\[").replaceAll("]", "\\]")))
  }

  for (const path of [
    "/api/app/voice-coach/sessions",
    "/api/app/voice-coach/sessions/app-smoke-session",
    "/api/app/voice-coach/sessions/app-smoke-session/events",
    "/api/app/voice-coach/sessions/app-smoke-session/turns/app-smoke-turn/tts",
    "/api/app/voice-coach/sessions/app-smoke-session/asr-preview",
    "/api/app/voice-coach/sessions/app-smoke-session/beautician-turn/submit",
    "/api/app/voice-coach/sessions/app-smoke-session/end",
    "/api/app/voice-coach/sessions/app-smoke-session/report",
  ]) {
    assert.match(coverage, new RegExp(path.replaceAll("/", "\\/")))
  }

  assert.match(routes, /scope:\s*"voice-coach"/)
  assert.match(coverage, /scope:\s*"voice-coach"/)
  assert.match(coverage, /expected:\s*\[\{\s*status:\s*401\s*\}\]/)
  assert.match(contract, /"\/api\/app\/voice-coach\/"/)
  assert.match(contract, /findVoiceCoachRoutePlans/)
  assert.match(contract, /source: "voiceCoachRoutePlan"/)
  assert.match(contract, /route\.startsWith\("\/api\/voice-coach\/"\)/)
  assert.match(contract, /const DEFERRED_PREFIXES = \[\]/)
})
