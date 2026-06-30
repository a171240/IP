const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const source = fs.readFileSync(path.join(root, "app", "api", "app", "health", "route.ts"), "utf8")

test("APP health route uses Aliyun production-cn readiness instead of legacy Supabase blockers", () => {
  assert.match(source, /isAliyunRdsConfigured/)
  assert.match(source, /isAliyunRdsServiceRecordOssConfigured/)
  assert.match(source, /mode: productionCn \? "aliyun-production-cn" : "legacy"/)
  assert.match(source, /supabase: "not_required_for_aliyun_production_cn"/)
  assert.match(source, /appWechatLogin: getWechatOpenAppReviewStatus\(\)/)

  const aliyunGroups = source.match(/const ALIYUN_REQUIRED_RUNTIME_GROUPS = \{([\s\S]*?)\} as const/)
  assert.ok(aliyunGroups)
  assert.doesNotMatch(aliyunGroups[1], /supabase/)
  assert.doesNotMatch(aliyunGroups[1], /appWechatLogin/)
})
