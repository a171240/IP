/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const path = require("node:path")

const root = process.cwd()
const script = path.join(root, "scripts", "plan-app-api-readonly-live-smoke.mjs")

const SECRET_EMPLOYEE_TOKEN = "employee-plan-token-value-1234567890"
const SECRET_MANAGER_TOKEN = "manager-plan-token-value-1234567890"

function run(args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      APP_BASE_URL: "https://api-cn.ipgongchang.example",
      APP_DEVICE_ID: "plan-device-id-20260702",
      APP_EMPLOYEE_TOKEN: SECRET_EMPLOYEE_TOKEN,
      APP_MANAGER_TOKEN: SECRET_MANAGER_TOKEN,
      APP_READ_ONLY_LIVE_SMOKE: "true",
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

test("APP API read-only live-smoke plan is dry-run only and does not print secrets", () => {
  const result = run()

  assert.equal(result.status, 0)
  assert.equal(result.report.ok, true)
  assert.equal(result.report.mode, "dry_run_plan")
  assert.equal(result.report.networkRequestsAttempted, false)
  assert.equal(result.report.envRead, false)
  assert.equal(result.report.tokenRead, false)
  assert.equal(result.report.envFileRead, false)
  assert.equal(result.report.requestBodySent, false)
  assert.equal(result.report.writesAuthorizedHere, false)
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_EMPLOYEE_TOKEN))
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_MANAGER_TOKEN))
  assert.ok(result.report.requiredInputs.every((item) => item.value !== "present"))
})

test("APP API read-only live-smoke plan sequences env, boundary, preflight, and explicit execution", () => {
  const result = run(["--boundary-report", "/tmp/custom-app-api-boundary.json", "--timeout-ms", "7000"])
  const steps = result.report.sequence

  assert.deepEqual(
    steps.map((item) => item.id),
    [
      "env_preflight",
      "online_readonly_boundary",
      "execution_preflight",
      "read_only_smoke_execute",
    ],
  )
  assert.match(steps[0].command, /aliyun:app-api:live-env/)
  assert.match(steps[1].command, /aliyun:app-api:online-readonly-boundary/)
  assert.match(steps[1].command, /--timeout-ms 7000/)
  assert.match(steps[1].command, /> \/tmp\/custom-app-api-boundary\.json/)
  assert.match(steps[2].command, /--online-boundary-report \/tmp\/custom-app-api-boundary\.json/)
  assert.match(steps[3].command, /aliyun:app-api:readonly-smoke/)
  assert.equal(steps[3].requiresExplicitAuthorization, true)
  assert.equal(steps[3].networkRequestsAttemptedByThisPlan, false)
})

test("APP API read-only live-smoke plan is GET-only and excludes mutating work", () => {
  const result = run()
  const onlineMethods = new Set(result.report.onlineBoundary.probes.map((item) => item.method))
  const smokeMethods = new Set(result.report.readOnlySmoke.probes.map((item) => item.method))
  const smokePaths = new Set(result.report.readOnlySmoke.probes.map((item) => item.path))
  const skippedPaths = result.report.skippedMutatingEndpoints.map((item) => item.path)

  assert.deepEqual([...onlineMethods], ["GET"])
  assert.deepEqual([...smokeMethods], ["GET"])
  assert.ok(smokePaths.has("/api/app/profile"))
  assert.ok(smokePaths.has("/api/app/entitlements"))
  assert.ok(smokePaths.has("/api/app/service-records/sessions?limit=5"))
  assert.ok(smokePaths.has("/api/app/store-admin/service-records?limit=5"))
  assert.equal([...smokePaths].some((item) => /generate|pay|publish|submit/.test(item)), false)
  assert.ok(skippedPaths.some((item) => item.includes("service-records/sessions")))
  assert.ok(skippedPaths.some((item) => item.includes("oss-upload")))
  assert.ok(skippedPaths.some((item) => item.includes("generate")))
  assert.ok(skippedPaths.some((item) => item.includes("pay")))
  assert.ok(result.report.forbiddenActions.includes("no production deploy, promote, alias, database write, or git push"))
})

test("APP API read-only live-smoke plan is exposed through package scripts", () => {
  const pkg = require(path.join(root, "package.json"))

  assert.equal(
    pkg.scripts["aliyun:app-api:readonly-plan"],
    "node ./scripts/plan-app-api-readonly-live-smoke.mjs",
  )
})
