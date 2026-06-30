/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const path = require("node:path")

const root = process.cwd()
const script = path.join(root, "scripts", "check-app-api-live-smoke-env.mjs")

const SECRET_EMPLOYEE_TOKEN = "employee-live-smoke-token-value-1234567890"
const SECRET_MANAGER_TOKEN = "manager-live-smoke-token-value-1234567890"

function run(extraEnv = {}) {
  const result = spawnSync(process.execPath, [script], {
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

function validEnv(extra = {}) {
  return {
    APP_BASE_URL: "https://api-cn.ipgongchang.test",
    APP_DEVICE_ID: "app-live-smoke-device-20260701",
    APP_EMPLOYEE_TOKEN: SECRET_EMPLOYEE_TOKEN,
    APP_MANAGER_TOKEN: SECRET_MANAGER_TOKEN,
    ...extra,
  }
}

test("APP API live smoke env checker blocks missing and placeholder values", () => {
  const result = run({
    APP_BASE_URL: "https://example.com",
    APP_DEVICE_ID: "<device-id>",
    APP_EMPLOYEE_TOKEN: "<employee_or_unbound_test_token>",
    APP_MANAGER_TOKEN: "token",
  })

  assert.equal(result.status, 1)
  assert.equal(result.report.ok, false)
  assert.ok(result.report.blockers.some((item) => item.startsWith("APP_BASE_URL:")))
  assert.ok(result.report.blockers.some((item) => item.startsWith("APP_DEVICE_ID:")))
  assert.ok(result.report.blockers.some((item) => item.startsWith("APP_EMPLOYEE_TOKEN:")))
  assert.ok(result.report.blockers.some((item) => item.startsWith("APP_MANAGER_TOKEN:")))
  assert.doesNotMatch(result.stdout + result.stderr, /employee_or_unbound_test_token/)
})

test("APP API live smoke env checker passes valid live-smoke prerequisites without printing token values", () => {
  const result = run(validEnv())

  assert.equal(result.status, 0)
  assert.equal(result.report.ok, true)
  assert.equal(result.report.liveSmokeEnvReady, true)
  assert.equal(result.report.writeSmoke.authorized, false)
  assert.equal(result.report.writeSmoke.status, "blocked_until_explicit_env_authorization")
  assert.ok(result.report.readOnlySmoke.commands.some((item) => item.includes("smoke-app-api-production-cn.mjs")))
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_EMPLOYEE_TOKEN))
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_MANAGER_TOKEN))
})

test("APP API live smoke env checker requires an explicit env flag before write smoke is marked authorized", () => {
  const result = run(validEnv({ APP_WRITE_SMOKE_AUTHORIZED: "true" }))

  assert.equal(result.status, 0)
  assert.equal(result.report.ok, true)
  assert.equal(result.report.writeSmoke.authorized, true)
  assert.equal(result.report.writeSmoke.status, "authorized_by_env")
  assert.ok(result.report.writeSmoke.operations.includes("POST /api/app/service-records/sessions"))
})
