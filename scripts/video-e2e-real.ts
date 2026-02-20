import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"

type EnvMap = Record<string, string>

type ScenarioName = "done_real" | "no_env_failed" | "avatar_invalid" | "retry_cap_failed"
type AvatarMode = "full" | "portrait_only" | "invalid"

type HttpResult = {
  status: number
  body: unknown
}

type VideoHeadResult = {
  status: number | null
  ok: boolean
  url: string | null
}

type JobSnapshot = {
  id: string
  provider: string
  provider_job_id: string | null
  status: string
  progress: number
  retry_count: number
  audio_storage_path: string | null
  video_storage_path: string | null
  error: string | null
  updated_at: string
}

type TimelineEntry = {
  poll: number
  response: HttpResult
  db: JobSnapshot | null
}

type ScenarioOutput = {
  scenario: ScenarioName
  port: number
  base_url: string
  avatar_mode: AvatarMode
  request: {
    rewrite_id: string
    duration_profile: "15_25s"
    avatar_profile_id: string
    product_assets: string[]
  }
  create_first: HttpResult
  create_duplicate: HttpResult | null
  same_job_id: boolean | null
  job_id: string | null
  timeline: TimelineEntry[]
  final_get: HttpResult | null
  final_db: JobSnapshot | null
  video_head: VideoHeadResult | null
}

type MatrixOutput = {
  actor: "Codex-C"
  generated_at: string
  branch: string
  commit: string
  output_file: string
  scenarios: ScenarioOutput[]
}

type ScenarioConfig = {
  name: ScenarioName
  port: number
  envOverride: Record<string, string | null>
  requireVolcSpeech: boolean
  avatarMode: AvatarMode
  shouldPollTerminal: boolean
}

type SupabaseClientLoose = any

function nowIso() {
  return new Date().toISOString()
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function unwrap(value: string): string {
  const text = String(value || "").trim()
  if (!text) return ""
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1)
  }
  return text
}

function loadEnvFile(filePath: string): EnvMap {
  if (!fs.existsSync(filePath)) return {}

  const env: EnvMap = {}
  const text = fs.readFileSync(filePath, "utf8")
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    env[key] = unwrap(value)
  }

  return env
}

function getEnv(name: string, fileEnv: EnvMap): string {
  return unwrap(process.env[name] || fileEnv[name] || "")
}

function mergeEnv(base: NodeJS.ProcessEnv, override: Record<string, string | null>) {
  const merged: NodeJS.ProcessEnv = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value == null) {
      delete merged[key]
      continue
    }
    merged[key] = value
  }
  return merged
}

async function httpJson(baseUrl: string, pathname: string, opts?: { method?: string; token?: string; body?: unknown }) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: opts?.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts?.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  })

  const raw = await response.text()
  let body: unknown = null
  try {
    body = JSON.parse(raw)
  } catch {
    body = raw
  }

  return {
    status: response.status,
    body,
  } satisfies HttpResult
}

