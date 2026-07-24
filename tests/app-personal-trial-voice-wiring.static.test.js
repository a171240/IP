/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), "utf8")
}

test("personal trial ASR receipts bind one server transcript to the submitted audio hash", () => {
  const migration = read("deploy", "app-access-control-v1.sql")
  const rollback = read("deploy", "app-access-control-v1.rollback.sql")
  const rdsRepository = read(
    "lib",
    "aliyun-rds",
    "repositories",
    "app-voice-coach-rds.server.ts",
  )
  const facade = read(
    "lib",
    "aliyun-rds",
    "repositories",
    "app-voice-coach-facade.server.ts",
  )

  assert.match(
    migration,
    /create table public\.app_personal_trial_asr_receipts/i,
  )
  for (const column of [
    "session_id",
    "canonical_user_id",
    "audio_sha256",
    "transcript_text",
    "provider_request_id",
    "claimed_turn_id",
  ]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`, "i"), column)
  }
  assert.match(
    migration,
    /unique\s*\(\s*session_id\s*,\s*audio_sha256\s*\)/i,
  )
  assert.match(
    rollback,
    /drop table if exists public\.app_personal_trial_asr_receipts/i,
  )
  assert.match(
    migration,
    /create table public\.app_personal_trial_asr_processing_leases/i,
  )
  assert.match(
    migration,
    /primary key\s*\(\s*session_id\s*,\s*audio_sha256\s*\)/i,
  )
  assert.match(
    migration,
    /owner_token uuid not null[\s\S]*expires_at timestamptz not null/i,
  )
  assert.match(
    rollback,
    /exists\s*\(\s*select 1 from public\.app_personal_trial_asr_processing_leases/i,
  )
  assert.match(
    rollback,
    /drop table if exists public\.app_personal_trial_asr_processing_leases/i,
  )

  assert.match(rdsRepository, /persistAliyunRdsPersonalTrialAsrReceipt/)
  assert.match(rdsRepository, /resolveAliyunRdsPersonalTrialAsrReceipt/)
  assert.match(rdsRepository, /claimAliyunRdsPersonalTrialAsrProcessing/)
  assert.match(rdsRepository, /abandonAliyunRdsPersonalTrialAsrProcessing/)
  assert.match(rdsRepository, /pg_advisory_xact_lock/)
  assert.match(rdsRepository, /personalTrialAsrReceiptId/)
  assert.match(rdsRepository, /submittedAudioSha256/)
  assert.match(rdsRepository, /claimed_turn_id is null/i)
  assert.match(rdsRepository, /voice_coach_rds_asr_receipt_required/)

  assert.match(facade, /createHash\("sha256"\)/)
  assert.match(facade, /persistAliyunRdsPersonalTrialAsrReceipt/)
  assert.match(facade, /resolveAliyunRdsPersonalTrialAsrReceipt/)
  assert.match(facade, /voice_coach_asr_provider_unavailable/)
  assert.match(facade, /settlePersonalTrialAsrProcessingFailure/)
  assert.match(
    facade,
    /replyText:\s*personalTrialAsrReceipt\s*\?\s*personalTrialAsrReceipt\.transcriptText/,
  )
})

test("four persisted server stages produce the only round one completion event", () => {
  const facade = read(
    "lib",
    "aliyun-rds",
    "repositories",
    "app-voice-coach-facade.server.ts",
  )

  for (const stage of [
    "opening_tts_ready",
    "recording_received",
    "asr_succeeded",
    "next_turn_tts_ready",
  ]) {
    assert.match(facade, new RegExp(`"${stage}"`), stage)
  }
  assert.match(facade, /recordPersonalTrialVoiceEvidence/)
  assert.match(
    facade,
    /completionEventId:\s*`round_1_completed:\$\{args\.sessionId\}`/,
  )
  assert.match(facade, /completePersonalTrialFirstRound/)
  assert.doesNotMatch(
    facade,
    /opts\.body\.(?:completion|evidence|technicalFailure)/,
  )
})

test("only server technical failures map to the four release reasons", () => {
  const facade = read(
    "lib",
    "aliyun-rds",
    "repositories",
    "app-voice-coach-facade.server.ts",
  )

  for (const reason of [
    "opening_tts_failed",
    "recording_receive_failed",
    "asr_failed",
    "next_turn_tts_failed",
  ]) {
    assert.match(facade, new RegExp(`"${reason}"`), reason)
  }
  assert.match(facade, /releasePersonalTrialVoiceSession/)
  assert.doesNotMatch(
    facade,
    /(?:invalid_payload|audio_cancel|client_attempt_id_invalid)[\s\S]{0,160}releasePersonalTrialVoiceSession/,
  )
})

test("expired reservations expose an Aliyun-scheduled authenticated sweep", () => {
  const repository = read(
    "lib",
    "aliyun-rds",
    "repositories",
    "app-access-control.server.ts",
  )
  const cronRoute = read(
    "app",
    "api",
    "cron",
    "personal-trial-reservations",
    "route.ts",
  )
  const vercel = JSON.parse(read("vercel.json"))
  const aliyunRuntimePlan = JSON.parse(
    read("deploy", "aliyun-production-cn.runtime-plan.json"),
  )

  assert.match(repository, /expireAllPersonalTrialVoiceReservations/)
  assert.match(repository, /for update skip locked/i)
  assert.match(repository, /personal_trial\.voice_session_expired/)
  assert.match(
    cronRoute,
    /process\.env\.PERSONAL_TRIAL_EXPIRY_CRON_SECRET/,
  )
  assert.doesNotMatch(cronRoute, /process\.env\.CRON_SECRET/)
  assert.match(cronRoute, /Bearer \$\{secret\}/)
  assert.match(cronRoute, /expireAllPersonalTrialVoiceReservations/)
  assert.equal(aliyunRuntimePlan.target.provider, "SAE")
  assert.equal(aliyunRuntimePlan.target.runtime, "custom-container")
  assert.equal(Array.isArray(aliyunRuntimePlan.scheduledRequests), true)
  const expiryScheduler = aliyunRuntimePlan.scheduledRequests.find(
    (scheduledRequest) =>
      scheduledRequest.id === "PERSONAL_TRIAL_RESERVATION_EXPIRY",
  )
  assert.equal(expiryScheduler.provider, "Aliyun EventBridge")
  assert.equal(expiryScheduler.schedule.cronExpression, "0 */5 * * * *")
  assert.equal(expiryScheduler.schedule.timeZone, "GMT+8:00")
  assert.deepEqual(expiryScheduler.topology, {
    eventBusName: "meiye-huajing-production-cn",
    eventSourceName: "personal-trial-reservation-expiry-5m",
    connectionName: "personal-trial-reservation-expiry-prod-cn",
    apiDestinationName: "personal-trial-reservation-expiry-prod-cn",
    ruleName: "personal-trial-reservation-expiry-5m",
  })
  assert.equal(expiryScheduler.target.type, "API destination")
  assert.equal(expiryScheduler.target.method, "GET")
  assert.equal(
    expiryScheduler.target.url,
    "https://api-cn.ipgongchang.xin/api/cron/personal-trial-reservations",
  )
  assert.equal(expiryScheduler.target.authentication.headerName, "Authorization")
  assert.equal(
    expiryScheduler.target.authentication.secretName,
    "PERSONAL_TRIAL_EXPIRY_CRON_SECRET",
  )
  assert.equal(expiryScheduler.rule.initialStatus, "DISABLE")
  assert.equal(expiryScheduler.eventTarget.pushRetryStrategy, "BACKOFF_RETRY")
  assert.equal(expiryScheduler.eventTarget.errorsTolerance, "ALL")
  assert.equal(expiryScheduler.eventTarget.deadLetterQueue.enabled, false)
  assert.equal(expiryScheduler.requiredBeforePersonalTrialPublicEnable, true)
  assert.equal(Object.hasOwn(expiryScheduler, "provisioned"), false)
  assert.equal(Object.hasOwn(expiryScheduler, "verificationStatus"), false)
  assert.equal(
    vercel.crons.some(
      (cron) => cron.path === "/api/cron/personal-trial-reservations",
    ),
    false,
  )
})

test("public trial voice access requires both public and event-wiring switches", () => {
  const repository = read(
    "lib",
    "aliyun-rds",
    "repositories",
    "app-access-control.server.ts",
  )

  assert.match(repository, /PERSONAL_TRIAL_AI_COACH_PUBLIC_ENABLED/)
  assert.match(repository, /PERSONAL_TRIAL_VOICE_EVENTS_READY/)
  assert.match(repository, /personalTrialVoiceEventsReady/)
  assert.match(
    repository,
    /personalTrialAiCoachPublicEnabled[\s\S]*personalTrialVoiceEventsReady\(\)/,
  )
})
