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
  "app-access-control.server.ts",
)

function compileRepository() {
  const source = fs.readFileSync(repositoryPath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: repositoryPath,
  }).outputText
  const compiledModule = new Module(repositoryPath, module)
  compiledModule.filename = repositoryPath
  compiledModule.paths = Module._nodeModulePaths(path.dirname(repositoryPath))
  compiledModule.require = (moduleId) => {
    if (moduleId === "server-only") return {}
    if (moduleId === "@/lib/aliyun-rds/postgres.server") {
      return { withAliyunRdsTransaction: async () => {} }
    }
    return require(moduleId)
  }
  compiledModule._compile(compiled, repositoryPath)
  return compiledModule.exports
}

test("personal trial public access stays closed until both switches are true", (t) => {
  const keys = [
    "PERSONAL_TRIAL_AI_COACH_PUBLIC_ENABLED",
    "PERSONAL_TRIAL_VOICE_EVENTS_READY",
  ]
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  )
  t.after(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  })
  const repository = compileRepository()

  delete process.env.PERSONAL_TRIAL_AI_COACH_PUBLIC_ENABLED
  delete process.env.PERSONAL_TRIAL_VOICE_EVENTS_READY
  assert.equal(repository.personalTrialAiCoachPublicEnabled(), false)

  process.env.PERSONAL_TRIAL_AI_COACH_PUBLIC_ENABLED = "true"
  assert.equal(repository.personalTrialAiCoachPublicEnabled(), false)

  delete process.env.PERSONAL_TRIAL_AI_COACH_PUBLIC_ENABLED
  process.env.PERSONAL_TRIAL_VOICE_EVENTS_READY = "true"
  assert.equal(repository.personalTrialAiCoachPublicEnabled(), false)

  process.env.PERSONAL_TRIAL_AI_COACH_PUBLIC_ENABLED = "true"
  assert.equal(repository.personalTrialVoiceEventsReady(), true)
  assert.equal(repository.personalTrialAiCoachPublicEnabled(), true)
})
