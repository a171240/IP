const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun sensitive blockers command is wired into scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:sensitive:blockers"], "node ./scripts/summarize-aliyun-sensitive-blockers.mjs")
  assert.equal(pkg.scripts["aliyun:sensitive:blockers:backend"], "node ./scripts/summarize-aliyun-sensitive-blockers.mjs --backend-only")
  assert.equal(pkg.scripts["aliyun:sensitive:blockers:test"], "node --test tests/aliyun-sensitive-blockers.static.test.js")
  assert.match(predeploy, /aliyun:sensitive:blockers:test/)
  assert.match(predeploy, /aliyun:sensitive:blockers/)
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:sensitive:blockers"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:sensitive:blockers:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:sensitive:blockers"))
})

test("Aliyun sensitive blockers backend-only mode excludes deferred APP launch credentials", () => {
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--backend-only",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)
  const ids = report.items.map((item) => item.id)

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.backendOnly, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.deepEqual(report.deferredAppLaunchSensitiveActionIds, [
    "S01_WECHAT_OPEN_APP_LOGIN",
    "S02_APPLE_TEAM_ID",
    "S07_ANDROID_RELEASE_SIGNING",
  ])
  assert.deepEqual(ids, [
    "S03_ACR_PAID_PURCHASE",
    "S04_ACR_REGISTRY_AUTH",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])
  assert.equal(report.summary.total, 5)
  assert.equal(report.summary.blocked, 5)
  assert.deepEqual(report.summary.blockedIds, ids)
  assert.deepEqual(report.summary.actionTimeConfirmationRequired, ids)
  assert.deepEqual(report.credentialInterventionBrief.actionTimeConfirmationRequiredIds, ids)
  assert.equal(report.credentialInterventionBrief.blockedCredentialCount, 1)
  assert.deepEqual(report.credentialInterventionBrief.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.deepEqual(report.credentialInterventionBrief.interventionBreakdown.missingCredentialValues.names, ["DATABASE_URL_CN"])
  assert.deepEqual(report.credentialInterventionBrief.interventionBreakdown.missingCredentialValues.actionIds, ["S08_ALIYUN_RDS_DATABASE_URL"])
  assert.equal(report.credentialInterventionBrief.interventionBreakdown.readySecretsPendingCloudImport.count, 17)
  assert.deepEqual(report.credentialInterventionBrief.interventionBreakdown.paidPurchaseConfirmationActionIds, ["S03_ACR_PAID_PURCHASE"])
  assert.deepEqual(report.credentialInterventionBrief.interventionBreakdown.controlledSecretChannelActionIds, [
    "S04_ACR_REGISTRY_AUTH",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])
  assert.equal(report.credentialPasswordIntervention.required, true)
  assert.deepEqual(report.credentialPasswordIntervention.missingCredentialValues.names, ["DATABASE_URL_CN"])
  assert.deepEqual(report.credentialPasswordIntervention.missingCredentialValues.actionIds, ["S08_ALIYUN_RDS_DATABASE_URL"])
  assert.equal(report.credentialPasswordIntervention.readySecretsPendingCloudImport.count, 17)
  assert.ok(report.credentialPasswordIntervention.readySecretsPendingCloudImport.names.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.deepEqual(report.credentialPasswordIntervention.paidPurchaseConfirmationActionIds, ["S03_ACR_PAID_PURCHASE"])
  assert.ok(report.credentialPasswordIntervention.controlledSecretChannelActionIds.includes("S08_ALIYUN_RDS_DATABASE_URL"))
  assert.ok(report.credentialPasswordIntervention.userMustProvideOrConfirm.some((item) => /DATABASE_URL_CN/.test(item)))
  assert.ok(!report.summary.userIntervention.blockedVariableNames.includes("ALIYUN_OSS_SECURITY_TOKEN"))
  assert.equal(report.credentialInterventionBrief.readySecretEnvVariableCount, 17)
  assert.ok(report.credentialInterventionBrief.readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.ok(report.summary.userIntervention.groups.paid_purchase_confirmation.includes("S03_ACR_PAID_PURCHASE"))
  assert.ok(report.summary.userIntervention.groups.controlled_secret_channel.includes("S04_ACR_REGISTRY_AUTH"))
  assert.ok(report.summary.userIntervention.groups.controlled_secret_channel.includes("S05_OSS_RAM_SECRET_OR_STS"))
  assert.ok(report.summary.userIntervention.groups.controlled_secret_channel.includes("S08_ALIYUN_RDS_DATABASE_URL"))
  assert.ok(report.summary.userIntervention.groups.controlled_secret_channel.includes("S06_READY_SENSITIVE_ENV_IMPORT"))
  assert.ok(report.summary.userIntervention.blockedVariableNames.includes("DATABASE_URL_CN"))
  assert.ok(!report.summary.userIntervention.blockedVariableNames.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(!report.summary.userIntervention.blockedVariableNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(!report.summary.userIntervention.blockedVariableNames.includes("APPLE_TEAM_ID"))
  assert.ok(!report.summary.userIntervention.blockedVariableNames.includes("MEIYE_RELEASE_KEY_PASSWORD"))
  assert.ok(!ids.includes("S01_WECHAT_OPEN_APP_LOGIN"))
  assert.ok(!ids.includes("S02_APPLE_TEAM_ID"))
  assert.ok(!ids.includes("S07_ANDROID_RELEASE_SIGNING"))
  assert.match(report.currentAnswer, /阿里云后端-only/)
  assert.ok(report.nextActions.some((item) => item.includes("S03/S04/S05/S08/S06")))
  assert.ok(report.nextActions.some((item) => item.includes("APP 发布阶段延期项")))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("APP production-cn credential acquisition runbook pins backend-only password blockers", () => {
  const runbook = read("docs", "app-production-cn-credential-acquisition-runbook.md")

  for (const expected of [
    "Current Backend-Only Scope",
    "backend_aliyun_only",
    "blockedCredentialCount=1",
    "blockedCredentialNames=DATABASE_URL_CN",
    "readySecretEnvVariableCount=17",
    "Only missing backend credential/password item: DATABASE_URL_CN.",
    "CloudShell is not a credential source.",
    "docs/app-production-cn-backend-sensitive-blockers.md",
    "docs/app-production-cn-backend-user-action-brief.md",
    "docs/app-production-cn-backend-secret-env-import-batches.md",
    "S03_ACR_PAID_PURCHASE",
    "S04_ACR_REGISTRY_AUTH",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
    "Import the DATABASE_URL_CN value directly into Aliyun KMS / Secrets Manager / SAE secret env.",
    "rdsPostgres.databaseUrlCnSecretImported=true",
    "migration.supabaseNoLongerFormalTarget=true",
    "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "P03_ACR_PURCHASE",
    "P05_OSS_RAM_STS",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
  ]) {
    assert.match(runbook, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  assert.match(runbook, /WeChat Open Platform mobile app credentials, Android release signing, and Apple Team ID are deferred/)
  assert.match(runbook, /Android release signing/)
  assert.match(runbook, /Apple Team ID/)
  assert.match(runbook, /不能用小程序 AppID\/Secret 替代/)
  assert.doesNotMatch(runbook, /数据层暂时沿用现有 Supabase/)
  assert.doesNotMatch(runbook, /DATABASE_URL_CN\s*=\s*\S/)
  assert.doesNotMatch(runbook, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(runbook, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(runbook, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun sensitive blockers output has current blocked action ids but no secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-sensitive-blockers.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)
  const ids = report.items.map((item) => item.id)
  const wechatItem = report.items.find((item) => item.id === "S01_WECHAT_OPEN_APP_LOGIN")
  const appleItem = report.items.find((item) => item.id === "S02_APPLE_TEAM_ID")
  const acrPurchaseItem = report.items.find((item) => item.id === "S03_ACR_PAID_PURCHASE")
  const envImportItem = report.items.find((item) => item.id === "S06_READY_SENSITIVE_ENV_IMPORT")
  const androidSigningItem = report.items.find((item) => item.id === "S07_ANDROID_RELEASE_SIGNING")

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.ok(report.summary.blocked >= 1)
  assert.equal(report.summary.userIntervention.canCodexProceedWithoutUser, false)
  assert.deepEqual(
    report.summary.userIntervention.userMustObtainOrConfirmIds,
    [
      "S01_WECHAT_OPEN_APP_LOGIN",
      "S02_APPLE_TEAM_ID",
      "S03_ACR_PAID_PURCHASE",
      "S04_ACR_REGISTRY_AUTH",
      "S05_OSS_RAM_SECRET_OR_STS",
      "S08_ALIYUN_RDS_DATABASE_URL",
      "S06_READY_SENSITIVE_ENV_IMPORT",
      "S07_ANDROID_RELEASE_SIGNING",
    ],
  )
  assert.ok(report.summary.userIntervention.blockedVariableNames.includes("DATABASE_URL_CN"))
  assert.ok(report.summary.userIntervention.blockedVariableNames.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.userIntervention.blockedVariableNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.summary.userIntervention.blockedVariableNames.includes("APPLE_TEAM_ID"))
  assert.ok(report.summary.userIntervention.readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.ok(report.summary.userIntervention.readySecretEnvVariableNames.includes("DASHSCOPE_API_KEY"))
  assert.ok(report.summary.userIntervention.readySecretEnvVariableCount >= 1)
  assert.equal(report.credentialInterventionBrief.blockedCredentialCount, 8)
  assert.equal(report.credentialInterventionBrief.readySecretEnvVariableCount, 17)
  assert.equal(report.credentialPasswordIntervention.missingCredentialValues.count, 8)
  assert.ok(report.credentialPasswordIntervention.missingCredentialValues.names.includes("DATABASE_URL_CN"))
  assert.ok(report.credentialPasswordIntervention.missingCredentialValues.names.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.credentialPasswordIntervention.readySecretsPendingCloudImport.names.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.ok(report.credentialPasswordIntervention.paidPurchaseConfirmationActionIds.includes("S03_ACR_PAID_PURCHASE"))
  assert.ok(report.credentialPasswordIntervention.controlledSecretChannelActionIds.includes("S08_ALIYUN_RDS_DATABASE_URL"))
  assert.ok(!report.credentialInterventionBrief.blockedCredentialNames.includes("ALIYUN_OSS_SECURITY_TOKEN"))
  assert.ok(report.credentialInterventionBrief.blockedCredentialNames.includes("DATABASE_URL_CN"))
  assert.ok(report.credentialInterventionBrief.blockedCredentialNames.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.credentialInterventionBrief.blockedCredentialNames.includes("MEIYE_RELEASE_KEY_PASSWORD"))
  assert.ok(report.credentialInterventionBrief.readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.deepEqual(
    report.credentialInterventionBrief.actionTimeConfirmationRequiredIds,
    report.summary.actionTimeConfirmationRequired,
  )
  assert.ok(report.credentialInterventionBrief.forbiddenStorage.includes("Docker image"))
  assert.ok(report.credentialInterventionBrief.groups.some((group) =>
    group.category === "wechat_open_mobile_app" &&
    group.actionId === "S01_WECHAT_OPEN_APP_LOGIN" &&
    group.blockedCredentialNames.includes("WECHAT_OPEN_APP_SECRET") &&
    /微信开放平台/.test(group.obtainFrom)
  ))
  assert.ok(report.credentialInterventionBrief.groups.some((group) =>
    group.category === "ready_secret_env_import" &&
    group.actionId === "S06_READY_SENSITIVE_ENV_IMPORT" &&
    group.readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    group.requiresActionTimeConfirmation === true
  ))
  assert.ok(report.credentialInterventionBrief.groups.some((group) =>
    group.category === "rds_database_secret_and_migration" &&
    group.actionId === "S08_ALIYUN_RDS_DATABASE_URL" &&
    group.blockedCredentialNames.includes("DATABASE_URL_CN") &&
    /RDS PostgreSQL/.test(group.obtainFrom)
  ))
  assert.ok(report.credentialInterventionBrief.groups.some((group) =>
    group.category === "android_release_signing" &&
    group.actionId === "S07_ANDROID_RELEASE_SIGNING" &&
    group.blockedCredentialNames.includes("MEIYE_RELEASE_STORE_PASSWORD") &&
    /signing secret store/.test(group.valueHandling)
  ))
  assert.deepEqual(report.summary.userIntervention.groups.external_review_then_app_credentials, ["S01_WECHAT_OPEN_APP_LOGIN"])
  assert.deepEqual(report.summary.userIntervention.groups.external_identifier_lookup, ["S02_APPLE_TEAM_ID"])
  assert.deepEqual(report.summary.userIntervention.groups.paid_purchase_confirmation, ["S03_ACR_PAID_PURCHASE"])
  assert.ok(report.summary.userIntervention.groups.controlled_secret_channel.includes("S04_ACR_REGISTRY_AUTH"))
  assert.ok(report.summary.userIntervention.groups.controlled_secret_channel.includes("S05_OSS_RAM_SECRET_OR_STS"))
  assert.ok(report.summary.userIntervention.groups.controlled_secret_channel.includes("S08_ALIYUN_RDS_DATABASE_URL"))
  assert.ok(report.summary.userIntervention.groups.controlled_secret_channel.includes("S06_READY_SENSITIVE_ENV_IMPORT"))
  assert.deepEqual(report.summary.userIntervention.groups.android_release_signing_secret, ["S07_ANDROID_RELEASE_SIGNING"])
  assert.ok(report.summary.userIntervention.valueHandlingRules.some((line) => /不能写入 JSON/.test(line)))
  assert.ok(ids.includes("S01_WECHAT_OPEN_APP_LOGIN"))
  assert.match(wechatItem.requiredUserAction, /创建“美业话镜”移动应用并提交审核/)
  assert.match(wechatItem.unblockCondition, /reviewStatus=approved/)
  assert.match(wechatItem.obtainFrom, /微信开放平台/)
  assert.ok(wechatItem.writeTargets.includes("WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env"))
  assert.ok(wechatItem.writeTargets.includes("WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env"))
  assert.ok(wechatItem.verifyCommands.includes("corepack pnpm aliyun:health:smoke"))
  assert.equal(wechatItem.requiresActionTimeConfirmation, true)
  assert.ok(report.summary.variableDetails.total >= report.summary.variableDetails.blocked)
  assert.ok(report.summary.variableDetails.secretOrSensitive >= 1)
  assert.ok(wechatItem.variableDetails.some((item) =>
    item.name === "WECHAT_OPEN_APP_ID" &&
    item.status === "todo" &&
    item.importTarget === "阿里云 SAE plain env" &&
    /微信开放平台/.test(item.consolePath)
  ))
  assert.ok(wechatItem.variableDetails.some((item) =>
    item.name === "WECHAT_OPEN_APP_SECRET" &&
    item.status === "todo" &&
    item.importTarget === "阿里云 KMS/Secrets Manager/SAE secret env" &&
    /小程序 AppID\/Secret 不能替代/.test(item.notes)
  ))
  assert.match(wechatItem.completionEvidence.join("\n"), /mobileAppCreated=true/)
  assert.ok(ids.includes("S02_APPLE_TEAM_ID"))
  assert.equal(appleItem.type, "external_identifier")
  assert.match(appleItem.requiredUserAction, /Apple Developer/)
  assert.match(appleItem.forbidden, /不要猜测 Team ID/)
  assert.ok(appleItem.variableDetails.some((item) =>
    item.name === "APPLE_TEAM_ID" &&
    item.status === "empty" &&
    item.importTarget === "阿里云 SAE plain env"
  ))
  assert.ok(ids.includes("S03_ACR_PAID_PURCHASE"))
  assert.ok(ids.includes("S08_ALIYUN_RDS_DATABASE_URL"))
  assert.ok(ids.includes("S06_READY_SENSITIVE_ENV_IMPORT"))
  assert.ok(ids.includes("S07_ANDROID_RELEASE_SIGNING"))
  assert.equal(acrPurchaseItem.requiresActionTimeConfirmation, true)
  assert.ok(acrPurchaseItem.writeTargets.some((target) => target.includes("image-publish.local.json")))
  assert.match(acrPurchaseItem.completionEvidence.join("\n"), /acr\.purchaseCandidate\.confirmed=true/)
  assert.equal(envImportItem.requiresActionTimeConfirmation, true)
  assert.ok(envImportItem.writeTargets.some((target) => target.includes("items.envImport")))
  assert.ok(envImportItem.verifyCommands.includes("corepack pnpm aliyun:env:checklist"))
  assert.ok(envImportItem.variableDetails.some((item) =>
    item.name === "SUPABASE_SERVICE_ROLE_KEY" &&
    item.status === "ready" &&
    item.importTarget === "阿里云 KMS/Secrets Manager/SAE secret env"
  ))
  assert.deepEqual(
    report.summary.actionTimeConfirmationRequired,
    [
      "S01_WECHAT_OPEN_APP_LOGIN",
      "S02_APPLE_TEAM_ID",
      "S03_ACR_PAID_PURCHASE",
      "S04_ACR_REGISTRY_AUTH",
      "S05_OSS_RAM_SECRET_OR_STS",
      "S08_ALIYUN_RDS_DATABASE_URL",
      "S06_READY_SENSITIVE_ENV_IMPORT",
      "S07_ANDROID_RELEASE_SIGNING",
    ],
  )
  assert.equal(androidSigningItem.type, "android_keystore_password_or_signature")
  assert.equal(androidSigningItem.requiresActionTimeConfirmation, true)
  assert.ok(androidSigningItem.variableNames.includes("MEIYE_RELEASE_STORE_FILE"))
  assert.ok(androidSigningItem.variableNames.includes("MEIYE_RELEASE_STORE_PASSWORD"))
  assert.ok(androidSigningItem.variableNames.includes("MEIYE_RELEASE_KEY_ALIAS"))
  assert.ok(androidSigningItem.variableNames.includes("MEIYE_RELEASE_KEY_PASSWORD"))
  assert.ok(androidSigningItem.variableDetails.some((item) =>
    item.name === "MEIYE_RELEASE_STORE_PASSWORD" &&
    item.sensitivity === "secret" &&
    /Android signing secret store/.test(item.importTarget)
  ))
  assert.match(androidSigningItem.unblockCondition, /assembleRelease 成功/)
  assert.match(androidSigningItem.forbidden, /debug\.keystore/)
  assert.ok(report.summary.variableNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.summary.variableNames.includes("MEIYE_RELEASE_KEY_PASSWORD"))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun operator status and handoff inherit sensitive action metadata", () => {
  const operatorTasksOutput = execFileSync(process.execPath, ["scripts/generate-aliyun-operator-tasks.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const statusOutput = execFileSync(process.execPath, ["scripts/summarize-aliyun-production-cn-status.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const handoffOutput = execFileSync(
    process.execPath,
    ["scripts/generate-aliyun-operator-handoff.mjs", "--skip-vercel-env-coverage"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 30,
    },
  )
  const operatorTasks = JSON.parse(operatorTasksOutput)
  const status = JSON.parse(statusOutput)
  const handoff = JSON.parse(handoffOutput)
  const operatorWechat = operatorTasks.sensitiveActionItems.find((item) => item.id === "S01_WECHAT_OPEN_APP_LOGIN")
  const operatorApple = operatorTasks.sensitiveActionItems.find((item) => item.id === "S02_APPLE_TEAM_ID")
  const statusAcrPurchase = status.tasks.sensitiveActionItems.find((item) => item.id === "S03_ACR_PAID_PURCHASE")
  const handoffEnvImport = handoff.sensitiveActionItems.find((item) => item.id === "S06_READY_SENSITIVE_ENV_IMPORT")
  const handoffAndroidSigning = handoff.sensitiveActionItems.find((item) => item.id === "S07_ANDROID_RELEASE_SIGNING")

  assert.match(operatorWechat.obtainFrom, /微信开放平台/)
  assert.ok(operatorWechat.variableDetails.some((item) => item.name === "WECHAT_OPEN_APP_SECRET"))
  assert.ok(operatorWechat.writeTargets.includes("WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env"))
  assert.ok(operatorWechat.verifyCommands.includes("corepack pnpm aliyun:app-api:smoke"))
  assert.match(operatorWechat.completionEvidence.join("\n"), /mobileAppSubmitted=true/)
  assert.equal(operatorWechat.requiresActionTimeConfirmation, true)
  assert.equal(operatorApple.type, "external_identifier")
  assert.ok(operatorApple.variableDetails.some((item) => item.name === "APPLE_TEAM_ID"))
  assert.ok(status.humanSummary.some((line) => /密钥\/密码\/token\/付款\/受控标识符类人工介入项/.test(line)))
  assert.equal(statusAcrPurchase.requiresActionTimeConfirmation, true)
  assert.match(statusAcrPurchase.obtainFrom, /容器镜像服务 ACR/)
  assert.ok(statusAcrPurchase.writeTargets.some((target) => target.includes("image-publish.local.json")))
  assert.equal(handoffEnvImport.requiresActionTimeConfirmation, true)
  assert.ok(handoffEnvImport.variableDetails.some((item) => item.name === "SUPABASE_SERVICE_ROLE_KEY"))
  assert.ok(handoffEnvImport.verifyCommands.includes("corepack pnpm aliyun:readiness:cloud-ready"))
  assert.match(handoffEnvImport.completionEvidence.join("\n"), /envImport\.secretNotInImage=true/)
  assert.equal(handoffAndroidSigning.requiresActionTimeConfirmation, true)
  assert.ok(handoffAndroidSigning.variableDetails.some((item) => item.name === "MEIYE_RELEASE_KEY_PASSWORD"))
  assert.match(handoffAndroidSigning.obtainFrom, /Android release keystore/)
  assert.doesNotMatch(operatorTasksOutput + statusOutput + handoffOutput, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(operatorTasksOutput + statusOutput + handoffOutput, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(operatorTasksOutput + statusOutput + handoffOutput, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun sensitive blockers markdown renders value-free variable acquisition details", () => {
  const markdownPath = "/tmp/meiye-sensitive-blockers-variable-details.md"
  execFileSync(process.execPath, [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /#### 变量获取和导入明细/)
  assert.match(markdown, /## 用户介入分层/)
  assert.match(markdown, /## 用户介入密钥\/密码简表/)
  assert.match(markdown, /## 密钥\/密码介入拆解/)
  assert.match(markdown, /blockedCredentialCount: 8/)
  assert.match(markdown, /readySecretEnvVariableCount: 17/)
  assert.match(markdown, /missingCredentialValues: .*DATABASE_URL_CN/)
  assert.match(markdown, /readySecretsPendingCloudImport: 17/)
  assert.match(markdown, /paidPurchaseConfirmationActionIds: S03_ACR_PAID_PURCHASE/)
  assert.match(markdown, /controlledSecretChannelActionIds: .*S08_ALIYUN_RDS_DATABASE_URL/)
  assert.match(markdown, /wechat_open_mobile_app/)
  assert.match(markdown, /rds_database_secret_and_migration/)
  assert.match(markdown, /ready_secret_env_import/)
  assert.match(markdown, /android_release_signing/)
  assert.match(markdown, /blockedVariableNames: .*DATABASE_URL_CN/)
  assert.match(markdown, /blockedVariableNames: .*WECHAT_OPEN_APP_ID/)
  assert.match(markdown, /readySecretEnvVariableNames: .*SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(markdown, /external_review_then_app_credentials: S01_WECHAT_OPEN_APP_LOGIN/)
  assert.match(markdown, /controlled_secret_channel: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT/)
  assert.match(markdown, /`WECHAT_OPEN_APP_ID`/)
  assert.match(markdown, /`MEIYE_RELEASE_KEY_PASSWORD`/)
  assert.match(markdown, /微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App/)
  assert.match(markdown, /Android signing secret store/)
  assert.match(markdown, /阿里云 KMS\/Secrets Manager\/SAE secret env/)
  assert.doesNotMatch(markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun credential acquisition runbook stays aligned with sensitive blockers", () => {
  const runbook = read("docs", "app-production-cn-credential-acquisition-runbook.md")
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-sensitive-blockers.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)

  assert.match(runbook, /Production-cn cannot be deployed now\./)
  assert.match(runbook, /Current Backend-Only Scope/)
  assert.match(runbook, /backend_aliyun_only/)
  assert.match(runbook, /corepack pnpm aliyun:sensitive:blockers:backend/)
  assert.match(runbook, /blockedCredentialCount=1/)
  assert.match(runbook, /blockedCredentialNames=DATABASE_URL_CN/)
  assert.match(runbook, /Only missing backend credential\/password item: DATABASE_URL_CN/)
  assert.match(runbook, /Where to get it: Aliyun Console -> RDS PostgreSQL -> cn-hangzhou instance/)
  assert.match(runbook, /Where to put it: Aliyun KMS \/ Secrets Manager \/ SAE secret env only/)
  assert.match(runbook, /CloudShell is not a credential source/)
  assert.match(runbook, /性能型 NAS/)
  assert.match(runbook, /DATABASE_URL_CN Acquisition Steps/)
  assert.match(runbook, /rdsPostgres\.databaseUrlCnSecretImported=true/)
  assert.match(runbook, /migration\.appApiSmokeOnRdsPassed=true/)
  assert.match(runbook, /docs\/app-production-cn-backend-sensitive-blockers\.md/)
  assert.match(runbook, /docs\/app-production-cn-backend-secret-env-import-batches\.md/)
  assert.match(runbook, /blockedCredentialCount=8/)
  assert.match(runbook, /readySecretEnvVariableCount=17/)
  assert.match(runbook, /canCodexProceedWithoutUser=false/)
  assert.match(runbook, /actionTimeConfirmationRequired=true/)
  assert.match(runbook, /阿里云不是 APP 的创建平台/)
  assert.match(runbook, /不能用小程序 AppID\/Secret 替代/)
  assert.match(runbook, /P01_WECHAT_OPEN_MOBILE_APP/)
  assert.match(runbook, /Backend-Only Actions That Can Start Next/)
  assert.match(runbook, /P00_ALIYUN_READONLY_INVENTORY_IDENTITY/)
  assert.match(runbook, /P09_PRODUCTION_DEPLOY/)
  assert.match(runbook, /corepack pnpm aliyun:env:handoff:backend/)
  assert.match(runbook, /corepack pnpm aliyun:rds:migration:evidence/)
  assert.match(runbook, /corepack pnpm aliyun:backend-cn:status/)

  const backendStartSection = runbook.match(
    /## Backend-Only Actions That Can Start Next[\s\S]*?```text\n([\s\S]*?)```/,
  )?.[1] || ""
  assert.match(backendStartSection, /P00_ALIYUN_READONLY_INVENTORY_IDENTITY/)
  assert.match(backendStartSection, /P03_ACR_PURCHASE/)
  assert.match(backendStartSection, /P05_OSS_RAM_STS/)
  assert.match(backendStartSection, /P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.doesNotMatch(backendStartSection, /P01_WECHAT_OPEN_MOBILE_APP/)
  assert.doesNotMatch(backendStartSection, /P10_ANDROID_RELEASE_SIGNING/)
  assert.doesNotMatch(backendStartSection, /P02_APPLE_TEAM_ID/)

  const deferredLaunchSection = runbook.match(
    /Full App launch packets remain deferred[\s\S]*?```text\n([\s\S]*?)```/,
  )?.[1] || ""
  assert.match(deferredLaunchSection, /P01_WECHAT_OPEN_MOBILE_APP/)
  assert.match(deferredLaunchSection, /P10_ANDROID_RELEASE_SIGNING/)
  assert.match(deferredLaunchSection, /P02_APPLE_TEAM_ID/)
  assert.match(runbook, /Deferred full App launch evidence writes, not current backend-only writes/)

  for (const item of report.items) {
    assert.match(runbook, new RegExp(item.id))
    for (const name of item.variableNames || []) {
      assert.match(runbook, new RegExp(name))
    }
    for (const command of item.verifyCommands || []) {
      assert.ok(runbook.includes(command))
    }
  }

  for (const name of report.credentialInterventionBrief.blockedCredentialNames) {
    assert.match(runbook, new RegExp(name))
  }
  for (const name of report.credentialInterventionBrief.readySecretEnvVariableNames) {
    assert.match(runbook, new RegExp(name))
  }
  for (const forbidden of [
    "AppSecret",
    "AccessKeySecret",
    "registry password",
    "RAM Secret",
    "STS token",
    "Android keystore password",
    "Supabase service role key",
  ]) {
    assert.match(runbook, new RegExp(forbidden))
  }

  assert.doesNotMatch(runbook, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(runbook, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(runbook, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("APP production-cn backend-only sensitive docs reflect current Aliyun backend scope", () => {
  const sensitiveDoc = read("docs", "app-production-cn-backend-sensitive-blockers.md")
  const actionDoc = read("docs", "app-production-cn-backend-user-action-brief.md")
  const importBatches = read("docs", "app-production-cn-backend-secret-env-import-batches.md")
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--backend-only",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)

  for (const doc of [sensitiveDoc, actionDoc]) {
    assert.match(doc, /currentScope: backend_aliyun_only/)
    assert.match(doc, /blockedCredentialCount: 1|blockedCredentialCount=1/)
    assert.match(doc, /readySecretEnvVariableCount: 17|readySecretEnvVariableCount=17/)
    assert.match(doc, /ALIYUN_OSS_SECURITY_TOKEN/)
    assert.match(doc, /DATABASE_URL_CN/)
    assert.match(doc, /S03_ACR_PAID_PURCHASE/)
    assert.match(doc, /S05_OSS_RAM_SECRET_OR_STS/)
    assert.match(doc, /S08_ALIYUN_RDS_DATABASE_URL/)
    assert.match(doc, /S06_READY_SENSITIVE_ENV_IMPORT/)
    assert.match(doc, /延期/)
    assert.doesNotMatch(doc, /sk-[A-Za-z0-9_-]{20,}/)
    assert.doesNotMatch(doc, /LTAI[A-Za-z0-9]{12,}/)
    assert.doesNotMatch(doc, /:\/\/[^\s:@]+:[^\s@]+@/)
    assert.doesNotMatch(doc, /AccessKeySecret\s*[:=]\s*["'][^"']+["']/)
  }

  assert.match(sensitiveDoc, /## 密钥\/密码介入拆解/)
  assert.match(sensitiveDoc, /missingCredentialValues: DATABASE_URL_CN/)
  assert.match(sensitiveDoc, /missingCredentialValueActionIds: S08_ALIYUN_RDS_DATABASE_URL/)
  assert.match(sensitiveDoc, /readySecretsPendingCloudImport: 17/)
  assert.match(sensitiveDoc, /paidPurchaseConfirmationActionIds: S03_ACR_PAID_PURCHASE/)
  assert.match(sensitiveDoc, /controlledSecretChannelActionIds: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT/)

  assert.match(
    sensitiveDoc,
    /deferredAppLaunchSensitiveActionIds: S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S07_ANDROID_RELEASE_SIGNING/,
  )
  assert.match(
    actionDoc,
    /deferredAppLaunchConfirmations: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID/,
  )
  assert.match(actionDoc, /nextActionTimeConfirmations: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(importBatches, /Current backend-only sensitive gate/)
  assert.match(importBatches, /blockedCredentialCount=1/)
  assert.match(importBatches, /readySecretEnvVariableCount=17/)
  assert.match(importBatches, /readySecretEnvVariableGroupCount=9/)
  assert.match(importBatches, /ALIYUN_OSS_SECURITY_TOKEN/)
  assert.match(importBatches, /DATABASE_URL_CN/)
  assert.match(importBatches, /S03_ACR_PAID_PURCHASE/)
  assert.match(importBatches, /S04_ACR_REGISTRY_AUTH/)
  assert.match(importBatches, /legacy_database_migration_source/)
  assert.match(importBatches, /Aliyun RDS PostgreSQL/)
  assert.match(importBatches, /WECHAT_OPEN_APP_ID/)
  assert.match(importBatches, /S01_WECHAT_OPEN_APP_LOGIN/)
  assert.match(importBatches, /APPLE_TEAM_ID/)
  assert.match(importBatches, /S02_APPLE_TEAM_ID/)
  assert.match(importBatches, /MEIYE_RELEASE_KEY_PASSWORD/)
  assert.match(importBatches, /S07_ANDROID_RELEASE_SIGNING/)
  assert.match(importBatches, /They do not unblock native APP WeChat login/)
  assert.match(importBatches, /corepack pnpm aliyun:sensitive:blockers:backend/)
  assert.match(importBatches, /Do not import env values without action-time authorization/)
  assert.doesNotMatch(importBatches, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(importBatches, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(importBatches, /:\/\/[^\s:@]+:[^\s@]+@/)
  assert.doesNotMatch(importBatches, /AccessKeySecret\s*[:=]\s*["'][^"']+["']/)
  assert.deepEqual(report.credentialInterventionBrief.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.summary.readySensitiveEnvVariableGroups.length, 9)
  for (const group of report.summary.readySensitiveEnvVariableGroups) {
    assert.match(importBatches, new RegExp(group.category))
    assert.match(importBatches, new RegExp(String(group.count)))
    for (const name of group.variableNames) {
      assert.match(importBatches, new RegExp(name))
    }
  }
  for (const name of report.credentialInterventionBrief.readySecretEnvVariableNames) {
    assert.match(sensitiveDoc, new RegExp(name))
    assert.match(actionDoc, new RegExp(name))
    assert.match(importBatches, new RegExp(name))
  }
})

test("Aliyun release artifacts summary surfaces sensitive blocker acquisition details", () => {
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const doc = read("docs", "DEPLOY_ALIYUN_PRODUCTION_CN.md")

  assert.match(releaseArtifacts, /renderSensitiveBlockerSummaryLines\(sensitiveBlockers\.items \|\| \[\]\)/)
  assert.match(releaseArtifacts, /\.\.\.backendOnlyArg[\s\S]*"--out"[\s\S]*sensitiveBlockersJsonPath/)
  assert.match(releaseArtifacts, /items: \(sensitiveBlockers\.items \|\| \[\]\)\.map\(compactSensitiveBlockerForAudit\)/)
  assert.match(releaseArtifacts, /obtainFrom: item\.obtainFrom \|\| item\.consolePath/)
  assert.match(releaseArtifacts, /writeTargets: item\.writeTargets \|\| \[\]/)
  assert.match(releaseArtifacts, /verifyCommands: item\.verifyCommands \|\| \[\]/)
  assert.match(releaseArtifacts, /completionEvidence: item\.completionEvidence \|\| \[\]/)
  assert.match(releaseArtifacts, /variableDetailsSummary/)
  assert.match(releaseArtifacts, /formatSensitiveVariableSummary/)
  assert.match(releaseArtifacts, /userIntervention: sensitiveBlockers\.summary\.userIntervention/)
  assert.match(releaseArtifacts, /credentialInterventionBrief/)
  assert.match(releaseArtifacts, /requiredEnvBlockerDetails/)
  assert.match(releaseArtifacts, /obtainFrom: item\.obtainFrom \|\| item\.consolePath/)
  assert.match(releaseArtifacts, /valueHandling: item\.valueHandling \|\|/)
  assert.match(releaseArtifacts, /blockedVariableNames/)
  assert.match(releaseArtifacts, /readySecretEnvVariableCount/)
  assert.match(releaseArtifacts, /formatUserInterventionGroups/)
  assert.match(doc, /aliyun:sensitive:blockers:backend/)
  assert.match(doc, /blocked credential name 应为 `DATABASE_URL_CN`/)
})

test("APP production-cn sensitive blockers handoff documents user-intervention credential boundaries", () => {
  const doc = read("docs", "app-production-cn-sensitive-blockers.md")
  const importBatches = read("docs", "app-production-cn-secret-env-import-batches.md")

  for (const expected of [
    "# 美业话镜 APP production-cn 密钥/密码/token/付款/受控标识符阻塞项",
    "currentScope: full_app_launch",
    "blocked: 8 / 8",
    "blockedCredentialCount: 8",
    "blockedCredentialNames: APPLE_TEAM_ID, DATABASE_URL_CN",
    "readySecretEnvVariableCount: 17",
    "canCodexProceedWithoutUser: false",
    "## 密钥/密码介入拆解",
    "missingCredentialValues: APPLE_TEAM_ID, DATABASE_URL_CN",
    "readySecretsPendingCloudImport: 17",
    "paidPurchaseConfirmationActionIds: S03_ACR_PAID_PURCHASE",
    "controlledSecretChannelActionIds: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT",
    "ALIYUN_OSS_SECURITY_TOKEN",
    "DATABASE_URL_CN",
    "APPLE_TEAM_ID",
    "MEIYE_RELEASE_KEY_PASSWORD",
    "WECHAT_OPEN_APP_ID",
    "WECHAT_OPEN_APP_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DASHSCOPE_API_KEY",
    "WECHAT_MINI_SECRET",
    "S01_WECHAT_OPEN_APP_LOGIN",
    "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App",
    "WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env",
    "S02_APPLE_TEAM_ID",
    "com.ipgongchang.meiyehuajing",
    "S03_ACR_PAID_PURCHASE",
    "CNY 117.00",
    "S04_ACR_REGISTRY_AUTH",
    "runtime.imagePullConfigured=true",
    "S05_OSS_RAM_SECRET_OR_STS",
    "ALIYUN_OSS_ACCESS_KEY_SECRET",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env",
    "S06_READY_SENSITIVE_ENV_IMPORT",
    "envImport.secretNotInImage=true",
    "S07_ANDROID_RELEASE_SIGNING",
    "MEIYE_RELEASE_STORE_PASSWORD",
    "debug.keystore",
    "本报告不创建资源、不付款、不修改 DNS、不导入环境变量、不调用阿里云写 API。",
  ]) {
    assert.match(doc, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  assert.doesNotMatch(doc, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(doc, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(doc, /:\/\/[^\s:@]+:[^\s@]+@/)
  assert.doesNotMatch(doc, /AccessKeySecret\s*[:=]\s*["'][^"']+["']/)

  for (const expected of [
    "Production-cn backend cannot be deployed now.",
    "blockedCredentialCount=1",
    "readySecretEnvVariableCount=17",
    "readySecretEnvVariableGroupCount=9",
    "WECHAT_OPEN_APP_ID",
    "WECHAT_OPEN_APP_SECRET",
    "APPLE_TEAM_ID",
    "ALIYUN_OSS_SECURITY_TOKEN",
    "Conditional OSS STS Token",
    "DATABASE_URL_CN",
    "MEIYE_RELEASE_STORE_PASSWORD",
    "legacy_database_migration_source",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "app_auth",
    "WECHAT_LOGIN_SECRET",
    "aliyun_oss",
    "ALIYUN_OSS_ACCESS_KEY_SECRET",
    "bailian_asr",
    "DASHSCOPE_API_KEY",
    "deepseek_summary",
    "SERVICE_RECORD_DEEPSEEK_API_KEY",
    "volc_speech",
    "VOLC_SPEECH_SECRET_KEY",
    "backend_ops",
    "CREDITS_IP_SALT",
    "legacy_content_provider",
    "APIMART_API_KEY",
    "mini_program_compat",
    "WECHAT_MINI_SECRET",
    "items.envImport.secretNotInImage=true",
    "corepack pnpm aliyun:env:checklist",
    "corepack pnpm aliyun:predeploy",
    "Do not import env values without action-time authorization.",
  ]) {
    assert.match(importBatches, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  assert.match(importBatches, /They do not unblock native APP WeChat login/)
  assert.match(importBatches, /Do not deploy production-cn after env import alone/)
  assert.doesNotMatch(importBatches, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(importBatches, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(importBatches, /:\/\/[^\s:@]+:[^\s@]+@/)
  assert.doesNotMatch(importBatches, /AccessKeySecret\s*[:=]\s*["'][^"']+["']/)
})
