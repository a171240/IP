#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs")
const path = require("path")
const { createClient } = require("@supabase/supabase-js")

const args = new Set(process.argv.slice(2))
const baseUrl = process.env.DELIVERY_PACK_BASE_URL || "http://localhost:3000"
const keepUser =
  args.has("--keep-user") ||
  args.has("--skip-cleanup") ||
  process.env.DELIVERY_PACK_KEEP_USER === "1"
const customEmail = process.env.DELIVERY_PACK_EMAIL || null
const customPassword = process.env.DELIVERY_PACK_PASSWORD || null
const maxWaitMs = Number(process.env.DELIVERY_PACK_WAIT_MS || 300000)

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

const PLATFORM_LABELS = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  video_account: "视频号",
  wechat: "公众号",
}

const CTA_BLOCK_PATTERN =
  /(微信|加V|加微|加我|私信加|微信号|VX|wx|WeChat|二维码|电话|手机号|手机|添加.*微信|加.*微信)/i

function buildDensityTokens(input) {
  const platformLabel = PLATFORM_LABELS[input.platform] || input.platform
  const tokens = [input.offer_desc, input.target_audience, input.price_range, platformLabel]
    .map((item) => (item || "").trim())
    .filter(Boolean)
  return tokens.map((token) => (token.length > 8 ? token.slice(0, 8) : token))
}

function countTokenMatches(text, tokens) {
  const normalized = String(text || "").trim()
  return tokens.reduce((count, token) => {
    if (!token) return count
    return normalized.includes(token) ? count + 1 : count
  }, 0)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function buildInput() {
  return {
    team_type: "agency",
    team_size: "4-8",
    industry: "知识付费",
    platform: "xiaohongshu",
    offer_type: "训练营",
    offer_desc: "小红书爆款内容训练营",
    delivery_mode: "线上陪跑",
    sop_level: "不稳定",
    guideline_level: "不稳定",
    current_problem: ["流量低", "转化低"],
    topic_library: "零散",
    multi_project: "多项目并行",
    script_review: "返工多",
    qc_process: "缺少质检",
    conversion_path: "引导评论领取资料",
    review_frequency: "每周复盘",
    product_or_service: "内容增长服务",
    target_audience: "中小企业主",
    price_range: "¥2999-6999",
    tone: "专业但接地气",
  }
}

async function waitForPack(adminClient, packId) {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const { data, error } = await adminClient
      .from("delivery_packs")
      .select("status, output_json, pdf_path, error_message")
      .eq("id", packId)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      continue
    }
    if (data.status === "done") return data
    if (data.status === "failed") {
      throw new Error(`delivery_pack failed: ${data.error_message || "unknown"}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  throw new Error("delivery_pack generation timed out")
}

async function main() {
  const { supabaseUrl, supabaseAnonKey, supabaseServiceKey } = resolveEnv()
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error("Missing Supabase env; ensure .env.local has URL/ANON/SERVICE_ROLE")
    process.exit(1)
  }

  const email = customEmail || `codex+pack-${Date.now()}@ipgongchang.test`
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
    user_metadata: { source: "delivery-pack-regress" },
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
  if (!userId) {
    throw new Error("Unable to resolve user id for delivery-pack regression account")
  }

  await adminClient.from("profiles").upsert({
    id: userId,
    email,
    nickname: "codex",
    plan: "pro",
    credits_balance: 999,
    credits_unlimited: true,
  })

  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await adminClient.from("entitlements").upsert({
    user_id: userId,
    plan: "trial_pro",
    pro_expires_at: expires,
    updated_at: new Date().toISOString(),
  })

  const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  const accessToken = signInData?.session?.access_token
  if (!accessToken) throw new Error("Failed to get access token")

  const input = buildInput()
  const response = await fetch(`${baseUrl}/api/delivery-pack/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  })

  const payload = await response.json()
  if (!response.ok || !payload?.ok) {
    throw new Error(`delivery-pack generate failed: ${payload?.error || response.status}`)
  }

  const packId = payload.packId
  console.log("delivery pack queued:", packId)

  const pack = await waitForPack(adminClient, packId)
  const output = pack.output_json

  assert(pack.pdf_path, "pdf_path missing")
  assert(output, "output_json missing")
  assert(Array.isArray(output.calendar_7d) && output.calendar_7d.length === 7, "calendar_7d invalid")
  assert(Array.isArray(output.topics_10) && output.topics_10.length === 10, "topics_10 invalid")
  assert(Array.isArray(output.scripts_3) && output.scripts_3.length === 3, "scripts_3 invalid")
  assert(output.tomorrow_post?.title, "tomorrow_post missing")

  const densityTokens = buildDensityTokens(input)
  const requiredHits = Math.min(2, densityTokens.length)
  for (const [index, item] of output.calendar_7d.entries()) {
    const hits = countTokenMatches(item.title, densityTokens)
    assert(
      hits >= requiredHits,
      `calendar_7d[${index}] title density failed: "${item.title}" (${hits}/${requiredHits})`
    )
    assert(!CTA_BLOCK_PATTERN.test(item.cta || ""), `calendar_7d[${index}] cta invalid`)
  }

  assert(!CTA_BLOCK_PATTERN.test(output.tomorrow_post?.pinned_comment || ""), "tomorrow_post cta invalid")

  for (const [index, topic] of output.topics_10.entries()) {
    assert(!CTA_BLOCK_PATTERN.test(topic.cta || ""), `topics_10[${index}] cta invalid`)
  }

  for (const [index, script] of output.scripts_3.entries()) {
    assert(!CTA_BLOCK_PATTERN.test(script.cta || ""), `scripts_3[${index}] cta invalid`)
  }

  const qc = output.qc_checklist
  const archive = output.archive_rules
  assert(qc && Array.isArray(qc.title) && qc.title.length >= 3, "qc_checklist.title invalid")
  assert(qc && Array.isArray(qc.body) && qc.body.length >= 3, "qc_checklist.body invalid")
  assert(
    qc && Array.isArray(qc.cta_and_compliance) && qc.cta_and_compliance.length >= 3,
    "qc_checklist.cta_and_compliance invalid"
  )
  assert(archive && Array.isArray(archive.tags) && archive.tags.length >= 3, "archive_rules.tags invalid")
  assert(archive && Array.isArray(archive.dedupe) && archive.dedupe.length >= 3, "archive_rules.dedupe invalid")

  const eventNames = [
    "delivery_pack_generate_success",
    "pdf_generate_success",
    "delivery_pack_view",
    "copy_qc",
    "copy_archive",
  ]

  for (const event of eventNames) {
    const res = await fetch(`${baseUrl}/api/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        path: `/delivery-pack/${packId}`,
        props: { packId, userId },
      }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`track ${event} failed: ${res.status} ${errBody}`)
    }
  }

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: events, error: eventError } = await adminClient
    .from("analytics_events")
    .select("event, props, created_at")
    .in("event", eventNames)
    .gte("created_at", since)
    .filter("props->>packId", "eq", packId)

  if (eventError) throw eventError
  const foundEvents = new Set((events || []).map((item) => item.event))
  for (const event of eventNames) {
    assert(foundEvents.has(event), `analytics missing event: ${event}`)
  }

  console.log("delivery pack regression OK", {
    packId,
    pdfPath: pack.pdf_path,
    events: Array.from(foundEvents),
  })

  if (!keepUser) {
    await adminClient.from("delivery_packs").delete().eq("user_id", userId)
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
