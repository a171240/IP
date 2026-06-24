const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun user action brief command is wired into scripts and local predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:user:actions"], "node ./scripts/summarize-aliyun-user-action-brief.mjs")
  assert.equal(pkg.scripts["aliyun:user:actions:test"], "node --test tests/aliyun-user-action-brief.static.test.js")
  assert.match(predeploy, /aliyun:user:actions:test/)
  assert.match(predeploy, /aliyun:user:actions/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:user:actions:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:user:actions"))
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  assert.match(releaseArtifacts, /credentialAcquisitionSummary/)
  assert.match(releaseArtifacts, /blockedCredentialNames/)
  assert.match(releaseArtifacts, /readySecretEnvVariableNames/)
})

test("APP production-cn user action brief documents credential and operator handoff", () => {
  const doc = read("docs", "app-production-cn-user-action-brief.md")

  assert.match(doc, /现在不能部署；当前只推进阿里云后端/)
  assert.match(doc, /currentScope: backend_aliyun_only/)
  assert.match(doc, /fullAppLaunchScope: deferred_after_backend_online/)
  assert.match(doc, /ready: 0 \/ 11/)
  assert.match(doc, /blocked: 11/)
  assert.match(doc, /nextActionTimeConfirmations: P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(doc, /deferredAppLaunchConfirmations: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID/)
  assert.match(doc, /blockedCredentialCount: 8/)
  assert.match(doc, /readySecretEnvVariableCount: 17/)
  assert.match(doc, /databaseUrlCnStatus=todo/)
  assert.match(doc, /RDS PostgreSQL 迁移和回滚验收通过/)
  assert.match(doc, /P01_WECHAT_OPEN_MOBILE_APP/)
  assert.match(doc, /P10_ANDROID_RELEASE_SIGNING/)
  assert.match(doc, /P02_APPLE_TEAM_ID/)
  assert.match(doc, /P03_ACR_PURCHASE/)
  assert.match(doc, /P05_OSS_RAM_STS/)
  assert.match(doc, /P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(doc, /WECHAT_OPEN_APP_ID/)
  assert.match(doc, /WECHAT_OPEN_APP_SECRET/)
  assert.match(doc, /APPLE_TEAM_ID/)
  assert.match(doc, /MEIYE_RELEASE_STORE_FILE/)
  assert.match(doc, /MEIYE_RELEASE_STORE_PASSWORD/)
  assert.match(doc, /MEIYE_RELEASE_KEY_ALIAS/)
  assert.match(doc, /MEIYE_RELEASE_KEY_PASSWORD/)
  assert.match(doc, /ALIYUN_OSS_SECURITY_TOKEN/)
  assert.match(doc, /DATABASE_URL_CN/)
  assert.match(doc, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(doc, /legacy_database_migration_source/)
  assert.match(doc, /WECHAT_MINI_APPID/)
  assert.match(doc, /WECHAT_MINI_SECRET/)
  assert.match(doc, /mini_program_compat/)
  assert.match(doc, /U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE/)
  assert.match(doc, /U10_ANDROID_RELEASE_SIGNING/)
  assert.match(doc, /U09_DEPLOY_AUTHORIZATION/)
  assert.match(doc, /U11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(doc, /授权在微信开放平台创建\/补全美业话镜移动应用资料并提交审核/)
  assert.match(doc, /授权使用受控 Android release keystore 构建\/签名 release 包/)
  assert.match(doc, /授权读取 Apple Developer Team ID/)
  assert.match(doc, /授权购买 ACR Enterprise Economic，cn-hangzhou，1 个月，当前报价 CNY 117\.00/)
  assert.match(doc, /授权为服务记录音频 OSS 配置最小权限 RAM\/STS/)
  assert.match(doc, /不执行 docker login\/push/)
  assert.match(doc, /不把 AccessKeySecret 或 STS token 写入 JSON、Markdown、镜像或 git/)
  assert.match(doc, /明确授权生产部署/)
  assert.match(doc, /git push/)
})

test("Aliyun user action brief is value-free and includes the expected blockers", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-user-action-brief.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const authorizationOutput = execFileSync(process.execPath, ["scripts/summarize-aliyun-action-authorization.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const authorization = JSON.parse(authorizationOutput)
  const ids = report.actions.map((item) => item.id)

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.canDeployNow, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.blockedCredentialCount, 8)
  assert.equal(report.summary.readySecretEnvVariableCount, 17)
  assert.ok(report.summary.blockedCredentialNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.summary.blockedCredentialNames.includes("MEIYE_RELEASE_KEY_PASSWORD"))
  assert.ok(report.summary.readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.equal(report.credentialAcquisitionSummary.blockedCredentialCount, 8)
  assert.equal(report.credentialAcquisitionSummary.readySecretEnvVariableCount, 17)
  assert.ok(report.credentialAcquisitionSummary.blockedCredentialNames.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.credentialAcquisitionSummary.blockedCredentialNames.includes("APPLE_TEAM_ID"))
  assert.ok(report.credentialAcquisitionSummary.readySecretEnvVariableNames.includes("DASHSCOPE_API_KEY"))
  assert.ok(report.credentialAcquisitionSummary.forbiddenStorage.includes("Docker image"))
  assert.ok(report.credentialAcquisitionSummary.valueHandlingRules.some((item) => item.includes("不能写入 JSON")))
  assert.ok(report.credentialAcquisitionSummary.readySecretEnvVariableGroups.some((group) =>
    group.category === "legacy_database_migration_source" &&
    group.variableNames.includes("SUPABASE_SERVICE_ROLE_KEY")
  ))
  const credentialGroupsByCategory = new Map(report.credentialAcquisitionSummary.groups.map((group) => [group.category, group]))
  assert.match(credentialGroupsByCategory.get("wechat_open_mobile_app").obtainFrom, /微信开放平台/)
  assert.ok(credentialGroupsByCategory.get("wechat_open_mobile_app").blockedCredentialNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(credentialGroupsByCategory.get("wechat_open_mobile_app").writeTargets.some((item) => item.includes("WECHAT_OPEN_APP_SECRET")))
  assert.ok(credentialGroupsByCategory.get("android_release_signing").blockedCredentialNames.includes("MEIYE_RELEASE_STORE_PASSWORD"))
  assert.match(credentialGroupsByCategory.get("android_release_signing").obtainFrom, /Android release keystore/)
  assert.ok(credentialGroupsByCategory.get("ready_secret_env_import").readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.ok(credentialGroupsByCategory.get("ready_secret_env_import").variableNames.includes("WECHAT_MINI_SECRET"))
  assert.ok(ids.includes("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE"))
  assert.ok(ids.includes("U10_ANDROID_RELEASE_SIGNING"))
  assert.ok(ids.includes("U03_ACR_PURCHASE_CONFIRMATION"))
  assert.ok(ids.includes("U06_ENV_IMPORT"))
  assert.ok(ids.includes("U09_DEPLOY_AUTHORIZATION"))
  assert.ok(ids.includes("U11_ALIYUN_RDS_DATA_MIGRATION"))
  assert.ok(report.summary.userMustAct.includes("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE"))
  assert.ok(report.summary.userMustAct.includes("U08_SAE_RUNTIME_AND_SLS"))
  assert.ok(report.summary.actionTimeConfirmationRequired.includes("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE"))
  assert.ok(report.summary.actionTimeConfirmationRequired.includes("U10_ANDROID_RELEASE_SIGNING"))
  assert.ok(report.summary.actionTimeConfirmationRequired.includes("U02_APPLE_TEAM_ID"))
  assert.ok(report.summary.actionTimeConfirmationRequired.includes("U03_ACR_PURCHASE_CONFIRMATION"))
  assert.ok(report.summary.actionTimeConfirmationRequired.includes("U04_ACR_RUNTIME_AUTH"))
  assert.ok(report.summary.actionTimeConfirmationRequired.includes("U05_OSS_RAM_OR_STS"))
  assert.ok(report.summary.actionTimeConfirmationRequired.includes("U11_ALIYUN_RDS_DATA_MIGRATION"))
  assert.deepEqual(report.summary.nextActionTimeConfirmations, [
    "P03_ACR_PURCHASE",
    "P05_OSS_RAM_STS",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
  ])
  assert.deepEqual(report.summary.deferredAppLaunchConfirmations, [
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
  ])
  assert.deepEqual(
    report.nextActionTimeConfirmations.map((item) => item.packetId),
    authorization.nextActionTimeConfirmations.map((item) => item.packetId),
  )
  assert.deepEqual(
    report.nextActionTimeConfirmations.map((item) => item.minimumUserPhrase),
    authorization.nextActionTimeConfirmations.map((item) => item.minimumUserPhrase),
  )
  const wechatAction = report.actions.find((item) => item.id === "U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE")
  const androidSigningAction = report.actions.find((item) => item.id === "U10_ANDROID_RELEASE_SIGNING")
  const acrPurchaseAction = report.actions.find((item) => item.id === "U03_ACR_PURCHASE_CONFIRMATION")
  const acrRuntimeAction = report.actions.find((item) => item.id === "U04_ACR_RUNTIME_AUTH")
  const domainAction = report.actions.find((item) => item.id === "U07_DOMAIN_DNS_HTTPS_ICP")
  const deployAction = report.actions.find((item) => item.id === "U09_DEPLOY_AUTHORIZATION")
  const rdsAction = report.actions.find((item) => item.id === "U11_ALIYUN_RDS_DATA_MIGRATION")
  const nextConfirmationsById = new Map(report.nextActionTimeConfirmations.map((item) => [item.packetId, item]))
  const deferredConfirmationsById = new Map(report.deferredAppLaunchConfirmations.map((item) => [item.packetId, item]))
  assert.ok(wechatAction.variableNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.equal(wechatAction.requiresActionTimeConfirmation, true)
  assert.ok(wechatAction.currentEvidence.includes("wechatOpenPlatform.accountVerified=true"))
  assert.ok(wechatAction.currentEvidence.includes("wechatOpenPlatform.mobileAppCreated=false"))
  assert.ok(wechatAction.currentBlockers.includes("wechatOpenPlatform:mobileAppCreated"))
  assert.ok(
    deferredConfirmationsById.get("P01_WECHAT_OPEN_MOBILE_APP").explicitlyExcluded.some((item) =>
      item.includes("不把 AppSecret 写入 JSON"),
    ),
  )
  assert.ok(androidSigningAction.variableNames.includes("MEIYE_RELEASE_STORE_PASSWORD"))
  assert.ok(androidSigningAction.variableNames.includes("MEIYE_RELEASE_KEY_PASSWORD"))
  assert.equal(androidSigningAction.requiresActionTimeConfirmation, true)
  assert.ok(androidSigningAction.currentBlockers.includes("S07_ANDROID_RELEASE_SIGNING:blocked"))
  assert.ok(androidSigningAction.currentBlockers.includes("wechatOpenPlatform:androidSignature"))
  assert.ok(androidSigningAction.currentEvidence.includes("S07_ANDROID_RELEASE_SIGNING:releaseSigningConfigReady=true; releaseUsesDebugSigning=false; wechatSignatureRecorded=false; androidConfigured=false"))
  assert.ok(
    deferredConfirmationsById.get("P10_ANDROID_RELEASE_SIGNING").writeTargets.some((item) =>
      item.includes("微信开放平台 -> 移动应用 -> Android 应用签名"),
    ),
  )
  assert.ok(
    deferredConfirmationsById.get("P10_ANDROID_RELEASE_SIGNING").explicitlyExcluded.some((item) =>
      item.includes("debug.keystore"),
    ),
  )
  assert.ok(!acrPurchaseAction.currentEvidence.some((item) => item.includes("TODO_")))
  assert.ok(!acrRuntimeAction.currentEvidence.some((item) => item.includes("TODO_")))
  assert.ok(acrPurchaseAction.currentEvidence.includes("R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.quotedAmount=CNY 117.00"))
  assert.ok(acrPurchaseAction.currentEvidence.includes("R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=true"))
  assert.match(nextConfirmationsById.get("P03_ACR_PURCHASE").minimumUserPhrase, /CNY 117\.00/)
  assert.equal(nextConfirmationsById.get("P03_ACR_PURCHASE").nonSecretEvidenceOnly, true)
  assert.equal(acrRuntimeAction.requiresActionTimeConfirmation, true)
  assert.equal(report.actions.find((item) => item.id === "U05_OSS_RAM_OR_STS").requiresActionTimeConfirmation, true)
  assert.ok(
    nextConfirmationsById.get("P05_OSS_RAM_STS").writeTargets.some((item) =>
      item.includes("ALIYUN_OSS_ACCESS_KEY_SECRET"),
    ),
  )
  assert.ok(rdsAction.variableNames.includes("DATABASE_URL_CN"))
  assert.equal(rdsAction.requiresActionTimeConfirmation, true)
  assert.ok(rdsAction.currentBlockers.includes("requiredEnv:DATABASE_URL_CN"))
  assert.ok(rdsAction.currentBlockers.includes("rdsMigrationIncludedInThisRelease=false"))
  assert.ok(
    nextConfirmationsById.get("P11_ALIYUN_RDS_DATA_MIGRATION").writeTargets.some((item) =>
      item.includes("DATABASE_URL_CN"),
    ),
  )
  assert.equal(report.actions.find((item) => item.id === "U08_SAE_RUNTIME_AND_SLS").requiresActionTimeConfirmation, true)
  assert.equal(report.actions.find((item) => item.id === "U08_SAE_RUNTIME_AND_SLS").requiresUserAction, true)
  assert.ok(acrRuntimeAction.currentEvidence.includes("R02_ACR_IMAGE_REGISTRY:localDockerImage.status=ready"))
  assert.ok(acrRuntimeAction.currentEvidence.includes("R02_ACR_IMAGE_REGISTRY:runtime.appName=meiye-huajing-app-api-production-cn"))
  assert.ok(domainAction.currentBlockers.includes("apiDomainHttps:dnsResolvedToAliyun"))
  assert.ok(deployAction.currentBlockers.includes("canDeployNow=false"))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)

  const tmpMarkdown = path.join(fs.mkdtempSync(path.join(require("node:os").tmpdir(), "aliyun-user-actions-")), "brief.md")
  execFileSync(process.execPath, [
    "scripts/summarize-aliyun-user-action-brief.mjs",
    "--markdown",
    tmpMarkdown,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const markdown = fs.readFileSync(tmpMarkdown, "utf8")
  assert.match(markdown, /密钥\/密码\/受控变量获取摘要/)
  assert.match(markdown, /blockedCredentialCount: 8/)
  assert.match(markdown, /readySecretEnvVariableCount: 17/)
  assert.match(markdown, /WECHAT_OPEN_APP_ID/)
  assert.match(markdown, /MEIYE_RELEASE_KEY_PASSWORD/)
  assert.match(markdown, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(markdown, /不能写入 JSON/)
  assert.doesNotMatch(markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(markdown, /LTAI[A-Za-z0-9]{12,}/)
})
