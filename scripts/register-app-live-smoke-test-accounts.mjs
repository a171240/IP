#!/usr/bin/env node

import { randomBytes, createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createClient } from "@supabase/supabase-js"
import pg from "pg"

const { Pool } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const ALLOW_ENV = "MEIYE_ALLOW_APP_TEST_ACCOUNT_REGISTRATION"
const DEFAULT_OUT = resolve(BACKEND_ROOT, "deploy/app-live-smoke-test-accounts.local.json")
const DEFAULT_BASE_URL = "https://api-cn.ipgongchang.xin"
const DEFAULT_DEVICE_ID = "app-live-smoke-device-20260702"
const APP_ENV_FILE = resolve(BACKEND_ROOT, "..", "..", ".env.production-cn.local")

const TEST_ACCOUNTS = [
  {
    key: "employee",
    tokenEnvName: "APP_EMPLOYEE_TOKEN",
    email: "meiye-app-live-smoke-employee@ipgongchang.xin",
    nickname: "Meiye App Live Smoke Employee",
    role: "employee",
    servicePlanLabel: "Live smoke employee test account",
  },
  {
    key: "manager",
    tokenEnvName: "APP_MANAGER_TOKEN",
    email: "meiye-app-live-smoke-manager@ipgongchang.xin",
    nickname: "Meiye App Live Smoke Manager",
    role: "store_admin",
    servicePlanLabel: "Live smoke manager test account",
  },
]

function parseArgs(argv) {
  const args = {
    execute: false,
    verifyReadonly: false,
    profileThroughApi: false,
    envFile: "",
    out: DEFAULT_OUT,
    baseUrl: DEFAULT_BASE_URL,
    deviceId: DEFAULT_DEVICE_ID,
    companyId: "",
    storeId: "",
    databaseUrlKmsSecretName: "",
    databaseUrlKmsVersionStage: "ACSCurrent",
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--execute") {
      args.execute = true
      continue
    }
    if (arg === "--verify-readonly") {
      args.verifyReadonly = true
      continue
    }
    if (arg === "--profile-through-api") {
      args.profileThroughApi = true
      args.verifyReadonly = true
      continue
    }
    if (arg === "--env-file") {
      args.envFile = resolvePath(readArgValue(argv[++index], "--env-file"))
      continue
    }
    if (arg === "--out") {
      args.out = resolvePath(readArgValue(argv[++index], "--out"))
      continue
    }
    if (arg === "--base-url") {
      args.baseUrl = readArgValue(argv[++index], "--base-url").replace(/\/+$/, "")
      continue
    }
    if (arg === "--device-id") {
      args.deviceId = readArgValue(argv[++index], "--device-id")
      continue
    }
    if (arg === "--company-id") {
      args.companyId = readArgValue(argv[++index], "--company-id")
      continue
    }
    if (arg === "--store-id") {
      args.storeId = readArgValue(argv[++index], "--store-id")
      continue
    }
    if (arg === "--database-url-kms-secret-name") {
      args.databaseUrlKmsSecretName = readArgValue(argv[++index], "--database-url-kms-secret-name")
      continue
    }
    if (arg === "--database-url-kms-version-stage") {
      args.databaseUrlKmsVersionStage = readArgValue(argv[++index], "--database-url-kms-version-stage")
      continue
    }
    if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    }
    throw new Error(`unknown_arg:${arg}`)
  }

  return args
}

function readArgValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return value
}

function resolvePath(value) {
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function loadEnvFile(filePath) {
  if (!filePath) return { loaded: false, path: "", keysLoaded: 0 }
  if (!existsSync(filePath)) throw new Error(`env_file_not_found:${filePath}`)

  let keysLoaded = 0
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const key = match[1]
    if (process.env[key]) continue
    process.env[key] = parseEnvValue(match[2])
    keysLoaded += 1
  }
  return { loaded: true, path: filePath, keysLoaded }
}

function parseEnvValue(raw) {
  let value = String(raw || "").trim()
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  return value.replace(/\\n/g, "\n")
}

function readEnvAny(names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim()
    if (value && !value.startsWith("TODO_")) return value
  }
  return ""
}

function requireEnvAny(names, label) {
  const value = readEnvAny(names)
  if (!value) throw new Error(`missing_required_env:${label}:${names.join("|")}`)
  return value
}

function requireUuid(value, label) {
  const text = String(value || "").trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error(`invalid_uuid:${label}`)
  }
  return text
}

