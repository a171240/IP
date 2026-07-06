/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

function pattern(parts) {
  return new RegExp(parts.join(""))
}

test("APP XHS generate persists a non-AI RDS draft bridge", () => {
  const route = read("app", "api", "app", "xhs", "generate-v4", "route.ts")
  const helper = read("lib", "aliyun-rds", "repositories", "app-content-workflows.server.ts")

  assert.match(route, /createAppContentWorkflowDraft/)
  assert.doesNotMatch(route, /appContentAcceptedResponse/)
  assert.match(route, /action: "xhs\.generate"/)
  assert.match(route, /kind: "xhs"/)
  assert.match(route, /payload: body\.body/)
  assert.match(route, /App XHS text request was saved as a non-AI draft bridge/)
  assert.match(route, /AI generation, cover generation, billing, and external posting remain disabled/)

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

test("APP XHS draft bridge keeps AI, cover, billing, and publish disabled", () => {
  const route = read("app", "api", "app", "xhs", "generate-v4", "route.ts")
  const helper = read("lib", "aliyun-rds", "repositories", "app-content-workflows.server.ts")
  const combined = `${route}\n${helper}`

  assert.match(helper, /APP_CONTENT_DRAFT_BRIDGE_FORBIDDEN_SIDE_EFFECTS/)
  assert.match(helper, /"ai_generation"/)
  assert.match(helper, /"ai_point_charge"/)
  assert.match(helper, /"external_publish"/)
  assert.doesNotMatch(helper, /APP_CONTENT_DRAFT_BRIDGE_FORBIDDEN_SIDE_EFFECTS[\s\S]*"production_write"/)
  assert.doesNotMatch(combined, pattern(["resolve", "Mp", "Ai", "Billing", "Context"]))
  assert.doesNotMatch(combined, pattern(["charge", "Mp", "Ai", "Points"]))
  assert.doesNotMatch(combined, pattern(["refund", "Mp", "Ai", "Points"]))
  assert.doesNotMatch(combined, pattern(["generate", "Xhs", "V4"]))
  assert.doesNotMatch(combined, pattern(["xhs", "_", "drafts"]))
  assert.doesNotMatch(combined, pattern(["create", "Server", "Supabase", "Client", "For", "Request"]))
  assert.doesNotMatch(combined, /\bfetch\(/)
  assert.doesNotMatch(combined, /upload[A-Za-z]+Asset/)
  assert.doesNotMatch(combined, /\bpublish[A-Za-z]*\(/)
})
