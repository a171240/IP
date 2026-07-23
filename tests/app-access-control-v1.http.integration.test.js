/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const net = require("node:net")
const os = require("node:os")
const path = require("node:path")
const { spawn, spawnSync } = require("node:child_process")
const { Pool } = require("pg")

const root = process.cwd()
const enabled = process.env.APP_ACCESS_CONTROL_HTTP_INTEGRATION === "1"
const deviceId = "app-access-http-integration"
const userId = "10000000-0000-4000-8000-000000000011"
const operatorUserId = "10000000-0000-4000-8000-000000000012"
const companyId = "20000000-0000-4000-8000-000000000011"
const storeId = "30000000-0000-4000-8000-000000000011"

function findExecutable(name) {
  const result = spawnSync("sh", ["-lc", `command -v ${name}`], {
    encoding: "utf8",
  })
  if (result.status !== 0) return ""
  return String(result.stdout || "").trim()
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  })
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim()
    throw new Error(`${path.basename(executable)} failed (${result.status}): ${output}`)
  }
  return result
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close(error => (error ? reject(error) : resolve(port)))
    })
  })
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

function progress(step) {
  process.stderr.write(`[app-access-http] ${step}\n`)
}

function boundedServerLog(chunks, tokens) {
  let output = chunks.join("").split(/\r?\n/).slice(-80).join("\n")
  for (const token of tokens) output = output.replaceAll(token, "[redacted-test-token]")
  return output
}

async function waitForHttpServer(baseUrl, serverProcess, logChunks, tokens) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(
        `Next server exited before readiness (${serverProcess.exitCode}):\n${boundedServerLog(logChunks, tokens)}`,
      )
    }
    try {
      const response = await fetch(`${baseUrl}/api/app/access`, {
        signal: AbortSignal.timeout(3_000),
      })
      if (response.status === 401) return
    } catch {
      // The local server can refuse connections while Next compiles the first route.
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error(`Next server readiness timeout:\n${boundedServerLog(logChunks, tokens)}`)
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return
  child.kill("SIGTERM")
  await Promise.race([
    new Promise(resolve => child.once("exit", resolve)),
    new Promise(resolve => setTimeout(resolve, 5_000)),
  ])
  if (child.exitCode === null) child.kill("SIGKILL")
}

async function requestJson(baseUrl, pathname, token, init = {}) {
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-device-id": deviceId,
    ...(init.headers || {}),
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.json()
  return { body, status: response.status }
}

