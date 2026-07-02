/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { spawn, spawnSync } = require("node:child_process")
const { writeFileSync } = require("node:fs")
const http = require("node:http")
const path = require("node:path")

const root = process.cwd()
const script = path.join(root, "scripts", "check-app-api-live-smoke-env.mjs")

const SECRET_EMPLOYEE_TOKEN = "employee-live-smoke-token-value-1234567890"
const SECRET_MANAGER_TOKEN = "manager-live-smoke-token-value-1234567890"
const SECRET_CROSS_MANAGER_TOKEN = "cross-manager-live-smoke-token-value-1234567890"

function run(extraEnv = {}, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      ...extraEnv,
    },
    encoding: "utf8",
  })

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    report: JSON.parse(result.stdout || result.stderr),
  }
}

function runAsync(extraEnv = {}, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.once("error", reject)
    child.once("exit", (status) => {
      resolve({
        status,
        stdout,
        stderr,
        report: JSON.parse(stdout || stderr),
      })
    })
  })
}

function validEnv(extra = {}) {
  return {
    APP_BASE_URL: "https://api-cn.ipgongchang.test",
    APP_DEVICE_ID: "app-live-smoke-device-20260701",
    APP_EMPLOYEE_TOKEN: SECRET_EMPLOYEE_TOKEN,
    APP_MANAGER_TOKEN: SECRET_MANAGER_TOKEN,
    ...extra,
  }
}

function writeBoundaryReport(report) {
  const filePath = path.join(
    process.env.TMPDIR || "/tmp",
    `app-api-online-boundary-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  )
  writeFileSync(filePath, JSON.stringify(report, null, 2))
  return filePath
}

function cleanBoundaryReport() {
  return {
    ok: true,
    checked: 20,
    grouped: { "200": 2, "401": 18, "404": 0 },
    routeBlockers: [],
  }
}

function dirtyBoundaryReport() {
  return {
    ok: false,
    checked: 20,
    grouped: { "200": 2, "401": 11, "404": 7 },
    routeBlockers: [
      {
        id: "employee_knowledge_spaces",
        path: "/api/app/knowledge-spaces",
        status: 404,
        contentType: "text/html",
      },
    ],
  }
}

function createStubServer(resolveResponse = null) {
  const requests = []
  const server = http.createServer((request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      deviceId: request.headers["x-device-id"],
      liveSmoke: request.headers["x-app-live-smoke"],
    })
    const resolved = resolveResponse
      ? resolveResponse(request)
      : { status: 200, body: { ok: true, route: request.url } }
    response.writeHead(resolved.status, { "content-type": "application/json" })
    response.end(JSON.stringify(resolved.body))
  })

  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        reject(new Error("missing_stub_server_port"))
        return
      }
      resolve({
        server,
        requests,
        baseUrl: `http://127.0.0.1:${address.port}`,
      })
    })
  })
}

function closeServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error)
      else resolveClose()
    })
  })
}

test("APP API live smoke env checker blocks missing and placeholder values without network", () => {
  const result = run({
    APP_BASE_URL: "https://example.com",
    APP_DEVICE_ID: "<device-id>",
    APP_EMPLOYEE_TOKEN: "<employee_or_unbound_test_token>",
    APP_MANAGER_TOKEN: "token",
  })

  assert.equal(result.status, 1)
  assert.equal(result.report.ok, false)
  assert.equal(result.report.mode, "plan_only")
  assert.equal(result.report.networkRequestsAttempted, false)
  assert.ok(result.report.blockers.some((item) => item.startsWith("APP_BASE_URL:")))
  assert.ok(result.report.blockers.some((item) => item.startsWith("APP_DEVICE_ID:")))
  assert.ok(result.report.blockers.some((item) => item.startsWith("APP_EMPLOYEE_TOKEN:")))
  assert.ok(result.report.blockers.some((item) => item.startsWith("APP_MANAGER_TOKEN:")))
  assert.doesNotMatch(result.stdout + result.stderr, /employee_or_unbound_test_token/)
})

