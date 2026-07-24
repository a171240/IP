/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const { createHash } = require("node:crypto")
const os = require("node:os")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const helperPath = path.join(root, "lib", "aliyun-rds", "repositories", "app-voice-coach-facade.server.ts")
const runtimeConfigPath = path.join(root, "lib", "aliyun-rds", "app-voice-coach-runtime-config.server.ts")

const voiceCoachFeatureDecision = { enabled: true, reason: "ok", source: "ai_points" }
const authorizationChecks = []
const accessControlCalls = []
const accessControlCallArgs = []
let accountContextReadCount = 0
let forceVoiceCoachDenied = false
let mockAsrCallCount = 0
let mockAsrError = null
let mockAsrReceiptPersistPause = null
let mockAsrText = "转写"
let mockSaveTurnAudioMissing = false
let mockTtsError = null
let mockUploadError = null
const SESSION_ID = "77777777-7777-4777-8777-777777777777"
const CUSTOMER_PROFILE_ID = "11111111-1111-4111-8111-111111111111"
const SCENE_CARD_ID = "22222222-2222-4222-8222-222222222222"
const FOREIGN_ID = "88888888-8888-4888-8888-888888888888"
const FIRST_ATTEMPT_ID = "attempt-0001"
const SECOND_ATTEMPT_ID = "attempt-0002"
const THIRD_ATTEMPT_ID = "attempt-0003"
const ASR_RECEIPT_ID = "44444444-4444-4444-8444-444444444444"
const PRODUCTION_RDS_REPOSITORY_MODE = "rds_voice_coach_text_session_contract"
const testAccountContext = {
  accountStatus: "bound",
  userId: "app-user-route-rds-1",
  userEmail: null,
  membershipId: "membership-route-rds-1",
  companyId: "company-chunshe",
  companyName: "春舍公司",
  storeId: "store-chunshe",
  storeName: "春舍门店",
  role: "employee",
  roleLabel: "员工",
  scopeLabel: "春舍门店",
  memberships: [],
  isManager: false,
  isCompanyManager: false,
  isStoreManager: false,
  isPlatformAdmin: false,
  features: { voice_coach: voiceCoachFeatureDecision },
}
let currentAccountContext = { ...testAccountContext }

function requireAuthorizedVoiceCoachAccess(ctx, features, feature, requestedScope) {
  assert.equal(ctx, currentAccountContext)
  assert.equal(features, currentAccountContext.features)
  assert.equal(feature, "voice_coach")
  assert.deepEqual(features.voice_coach, voiceCoachFeatureDecision)
  if (requestedScope) {
    assert.deepEqual(requestedScope, {
      companyId: currentAccountContext.companyId,
      storeId: currentAccountContext.storeId,
    })
  }
  authorizationChecks.push(requestedScope || null)
  if (forceVoiceCoachDenied && !requestedScope) {
    return {
      ok: false,
      status: 403,
      body: { ok: false, code: "not_bound", feature: "voice_coach" },
    }
  }
  return { ok: true, account: ctx }
}

function resetAuthorizationChecks() {
  authorizationChecks.length = 0
  accessControlCalls.length = 0
  accessControlCallArgs.length = 0
  accountContextReadCount = 0
  forceVoiceCoachDenied = false
  mockAsrCallCount = 0
  mockAsrError = null
  mockAsrReceiptPersistPause = null
  mockAsrText = "转写"
  mockSaveTurnAudioMissing = false
  mockTtsError = null
  mockUploadError = null
  currentAccountContext = { ...testAccountContext }
}

function assertAuthorizationChecks(requestCount) {
  assert.equal(authorizationChecks.length, requestCount * 2)
  for (let index = 0; index < authorizationChecks.length; index += 2) {
    assert.equal(authorizationChecks[index], null)
    assert.deepEqual(authorizationChecks[index + 1], {
      companyId: testAccountContext.companyId,
      storeId: testAccountContext.storeId,
    })
  }
}

function setAccountContext(overrides) {
  currentAccountContext = { ...testAccountContext, ...overrides }
}

function jsonResponse(body, init = {}) {
  return {
    status: init.status || 200,
    body,
    async json() {
      return body
    },
  }
}

const nextServerStub = {
  NextRequest: class NextRequest {},
  NextResponse: {
    json: jsonResponse,
  },
}

function compileTsModule(filePath, stubs) {
  const source = fs.readFileSync(filePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText

  const compiledModule = new Module(filePath, module)
  compiledModule.filename = filePath
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filePath))
  compiledModule.require = (moduleId) => {
    if (moduleId in stubs) return stubs[moduleId]
    return require(moduleId)
  }
  compiledModule._compile(compiled, filePath)
  return compiledModule.exports
}

