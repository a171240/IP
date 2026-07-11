/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const authPath = path.join(root, "lib", "aliyun-rds", "app-auth.server.ts")

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

class FakeNextResponse {
  constructor(body, init = {}) {
    this.body = body
    this.status = init.status ?? 200
  }

  static json(body, init = {}) {
    return new FakeNextResponse(body, init)
  }

  async json() {
    return this.body
  }
}

test("shared auth-required response emits the exact canonical code-only 401", async () => {
  const auth = compileTsModule(authPath, {
    "server-only": {},
    "next/server": { NextResponse: FakeNextResponse },
    "@/lib/aliyun-rds/app-auth-revocations.server": {
      isAliyunRdsAppAuthTokenRevoked: async () => false,
    },
    "@/lib/supabase/server": {
      createServerSupabaseClientForRequest: async () => {
        throw new Error("Supabase must not be called by appAuthRequiredResponse")
      },
    },
  })

  const response = auth.appAuthRequiredResponse()
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.deepEqual(Object.keys(body), ["ok", "code"])
  assert.deepEqual(body, { ok: false, code: "auth_required" })
  for (const forbiddenField of ["error", "message", "token", "payload"]) {
    assert.equal(forbiddenField in body, false)
  }
})
