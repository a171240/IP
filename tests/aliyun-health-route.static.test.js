const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const source = fs.readFileSync(path.join(root, "app", "api", "app", "health", "route.ts"), "utf8")
const postgresSource = fs.readFileSync(path.join(root, "lib", "aliyun-rds", "postgres.server.ts"), "utf8")
const kmsSource = fs.readFileSync(path.join(root, "lib", "aliyun-rds", "kms-secret.server.ts"), "utf8")
const ossSource = fs.readFileSync(path.join(root, "lib", "aliyun-rds", "service-record-oss.server.ts"), "utf8")
const asrSource = fs.readFileSync(path.join(root, "lib", "aliyun-rds", "service-record-asr.server.ts"), "utf8")
const healthSmokeSource = fs.readFileSync(path.join(root, "scripts", "smoke-aliyun-health.mjs"), "utf8")

test("APP health route uses Aliyun production-cn readiness instead of legacy Supabase blockers", () => {
  assert.match(source, /isAliyunRdsConfigured/)
  assert.match(source, /isAliyunRdsServiceRecordOssConfigured/)
  assert.match(source, /isAppVoiceCoachProductionRepositoryModeConfigured/)
  assert.match(
    source,
    /voiceCoachTextRepository:\s*isAppVoiceCoachProductionRepositoryModeConfigured\(\)/,
  )
  assert.match(source, /mode: productionCn \? "aliyun-production-cn" : "legacy"/)
  assert.match(source, /supabase: "not_required_for_aliyun_production_cn"/)
  assert.match(source, /appWechatLogin: getWechatOpenAppReviewStatus\(\)/)

  const aliyunGroups = source.match(/const ALIYUN_REQUIRED_RUNTIME_GROUPS = \{([\s\S]*?)\} as const/)
  assert.ok(aliyunGroups)
  assert.doesNotMatch(aliyunGroups[1], /supabase/)
  assert.doesNotMatch(aliyunGroups[1], /appWechatLogin/)
})

test("APP health readiness treats TODO placeholders as missing runtime configuration", () => {
  assert.match(postgresSource, /readConfiguredTextEnv\("DATABASE_URL_CN"\)/)
  assert.match(postgresSource, /!value\.startsWith\("TODO_"\)/)
  assert.match(kmsSource, /!value\.startsWith\("TODO_"\)/)
  assert.match(ossSource, /!value\.startsWith\("TODO_"\)/)
  assert.match(asrSource, /!value\.startsWith\("TODO_"\)/)
  assert.match(healthSmokeSource, /getEnvText\(env, "DATABASE_URL_CN"\)/)
  assert.match(healthSmokeSource, /APP_VOICE_COACH_TEXT_REPOSITORY_MODE/)
  assert.match(healthSmokeSource, /voiceCoachTextRepository/)
  assert.match(healthSmokeSource, /rds_voice_coach_text_session_contract/)
  assert.doesNotMatch(healthSmokeSource, /return Boolean\(getRawEnvText\(env, "DATABASE_URL_CN"\)/)
})