test("APP API live smoke env checker does not request anything until read-only switch is explicit", () => {
  const result = run(validEnv())

  assert.equal(result.status, 1)
  assert.equal(result.report.ok, false)
  assert.equal(result.report.liveSmokeEnvReady, true)
  assert.equal(result.report.readOnlySwitchEnabled, false)
  assert.equal(result.report.readOnlyExecutionReady, false)
  assert.equal(result.report.networkRequestsAttempted, false)
  assert.ok(result.report.executionBlockers.includes("APP_READ_ONLY_LIVE_SMOKE:missing_or_false"))
  assert.ok(result.report.executionBlockers.includes("APP_ONLINE_BOUNDARY_REPORT:missing"))
  assert.equal(result.report.l3PermissionSwitchEnabled, false)
  assert.equal(result.report.l3PermissionSmoke.ready, false)
  assert.equal(result.report.l3PermissionSmoke.executed, false)
  assert.ok(result.report.l3PermissionSmoke.executionBlockers.includes("APP_L3_PERMISSION_SMOKE:missing_or_false"))
  assert.ok(
    result.report.l3PermissionSmoke.requiredInputs.some(
      (item) => item.name === "APP_MANAGER_SERVICE_RECORD_SESSION_ID_READONLY"
        && item.status === "missing",
    ),
  )
  assert.ok(result.report.readOnlySmoke.probes.every((item) => item.method === "GET"))
  assert.ok(result.report.skippedMutatingEndpoints.some((item) => item.path.includes("generate")))
  assert.ok(result.report.skippedMutatingEndpoints.some((item) => item.path.includes("pay")))
  assert.ok(result.report.skippedMutatingEndpoints.some((item) => item.path.includes("publish")))
  assert.ok(result.report.skippedMutatingEndpoints.some((item) => item.path.includes("submit")))
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_EMPLOYEE_TOKEN))
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_MANAGER_TOKEN))
})

test("APP API L3 permission smoke remains plan-only without the manager-selected session id", () => {
  const result = run(validEnv({
    APP_L3_PERMISSION_SMOKE: "true",
  }))

  assert.equal(result.status, 1)
  assert.equal(result.report.ok, false)
  assert.equal(result.report.mode, "plan_only")
  assert.equal(result.report.networkRequestsAttempted, false)
  assert.equal(result.report.l3PermissionSwitchEnabled, true)
  assert.equal(result.report.l3PermissionSmoke.ready, false)
  assert.equal(result.report.l3PermissionSmoke.executed, false)
  assert.ok(
    result.report.l3PermissionSmoke.executionBlockers.includes(
      "APP_MANAGER_SERVICE_RECORD_SESSION_ID_READONLY:missing:not_set",
    ),
  )
  assert.ok(result.report.l3PermissionSmoke.probes.every((item) => item.method === "GET"))
  assert.ok(
    result.report.l3PermissionSmoke.probes.some(
      (item) => item.id === "employee_manager_record_detail_negative"
        && item.negativePermissionProbe === true,
    ),
  )
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_EMPLOYEE_TOKEN))
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_MANAGER_TOKEN))
})

test("APP API live smoke execution requires a clean online boundary report", () => {
  const reportPath = writeBoundaryReport(dirtyBoundaryReport())
  const result = run(
    validEnv({
      APP_READ_ONLY_LIVE_SMOKE: "true",
    }),
    ["--execute-read-only", "--online-boundary-report", reportPath],
  )

  assert.equal(result.status, 1)
  assert.equal(result.report.ok, false)
  assert.equal(result.report.mode, "plan_only")
  assert.equal(result.report.liveSmokeEnvReady, true)
  assert.equal(result.report.readOnlySwitchEnabled, true)
  assert.equal(result.report.readOnlyExecutionReady, false)
  assert.equal(result.report.networkRequestsAttempted, false)
  assert.equal(result.report.onlineBoundary.ready, false)
  assert.equal(result.report.onlineBoundary.grouped404, 7)
  assert.ok(
    result.report.executionBlockers.includes(
      "APP_ONLINE_BOUNDARY_REPORT:route_blockers_not_empty",
    ),
  )
  assert.ok(
    result.report.executionBlockers.includes("APP_ONLINE_BOUNDARY_REPORT:http_404_not_zero"),
  )
})

