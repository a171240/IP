/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { spawn, spawnSync } = require("node:child_process")
const http = require("node:http")
const path = require("node:path")

const root = process.cwd()
const script = path.join(root, "scripts", "check-app-api-live-smoke-env.mjs")

const SECRET_EMPLOYEE_TOKEN = "employee-live-smoke-token-value-1234567890"
const SECRET_MANAGER_TOKEN = "manager-live-smoke-token-value-1234567890"

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

function createStubServer() {
  const requests = []
  const server = http.createServer((request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      deviceId: request.headers["x-device-id"],
      liveSmoke: request.headers["x-app-live-smoke"],
    })
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ ok: true, route: request.url }))
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
  assert.ok(result.report.readOnlySmoke.probes.every((item) => item.method === "GET"))
  assert.ok(result.report.skippedMutatingEndpoints.some((item) => item.path.includes("generate")))
  assert.ok(result.report.skippedMutatingEndpoints.some((item) => item.path.includes("pay")))
  assert.ok(result.report.skippedMutatingEndpoints.some((item) => item.path.includes("publish")))
  assert.ok(result.report.skippedMutatingEndpoints.some((item) => item.path.includes("submit")))
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_EMPLOYEE_TOKEN))
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_MANAGER_TOKEN))
})

test("APP API live smoke execution uses GET-only probes and redacts token values", async () => {
  const stub = await createStubServer()
  try {
    const result = await runAsync(
      validEnv({
        APP_BASE_URL: stub.baseUrl,
        APP_READ_ONLY_LIVE_SMOKE: "true",
      }),
      ["--allow-local", "--timeout-ms", "3000"],
    )

    assert.equal(result.status, 0)
    assert.equal(result.report.ok, true)
    assert.equal(result.report.mode, "read_only_executed")
    assert.equal(result.report.networkRequestsAttempted, true)
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
