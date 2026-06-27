const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@)/

test("Aliyun runtime plan command is wired into package scripts", () => {
  const pkg = readJson("package.json")

  assert.equal(pkg.scripts["aliyun:runtime:plan"], "node ./scripts/check-aliyun-runtime-plan.mjs")
  assert.equal(pkg.scripts["aliyun:runtime:plan:test"], "node --test tests/aliyun-runtime-plan.static.test.js")
})

test("Aliyun runtime plan treats RDS PostgreSQL as a runtime readiness dependency", () => {
  const plan = readJson("deploy", "aliyun-production-cn.runtime-plan.json")
  const output = execFileSync(process.execPath, ["scripts/check-aliyun-runtime-plan.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  })
  const report = JSON.parse(output)

  assert.equal(report.ok, true)
  assert.equal(report.provider, "SAE")
  assert.equal(report.region, "cn-hangzhou")
  assert.equal(report.appName, "meiye-huajing-app-api-production-cn")
  assert.equal(report.containerPort, 3000)
  assert.equal(report.healthPath, "/api/healthz")
  assert.equal(report.dataLayerTarget, "Aliyun RDS PostgreSQL")
  assert.equal(report.dataLayerConnectionEnvName, "DATABASE_URL_CN")
  assert.deepEqual(report.predeployDependencyIds, [
    "RDS_POSTGRES_MIGRATION",
    "ACR_IMAGE_DIGEST_AND_PULL",
    "OSS_RUNTIME_ACCESS",
    "BACKEND_ENV_IMPORT",
  ])

  assert.equal(plan.dataLayer.formalTarget, "Aliyun RDS PostgreSQL")
  assert.equal(plan.dataLayer.connectionEnvName, "DATABASE_URL_CN")
  assert.equal(plan.dataLayer.requiredBeforeRuntimeReady, true)
  assert.equal(plan.dataLayer.migrationEvidenceCommand, "corepack pnpm aliyun:rds:migration:evidence:strict")
  assert.ok(plan.dataLayer.connectionSecretTarget.includes("Aliyun KMS"))
  assert.ok(plan.notIncludedInFirstBridge.every((item) => !/RDS|DATABASE_URL_CN|PostgreSQL/i.test(item)))
  assert.deepEqual(
    plan.predeployDependencies.map((item) => [item.id, item.authorizationPacket, item.evidenceCommand]),
    [
      ["RDS_POSTGRES_MIGRATION", "P11_ALIYUN_RDS_DATA_MIGRATION", "corepack pnpm aliyun:rds:migration:evidence:strict"],
      ["ACR_IMAGE_DIGEST_AND_PULL", "P04_ACR_IMAGE_AND_PULL", "corepack pnpm aliyun:image:plan:strict"],
      ["OSS_RUNTIME_ACCESS", "P05_OSS_RAM_STS", "corepack pnpm aliyun:cloud:confirmations:backend:strict"],
      ["BACKEND_ENV_IMPORT", "P06_ENV_IMPORT", "corepack pnpm aliyun:sensitive:blockers:backend"],
    ],
  )
  assert.deepEqual(plan.predeployDependencies[0].blockingCredentialNames, ["DATABASE_URL_CN"])
  assert.doesNotMatch(JSON.stringify(plan) + output, secretLike)
})

test("Aliyun runtime plan checker rejects putting RDS back into the excluded first bridge list", () => {
  const checker = read("scripts", "check-aliyun-runtime-plan.mjs")

  assert.match(checker, /notIncludedInFirstBridge:must_not_exclude_rds/)
  assert.match(checker, /dataLayer\.formalTarget/)
  assert.match(checker, /predeployDependencies:RDS_POSTGRES_MIGRATION/)
  assert.match(checker, /blockingCredentialNames=DATABASE_URL_CN/)
})
