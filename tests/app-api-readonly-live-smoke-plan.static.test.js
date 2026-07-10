/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const path = require("node:path")

const root = process.cwd()
const script = path.join(root, "scripts", "plan-app-api-readonly-live-smoke.mjs")

const SECRET_EMPLOYEE_TOKEN = "employee-plan-token-value-1234567890"
const SECRET_MANAGER_TOKEN = "manager-plan-token-value-1234567890"
const SECRET_CROSS_MANAGER_TOKEN = "cross-manager-plan-token-value-1234567890"

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
      APP_CROSS_STORE_MANAGER_TOKEN: SECRET_CROSS_MANAGER_TOKEN,
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
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET_CROSS_MANAGER_TOKEN))
  assert.ok(result.report.requiredInputs.every((item) => item.value !== "present"))
  assert.ok(result.report.requiredL3PermissionInputs.every((item) => item.value !== "present"))
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
      "content_xhs_l3_permission_smoke_execute",
      "l3_permission_smoke_execute",
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
  assert.match(steps[4].command, /aliyun:app-api:content-xhs-l3-smoke/)
  assert.equal(steps[4].authorizationId, "CONTENT_XHS_L3_PERMISSION_READONLY_EXECUTION_AUTHORIZATION")
  assert.equal(steps[4].requiresExplicitAuthorization, true)
  assert.deepEqual(steps[4].methodsAllowed, ["GET"])
  assert.equal(steps[4].networkRequestsAttemptedByThisPlan, false)
  assert.match(steps[5].command, /aliyun:app-api:l3-permission-smoke/)
  assert.equal(steps[5].authorizationId, "L3_PERMISSION_READONLY_EXECUTION_AUTHORIZATION")
})

test("APP API read-only live-smoke plan is GET-only and excludes mutating work", () => {
  const result = run()
  const onlineMethods = new Set(result.report.onlineBoundary.probes.map((item) => item.method))
  const smokeMethods = new Set(result.report.readOnlySmoke.probes.map((item) => item.method))
  const l3Methods = new Set(result.report.l3PermissionSmoke.probes.map((item) => item.method))
  const smokePaths = new Set(result.report.readOnlySmoke.probes.map((item) => item.path))
  const l3Ids = new Set(result.report.l3PermissionSmoke.probes.map((item) => item.id))
  const l3ById = new Map(result.report.l3PermissionSmoke.probes.map((item) => [item.id, item]))
  const contentXhsIds = new Set(result.report.contentXhsL3PermissionSmoke.probes.map((item) => item.id))
  const skippedPaths = result.report.skippedMutatingEndpoints.map((item) => item.path)

  assert.deepEqual([...onlineMethods], ["GET"])
  assert.deepEqual([...smokeMethods], ["GET"])
  assert.deepEqual([...l3Methods], ["GET"])
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
  assert.ok(result.report.forbiddenActions.includes("no content-xhs L3 permission execution without CONTENT_XHS_L3_PERMISSION_READONLY_EXECUTION_AUTHORIZATION"))
  assert.ok(result.report.forbiddenActions.includes("no L3 permission execution without L3_PERMISSION_READONLY_EXECUTION_AUTHORIZATION"))
  assert.equal(result.report.contentXhsL3PermissionSmoke.authorizationId, "CONTENT_XHS_L3_PERMISSION_READONLY_EXECUTION_AUTHORIZATION")
  assert.equal(result.report.contentXhsL3PermissionSmoke.status, "PLAN_READY_NOT_EXECUTED")
  assert.equal(result.report.contentXhsL3PermissionSmoke.outputEvidencePath, "docs/app-production-cn-content-xhs-l3-permission-smoke-current.json")
  assert.deepEqual(
    [...contentXhsIds],
    [
      "employee_xhs_drafts_positive",
      "manager_xhs_drafts_positive",
      "unbound_xhs_drafts_negative",
    ],
  )
  assert.equal(
    result.report.contentXhsL3PermissionSmoke.probes.every(
      (item) => item.path === "/api/app/xhs/drafts" && item.method === "GET",
    ),
    true,
  )
  assert.equal(result.report.l3PermissionSmoke.authorizationId, "L3_PERMISSION_READONLY_EXECUTION_AUTHORIZATION")
  assert.equal(result.report.l3PermissionSmoke.tokenBacked, true)
  assert.equal(result.report.l3PermissionSmoke.status, "PLAN_READY_NOT_EXECUTED")
  assert.ok(l3Ids.has("manager_service_records_list_positive"))
  assert.ok(l3Ids.has("manager_service_record_detail_positive"))
  assert.ok(l3Ids.has("employee_store_admin_records_negative"))
  assert.ok(l3Ids.has("employee_manager_record_detail_negative"))
  assert.ok(l3Ids.has("cross_store_record_isolation_negative"))
  assert.deepEqual(l3ById.get("employee_store_admin_records_negative").expectedStatuses, [403])
  assert.deepEqual(l3ById.get("employee_manager_record_detail_negative").expectedStatuses, [404])
  assert.deepEqual(l3ById.get("cross_store_record_isolation_negative").expectedStatuses, [404])
  assert.ok(
    result.report.l3PermissionSmoke.probes.some(
      (item) => item.id === "manager_service_records_list_positive"
        && item.containsSessionEnvName === "APP_MANAGER_SERVICE_RECORD_SESSION_ID_READONLY",
    ),
  )
  assert.ok(
    result.report.requiredL3PermissionInputs.some(
      (item) => item.name === "APP_MANAGER_SERVICE_RECORD_SESSION_ID_READONLY"
        && item.required === true
        && item.value === "redacted_not_read",
    ),
  )
  assert.ok(
    result.report.requiredL3PermissionInputs.some(
      (item) => item.name === "APP_CROSS_STORE_SESSION_ID_READONLY"
        && item.required === true
        && item.value === "redacted_not_read",
    ),
  )
  assert.deepEqual(
    result.report.redaction.tokenEnvNames,
    [
      "APP_EMPLOYEE_TOKEN",
      "APP_MANAGER_TOKEN",
      "APP_CROSS_STORE_MANAGER_TOKEN",
      "APP_UNBOUND_TOKEN",
    ],
  )
  assert.ok(l3Ids.has("employee_xhs_drafts_positive"))
  assert.ok(l3Ids.has("manager_xhs_drafts_positive"))
  assert.ok(l3Ids.has("unbound_xhs_drafts_negative"))
  assert.ok(
    result.report.requiredL3PermissionInputs.some(
      (item) => item.name === "APP_UNBOUND_TOKEN"
        && item.required === false
        && item.value === "redacted_not_read",
    ),
  )
})

test("APP API read-only live-smoke plan is exposed through package scripts", () => {
  const pkg = require(path.join(root, "package.json"))

  assert.equal(
    pkg.scripts["aliyun:app-api:readonly-plan"],
    "node ./scripts/plan-app-api-readonly-live-smoke.mjs",
  )
  assert.equal(
    pkg.scripts["aliyun:app-api:l3-permission-smoke"],
    "node ./scripts/check-app-api-live-smoke-env.mjs --execute-l3-permission",
  )
})
