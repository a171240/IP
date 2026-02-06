#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs")
const path = require("path")
const { createClient } = require("@supabase/supabase-js")

const args = new Set(process.argv.slice(2))
const baseUrl = process.env.MP_BASE_URL || "http://localhost:3000"
const keepUser = args.has("--keep-user") || args.has("--skip-cleanup") || process.env.MP_KEEP_USER === "1"
const customEmail = process.env.MP_EMAIL || null
const customPassword = process.env.MP_PASSWORD || null

function loadEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env
  const text = fs.readFileSync(filePath, "utf8")
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    value = value.replace(/^['"]|['"]$/g, "")
    env[key] = value
  }
  return env
}

function resolveEnv() {
  const envLocalPath = path.join(process.cwd(), ".env.local")
  const envFile = loadEnvFile(envLocalPath)
  const merged = { ...envFile, ...process.env }
  const supabaseUrl =
    merged.NEXT_PUBLIC_SUPABASE_URL ||
    merged.NEXT_PUBLIC_IPgongchang_SUPABASE_URL ||
    merged.IPgongchang_SUPABASE_URL ||
    ""
  const supabaseAnonKey =
    merged.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    merged.NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY ||
    merged.NEXT_PUBLIC_IPgongchang_SUPABASE_PUBLISHABLE_KEY ||
    merged.IPgongchang_SUPABASE_ANON_KEY ||
    merged.IPgongchang_SUPABASE_PUBLISHABLE_KEY ||
    ""
  const supabaseServiceKey =
    merged.SUPABASE_SERVICE_ROLE_KEY ||
    merged.IPgongchang_SUPABASE_SERVICE_ROLE_KEY ||
    merged.IPgongchang_SUPABASE_SECRET_KEY ||
    ""
  return { supabaseUrl, supabaseAnonKey, supabaseServiceKey }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function normalizeTopicKey(input) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
}

async function jsonFetch(url, opts) {
  const res = await fetch(url, opts)
  const text = await res.text().catch(() => "")
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // ignore
  }
  if (!res.ok) {
    const errMsg =
      (json && (json.error || json.message)) || (text ? text.slice(0, 200) : "") || `HTTP ${res.status}`
    const err = new Error(errMsg)
    err.status = res.status
    err.body = json || text
    throw err
  }
  return json
}

function buildP7Content() {
  return [
    "# 《选题库》回归测试",
    "",
    "TOP20：",
    "1、为什么你做抗衰一直没效果？（风险：低）",
    "2、祛痘为什么总复发？你可能忽略了这一点（风险：低）",
    "3、做项目前先问自己一个问题：你到底想解决什么？（风险：中）",
    "4、别再盲目跟风：你的皮肤可能不需要那些“网红项目”（风险：低）",
    "",
    "7天日历：",
    "- Day1 你以为的抗衰，其实是在透支皮肤",
    "- Day2 祛痘最坑的 3 个误区",
  ].join("\n")
}

