/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

const A2_TARGET_FILES = [
  "app/api/app/service-records/sessions/[sessionId]/oss-upload/route.ts",
  "app/api/app/service-records/sessions/[sessionId]/segments/oss/route.ts",
  "app/api/app/service-records/sessions/[sessionId]/segments/route.ts",
  "lib/aliyun-rds/repositories/service-record-processing.server.ts",
  "lib/aliyun-rds/service-record-asr.server.ts",
  "lib/aliyun-rds/service-record-oss.server.ts",
]

test("A2 service-record OSS runtime credentials support short-lived App upload and read paths", () => {
  const oss = read("lib", "aliyun-rds", "service-record-oss.server.ts")

  assert.match(oss, /type AliyunOssAccessCredentialSource = "env" \| "metadata" \| "oidc"/)
  assert.match(oss, /async function getAliyunOssAccessCredential\(\): Promise<AliyunOssAccessCredential>/)
  assert.match(oss, /source:\s*"env"/)
  assert.match(oss, /securityToken: getAliyunOssSecurityToken\(\) \|\| undefined/)
  assert.match(oss, /Action:\s*"AssumeRoleWithOIDC"/)
  assert.match(oss, /source:\s*"oidc"/)
  assert.match(oss, /http:\/\/100\.100\.100\.200\/latest/)
  assert.match(oss, /X-aliyun-ecs-metadata-token-ttl-seconds/)
  assert.match(oss, /X-aliyun-ecs-metadata-token/)
  assert.match(oss, /ALIYUN_OSS_METADATA_ALLOW_IMDS_V1/)
  assert.match(oss, /source:\s*"metadata"/)
  assert.match(oss, /if \(!token && !allowImdsV1\) throw new Error\("aliyun_oss_metadata_token_missing"\)/)
  assert.match(
    oss,
    /return Boolean\(bucket && \(envCredentialsReady \|\| oidcReady \|\| getAliyunOssRuntimeRoleName\(\)\)\)/,
  )

  assert.match(oss, /export async function createAliyunRdsServiceRecordOssPostPolicy/)
  assert.match(oss, /conditions\.push\(\["eq", "\$x-oss-security-token", credential\.securityToken\]\)/)
  assert.match(oss, /fields\["x-oss-security-token"\] = credential\.securityToken/)
  assert.match(oss, /export async function createAliyunRdsServiceRecordOssSignedGetUrl/)
  assert.match(oss, /params\.set\("security-token", credential\.securityToken\)/)
  assert.match(oss, /export async function uploadAliyunRdsServiceRecordOssObject/)
  assert.match(oss, /headers\["x-oss-security-token"\] = credential\.securityToken/)
})

test("A2 service-record App routes keep auth, tenant scope, and awaited async OSS helpers", () => {
  const uploadRoute = read("app", "api", "app", "service-records", "sessions", "[sessionId]", "oss-upload", "route.ts")
  const segmentsRoute = read("app", "api", "app", "service-records", "sessions", "[sessionId]", "segments", "route.ts")
  const segmentsOssRoute = read("app", "api", "app", "service-records", "sessions", "[sessionId]", "segments", "oss", "route.ts")
  const processing = read("lib", "aliyun-rds", "repositories", "service-record-processing.server.ts")
  const asr = read("lib", "aliyun-rds", "service-record-asr.server.ts")
  const oss = read("lib", "aliyun-rds", "service-record-oss.server.ts")

  for (const routeSource of [uploadRoute, segmentsRoute, segmentsOssRoute]) {
    assert.match(routeSource, /resolveAliyunRdsServiceRecordAuth\(request\)/)
    assert.match(routeSource, /getAliyunRdsOwnedServiceRecordSession\(ctx, id\)/)
    assert.match(routeSource, /serviceRecordAppendClosed\(session\.status\)/)
  }

  assert.match(segmentsRoute, /source:\s*"app_service_record"/)
  assert.match(segmentsOssRoute, /source:\s*"app_service_record"/)
  assert.match(uploadRoute, /await createAliyunRdsServiceRecordOssPostPolicy\(/)
  assert.match(segmentsRoute, /await uploadAliyunRdsServiceRecordOssObject\(/)
  assert.match(segmentsRoute, /await createAliyunRdsSignedAudioUrlForBailian\(segment\)/)
  assert.match(segmentsOssRoute, /await createAliyunRdsSignedAudioUrlForBailian\(segment\)/)
  assert.match(processing, /await createAliyunRdsSignedAudioUrlForBailian\(segment\)/)
  assert.match(processing, /playbackUrl:\s*await createAliyunRdsServiceRecordOssSignedGetUrl\(segment\.storage_path\)/)
  assert.match(asr, /export async function createAliyunRdsSignedAudioUrlForBailian/)
  assert.match(asr, /return createAliyunRdsServiceRecordOssSignedGetUrl\(storagePath\)/)

  assert.match(oss, /getAliyunRdsServiceRecordOssPrefix\(\)/)
  assert.match(oss, /pathSafe\(opts\.session\?\.company_id \|\| "no-company"\)/)
  assert.match(oss, /pathSafe\(opts\.session\?\.store_id \|\| "no-store"\)/)
  assert.match(oss, /pathSafe\(opts\.session\?\.id\)/)
})

test("A2 service-record OSS candidate stays inside backend first-version scope", () => {
  const combined = A2_TARGET_FILES.map((file) => read(file)).join("\n")

  assert.doesNotMatch(combined, /createServerSupabaseClientForRequest|@\/lib\/supabase|lib\/supabase/)
  assert.doesNotMatch(combined, /app\/api\/app\/(?:posters|xhs|private-copy|content-drafts)/)
  assert.doesNotMatch(combined, /@\/lib\/.*(?:poster|xhs|private-copy|content-drafts)/)
  assert.doesNotMatch(combined, /voice-coach-ws/)
  assert.doesNotMatch(combined, /DASHSCOPE_API_KEY\s*=|ALIYUN_OSS_ACCESS_KEY_SECRET\s*=|ALIBABA_CLOUD_ACCESS_KEY_SECRET\s*=/)
})
