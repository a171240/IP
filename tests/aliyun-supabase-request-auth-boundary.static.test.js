const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const source = fs.readFileSync(path.join(root, "lib", "supabase", "server.ts"), "utf8")

test("request-scoped Supabase client maps missing env plus no bearer token to unauthenticated", () => {
  assert.match(source, /type RequestSupabaseClient = ReturnType<typeof createSupabaseClient>/)
  assert.match(source, /function createUnauthenticatedSupabaseClient\(\)/)
  assert.doesNotMatch(source, /function createUnauthenticatedSupabaseClient\(\): any/)
  assert.ok(source.includes("return { data: { user: null }, error: null }"))
  assert.ok(source.includes("return { error: null }"))
  assert.match(
    source,
    /if \(!token\) \{\s*if \(!getSupabaseUrl\(\) \|\| !getSupabaseAnonKey\(\)\) \{\s*return createUnauthenticatedSupabaseClient\(\)\s*\}\s*return createServerSupabaseClient\(\)\s*\}/s,
  )
})

test("bearer-token request path still requires Supabase env and forwards Authorization", () => {
  assert.match(source, /const token = getBearerToken\(request\)/)
  assert.match(source, /const url = getSupabaseUrl\(\)\s*const anonKey = getSupabaseAnonKey\(\)\s*if \(!url \|\| !anonKey\) \{\s*throw new Error\(/s)
  assert.match(source, /Authorization: `Bearer \$\{token\}`/)
})

test("server component client keeps failing fast when Supabase env is missing", () => {
  assert.match(source, /export async function createServerSupabaseClient\(\)/)
  assert.match(source, /if \(!url \|\| !anonKey\) \{\s*throw new Error\(/s)
  assert.match(source, /export async function createClient\(\) \{\s*return createServerSupabaseClient\(\)\s*\}/s)
  assert.doesNotMatch(source, /export async function createClient\(\) \{\s*return createUnauthenticatedSupabaseClient\(\)/)
})