function randomPassword() {
  return `${randomBytes(32).toString("base64url")}Aa1!`
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function makeSupabaseClients() {
  const url = requireEnvAny(
    ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_IPgongchang_SUPABASE_URL", "IPgongchang_SUPABASE_URL"],
    "supabase_url",
  )
  const anonKey = requireEnvAny(
    [
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_IPgongchang_SUPABASE_PUBLISHABLE_KEY",
      "IPgongchang_SUPABASE_ANON_KEY",
      "IPgongchang_SUPABASE_PUBLISHABLE_KEY",
    ],
    "supabase_anon_key",
  )
  const serviceRoleKey = requireEnvAny(
    ["SUPABASE_SERVICE_ROLE_KEY", "IPgongchang_SUPABASE_SERVICE_ROLE_KEY", "IPgongchang_SUPABASE_SECRET_KEY"],
    "supabase_service_role_key",
  )

  return {
    admin: createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    anon: createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  }
}

async function findSupabaseUserByEmail(admin, email) {
  const normalized = email.trim().toLowerCase()
  const perPage = 1000
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`supabase_list_users_failed:${error.message}`)
    const users = data?.users || []
    const matched = users.find((user) => String(user.email || "").trim().toLowerCase() === normalized)
    if (matched) return matched
    if (users.length < perPage) break
  }
  return null
}

async function upsertSupabaseUser(admin, account, password) {
  const metadata = {
    nickname: account.nickname,
    auth_source: "app_live_smoke_test",
    account_role: account.role,
    company_id: account.companyId,
    company_name: account.companyName,
    store_id: account.storeId,
    store_name: account.storeName,
    service_plan_label: account.servicePlanLabel,
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (!error && data?.user?.id) return { user: data.user, created: true }

  const message = String(error?.message || "")
  if (!/already|registered|exists|duplicate/i.test(message)) {
    throw new Error(`supabase_create_user_failed:${message || "unknown_error"}`)
  }

  const existing = await findSupabaseUserByEmail(admin, account.email)
  if (!existing?.id) throw new Error(`supabase_existing_user_not_found:${account.email}`)
  const updated = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: { ...(existing.user_metadata || {}), ...metadata },
  })
  if (updated.error || !updated.data?.user?.id) {
    throw new Error(`supabase_update_user_failed:${updated.error?.message || "unknown_error"}`)
  }
  return { user: updated.data.user, created: false }
}

async function resolveScopeFromSupabase(admin, args) {
  if (args.companyId || args.storeId) {
    const companyId = args.companyId ? requireUuid(args.companyId, "company_id") : ""
    const storeId = args.storeId ? requireUuid(args.storeId, "store_id") : ""
    let storeQuery = admin
      .from("mp_stores")
      .select("id, company_id, name, status, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
    if (companyId) storeQuery = storeQuery.eq("company_id", companyId)
    if (storeId) storeQuery = storeQuery.eq("id", storeId)
    const { data: stores, error: storeError } = await storeQuery
    if (storeError) throw new Error(`supabase_scope_store_query_failed:${storeError.message}`)
    const store = stores?.[0]
    if (!store) throw new Error("target_company_store_not_found")
    const company = await readSupabaseCompany(admin, store.company_id)
    return {
      company_id: company.id,
      company_name: company.name,
      store_id: store.id,
      store_name: store.name,
    }
  }

  const { data: stores, error: storeError } = await admin
    .from("mp_stores")
    .select("id, company_id, name, status, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
  if (storeError) throw new Error(`supabase_scope_store_query_failed:${storeError.message}`)
  const store = stores?.[0]
  if (!store) throw new Error("no_active_company_store")
  const company = await readSupabaseCompany(admin, store.company_id)
  return {
    company_id: company.id,
    company_name: company.name,
    store_id: store.id,
    store_name: store.name,
  }
}

async function readSupabaseCompany(admin, companyId) {
  const { data: company, error } = await admin
    .from("mp_companies")
    .select("id, name, status")
    .eq("id", companyId)
    .eq("status", "active")
    .maybeSingle()
  if (error || !company) throw new Error(`supabase_scope_company_query_failed:${error?.message || "not_found"}`)
  return company
}

async function signInSupabaseUser(anon, email, password) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data?.session?.access_token) {
    throw new Error(`supabase_sign_in_failed:${error?.message || "missing_session"}`)
  }
  return data.session
}

function makePool(args) {
  const databaseUrl = resolveDatabaseUrl(args)
  return new Pool({
    connectionString: databaseUrl,
    application_name: "meiye-app-live-smoke-test-account-registration",
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 1_000,
  })
}

