const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

const schemaSql = read("deploy", "aliyun-production-cn.app-compliance-requests-schema.sql")
const compactSchemaSql = schemaSql.replace(/\s+/g, " ").trim().toLowerCase()

function assertSchemaContains(pattern) {
  assert.match(compactSchemaSql, pattern)
}

test("account compliance schema creates the table used by account compliance routes", () => {
  assertSchemaContains(/create table if not exists public\.app_compliance_requests \(/)
  assertSchemaContains(/id uuid primary key default gen_random_uuid\(\)/)
  assertSchemaContains(/company_id uuid references public\.mp_companies\(id\)/)
  assertSchemaContains(/store_id uuid references public\.mp_stores\(id\)/)
  assertSchemaContains(/membership_id uuid references public\.mp_account_memberships\(id\)/)
  assertSchemaContains(/user_id uuid not null references public\.profiles\(id\)/)
  assertSchemaContains(/kind text not null check \(kind in \('account_deletion', 'personal_data_deletion'\)\)/)
  assertSchemaContains(/status text not null default 'received' check \(status in \('received'\)\)/)
  assertSchemaContains(/reason text/)
  assertSchemaContains(/confirm_text text/)
  assertSchemaContains(/requested_at timestamptz not null default now\(\)/)
  assertSchemaContains(/created_at timestamptz not null default now\(\)/)
  assertSchemaContains(/updated_at timestamptz not null default now\(\)/)
  assert.doesNotMatch(compactSchemaSql, /app_account_compliance_requests/)
  assert.doesNotMatch(compactSchemaSql, /app_cn\.app_compliance_requests/)
})

test("account compliance schema carries the route and audit indexes", () => {
  assertSchemaContains(
    /create index if not exists app_compliance_requests_user_requested_idx on public\.app_compliance_requests \(user_id, requested_at desc\)/,
  )
  assertSchemaContains(
    /create index if not exists app_compliance_requests_scope_kind_status_requested_idx on public\.app_compliance_requests \(company_id, store_id, kind, status, requested_at desc\)/,
  )
})

test("account compliance schema stays schema-only and non-secret", () => {
  assert.doesNotMatch(schemaSql, /DATABASE_URL_CN\s*=/)
  assert.doesNotMatch(schemaSql, /postgres(?:ql)?:\/\//i)
  assert.doesNotMatch(schemaSql, /Authorization/i)
  assert.doesNotMatch(schemaSql, /Bearer\s+[A-Za-z0-9._-]+/)
  assert.doesNotMatch(schemaSql, /LTAI[A-Za-z0-9]+/)
  assert.doesNotMatch(schemaSql, /sk-[A-Za-z0-9_-]+/)
  assert.doesNotMatch(compactSchemaSql, /\binsert\s+into\b/)
  assert.doesNotMatch(compactSchemaSql, /\bupdate\s+public\./)
  assert.doesNotMatch(compactSchemaSql, /\bdelete\s+from\b/)
  assert.doesNotMatch(compactSchemaSql, /\btruncate\s+/)
  assert.doesNotMatch(compactSchemaSql, /\bdrop\s+/)
  assert.doesNotMatch(compactSchemaSql, /\bselect\s+\*/)
  assert.doesNotMatch(compactSchemaSql, /https?:\/\//)
})

test("account compliance routes, repository, and schema stay aligned", () => {
  const repository = read("lib", "aliyun-rds", "repositories", "app-compliance-requests.server.ts")
  const deleteRoute = read("app", "api", "app", "account", "deletion-requests", "route.ts")
  const dataDeleteRoute = read("app", "api", "app", "account", "data-deletion-requests", "route.ts")
  const combinedSource = `${repository}\n${deleteRoute}\n${dataDeleteRoute}\n${schemaSql}`

  assert.match(repository, /insert into public\.app_compliance_requests/)
  assert.match(repository, /company_id, store_id, membership_id, user_id, kind, status, reason/)
  assert.match(repository, /confirm_text, requested_at, created_at, updated_at/)
  assert.match(repository, /returning id, kind, status, requested_at/)
  assert.match(deleteRoute, /kind:\s*"account_deletion"/)
  assert.match(dataDeleteRoute, /kind:\s*"personal_data_deletion"/)
  assert.doesNotMatch(combinedSource, /app_account_compliance_requests/)
  assert.doesNotMatch(combinedSource, /app_cn\.app_compliance_requests/)
})
