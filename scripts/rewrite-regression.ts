import { randomUUID } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createClient } from "@supabase/supabase-js"

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

type RewriteApiResponse = {
  ok: boolean
  rewrite_id?: string
  result?: {
    title?: string
    body?: string
    script?: string
    tags?: string[]
    cover_prompts?: string[]
  }
  compliance_report?: {
    risk_level?: string
    flags?: string[]
  }
  error_code?: string
  message?: string
}

type HttpCaseResult = {
  name: string
  status: number
  request: Record<string, JsonValue>
  response: RewriteApiResponse
}

function readEnvFile(filepath: string) {
  if (!existsSync(filepath)) return
  const raw = readFileSync(filepath, "utf-8")
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx <= 0) continue

    const key = trimmed.slice(0, idx).trim()
    if (!key || process.env[key]) continue

    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

function requireEnv(name: string): string {
  const value = (process.env[name] || "").trim()
  if (!value) {
    throw new Error(`missing_env:${name}`)
  }
  return value
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function postRewrite(opts: {
  url: string
  token: string
  payload: Record<string, JsonValue>
}): Promise<{ status: number; json: RewriteApiResponse }> {
  const response = await fetch(opts.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify(opts.payload),
  })

  const text = await response.text()
  let json: RewriteApiResponse
  try {
    json = JSON.parse(text) as RewriteApiResponse
  } catch {
    throw new Error(`invalid_json_response:${response.status}:${text.slice(0, 200)}`)
  }

  return { status: response.status, json }
}

function hasStructuredResult(resp: RewriteApiResponse): boolean {
  if (!resp.result) return false
  if (typeof resp.result.title !== "string" || !resp.result.title.trim()) return false
  if (typeof resp.result.body !== "string" || !resp.result.body.trim()) return false
  if (typeof resp.result.script !== "string" || !resp.result.script.trim()) return false
  if (!Array.isArray(resp.result.tags)) return false
  if (!Array.isArray(resp.result.cover_prompts)) return false
  return true
}

function hasComplianceReport(resp: RewriteApiResponse): boolean {
  if (!resp.compliance_report) return false
  const level = resp.compliance_report.risk_level
  if (level !== "safe" && level !== "medium" && level !== "high") return false
  if (!Array.isArray(resp.compliance_report.flags)) return false
  return true
}

function containsHighRiskWords(text: string): boolean {
  const re = /百分百|100%|包过|包赚|绝对有效|无效退款|必火|根治|治愈|永久见效|治疗|治好|药到病除|医学奇迹|手到病除|加\s*微\s*信|加\s*v\s*x|加V|加v|vx|v信|扫码|二维码|手机号|电话|下单|团购|买券|核销|返现|优惠链接|点击链接/i
  return re.test(text)
}