function createRdsMock() {
  const calls = []
  const callArgs = []
  const sessions = new Map()
  const turns = new Map()
  const asrReceipts = new Map()
  const asrProcessingLeases = new Map()
  const mode = PRODUCTION_RDS_REPOSITORY_MODE
  const customerProfiles = new Map([
    [CUSTOMER_PROFILE_ID, { id: CUSTOMER_PROFILE_ID, user_id: testAccountContext.userId, name: "张女士" }],
  ])
  const sceneCards = new Map([
    [SCENE_CARD_ID, { id: SCENE_CARD_ID, user_id: testAccountContext.userId, name: "敏感肌到店咨询", service_name: "舒缓护理" }],
  ])

  function remember(name, args) {
    calls.push(name)
    callArgs.push({ name, args: { ...args } })
  }

  function belongsToScope(session, args) {
    if (args.dataDomain === "personal_trial") {
      return Boolean(
        session &&
          session.user_id === args.userId &&
          session.data_domain === "personal_trial" &&
          session.canonical_user_id === args.canonicalUserId,
      )
    }
    return Boolean(
      session &&
        session.user_id === args.userId &&
        session.company_id === args.companyId &&
        session.store_id === args.storeId &&
        session.membership_id === args.membershipId,
    )
  }

  function selectionErrorCode(error) {
    if (error instanceof Error && error.message === "voice_coach_rds_customer_profile_not_found") {
      return "customer_profile_not_found"
    }
    if (error instanceof Error && error.message === "voice_coach_rds_scene_card_not_found") {
      return "scene_card_not_found"
    }
    return null
  }

  function mutationError(error) {
    const byMessage = {
      voice_coach_rds_session_not_found: { status: 404, code: "voice_coach_session_not_found" },
      voice_coach_rds_session_end_failed: { status: 404, code: "voice_coach_session_not_found" },
      voice_coach_rds_idempotency_conflict: { status: 409, code: "voice_coach_idempotency_conflict" },
      voice_coach_rds_session_ended: { status: 409, code: "voice_coach_session_ended" },
      voice_coach_rds_reply_target_stale: { status: 409, code: "voice_coach_reply_target_stale" },
      voice_coach_rds_asr_receipt_required: { status: 409, code: "voice_coach_idempotency_conflict" },
    }
    return error instanceof Error ? byMessage[error.message] || null : null
  }

  function normalizedText(value) {
    return String(value || "").trim()
  }

  function turn(args) {
    return {
      id: `rds-turn-${args.turnIndex + 1}`,
      created_at: "2026-07-06T10:00:00.000Z",
      session_id: args.sessionId,
      turn_index: args.turnIndex,
      role: args.role,
      text: args.text,
      emotion: "neutral",
      audio_path: null,
      audio_seconds: null,
      asr_confidence: null,
      analysis_json: {},
      features_json: args.features || {},
    }
  }

  async function appendTextReply(name, args) {
    remember(name, args)
    const session = sessions.get(args.sessionId)
    if (!belongsToScope(session, args)) throw new Error("voice_coach_rds_session_not_found")
    const currentTurns = turns.get(args.sessionId) || []
    const receiptKey = `${args.sessionId}:${args.submittedAudioSha256 || ""}`
    const personalTrialAsrReceipt = args.dataDomain === "personal_trial"
      ? asrReceipts.get(receiptKey) || null
      : null
    if (
      args.dataDomain === "personal_trial" &&
      (
        !personalTrialAsrReceipt ||
        personalTrialAsrReceipt.id !== args.personalTrialAsrReceiptId
      )
    ) {
      throw new Error("voice_coach_rds_asr_receipt_required")
    }
    const existing = currentTurns.find(
      (item) => item.role === "beautician" && item.features_json?.client_attempt_id === args.clientAttemptId,
    )
    if (existing) {
      if (
        normalizedText(existing.text) !== normalizedText(args.replyText) ||
        existing.features_json?.reply_to_turn_id !== args.replyToTurnId ||
        (
          personalTrialAsrReceipt &&
          (
            personalTrialAsrReceipt.claimedTurnId !== existing.id ||
            existing.features_json?.asr_receipt_id !== personalTrialAsrReceipt.id
          )
        )
      ) {
        throw new Error("voice_coach_rds_idempotency_conflict")
      }
      const nextCustomerTurn = currentTurns.find(
        (item) => item.role === "customer" && item.turn_index === existing.turn_index + 1,
      ) || null
      return {
        beauticianTurn: existing,
        deduped: true,
        nextCustomerTurn,
        reachedMaxTurns: !nextCustomerTurn,
        session,
        turns: currentTurns,
      }
    }
    if (personalTrialAsrReceipt?.claimedTurnId) {
      throw new Error("voice_coach_rds_asr_receipt_required")
    }
    if (session.status === "ended") throw new Error("voice_coach_rds_session_ended")

    const latestTurn = currentTurns[currentTurns.length - 1]
    if (!latestTurn || latestTurn.role !== "customer" || latestTurn.id !== args.replyToTurnId) {
      throw new Error("voice_coach_rds_reply_target_stale")
    }
    await args.persistAudio?.()
    const reachedMaxTurns = currentTurns.filter((item) => item.role === "beautician").length + 1 >= 2
    const beauticianTurn = turn({
      features: {
        provider_mode: "text_only_no_audio_provider",
        client_attempt_id: args.clientAttemptId,
        reply_to_turn_id: args.replyToTurnId,
        ...(personalTrialAsrReceipt
          ? {
              asr_receipt_id: personalTrialAsrReceipt.id,
              submitted_audio_sha256: personalTrialAsrReceipt.audioSha256,
            }
          : {}),
      },
      role: "beautician",
      sessionId: args.sessionId,
      text: args.replyText,
      turnIndex: Math.max(...currentTurns.map((item) => item.turn_index), -1) + 1,
    })
    const nextCustomerTurn = !reachedMaxTurns && args.nextCustomerText
      ? turn({
          role: "customer",
          sessionId: args.sessionId,
          text: args.nextCustomerText,
          turnIndex: beauticianTurn.turn_index + 1,
        })
      : null
    const updatedTurns = nextCustomerTurn
      ? [...currentTurns, beauticianTurn, nextCustomerTurn]
      : [...currentTurns, beauticianTurn]
    turns.set(args.sessionId, updatedTurns)
    if (personalTrialAsrReceipt) {
      personalTrialAsrReceipt.claimedTurnId = beauticianTurn.id
    }
    return {
      beauticianTurn,
      deduped: false,
      nextCustomerTurn,
      reachedMaxTurns,
      session,
      turns: updatedTurns,
    }
  }

  async function endTextSession(name, args) {
    remember(name, args)
    const session = sessions.get(args.sessionId)
    if (!belongsToScope(session, args)) throw new Error("voice_coach_rds_session_end_failed")
    if (session.status === "ended") {
      return { deduped: true, report: session.report_json, session }
    }
    const endState = args.buildEndState({ session, turns: turns.get(args.sessionId) || [] })
    session.status = "ended"
    session.ended_at = "2026-07-06T10:06:00.000Z"
    session.report_json = endState.report
    session.total_score = endState.totalScore
    session.dimension_scores = endState.dimensionScores
    return { deduped: false, report: session.report_json, session }
  }

  return {
    calls,
    callArgs,
    asrProcessingLeases,
    asrReceipts,
    sessions,
    turns,
    module: {
      APP_VOICE_COACH_RDS_REPOSITORY_MODE: mode,
      getAliyunRdsVoiceCoachSelectionErrorCode: selectionErrorCode,
      getAliyunRdsVoiceCoachMutationError: mutationError,
      async createAliyunRdsVoiceCoachTextSession(args) {
        remember("createAliyunRdsVoiceCoachTextSession", args)
        args.timing?.recordStage("rds_mock_create", Date.now())
        if (args.scenario.id === "explode") {
          throw new Error("select * from secret_table at /private/backend/file.ts")
        }
        const customer = args.customerProfileId ? customerProfiles.get(args.customerProfileId) : null
        const scene = args.sceneCardId ? sceneCards.get(args.sceneCardId) : null
        if (args.customerProfileId && (!customer || customer.user_id !== args.userId)) {
          throw new Error("voice_coach_rds_customer_profile_not_found")
        }
        if (args.sceneCardId && (!scene || scene.user_id !== args.userId)) {
          throw new Error("voice_coach_rds_scene_card_not_found")
        }
        const safeContext = {
          customer_profile_id: args.customerProfileId || null,
          customer_name: customer?.name || null,
          scene_card_id: args.sceneCardId || null,
          scene_name: scene?.name || null,
          service_name: scene?.service_name || null,
          company_id: args.companyId,
          store_id: args.storeId,
          membership_id: args.membershipId,
        }
        const session = {
          id: SESSION_ID,
          created_at: "2026-07-06T10:00:00.000Z",
          user_id: args.userId,
          company_id: args.companyId,
          store_id: args.storeId,
          membership_id: args.membershipId,
          scenario_id: args.scenario.id,
          status: "active",
          started_at: "2026-07-06T10:00:00.000Z",
          ended_at: null,
          report_json: null,
          total_score: null,
          dimension_scores: null,
          customer_profile_id: args.customerProfileId || null,
          scene_card_id: args.sceneCardId || null,
          session_context_json: safeContext,
          scenario_snapshot_json: args.scenario,
        }
        const firstCustomerTurn = turn({
          role: "customer",
          sessionId: session.id,
          text: args.firstCustomerText,
          turnIndex: 0,
        })
        sessions.set(session.id, session)
        turns.set(session.id, [firstCustomerTurn])
        return { firstCustomerTurn, session }
      },
      async createAliyunRdsPersonalTrialVoiceCoachTextSession(args) {
        remember("createAliyunRdsPersonalTrialVoiceCoachTextSession", args)
        const session = {
          id: SESSION_ID,
          created_at: "2026-07-06T10:00:00.000Z",
          user_id: args.userId,
          canonical_user_id: args.canonicalUserId,
          data_domain: "personal_trial",
          company_id: null,
          store_id: null,
          membership_id: null,
          scenario_id: args.scenario.id,
          status: "active",
          started_at: "2026-07-06T10:00:00.000Z",
          ended_at: null,
          report_json: null,
          total_score: null,
          dimension_scores: null,
          session_context_json: { data_domain: "personal_trial" },
          scenario_snapshot_json: args.scenario,
          trial_reservation_expires_at: "2026-07-06T10:10:00.000Z",
          trial_reservation_status: "reserved",
        }
        const firstCustomerTurn = turn({
          role: "customer",
          sessionId: session.id,
          text: args.firstCustomerText,
          turnIndex: 0,
        })
        sessions.set(session.id, session)
        turns.set(session.id, [firstCustomerTurn])
        return {
          deduped: false,
          firstCustomerTurn,
          session,
          trial: {
            kind: "personal_trial",
            dataDomain: "personal_trial",
            status: "active",
            sessionLimit: 2,
            aiCoachPublicEnabled: true,
            sessionsReserved: 1,
            sessionsUsed: 0,
            sessionsRemaining: 1,
          },
        }
      },
      async getAliyunRdsVoiceCoachTextSessionWithClient(_client, args) {
        remember("getAliyunRdsVoiceCoachTextSessionWithClient", args)
        const session = sessions.get(args.sessionId)
        if (!belongsToScope(session, args)) return null
        return { session, turns: turns.get(args.sessionId) || [] }
      },
      async getAliyunRdsVoiceCoachTextSession(args) {
        remember("getAliyunRdsVoiceCoachTextSession", args)
        const session = sessions.get(args.sessionId)
        if (!belongsToScope(session, args)) return null
        return { session, turns: turns.get(args.sessionId) || [] }
      },
      async appendAliyunRdsVoiceCoachTextReplyWithClient(_client, args) {
        return appendTextReply("appendAliyunRdsVoiceCoachTextReplyWithClient", args)
      },
      async appendAliyunRdsVoiceCoachTextReply(args) {
        return appendTextReply("appendAliyunRdsVoiceCoachTextReply", args)
      },
      async persistAliyunRdsPersonalTrialAsrReceipt(args) {
        remember("persistAliyunRdsPersonalTrialAsrReceipt", args)
        const receiptKey = `${args.sessionId}:${args.audioSha256}`
        const existingReceipt = asrReceipts.get(receiptKey)
        if (existingReceipt) return existingReceipt
        const session = sessions.get(args.sessionId)
        const lease = asrProcessingLeases.get(receiptKey)
        if (
          session?.trial_reservation_status === "reserved" &&
          lease?.ownerToken !== args.processingOwnerToken
        ) {
          throw new Error("voice_coach_rds_asr_processing_required")
        }
        if (mockAsrReceiptPersistPause) {
          mockAsrReceiptPersistPause.started.resolve()
          await mockAsrReceiptPersistPause.resume.promise
        }
        const receipt = {
          id: ASR_RECEIPT_ID,
          audioSha256: args.audioSha256,
          audioSeconds: args.audioSeconds,
          claimedTurnId: null,
          confidence: args.confidence,
          providerRequestId: args.providerRequestId,
          transcriptText: args.transcriptText,
        }
        asrReceipts.set(receiptKey, receipt)
        if (lease?.ownerToken === args.processingOwnerToken) {
          asrProcessingLeases.delete(receiptKey)
        }
        return receipt
      },
      async claimAliyunRdsPersonalTrialAsrProcessing(args) {
        remember("claimAliyunRdsPersonalTrialAsrProcessing", args)
        const receiptKey = `${args.sessionId}:${args.audioSha256}`
        const existingReceipt = asrReceipts.get(receiptKey)
        if (existingReceipt) {
          return { state: "receipt", receipt: existingReceipt }
        }
        const session = sessions.get(args.sessionId)
        if (session?.trial_reservation_status !== "reserved") {
          return { state: "not_required" }
        }
        if (asrProcessingLeases.has(receiptKey)) {
          return { state: "in_progress" }
        }
        asrProcessingLeases.set(receiptKey, { ownerToken: args.ownerToken })
        return { ownerToken: args.ownerToken, state: "claimed" }
      },
      async abandonAliyunRdsPersonalTrialAsrProcessing(args) {
        remember("abandonAliyunRdsPersonalTrialAsrProcessing", args)
        const receiptKey = `${args.sessionId}:${args.audioSha256}`
        const lease = asrProcessingLeases.get(receiptKey)
        if (lease?.ownerToken !== args.ownerToken) return { abandoned: false }
        asrProcessingLeases.delete(receiptKey)
        return { abandoned: true }
      },
      async resolveAliyunRdsPersonalTrialAsrReceipt(args) {
        remember("resolveAliyunRdsPersonalTrialAsrReceipt", args)
        return asrReceipts.get(`${args.sessionId}:${args.audioSha256}`) || null
      },
      async saveAliyunRdsVoiceCoachTurnAudio(args) {
        remember("saveAliyunRdsVoiceCoachTurnAudio", args)
        if (mockSaveTurnAudioMissing) return null
        const session = sessions.get(args.sessionId)
        if (!belongsToScope(session, args)) return null
        const row = (turns.get(args.sessionId) || []).find((turn) => turn.id === args.turnId && turn.role === "customer")
        if (!row) return null
        row.audio_path = args.audioPath
        row.audio_seconds = args.audioSeconds
        return row
      },
      async endAliyunRdsVoiceCoachTextSessionWithClient(_client, args) {
        return endTextSession("endAliyunRdsVoiceCoachTextSessionWithClient", args)
      },
      async endAliyunRdsVoiceCoachTextSession(args) {
        return endTextSession("endAliyunRdsVoiceCoachTextSession", args)
      },
      async listAliyunRdsVoiceCoachTextSessionHistoryWithClient(_client, args) {
        remember("listAliyunRdsVoiceCoachTextSessionHistoryWithClient", args)
        return Array.from(sessions.values()).filter((session) => belongsToScope(session, args))
      },
      async listAliyunRdsVoiceCoachTextSessionHistory(args) {
        remember("listAliyunRdsVoiceCoachTextSessionHistory", args)
        return Array.from(sessions.values()).filter((session) => belongsToScope(session, args))
      },
      deriveAliyunRdsVoiceCoachTextEvents(session, rows) {
        remember("deriveAliyunRdsVoiceCoachTextEvents", { sessionId: session.id })
        const events = [
          {
            cursor: 1,
            created_at: session.created_at,
            event_id: `${session.id}:session.created`,
            payload: { session_id: session.id },
            type: "session.created",
          },
        ]
        for (const row of rows) {
          if (row.role === "beautician") {
            events.push({
              cursor: events.length + 1,
              created_at: row.created_at,
              event_id: `${row.id}:beautician_turn.submitted`,
              payload: { turn_id: row.id },
              type: "beautician_turn.submitted",
            })
          }
          if (row.role === "customer" && row.turn_index > 0) {
            events.push({
              cursor: events.length + 1,
              created_at: row.created_at,
              event_id: `${row.id}:customer_turn.ready`,
              payload: { turn_id: row.id },
              type: "customer_turn.ready",
            })
          }
        }
        if (session.status === "ended") {
          events.push({
            cursor: events.length + 1,
            created_at: session.ended_at,
            event_id: `${session.id}:session.ended`,
            payload: { report_ready: true },
            type: "session.ended",
          })
        }
        return events
      },
    },
  }
}

