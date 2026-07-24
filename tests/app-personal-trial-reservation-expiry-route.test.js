/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const routePath = path.join(
  root,
  "app",
  "api",
  "cron",
  "personal-trial-reservations",
  "route.ts",
)

function jsonResponse(body, init = {}) {
  return {
    body,
    status: init.status || 200,
    async json() {
      return body
    },
  }
}

function compileRoute(expire) {
  const source = fs.readFileSync(routePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: routePath,
  }).outputText
  const compiledModule = new Module(routePath, module)
  compiledModule.filename = routePath
  compiledModule.paths = Module._nodeModulePaths(path.dirname(routePath))
  compiledModule.require = (moduleId) => {
    if (moduleId === "next/server") {
      return {
        NextRequest: class NextRequest {},
        NextResponse: { json: jsonResponse },
      }
    }
    if (
      moduleId ===
      "@/lib/aliyun-rds/repositories/app-access-control.server"
    ) {
      return {
        expireAllPersonalTrialVoiceReservations: expire,
      }
    }
    return require(moduleId)
  }
  compiledModule._compile(compiled, routePath)
  return compiledModule.exports
}

function request(authorization, limit = null) {
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === "authorization"
          ? authorization
          : null
      },
    },
    nextUrl: {
      searchParams: new URLSearchParams(
        limit === null ? "" : `limit=${encodeURIComponent(limit)}`,
      ),
    },
  }
}

test("personal trial reservation cron accepts only its dedicated secret and bounds each sweep", async (t) => {
  const previousDedicatedSecret =
    process.env.PERSONAL_TRIAL_EXPIRY_CRON_SECRET
  const previousSharedSecret = process.env.CRON_SECRET
  process.env.PERSONAL_TRIAL_EXPIRY_CRON_SECRET =
    "personal-trial-local-test-only"
  process.env.CRON_SECRET = "shared-local-test-only"
  t.after(() => {
    if (previousDedicatedSecret === undefined) {
      delete process.env.PERSONAL_TRIAL_EXPIRY_CRON_SECRET
    } else {
      process.env.PERSONAL_TRIAL_EXPIRY_CRON_SECRET =
        previousDedicatedSecret
    }
    if (previousSharedSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previousSharedSecret
  })

  const calls = []
  const route = compileRoute(async (args) => {
    calls.push(args)
    return { expiredCount: 2, sessionIds: ["session-1", "session-2"] }
  })

  const denied = await route.GET(request(null))
  assert.equal(denied.status, 401)
  assert.deepEqual(calls, [])

  const sharedSecretDenied = await route.GET(
    request("Bearer shared-local-test-only"),
  )
  assert.equal(sharedSecretDenied.status, 401)
  assert.deepEqual(calls, [])

  const accepted = await route.GET(
    request("Bearer personal-trial-local-test-only", "9999"),
  )
  assert.equal(accepted.status, 200)
  assert.deepEqual(calls, [{ limit: 500 }])
  assert.deepEqual(await accepted.json(), {
    ok: true,
    expired_count: 2,
    session_ids: ["session-1", "session-2"],
  })
})

test("personal trial reservation cron does not expose database errors", async (t) => {
  const previousDedicatedSecret =
    process.env.PERSONAL_TRIAL_EXPIRY_CRON_SECRET
  process.env.PERSONAL_TRIAL_EXPIRY_CRON_SECRET =
    "personal-trial-local-test-only"
  t.after(() => {
    if (previousDedicatedSecret === undefined) {
      delete process.env.PERSONAL_TRIAL_EXPIRY_CRON_SECRET
    } else {
      process.env.PERSONAL_TRIAL_EXPIRY_CRON_SECRET =
        previousDedicatedSecret
    }
  })

  const route = compileRoute(async () => {
    throw new Error("select secret_value from private_table")
  })
  const response = await route.GET(
    request("Bearer personal-trial-local-test-only"),
  )
  assert.equal(response.status, 500)
  const body = await response.json()
  assert.equal(body.code, "personal_trial_reservation_expiry_failed")
  assert.doesNotMatch(JSON.stringify(body), /secret_value|private_table/)
})
