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
  assert.equal(pkg.scripts["aliyun:sensitive:blockers:test"], "node --test tests/aliyun-sensitive-blockers.static.test.js")
  assert.match(predeploy, /aliyun:sensitive:blockers:test/)
  assert.match(predeploy, /aliyun:sensitive:blockers/)
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:sensitive:blockers"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:sensitive:blockers:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:sensitive:blockers"))
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
      "S06_READY_SENSITIVE_ENV_IMPORT",
      "S07_ANDROID_RELEASE_SIGNING",
    ],
  )
  assert.ok(report.summary.userIntervention.blockedVariableNames.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.userIntervention.blockedVariableNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.summary.userIntervention.blockedVariableNames.includes("APPLE_TEAM_ID"))
  assert.ok(report.summary.userIntervention.readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.ok(report.summary.userIntervention.readySecretEnvVariableNames.includes("DASHSCOPE_API_KEY"))
  assert.ok(report.summary.userIntervention.readySecretEnvVariableCount >= 1)
  assert.equal(report.credentialInterventionBrief.blockedCredentialCount, 8)
  assert.equal(report.credentialInterventionBrief.readySecretEnvVariableCount, 17)
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
  assert.match(markdown, /blockedCredentialCount: 8/)
  assert.match(markdown, /readySecretEnvVariableCount: 17/)
  assert.match(markdown, /wechat_open_mobile_app/)
  assert.match(markdown, /ready_secret_env_import/)
  assert.match(markdown, /android_release_signing/)
  assert.match(markdown, /blockedVariableNames: .*WECHAT_OPEN_APP_ID/)
  assert.match(markdown, /readySecretEnvVariableNames: .*SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(markdown, /external_review_then_app_credentials: S01_WECHAT_OPEN_APP_LOGIN/)
  assert.match(markdown, /controlled_secret_channel: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S06_READY_SENSITIVE_ENV_IMPORT/)
  assert.match(markdown, /`WECHAT_OPEN_APP_ID`/)
  assert.match(markdown, /`MEIYE_RELEASE_KEY_PASSWORD`/)
  assert.match(markdown, /微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App/)
  assert.match(markdown, /Android signing secret store/)
  assert.match(markdown, /阿里云 KMS\/Secrets Manager\/SAE secret env/)
  assert.doesNotMatch(markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun release artifacts summary surfaces sensitive blocker acquisition details", () => {
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")

  assert.match(releaseArtifacts, /renderSensitiveBlockerSummaryLines\(sensitiveBlockers\.items \|\| \[\]\)/)
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
})

test("APP production-cn sensitive blockers handoff documents user-intervention credential boundaries", () => {
  const doc = read("docs", "app-production-cn-sensitive-blockers.md")

  for (const expected of [
    "Production-cn cannot be deployed now.",
    "total=7",
    "blocked=7",
    "blockedCredentialCount=8",
    "readySecretEnvVariableCount=17",
    "canCodexProceedWithoutUser=false",
    "ALIYUN_OSS_SECURITY_TOKEN",
    "APPLE_TEAM_ID",
    "MEIYE_RELEASE_KEY_PASSWORD",
    "WECHAT_OPEN_APP_ID",
    "WECHAT_OPEN_APP_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DASHSCOPE_API_KEY",
    "WECHAT_MINI_SECRET",
    "S01_WECHAT_OPEN_APP_LOGIN",
    "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息",
    "WECHAT_OPEN_APP_SECRET -> Aliyun KMS / Secrets Manager / SAE secret env",
    "mini-program credentials `WECHAT_MINI_APPID`, `WECHAT_MINI_SECRET`, and `WECHAT_LOGIN_SECRET` do not unblock APP WeChat login",
    "S02_APPLE_TEAM_ID",
    "com.ipgongchang.meiyehuajing",
    "S03_ACR_PAID_PURCHASE",
    "quoted price=CNY 117.00",
    "S04_ACR_REGISTRY_AUTH",
    "runtime.imagePullConfigured=true",
    "S05_OSS_RAM_SECRET_OR_STS",
    "ALIYUN_OSS_ACCESS_KEY_SECRET",
    "S06_READY_SENSITIVE_ENV_IMPORT",
    "envImport.secretNotInImage=true",
    "S07_ANDROID_RELEASE_SIGNING",
    "MEIYE_RELEASE_STORE_PASSWORD",
    "debug.keystore",
    "corepack pnpm aliyun:predeploy",
    "Do not read or output WECHAT_OPEN_APP_SECRET.",
    "Do not buy ACR, create secrets, import env values, run docker login/push, deploy production-cn, or git push.",
  ]) {
    assert.match(doc, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  assert.doesNotMatch(doc, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(doc, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(doc, /:\/\/[^\s:@]+:[^\s@]+@/)
  assert.doesNotMatch(doc, /AccessKeySecret\s*[:=]\s*["'][^"']+["']/)
})
