import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
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

test("Aliyun env import plan splits WeChat Open AppID and AppSecret import targets", async () => {
  const plan = await buildPlan({
    WECHAT_OPEN_APP_ID: "wx-open-app-id-placeholder",
    WECHAT_OPEN_APP_SECRET: "wechat-open-secret-placeholder",
  })

  const appId = byName(plan, "WECHAT_OPEN_APP_ID")
  assert.equal(appId.status, "ready")
  assert.equal(appId.sensitivity, "identifier_or_connection")
  assert.equal(appId.importTarget, "阿里云 SAE plain env")
  assert.match(appId.notes, /不能写进 App 包/)
  assert.equal(appId.action, "导入阿里云运行环境变量")

  const appSecret = byName(plan, "WECHAT_OPEN_APP_SECRET")
  assert.equal(appSecret.status, "ready")
  assert.equal(appSecret.sensitivity, "secret")
  assert.equal(appSecret.importTarget, "阿里云 KMS/Secrets Manager/SAE secret env")
  assert.equal(appSecret.action, "通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入")
})

test("Aliyun env import plan separates Apple Team ID from deferred variables", async () => {
  const plan = await buildPlan({})
  const appleTeamId = byName(plan, "APPLE_TEAM_ID")

  assert.equal(appleTeamId.required, false)
  assert.equal(appleTeamId.status, "empty")
  assert.equal(appleTeamId.sensitivity, "public")
  assert.equal(appleTeamId.importTarget, "阿里云 SAE plain env")
  assert.deepEqual(plan.summary.appLaunchBlocking, ["APPLE_TEAM_ID"])
  assert.match(appleTeamId.action, /APP 发布\/AASA 阻塞/)
})

test("Aliyun env checklist renders Apple Team ID outside deferred section", () => {
  const markdownPath = "/tmp/meiye-aliyun-env-import-checklist-test.md"
  execFileSync(process.execPath, [
    "scripts/prepare-aliyun-runtime-env.mjs",
    "--allow-todo",
    "--write-plan-markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  })
  const markdown = readFileSync(markdownPath, "utf8")
  const appLaunchSection = markdown.match(/## APP 发布阻塞但非后端必填[\s\S]*?## 可直接导入的 Plain Env/)
  const deferredSection = markdown.match(/## 可后置或空缺变量[\s\S]*$/)

  assert.ok(appLaunchSection, "expected app launch blocking section")
  assert.match(appLaunchSection[0], /`APPLE_TEAM_ID`/)
  assert.match(appLaunchSection[0], /APP 发布\/AASA 阻塞/)
  assert.ok(deferredSection, "expected deferred section")
  assert.doesNotMatch(deferredSection[0], /`APPLE_TEAM_ID`/)
})