function helperStubs(rdsMock) {
  return {
    "server-only": {},
    "next/server": nextServerStub,
    "@/lib/aliyun-rds/app-voice-coach-runtime-config.server": compileTsModule(runtimeConfigPath, {
      "server-only": {},
    }),
    "@/lib/aliyun-rds/app-auth.server": {
      appAuthConfigurationErrorResponse: () => null,
      appAuthRequiredResponse: () => jsonResponse({ ok: false, code: "unauthorized" }, { status: 401 }),
      resolveAliyunRdsAppAuthUser: async () => ({ user: { id: currentAccountContext.userId } }),
    },
    "@/lib/aliyun-rds/app-authorization.server": {
      requireAppFeatureAccess: requireAuthorizedVoiceCoachAccess,
    },
    "@/lib/aliyun-rds/postgres.server": {
      AliyunRdsConfigurationError: class AliyunRdsConfigurationError extends Error {},
      isAliyunRdsRuntimeUnavailableError: () => false,
    },
    "@/lib/aliyun-rds/repositories/account-profile.server": {
      accountContextPayload: (ctx) => ({
        account: {
          user_id: ctx.userId,
          role: ctx.role,
        },
        tenant: {
          company_id: ctx.companyId,
          store_id: ctx.storeId,
        },
      }),
      getAliyunRdsAppAccountContext: async () => {
        accountContextReadCount += 1
        return currentAccountContext
      },
    },
    "@/lib/aliyun-rds/repositories/app-voice-coach-rds.server": rdsMock.module,
    "@/lib/aliyun-rds/repositories/app-access-control.server": {
      async completePersonalTrialFirstRound(args) {
        accessControlCalls.push("completePersonalTrialFirstRound")
        accessControlCallArgs.push({ name: "completePersonalTrialFirstRound", args: { ...args } })
        return { deduped: false, sessionId: args.sessionId }
      },
      getAppAccessSnapshot: async () => ({
        canonicalUserId: "99999999-9999-4999-8999-999999999999",
        identityState: "resolved",
        accessMode: "personal_trial",
        authorizationVersion: 0,
        trial: {
          kind: "personal_trial",
          dataDomain: "personal_trial",
          status: "active",
          sessionLimit: 2,
          aiCoachPublicEnabled: true,
          sessionsReserved: 0,
          sessionsUsed: 0,
          sessionsRemaining: 2,
        },
      }),
      async recordPersonalTrialVoiceEvidence(args) {
        accessControlCalls.push("recordPersonalTrialVoiceEvidence")
        accessControlCallArgs.push({ name: "recordPersonalTrialVoiceEvidence", args: { ...args } })
        return { deduped: false, ...args }
      },
      async releasePersonalTrialVoiceSession(args) {
        accessControlCalls.push("releasePersonalTrialVoiceSession")
        accessControlCallArgs.push({ name: "releasePersonalTrialVoiceSession", args: { ...args } })
        return { deduped: false, released: true, sessionId: args.sessionId }
      },
      async settlePersonalTrialAsrProcessingFailure(args) {
        accessControlCalls.push("settlePersonalTrialAsrProcessingFailure")
        accessControlCallArgs.push({
          name: "settlePersonalTrialAsrProcessingFailure",
          args: { ...args },
        })
        const receiptKey = `${args.sessionId}:${args.audioSha256}`
        if (rdsMock.asrReceipts.has(receiptKey)) {
          return {
            inProgress: false,
            receiptAvailable: true,
            released: false,
            reservationStatus: null,
            sessionId: args.sessionId,
          }
        }
        const lease = rdsMock.asrProcessingLeases.get(receiptKey)
        if (lease?.ownerToken !== args.processingOwnerToken) {
          return {
            inProgress: Boolean(lease),
            receiptAvailable: false,
            released: false,
            reservationStatus: null,
            sessionId: args.sessionId,
          }
        }
        rdsMock.asrProcessingLeases.delete(receiptKey)
        const releaseArgs = {
          canonicalUserId: args.canonicalUserId,
          reason: "asr_failed",
          sessionId: args.sessionId,
        }
        accessControlCalls.push("releasePersonalTrialVoiceSession")
        accessControlCallArgs.push({
          name: "releasePersonalTrialVoiceSession",
          args: releaseArgs,
        })
        return {
          inProgress: false,
          receiptAvailable: false,
          released: true,
          reservationStatus: "released",
          sessionId: args.sessionId,
        }
      },
    },
    "@/lib/voice-coach/scenarios": {
      getScenario: (scenarioId) => ({
        id: scenarioId || "objection_safety",
        name: "顾客顾虑处理",
        goal: "把顾客顾虑复述清楚并给出下一步建议",
        seedTopics: ["敏感肌", "效果预期"],
        firstTurnPool: [{ text: "我担心皮肤敏感，做完会不会不舒服？" }],
      }),
    },
    "@/lib/voice-coach/speech/doubao.server": {
      doubaoAsrFlash: async () => {
        mockAsrCallCount += 1
        if (mockAsrError) throw mockAsrError
        return { text: mockAsrText, confidence: 0.9, durationSeconds: 1, requestId: "asr-test" }
      },
      doubaoTts: async () => {
        if (mockTtsError) throw mockTtsError
        return { audio: Buffer.from("audio"), durationSeconds: 1, requestId: "tts-test" }
      },
    },
    "@/lib/voice-coach/storage.server": {
      signVoiceCoachAudio: async (path) => `https://audio.test/${path}`,
      uploadVoiceCoachAudio: async () => {
        if (mockUploadError) throw mockUploadError
      },
    },
  }
}

function routeModule(helperExports, ...parts) {
  return compileTsModule(path.join(root, ...parts), {
    "next/server": nextServerStub,
    "@/lib/aliyun-rds/repositories/app-voice-coach-facade.server": helperExports,
  })
}

test("ASR provider preserves an HTTP client error when a provider status header is also present", async (t) => {
  const originalFetch = global.fetch
  process.env.VOLC_SPEECH_APP_ID = "local-test-app"
  process.env.VOLC_SPEECH_ACCESS_TOKEN = "local-test-token"
  process.env.VOLC_ASR_FLASH_RESOURCE_ID = "local-test-resource"
  global.fetch = async () => ({
    headers: {
      get(name) {
        return name.toLowerCase() === "x-api-status-code"
          ? "45000001"
          : null
      },
    },
    json: async () => ({}),
    ok: false,
    status: 400,
  })
  t.after(() => {
    global.fetch = originalFetch
    delete process.env.VOLC_SPEECH_APP_ID
    delete process.env.VOLC_SPEECH_ACCESS_TOKEN
    delete process.env.VOLC_ASR_FLASH_RESOURCE_ID
  })

  const speech = compileTsModule(
    path.join(root, "lib", "voice-coach", "speech", "doubao.server.ts"),
    { "server-only": {} },
  )
  await assert.rejects(
    speech.doubaoAsrFlash({
      audio: Buffer.from([1, 2, 3]),
      format: "mp3",
      uid: "local-test-user",
    }),
    /asr_http_400/,
  )
})

