const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const ossSource = fs.readFileSync(path.join(root, "lib", "service-records", "aliyun-oss.server.ts"), "utf8")
const envPlanSource = fs.readFileSync(path.join(root, "scripts", "prepare-aliyun-runtime-env.mjs"), "utf8")

test("Aliyun OSS signer supports optional STS security token", () => {
  assert.match(ossSource, /function getAliyunOssSecurityToken/)
  assert.match(ossSource, /ALIYUN_OSS_SECURITY_TOKEN/)
  assert.match(ossSource, /SERVICE_RECORD_OSS_SECURITY_TOKEN/)
  assert.match(ossSource, /\$x-oss-security-token/)
  assert.match(ossSource, /fields\["x-oss-security-token"\] = securityToken/)
  assert.match(ossSource, /params\.set\("security-token", securityToken\)/)
})

test("Aliyun env import plan treats OSS security token as optional secret", () => {
  assert.match(envPlanSource, /"ALIYUN_OSS_SECURITY_TOKEN"/)
  assert.match(envPlanSource, /key === "ALIYUN_OSS_SECURITY_TOKEN"/)
  assert.match(envPlanSource, /可选临时凭证 token/)
})
