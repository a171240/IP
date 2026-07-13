/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const facadePath = path.join(root, "lib", "aliyun-rds", "repositories", "app-voice-coach-facade.server.ts")
const backendContractPath = path.join(root, "docs", "g4a-voice-audio-contract-20260713.md")
const appContractPath = [
  path.join(root, "meiye-huajing-app", "docs", "g4a-voice-audio-contract-20260713.md"),
  path.resolve(root, "..", "..", "meiye-huajing-app", "docs", "g4a-voice-audio-contract-20260713.md"),
].find((candidate) => fs.existsSync(candidate))

const endpointKeys = {
  "ASR preview": "asr_preview",
  "Turn TTS": "turn_tts",
  "Audio submit": "audio_submit",
}

function compileFacade() {
  const source = fs.readFileSync(facadePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: facadePath,
  }).outputText
  const responseJson = (body, init = {}) => ({
    status: init.status || 200,
    async json() {
      return body
    },
  })
  const stubs = {
    "server-only": {},
    "next/server": { NextRequest: class NextRequest {}, NextResponse: { json: responseJson } },
    "@/lib/aliyun-rds/app-auth.server": {
      appAuthConfigurationErrorResponse: () => null,
      appAuthRequiredResponse: () => responseJson({ ok: false, code: "auth_required" }, { status: 401 }),
      resolveAliyunRdsAppAuthUser: async () => null,
    },
    "@/lib/aliyun-rds/postgres.server": {
      AliyunRdsConfigurationError: class AliyunRdsConfigurationError extends Error {},
      isAliyunRdsRuntimeUnavailableError: () => false,
    },
    "@/lib/aliyun-rds/app-voice-coach-runtime-config.server": {
      APP_VOICE_COACH_PRODUCTION_RDS_REPOSITORY_MODE: "rds_voice_coach_text_session_contract",
      APP_VOICE_COACH_REPOSITORY_NOT_CONFIGURED_CODE: "app_voice_coach_repository_not_configured",
      AppVoiceCoachRepositoryConfigurationError: class AppVoiceCoachRepositoryConfigurationError extends Error {},
      resolveAppVoiceCoachTextRepositorySelection: () => ({ mode: "local_durable" }),
    },
    "@/lib/aliyun-rds/repositories/account-profile.server": {
      accountContextPayload: () => ({}),
      getAliyunRdsAppAccountContext: async () => ({}),
    },
    "@/lib/aliyun-rds/app-authorization.server": { requireAppFeatureAccess: () => ({ ok: true }) },
    "@/lib/voice-coach/speech/doubao.server": { doubaoAsrFlash: async () => ({}), doubaoTts: async () => ({}) },
    "@/lib/voice-coach/storage.server": {
      signVoiceCoachAudio: async () => "signed",
      uploadVoiceCoachAudio: async () => {},
    },
    "@/lib/voice-coach/scenarios": { getScenario: () => null },
  }
  const compiledModule = new Module(facadePath, module)
  compiledModule.filename = facadePath
  compiledModule.paths = Module._nodeModulePaths(path.dirname(facadePath))
  compiledModule.require = (moduleId) => (moduleId in stubs ? stubs[moduleId] : require(moduleId))
  compiledModule._compile(compiled, facadePath)
  return compiledModule.exports
}

function parseContractMatrix(markdown) {
  const lines = markdown.split("\n")
  const headerIndex = lines.findIndex((line) => line.startsWith("| Endpoint | 401 |"))
  assert.notEqual(headerIndex, -1, "v3 error matrix header is missing")
  const header = lines[headerIndex].split("|").slice(1, -1).map((cell) => cell.trim())
  const matrix = {}
  for (const line of lines.slice(headerIndex + 2, headerIndex + 5)) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim())
    const endpoint = endpointKeys[cells[0]]
    assert.ok(endpoint, `unknown contract endpoint: ${cells[0]}`)
    matrix[endpoint] = {}
    for (let index = 1; index < cells.length; index += 1) {
      if (cells[index] === "—") continue
      const defaultStatus = Number(header[index])
      for (const match of cells[index].matchAll(/`([^`]+)`(?: \((\d+)\))?/g)) {
        const status = match[2] ? Number(match[2]) : defaultStatus
        assert.ok(Number.isInteger(status), `missing status for ${endpoint}:${match[1]}`)
        matrix[endpoint][match[1]] = status
      }
    }
  }
  return matrix
}

test("VC-G4A-B v3 contract copies remain byte-identical", { skip: !appContractPath }, () => {
  assert.equal(fs.readFileSync(backendContractPath, "utf8"), fs.readFileSync(appContractPath, "utf8"))
})

test("VC-G4A-B submit and TTS pass their explicit repository roles", () => {
  const repositorySource = fs.readFileSync(
    path.join(root, "lib", "aliyun-rds", "repositories", "app-voice-coach-rds.server.ts"),
    "utf8",
  )
  const facadeSource = fs.readFileSync(facadePath, "utf8")

  assert.match(
    repositorySource,
    /beauticianTurn = await updateAliyunRdsVoiceCoachTurnAudioWithClient[\s\S]*?expectedRole: "beautician"/,
  )
  assert.match(
    facadeSource,
    /saveAliyunRdsVoiceCoachTurnAudio\([\s\S]*?expectedRole: "customer"/,
  )
})

test("VC-G4A-B endpoint x error-code matrix mirrors the typed facade implementation", async () => {
  const facade = compileFacade()
  const contractMatrix = parseContractMatrix(fs.readFileSync(backendContractPath, "utf8"))

  assert.deepEqual(facade.APP_VOICE_COACH_AUDIO_ERROR_MATRIX_V3, contractMatrix)
  for (const [endpoint, codes] of Object.entries(contractMatrix)) {
    for (const [code, status] of Object.entries(codes)) {
      const response = facade.appVoiceCoachAudioErrorResponse(endpoint, code)
      assert.equal(response.status, status, `${endpoint}:${code}`)
      assert.deepEqual(await response.json(), { ok: false, error: code, code })
    }
  }
})