async function waitForServer(baseUrl: string, timeoutMs = 120_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/mp/video/jobs`, { method: "GET" })
      if (response.status > 0) return
    } catch {
      // ignore and retry
    }
    await delay(1000)
  }

  throw new Error(`server_boot_timeout:${baseUrl}`)
}

function startServer(cwd: string, port: number, env: NodeJS.ProcessEnv) {
  const server = spawn(
    "/usr/local/bin/node",
    ["node_modules/next/dist/bin/next", "dev", "--webpack", "-p", String(port)],
    {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  )

  const logPrefix = `[video-e2e-real:${port}]`
  server.stdout.on("data", (chunk) => {
    const text = String(chunk || "").trim()
    if (!text) return
    console.log(`${logPrefix} ${text}`)
  })
  server.stderr.on("data", (chunk) => {
    const text = String(chunk || "").trim()
    if (!text) return
    console.error(`${logPrefix} ${text}`)
  })

  return server
}

async function stopServer(server: ReturnType<typeof startServer>) {
  if (server.killed) return

  server.kill("SIGTERM")

  await Promise.race([
    new Promise<void>((resolve) => {
      server.once("exit", () => resolve())
    }),
    delay(5000),
  ])

  if (!server.killed) {
    server.kill("SIGKILL")
  }
}

async function ensureUserProfile(admin: SupabaseClientLoose, userId: string, email: string) {
  const { error } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      nickname: "Video E2E",
      plan: "free",
      credits_balance: 100,
      credits_unlimited: false,
    },
    { onConflict: "id" },
  )

  if (error) {
    throw new Error(`profile_upsert_failed:${error.message}`)
  }
}

async function createUserAndToken(
  admin: SupabaseClientLoose,
  anon: SupabaseClientLoose,
  marker: string,
) {
  const email = `codex.video.real.${marker}.${Date.now()}@example.com`
  const password = `Codex!${Date.now()}Aa11`

  const createResult = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nickname: "Codex C" },
  })

  if (createResult.error || !createResult.data.user?.id) {
    throw new Error(`create_user_failed:${createResult.error?.message || "unknown"}`)
  }

  const signInResult = await anon.auth.signInWithPassword({ email, password })
  if (signInResult.error || !signInResult.data.session?.access_token) {
    throw new Error(`sign_in_failed:${signInResult.error?.message || "unknown"}`)
  }

  return {
    user_id: createResult.data.user.id,
    email,
    access_token: signInResult.data.session.access_token,
  }
}

async function seedDependencies(admin: SupabaseClientLoose, userId: string, avatarMode: AvatarMode) {
  const sourceId = crypto.randomUUID()
  const rewriteId = crypto.randomUUID()

  const sourceInsert = await admin.from("content_sources").insert({
    id: sourceId,
    user_id: userId,
    source_mode: "single_link",
    platform: "douyin",
    source_url: `https://example.com/source/${sourceId}`,
    status: "ready",
    title: "Video Real Source",
    text_content: "Video source text",
    images: [],
    meta: {},
    raw_payload: {},
  })
  if (sourceInsert.error) {
    throw new Error(`seed_source_failed:${sourceInsert.error.message}`)
  }

  const rewriteInsert = await admin.from("content_rewrites").insert({
    id: rewriteId,
    user_id: userId,
    source_id: sourceId,
    target: "douyin_video",
    tone: "professional",
    constraints: {},
    result_title: "Video real title",
    result_body: "This is a script body for real provider video e2e.",
    result_script: "This is a script for real provider video e2e.",
    status: "done",
  })
  if (rewriteInsert.error) {
    throw new Error(`seed_rewrite_failed:${rewriteInsert.error.message}`)
  }

  if (avatarMode === "invalid") {
    return {
      rewrite_id: rewriteId,
      avatar_profile_id: crypto.randomUUID(),
    }
  }

  const avatarProfileId = crypto.randomUUID()
  const avatarPayload =
    avatarMode === "full"
      ? {
          id: avatarProfileId,
          user_id: userId,
          name: "Real Avatar",
          boss_drive_video_path: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          boss_portrait_path: "https://example.com/avatar.jpg",
        }
      : {
          id: avatarProfileId,
          user_id: userId,
          name: "Portrait Only Avatar",
          boss_drive_video_path: null,
          boss_portrait_path: "https://example.com/avatar-only.jpg",
        }

  const avatarInsert = await admin.from("store_profiles").insert(avatarPayload)
  if (avatarInsert.error) {
    throw new Error(`seed_avatar_failed:${avatarInsert.error.message}`)
  }

  return {
    rewrite_id: rewriteId,
    avatar_profile_id: avatarProfileId,
  }
}

async function queryJob(admin: SupabaseClientLoose, jobId: string): Promise<JobSnapshot | null> {
  const { data, error } = await admin
    .from("video_render_jobs")
    .select(
      "id,provider,provider_job_id,status,progress,retry_count,audio_storage_path,video_storage_path,error,updated_at",
    )
    .eq("id", jobId)
    .maybeSingle()

  if (error) {
    throw new Error(`video_job_query_failed:${error.message}`)
  }
  if (!data) return null

  return {
    id: String(data.id),
    provider: String(data.provider || ""),
    provider_job_id: data.provider_job_id ? String(data.provider_job_id) : null,
    status: String(data.status || ""),
    progress: Number(data.progress || 0),
    retry_count: Number(data.retry_count || 0),
    audio_storage_path: data.audio_storage_path ? String(data.audio_storage_path) : null,
    video_storage_path: data.video_storage_path ? String(data.video_storage_path) : null,
    error: data.error ? String(data.error) : null,
    updated_at: String(data.updated_at || ""),
  }
}

function extractJobId(result: HttpResult): string | null {
  if (!result || typeof result.body !== "object" || !result.body) return null
  const value = (result.body as Record<string, unknown>).job_id
  return typeof value === "string" && value ? value : null
}

function extractVideoUrlFromGet(result: HttpResult | null): string | null {
  if (!result || typeof result.body !== "object" || !result.body) return null
  const job = (result.body as Record<string, unknown>).job
  if (!job || typeof job !== "object") return null
  const value = (job as Record<string, unknown>).video_url
  return typeof value === "string" && value.trim() ? value : null
}

async function headVideo(url: string | null): Promise<VideoHeadResult | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { method: "HEAD" })
    return {
      status: res.status,
      ok: res.ok,
      url,
    }
  } catch {
    return {
      status: null,
      ok: false,
      url,
    }
  }
}