function request(url, body = {}, contentType = "application/json") {
  return {
    url,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? contentType : null
      },
    },
    async json() {
      return body
    },
    async formData() {
      return {
        entries: function* entries() {
          for (const [key, value] of Object.entries(body)) {
            yield [key, typeof value === "string" ? value : value]
          }
        },
      }
    },
  }
}

function audioUpload() {
  return {
    name: "voice.mp3",
    type: "audio/mpeg",
    async arrayBuffer() {
      return Uint8Array.from([1, 2, 3]).buffer
    },
  }
}

function audioSubmitRequest(url, body) {
  return request(url, { ...body, audio: audioUpload() }, "multipart/form-data")
}

async function payload(response) {
  return response.json()
}

function sessionContext(sessionId) {
  return { params: Promise.resolve({ sessionId }) }
}

function turnContext(sessionId, turnId) {
  return { params: Promise.resolve({ sessionId, turnId }) }
}

function compileHelperWithMode(t, mode) {
  const rdsMock = createRdsMock()
  const previousMode = process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE
  const previousStorePath = process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-vc-rds-selection-"))
  process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE = mode
  process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH = path.join(tempDir, "sessions.json")
  t.after(() => {
    if (previousMode === undefined) delete process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE
    else process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE = previousMode
    if (previousStorePath === undefined) delete process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH
    else process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH = previousStorePath
    fs.rmSync(tempDir, { recursive: true, force: true })
  })
  return {
    helperExports: compileTsModule(helperPath, helperStubs(rdsMock)),
    rdsMock,
  }
}

function compileHelperWithRdsMock(t) {
  return compileHelperWithMode(t, "rds")
}

test("V1 personal trial creates an RDS demo session without tenant scope and returns remaining uses", async (t) => {
  resetAuthorizationChecks()
  forceVoiceCoachDenied = true
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(
    helperExports,
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "route.ts",
  )

  const response = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", {
      client_session_id: "trial-session-0001",
      scenario_id: "objection_safety",
    }),
  )
  const body = await payload(response)

  assert.equal(response.status, 201)
  assert.equal(body.session_context.data_domain, "personal_trial")
  assert.equal(body.session_context.company_id, null)
  assert.equal(body.session_context.store_id, null)
  assert.equal(body.session_context.membership_id, null)
  assert.equal(body.trial.ai_coach_session_limit, 2)
  assert.equal(body.trial.ai_coach_sessions_reserved, 1)
  assert.equal(body.trial.ai_coach_sessions_used, 0)
  assert.equal(body.trial.ai_coach_sessions_remaining, 1)
  assert.equal(body.trial.ai_coach_public_enabled, true)
  assert.deepEqual(rdsMock.calls, [
    "createAliyunRdsPersonalTrialVoiceCoachTextSession",
  ])
  assert.equal(rdsMock.callArgs[0].args.clientSessionId, "trial-session-0001")
  assert.equal(
    rdsMock.callArgs[0].args.canonicalUserId,
    "99999999-9999-4999-8999-999999999999",
  )
  assert.equal(
    Object.prototype.hasOwnProperty.call(rdsMock.callArgs[0].args, "companyId"),
    false,
  )
})

test("V1 personal trial uses one server-bound ASR receipt before the unique round completion", async (t) => {
  resetAuthorizationChecks()
  forceVoiceCoachDenied = true
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(
    helperExports,
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "route.ts",
  )
  const ttsRoute = routeModule(
    helperExports,
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "[sessionId]",
    "turns",
    "[turnId]",
    "tts",
    "route.ts",
  )
  const asrRoute = routeModule(
    helperExports,
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "[sessionId]",
    "asr-preview",
    "route.ts",
  )
  const submitRoute = routeModule(
    helperExports,
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "[sessionId]",
    "beautician-turn",
    "submit",
    "route.ts",
  )

  const createdResponse = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", {
      client_session_id: "trial-session-voice-events-0001",
      scenario_id: "objection_safety",
    }),
  )
  const created = await payload(createdResponse)
  assert.equal(createdResponse.status, 201)

  const openingTurnId = created.first_customer_turn.turn_id
  const openingTtsResponse = await ttsRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/turns/${openingTurnId}/tts`),
    turnContext(SESSION_ID, openingTurnId),
  )
  assert.equal(openingTtsResponse.status, 200)
  assert.deepEqual(
    accessControlCallArgs.map((call) => [
      call.name,
      call.args.evidenceStage || null,
    ]),
    [["recordPersonalTrialVoiceEvidence", "opening_tts_ready"]],
  )

  const asrResponse = await asrRoute.POST(
    request(
      `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/asr-preview`,
      { audio_b64: "AQID", format: "mp3" },
    ),
    sessionContext(SESSION_ID),
  )
  const asrBody = await payload(asrResponse)
  assert.equal(asrResponse.status, 200)
  assert.equal(asrBody.asr_receipt_id, ASR_RECEIPT_ID)
  assert.equal(mockAsrCallCount, 1)

  mockAsrError = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })
  const replayedAsrResponse = await asrRoute.POST(
    request(
      `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/asr-preview`,
      { audio_b64: "AQID", format: "mp3" },
    ),
    sessionContext(SESSION_ID),
  )
  const replayedAsrBody = await payload(replayedAsrResponse)
  assert.equal(replayedAsrResponse.status, 200)
  assert.equal(replayedAsrBody.text, "转写")
  assert.equal(mockAsrCallCount, 1)
  assert.equal(
    accessControlCalls.includes("releasePersonalTrialVoiceSession"),
    false,
  )
  mockAsrError = null

  const submitResponse = await submitRoute.POST(
    audioSubmitRequest(
      `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/beautician-turn/submit`,
      {
        client_attempt_id: FIRST_ATTEMPT_ID,
        reply_to_turn_id: openingTurnId,
        transcript_text: "客户端伪造文本",
      },
    ),
    sessionContext(SESSION_ID),
  )
  const submitted = await payload(submitResponse)
  assert.equal(submitResponse.status, 200)
  const appendCall = rdsMock.callArgs.find(
    (call) => call.name === "appendAliyunRdsVoiceCoachTextReply",
  )
  assert.equal(appendCall.args.replyText, "转写")
  assert.equal(appendCall.args.personalTrialAsrReceiptId, ASR_RECEIPT_ID)
  assert.equal(
    appendCall.args.submittedAudioSha256,
    createHash("sha256").update(Buffer.from([1, 2, 3])).digest("hex"),
  )
  assert.deepEqual(
    accessControlCallArgs.slice(1).map((call) => [
      call.name,
      call.args.evidenceStage || null,
    ]),
    [
      ["recordPersonalTrialVoiceEvidence", "recording_received"],
      ["recordPersonalTrialVoiceEvidence", "asr_succeeded"],
    ],
  )

  const nextTurnId = submitted.next_customer_turn.turn_id
  const nextTtsResponse = await ttsRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/turns/${nextTurnId}/tts`),
    turnContext(SESSION_ID, nextTurnId),
  )
  assert.equal(nextTtsResponse.status, 200)
  assert.deepEqual(
    accessControlCallArgs.slice(3).map((call) => [
      call.name,
      call.args.evidenceStage || null,
    ]),
    [
      ["recordPersonalTrialVoiceEvidence", "next_turn_tts_ready"],
      ["completePersonalTrialFirstRound", null],
    ],
  )
  assert.equal(
    accessControlCallArgs.at(-1).args.completionEventId,
    `round_1_completed:${SESSION_ID}`,
  )
})

test("V1 personal trial keeps an in-flight same-audio ASR owner from being released by a concurrent failure", async (t) => {
  resetAuthorizationChecks()
  forceVoiceCoachDenied = true
  const { helperExports } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(
    helperExports,
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "route.ts",
  )
  const asrRoute = routeModule(
    helperExports,
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "[sessionId]",
    "asr-preview",
    "route.ts",
  )
  const createdResponse = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", {
      client_session_id: "trial-session-asr-in-flight-0001",
      scenario_id: "objection_safety",
    }),
  )
  assert.equal(createdResponse.status, 201)

  let markPersistStarted
  let resumePersist
  mockAsrReceiptPersistPause = {
    started: {
      promise: new Promise((resolve) => {
        markPersistStarted = resolve
      }),
      resolve: () => markPersistStarted(),
    },
    resume: {
      promise: new Promise((resolve) => {
        resumePersist = resolve
      }),
      resolve: () => resumePersist(),
    },
  }
  const firstRequest = asrRoute.POST(
    request(
      `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/asr-preview`,
      { audio_b64: "AQID", format: "mp3" },
    ),
    sessionContext(SESSION_ID),
  )
  await mockAsrReceiptPersistPause.started.promise

  mockAsrError = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })
  const concurrentFailure = await asrRoute.POST(
    request(
      `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/asr-preview`,
      { audio_b64: "AQID", format: "mp3" },
    ),
    sessionContext(SESSION_ID),
  )
  const concurrentFailureBody = await payload(concurrentFailure)
  let firstResponse
  try {
    assert.equal(concurrentFailure.status, 502)
    assert.equal(
      concurrentFailureBody.code,
      "voice_coach_asr_provider_unavailable",
    )
    assert.equal(mockAsrCallCount, 1)
    assert.equal(
      accessControlCalls.includes("releasePersonalTrialVoiceSession"),
      false,
    )
  } finally {
    mockAsrReceiptPersistPause.resume.resolve()
    firstResponse = await firstRequest
  }
  assert.equal(firstResponse.status, 200)
  assert.equal(
    accessControlCalls.includes("releasePersonalTrialVoiceSession"),
    false,
  )
})