async function main() {
  const { supabaseUrl, supabaseAnonKey, supabaseServiceKey } = resolveEnv()
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error("Missing Supabase env; ensure .env.local has URL/ANON/SERVICE_ROLE")
    process.exit(1)
  }

  const email = customEmail || `codex+mp-${Date.now()}@ipgongchang.test`
  const password = customPassword || "TestPass1234"

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let userId = null
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { source: "mp-regress" },
  })
  if (createError) {
    console.warn("createUser failed, fallback to lookup:", createError.message)
  }
  if (created?.user?.id) {
    userId = created.user.id
  } else {
    const { data: list, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (listError) throw listError
    const match = list.users.find((u) => u.email === email)
    userId = match?.id || null
  }
  assert(userId, "Unable to resolve user id for regression account")

  // Ensure profile exists (xhs_drafts FK points to profiles.id)
  await adminClient.from("profiles").upsert({
    id: userId,
    email,
    nickname: "codex",
    plan: "pro",
    credits_balance: 999,
    credits_unlimited: true,
  })

  const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  const accessToken = signInData?.session?.access_token
  assert(accessToken, "Failed to get access token")

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  }

  // 1) Create P7 report and ensure metadata.p7_topics is extracted.
  const p7Create = await jsonFetch(`${baseUrl}/api/mp/reports`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      step_id: "P7",
      title: `《选题库》回归测试 ${new Date().toISOString()}`,
      content: buildP7Content(),
      metadata: { source: "mp-regress" },
    }),
  })

  const p7ReportId = p7Create?.report?.id
  assert(p7ReportId, "P7 report id missing")

  const p7List = await jsonFetch(`${baseUrl}/api/mp/reports?step_id=P7&limit=5`, { method: "GET", headers })
  const p7Row = (p7List?.reports || []).find((r) => r.id === p7ReportId)
  assert(p7Row, "P7 report not found in list")
  assert(p7Row.metadata && Array.isArray(p7Row.metadata.p7_topics), "P7 metadata.p7_topics missing; extraction failed")
  assert(p7Row.metadata.p7_topics.length >= 4, "P7 topics extraction returned too few topics")

  const chosenTopic = String(p7Row.metadata.p7_topics[0] || "").trim()
  assert(chosenTopic, "No topic extracted to use for P8")

  // 2) Create P8 report referencing P7 + topic, ensure P7 metadata.p7_topics_used is updated.
  const p8Create = await jsonFetch(`${baseUrl}/api/mp/reports`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      step_id: "P8",
      title: `《脚本初稿》回归测试 ${new Date().toISOString()}`,
      content: `脚本内容：${chosenTopic}\n\n（回归测试）`,
      metadata: {
        source: "mp-regress",
        topic: chosenTopic,
        p7ReportId: p7ReportId,
      },
    }),
  })
  const p8ReportId = p8Create?.report?.id
  assert(p8ReportId, "P8 report id missing")

  const p7GetAfterP8 = await jsonFetch(`${baseUrl}/api/mp/reports/${encodeURIComponent(p7ReportId)}`, {
    method: "GET",
    headers,
  })
  const p7MetaAfterP8 = p7GetAfterP8?.report?.metadata || {}
  const usedMap = p7MetaAfterP8?.p7_topics_used || {}
  const key = normalizeTopicKey(chosenTopic)
  assert(usedMap && typeof usedMap === "object", "P7 metadata.p7_topics_used missing")
  assert(usedMap[key], "P7 topic was not marked as used by saving P8")

  // 3) PATCH: toggle used/un-used.
  await jsonFetch(`${baseUrl}/api/mp/reports/${encodeURIComponent(p7ReportId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ op: "p7_topic_unused", topic: chosenTopic }),
  })

  const p7GetAfterUnused = await jsonFetch(`${baseUrl}/api/mp/reports/${encodeURIComponent(p7ReportId)}`, {
    method: "GET",
    headers,
  })
  const usedMapAfterUnused = p7GetAfterUnused?.report?.metadata?.p7_topics_used || {}
  assert(!usedMapAfterUnused[key], "P7 topic should be removed after p7_topic_unused")

  await jsonFetch(`${baseUrl}/api/mp/reports/${encodeURIComponent(p7ReportId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ op: "p7_topic_used", topic: chosenTopic }),
  })

  const p7GetAfterUsedAgain = await jsonFetch(`${baseUrl}/api/mp/reports/${encodeURIComponent(p7ReportId)}`, {
    method: "GET",
    headers,
  })
  const usedMapAfterUsedAgain = p7GetAfterUsedAgain?.report?.metadata?.p7_topics_used || {}
  assert(usedMapAfterUsedAgain[key], "P7 topic should exist after p7_topic_used")

  // 4) Convert P8 report -> xhs_drafts, ensure linking back to report.metadata.xhs_draft_id is idempotent.
  let draftId = null
  try {
    const draftCreate = await jsonFetch(`${baseUrl}/api/mp/xhs/drafts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: "mp-regress",
        contentType: "treatment",
        topic: chosenTopic,
        resultTitle: chosenTopic,
        resultContent: `小红书草稿正文（来自P8）：${chosenTopic}\n\n（回归测试）`,
        sourceReportId: p8ReportId,
      }),
    })
    draftId = draftCreate?.draft?.id || null
    assert(draftId, "xhs draft id missing")

    const p8Get = await jsonFetch(`${baseUrl}/api/mp/reports/${encodeURIComponent(p8ReportId)}`, { method: "GET", headers })
    const meta = p8Get?.report?.metadata || {}
    assert(meta.xhs_draft_id === draftId, "P8 report metadata should contain xhs_draft_id after conversion")

    const draftCreateAgain = await jsonFetch(`${baseUrl}/api/mp/xhs/drafts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: "mp-regress",
        contentType: "treatment",
        topic: chosenTopic,
        resultContent: "should_reuse",
        sourceReportId: p8ReportId,
      }),
    })
    assert(draftCreateAgain?.reused === true, "Expected reused=true when converting same report twice")
    assert(draftCreateAgain?.draft?.id === draftId, "Expected same draft id when reused")
  } catch (error) {
    // Surface missing schema clearly; this is a real integration requirement.
    const msg = String(error?.message || "")
    if (msg.includes("xhs_drafts") && (msg.includes("does not exist") || msg.includes("schema cache"))) {
      throw new Error(
        'xhs_drafts table missing. Apply migration "supabase/migrations/20260206_add_xhs_drafts.sql" then retry.'
      )
    }
    throw error
  }

  // 5) GET library should include metadata for reports (used by mini program asset linking).
  const libRes = await jsonFetch(`${baseUrl}/api/mp/library?limit=10`, { method: "GET", headers })
  assert(libRes?.ok === true, "library ok=false")
  assert(libRes?.library?.reports, "library.reports missing")

  console.log("mp regress OK", { p7ReportId, p8ReportId, draftId })

  if (!keepUser) {
    try {
      if (draftId) await adminClient.from("xhs_drafts").delete().eq("id", draftId)
    } catch {
      // ignore
    }
    await adminClient.from("reports").delete().eq("user_id", userId)
    await adminClient.from("entitlements").delete().eq("user_id", userId)
    await adminClient.from("profiles").delete().eq("id", userId)
    await adminClient.auth.admin.deleteUser(userId)
  } else {
    console.log("kept user:", email)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
