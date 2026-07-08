/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

const TEXT_FIRST_L4_ROUTES = [
  {
    name: "create session",
    parts: ["app", "api", "app", "voice-coach", "sessions", "route.ts"],
    expectedMethod: "POST",
    expectedDelegates: ["createAppVoiceCoachTextSessionResponse"],
    forbiddenDelegates: ["appVoiceCoachSessionAcceptedResponse"],
  },
  {
    name: "list sessions",
    parts: ["app", "api", "app", "voice-coach", "sessions", "route.ts"],
    expectedMethod: "GET",
    expectedDelegates: ["listAppVoiceCoachTextSessionsResponse"],
    forbiddenDelegates: ["appVoiceCoachSessionListResponse"],
  },
  {
    name: "read session detail",
    parts: ["app", "api", "app", "voice-coach", "sessions", "[sessionId]", "route.ts"],
    expectedMethod: "GET",
    expectedDelegates: ["getAppVoiceCoachTextSessionResponse"],
    forbiddenDelegates: ["appVoiceCoachSessionDetailResponse"],
  },
  {
    name: "read session events",
    parts: ["app", "api", "app", "voice-coach", "sessions", "[sessionId]", "events", "route.ts"],
    expectedMethod: "GET",
    expectedDelegates: ["listAppVoiceCoachTextEventsResponse"],
    forbiddenDelegates: ["appVoiceCoachEventsResponse"],
  },
  {
    name: "submit beautician turn",
    parts: [
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
    expectedMethod: "POST",
    expectedDelegates: ["readOptionalAppVoiceCoachFormBody", "submitAppVoiceCoachTextBeauticianTurnResponse"],
    forbiddenDelegates: ["appVoiceCoachSubmitAcceptedResponse"],
  },
  {
    name: "end session",
    parts: ["app", "api", "app", "voice-coach", "sessions", "[sessionId]", "end", "route.ts"],
    expectedMethod: "POST",
    expectedDelegates: ["endAppVoiceCoachTextSessionResponse"],
    forbiddenDelegates: ["appVoiceCoachEndAcceptedResponse"],
  },
  {
    name: "read generated report",
    parts: ["app", "api", "app", "voice-coach", "sessions", "[sessionId]", "report", "route.ts"],
    expectedMethod: "GET",
    expectedDelegates: ["getAppVoiceCoachTextReportResponse"],
    forbiddenDelegates: ["appVoiceCoachReportResponse"],
  },
]

const L4_FORBIDDEN_MARKERS = [
  "capability_pending",
  "no_voice_coach_persistence",
  "safe_local_app_facade",
  "text_first_memory_session",
  "app_voice_coach_session_not_configured",
  "app_voice_coach_submit_not_configured",
  "app_voice_coach_end_not_configured",
]

test("VC-L4-01 text-first voiceCoach contract rejects facade success markers", () => {
  const helper = read("lib", "aliyun-rds", "repositories", "app-voice-coach-facade.server.ts")
  const blockers = []

  for (const marker of L4_FORBIDDEN_MARKERS) {
    if (helper.includes(marker)) blockers.push(`facade helper still exposes ${marker}`)
  }

  for (const route of TEXT_FIRST_L4_ROUTES) {
    const source = read(...route.parts)
    const routePath = route.parts.join("/")
    if (!source.includes(`export async function ${route.expectedMethod}`)) {
      blockers.push(`${route.name}: ${routePath} is missing ${route.expectedMethod}`)
    }
    for (const delegateName of route.expectedDelegates) {
      if (!source.includes(delegateName)) {
        blockers.push(`${route.name}: ${routePath} does not delegate to ${delegateName}`)
      }
    }
    for (const delegateName of route.forbiddenDelegates) {
      if (source.includes(delegateName)) {
        blockers.push(`${route.name}: ${routePath} still delegates to ${delegateName}`)
      }
    }
  }

  assert.deepEqual(blockers, [])
})

test("VC-L4-01 text-first voiceCoach contract rejects 202 accepted as L4 closure", () => {
  const helper = read("lib", "aliyun-rds", "repositories", "app-voice-coach-facade.server.ts")
  const acceptedStatusMatches = helper.match(/\{\s*status:\s*202\s*\}/g) || []

  assert.equal(
    acceptedStatusMatches.length,
    0,
    "L4 contract must not treat 202 accepted facade responses as create/submit/end/report closure",
  )
})