function resolveDatabaseUrl(args) {
  const directDatabaseUrl = readEnvAny(["DATABASE_URL_CN"])
  if (directDatabaseUrl) return directDatabaseUrl
  if (args.databaseUrlKmsSecretName) return readDatabaseUrlFromAliyunKms(args)
  throw new Error("missing_required_env:database_url_cn:DATABASE_URL_CN")
}

function readDatabaseUrlFromAliyunKms(args) {
  const secretName = String(args.databaseUrlKmsSecretName || "").trim()
  if (!secretName) throw new Error("missing_kms_secret_name:database_url_cn")
  const versionStage = String(args.databaseUrlKmsVersionStage || "ACSCurrent").trim()
  const result = spawnSync(
    process.env.ALIYUN_CLI_BIN || "aliyun",
    ["kms", "GetSecretValue", "--SecretName", secretName, "--VersionStage", versionStage],
    {
      cwd: BACKEND_ROOT,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    },
  )
  if (result.status !== 0) {
    throw new Error(`aliyun_kms_get_secret_value_failed:${result.status}`)
  }
  const json = JSON.parse(result.stdout || "{}")
  const secretData = String(json.SecretData || "").trim()
  if (!secretData) throw new Error("aliyun_kms_secret_data_missing")
  return secretData
}

async function resolveScope(client, args) {
  if (args.companyId || args.storeId) {
    const companyId = args.companyId ? requireUuid(args.companyId, "company_id") : ""
    const storeId = args.storeId ? requireUuid(args.storeId, "store_id") : ""
    const values = []
    const clauses = ["store.status = 'active'", "company.status = 'active'"]
    if (companyId) {
      values.push(companyId)
      clauses.push(`company.id = $${values.length}`)
    }
    if (storeId) {
      values.push(storeId)
      clauses.push(`store.id = $${values.length}`)
    }
    const selected = await client.query(
      `
        select
          company.id as company_id,
          company.name as company_name,
          store.id as store_id,
          store.name as store_name
        from public.mp_stores store
        join public.mp_companies company on company.id = store.company_id
        where ${clauses.join(" and ")}
        order by store.created_at desc
        limit 1
      `,
      values,
    )
    if (!selected.rows[0]) throw new Error("target_company_store_not_found")
    return selected.rows[0]
  }

  const selected = await client.query(
    `
      select
        company.id as company_id,
        company.name as company_name,
        store.id as store_id,
        store.name as store_name
      from public.mp_stores store
      join public.mp_companies company on company.id = store.company_id
      where store.status = 'active' and company.status = 'active'
      order by store.created_at desc
      limit 1
    `,
  )
  if (!selected.rows[0]) throw new Error("no_active_company_store")
  return selected.rows[0]
}

async function upsertRdsAccount(client, account, user, scope, now) {
  await client.query(
    `
      insert into public.profiles (
        id, email, nickname, avatar_url, plan, credits_balance, credits_unlimited,
        account_role, company_id, company_name, store_id, store_name, service_plan_label
      )
      values ($1, $2, $3, null, 'free', 30, false, $4, $5, $6, $7, $8, $9)
      on conflict (id) do update
        set email = excluded.email,
            nickname = excluded.nickname,
            account_role = excluded.account_role,
            company_id = excluded.company_id,
            company_name = excluded.company_name,
            store_id = excluded.store_id,
            store_name = excluded.store_name,
            service_plan_label = excluded.service_plan_label,
            updated_at = now()
    `,
    [
      user.id,
      account.email,
      account.nickname,
      account.role,
      scope.company_id,
      scope.company_name,
      scope.store_id,
      scope.store_name,
      account.servicePlanLabel,
    ],
  )

  const membership = await client.query(
    `
      insert into public.mp_account_memberships
        (user_id, company_id, store_id, role, status, display_name, accepted_at, last_seen_at)
      values ($1, $2, $3, $4, 'active', $5, $6, $6)
      on conflict (user_id, company_id, store_id, role) do update
        set status = 'active',
            display_name = excluded.display_name,
            accepted_at = excluded.accepted_at,
            last_seen_at = excluded.last_seen_at,
            updated_at = now()
      returning id, user_id, company_id, store_id, role, status
    `,
    [user.id, scope.company_id, scope.store_id, account.role, account.nickname, now],
  )
  if (!membership.rows[0]) throw new Error(`membership_upsert_failed:${account.key}`)
  return membership.rows[0]
}