test(
  "V1 trial-to-formal contract works through isolated PostgreSQL and real HTTP routes",
  { skip: !enabled, timeout: 120_000 },
  async () => {
    const initdb = findExecutable("initdb")
    const pgCtl = findExecutable("pg_ctl")
    const psql = findExecutable("psql")
    assert.ok(initdb, "initdb is required for isolated HTTP integration")
    assert.ok(pgCtl, "pg_ctl is required for isolated HTTP integration")
    assert.ok(psql, "psql is required for isolated HTTP integration")

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meiye-app-access-http-"))
    const databaseDirectory = path.join(tempRoot, "postgres")
    const databasePort = await freePort()
    const httpPort = await freePort()
    const databaseName = "app_access_trial_test"
    const repositoryDatabaseName = "app_access_repository_test"
    const adminDatabaseUrl =
      `postgresql://postgres@127.0.0.1:${databasePort}/postgres`
    const databaseUrl =
      `postgresql://postgres@127.0.0.1:${databasePort}/${databaseName}`
    const baseUrl = `http://127.0.0.1:${httpPort}`
    const userToken = crypto.randomBytes(32).toString("hex")
    const operatorToken = crypto.randomBytes(32).toString("hex")
    const testTokens = [userToken, operatorToken]
    const nextLogs = []
    let postgresStarted = false
    let nextProcess = null
    let pool = null

    try {
      progress("initializing isolated PostgreSQL")
      run(initdb, [
        "--auth=trust",
        "--encoding=UTF8",
        "--no-locale",
        "--username=postgres",
        databaseDirectory,
      ])
      run(pgCtl, [
        "-D",
        databaseDirectory,
        "-l",
        path.join(tempRoot, "postgres.log"),
        "-o",
        `-F -h 127.0.0.1 -p ${databasePort}`,
        "-w",
        "start",
      ])
      postgresStarted = true
      progress("applying prerequisite and V1 migrations")
      run(psql, [
        adminDatabaseUrl,
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `create database ${databaseName}`,
      ])
      run(psql, [
        adminDatabaseUrl,
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `create database ${repositoryDatabaseName}`,
      ])
      run(psql, [
        databaseUrl,
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        path.join(root, "tests", "fixtures", "app-access-control-v1-base.sql"),
        "-f",
        path.join(root, "deploy", "aliyun-production-cn.app-auth-revocations-schema.sql"),
        "-f",
        path.join(root, "deploy", "app-access-control-v1.sql"),
      ])
      const repositoryDatabaseUrl =
        `postgresql://postgres@127.0.0.1:${databasePort}/${repositoryDatabaseName}`
      run(psql, [
        repositoryDatabaseUrl,
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        path.join(root, "tests", "fixtures", "app-access-control-v1-base.sql"),
        "-f",
        path.join(root, "deploy", "app-access-control-v1.sql"),
      ])
      progress("validating canonical identity repository against PostgreSQL")
      run(
        process.execPath,
        [
          "--test",
          path.join(root, "tests", "app-access-control-v1.integration.test.js"),
        ],
        {
          env: {
            APP_ACCESS_CONTROL_TEST_DATABASE_URL: repositoryDatabaseUrl,
            HOME: process.env.HOME || tempRoot,
            LANG: process.env.LANG || "en_US.UTF-8",
            PATH: process.env.PATH || "",
            TMPDIR: process.env.TMPDIR || os.tmpdir(),
          },
        },
      )

      pool = new Pool({ connectionString: databaseUrl })
      progress("seeding non-production identities and tenant")
      await pool.query(
        `
          insert into auth.users (id, email)
          values ($1, 'http-user@test.invalid'), ($2, 'http-operator@test.invalid')
        `,
        [userId, operatorUserId],
      )
      await pool.query(
        `
          insert into public.profiles (id, email)
          values ($1, 'http-user@test.invalid'), ($2, 'http-operator@test.invalid')
        `,
        [userId, operatorUserId],
      )
      await pool.query(
        "insert into public.mp_companies (id, name) values ($1, 'HTTP 隔离测试公司')",
        [companyId],
      )
      await pool.query(
        `
          insert into public.mp_stores (id, company_id, name)
          values ($1, $2, 'HTTP 隔离测试门店')
        `,
        [storeId, companyId],
      )

      const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next")
      assert.ok(fs.existsSync(nextBin), "local Next executable is required")
      const nextEnvironment = {
        APP_ENV: "integration",
        APP_REGION: "local",
        APP_TEST_LOGIN_DEVICE_IDS: deviceId,
        APP_TEST_LOGIN_ENABLED: "1",
        APP_TEST_LOGIN_USERS_JSON: JSON.stringify([
          {
            device_ids: deviceId,
            email: "http-user@test.invalid",
            token_sha256: hashToken(userToken),
            user_id: userId,
          },
          {
            device_ids: deviceId,
            email: "http-operator@test.invalid",
            token_sha256: hashToken(operatorToken),
            user_id: operatorUserId,
          },
        ]),
        APP_VOICE_COACH_TEXT_REPOSITORY_MODE:
          "rds_voice_coach_text_session_contract",
        DATABASE_URL_CN: databaseUrl,
        HOME: process.env.HOME || tempRoot,
        LANG: process.env.LANG || "en_US.UTF-8",
        MP_PLATFORM_ADMIN_USER_IDS: operatorUserId,
        NEXT_TELEMETRY_DISABLED: "1",
        PATH: process.env.PATH || "",
        TMPDIR: process.env.TMPDIR || os.tmpdir(),
      }
      progress("starting local Next HTTP server")
      nextProcess = spawn(process.execPath, [
        nextBin,
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(httpPort),
      ], {
        cwd: root,
        env: nextEnvironment,
        stdio: ["ignore", "pipe", "pipe"],
      })
      nextProcess.stdout.on("data", chunk => nextLogs.push(String(chunk)))
      nextProcess.stderr.on("data", chunk => nextLogs.push(String(chunk)))
      await waitForHttpServer(baseUrl, nextProcess, nextLogs, testTokens)
      progress("exercising trial, idempotency, access grant and refresh routes")

      const bootstrap = await requestJson(
        baseUrl,
        "/api/app/account/bootstrap",
        userToken,
        { method: "POST", body: "{}" },
      )
      assert.equal(bootstrap.status, 200)
      assert.equal(bootstrap.body.access_mode, "personal_trial")
      assert.equal(bootstrap.body.trial.ai_coach_session_limit, 2)
      assert.equal(bootstrap.body.trial.ai_coach_sessions_remaining, 2)
      const canonicalUserId = bootstrap.body.canonical_user_id
      assert.match(canonicalUserId, /^[0-9a-f-]{36}$/)

      const beforeGrant = await requestJson(
        baseUrl,
        "/api/app/access?refresh=1",
        userToken,
      )
      assert.equal(beforeGrant.status, 200)
      assert.equal(beforeGrant.body.access_mode, "personal_trial")
      assert.equal(beforeGrant.body.authorization_version, 0)

      const firstPayload = {
        client_session_id: "http-trial-session-0001",
        scenario_id: "objection_safety",
      }
      const first = await requestJson(
        baseUrl,
        "/api/app/voice-coach/sessions",
        userToken,
        { method: "POST", body: JSON.stringify(firstPayload) },
      )
      assert.equal(first.status, 201)
      assert.equal(first.body.deduped, false)
      assert.equal(
        first.body.context.voice_coach_scope.data_domain,
        "personal_trial",
      )
      assert.equal(first.body.trial.ai_coach_sessions_used, 1)
      assert.equal(first.body.trial.ai_coach_sessions_remaining, 1)

      const firstRetry = await requestJson(
        baseUrl,
        "/api/app/voice-coach/sessions",
        userToken,
        { method: "POST", body: JSON.stringify(firstPayload) },
      )
      assert.equal(firstRetry.status, 200)
      assert.equal(firstRetry.body.deduped, true)
      assert.equal(firstRetry.body.session_id, first.body.session_id)
      assert.equal(firstRetry.body.trial.ai_coach_sessions_used, 1)

      const normalizedRetry = await requestJson(
        baseUrl,
        "/api/app/voice-coach/sessions",
        userToken,
        {
          method: "POST",
          body: JSON.stringify({
            ...firstPayload,
            scenario_id: "needs_discovery",
          }),
        },
      )
      assert.equal(normalizedRetry.status, 200)
      assert.equal(normalizedRetry.body.deduped, true)
      assert.equal(normalizedRetry.body.session_id, first.body.session_id)

      const second = await requestJson(
        baseUrl,
        "/api/app/voice-coach/sessions",
        userToken,
        {
          method: "POST",
          body: JSON.stringify({
            client_session_id: "http-trial-session-0002",
            scenario_id: "objection_safety",
          }),
        },
      )
      assert.equal(second.status, 201)
      assert.equal(second.body.trial.ai_coach_sessions_used, 2)
      assert.equal(second.body.trial.ai_coach_sessions_remaining, 0)

      const exhausted = await requestJson(
        baseUrl,
        "/api/app/voice-coach/sessions",
        userToken,
        {
          method: "POST",
          body: JSON.stringify({
            client_session_id: "http-trial-session-0003",
            scenario_id: "objection_safety",
          }),
        },
      )
      assert.equal(exhausted.status, 403)
      assert.equal(exhausted.body.code, "personal_trial_exhausted")

      const grantBody = {
        canonical_user_id: canonicalUserId,
        company_id: companyId,
        feature_keys: ["voice_coach", "speech_library"],
        plan: "pro",
        role: "employee",
        store_id: storeId,
      }
      const grant = await requestJson(
        baseUrl,
        "/api/admin/v1/access-grants",
        operatorToken,
        {
          method: "POST",
          headers: { "idempotency-key": "http-access-grant-0001" },
          body: JSON.stringify(grantBody),
        },
      )
      assert.equal(grant.status, 201)
      assert.equal(grant.body.deduped, false)
      assert.ok(grant.body.authorization_version > 0)

      const grantRetry = await requestJson(
        baseUrl,
        "/api/admin/v1/access-grants",
        operatorToken,
        {
          method: "POST",
          headers: { "idempotency-key": "http-access-grant-0001" },
          body: JSON.stringify(grantBody),
        },
      )
      assert.equal(grantRetry.status, 200)
      assert.equal(grantRetry.body.deduped, true)
      assert.equal(grantRetry.body.membership_id, grant.body.membership_id)

      const grantConflict = await requestJson(
        baseUrl,
        "/api/admin/v1/access-grants",
        operatorToken,
        {
          method: "POST",
          headers: { "idempotency-key": "http-access-grant-0001" },
          body: JSON.stringify({ ...grantBody, plan: "vip" }),
        },
      )
      assert.equal(grantConflict.status, 409)
      assert.equal(grantConflict.body.code, "idempotency_key_reused")

      const afterGrant = await requestJson(
        baseUrl,
        "/api/app/access?refresh=1",
        userToken,
      )
      assert.equal(afterGrant.status, 200)
      assert.equal(afterGrant.body.access_mode, "formal")
      assert.equal(
        afterGrant.body.authorization_version,
        grant.body.authorization_version,
      )

      const refreshedProfile = await requestJson(
        baseUrl,
        "/api/app/profile",
        userToken,
      )
      assert.equal(refreshedProfile.status, 200)
      assert.equal(refreshedProfile.body.account_status, "bound")
      assert.equal(
        refreshedProfile.body.active_membership_id,
        grant.body.membership_id,
      )
      assert.equal(refreshedProfile.body.entitlements.plan, "pro")
      assert.deepEqual(refreshedProfile.body.features.voice_coach, {
        enabled: true,
        reason: "ok",
        source: "membership",
      })

      const evidence = await pool.query(
        `
          select
            (
              select count(*)::integer
              from public.voice_coach_sessions
              where canonical_user_id = $1
                and data_domain = 'personal_trial'
            ) as trial_session_count,
            (
              select count(*)::integer
              from public.mp_account_memberships
              where canonical_user_id = $1
                and status = 'active'
            ) as active_membership_count,
            (
              select count(*)::integer
              from public.entitlements
              where canonical_user_id = $1
                and status = 'active'
            ) as active_entitlement_count,
            (
              select count(*)::integer
              from public.app_authorization_audit_events
              where canonical_user_id = $1
            ) as audit_event_count
        `,
        [canonicalUserId],
      )
      assert.deepEqual(evidence.rows, [{
        active_entitlement_count: 1,
        active_membership_count: 1,
        audit_event_count: 3,
        trial_session_count: 2,
      }])
      progress("running read-only identity backfill dry-run")
      const dryRun = run(
        process.execPath,
        [
          path.join(root, "scripts", "dry-run-app-identity-backfill.mjs"),
          "--dry-run",
          "--database-url",
          databaseUrl,
        ],
        {
          env: {
            HOME: process.env.HOME || tempRoot,
            LANG: process.env.LANG || "en_US.UTF-8",
            PATH: process.env.PATH || "",
            TMPDIR: process.env.TMPDIR || os.tmpdir(),
          },
        },
      )
      const dryRunReport = JSON.parse(dryRun.stdout)
      assert.equal(dryRunReport.mode, "dry-run")
      assert.equal(dryRunReport.scanned_profiles, 2)
      assert.equal(dryRunReport.already_linked, 1)
      assert.equal(dryRunReport.candidates_without_canonical_identity, 1)
      assert.equal(dryRunReport.writes_performed, 0)

      progress("stopping HTTP server and validating rollback")
      await stopProcess(nextProcess)
      nextProcess = null
      run(psql, [
        databaseUrl,
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        path.join(root, "deploy", "app-access-control-v1.rollback.sql"),
      ])
      const rollbackEvidence = await pool.query(`
        select
          to_regclass('public.app_canonical_users') is null
            as canonical_tables_removed,
          to_regclass('public.voice_coach_sessions') is not null
            as legacy_voice_table_preserved,
          to_regclass('public.app_auth_token_revocations') is not null
            as prerequisite_auth_table_preserved,
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'voice_coach_sessions'
              and column_name = 'canonical_user_id'
          ) as trial_scope_column_present
      `)
      assert.deepEqual(rollbackEvidence.rows, [{
        canonical_tables_removed: true,
        legacy_voice_table_preserved: true,
        prerequisite_auth_table_preserved: true,
        trial_scope_column_present: false,
      }])
      progress("HTTP, dry-run and rollback assertions passed")
    } catch (error) {
      const logs = boundedServerLog(nextLogs, testTokens)
      if (logs) error.message = `${error.message}\nNext log tail:\n${logs}`
      throw error
    } finally {
      progress("stopping isolated services")
      await stopProcess(nextProcess)
      if (pool) await pool.end()
      if (postgresStarted) {
        run(pgCtl, ["-D", databaseDirectory, "-m", "fast", "-w", "stop"])
      }
      if (tempRoot.includes("meiye-app-access-http-")) {
        fs.rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  },
)