test("V1 personal trial releases only the four server technical failure classes", async (t) => {
  async function createTrialHarness() {
    resetAuthorizationChecks()
    forceVoiceCoachDenied = true
    const { helperExports } = compileHelperWithRdsMock(t)
    const sessionsRoute = routeModule(
      helperExports,
      "app",
      "api",
      "app",
      "voice-coach",
      "sessions",
      "route.ts",
    )
    const ttsRoute = routeModule(
      helperExports,
      "app",
      "api",
      "app",
      "voice-coach",
      "sessions",
      "[sessionId]",
      "turns",
      "[turnId]",
      "tts",
      "route.ts",
    )
    const asrRoute = routeModule(
      helperExports,
      "app",
      "api",
      "app",
      "voice-coach",
      "sessions",
      "[sessionId]",
      "asr-preview",
      "route.ts",
    )
    const submitRoute = routeModule(
      helperExports,
      "app",
      "api",
      "app",
      "voice-coach",
      "sessions",
      "[sessionId]",
      "beautician-turn",
      "submit",
      "route.ts",
    )
    const response = await sessionsRoute.POST(
      request("https://local.test/api/app/voice-coach/sessions", {
        client_session_id: "trial-failure-test-0001",
        scenario_id: "objection_safety",
      }),
    )
    const created = await payload(response)
    assert.equal(response.status, 201)
    return {
      asrRoute,
      openingTurnId: created.first_customer_turn.turn_id,
      submitRoute,
      ttsRoute,
    }
  }

  {
    const harness = await createTrialHarness()
    mockTtsError = new Error("tts provider failed")
    const response = await harness.ttsRoute.POST(
      request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/turns/${harness.openingTurnId}/tts`),
      turnContext(SESSION_ID, harness.openingTurnId),
    )
    assert.equal(response.status, 502)
    assert.equal(accessControlCallArgs.at(-1).args.reason, "opening_tts_failed")
  }

  {
    const harness = await createTrialHarness()
    mockSaveTurnAudioMissing = true
    const response = await harness.ttsRoute.POST(
      request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/turns/${harness.openingTurnId}/tts`),
      turnContext(SESSION_ID, harness.openingTurnId),
    )
    assert.equal(response.status, 404)
    assert.equal(accessControlCallArgs.at(-1).args.reason, "opening_tts_failed")
  }

  {
    const harness = await createTrialHarness()
    mockAsrError = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })
    const response = await harness.asrRoute.POST(
      request(
        `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/asr-preview`,
        { audio_b64: "AQID", format: "mp3" },
      ),
      sessionContext(SESSION_ID),
    )
    assert.equal(response.status, 502)
    assert.equal(accessControlCallArgs.at(-1).args.reason, "asr_failed")
  }

  {
    const harness = await createTrialHarness()
    mockAsrError = new Error("asr_http_400")
    const response = await harness.asrRoute.POST(
      request(
        `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/asr-preview`,
        { audio_b64: "AQID", format: "mp3" },
      ),
      sessionContext(SESSION_ID),
    )
    const body = await payload(response)
    assert.equal(response.status, 422)
    assert.equal(body.code, "invalid_payload")
    assert.equal(
      accessControlCalls.includes("releasePersonalTrialVoiceSession"),
      false,
    )
  }

  {
    const harness = await createTrialHarness()
    mockAsrText = ""
    const response = await harness.asrRoute.POST(
      request(
        `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/asr-preview`,
        { audio_b64: "AQID", format: "mp3" },
      ),
      sessionContext(SESSION_ID),
    )
    const body = await payload(response)
    assert.equal(response.status, 422)
    assert.equal(body.code, "invalid_payload")
    assert.equal(
      accessControlCalls.includes("releasePersonalTrialVoiceSession"),
      false,
    )
  }

  {
    const harness = await createTrialHarness()
    const asrResponse = await harness.asrRoute.POST(
      request(
        `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/asr-preview`,
        { audio_b64: "AQID", format: "mp3" },
      ),
      sessionContext(SESSION_ID),
    )
    assert.equal(asrResponse.status, 200)
    mockUploadError = new Error("object storage failed")
    const response = await harness.submitRoute.POST(
      audioSubmitRequest(
        `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/beautician-turn/submit`,
        {
          client_attempt_id: FIRST_ATTEMPT_ID,
          reply_to_turn_id: harness.openingTurnId,
          transcript_text: "客户端文本不作为证据",
        },
      ),
      sessionContext(SESSION_ID),
    )
    assert.equal(response.status, 502)
    assert.equal(
      accessControlCallArgs.at(-1).args.reason,
      "recording_receive_failed",
    )
  }

  {
    const harness = await createTrialHarness()
    const asrResponse = await harness.asrRoute.POST(
      request(
        `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/asr-preview`,
        { audio_b64: "AQID", format: "mp3" },
      ),
      sessionContext(SESSION_ID),
    )
    assert.equal(asrResponse.status, 200)
    const submitResponse = await harness.submitRoute.POST(
      audioSubmitRequest(
        `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/beautician-turn/submit`,
        {
          client_attempt_id: FIRST_ATTEMPT_ID,
          reply_to_turn_id: harness.openingTurnId,
          transcript_text: "客户端文本不作为证据",
        },
      ),
      sessionContext(SESSION_ID),
    )
    const submitted = await payload(submitResponse)
    assert.equal(submitResponse.status, 200)
    accessControlCalls.length = 0
    accessControlCallArgs.length = 0
    mockTtsError = new Error("next tts provider failed")
    const response = await harness.ttsRoute.POST(
      request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/turns/${submitted.next_customer_turn.turn_id}/tts`),
      turnContext(SESSION_ID, submitted.next_customer_turn.turn_id),
    )
    assert.equal(response.status, 502)
    assert.equal(accessControlCallArgs.at(-1).args.reason, "next_turn_tts_failed")
  }

  {
    const harness = await createTrialHarness()
    const asrResponse = await harness.asrRoute.POST(
      request(
        `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/asr-preview`,
        { audio_b64: "AQID", format: "mp3" },
      ),
      sessionContext(SESSION_ID),
    )
    assert.equal(asrResponse.status, 200)
    const submitResponse = await harness.submitRoute.POST(
      audioSubmitRequest(
        `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/beautician-turn/submit`,
        {
          client_attempt_id: FIRST_ATTEMPT_ID,
          reply_to_turn_id: harness.openingTurnId,
          transcript_text: "客户端文本不作为证据",
        },
      ),
      sessionContext(SESSION_ID),
    )
    const submitted = await payload(submitResponse)
    assert.equal(submitResponse.status, 200)
    accessControlCalls.length = 0
    accessControlCallArgs.length = 0
    mockSaveTurnAudioMissing = true
    const response = await harness.ttsRoute.POST(
      request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/turns/${submitted.next_customer_turn.turn_id}/tts`),
      turnContext(SESSION_ID, submitted.next_customer_turn.turn_id),
    )
    assert.equal(response.status, 404)
    assert.equal(accessControlCallArgs.at(-1).args.reason, "next_turn_tts_failed")
  }

  {
    const harness = await createTrialHarness()
    const response = await harness.submitRoute.POST(
      audioSubmitRequest(
        `https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/beautician-turn/submit`,
        {
          client_attempt_id: "short",
          reply_to_turn_id: harness.openingTurnId,
          transcript_text: "客户端无效输入",
        },
      ),
      sessionContext(SESSION_ID),
    )
    assert.equal(response.status, 422)
    assert.equal(
      accessControlCalls.includes("releasePersonalTrialVoiceSession"),
      false,
    )
  }
})