async function pollUntilTerminal(opts: {
  baseUrl: string
  token: string
  jobId: string
  admin: SupabaseClientLoose
  maxPolls?: number
  intervalMs?: number
}) {
  const maxPolls = opts.maxPolls || 25
  const intervalMs = opts.intervalMs || 1500
  const timeline: TimelineEntry[] = []

  let finalGet: HttpResult | null = null
  let finalDb: JobSnapshot | null = null

  for (let poll = 1; poll <= maxPolls; poll += 1) {
    const response = await httpJson(opts.baseUrl, `/api/mp/video/jobs/${opts.jobId}`, {
      method: "GET",
      token: opts.token,
    })

    const db = await queryJob(opts.admin, opts.jobId)
    timeline.push({ poll, response, db })

    finalGet = response
    finalDb = db

    const status =
      typeof response.body === "object" && response.body
        ? ((response.body as Record<string, unknown>).job as Record<string, unknown> | undefined)?.status
        : undefined

    if (status === "done" || status === "failed") {
      break
    }

    await delay(intervalMs)
  }

  return {
    timeline,
    final_get: finalGet,
    final_db: finalDb,
  }
}

function requireNodeModules(cwd: string) {
  const nextBin = path.join(cwd, "node_modules/next/dist/bin/next")
  if (!fs.existsSync(nextBin)) {
    throw new Error(`next_binary_missing:${nextBin}`)
  }
}

async function runScenario(
  cwd: string,
  baseEnv: NodeJS.ProcessEnv,
  supabaseUrl: string,
  supabaseAnonKey: string,
  supabaseServiceRoleKey: string,
  config: ScenarioConfig,
): Promise<ScenarioOutput> {
  if (config.requireVolcSpeech) {
    if (!unwrap(String(baseEnv.VOLC_SPEECH_APP_ID || "")) || !unwrap(String(baseEnv.VOLC_SPEECH_ACCESS_TOKEN || ""))) {
      throw new Error(`scenario_requires_volc_speech_env:${config.name}`)
    }
  }

  const scenarioEnv = mergeEnv(baseEnv, config.envOverride)
  scenarioEnv.PATH = `/usr/local/bin:/usr/bin:/bin:${scenarioEnv.PATH || ""}`

  const baseUrl = `http://127.0.0.1:${config.port}`
  const server = startServer(cwd, config.port, scenarioEnv)

  try {
    await waitForServer(baseUrl)

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const anon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const auth = await createUserAndToken(admin, anon, config.name)
    await ensureUserProfile(admin, auth.user_id, auth.email)

    const seed = await seedDependencies(admin, auth.user_id, config.avatarMode)

    const requestBody = {
      rewrite_id: seed.rewrite_id,
      duration_profile: "15_25s" as const,
      avatar_profile_id: seed.avatar_profile_id,
      product_assets: ["https://example.com/product-a.jpg"],
    }

    const createFirst = await httpJson(baseUrl, "/api/mp/video/jobs", {
      method: "POST",
      token: auth.access_token,
      body: requestBody,
    })

    const firstJobId = extractJobId(createFirst)

    const createDuplicate =
      firstJobId && createFirst.status === 200
        ? await httpJson(baseUrl, "/api/mp/video/jobs", {
            method: "POST",
            token: auth.access_token,
            body: requestBody,
          })
        : null

    const duplicateJobId = createDuplicate ? extractJobId(createDuplicate) : null

    let timeline: TimelineEntry[] = []
    let finalGet: HttpResult | null = null
    let finalDb: JobSnapshot | null = null
    let videoHead: VideoHeadResult | null = null

    if (config.shouldPollTerminal && firstJobId) {
      const polled = await pollUntilTerminal({
        baseUrl,
        token: auth.access_token,
        jobId: firstJobId,
        admin,
      })
      timeline = polled.timeline
      finalGet = polled.final_get
      finalDb = polled.final_db

      const videoUrl = extractVideoUrlFromGet(finalGet)
      if (videoUrl) {
        videoHead = await headVideo(videoUrl)
      }
    }

    return {
      scenario: config.name,
      port: config.port,
      base_url: baseUrl,
      avatar_mode: config.avatarMode,
      request: requestBody,
      create_first: createFirst,
      create_duplicate: createDuplicate,
      same_job_id: createDuplicate ? Boolean(firstJobId && duplicateJobId && firstJobId === duplicateJobId) : null,
      job_id: firstJobId,
      timeline,
      final_get: finalGet,
      final_db: finalDb,
      video_head: videoHead,
    }
  } finally {
    await stopServer(server)
  }
}

