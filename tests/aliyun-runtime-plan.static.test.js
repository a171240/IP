/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@)/
const productionVoiceCoachRepositoryMode = "rds_voice_coach_text_session_contract"
const schedulerResourceName = "personal-trial-reservation-expiry-5m"
const schedulerConnectionName =
  "personal-trial-reservation-expiry-prod-cn"
const schedulerApiDestinationName =
  "personal-trial-reservation-expiry-prod-cn"
const schedulerTargetId =
  "personal-trial-reservation-expiry-api-destination"
const schedulerTargetUrl =
  "https://api-cn.ipgongchang.xin/api/cron/personal-trial-reservations"

test("Aliyun runtime plan command is wired into package scripts", () => {
  const pkg = readJson("package.json")
  const deploySpec = readJson(
    "deploy",
    "aliyun-production-cn.example.json",
  )

  assert.equal(pkg.scripts["aliyun:runtime:plan"], "node ./scripts/check-aliyun-runtime-plan.mjs")
  assert.equal(
    pkg.scripts["aliyun:runtime:plan:strict"],
    "node ./scripts/check-aliyun-runtime-plan.mjs --require-cloud-evidence --evidence-stage provisioned-disabled",
  )
  assert.equal(
    pkg.scripts["aliyun:runtime:plan:controlled:strict"],
    "node ./scripts/check-aliyun-runtime-plan.mjs --require-cloud-evidence --evidence-stage controlled-disabled",
  )
  assert.equal(
    pkg.scripts["aliyun:runtime:plan:enabled:strict"],
    "node ./scripts/check-aliyun-runtime-plan.mjs --require-cloud-evidence --evidence-stage enabled",
  )
  assert.equal(pkg.scripts["aliyun:runtime:plan:test"], "node --test tests/aliyun-runtime-plan.static.test.js")
  assert.ok(
    deploySpec.localPredeployChecks.includes(
      "corepack pnpm run aliyun:runtime:plan:strict",
    ),
  )
  assert.ok(
    deploySpec.predeployChecks.includes(
      "corepack pnpm aliyun:runtime:plan:strict",
    ),
  )
  assert.ok(
    deploySpec.postdeployChecks.includes(
      "corepack pnpm aliyun:runtime:plan:enabled:strict",
    ),
  )
  assert.deepEqual(
    deploySpec.personalTrialExpirySchedulerGates,
    {
      beforeSaeDeploy:
        "corepack pnpm aliyun:runtime:plan:strict",
      afterSaeDeployBeforeRuleEnable:
        "corepack pnpm aliyun:runtime:plan:controlled:strict",
      afterRuleEnable:
        "corepack pnpm aliyun:runtime:plan:enabled:strict",
    },
  )
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
  assert.equal(
    report.voiceCoachTextRepositoryModeEnvName,
    "APP_VOICE_COACH_TEXT_REPOSITORY_MODE",
  )
  assert.equal(
    report.voiceCoachTextRepositoryModeRequiredValue,
    productionVoiceCoachRepositoryMode,
  )
  assert.equal(report.voiceCoachTextRepositoryFailClosed, true)
  assert.deepEqual(report.predeployDependencyIds, [
    "RDS_POSTGRES_MIGRATION",
    "ACR_IMAGE_DIGEST_AND_PULL",
    "OSS_RUNTIME_ACCESS",
    "BACKEND_ENV_IMPORT",
  ])
  assert.deepEqual(report.personalTrialReservationExpiryScheduler, {
    provider: "Aliyun EventBridge",
    region: "cn-hangzhou",
    eventBusName: "meiye-huajing-production-cn",
    eventSourceName: schedulerResourceName,
    connectionName: schedulerConnectionName,
    apiDestinationName: schedulerApiDestinationName,
    ruleName: schedulerResourceName,
    cronExpression: "0 */5 * * * *",
    timeZone: "GMT+8:00",
    targetType: "API destination",
    targetMethod: "GET",
    targetUrl: schedulerTargetUrl,
    eventTargetId: schedulerTargetId,
    eventTargetType: "acs.api.destination",
    eventTargetEndpointPattern:
      "acs:api-destination:cn-hangzhou:<account-id>:name/personal-trial-reservation-expiry-prod-cn",
    pushRetryStrategy: "BACKOFF_RETRY",
    errorsTolerance: "ALL",
    deadLetterQueueEnabled: false,
    initialRuleStatus: "DISABLE",
    authenticationHeaderName: "Authorization",
    authenticationSecretName: "PERSONAL_TRIAL_EXPIRY_CRON_SECRET",
    collisionPolicy:
      "stop_on_existing_name_with_nonmatching_configuration",
    requiredBeforePersonalTrialPublicEnable: true,
    cloudConfirmationKey: "personalTrialReservationExpiryScheduler",
  })
  assert.equal(
    Object.hasOwn(
      plan.scheduledRequests[0],
      "provisioned",
    ),
    false,
  )
  assert.equal(
    Object.hasOwn(
      plan.scheduledRequests[0],
      "verificationStatus",
    ),
    false,
  )
  assert.deepEqual(
    plan.scheduledRequests[0].verificationGates,
    {
      beforeSaeDeploy:
        "corepack pnpm aliyun:runtime:plan:strict",
      afterSaeDeployBeforeRuleEnable:
        "corepack pnpm aliyun:runtime:plan:controlled:strict",
      afterRuleEnable:
        "corepack pnpm aliyun:runtime:plan:enabled:strict",
    },
  )

  assert.equal(plan.dataLayer.formalTarget, "Aliyun RDS PostgreSQL")
  assert.equal(plan.dataLayer.connectionEnvName, "DATABASE_URL_CN")
  assert.equal(
    plan.dataLayer.voiceCoachTextRepositoryModeEnvName,
    "APP_VOICE_COACH_TEXT_REPOSITORY_MODE",
  )
  assert.equal(
    plan.dataLayer.voiceCoachTextRepositoryModeRequiredValue,
    productionVoiceCoachRepositoryMode,
  )
  assert.equal(plan.dataLayer.voiceCoachTextRepositoryFailClosed, true)
  assert.equal(plan.dataLayer.requiredBeforeRuntimeReady, true)
  assert.equal(plan.dataLayer.migrationEvidenceCommand, "corepack pnpm aliyun:rds:migration:evidence:strict")
  assert.equal(plan.dataLayer.runtimeSmokeCommand, "corepack pnpm aliyun:rds:runtime-smoke:strict")
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
  assert.deepEqual(plan.predeployDependencies[0].supportingEvidenceCommands, [
    "corepack pnpm aliyun:rds:runtime-smoke:strict",
  ])
  assert.deepEqual(plan.predeployDependencies[2].supportingEvidenceCommands, [
    "corepack pnpm aliyun:oss:runtime-access:strict",
  ])
  assert.doesNotMatch(JSON.stringify(plan) + output, secretLike)
})

