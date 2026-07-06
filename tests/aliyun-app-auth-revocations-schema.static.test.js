const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const schemaPath = path.join(root, "deploy", "aliyun-production-cn.app-auth-revocations-schema.sql")

function readSchema() {
  assert.equal(fs.existsSync(schemaPath), true, "revocation schema contract file must exist")
  return fs.readFileSync(schemaPath, "utf8")
}

function compactSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase()
}

test("APP auth revocation schema defines the token hash denylist contract", () => {
  const schemaSql = readSchema()
  const compact = compactSql(schemaSql)

  assert.match(compact, /create table if not exists public\.app_auth_token_revocations \(/)
  assert.match(compact, /token_hash text primary key/)
  assert.match(compact, /check \(token_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/)
  assert.match(compact, /auth_source text not null check \(auth_source in \('aliyun_test_login', 'supabase'\)\)/)
  assert.match(compact, /user_id uuid not null/)
  assert.match(compact, /device_id text/)
  assert.match(compact, /revoked_at timestamptz not null default now\(\)/)
  assert.match(compact, /expires_at timestamptz/)
  assert.match(compact, /created_at timestamptz not null default now\(\)/)
  assert.match(compact, /updated_at timestamptz not null default now\(\)/)
})

test("APP auth revocation schema supports helper conflict and lookup paths", () => {
  const schemaSql = readSchema()
  const compact = compactSql(schemaSql)
  const helper = read("lib", "aliyun-rds", "app-auth-revocations.server.ts").replace(/\s+/g, " ").trim().toLowerCase()

  assert.match(helper, /on conflict \(token_hash\) do update set/)
  assert.match(compact, /token_hash text primary key/)
  assert.match(helper, /and \(expires_at is null or expires_at > now\(\)\)/)
  assert.match(compact, /create index if not exists app_auth_token_revocations_active_lookup_idx on public\.app_auth_token_revocations \(token_hash, auth_source, user_id\) where expires_at is null/)
  assert.match(compact, /create index if not exists app_auth_token_revocations_expiring_lookup_idx on public\.app_auth_token_revocations \(expires_at, token_hash\) where expires_at is not null/)
})

test("APP auth revocation schema is schema-only and never stores bearer material", () => {
  const schemaSql = readSchema()
  const compact = compactSql(schemaSql)

  assert.doesNotMatch(compact, /raw_token|plain_token|authorization|bearer/)
  assert.doesNotMatch(schemaSql, /DATABASE_URL_CN\s*=/)
  assert.doesNotMatch(schemaSql, /postgres(?:ql)?:\/\//i)
  assert.doesNotMatch(schemaSql, /LTAI[A-Za-z0-9]+/)
  assert.doesNotMatch(schemaSql, /sk-[A-Za-z0-9_-]+/)
  assert.doesNotMatch(compact, /\binsert\s+into\b/)
  assert.doesNotMatch(compact, /\bupdate\s+public\./)
  assert.doesNotMatch(compact, /\bdelete\s+from\b/)
  assert.doesNotMatch(compact, /\btruncate\s+/)
  assert.doesNotMatch(compact, /\bdrop\s+/)
})
