const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun action authorization command is wired into scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:action:authorization"], "node ./scripts/summarize-aliyun-action-authorization.mjs")
  assert.equal(pkg.scripts["aliyun:action:authorization:test"], "node --test tests/aliyun-action-authorization.static.test.js")
  assert.match(predeploy, /aliyun:action:authorization:test/)
  assert.match(predeploy, /aliyun:action:authorization/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:action:authorization:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:action:authorization"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:action:authorization"))
})

test("Aliyun action authorization matrix separates local-safe work from external actions", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-action-authorization.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const byId = new Map(report.actions.map((item) => [item.id, item]))

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.canDeployNow, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.actions, 9)
  assert.equal(report.summary.authorizationPackets, 9)
  assert.deepEqual(report.summary.canCodexProceedWithoutUser, [])
  assert.equal(report.summary.cloudConsoleTasks, 7)
  assert.ok(report.summary.requiredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.requiredBlocking.includes("WECHAT_OPEN_APP_SECRET"))

  assert.equal(byId.get("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE").automationPolicy, "external_platform_review_required")
  assert.equal(byId.get("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE").requiresActionTimeConfirmation, true)
  assert.ok(byId.get("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE").currentEvidence.includes("wechatOpenPlatform.mobileAppCreated=false"))
  assert.ok(byId.get("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE").currentBlockers.includes("wechatOpenPlatform:mobileAppCreated"))

  assert.equal(byId.get("U02_APPLE_TEAM_ID").requiresActionTimeConfirmation, true)

  assert.equal(byId.get("U03_ACR_PURCHASE_CONFIRMATION").automationPolicy, "paid_purchase_requires_action_time_confirmation")
  assert.equal(byId.get("U03_ACR_PURCHASE_CONFIRMATION").requiresActionTimeConfirmation, true)
  assert.ok(byId.get("U03_ACR_PURCHASE_CONFIRMATION").currentEvidence.includes("R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.quotedAmount=CNY 117.00"))

  assert.equal(byId.get("U06_ENV_IMPORT").automationPolicy, "secret_import_requires_action_time_confirmation")
  assert.equal(byId.get("U06_ENV_IMPORT").blockerClass, "ready_sensitive_env_need_cloud_import")
  assert.ok(byId.get("U06_ENV_IMPORT").currentBlockers.includes("envImport:secretNotInImage"))

  assert.equal(byId.get("U04_ACR_RUNTIME_AUTH").requiresActionTimeConfirmation, true)
  assert.equal(byId.get("U05_OSS_RAM_OR_STS").requiresActionTimeConfirmation, true)

  assert.equal(byId.get("U07_DOMAIN_DNS_HTTPS_ICP").automationPolicy, "dns_https_icp_requires_action_time_confirmation")
  assert.ok(byId.get("U07_DOMAIN_DNS_HTTPS_ICP").currentBlockers.includes("apiDomainHttps:dnsResolvedToAliyun"))

  assert.equal(byId.get("U08_SAE_RUNTIME_AND_SLS").automationPolicy, "cloud_resource_creation_requires_action_time_confirmation")
  assert.ok(byId.get("U08_SAE_RUNTIME_AND_SLS").currentBlockers.includes("runtime:confirmed"))

  assert.equal(byId.get("U09_DEPLOY_AUTHORIZATION").automationPolicy, "production_release_requires_explicit_authorization")
  assert.ok(byId.get("U09_DEPLOY_AUTHORIZATION").currentBlockers.includes("canDeployNow=false"))

  assert.ok(report.prohibitedWithoutActionTimeConfirmation.some((item) => item.includes("购买 ACR")))
  assert.ok(report.prohibitedWithoutActionTimeConfirmation.some((item) => item.includes("创建/修改 SAE")))
  assert.ok(report.prohibitedWithoutActionTimeConfirmation.some((item) => item.includes("读取、复制、粘贴、导入或输出")))
  assert.ok(report.safeLocalWorkStillAllowed.some((item) => item.includes("运行本地检查")))

  assert.equal(report.authorizationPackets.length, 9)
  const packetsById = new Map(report.authorizationPackets.map((item) => [item.packetId, item]))
  assert.equal(packetsById.get("P03_ACR_PURCHASE").actionId, "U03_ACR_PURCHASE_CONFIRMATION")
  assert.match(packetsById.get("P03_ACR_PURCHASE").minimumUserPhrase, /CNY 117\.00/)
  assert.ok(packetsById.get("P03_ACR_PURCHASE").explicitlyExcluded.some((item) => item.includes("docker login")))
  assert.ok(packetsById.get("P04_ACR_IMAGE_AND_PULL").explicitlyExcluded.some((item) => item.includes("不购买 ACR")))
  assert.ok(packetsById.get("P06_ENV_IMPORT").explicitlyExcluded.some((item) => item.includes("不把任何 value")))
  assert.ok(packetsById.get("P07_DOMAIN_DNS_HTTPS").allowedActions.some((item) => item.includes("api-cn.ipgongchang.xin")))
  assert.ok(packetsById.get("P08_SAE_RUNTIME_SLS").explicitlyExcluded.some((item) => item.includes("不推送镜像")))
  assert.ok(packetsById.get("P09_PRODUCTION_DEPLOY").explicitlyExcluded.some((item) => item.includes("不 git push")))

  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})
