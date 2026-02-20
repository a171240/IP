import { randomUUID } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createClient } from "@supabase/supabase-js"

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

type RewriteTarget = "douyin_video" | "xhs_note"
type RewriteTone = "professional" | "sharp" | "warm"

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
  kind: "legal_matrix" | "source_not_found" | "source_status_failed"
  status: number
  target: RewriteTarget
  tone: RewriteTone
  round?: number
  request: Record<string, JsonValue>
  response: RewriteApiResponse
  structured_ok?: boolean
  compliance_ok?: boolean
  newline_hit?: boolean
  residual_risk_hits?: string[]
  success?: boolean
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function incrementCounter(counter: Record<string, number>, key: string, delta = 1) {
  counter[key] = (counter[key] || 0) + delta
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

function extractHighRiskMatches(text: string): string[] {
  const re = /百分百|100%|包过|包赚|绝对有效|无效退款|必火|根治|治愈|永久见效|治疗|治好|药到病除|医学奇迹|手到病除|加\s*微\s*信|加\s*v\s*x|加V|加v|vx|v信|扫码|二维码|手机号|电话|下单|团购|买券|核销|返现|优惠链接|点击链接/gi
  const matches = text.match(re) || []
  return Array.from(new Set(matches.map((item) => item.trim()).filter(Boolean)))
}

function summarizeFailureReason(status: number, response: RewriteApiResponse, structuredOk: boolean, complianceOk: boolean): string {
  if (status !== 200) {
    return `http_${status}:${response.error_code || "no_error_code"}`
  }

  if (response.ok !== true) {
    return `ok_false:${response.error_code || "no_error_code"}`
  }

  if (!structuredOk) return "invalid_structure"
  if (!complianceOk) return "missing_compliance_report"

  return "unknown_failure"
}

async function main() {
  const scriptDir = fileURLToPath(new URL(".", import.meta.url))
  const repoRoot = resolve(scriptDir, "..")

  const envCandidates = [
    process.env.REWRITE_QUALITY_ENV_FILE || "",
    resolve(repoRoot, ".env.local"),
    "/Users/zhuan/IP项目/ip-content-factory-ingest/.env.local",
    "/Users/zhuan/IP项目/ip-content-factory/.env.local",
  ]

  for (const envPath of envCandidates) {
    if (!envPath) continue
    if (existsSync(envPath)) readEnvFile(envPath)
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

  const apiBase = (process.env.REWRITE_QUALITY_API_BASE || process.env.REWRITE_REGRESSION_API_BASE || "http://127.0.0.1:3000").replace(/\/$/, "")
  const rewriteUrl = `${apiBase}/api/mp/content/rewrite`
  const rounds = Math.max(1, Number(process.env.REWRITE_QUALITY_ROUNDS || 4))

  const admin = createClient(supabaseUrl, supabaseService, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const anon = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const stamp = Date.now()
  const email = `rewrite.matrix.${stamp}@example.com`
  const password = `Codex!${stamp}Aa`

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nickname: `rewrite-matrix-${stamp}` },
  })
  assert(!created.error && created.data.user, `create_user_failed:${created.error?.message || "unknown"}`)

  const userId = created.data.user.id

  const profile = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      nickname: `rewrite-matrix-${stamp}`,
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
    source_url: `https://www.douyin.com/video/matrix-${stamp}`,
    status: "ready",
    title: "Rewrite质量矩阵：内容结构与风险词测试",
    text_content:
      "开头要先讲痛点。\n中段给判断标准。\n结尾给可执行动作。\n避免绝对化承诺，不留联系方式，不做交易导流。",
    images: [],
    video_url: null,
    author: "rewrite-quality-matrix",
    meta: { from: "rewrite-quality-matrix", ts: stamp },
    raw_payload: { mock: true, ts: stamp },
    sort_index: 0,
  })
  assert(!sourceReady.error, `insert_ready_source_failed:${sourceReady.error?.message || "unknown"}`)

  const sourceFailed = await admin.from("content_sources").insert({
    id: failedSourceId,
    user_id: userId,
    source_mode: "single_link",
    platform: "douyin",
    source_url: `https://www.douyin.com/video/matrix-failed-${stamp}`,
    status: "failed",
    title: "Rewrite质量矩阵：失败源",
    text_content: null,
    images: [],
    video_url: null,
    author: null,
    meta: { from: "rewrite-quality-matrix", reason: "extract_failed" },
    raw_payload: { mock: true, ts: stamp },
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

  const targets: RewriteTarget[] = ["douyin_video", "xhs_note"]
  const tones: RewriteTone[] = ["professional", "sharp", "warm"]
  const cases: HttpCaseResult[] = []

  const failureReasonDistribution: Record<string, number> = {}
  const complianceFlagDistribution: Record<string, number> = {}
  const residualRiskWordDistribution: Record<string, number> = {}
  const successByTarget: Record<RewriteTarget, number> = {
    douyin_video: 0,
    xhs_note: 0,
  }

  let legalTotal = 0
  let legalDone = 0
  let compliancePresentCount = 0
  let newlineHitCount = 0

  for (let round = 1; round <= rounds; round += 1) {
    for (const target of targets) {
      for (const tone of tones) {
        legalTotal += 1

        const request = {
          source_id: readySourceId,
          target,
          tone,
          constraints: { avoid_risk_words: true },
        } as const

        const response = await postRewrite({
          url: rewriteUrl,
          token,
          payload: request as unknown as Record<string, JsonValue>,
        })

        const structuredOk = hasStructuredResult(response.json)
        const complianceOk = hasComplianceReport(response.json)
        const bodyText = response.json.result?.body || ""
        const scriptText = response.json.result?.script || ""
        const newlineHit = bodyText.includes("\n") || scriptText.includes("\n")
        const merged = `${response.json.result?.title || ""}\n${bodyText}\n${scriptText}`
        const riskHits = extractHighRiskMatches(merged)

        const success = response.status === 200 && response.json.ok === true && structuredOk && complianceOk
        if (success) {
          legalDone += 1
          successByTarget[target] += 1
          if (complianceOk) compliancePresentCount += 1
          if (newlineHit) newlineHitCount += 1

          for (const flag of response.json.compliance_report?.flags || []) {
            if (flag.startsWith("risk_word:")) {
              const parts = flag.split(":")
              incrementCounter(complianceFlagDistribution, parts[1] || "unknown")
            } else {
              incrementCounter(complianceFlagDistribution, "non_risk_word")
            }
          }

          for (const hit of riskHits) {
            incrementCounter(residualRiskWordDistribution, hit)
          }
        } else {
          const reason = summarizeFailureReason(response.status, response.json, structuredOk, complianceOk)
          incrementCounter(failureReasonDistribution, reason)
        }

        cases.push({
          name: `legal_${target}_${tone}_r${round}`,
          kind: "legal_matrix",
          status: response.status,
          target,
          tone,
          round,
          request: request as unknown as Record<string, JsonValue>,
          response: response.json,
          structured_ok: structuredOk,
          compliance_ok: complianceOk,
          newline_hit: newlineHit,
          residual_risk_hits: riskHits,
          success,
        })
      }
    }
  }

  const countAfterLegalRes = await admin.from("content_rewrites").select("id", { count: "exact", head: true }).eq("user_id", userId)
  assert(!countAfterLegalRes.error, `count_after_legal_failed:${countAfterLegalRes.error?.message || "unknown"}`)
  const countAfterLegal = Number(countAfterLegalRes.count || 0)

  const sourceNotFoundRequest = {
    source_id: randomUUID(),
    target: "douyin_video",
    tone: "sharp",
    constraints: { avoid_risk_words: true },
  } as const
  const sourceNotFoundResponse = await postRewrite({
    url: rewriteUrl,
    token,
    payload: sourceNotFoundRequest as unknown as Record<string, JsonValue>,
  })

  cases.push({
    name: "source_not_found",
    kind: "source_not_found",
    status: sourceNotFoundResponse.status,
    target: sourceNotFoundRequest.target,
    tone: sourceNotFoundRequest.tone,
    request: sourceNotFoundRequest as unknown as Record<string, JsonValue>,
    response: sourceNotFoundResponse.json,
  })

  const countAfterNotFoundRes = await admin.from("content_rewrites").select("id", { count: "exact", head: true }).eq("user_id", userId)
  assert(!countAfterNotFoundRes.error, `count_after_not_found_failed:${countAfterNotFoundRes.error?.message || "unknown"}`)
  const countAfterNotFound = Number(countAfterNotFoundRes.count || 0)

  const sourceStatusFailedRequest = {
    source_id: failedSourceId,
    target: "xhs_note",
    tone: "professional",
    constraints: { avoid_risk_words: true },
  } as const
  const sourceStatusFailedResponse = await postRewrite({
    url: rewriteUrl,
    token,
    payload: sourceStatusFailedRequest as unknown as Record<string, JsonValue>,
  })

  cases.push({
    name: "source_status_failed",
    kind: "source_status_failed",
    status: sourceStatusFailedResponse.status,
    target: sourceStatusFailedRequest.target,
    tone: sourceStatusFailedRequest.tone,
    request: sourceStatusFailedRequest as unknown as Record<string, JsonValue>,
    response: sourceStatusFailedResponse.json,
  })

  const rowsRes = await admin
    .from("content_rewrites")
    .select(
      "id, created_at, source_id, target, tone, constraints, status, error_code, result_title, result_body, result_script, result_tags, cover_prompts, compliance_risk_level, compliance_flags"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200)

  assert(!rowsRes.error && Array.isArray(rowsRes.data), `query_content_rewrites_failed:${rowsRes.error?.message || "unknown"}`)

  const doneRows = rowsRes.data.filter((row) => row.status === "done").length
  const failedRows = rowsRes.data.filter((row) => row.status === "failed").length
  assert(doneRows >= 1, "content_rewrites_done_lt_1")
  assert(failedRows >= 1, "content_rewrites_failed_lt_1")

  const doneRate = legalTotal > 0 ? legalDone / legalTotal : 0
  const newlinePreserved = newlineHitCount > 0
  const sourceNotFoundNotInserted = countAfterNotFound === countAfterLegal
  const avoidRiskWordsEffective = Object.keys(residualRiskWordDistribution).length === 0
  const complianceReportPresent = compliancePresentCount === legalDone

  assert(doneRate >= 0.95, `done_rate_below_threshold:${doneRate.toFixed(4)}`)
  assert(sourceNotFoundResponse.status === 404, `source_not_found_status_unexpected:${sourceNotFoundResponse.status}`)
  assert(sourceNotFoundResponse.json.ok === false, "source_not_found_ok_not_false")
  assert(sourceNotFoundResponse.json.error_code === "rewrite_failed", `source_not_found_error_code_invalid:${sourceNotFoundResponse.json.error_code || "empty"}`)
  assert(sourceNotFoundNotInserted, `source_not_found_inserted_row:${countAfterLegal}->${countAfterNotFound}`)
  assert(sourceStatusFailedResponse.status === 400, `source_status_failed_status_unexpected:${sourceStatusFailedResponse.status}`)
  assert(sourceStatusFailedResponse.json.ok === false, "source_status_failed_ok_not_false")
  assert(sourceStatusFailedResponse.json.error_code === "rewrite_failed", `source_status_failed_error_code_invalid:${sourceStatusFailedResponse.json.error_code || "empty"}`)
  assert(newlinePreserved, "newline_not_preserved")
  assert(avoidRiskWordsEffective, "avoid_risk_words_not_effective")
  assert(complianceReportPresent, "compliance_report_missing")
  assert(successByTarget.douyin_video > 0 && successByTarget.xhs_note > 0, "target_coverage_incomplete")

  const result = {
    ok: true,
    branch: "codex/rc1-rewrite-quality",
    api_base: apiBase,
    rounds,
    matrix: {
      targets,
      tones,
      legal_total: legalTotal,
      legal_done: legalDone,
      done_rate: Number(doneRate.toFixed(4)),
      success_by_target: successByTarget,
      failure_reason_distribution: failureReasonDistribution,
      compliance_flag_distribution: complianceFlagDistribution,
      residual_risk_word_distribution: residualRiskWordDistribution,
    },
    context: {
      user_id: userId,
      ready_source_id: readySourceId,
      failed_source_id: failedSourceId,
      count_before: countBefore,
      count_after_legal: countAfterLegal,
      count_after_source_not_found: countAfterNotFound,
    },
    assertions: {
      newline_preserved: newlinePreserved,
      source_not_found_not_inserted: sourceNotFoundNotInserted,
      avoid_risk_words_effective: avoidRiskWordsEffective,
      compliance_report_present: complianceReportPresent,
    },
    db_counts: {
      done: doneRows,
      failed: failedRows,
    },
    cases,
    db_rows: rowsRes.data,
  }

  writeFileSync("/tmp/rewrite-quality-matrix-result.json", JSON.stringify(result, null, 2), "utf-8")
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  const payload = {
    ok: false,
    error: message,
  }

  try {
    writeFileSync("/tmp/rewrite-quality-matrix-result.json", JSON.stringify(payload, null, 2), "utf-8")
  } catch {
    // ignore
  }

  console.error(JSON.stringify(payload, null, 2))
  process.exit(1)
})
