/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const repositoryPath = path.join(
  root,
  "lib",
  "aliyun-rds",
  "repositories",
  "service-records.server.ts",
)

function jsonResponse(body, init = {}) {
  return {
    status: init.status || 200,
    async json() {
      return body
    },
  }
}

function compileTsModule(filePath, stubs) {
  const source = fs.readFileSync(filePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText

  const compiledModule = new Module(filePath, module)
  compiledModule.filename = filePath
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filePath))
  compiledModule.require = (moduleId) => {
    if (moduleId in stubs) return stubs[moduleId]
    return require(moduleId)
  }
  compiledModule._compile(compiled, filePath)
  return compiledModule.exports
}

const AliyunRdsConfigurationError = class AliyunRdsConfigurationError extends Error {}
const repository = compileTsModule(repositoryPath, {
  "server-only": {},
  "next/server": {
    NextRequest: class NextRequest {},
    NextResponse: { json: jsonResponse },
  },
  "@/lib/aliyun-rds/app-auth.server": {
    appAuthConfigurationErrorResponse: () => null,
    appAuthRequiredResponse: () => jsonResponse({ ok: false }, { status: 401 }),
    resolveAliyunRdsAppAuthUser: async () => null,
  },
  "@/lib/aliyun-rds/postgres.server": {
    AliyunRdsConfigurationError,
    queryAliyunRds: async () => ({ rows: [] }),
    withAliyunRdsTransaction: async (fn) => fn({}),
  },
  "@/lib/aliyun-rds/repositories/account-profile.server": {
    accountContextPayload: () => ({}),
    getAliyunRdsAppAccountContext: async () => ({}),
  },
})

test("service record database failures expose a request id but not SQL or user data", async () => {
  const databaseError = Object.assign(
    new Error("insert or update violates a foreign key for user secret-user-id"),
    {
      code: "23503",
      constraint: "service_record_sessions_user_id_fkey",
      detail: "Key (user_id)=(secret-user-id) is not present",
      routine: "ri_ReportViolation",
      schema: "public",
      table: "service_record_sessions",
    },
  )
  const diagnostics = []

  const response = repository.rdsServiceRecordErrorResponse(
    databaseError,
    "insert_failed",
    {
      logDiagnostic: (entry) => diagnostics.push(entry),
      requestId: "sr_req_test_001",
    },
  )
  const body = await response.json()

  assert.equal(response.status, 500)
  assert.deepEqual(body, {
    ok: false,
    error: "创建服务记录失败，请稍后重试。",
    message: "创建服务记录失败，请稍后重试。",
    code: "insert_failed",
    request_id: "sr_req_test_001",
  })
  assert.deepEqual(diagnostics, [
    {
      event: "service_record_request_failed",
      request_id: "sr_req_test_001",
      operation: "insert_failed",
      error_name: "Error",
      db_code: "23503",
      db_constraint: "service_record_sessions_user_id_fkey",
      db_routine: "ri_ReportViolation",
      db_schema: "public",
      db_table: "service_record_sessions",
    },
  ])

  const serialized = JSON.stringify({ body, diagnostics })
  assert.doesNotMatch(serialized, /secret-user-id/)
  assert.doesNotMatch(serialized, /Key \(user_id\)/)
})
