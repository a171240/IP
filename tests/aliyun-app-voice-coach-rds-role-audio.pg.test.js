/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { randomUUID } = require("node:crypto")
const { Pool } = require("pg")
const ts = require("typescript")

const root = process.cwd()
const repositoryPath = path.join(root, "lib", "aliyun-rds", "repositories", "app-voice-coach-rds.server.ts")
const databaseUrl = String(process.env.DATABASE_URL_CN || "").trim()
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 1 }) : null

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
  const stubs = {
    "server-only": {},
    "@/lib/aliyun-rds/postgres.server": { withAliyunRdsTransaction: async () => { throw new Error("not_used") } },
  }
  const compiledModule = new Module(repositoryPath, module)
  compiledModule.filename = repositoryPath
  compiledModule.paths = Module._nodeModulePaths(path.dirname(repositoryPath))
  compiledModule.require = (moduleId) => (moduleId in stubs ? stubs[moduleId] : require(moduleId))
  compiledModule._compile(compiled, repositoryPath)
  return compiledModule.exports
}

const repository = compileRepository()

test.after(async () => {
  await pool?.end()
})

function roleWithRequestedPredicateMutation(expectedRole) {
  return process.env.G4A_ROLE_PREDICATE_MUTATION === expectedRole
    ? expectedRole === "beautician" ? "customer" : "beautician"
    : expectedRole
}

async function assertRoleAwareAudioSave(expectedRole) {
  assert.ok(pool, "DATABASE_URL_CN is required for the real PostgreSQL role-aware repository test")
  const client = await pool.connect()
  const scope = {
    userId: randomUUID(),
    companyId: randomUUID(),
    storeId: randomUUID(),
    membershipId: randomUUID(),
  }
  const sessionId = randomUUID()
  const turnId = randomUUID()
  try {
    await client.query("BEGIN")
    await client.query("insert into public.profiles (id, nickname) values ($1, 'G4A role fixture')", [scope.userId])
    await client.query("insert into public.mp_companies (id, name, owner_user_id) values ($1, 'G4A company', $2)", [
      scope.companyId,
      scope.userId,
    ])
    await client.query("insert into public.mp_stores (id, company_id, name) values ($1, $2, 'G4A store')", [
      scope.storeId,
      scope.companyId,
    ])
    await client.query(
      `insert into public.mp_account_memberships (id, user_id, company_id, store_id, role)
       values ($1, $2, $3, $4, 'employee')`,
      [scope.membershipId, scope.userId, scope.companyId, scope.storeId],
    )
    await client.query(
      `insert into public.voice_coach_sessions
        (id, user_id, company_id, store_id, membership_id, scenario_id, status)
       values ($1, $2, $3, $4, $5, 'objection_safety', 'active')`,
      [sessionId, scope.userId, scope.companyId, scope.storeId, scope.membershipId],
    )
    await client.query(
      `insert into public.voice_coach_turns (id, session_id, turn_index, role, text)
       values ($1, $2, 0, $3, 'role-aware audio fixture')`,
      [turnId, sessionId, expectedRole],
    )

    const saved = await repository.saveAliyunRdsVoiceCoachTurnAudioWithClient(client, {
      ...scope,
      audioPath: `g4a/${expectedRole}.mp3`,
      audioSeconds: 1.25,
      expectedRole: roleWithRequestedPredicateMutation(expectedRole),
      sessionId,
      turnId,
    })

    assert.ok(saved, `${expectedRole} predicate mutation matched 0 rows`)
    assert.equal(saved.role, expectedRole)
    assert.equal(saved.audio_path, `g4a/${expectedRole}.mp3`)
    assert.equal(Number(saved.audio_seconds), 1.25)
  } finally {
    await client.query("ROLLBACK")
    client.release()
  }
}

test("VC-G4A-B real PG beautician save; G4A_ROLE_PREDICATE_MUTATION=beautician must turn RED with 0 rows", { skip: !databaseUrl }, async () => {
  await assertRoleAwareAudioSave("beautician")
})

test("VC-G4A-B real PG customer save; G4A_ROLE_PREDICATE_MUTATION=customer must turn RED with 0 rows", { skip: !databaseUrl }, async () => {
  await assertRoleAwareAudioSave("customer")
})