async function withVoiceCoachRuntimeEnv(options, run) {
  const keys = [
    "APP_ENV",
    "APP_REGION",
    "APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH",
    "APP_VOICE_COACH_TEXT_REPOSITORY_MODE",
  ]
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-vc-production-mode-"))
  const storePath = path.join(tempDir, "sessions.json")
  const next = {
    APP_ENV: options.appEnv,
    APP_REGION: options.appRegion,
    APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH: storePath,
    APP_VOICE_COACH_TEXT_REPOSITORY_MODE: options.mode,
  }

  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  try {
    return await run({ storePath })
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

test("VC-L4-05 route handlers use explicit RDS repository selection when configured", async (t) => {
  resetAuthorizationChecks()
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")
  const detailRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "route.ts")
  const submitRoute = routeModule(
    helperExports,
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "[sessionId]",
    "beautician-turn",
    "submit",
    "route.ts",
  )
  const eventsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "events", "route.ts")
  const endRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "end", "route.ts")
  const reportRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "report", "route.ts")

  const createResponse = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", {
      customer_profile_id: CUSTOMER_PROFILE_ID,
      scenario_id: "objection_safety",
      scene_card_id: SCENE_CARD_ID,
    }),
  )
  const created = await payload(createResponse)
  assert.equal(createResponse.status, 201)
  assert.equal(created.repository_mode, "rds_voice_coach_text_session_contract")
  assert.equal(created.session_id, SESSION_ID)
  assert.equal(created.session_context.customer_name, "张女士")
  assert.equal(created.session_context.scene_name, "敏感肌到店咨询")
  assert.equal(created.session_context.service_name, "舒缓护理")
  assert.equal(created.session_context.membership_id, testAccountContext.membershipId)
  assert.deepEqual(rdsMock.calls, ["createAliyunRdsVoiceCoachTextSession"])
  assert.deepEqual(
    {
      companyId: rdsMock.callArgs[0].args.companyId,
      membershipId: rdsMock.callArgs[0].args.membershipId,
      storeId: rdsMock.callArgs[0].args.storeId,
      userId: rdsMock.callArgs[0].args.userId,
    },
    {
      companyId: testAccountContext.companyId,
      membershipId: testAccountContext.membershipId,
      storeId: testAccountContext.storeId,
      userId: testAccountContext.userId,
    },
  )

  const detailResponse = await detailRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}`),
    sessionContext(created.session_id),
  )
  const detail = await payload(detailResponse)
  assert.equal(detailResponse.status, 200)
  assert.equal(detail.session.context.repository_mode, "rds_voice_coach_text_session_contract")
  assert.equal(detail.session.context.customer_name, created.session_context.customer_name)
  assert.equal(detail.session.context.scene_name, created.session_context.scene_name)
  assert.equal(detail.session.context.service_name, created.session_context.service_name)
  assert.equal(detail.turns[0].turn_id, "rds-turn-1")

  const submitCallOffset = rdsMock.calls.length
  const submitResponse = await submitRoute.POST(
    audioSubmitRequest(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/beautician-turn/submit`, {
      client_attempt_id: FIRST_ATTEMPT_ID,
      reply_to_turn_id: detail.turns[0].turn_id,
      transcript_text: "我会先确认敏感风险，再从低刺激护理开始。",
    }),
    sessionContext(created.session_id),
  )
  const submitted = await payload(submitResponse)
  assert.equal(submitResponse.status, 200)
  assert.equal(submitted.repository_mode, "rds_voice_coach_text_session_contract")
  assert.equal(submitted.client_attempt_id, FIRST_ATTEMPT_ID)
  assert.equal(submitted.deduped, false)
  assert.equal(submitted.beautician_turn.turn_id, "rds-turn-2")
  assert.equal(submitted.next_customer_turn.turn_id, "rds-turn-3")
  assert.deepEqual(
    rdsMock.calls.slice(submitCallOffset),
    ["appendAliyunRdsVoiceCoachTextReply", "deriveAliyunRdsVoiceCoachTextEvents"],
  )

  const eventsResponse = await eventsRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/events?cursor=0`),
    sessionContext(created.session_id),
  )
  const events = await payload(eventsResponse)
  assert.equal(eventsResponse.status, 200)
  assert.deepEqual(
    events.events.map((event) => event.type),
    ["session.created", "beautician_turn.submitted", "customer_turn.ready"],
  )

  const endCallOffset = rdsMock.calls.length
  const endResponse = await endRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/end`, {}),
    sessionContext(created.session_id),
  )
  const ended = await payload(endResponse)
  assert.equal(endResponse.status, 200)
  assert.equal(ended.repository_mode, "rds_voice_coach_text_session_contract")
  assert.equal(ended.session.status, "ended")
  assert.equal(ended.deduped, false)
  assert.deepEqual(rdsMock.calls.slice(endCallOffset), ["endAliyunRdsVoiceCoachTextSession"])

  const reportResponse = await reportRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/report`),
    sessionContext(created.session_id),
  )
  const report = await payload(reportResponse)
  assert.equal(reportResponse.status, 200)
  assert.equal(report.report.status, "ready")
  assert.equal(report.report.meta.generated_from, "rds_voice_coach_text_session_contract")

  const listResponse = await sessionsRoute.GET(request("https://local.test/api/app/voice-coach/sessions?limit=5"))
  const list = await payload(listResponse)
  assert.equal(listResponse.status, 200)
  assert.equal(list.repository_mode, "rds_voice_coach_text_session_contract")
  assert.equal(list.sessions[0].id, created.session_id)
  assert.equal(list.sessions[0].customer_name, created.session_context.customer_name)
  assert.equal(list.sessions[0].scene_name, created.session_context.scene_name)
  assert.equal(list.sessions[0].service_name, created.session_context.service_name)
  assert(rdsMock.calls.includes("listAliyunRdsVoiceCoachTextSessionHistory"))
  assertAuthorizationChecks(7)
})

test("VC-L4-06 RDS submit requires bounded attempt and reply target without repository access", async (t) => {
  resetAuthorizationChecks()
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const submitRoute = routeModule(
    helperExports,
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "[sessionId]",
    "beautician-turn",
    "submit",
    "route.ts",
  )
  const cases = [
    [{ reply_to_turn_id: "rds-turn-1", transcript_text: "回答" }, "client_attempt_id_required"],
    [{ client_attempt_id: "short", reply_to_turn_id: "rds-turn-1", transcript_text: "回答" }, "client_attempt_id_invalid"],
    [
      { client_attempt_id: "a".repeat(121), reply_to_turn_id: "rds-turn-1", transcript_text: "回答" },
      "client_attempt_id_invalid",
    ],
    [{ client_attempt_id: FIRST_ATTEMPT_ID, transcript_text: "回答" }, "reply_to_turn_id_required"],
  ]

  for (const [body, code] of cases) {
    rdsMock.calls.length = 0
    rdsMock.callArgs.length = 0
    const response = await submitRoute.POST(
      audioSubmitRequest(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/beautician-turn/submit`, body),
      sessionContext(SESSION_ID),
    )
    const responseBody = await payload(response)
    assert.equal(response.status, 422)
    assert.equal(responseBody.error, code)
    assert.equal(responseBody.code, code)
    assert.deepEqual(rdsMock.calls, [])
  }
})