async function main() {
  const scriptDir = fileURLToPath(new URL(".", import.meta.url))
  const repoRoot = resolve(scriptDir, "..")
  const envCandidates = [
    process.env.REWRITE_REGRESSION_ENV_FILE || "",
    resolve(repoRoot, ".env.local"),
    "/Users/zhuan/IP项目/ip-content-factory/.env.local",
  ]

  for (const envPath of envCandidates) {
    if (!envPath) continue
    if (existsSync(envPath)) {
      readEnvFile(envPath)
    }
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_IPgongchang_SUPABASE_URL || process.env.IPgongchang_SUPABASE_URL || ""
  const supabaseAnon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY ||
    process.env.IPgongchang_SUPABASE_ANON_KEY ||
    ""
  const supabaseService =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.IPgongchang_SUPABASE_SERVICE_ROLE_KEY || process.env.IPgongchang_SUPABASE_SECRET_KEY || ""

  assert(supabaseUrl, "missing_env:SUPABASE_URL")
  assert(supabaseAnon, "missing_env:SUPABASE_ANON_KEY")
  assert(supabaseService, "missing_env:SUPABASE_SERVICE_ROLE_KEY")

  const apiBase = (process.env.REWRITE_REGRESSION_API_BASE || "http://127.0.0.1:3000").replace(/\/$/, "")
  const rewriteUrl = `${apiBase}/api/mp/content/rewrite`

  const admin = createClient(supabaseUrl, supabaseService, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const anon = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const stamp = Date.now()
  const email = `rewrite.regression.${stamp}@example.com`
  const password = `Codex!${stamp}Aa`

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nickname: `rewrite-r1-${stamp}` },
  })
  assert(!created.error && created.data.user, `create_user_failed:${created.error?.message || "unknown"}`)

  const userId = created.data.user.id

  const profile = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      nickname: `rewrite-r1-${stamp}`,
      plan: "free",
      credits_balance: 999,
      credits_unlimited: false,
    },
    { onConflict: "id" }
  )
  assert(!profile.error, `profile_upsert_failed:${profile.error?.message || "unknown"}`)

  const readySourceId = randomUUID()
  const failedSourceId = randomUUID()

  const sourceReady = await admin.from("content_sources").insert({
    id: readySourceId,
    user_id: userId,
    source_mode: "single_link",
    platform: "douyin",
    source_url: `https://www.douyin.com/video/${stamp}`,
    status: "ready",
    title: "R2回归：三步优化内容结构",
    text_content:
      "第一步：先说用户痛点。\n第二步：给判断标准。\n第三步：给可执行动作。\n避免绝对化承诺，不要留联系方式。",
    images: [],
    video_url: null,
    author: "R2回归",
    meta: { from: "rewrite-regression-r1" },
    raw_payload: { mock: true, ts: stamp },
    sort_index: 0,
  })
  assert(!sourceReady.error, `insert_ready_source_failed:${sourceReady.error?.message || "unknown"}`)

  const sourceFailed = await admin.from("content_sources").insert({
    id: failedSourceId,
    user_id: userId,
    source_mode: "single_link",
    platform: "douyin",
    source_url: `https://www.douyin.com/video/failed-${stamp}`,
    status: "failed",
    title: "R2回归：失败源",
    text_content: null,
    images: [],
    video_url: null,
    author: null,
    meta: { from: "rewrite-regression-r1", reason: "extract_failed" },
    raw_payload: { mock: true },
    error_code: "extract_failed",
    sort_index: 1,
  })
  assert(!sourceFailed.error, `insert_failed_source_failed:${sourceFailed.error?.message || "unknown"}`)

  const signIn = await anon.auth.signInWithPassword({ email, password })
  assert(!signIn.error && signIn.data.session?.access_token, `signin_failed:${signIn.error?.message || "unknown"}`)
  const token = signIn.data.session.access_token

  const baseCountRes = await admin.from("content_rewrites").select("id", { count: "exact", head: true }).eq("user_id", userId)
  assert(!baseCountRes.error, `count_before_failed:${baseCountRes.error?.message || "unknown"}`)
  const countBefore = Number(baseCountRes.count || 0)

  const cases: HttpCaseResult[] = []

  const douyinReq = {
    source_id: readySourceId,
    target: "douyin_video",
    tone: "professional",
    constraints: { avoid_risk_words: true },
  } as const
  const douyinRes = await postRewrite({ url: rewriteUrl, token, payload: douyinReq as unknown as Record<string, JsonValue> })
  cases.push({ name: "douyin_success", status: douyinRes.status, request: douyinReq as unknown as Record<string, JsonValue>, response: douyinRes.json })
  assert(douyinRes.status === 200, `douyin_status_unexpected:${douyinRes.status}`)
  assert(douyinRes.json.ok === true, "douyin_ok_false")
  assert(hasStructuredResult(douyinRes.json), "douyin_result_invalid")
  assert(hasComplianceReport(douyinRes.json), "douyin_compliance_invalid")

  const xhsReq = {
    source_id: readySourceId,
    target: "xhs_note",
    tone: "warm",
    constraints: { avoid_risk_words: true },
  } as const
  const xhsRes = await postRewrite({ url: rewriteUrl, token, payload: xhsReq as unknown as Record<string, JsonValue> })
  cases.push({ name: "xhs_success", status: xhsRes.status, request: xhsReq as unknown as Record<string, JsonValue>, response: xhsRes.json })
  assert(xhsRes.status === 200, `xhs_status_unexpected:${xhsRes.status}`)
  assert(xhsRes.json.ok === true, "xhs_ok_false")
  assert(hasStructuredResult(xhsRes.json), "xhs_result_invalid")
  assert(hasComplianceReport(xhsRes.json), "xhs_compliance_invalid")

  const xhsBody = xhsRes.json.result?.body || ""
  const xhsScript = xhsRes.json.result?.script || ""
  assert(xhsBody.includes("\n") || xhsScript.includes("\n"), "newline_not_preserved_in_xhs_output")

  const mergedText = `${douyinRes.json.result?.title || ""}\n${douyinRes.json.result?.body || ""}\n${douyinRes.json.result?.script || ""}`
  assert(!containsHighRiskWords(mergedText), "avoid_risk_words_not_effective_for_douyin_output")

  const countAfterSuccessRes = await admin.from("content_rewrites").select("id", { count: "exact", head: true }).eq("user_id", userId)
  assert(!countAfterSuccessRes.error, `count_after_success_failed:${countAfterSuccessRes.error?.message || "unknown"}`)
  const countAfterSuccess = Number(countAfterSuccessRes.count || 0)

  const notFoundReq = {
    source_id: randomUUID(),
    target: "douyin_video",
    tone: "sharp",
    constraints: { avoid_risk_words: true },
  } as const
  const notFoundRes = await postRewrite({ url: rewriteUrl, token, payload: notFoundReq as unknown as Record<string, JsonValue> })
  cases.push({ name: "source_not_found", status: notFoundRes.status, request: notFoundReq as unknown as Record<string, JsonValue>, response: notFoundRes.json })
  assert(notFoundRes.status === 404, `source_not_found_status_unexpected:${notFoundRes.status}`)
  assert(notFoundRes.json.ok === false, "source_not_found_ok_not_false")
  assert(notFoundRes.json.error_code === "rewrite_failed", `source_not_found_error_code_invalid:${notFoundRes.json.error_code || "empty"}`)

  const countAfterNotFoundRes = await admin.from("content_rewrites").select("id", { count: "exact", head: true }).eq("user_id", userId)
  assert(!countAfterNotFoundRes.error, `count_after_not_found_failed:${countAfterNotFoundRes.error?.message || "unknown"}`)
  const countAfterNotFound = Number(countAfterNotFoundRes.count || 0)
  assert(countAfterNotFound === countAfterSuccess, `source_not_found_inserted_row:${countAfterSuccess}->${countAfterNotFound}`)

  const failedReq = {
    source_id: failedSourceId,
    target: "xhs_note",
    tone: "professional",
    constraints: { avoid_risk_words: true },
  } as const
  const failedRes = await postRewrite({ url: rewriteUrl, token, payload: failedReq as unknown as Record<string, JsonValue> })
  cases.push({ name: "source_status_failed", status: failedRes.status, request: failedReq as unknown as Record<string, JsonValue>, response: failedRes.json })
  assert(failedRes.status === 400, `failed_source_status_unexpected:${failedRes.status}`)
  assert(failedRes.json.ok === false, "failed_source_ok_not_false")
  assert(failedRes.json.error_code === "rewrite_failed", `failed_source_error_code_invalid:${failedRes.json.error_code || "empty"}`)

  const rowsRes = await admin
    .from("content_rewrites")
    .select(
      "id, created_at, source_id, target, tone, constraints, status, error_code, result_title, result_body, result_script, result_tags, cover_prompts, compliance_risk_level, compliance_flags"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20)

  assert(!rowsRes.error && Array.isArray(rowsRes.data), `query_content_rewrites_failed:${rowsRes.error?.message || "unknown"}`)

  const doneCount = rowsRes.data.filter((row) => row.status === "done").length
  const failedCount = rowsRes.data.filter((row) => row.status === "failed").length

  assert(doneCount >= 1, "content_rewrites_done_lt_1")
  assert(failedCount >= 1, "content_rewrites_failed_lt_1")

  const result = {
    ok: true,
    branch: "codex/rewrite-hardening-r1",
    api_base: apiBase,
    context: {
      user_id: userId,
      ready_source_id: readySourceId,
      failed_source_id: failedSourceId,
      count_before: countBefore,
      count_after_success: countAfterSuccess,
      count_after_source_not_found: countAfterNotFound,
    },
    assertions: {
      newline_preserved: xhsBody.includes("\n") || xhsScript.includes("\n"),
      source_not_found_not_inserted: countAfterNotFound === countAfterSuccess,
      avoid_risk_words_effective: !containsHighRiskWords(mergedText),
      compliance_report_present: hasComplianceReport(douyinRes.json) && hasComplianceReport(xhsRes.json),
    },
    counts: {
      done: doneCount,
      failed: failedCount,
    },
    cases,
    db_rows: rowsRes.data,
  }

  writeFileSync("/tmp/rewrite-regression-result.json", JSON.stringify(result, null, 2), "utf-8")
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  const payload = {
    ok: false,
    error: message,
  }
  try {
    writeFileSync("/tmp/rewrite-regression-result.json", JSON.stringify(payload, null, 2), "utf-8")
  } catch {
    // ignore
  }
  console.error(JSON.stringify(payload, null, 2))
  process.exit(1)
})
