#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const args = new Set(process.argv.slice(2))
const baseUrl = process.env.P5_P10_BASE_URL || 'http://localhost:3000'
const keepUser = args.has('--keep-user') || args.has('--skip-cleanup') || process.env.P5_P10_KEEP_USER === '1'
const forceInline = args.has('--inline') || process.env.P5_P10_INLINE === '1'
const customEmail = process.env.P5_P10_EMAIL || null
const customPassword = process.env.P5_P10_PASSWORD || null

function loadEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function resolveEnv() {
  const envLocalPath = path.join(process.cwd(), '.env.local')
  const envFile = loadEnvFile(envLocalPath)
  const merged = { ...envFile, ...process.env }
  const supabaseUrl =
    merged.NEXT_PUBLIC_SUPABASE_URL ||
    merged.NEXT_PUBLIC_IPgongchang_SUPABASE_URL ||
    merged.IPgongchang_SUPABASE_URL ||
    ''
  const supabaseAnonKey =
    merged.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    merged.NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY ||
    merged.NEXT_PUBLIC_IPgongchang_SUPABASE_PUBLISHABLE_KEY ||
    merged.IPgongchang_SUPABASE_ANON_KEY ||
    merged.IPgongchang_SUPABASE_PUBLISHABLE_KEY ||
    ''
  const supabaseServiceKey =
    merged.SUPABASE_SERVICE_ROLE_KEY ||
    merged.IPgongchang_SUPABASE_SERVICE_ROLE_KEY ||
    merged.IPgongchang_SUPABASE_SECRET_KEY ||
    ''
  return { supabaseUrl, supabaseAnonKey, supabaseServiceKey }
}

function buildSeedReports() {
  return [
    { step_id: 'P1', title: '《行业目标分析报告》', token: '【行业标识】ALPHA-SEAFOOD' },
    { step_id: 'P2', title: '《行业认知深度报告》', token: '【认知标识】BRAVO-DOUFA' },
    { step_id: 'P3', title: '《情绪价值分析报告》', token: '【情绪标识】CHARLIE-ANXIETY' },
    { step_id: 'IP传记', title: '《IP传记》', token: '【传记标识】DELTA-ORIGIN' },
    { step_id: 'P4', title: '《IP概念》', token: '【概念标识】ECHO-ANCHOR' },
    { step_id: 'P5', title: '《IP类型定位报告》', token: '【类型标识】FOXTROT-COMBO' },
    { step_id: 'P6', title: '《4X4内容规划报告》', token: '【规划标识】GOLF-4X4' },
    { step_id: 'P7', title: '《选题库》', token: '【选题标识】HOTEL-TOPIC' },
    { step_id: 'P8', title: '《脚本初稿》', token: '【脚本标识】INDIA-SCRIPT' },
    { step_id: 'P9', title: '《口语化终稿》', token: '【口语标识】JULIET-VOICE' },
  ]
}

function buildSteps() {
  return [
    { stepId: 'P5', deps: ['P4'] },
    { stepId: 'P6', deps: ['P1', 'P2', 'P3', 'IP传记', 'P4', 'P5'] },
    { stepId: 'P7', deps: ['P1', 'P3', 'P6', 'IP传记'] },
    { stepId: 'P8', deps: ['P7'] },
    { stepId: 'P9', deps: ['P8'] },
    { stepId: 'P10', deps: ['P9'] },
  ]
}

async function readSseResponse(response) {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (!data || data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        if (json.content) content += json.content
      } catch {
        // ignore bad JSON chunks
      }
    }
  }
  return content.trim()
}

async function main() {
  const { supabaseUrl, supabaseAnonKey, supabaseServiceKey } = resolveEnv()
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error('Missing Supabase env; ensure .env.local has URL/ANON/SERVICE_ROLE')
    process.exit(1)
  }

  const email = customEmail || `codex+workflow-${Date.now()}@ipgongchang.test`
  const password = customPassword || 'TestPass1234'

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
    user_metadata: { source: 'context-regress' },
  })
  if (createError) {
    console.warn('createUser failed, fallback to lookup:', createError.message)
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
    throw new Error('Unable to resolve user id for seeded account')
  }

  await adminClient
    .from('profiles')
    .upsert({
      id: userId,
      email,
      nickname: 'codex',
      plan: 'pro',
      credits_balance: 999,
      credits_unlimited: true,
    })

  await adminClient.from('reports').delete().eq('user_id', userId)

  const seedReports = buildSeedReports()
  const payload = seedReports.map((r) => ({
    user_id: userId,
    step_id: r.step_id,
    title: r.title,
    content: `# ${r.title}\n\n${r.token}\n\n简述：这是用于验证上下文注入的测试报告内容。\n`,
    metadata: { source: 'context-regress', token: r.token },
  }))
  const { error: insertError } = await adminClient.from('reports').insert(payload)
  if (insertError) throw insertError

  const stepIds = seedReports.map((r) => r.step_id)
  const { data: storedReports, error: fetchError } = await adminClient
    .from('reports')
    .select('id, step_id, title, content')
    .eq('user_id', userId)
    .in('step_id', stepIds)
  if (fetchError) throw fetchError

  const reportByStep = new Map()
  for (const report of storedReports || []) {
    reportByStep.set(report.step_id, report)
  }

  const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  const accessToken = signInData?.session?.access_token
  if (!accessToken) throw new Error('Failed to get access token')

  const tokensByStep = Object.fromEntries(seedReports.map((r) => [r.step_id, r.token]))
  const steps = buildSteps()
  const results = []

  for (const step of steps) {
    const inlineReports = []
    const reportRefs = []
    for (const dep of step.deps) {
      const report = reportByStep.get(dep)
      if (!report) continue
      reportRefs.push({ report_id: report.id })
      inlineReports.push({
        step_id: dep,
        title: report.title,
        content: report.content,
      })
    }

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        stepId: step.stepId,
        messages: [
          {
            role: 'user',
            content:
              '请从你收到的前置报告里提取所有形如【...标识】的短语，逐行列出，不要添加其它文字。如果没有看到，请回复“未读取到前置报告”。',
          },
        ],
        context: forceInline
          ? (inlineReports.length ? { inline_reports: inlineReports } : null)
          : (reportRefs.length ? { reports: reportRefs } : null),
      }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`chat failed (${step.stepId}) ${response.status}: ${text}`)
    }

    const content = await readSseResponse(response)
    const expected = step.deps.map((dep) => tokensByStep[dep]).filter(Boolean)
    const found = expected.filter((token) => content.includes(token))
    results.push({ step: step.stepId, expected, found, output: content })
  }

  console.log('=== P5–P10 上下文回归结果 ===')
  for (const r of results) {
    console.log(`STEP ${r.step}: ${r.found.length}/${r.expected.length}`)
    console.log(`TOKENS: ${r.found.join(' | ') || 'N/A'}`)
  }

  if (!keepUser) {
    await adminClient.from('reports').delete().eq('user_id', userId)
    await adminClient.from('profiles').delete().eq('id', userId)
    await adminClient.auth.admin.deleteUser(userId)
    console.log('Cleanup: ok')
  } else {
    console.log(`Cleanup: skipped (email=${email})`)
  }

  console.log('Done.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