test("APP API live smoke plan covers cross-tab GET probes only", () => {
  const result = run(validEnv())
  const probes = result.report.readOnlySmoke.probes
  const paths = new Set(probes.map((item) => item.path))
  const ids = new Set(probes.map((item) => item.id))
  const scopes = new Set(probes.map((item) => item.scope))

  assert.equal(ids.size, probes.length)
  assert.ok(probes.every((item) => item.method === "GET"))
  assert.ok(ids.has("employee_profile"))
  assert.ok(ids.has("manager_profile"))
  assert.ok(paths.has("/api/app/profile"))
  assert.ok(paths.has("/api/app/entitlements"))
  assert.ok(paths.has("/api/app/posters/templates"))
  assert.ok(paths.has("/api/app/posters/history"))
  assert.ok(paths.has("/api/app/xhs/drafts"))
  assert.ok(paths.has("/api/app/private-copy/drafts"))
  assert.ok(paths.has("/api/app/learning/progress?modules=professional,speech&include_entities=true"))
  assert.ok(paths.has("/api/app/voice-coach/sessions?limit=5"))
  assert.ok(paths.has("/api/app/customer-profiles?limit=5"))
  assert.ok(paths.has("/api/app/scene-cards?limit=5"))
  assert.ok(paths.has("/api/app/service-records/sessions?limit=5"))
  assert.ok(paths.has("/api/app/store-admin/overview"))
  assert.ok(paths.has("/api/app/store-admin/members?limit=5"))
  assert.ok(paths.has("/api/app/store-admin/service-records?limit=5"))
  assert.ok(paths.has("/api/app/store-profiles?limit=5"))
  assert.ok(paths.has("/api/app/knowledge-spaces"))
  assert.ok(scopes.has("content-poster"))
  assert.ok(scopes.has("content-xhs"))
  assert.ok(scopes.has("content-private-copy"))
  assert.ok(scopes.has("learning-progress"))
  assert.ok(scopes.has("voice-coach"))
  assert.ok(scopes.has("knowledge-spaces"))
  assert.equal(probes.some((item) => /generate|pay|publish|submit/.test(item.path)), false)
})

test("APP API live smoke execution uses GET-only probes and redacts token values", async () => {
  const stub = await createStubServer()
  const reportPath = writeBoundaryReport(cleanBoundaryReport())
  try {
    const result = await runAsync(
      validEnv({
        APP_BASE_URL: stub.baseUrl,
        APP_READ_ONLY_LIVE_SMOKE: "true",
      }),
      ["--allow-local", "--timeout-ms", "3000", "--online-boundary-report", reportPath],
    )

    assert.equal(result.status, 0)
    assert.equal(result.report.ok, true)
    assert.equal(result.report.mode, "read_only_executed")
    assert.equal(result.report.networkRequestsAttempted, true)
    assert.equal(result.report.onlineBoundary.ready, true)
    assert.equal(result.report.onlineBoundary.grouped404, 0)
    assert.equal(result.report.readOnlySmoke.result.checkedProbes, result.report.readOnlySmoke.probes.length)
    assert.ok(stub.requests.length > 0)
    assert.ok(stub.requests.every((item) => item.method === "GET"))
    assert.ok(stub.requests.every((item) => item.liveSmoke === "read-only"))
    assert.ok(stub.requests.every((item) => item.deviceId === "app-live-smoke-device-20260701"))
    assert.ok(stub.requests.some((item) => item.authorization === `Bearer ${SECRET_EMPLOYEE_TOKEN}`))
    assert.ok(stub.requests.some((item) => item.authorization === `Bearer ${SECRET_MANAGER_TOKEN}`))
    assert.equal(stub.requests.some((item) => /generate|pay|publish|submit/.test(item.url)), false)
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_EMPLOYEE_TOKEN))
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_MANAGER_TOKEN))
  } finally {
    await closeServer(stub.server)
  }
})

