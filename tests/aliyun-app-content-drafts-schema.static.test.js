const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

const schemaSql = read("deploy", "aliyun-production-cn.content-drafts-l3-schema.sql")
const compactSchemaSql = schemaSql.replace(/\s+/g, " ").trim().toLowerCase()

function assertSchemaContains(pattern) {
  assert.match(compactSchemaSql, pattern)
}

test("content drafts L3 schema hotfix creates the table used by App content draft routes", () => {
  assertSchemaContains(/create table if not exists public\.content_drafts \(/)
  assertSchemaContains(/id uuid primary key default gen_random_uuid\(\)/)
  assertSchemaContains(/company_id uuid not null references public\.mp_companies\(id\) on delete cascade/)
  assertSchemaContains(/store_id uuid not null references public\.mp_stores\(id\) on delete cascade/)
  assertSchemaContains(/kind text not null check \(kind in \('poster', 'xhs', 'private_copy'\)\)/)
  assertSchemaContains(/title text/)
  assertSchemaContains(/body text/)
  assertSchemaContains(/source_context jsonb not null default '\{\}'::jsonb/)
  assertSchemaContains(/status text not null default 'draft' check \(status in \('draft', 'archived'\)\)/)
  assertSchemaContains(/created_by_membership_id uuid references public\.mp_account_memberships\(id\) on delete set null/)
  assertSchemaContains(/created_at timestamptz not null default now\(\)/)
  assertSchemaContains(/updated_at timestamptz not null default now\(\)/)
  assert.doesNotMatch(compactSchemaSql, /create table if not exists app_cn\.content_drafts/)
})

test("content drafts L3 schema hotfix carries the query indexes used by list and audit paths", () => {
  assertSchemaContains(
    /create index if not exists content_drafts_scope_kind_status_updated_idx on public\.content_drafts \(company_id, store_id, kind, status, updated_at desc\)/,
  )
  assertSchemaContains(
    /create index if not exists content_drafts_created_by_membership_idx on public\.content_drafts \(created_by_membership_id\)/,
  )
})

test("content drafts L3 schema hotfix stays schema-only and non-secret", () => {
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

test("content draft routes and facades stay aligned to the public content_drafts schema", () => {
  const route = read("app", "api", "app", "content-drafts", "route.ts")
  const helper = read("lib", "aliyun-rds", "repositories", "app-content-workflows.server.ts")
  const combined = `${route}\n${helper}`

  assert.match(route, /from public\.content_drafts/)
  assert.match(route, /insert into public\.content_drafts/)
  assert.match(helper, /from public\.content_drafts/)
  assert.doesNotMatch(combined, /app_cn\.content_drafts/)
})
