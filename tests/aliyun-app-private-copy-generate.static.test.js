const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

test("APP private-copy generate persists a non-AI RDS draft bridge", () => {
  const route = read("app", "api", "app", "private-copy", "generate", "route.ts")
  const helper = read("lib", "aliyun-rds", "repositories", "app-content-workflows.server.ts")

  assert.match(route, /createAppContentWorkflowDraft/)
  assert.doesNotMatch(route, /appContentAcceptedResponse/)
  assert.match(route, /action: "private_copy\.generate"/)
  assert.match(route, /kind: "private_copy"/)

  assert.match(helper, /export async function createAppContentWorkflowDraft/)
  assert.match(helper, /insert into public\.content_drafts/)
  assert.match(helper, /company_id, store_id, kind, title, body, source_context, status/)
  assert.match(helper, /values \(\$1, \$2, \$3, \$4, \$5, \$6::jsonb, 'draft'/)
  assert.match(helper, /ctx\.membershipId/)
  assert.match(helper, /returning id, company_id, store_id, kind, title, body, source_context, status/)
  assert.match(helper, /generation_status: "persisted_bridge"/)
  assert.match(helper, /APP_CONTENT_DRAFT_BRIDGE_CODE = "app_content_draft_persisted_bridge"/)
  assert.match(helper, /code: APP_CONTENT_DRAFT_BRIDGE_CODE/)
  assert.match(helper, /draft: toPublicContentDraft\(/)
})

test("APP private-copy draft bridge keeps AI generation and billing disabled", () => {
  const route = read("app", "api", "app", "private-copy", "generate", "route.ts")
  const helper = read("lib", "aliyun-rds", "repositories", "app-content-workflows.server.ts")
  const combined = `${route}\n${helper}`

  assert.match(helper, /APP_CONTENT_DRAFT_BRIDGE_FORBIDDEN_SIDE_EFFECTS/)
  assert.match(helper, /"ai_generation"/)
  assert.match(helper, /"ai_point_charge"/)
  assert.match(helper, /"external_publish"/)
  assert.doesNotMatch(helper, /APP_CONTENT_DRAFT_BRIDGE_FORBIDDEN_SIDE_EFFECTS[\s\S]*"production_write"/)
  assert.doesNotMatch(combined, /resolveMpAiBillingContext/)
  assert.doesNotMatch(combined, /chargeMpAiPoints/)
  assert.doesNotMatch(combined, /refundMpAiPoints/)
  assert.doesNotMatch(combined, /generatePrivateCopyContent/)
  assert.doesNotMatch(combined, /private_copy_drafts/)
  assert.doesNotMatch(combined, /createServerSupabaseClientForRequest/)
  assert.doesNotMatch(combined, /\bfetch\(/)
})