async function verifyReadonlyProbe(args, account, token) {
  const headers = {
    authorization: `Bearer ${token}`,
    "x-device-id": args.deviceId,
    "x-app-live-smoke": "test-account-registration",
  }
  const profile = await requestProbe(args.baseUrl, "/api/app/profile", headers)
  const storeAdmin = await requestProbe(args.baseUrl, "/api/app/store-admin/service-records?limit=1", headers)
  return {
    account: account.key,
    profileStatus: profile.status,
    profileOk: profile.status === 200,
    storeAdminServiceRecordsStatus: storeAdmin.status,
    storeAdminServiceRecordsExpected:
      account.key === "manager" ? "200" : "403_store_admin_required",
    storeAdminServiceRecordsOk:
      account.key === "manager"
        ? storeAdmin.status === 200
        : storeAdmin.status === 403 && storeAdmin.code === "store_admin_required",
    storeAdminServiceRecordsCode: storeAdmin.code,
  }
}

async function hydrateProfileViaApi(args, token) {
  const result = await requestProbe(args.baseUrl, "/api/app/profile", {
    authorization: `Bearer ${token}`,
    "x-device-id": args.deviceId,
    "x-app-live-smoke": "test-account-registration",
  })
  if (result.status !== 200) throw new Error(`profile_hydrate_failed:${result.status}:${result.code}`)
  return result
}

async function requestProbe(baseUrl, path, headers) {
  const response = await fetch(`${baseUrl}${path}`, { method: "GET", headers })
  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  return {
    status: response.status,
    code: body && typeof body === "object" ? String(body.code || body.error || "") : "",
  }
}

function makeReport(args, envLoad, scope, accounts, verification) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    purpose: "APP API read-only live-smoke employee and manager test accounts",
    registrationMode: args.profileThroughApi ? "profile_through_api" : "direct_rds",
    containsSecretTokens: true,
    gitIgnored: true,
    outputFile: args.out,
    envFileLoaded: envLoad.loaded,
    envFilePath: envLoad.loaded ? envLoad.path : "",
    envKeysLoaded: envLoad.keysLoaded,
    databaseUrlSource: args.profileThroughApi
      ? "not_used_profile_through_api"
      : (readEnvAny(["DATABASE_URL_CN"]) ? "env" : "kms_secret"),
    appBaseUrl: args.baseUrl,
    appDeviceId: args.deviceId,
    scope: {
      companyId: scope.company_id,
      companyName: scope.company_name,
      storeId: scope.store_id,
      storeName: scope.store_name,
    },
    accounts,
    smokeEnv: Object.fromEntries(accounts.map((account) => [account.tokenEnvName, account.accessToken])),
    smokeEnvWithBase: {
      APP_BASE_URL: args.baseUrl,
      APP_DEVICE_ID: args.deviceId,
      ...Object.fromEntries(accounts.map((account) => [account.tokenEnvName, account.accessToken])),
    },
    verification,
    safetyBoundary: [
      "Requires --execute and MEIYE_ALLOW_APP_TEST_ACCOUNT_REGISTRATION=1.",
      "Creates or updates only two Supabase Auth test users plus the minimum account rows needed for smoke.",
      "In direct_rds mode, it touches public.profiles and mp_account_memberships.",
      "With --profile-through-api, profile rows are hydrated by GET /api/app/profile instead of local RDS access.",
      "Does not deploy, push, upload, mutate OSS, or print token/database/service-role values to stdout.",
      "If --database-url-kms-secret-name is used, DATABASE_URL_CN is read from KMS only in memory.",
      "The output file is deploy/*.local.json and is ignored by git.",
    ],
  }
}

function redactAccount(account) {
  const { accessToken, refreshToken, ...safe } = account
  return {
    ...safe,
    accessToken: accessToken ? "[written_to_local_file]" : "",
    refreshToken: refreshToken ? "[written_to_local_file]" : "",
  }
}

function stdoutReport(report, ok) {
  return {
    ok,
    generatedAt: report.generatedAt,
    environment: report.environment,
    outputFile: report.outputFile,
    containsSecretTokensInOutputFile: report.containsSecretTokens,
    stdoutContainsSecretTokens: false,
    appBaseUrl: report.appBaseUrl,
    appDeviceId: report.appDeviceId,
    scope: report.scope,
    accounts: report.accounts.map(redactAccount),
    verification: report.verification,
  }
}

function writeJson(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  chmodSync(filePath, 0o600)
}

