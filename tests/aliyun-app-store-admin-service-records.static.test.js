const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

test("APP store-admin service records route is a manager-only Aliyun RDS facade", () => {
  const source = read("app", "api", "app", "store-admin", "service-records", "route.ts")

  assert.match(source, /export const runtime = "nodejs"/)
  assert.match(source, /resolveAliyunRdsStoreManagerAuth\(request\)/)
  assert.match(source, /listAliyunRdsServiceRecordSessions/)
  assert.match(source, /accountPayload\(auth\.ctx\)/)
  assert.match(source, /sessions: sessions\.map\(toPublicSession\)/)
  assert.match(source, /customer_profile_id/)
  assert.match(source, /company_id/)
  assert.match(source, /store_id/)
  assert.match(source, /store_admin_service_records_failed/)
  assert.doesNotMatch(source, /createServerSupabaseClientForRequest/)
  assert.doesNotMatch(source, /requireStoreManagerContext/)
})