async function resolveBranchAndCommit(cwd: string) {
  const branch = await new Promise<string>((resolve, reject) => {
    const proc = spawn("/usr/bin/git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd })
    let output = ""
    proc.stdout.on("data", (chunk) => {
      output += String(chunk || "")
    })
    proc.once("close", (code) => {
      if (code !== 0) {
        reject(new Error("git_branch_query_failed"))
        return
      }
      resolve(output.trim())
    })
  })

  const commit = await new Promise<string>((resolve, reject) => {
    const proc = spawn("/usr/bin/git", ["rev-parse", "HEAD"], { cwd })
    let output = ""
    proc.stdout.on("data", (chunk) => {
      output += String(chunk || "")
    })
    proc.once("close", (code) => {
      if (code !== 0) {
        reject(new Error("git_commit_query_failed"))
        return
      }
      resolve(output.trim())
    })
  })

  return {
    branch,
    commit,
  }
}

async function run() {
  const cwd = process.cwd()
  requireNodeModules(cwd)

  const envFile = loadEnvFile(path.join(cwd, ".env.local"))

  const supabaseUrl =
    getEnv("NEXT_PUBLIC_SUPABASE_URL", envFile) ||
    getEnv("NEXT_PUBLIC_IPgongchang_SUPABASE_URL", envFile) ||
    getEnv("IPgongchang_SUPABASE_URL", envFile)
  const supabaseAnonKey =
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", envFile) ||
    getEnv("NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY", envFile) ||
    getEnv("NEXT_PUBLIC_IPgongchang_SUPABASE_PUBLISHABLE_KEY", envFile)
  const supabaseServiceRoleKey =
    getEnv("SUPABASE_SERVICE_ROLE_KEY", envFile) || getEnv("IPgongchang_SUPABASE_SERVICE_ROLE_KEY", envFile)

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error("supabase_env_missing")
  }

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...envFile,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
  }

  const scenarioList: ScenarioConfig[] = [
    {
      name: "done_real",
      port: Number(process.env.VIDEO_E2E_REAL_DONE_PORT || 3330),
      requireVolcSpeech: true,
      avatarMode: "full",
      shouldPollTerminal: true,
      envOverride: {
        VIDEO_PIPELINE_MOCK_VIDEO_URL: "",
        VIDEO_PIPELINE_ALLOW_AUDIO_ONLY_SUCCESS: "",
      },
    },
    {
      name: "no_env_failed",
      port: Number(process.env.VIDEO_E2E_REAL_NOENV_PORT || 3331),
      requireVolcSpeech: false,
      avatarMode: "full",
      shouldPollTerminal: true,
      envOverride: {
        VOLC_SPEECH_APP_ID: "",
        VOLC_SPEECH_ACCESS_TOKEN: "",
        VIDEO_PIPELINE_MOCK_VIDEO_URL: "",
        VIDEO_PIPELINE_ALLOW_AUDIO_ONLY_SUCCESS: "",
      },
    },
    {
      name: "avatar_invalid",
      port: Number(process.env.VIDEO_E2E_REAL_AVATAR_PORT || 3332),
      requireVolcSpeech: false,
      avatarMode: "invalid",
      shouldPollTerminal: false,
      envOverride: {
        VIDEO_PIPELINE_MOCK_VIDEO_URL: "",
        VIDEO_PIPELINE_ALLOW_AUDIO_ONLY_SUCCESS: "",
      },
    },
    {
      name: "retry_cap_failed",
      port: Number(process.env.VIDEO_E2E_REAL_RETRY_PORT || 3333),
      requireVolcSpeech: true,
      avatarMode: "portrait_only",
      shouldPollTerminal: true,
      envOverride: {
        VIDEO_PIPELINE_MOCK_VIDEO_URL: "",
        VIDEO_PIPELINE_ALLOW_AUDIO_ONLY_SUCCESS: "",
      },
    },
  ]

  const { branch, commit } = await resolveBranchAndCommit(cwd)

  const results: ScenarioOutput[] = []
  for (const scenario of scenarioList) {
    console.log(`running scenario: ${scenario.name} @ ${scenario.port}`)
    const result = await runScenario(cwd, baseEnv, supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey, scenario)
    results.push(result)
  }

  const outputPath =
    process.env.VIDEO_E2E_OUTPUT ||
    process.env.VIDEO_E2E_REAL_OUTPUT ||
    path.join(cwd, `tmp/video-e2e-real-${Date.now().toString()}.json`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  const payload: MatrixOutput = {
    actor: "Codex-C",
    generated_at: nowIso(),
    branch,
    commit,
    output_file: outputPath,
    scenarios: results,
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  console.log(`real_output=${outputPath}`)
  console.log(JSON.stringify(payload, null, 2))
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`video_e2e_real_failed:${message}`)
  process.exit(1)
})