test("Aliyun runtime plan checker rejects missing or relaxed voice-coach repository gates", () => {
  const canonicalPlan = readJson("deploy", "aliyun-production-cn.runtime-plan.json")
  const cases = [
    {
      blocker: "dataLayer.voiceCoachTextRepositoryModeEnvName=APP_VOICE_COACH_TEXT_REPOSITORY_MODE",
      mutate(plan) {
        delete plan.dataLayer.voiceCoachTextRepositoryModeEnvName
      },
    },
    {
      blocker: `dataLayer.voiceCoachTextRepositoryModeRequiredValue=${productionVoiceCoachRepositoryMode}`,
      mutate(plan) {
        plan.dataLayer.voiceCoachTextRepositoryModeRequiredValue = "rds"
      },
    },
    {
      blocker: "dataLayer.voiceCoachTextRepositoryFailClosed=true",
      mutate(plan) {
        plan.dataLayer.voiceCoachTextRepositoryFailClosed = false
      },
    },
  ]

  for (const testCase of cases) {
    const plan = structuredClone(canonicalPlan)
    testCase.mutate(plan)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-runtime-plan-voice-coach-"))
    const planPath = path.join(tempDir, "runtime-plan.json")
    try {
      fs.writeFileSync(planPath, JSON.stringify(plan, null, 2))
      const result = spawnSync(process.execPath, [
        "scripts/check-aliyun-runtime-plan.mjs",
        "--plan",
        planPath,
      ], {
        cwd: root,
        encoding: "utf8",
      })

      assert.equal(result.status, 1)
      const report = JSON.parse(result.stdout)
      assert.ok(report.blockers.includes(testCase.blocker))
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
})

test("Aliyun runtime plan checker rejects missing or misrouted personal-trial expiry scheduling", () => {
  const canonicalPlan = readJson("deploy", "aliyun-production-cn.runtime-plan.json")
  const cases = [
    {
      blocker: "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY",
      mutate(plan) {
        plan.scheduledRequests = []
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:provider=Aliyun EventBridge",
      mutate(plan) {
        plan.scheduledRequests[0].provider = "Vercel"
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:cronExpression=0 */5 * * * *",
      mutate(plan) {
        plan.scheduledRequests[0].schedule.cronExpression = "0 0 0 * * *"
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:timeZone=GMT+8:00",
      mutate(plan) {
        plan.scheduledRequests[0].schedule.timeZone = "Asia/Shanghai"
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:eventBusName=meiye-huajing-production-cn",
      mutate(plan) {
        delete plan.scheduledRequests[0].topology.eventBusName
      },
    },
    {
      blocker:
        `scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:eventSourceName=${schedulerResourceName}`,
      mutate(plan) {
        plan.scheduledRequests[0].topology.eventSourceName = "wrong-source"
      },
    },
    {
      blocker:
        `scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:connectionName=${schedulerConnectionName}`,
      mutate(plan) {
        plan.scheduledRequests[0].topology.connectionName = "shared-connection"
      },
    },
    {
      blocker:
        `scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:apiDestinationName=${schedulerApiDestinationName}`,
      mutate(plan) {
        plan.scheduledRequests[0].topology.apiDestinationName =
          "wrong-destination"
      },
    },
    {
      blocker:
        `scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:ruleName=${schedulerResourceName}`,
      mutate(plan) {
        plan.scheduledRequests[0].topology.ruleName = "wrong-rule"
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:target.url",
      mutate(plan) {
        plan.scheduledRequests[0].target.url =
          "https://ip-a171240s-projects.vercel.app/api/cron/personal-trial-reservations"
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:authentication.headerName=Authorization",
      mutate(plan) {
        plan.scheduledRequests[0].target.authentication.headerName =
          "x-cron-secret"
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:authentication.secretName=PERSONAL_TRIAL_EXPIRY_CRON_SECRET",
      mutate(plan) {
        plan.scheduledRequests[0].target.authentication.secretName =
          "CRON_SECRET"
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:rule.initialStatus=DISABLE",
      mutate(plan) {
        plan.scheduledRequests[0].rule.initialStatus = "ENABLE"
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:eventTarget.pushRetryStrategy=BACKOFF_RETRY",
      mutate(plan) {
        plan.scheduledRequests[0].eventTarget.pushRetryStrategy =
          "EXPONENTIAL_DECAY_RETRY"
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:eventTarget.errorsTolerance=ALL",
      mutate(plan) {
        plan.scheduledRequests[0].eventTarget.errorsTolerance = "NONE"
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:eventTarget.deadLetterQueue.enabled=false",
      mutate(plan) {
        plan.scheduledRequests[0].eventTarget.deadLetterQueue.enabled = true
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:collisionPolicy=stop_on_existing_name_with_nonmatching_configuration",
      mutate(plan) {
        delete plan.scheduledRequests[0].collisionPolicy
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:requiredBeforePersonalTrialPublicEnable=true",
      mutate(plan) {
        plan.scheduledRequests[0].requiredBeforePersonalTrialPublicEnable = false
      },
    },
    {
      blocker:
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:verificationGates",
      mutate(plan) {
        delete plan.scheduledRequests[0].verificationGates
      },
    },
  ]

  for (const testCase of cases) {
    const plan = structuredClone(canonicalPlan)
    testCase.mutate(plan)
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "aliyun-runtime-plan-personal-trial-expiry-"),
    )
    const planPath = path.join(tempDir, "runtime-plan.json")
    try {
      fs.writeFileSync(planPath, JSON.stringify(plan, null, 2))
      const result = spawnSync(
        process.execPath,
        ["scripts/check-aliyun-runtime-plan.mjs", "--plan", planPath],
        {
          cwd: root,
          encoding: "utf8",
        },
      )

      assert.equal(result.status, 1)
      const report = JSON.parse(result.stdout)
      assert.ok(report.blockers.includes(testCase.blocker))
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
})

test("Aliyun runtime plan checker rejects mutable live state in the committed plan", () => {
  const canonicalPlan = readJson(
    "deploy",
    "aliyun-production-cn.runtime-plan.json",
  )
  const plan = structuredClone(canonicalPlan)
  plan.scheduledRequests[0].provisioned = true
  plan.scheduledRequests[0].verificationStatus = "passed"
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "aliyun-runtime-plan-live-state-"),
  )
  const planPath = path.join(tempDir, "runtime-plan.json")
  try {
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2))
    const result = spawnSync(
      process.execPath,
      ["scripts/check-aliyun-runtime-plan.mjs", "--plan", planPath],
      {
        cwd: root,
        encoding: "utf8",
      },
    )

    assert.equal(result.status, 1)
    const report = JSON.parse(result.stdout)
    assert.ok(
      report.blockers.includes(
        "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY:live_state_forbidden_in_runtime_plan",
      ),
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test("Aliyun runtime strict checker requires concrete non-secret cloud evidence", () => {
  const canonicalPlan = readJson(
    "deploy",
    "aliyun-production-cn.runtime-plan.json",
  )
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "aliyun-runtime-plan-cloud-evidence-"),
  )
  const planPath = path.join(tempDir, "runtime-plan.json")
  const confirmationsPath = path.join(
    tempDir,
    "cloud-confirmations.local.json",
  )
  fs.writeFileSync(planPath, JSON.stringify(canonicalPlan, null, 2))

  const validSchedulerEvidence = {
    confirmed: true,
    region: "cn-hangzhou",
    accountId: "1234567890123456",
    eventBusName: "meiye-huajing-production-cn",
    eventSourceName: schedulerResourceName,
    connectionName: schedulerConnectionName,
    apiDestinationName: schedulerApiDestinationName,
    ruleName: schedulerResourceName,
    ruleStatus: "DISABLE",
    targetId: schedulerTargetId,
    targetType: "acs.api.destination",
    targetEndpoint:
      "acs:api-destination:cn-hangzhou:1234567890123456:name/personal-trial-reservation-expiry-prod-cn",
    cronExpression: "0 */5 * * * *",
    timeZone: "GMT+8:00",
    apiDestinationUrl: schedulerTargetUrl,
    apiDestinationMethod: "GET",
    connectionAuthorizationType: "API_KEY_AUTH",
    connectionHeaderName: "Authorization",
    secretEnvName: "PERSONAL_TRIAL_EXPIRY_CRON_SECRET",
    saeSecretConfigured: true,
    connectionSecretConfigured: true,
    secretValuesRecorded: false,
    dedicatedSecretDistinctFromSharedCronSecret: true,
    pushRetryStrategy: "BACKOFF_RETRY",
    errorsTolerance: "ALL",
    deadLetterQueueEnabled: false,
    collisionCheckPassed: true,
    provisionedVerifiedAt: "2026-07-24T11:55:00.000Z",
    provisioningEvidence:
      "cli_eventbridge_inventory_2026-07-24T11:55:00Z",
  }

  try {
    fs.writeFileSync(
      confirmationsPath,
      JSON.stringify({
        schemaVersion: 1,
        environment: "production-cn",
        containsValues: false,
        items: {
          personalTrialReservationExpiryScheduler:
            validSchedulerEvidence,
        },
      }, null, 2),
    )
    const passed = spawnSync(
      process.execPath,
      [
        "scripts/check-aliyun-runtime-plan.mjs",
        "--plan",
        planPath,
        "--cloud-confirmations",
        confirmationsPath,
        "--require-cloud-evidence",
      ],
      {
        cwd: root,
        encoding: "utf8",
      },
    )
    assert.equal(passed.status, 0, passed.stderr || passed.stdout)
    const passedReport = JSON.parse(passed.stdout)
    assert.equal(passedReport.cloudEvidence.ready, true)
    assert.equal(passedReport.cloudEvidence.ruleStatus, "DISABLE")
    assert.equal(
      passedReport.cloudEvidence.evidenceStage,
      "provisioned-disabled",
    )
    assert.doesNotMatch(passed.stdout, secretLike)

    const controlledDocument = {
      schemaVersion: 1,
      environment: "production-cn",
      containsValues: false,
      items: {
        personalTrialReservationExpiryScheduler: {
          ...structuredClone(validSchedulerEvidence),
          negativeAuthStatus: 401,
          controlledPositiveStatus: 200,
          controlledPositiveExpiredCount: 0,
          controlledVerifiedAt: "2026-07-24T12:00:00.000Z",
          controlledEvidence:
            "controlled_http_validation_2026-07-24T12:00:00Z",
        },
      },
    }
    fs.writeFileSync(
      confirmationsPath,
      JSON.stringify(controlledDocument, null, 2),
    )
    const controlled = spawnSync(
      process.execPath,
      [
        "scripts/check-aliyun-runtime-plan.mjs",
        "--plan",
        planPath,
        "--cloud-confirmations",
        confirmationsPath,
        "--require-cloud-evidence",
        "--evidence-stage",
        "controlled-disabled",
      ],
      {
        cwd: root,
        encoding: "utf8",
      },
    )
    assert.equal(
      controlled.status,
      0,
      controlled.stderr || controlled.stdout,
    )

    const enabledDocument = {
      ...structuredClone(controlledDocument),
      items: {
        personalTrialReservationExpiryScheduler: {
          ...structuredClone(
            controlledDocument.items
              .personalTrialReservationExpiryScheduler,
          ),
          ruleStatus: "ENABLE",
          enabledAt: "2026-07-24T12:05:00.000Z",
          lastDeliveryStatus: "Success",
          lastDeliveryVerifiedAt: "2026-07-24T12:10:00.000Z",
          deliveryEvidence:
            "eventbridge_delivery_success_2026-07-24T12:10:00Z",
        },
      },
    }
    fs.writeFileSync(
      confirmationsPath,
      JSON.stringify(enabledDocument, null, 2),
    )
    const enabled = spawnSync(
      process.execPath,
      [
        "scripts/check-aliyun-runtime-plan.mjs",
        "--plan",
        planPath,
        "--cloud-confirmations",
        confirmationsPath,
        "--require-cloud-evidence",
        "--evidence-stage",
        "enabled",
      ],
      {
        cwd: root,
        encoding: "utf8",
      },
    )
    assert.equal(enabled.status, 0, enabled.stderr || enabled.stdout)
    const enabledReport = JSON.parse(enabled.stdout)
    assert.equal(enabledReport.cloudEvidence.ruleStatus, "ENABLE")
    assert.equal(enabledReport.cloudEvidence.lastDeliveryStatus, "Success")
    assert.equal(enabledReport.cloudEvidence.evidenceStage, "enabled")

    const invalidCases = [
      [
        "missing item",
        (document) => {
          delete document.items.personalTrialReservationExpiryScheduler
        },
        "cloudEvidence:personalTrialReservationExpiryScheduler",
        "provisioned-disabled",
      ],
      [
        "booleans without evidence handles",
        (document) => {
          const item =
            document.items.personalTrialReservationExpiryScheduler
          item.accountId = ""
          item.provisionedVerifiedAt = ""
          item.provisioningEvidence = ""
        },
        "cloudEvidence:accountId",
        "provisioned-disabled",
      ],
      [
        "missing SAE secret binding",
        (document) => {
          document.items.personalTrialReservationExpiryScheduler
            .saeSecretConfigured = false
        },
        "cloudEvidence:saeSecretConfigured=true",
        "provisioned-disabled",
      ],
      [
        "dedicated secret reused from shared cron secret",
        (document) => {
          document.items.personalTrialReservationExpiryScheduler
            .dedicatedSecretDistinctFromSharedCronSecret = false
        },
        "cloudEvidence:dedicatedSecretDistinctFromSharedCronSecret=true",
        "provisioned-disabled",
      ],
      [
        "missing negative auth",
        (document) => {
          document.items.personalTrialReservationExpiryScheduler
            .negativeAuthStatus = 200
        },
        "cloudEvidence:negativeAuthStatus=401",
        "controlled-disabled",
      ],
      [
        "positive sweep too broad",
        (document) => {
          document.items.personalTrialReservationExpiryScheduler
            .controlledPositiveExpiredCount = 2
        },
        "cloudEvidence:controlledPositiveExpiredCount=0_or_1",
        "controlled-disabled",
      ],
      [
        "explicit secret value field",
        (document) => {
          document.items.personalTrialReservationExpiryScheduler.apiKeyValue =
            "short-but-real-secret"
        },
        "cloudEvidence:forbidden_value_fields:$.items.personalTrialReservationExpiryScheduler.apiKeyValue",
        "provisioned-disabled",
      ],
      [
        "undeclared short secret field",
        (document) => {
          document.items.personalTrialReservationExpiryScheduler.secret =
            "short-value"
        },
        "cloudEvidence:unknown_fields:secret",
        "provisioned-disabled",
      ],
      [
        "undeclared API key field",
        (document) => {
          document.items.personalTrialReservationExpiryScheduler.apiKey =
            "84dc7cff-e40a-4b85-8e4e-891d9c16b61b"
        },
        "cloudEvidence:unknown_fields:apiKey",
        "provisioned-disabled",
      ],
    ]

    for (const [name, mutate, blocker, evidenceStage] of invalidCases) {
      const document =
        evidenceStage === "controlled-disabled"
          ? structuredClone(controlledDocument)
          : {
            schemaVersion: 1,
            environment: "production-cn",
            containsValues: false,
            items: {
              personalTrialReservationExpiryScheduler:
                structuredClone(validSchedulerEvidence),
            },
          }
      mutate(document)
      fs.writeFileSync(
        confirmationsPath,
        JSON.stringify(document, null, 2),
      )
      const failed = spawnSync(
        process.execPath,
        [
          "scripts/check-aliyun-runtime-plan.mjs",
          "--plan",
          planPath,
          "--cloud-confirmations",
          confirmationsPath,
          "--require-cloud-evidence",
          "--evidence-stage",
          evidenceStage,
        ],
        {
          cwd: root,
          encoding: "utf8",
        },
      )
      assert.equal(failed.status, 1, name)
      const failedReport = JSON.parse(failed.stdout)
      assert.ok(failedReport.blockers.includes(blocker), name)
    }

    enabledDocument.items.personalTrialReservationExpiryScheduler.enabledAt =
      "2026-07-24T11:59:00.000Z"
    fs.writeFileSync(
      confirmationsPath,
      JSON.stringify(enabledDocument, null, 2),
    )
    const enabledWithoutDeliveryEvidence = spawnSync(
      process.execPath,
      [
        "scripts/check-aliyun-runtime-plan.mjs",
        "--plan",
        planPath,
        "--cloud-confirmations",
        confirmationsPath,
        "--require-cloud-evidence",
        "--evidence-stage",
        "enabled",
      ],
      {
        cwd: root,
        encoding: "utf8",
      },
    )
    assert.equal(enabledWithoutDeliveryEvidence.status, 1)
    assert.ok(
      JSON.parse(enabledWithoutDeliveryEvidence.stdout).blockers.includes(
        "cloudEvidence:timestamp_order=provisioned<controlled<enabled<delivery",
      ),
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test("Aliyun runtime plan checker rejects putting RDS back into the excluded first bridge list", () => {
  const checker = read("scripts", "check-aliyun-runtime-plan.mjs")

  assert.match(checker, /notIncludedInFirstBridge:must_not_exclude_rds/)
  assert.match(checker, /dataLayer\.formalTarget/)
  assert.match(checker, /predeployDependencies:RDS_POSTGRES_MIGRATION/)
  assert.match(checker, /blockingCredentialNames=DATABASE_URL_CN/)
  assert.match(checker, /corepack pnpm aliyun:rds:runtime-smoke:strict/)
})