test("VC-L4-06 RDS submit and end retries are idempotent without transaction-external detail", async (t) => {
  resetAuthorizationChecks()
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")
  const submitRoute = routeModule(
    helperExports,
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "[sessionId]",
    "beautician-turn",
    "submit",
    "route.ts",
  )
  const endRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "end", "route.ts")

  const createdResponse = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" }),
  )
  assert.equal(createdResponse.status, 201)
  rdsMock.calls.length = 0
  rdsMock.callArgs.length = 0

  async function submit(body) {
    const response = await submitRoute.POST(
      audioSubmitRequest(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/beautician-turn/submit`, body),
      sessionContext(SESSION_ID),
    )
    return { response, body: await payload(response) }
  }

  const firstPayload = {
    client_attempt_id: FIRST_ATTEMPT_ID,
    reply_to_turn_id: "rds-turn-1",
    transcript_text: "我会  先确认敏感风险，再从低刺激护理开始。",
  }
  const first = await submit(firstPayload)
  assert.equal(first.response.status, 200)
  assert.equal(first.body.deduped, false)
  assert.equal(first.body.reached_max_turns, false)
  assert.equal(rdsMock.turns.get(SESSION_ID).length, 3)

  const retry = await submit({ ...firstPayload, transcript_text: `  ${firstPayload.transcript_text}  ` })
  assert.equal(retry.response.status, 200)
  assert.equal(retry.body.deduped, true)
  assert.equal(retry.body.beautician_turn.turn_id, first.body.beautician_turn.turn_id)
  assert.equal(retry.body.next_customer_turn.turn_id, first.body.next_customer_turn.turn_id)
  assert.equal(rdsMock.turns.get(SESSION_ID).length, 3)

  const internalWhitespaceConflict = await submit({
    ...firstPayload,
    transcript_text: "我会 先确认敏感风险，再从低刺激护理开始。",
  })
  assert.equal(internalWhitespaceConflict.response.status, 409)
  assert.equal(internalWhitespaceConflict.body.code, "voice_coach_idempotency_conflict")
  assert.equal(rdsMock.turns.get(SESSION_ID).length, 3)

  const textConflict = await submit({ ...firstPayload, transcript_text: "同一 attempt 的不同回答" })
  assert.equal(textConflict.response.status, 409)
  assert.equal(textConflict.body.code, "voice_coach_idempotency_conflict")
  const targetConflict = await submit({ ...firstPayload, reply_to_turn_id: first.body.next_customer_turn.turn_id })
  assert.equal(targetConflict.response.status, 409)
  assert.equal(targetConflict.body.code, "voice_coach_idempotency_conflict")

  const stale = await submit({
    client_attempt_id: SECOND_ATTEMPT_ID,
    reply_to_turn_id: "rds-turn-1",
    transcript_text: "新的回答",
  })
  assert.equal(stale.response.status, 409)
  assert.equal(stale.body.code, "voice_coach_reply_target_stale")

  const second = await submit({
    client_attempt_id: SECOND_ATTEMPT_ID,
    reply_to_turn_id: first.body.next_customer_turn.turn_id,
    transcript_text: "这是针对最新顾客问题的回答",
  })
  assert.equal(second.response.status, 200)
  assert.equal(second.body.reached_max_turns, true)
  assert.equal(second.body.next_customer_turn, null)

  const overLimit = await submit({
    client_attempt_id: THIRD_ATTEMPT_ID,
    reply_to_turn_id: first.body.next_customer_turn.turn_id,
    transcript_text: "达到上限后的第三次回答",
  })
  assert.equal(overLimit.response.status, 409)
  assert.equal(overLimit.body.code, "voice_coach_reply_target_stale")
  assert.equal(rdsMock.turns.get(SESSION_ID).length, 4)

  const firstEndResponse = await endRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/end`),
    sessionContext(SESSION_ID),
  )
  const firstEnd = await payload(firstEndResponse)
  assert.equal(firstEndResponse.status, 200)
  assert.equal(firstEnd.deduped, false)
  const retryEndResponse = await endRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/end`),
    sessionContext(SESSION_ID),
  )
  const retryEnd = await payload(retryEndResponse)
  assert.equal(retryEndResponse.status, 200)
  assert.equal(retryEnd.deduped, true)
  assert.equal(retryEnd.session.ended_at, firstEnd.session.ended_at)
  assert.deepEqual(retryEnd.report, firstEnd.report)

  const retryAfterEnd = await submit(firstPayload)
  assert.equal(retryAfterEnd.response.status, 200)
  assert.equal(retryAfterEnd.body.deduped, true)
  const newAttemptAfterEnd = await submit({
    client_attempt_id: THIRD_ATTEMPT_ID,
    reply_to_turn_id: first.body.next_customer_turn.turn_id,
    transcript_text: "结束后的新 attempt",
  })
  assert.equal(newAttemptAfterEnd.response.status, 409)
  assert.equal(newAttemptAfterEnd.body.code, "voice_coach_session_ended")

  assert(!rdsMock.calls.includes("getAliyunRdsVoiceCoachTextSession"))
  assert.equal(rdsMock.turns.get(SESSION_ID).length, 4)
})

test("VC-L4-05 route repository selection fails fast on unknown mode", async () => {
  await withVoiceCoachRuntimeEnv({ appEnv: "test", mode: "mystery" }, async () => {
    resetAuthorizationChecks()
    const rdsMock = createRdsMock()
    const helperExports = compileTsModule(helperPath, helperStubs(rdsMock))
    const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")

    const createResponse = await sessionsRoute.POST(
      request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" }),
    )
    const created = await payload(createResponse)
    assert.equal(createResponse.status, 503)
    assert.equal(created.code, "voice_coach_repository_not_configured")
    assert.equal(created.error, "voice_coach_repository_not_configured")
    assert.doesNotMatch(JSON.stringify(created), /mystery|repository_mode_unsupported/)
    assert.deepEqual(rdsMock.calls, [])
    assert.equal(accountContextReadCount, 0)
    assertAuthorizationChecks(0)
  })
})

test("VC-L4-05 production-cn rejects every non-contract repository mode before local or RDS access", async (t) => {
  const cases = [
    { appEnv: "production-cn", mode: undefined },
    { appEnv: "production-cn", mode: "local_durable" },
    { appEnv: "test", appRegion: "cn-hangzhou", mode: "rds" },
    { appEnv: "production-cn", mode: "mystery" },
  ]
  const originalConsoleInfo = console.info
  const infoLogs = []
  console.info = (message) => {
    infoLogs.push(String(message))
  }
  t.after(() => {
    console.info = originalConsoleInfo
  })

  for (const runtimeCase of cases) {
    await withVoiceCoachRuntimeEnv(runtimeCase, async ({ storePath }) => {
      resetAuthorizationChecks()
      const rdsMock = createRdsMock()
      const helperExports = compileTsModule(helperPath, helperStubs(rdsMock))
      const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")

      const response = await sessionsRoute.POST(
        request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" }),
      )
      const body = await payload(response)

      assert.equal(response.status, 503)
      assert.deepEqual(body, {
        ok: false,
        error: "voice_coach_repository_not_configured",
        code: "voice_coach_repository_not_configured",
      })
      assert.equal(fs.existsSync(storePath), false)
      assert.deepEqual(rdsMock.calls, [])
      assert.doesNotMatch(JSON.stringify(body), /local_durable|mystery|sessions\.json|repository_mode_unsupported/)
      assert.equal(accountContextReadCount, 0)
      assertAuthorizationChecks(0)
    })
  }

  const timingEvents = infoLogs
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.event === "app_voice_coach_create_timing")
  assert.equal(timingEvents.length, cases.length)
  for (const event of timingEvents) {
    assert.equal(event.status, 503)
    assert.equal(event.error_class, "AppVoiceCoachRepositoryConfigurationError")
  }
})

test("VC-L4-05 production-cn accepts the explicit RDS contract mode without local filesystem access", async () => {
  await withVoiceCoachRuntimeEnv(
    { appEnv: "production-cn", mode: PRODUCTION_RDS_REPOSITORY_MODE },
    async ({ storePath }) => {
      resetAuthorizationChecks()
      const rdsMock = createRdsMock()
      const helperExports = compileTsModule(helperPath, helperStubs(rdsMock))
      const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")

      const response = await sessionsRoute.POST(
        request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" }),
      )
      const body = await payload(response)

      assert.equal(response.status, 201)
      assert.equal(body.repository_mode, PRODUCTION_RDS_REPOSITORY_MODE)
      assert.equal(fs.existsSync(storePath), false)
      assert.deepEqual(rdsMock.calls, ["createAliyunRdsVoiceCoachTextSession"])
      assert.equal(accountContextReadCount, 1)
      assertAuthorizationChecks(1)
    },
  )
})

test("VC-L4-05 non-production runtime keeps missing mode compatible with the local repository", async () => {
  await withVoiceCoachRuntimeEnv({ appEnv: "test", mode: undefined }, async ({ storePath }) => {
    resetAuthorizationChecks()
    const rdsMock = createRdsMock()
    const helperExports = compileTsModule(helperPath, helperStubs(rdsMock))
    const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")

    const response = await sessionsRoute.POST(
      request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" }),
    )
    const body = await payload(response)

    assert.equal(response.status, 201)
    assert.equal(body.repository_mode, "text_first_local_durable_session_store")
    assert.equal(fs.existsSync(storePath), true)
    assert.deepEqual(rdsMock.calls, [])
    assert.equal(accountContextReadCount, 1)
    assertAuthorizationChecks(1)
  })
})

test("VC-L4-05 production-cn rejects invalid repository mode for TTS and ASR before account access", async () => {
  await withVoiceCoachRuntimeEnv(
    { appEnv: "production-cn", mode: "rds" },
    async () => {
      resetAuthorizationChecks()
      const rdsMock = createRdsMock()
      const helperExports = compileTsModule(helperPath, helperStubs(rdsMock))
      const ttsRoute = routeModule(
        helperExports,
        "app",
        "api",
        "app",
        "voice-coach",
        "sessions",
        "[sessionId]",
        "turns",
        "[turnId]",
        "tts",
        "route.ts",
      )
      const asrRoute = routeModule(
        helperExports,
        "app",
        "api",
        "app",
        "voice-coach",
        "sessions",
        "[sessionId]",
        "asr-preview",
        "route.ts",
      )

      const ttsResponse = await ttsRoute.POST(
        request("https://local.test/not-a-uuid/turns/turn-1/tts"),
        { params: Promise.resolve({ sessionId: "not-a-uuid", turnId: "turn-1" }) },
      )
      const asrResponse = await asrRoute.POST(
        request("https://local.test/not-a-uuid/asr-preview"),
        sessionContext("not-a-uuid"),
      )

      for (const response of [ttsResponse, asrResponse]) {
        assert.equal(response.status, 503)
        assert.deepEqual(await payload(response), {
          ok: false,
          error: "voice_coach_repository_not_configured",
          code: "voice_coach_repository_not_configured",
        })
      }
      assert.equal(accountContextReadCount, 0)
      assertAuthorizationChecks(0)
      assert.deepEqual(rdsMock.calls, [])
    },
  )
})

test("VC-L4-05 route requires an active membership before any voice-coach repository access", async (t) => {
  resetAuthorizationChecks()
  setAccountContext({ membershipId: null })
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")

  const response = await sessionsRoute.GET(request("https://local.test/api/app/voice-coach/sessions"))
  const body = await payload(response)

  assert.equal(response.status, 403)
  assert.equal(body.code, "tenant_scope_denied")
  assert.deepEqual(rdsMock.calls, [])
})

test("VC-L4-05 route fails closed when company, store, or membership changes after RDS create", async (t) => {
  resetAuthorizationChecks()
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")
  const detailRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "route.ts")
  const eventsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "events", "route.ts")
  const submitRoute = routeModule(
    helperExports,
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "[sessionId]",
    "beautician-turn",
    "submit",
    "route.ts",
  )
  const endRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "end", "route.ts")
  const reportRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "report", "route.ts")

  const scopeChanges = [
    ["company", { companyId: "company-chunshe-2" }],
    ["store", { storeId: "store-chunshe-2" }],
    ["membership", { membershipId: "membership-route-rds-2" }],
  ]
  for (const [dimension, changedAccount] of scopeChanges) {
    setAccountContext({})
    rdsMock.calls.length = 0
    rdsMock.callArgs.length = 0
    const createResponse = await sessionsRoute.POST(
      request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" }),
    )
    assert.equal(createResponse.status, 201, `${dimension} case must create an owner session`)
    const originalSession = rdsMock.sessions.get(SESSION_ID)
    assert.equal(originalSession.status, "active")

    setAccountContext(changedAccount)
    const listResponse = await sessionsRoute.GET(request("https://local.test/api/app/voice-coach/sessions"))
    assert.deepEqual((await payload(listResponse)).sessions, [], `${dimension} change must hide history`)

    const responses = await Promise.all([
      detailRoute.GET(request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}`), sessionContext(SESSION_ID)),
      eventsRoute.GET(request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/events`), sessionContext(SESSION_ID)),
      submitRoute.POST(
        audioSubmitRequest(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/beautician-turn/submit`, {
          client_attempt_id: `${dimension}-attempt-0001`,
          reply_to_turn_id: "rds-turn-1",
          transcript_text: "不应写入",
        }),
        sessionContext(SESSION_ID),
      ),
      reportRoute.GET(request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/report`), sessionContext(SESSION_ID)),
      endRoute.POST(request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/end`), sessionContext(SESSION_ID)),
    ])
    for (const response of responses) {
      const body = await payload(response)
      assert.equal(response.status, 404, `${dimension} change must fail closed`)
      assert.equal(body.code, "voice_coach_session_not_found")
    }
    assert.equal(rdsMock.calls.filter((name) => name === "appendAliyunRdsVoiceCoachTextReply").length, 1)
    assert.equal(rdsMock.calls.filter((name) => name === "endAliyunRdsVoiceCoachTextSession").length, 1)
    assert.equal(originalSession.status, "active", `${dimension} change must not end original session`)
    assert.equal(originalSession.report_json, null, `${dimension} change must not write original report`)
  }
})

