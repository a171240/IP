import test from "node:test"
import assert from "node:assert/strict"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const root = process.cwd()
const envPlanModuleUrl = pathToFileURL(join(root, "scripts", "prepare-aliyun-runtime-env.mjs")).href

async function buildPlan(overrides) {
  const { buildImportPlan } = await import(envPlanModuleUrl)
  return buildImportPlan(new Map(Object.entries(overrides)))
}

function byName(plan, name) {
  const item = plan.variables.find((variable) => variable.name === name)
  assert.ok(item, `expected plan variable ${name}`)
  return item
}

test("Aliyun env import plan keeps non-secret service config in plain env", async () => {
  const plan = await buildPlan({
    ALIYUN_OSS_BUCKET: "meiye-huajing-service-records-production-cn",
    ALIYUN_OSS_REGION: "cn-hangzhou",
    SERVICE_RECORD_ASR_PROVIDER: "bailian",
  })

  for (const name of ["ALIYUN_OSS_BUCKET", "ALIYUN_OSS_REGION", "SERVICE_RECORD_ASR_PROVIDER"]) {
    const item = byName(plan, name)
    assert.equal(item.status, "ready")
    assert.equal(item.sensitivity, "public")
    assert.equal(item.importTarget, "阿里云 SAE plain env")
  }
})

test("Aliyun env import plan has no ready public variables targeting secret env", async () => {
  const plan = await buildPlan({
    APP_ENV: "production-cn",
    ALIYUN_OSS_BUCKET: "meiye-huajing-service-records-production-cn",
    ALIYUN_OSS_REGION: "cn-hangzhou",
    SERVICE_RECORD_ASR_PROVIDER: "bailian",
    DASHSCOPE_API_KEY: "placeholder-not-real",
  })
  const mismatches = plan.variables
    .filter((item) => item.status === "ready")
    .filter((item) => item.sensitivity === "public")
    .filter((item) => item.importTarget !== "阿里云 SAE plain env")
    .map((item) => item.name)

  assert.deepEqual(mismatches, [])
})