async function main() {
  const args = parseArgs(process.argv)
  const envLoad = loadEnvFile(args.envFile)

  if (!args.execute) {
    const summary = {
      ok: false,
      mode: "dry_run",
      executeRequired: true,
      allowEnvRequired: ALLOW_ENV,
      defaultEnvFile: APP_ENV_FILE,
      outputFile: args.out,
      wouldCreateOrUpdate: TEST_ACCOUNTS.map(({ key, tokenEnvName, email, role }) => ({
        key,
        tokenEnvName,
        email,
        role,
      })),
      writesAuthorizedHere: false,
      secretValuesPrinted: false,
      profileThroughApiAvailable: true,
    }
    console.log(JSON.stringify(summary, null, 2))
    process.exit(1)
  }

  if (process.env[ALLOW_ENV] !== "1") {
    throw new Error(`missing_allow_env:${ALLOW_ENV}`)
  }

  const { admin, anon } = makeSupabaseClients()

  if (args.profileThroughApi) {
    const scope = await resolveScopeFromSupabase(admin, args)
    const accounts = []
    for (const baseAccount of TEST_ACCOUNTS) {
      const account = {
        ...baseAccount,
        companyId: scope.company_id,
        companyName: scope.company_name,
        storeId: scope.store_id,
        storeName: scope.store_name,
      }
      const password = randomPassword()
      const { user, created } = await upsertSupabaseUser(admin, account, password)
      const session = await signInSupabaseUser(anon, account.email, password)
      await hydrateProfileViaApi(args, session.access_token)
      accounts.push({
        key: account.key,
        tokenEnvName: account.tokenEnvName,
        email: account.email,
        userId: user.id,
        role: account.role,
        supabaseUserCreated: created,
        rdsProfileHydratedByApi: true,
        rdsProfileUpserted: false,
        membershipId: null,
        membershipStatus: "not_created_profile_fallback",
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        accessTokenSha256: sha256(session.access_token),
      })
    }

    const verification = []
    for (const account of accounts) {
      const source = TEST_ACCOUNTS.find((item) => item.key === account.key)
      verification.push(await verifyReadonlyProbe(args, source, account.accessToken))
    }

    const report = makeReport(args, envLoad, scope, accounts, verification)
    writeJson(args.out, report)
    const verificationOk = verification.every((item) => item.profileOk && item.storeAdminServiceRecordsOk)
    console.log(JSON.stringify(stdoutReport(report, verificationOk), null, 2))
    process.exit(verificationOk ? 0 : 1)
  }

  const pool = makePool(args)
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    const scope = await resolveScope(client, args)
    const now = new Date().toISOString()
    const accounts = []

    for (const account of TEST_ACCOUNTS) {
      const password = randomPassword()
      const { user, created } = await upsertSupabaseUser(admin, account, password)
      const session = await signInSupabaseUser(anon, account.email, password)
      const membership = await upsertRdsAccount(client, account, user, scope, now)
      accounts.push({
        key: account.key,
        tokenEnvName: account.tokenEnvName,
        email: account.email,
        userId: user.id,
        role: account.role,
        supabaseUserCreated: created,
        rdsProfileUpserted: true,
        membershipId: membership.id,
        membershipStatus: membership.status,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        accessTokenSha256: sha256(session.access_token),
      })
    }

    await client.query("COMMIT")

    const verification = []
    if (args.verifyReadonly) {
      for (const account of accounts) {
        const source = TEST_ACCOUNTS.find((item) => item.key === account.key)
        verification.push(await verifyReadonlyProbe(args, source, account.accessToken))
      }
    }

    const report = makeReport(args, envLoad, scope, accounts, verification)
    writeJson(args.out, report)

    const verificationOk = verification.every((item) => item.profileOk && item.storeAdminServiceRecordsOk)
    console.log(JSON.stringify(stdoutReport(report, !args.verifyReadonly || verificationOk), null, 2))
    process.exit(args.verifyReadonly && !verificationOk ? 1 : 0)
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/register-app-live-smoke-test-accounts.mjs",
    "  MEIYE_ALLOW_APP_TEST_ACCOUNT_REGISTRATION=1 node scripts/register-app-live-smoke-test-accounts.mjs --execute --env-file ../../.env.production-cn.local --profile-through-api",
    "  MEIYE_ALLOW_APP_TEST_ACCOUNT_REGISTRATION=1 node scripts/register-app-live-smoke-test-accounts.mjs --execute --env-file ../../.env.production-cn.local --database-url-kms-secret-name <secret-name> --verify-readonly",
    "",
    "Writes the full token payload only to deploy/app-live-smoke-test-accounts.local.json.",
    "Stdout is redacted and contains no token, service role key, or database URL values.",
  ].join("\n"))
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    secretValuesPrinted: false,
  }, null, 2))
  process.exit(1)
})