test("APP API L3 permission smoke executes manager positive and employee/cross-store negative GET probes", async () => {
  const stub = await createStubServer((request) => {
    const auth = request.headers.authorization
    if (
      request.url === "/api/app/store-admin/service-records?limit=5"
      && auth === `Bearer ${SECRET_EMPLOYEE_TOKEN}`
    ) {
      return {
        status: 403,
        body: { ok: false, code: "store_admin_required" },
      }
    }
    if (
      request.url === "/api/app/store-admin/service-records?limit=5"
      && auth === `Bearer ${SECRET_MANAGER_TOKEN}`
    ) {
      return {
        status: 200,
        body: { ok: true, sessions: [{ id: "manager-session-001" }] },
      }
    }
    if (
      request.url === "/api/app/service-records/sessions/manager-session-001"
      && auth === `Bearer ${SECRET_MANAGER_TOKEN}`
    ) {
      return {
        status: 200,
        body: { ok: true, session: { id: "manager-session-001" } },
      }
    }
    if (
      request.url === "/api/app/service-records/sessions/manager-session-001"
      && auth === `Bearer ${SECRET_EMPLOYEE_TOKEN}`
    ) {
      return {
        status: 403,
        body: { ok: false, code: "tenant_scope_denied" },
      }
    }
    if (
      request.url === "/api/app/service-records/sessions/cross-store-session-001"
      && auth === `Bearer ${SECRET_CROSS_MANAGER_TOKEN}`
    ) {
      return {
        status: 404,
        body: { ok: false, code: "service_record_not_found" },
      }
    }
    return {
      status: 200,
      body: { ok: true, route: request.url },
    }
  })
  const reportPath = writeBoundaryReport(cleanBoundaryReport())
  try {
    const result = await runAsync(
      validEnv({
        APP_BASE_URL: stub.baseUrl,
        APP_L3_PERMISSION_SMOKE: "true",
        APP_MANAGER_SERVICE_RECORD_SESSION_ID_READONLY: "manager-session-001",
        APP_CROSS_STORE_SESSION_ID_READONLY: "cross-store-session-001",
        APP_CROSS_STORE_MANAGER_TOKEN: SECRET_CROSS_MANAGER_TOKEN,
      }),
      ["--allow-local", "--execute-l3-permission", "--timeout-ms", "3000", "--online-boundary-report", reportPath],
    )

    assert.equal(result.status, 0)
    assert.equal(result.report.ok, true)
    assert.equal(result.report.mode, "l3_permission_executed")
    assert.equal(result.report.networkRequestsAttempted, true)
    assert.equal(result.report.readOnlySmoke.result, null)
    assert.equal(result.report.l3PermissionSmoke.executed, true)
    assert.equal(result.report.l3PermissionSmoke.l3PermissionPass, true)
    assert.equal(result.report.l3PermissionSmoke.result.status, "L3_PERMISSION_SMOKE_EXECUTED")
    assert.equal(result.report.l3PermissionSmoke.result.checkedProbes, 5)
    assert.equal(result.report.l3PermissionSmoke.result.bodyHasSessionForNegativeProbes, false)
    assert.ok(result.report.l3PermissionSmoke.result.probes.every((item) => item.method === "GET"))
    assert.ok(result.report.l3PermissionSmoke.result.probes.every((item) => item.ok === true))
    assert.ok(
      result.report.l3PermissionSmoke.result.probes.some(
        (item) => item.id === "manager_service_records_list_positive"
          && item.status === 200
          && item.bodyContainsExpectedSession === true,
      ),
    )
    assert.ok(
      result.report.l3PermissionSmoke.result.probes.some(
        (item) => item.id === "employee_store_admin_records_negative"
          && item.status === 403
          && item.bodyHasSession === false,
      ),
    )
    assert.ok(
      result.report.l3PermissionSmoke.result.probes.some(
        (item) => item.id === "cross_store_record_isolation_negative"
          && item.status === 404
          && item.bodyHasSession === false,
      ),
    )
    assert.equal(stub.requests.length, 5)
    assert.ok(stub.requests.every((item) => item.method === "GET"))
    assert.ok(stub.requests.some((item) => item.authorization === `Bearer ${SECRET_CROSS_MANAGER_TOKEN}`))
    assert.equal(stub.requests.some((item) => /generate|pay|publish|submit/.test(item.url)), false)
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_EMPLOYEE_TOKEN))
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_MANAGER_TOKEN))
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_CROSS_MANAGER_TOKEN))
  } finally {
    await closeServer(stub.server)
  }
})