test("VC-L4-05 malformed RDS session ids skip repository while canonical UUIDv7 reaches it", async (t) => {
  resetAuthorizationChecks()
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const malformedId = "not-a-uuid"
  const detailRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "route.ts")
  const eventsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "events", "route.ts")
  const submitRoute = routeModule(
    helperExports,
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "[sessionId]",
    "beautician-turn",
    "submit",
    "route.ts",
  )
  const endRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "end", "route.ts")
  const reportRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "report", "route.ts")

  const responses = await Promise.all([
    detailRoute.GET(request(`https://local.test/${malformedId}`), sessionContext(malformedId)),
    eventsRoute.GET(request(`https://local.test/${malformedId}/events`), sessionContext(malformedId)),
    submitRoute.POST(
      audioSubmitRequest(`https://local.test/${malformedId}/submit`, { transcript_text: "不会写入" }),
      sessionContext(malformedId),
    ),
    reportRoute.GET(request(`https://local.test/${malformedId}/report`), sessionContext(malformedId)),
    endRoute.POST(request(`https://local.test/${malformedId}/end`), sessionContext(malformedId)),
  ])
  for (const response of responses) {
    const body = await payload(response)
    assert.equal(response.status, 404)
    assert.equal(body.error, "voice_coach_session_not_found")
    assert.equal(body.code, "voice_coach_session_not_found")
  }
  assert.deepEqual(rdsMock.calls, [])

  const canonicalV7Id = "019f4f78-6dc8-73b1-8123-91f4aff1a7e2"
  const canonicalV7Response = await detailRoute.GET(
    request(`https://local.test/${canonicalV7Id}`),
    sessionContext(canonicalV7Id),
  )
  assert.equal(canonicalV7Response.status, 404)
  assert.deepEqual(rdsMock.calls, ["getAliyunRdsVoiceCoachTextSession"])
})

test("VC-L4-05 malformed and foreign RDS selections preserve stable mini-program 400 codes", async (t) => {
  resetAuthorizationChecks()
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")

  const cases = [
    [{ customer_profile_id: "not-a-uuid" }, "customer_profile_not_found", false],
    [{ customer_profile_id: FOREIGN_ID }, "customer_profile_not_found", true],
    [{ scene_card_id: "not-a-uuid" }, "scene_card_not_found", false],
    [{ scene_card_id: FOREIGN_ID }, "scene_card_not_found", true],
  ]
  for (const [selection, code, shouldReachRepository] of cases) {
    rdsMock.calls.length = 0
    rdsMock.callArgs.length = 0
    const response = await sessionsRoute.POST(
      request("https://local.test/api/app/voice-coach/sessions", {
        scenario_id: "objection_safety",
        ...selection,
      }),
    )
    const body = await payload(response)
    assert.equal(response.status, 400)
    assert.equal(body.error, code)
    assert.equal(body.code, code)
    assert.equal(rdsMock.calls.includes("createAliyunRdsVoiceCoachTextSession"), shouldReachRepository)
  }
})

test("VC-L4-05 unexpected RDS failures return only the stable route fallback code", async (t) => {
  resetAuthorizationChecks()
  const { helperExports } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")
  const originalConsoleInfo = console.info
  const infoLogs = []
  console.info = (message) => {
    infoLogs.push(String(message))
  }
  t.after(() => {
    console.info = originalConsoleInfo
  })

  const response = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "explode" }),
  )
  const body = await payload(response)

  assert.equal(response.status, 500)
  assert.equal(body.error, "app_voice_coach_session_create_failed")
  assert.equal(body.code, "app_voice_coach_session_create_failed")
  assert.doesNotMatch(JSON.stringify(body), /secret_table|private\/backend|select \*/i)
  const timingEvent = infoLogs
    .map((line) => JSON.parse(line))
    .find((entry) => entry.event === "app_voice_coach_create_timing")
  assert.ok(timingEvent)
  assert.equal(timingEvent.status, 500)
  assert.equal(timingEvent.error_class, "Error")
})

test("VC-L4-05 local durable sessions are isolated by membership as well as user and tenant", async (t) => {
  resetAuthorizationChecks()
  const { helperExports } = compileHelperWithMode(t, "local_durable")
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")
  const detailRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "route.ts")

  const createResponse = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" }),
  )
  const created = await payload(createResponse)
  assert.equal(createResponse.status, 201)

  setAccountContext({ membershipId: "membership-route-rds-2" })
  const hiddenList = await payload(await sessionsRoute.GET(request("https://local.test/api/app/voice-coach/sessions")))
  assert.deepEqual(hiddenList.sessions, [])
  const hiddenDetailResponse = await detailRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}`),
    sessionContext(created.session_id),
  )
  assert.equal(hiddenDetailResponse.status, 404)

  setAccountContext({ membershipId: testAccountContext.membershipId })
  const ownerDetailResponse = await detailRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}`),
    sessionContext(created.session_id),
  )
  assert.equal(ownerDetailResponse.status, 200)
})

test("VC-G4A-03 production RDS mode returns scoped TTS and ASR audio contracts", async () => {
  await withVoiceCoachRuntimeEnv(
    { appEnv: "production-cn", mode: PRODUCTION_RDS_REPOSITORY_MODE },
    async () => {
      resetAuthorizationChecks()
      const rdsMock = createRdsMock()
      const helperExports = compileTsModule(helperPath, helperStubs(rdsMock))
      const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")
      const ttsRoute = routeModule(
        helperExports,
        "app",
        "api",
        "app",
        "voice-coach",
        "sessions",
        "[sessionId]",
        "turns",
        "[turnId]",
        "tts",
        "route.ts",
      )
      const asrRoute = routeModule(
        helperExports,
        "app",
        "api",
        "app",
        "voice-coach",
        "sessions",
        "[sessionId]",
        "asr-preview",
        "route.ts",
      )

      const created = await payload(
        await sessionsRoute.POST(request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" })),
      )
      const ttsResponse = await ttsRoute.POST(
        request(`https://local.test/${created.session_id}/turns/${created.first_customer_turn.turn_id}/tts`),
        { params: Promise.resolve({ sessionId: created.session_id, turnId: created.first_customer_turn.turn_id }) },
      )
      const asrResponse = await asrRoute.POST(
        request(`https://local.test/${created.session_id}/asr-preview`, { audio_b64: "AQID", format: "mp3" }),
        sessionContext(created.session_id),
      )

      for (const response of [ttsResponse, asrResponse]) {
        const body = await payload(response)
        assert.equal(response.status, 200)
        assert.equal(body.ok, true)
        assert.equal(body.repository_mode, PRODUCTION_RDS_REPOSITORY_MODE)
        assert.equal("local_side_effects" in body, false)
        assert.doesNotMatch(JSON.stringify(body), /local_durable/)
      }
      assert.equal((await payload(ttsResponse)).audio_url.startsWith("https://audio.test/"), true)
      assert.equal((await payload(asrResponse)).text, "转写")
    },
  )
})

test("VC-L4-10B route create emits sanitized timing evidence for RDS mode", async (t) => {
  resetAuthorizationChecks()
  const { helperExports } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")
  const originalConsoleInfo = console.info
  const infoLogs = []
  console.info = (message) => {
    infoLogs.push(String(message))
  }
  t.after(() => {
    console.info = originalConsoleInfo
  })

  const createResponse = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", {
      customer_profile_id: CUSTOMER_PROFILE_ID,
      scenario_id: "objection_safety",
      scene_card_id: SCENE_CARD_ID,
    }),
  )
  assert.equal(createResponse.status, 201)

  const timingEvents = infoLogs
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.event === "app_voice_coach_create_timing")

  assert.equal(timingEvents.length, 1)
  const timingEvent = timingEvents[0]
  assert.match(timingEvent.request_id, /^[0-9a-f]{12}$/)
  assert.equal(timingEvent.repository_mode, "rds_voice_coach_text_session_contract")
  assert.equal(timingEvent.status, 201)
  assert.equal(timingEvent.session_id_fragment, "77777777...77777")
  assert(Number.isInteger(timingEvent.total_ms))
  assert.deepEqual(
    timingEvent.stages.map((stage) => stage.name),
    ["auth_context", "body_read", "rds_repository_import", "rds_prepare_payload", "rds_mock_create"],
  )
  for (const stage of timingEvent.stages) {
    assert(Number.isInteger(stage.duration_ms), `stage ${stage.name} must include integer duration_ms`)
  }

  const serialized = JSON.stringify(timingEvent)
  assert.doesNotMatch(serialized, /Authorization|DATABASE_URL_CN|postgres:\/\//i)
  assert.doesNotMatch(serialized, /我担心皮肤敏感|我会先确认敏感风险/)
  assert.doesNotMatch(serialized, new RegExp(CUSTOMER_PROFILE_ID))
  assert.doesNotMatch(serialized, new RegExp(SCENE_CARD_ID))
  assertAuthorizationChecks(1)
})
