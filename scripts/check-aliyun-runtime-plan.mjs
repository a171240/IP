#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_PLAN_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.runtime-plan.json")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(
  BACKEND_ROOT,
  "deploy/aliyun-production-cn.cloud-confirmations.local.json",
)
const VOICE_COACH_TEXT_REPOSITORY_MODE_ENV = "APP_VOICE_COACH_TEXT_REPOSITORY_MODE"
const PRODUCTION_VOICE_COACH_TEXT_REPOSITORY_MODE = "rds_voice_coach_text_session_contract"
const PERSONAL_TRIAL_EXPIRY_SECRET_ENV =
  "PERSONAL_TRIAL_EXPIRY_CRON_SECRET"
const PERSONAL_TRIAL_EXPIRY_CLOUD_CONFIRMATION_KEY =
  "personalTrialReservationExpiryScheduler"
const PERSONAL_TRIAL_EXPIRY_EVENT_BUS_NAME =
  "meiye-huajing-production-cn"
const PERSONAL_TRIAL_EXPIRY_RESOURCE_NAME =
  "personal-trial-reservation-expiry-5m"
const PERSONAL_TRIAL_EXPIRY_CONNECTION_NAME =
  "personal-trial-reservation-expiry-prod-cn"
const PERSONAL_TRIAL_EXPIRY_API_DESTINATION_NAME =
  "personal-trial-reservation-expiry-prod-cn"
const PERSONAL_TRIAL_EXPIRY_TARGET_ID =
  "personal-trial-reservation-expiry-api-destination"
const PERSONAL_TRIAL_EXPIRY_TARGET_URL =
  "https://api-cn.ipgongchang.xin/api/cron/personal-trial-reservations"

const FORBIDDEN_HOSTS = new Set([
  "ip.ipgongchang.xin",
  "ipnrgc.com",
  "www.ipnrgc.com",
])

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /:\/\/[^\s:@]+:[^\s@]+@/,
]
const FORBIDDEN_SECRET_VALUE_FIELDS = new Set([
  "accesskeysecret",
  "apikeyvalue",
  "authorizationvalue",
  "bearertoken",
  "credentialvalue",
  "password",
  "secretvalue",
  "tokenvalue",
])
const PERSONAL_TRIAL_EXPIRY_EVIDENCE_FIELDS = new Set([
  "accountId",
  "apiDestinationMethod",
  "apiDestinationName",
  "apiDestinationUrl",
  "collisionCheckPassed",
  "confirmed",
  "connectionAuthorizationType",
  "connectionHeaderName",
  "connectionName",
  "connectionSecretConfigured",
  "controlledEvidence",
  "controlledPositiveExpiredCount",
  "controlledPositiveStatus",
  "controlledVerifiedAt",
  "cronExpression",
  "deadLetterQueueEnabled",
  "dedicatedSecretDistinctFromSharedCronSecret",
  "deliveryEvidence",
  "enabledAt",
  "errorsTolerance",
  "eventBusName",
  "eventSourceName",
  "lastDeliveryStatus",
  "lastDeliveryVerifiedAt",
  "negativeAuthStatus",
  "provisionedVerifiedAt",
  "provisioningEvidence",
  "pushRetryStrategy",
  "region",
  "ruleName",
  "ruleStatus",
  "saeSecretConfigured",
  "secretEnvName",
  "secretValuesRecorded",
  "targetEndpoint",
  "targetId",
  "targetType",
  "timeZone",
])
const EVIDENCE_STAGES = new Set([
  "provisioned-disabled",
  "controlled-disabled",
  "enabled",
])

function parseArgs(argv) {
  const args = {
    planFile: DEFAULT_PLAN_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    cloudConfirmationsFileProvided: false,
    requireCloudEvidence: false,
    evidenceStage: "provisioned-disabled",
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--plan") {
      args.planFile = resolveValue(argv[++index], "--plan")
      continue
    }
    if (arg === "--cloud-confirmations") {
      args.cloudConfirmationsFile = resolveValue(
        argv[++index],
        "--cloud-confirmations",
      )
      args.cloudConfirmationsFileProvided = true
      continue
    }
    if (arg === "--require-cloud-evidence") {
      args.requireCloudEvidence = true
      continue
    }
    if (arg === "--evidence-stage") {
      args.evidenceStage = resolveEvidenceStage(
        argv[++index],
        "--evidence-stage",
      )
      continue
    }
    if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    }
    throw new Error(`unknown_arg:${arg}`)
  }
  return args
}

function resolveEvidenceStage(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  if (!EVIDENCE_STAGES.has(value)) {
    throw new Error(`invalid_value:${name}:${value}`)
  }
  return value
}

function resolveValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function assertNoSecretLikeValues(value, path = "$", matches = []) {
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) matches.push(path)
    return matches
  }
  if (!value || typeof value !== "object") return matches
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretLikeValues(item, `${path}[${index}]`, matches))
    return matches
  }
  for (const [key, nested] of Object.entries(value)) {
    assertNoSecretLikeValues(nested, `${path}.${key}`, matches)
  }
  return matches
}

function findForbiddenSecretValueFields(value, path = "$", matches = []) {
  if (!value || typeof value !== "object") return matches
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findForbiddenSecretValueFields(item, `${path}[${index}]`, matches))
    return matches
  }
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`
    if (FORBIDDEN_SECRET_VALUE_FIELDS.has(key.toLowerCase())) {
      matches.push(nestedPath)
    }
    findForbiddenSecretValueFields(nested, nestedPath, matches)
  }
  return matches
}

function validatePlan(plan) {
  const blockers = []
  const warnings = []

  if (plan.schemaVersion !== 1) blockers.push("schemaVersion=1")
  if (plan.environment !== "production-cn") blockers.push("environment=production-cn")
  if (plan.containsValues !== false) blockers.push("containsValues=false")

  const target = plan.target || {}
  if (target.provider !== "SAE") blockers.push("target.provider=SAE")
  if (target.region !== "cn-hangzhou") blockers.push("target.region=cn-hangzhou")
  if (target.appName !== "meiye-huajing-app-api-production-cn") blockers.push("target.appName")
  if (target.runtime !== "custom-container") blockers.push("target.runtime=custom-container")
  if (Number(target.containerPort) !== 3000) blockers.push("target.containerPort=3000")
  if (target.healthPath !== "/api/healthz") blockers.push("target.healthPath")
  if (target.strictHealthPath !== "/api/app/health?strict=1") blockers.push("target.strictHealthPath")
  if (target.publicIngress !== true) blockers.push("target.publicIngress=true")

  const scheduledRequests = Array.isArray(plan.scheduledRequests)
    ? plan.scheduledRequests
    : []
  const personalTrialExpiryScheduler = scheduledRequests.find(
    (item) => item.id === "PERSONAL_TRIAL_RESERVATION_EXPIRY",
  )
  const personalTrialExpirySchedulerPrefix =
    "scheduledRequests:PERSONAL_TRIAL_RESERVATION_EXPIRY"
  if (!personalTrialExpiryScheduler) {
    blockers.push(personalTrialExpirySchedulerPrefix)
  } else {
    const topology = personalTrialExpiryScheduler.topology || {}
    const schedule = personalTrialExpiryScheduler.schedule || {}
    const schedulerTarget = personalTrialExpiryScheduler.target || {}
    const authentication = schedulerTarget.authentication || {}
    const rule = personalTrialExpiryScheduler.rule || {}
    const eventTarget = personalTrialExpiryScheduler.eventTarget || {}
    const deadLetterQueue = eventTarget.deadLetterQueue || {}
    const monitoring = personalTrialExpiryScheduler.monitoring || {}
    const rollback = personalTrialExpiryScheduler.rollback || {}
    if (personalTrialExpiryScheduler.provider !== "Aliyun EventBridge") {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:provider=Aliyun EventBridge`)
    }
    if (personalTrialExpiryScheduler.apiVersion !== "2020-04-01") {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:apiVersion=2020-04-01`)
    }
    if (personalTrialExpiryScheduler.region !== "cn-hangzhou") {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:region=cn-hangzhou`)
    }
    if (personalTrialExpiryScheduler.sourceType !== "time-triggered custom event source") {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:sourceType`)
    }
    if (schedule.type !== "cron") {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:schedule.type=cron`)
    }
    if (schedule.cronExpression !== "0 */5 * * * *") {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:cronExpression=0 */5 * * * *`,
      )
    }
    if (schedule.timeZone !== "GMT+8:00") {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:timeZone=GMT+8:00`)
    }
    const requiredTopology = [
      ["eventBusName", PERSONAL_TRIAL_EXPIRY_EVENT_BUS_NAME],
      ["eventSourceName", PERSONAL_TRIAL_EXPIRY_RESOURCE_NAME],
      ["connectionName", PERSONAL_TRIAL_EXPIRY_CONNECTION_NAME],
      ["apiDestinationName", PERSONAL_TRIAL_EXPIRY_API_DESTINATION_NAME],
      ["ruleName", PERSONAL_TRIAL_EXPIRY_RESOURCE_NAME],
    ]
    for (const [field, expected] of requiredTopology) {
      if (topology[field] !== expected) {
        blockers.push(
          `${personalTrialExpirySchedulerPrefix}:${field}=${expected}`,
        )
      }
    }
    if (schedulerTarget.type !== "API destination") {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:target.type=API destination`)
    }
    if (schedulerTarget.network !== "Internet") {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:target.network=Internet`)
    }
    if (schedulerTarget.method !== "GET") {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:target.method=GET`)
    }
    if (
      schedulerTarget.url !==
      PERSONAL_TRIAL_EXPIRY_TARGET_URL
    ) {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:target.url`)
    }
    if (authentication.type !== "API key header") {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:authentication.type`)
    }
    if (authentication.headerName !== "Authorization") {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:authentication.headerName=Authorization`,
      )
    }
    if (authentication.secretName !== PERSONAL_TRIAL_EXPIRY_SECRET_ENV) {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:authentication.secretName=${PERSONAL_TRIAL_EXPIRY_SECRET_ENV}`,
      )
    }
    if (authentication.valueFormat !== "Bearer <secret>") {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:authentication.valueFormat`)
    }
    if (authentication.secretStorage !== "Aliyun EventBridge connection") {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:authentication.secretStorage`)
    }
    if (rule.initialStatus !== "DISABLE") {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:rule.initialStatus=DISABLE`,
      )
    }
    if (
      JSON.stringify(rule.filterPattern || {}) !==
      JSON.stringify({ source: [PERSONAL_TRIAL_EXPIRY_RESOURCE_NAME] })
    ) {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:rule.filterPattern`)
    }
    if (eventTarget.id !== PERSONAL_TRIAL_EXPIRY_TARGET_ID) {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:eventTarget.id=${PERSONAL_TRIAL_EXPIRY_TARGET_ID}`,
      )
    }
    if (eventTarget.type !== "acs.api.destination") {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:eventTarget.type=acs.api.destination`,
      )
    }
    if (
      eventTarget.endpointPattern !==
      `acs:api-destination:cn-hangzhou:<account-id>:name/${PERSONAL_TRIAL_EXPIRY_API_DESTINATION_NAME}`
    ) {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:eventTarget.endpointPattern`,
      )
    }
    if (
      JSON.stringify(eventTarget.paramList || []) !==
      JSON.stringify([{
        resourceKey: "Name",
        form: "CONSTANT",
        value: PERSONAL_TRIAL_EXPIRY_API_DESTINATION_NAME,
      }])
    ) {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:eventTarget.paramList`)
    }
    if (eventTarget.pushRetryStrategy !== "BACKOFF_RETRY") {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:eventTarget.pushRetryStrategy=BACKOFF_RETRY`,
      )
    }
    if (eventTarget.errorsTolerance !== "ALL") {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:eventTarget.errorsTolerance=ALL`,
      )
    }
    if (deadLetterQueue.enabled !== false) {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:eventTarget.deadLetterQueue.enabled=false`,
      )
    }
    if (
      personalTrialExpiryScheduler.collisionPolicy !==
      "stop_on_existing_name_with_nonmatching_configuration"
    ) {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:collisionPolicy=stop_on_existing_name_with_nonmatching_configuration`,
      )
    }
    if (
      JSON.stringify(personalTrialExpiryScheduler.creationOrder || []) !==
      JSON.stringify([
        "eventBus",
        "eventSource",
        "connection",
        "apiDestination",
        "rule",
        "eventTarget",
      ])
    ) {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:creationOrder`)
    }
    for (const [field, expected] of [
      ["eventTraceRequired", true],
      ["httpStatus200Required", true],
      ["failedDeliveryMonitoringRequired", true],
      ["noNewPaidDeadLetterQueue", true],
    ]) {
      if (monitoring[field] !== expected) {
        blockers.push(
          `${personalTrialExpirySchedulerPrefix}:monitoring.${field}=true`,
        )
      }
    }
    if (
      rollback.disableRule !== true ||
      rollback.deleteExistingResourcesAutomatically !== false
    ) {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:rollback`)
    }
    if (
      personalTrialExpiryScheduler.cloudConfirmationKey !==
      PERSONAL_TRIAL_EXPIRY_CLOUD_CONFIRMATION_KEY
    ) {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:cloudConfirmationKey=${PERSONAL_TRIAL_EXPIRY_CLOUD_CONFIRMATION_KEY}`,
      )
    }
    if (
      personalTrialExpiryScheduler.strictCheckCommand !==
      "corepack pnpm aliyun:runtime:plan:strict"
    ) {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:strictCheckCommand`)
    }
    if (
      JSON.stringify(personalTrialExpiryScheduler.verificationGates || {}) !==
      JSON.stringify({
        beforeSaeDeploy:
          "corepack pnpm aliyun:runtime:plan:strict",
        afterSaeDeployBeforeRuleEnable:
          "corepack pnpm aliyun:runtime:plan:controlled:strict",
        afterRuleEnable:
          "corepack pnpm aliyun:runtime:plan:enabled:strict",
      })
    ) {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:verificationGates`,
      )
    }
    if (personalTrialExpiryScheduler.requiredBeforePersonalTrialPublicEnable !== true) {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:requiredBeforePersonalTrialPublicEnable=true`,
      )
    }
    if (personalTrialExpiryScheduler.requiresSeparateAuthorization !== true) {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:requiresSeparateAuthorization=true`,
      )
    }
    if (
      Object.hasOwn(personalTrialExpiryScheduler, "provisioned") ||
      Object.hasOwn(personalTrialExpiryScheduler, "verificationStatus")
    ) {
      blockers.push(
        `${personalTrialExpirySchedulerPrefix}:live_state_forbidden_in_runtime_plan`,
      )
    }
    if (personalTrialExpiryScheduler.containsValues !== false) {
      blockers.push(`${personalTrialExpirySchedulerPrefix}:containsValues=false`)
    }
  }

  const image = plan.image || {}
  if (image.provider !== "Aliyun ACR") blockers.push("image.provider=Aliyun ACR")
  if (image.localImage !== "meiye-huajing-app-api:production-cn") blockers.push("image.localImage")
  if (image.repository !== "meiye-huajing-app-api") blockers.push("image.repository")
  if (image.tag !== "production-cn") blockers.push("image.tag")
  if (!String(image.remoteImagePattern || "").includes("meiye-huajing-app-api:production-cn")) {
    blockers.push("image.remoteImagePattern")
  }
  if (image.publishPlanFile !== "deploy/aliyun-production-cn.image-publish.local.json") {
    blockers.push("image.publishPlanFile")
  }
  if (image.strictCheckCommand !== "corepack pnpm aliyun:image:plan:strict") {
    blockers.push("image.strictCheckCommand")
  }

  const domains = plan.domains || {}
  if (domains.apiHost !== "api-cn.ipgongchang.xin") blockers.push("domains.apiHost")
  if (domains.assetHost !== "assets-cn.ipgongchang.xin") blockers.push("domains.assetHost")
  for (const host of [domains.apiHost, domains.assetHost]) {
    const normalized = String(host || "")
    if (FORBIDDEN_HOSTS.has(normalized)) blockers.push(`forbidden_host:${normalized}`)
    if (normalized.endsWith(".vercel.app")) blockers.push(`forbidden_vercel_host:${normalized}`)
  }
  if (domains.apiHealthUrl !== "https://api-cn.ipgongchang.xin/api/healthz") {
    blockers.push("domains.apiHealthUrl")
  }
  if (domains.strictAppHealthUrl !== "https://api-cn.ipgongchang.xin/api/app/health?strict=1") {
    blockers.push("domains.strictAppHealthUrl")
  }
  if (domains.strictCheckCommand !== "corepack pnpm aliyun:domain:strict") {
    blockers.push("domains.strictCheckCommand")
  }

  const environmentImport = plan.environmentImport || {}
  if (environmentImport.sourcePlanCommand !== "corepack pnpm aliyun:env:plan") {
    blockers.push("environmentImport.sourcePlanCommand")
  }
  if (!String(environmentImport.target || "").includes("SAE")) blockers.push("environmentImport.target")
  if (!String(environmentImport.secretPolicy || "").includes("Do not bake secrets")) {
    blockers.push("environmentImport.secretPolicy")
  }
  if (environmentImport.strictCheckCommand !== "corepack pnpm aliyun:readiness:cloud-ready") {
    blockers.push("environmentImport.strictCheckCommand")
  }

  const dataLayer = plan.dataLayer || {}
  if (dataLayer.formalTarget !== "Aliyun RDS PostgreSQL") blockers.push("dataLayer.formalTarget")
  if (dataLayer.connectionEnvName !== "DATABASE_URL_CN") blockers.push("dataLayer.connectionEnvName=DATABASE_URL_CN")
  if (dataLayer.voiceCoachTextRepositoryModeEnvName !== VOICE_COACH_TEXT_REPOSITORY_MODE_ENV) {
    blockers.push(`dataLayer.voiceCoachTextRepositoryModeEnvName=${VOICE_COACH_TEXT_REPOSITORY_MODE_ENV}`)
  }
  if (dataLayer.voiceCoachTextRepositoryModeRequiredValue !== PRODUCTION_VOICE_COACH_TEXT_REPOSITORY_MODE) {
    blockers.push(`dataLayer.voiceCoachTextRepositoryModeRequiredValue=${PRODUCTION_VOICE_COACH_TEXT_REPOSITORY_MODE}`)
  }
  if (dataLayer.voiceCoachTextRepositoryFailClosed !== true) {
    blockers.push("dataLayer.voiceCoachTextRepositoryFailClosed=true")
  }
  if (!String(dataLayer.connectionSecretTarget || "").includes("Aliyun KMS")) {
    blockers.push("dataLayer.connectionSecretTarget")
  }
  if (dataLayer.migrationEvidenceCommand !== "corepack pnpm aliyun:rds:migration:evidence:strict") {
    blockers.push("dataLayer.migrationEvidenceCommand")
  }
  if (dataLayer.runtimeSmokeCommand !== "corepack pnpm aliyun:rds:runtime-smoke:strict") {
    blockers.push("dataLayer.runtimeSmokeCommand")
  }
  if (dataLayer.requiredBeforeRuntimeReady !== true) blockers.push("dataLayer.requiredBeforeRuntimeReady=true")

  const dependencies = Array.isArray(plan.predeployDependencies) ? plan.predeployDependencies : []
  const dependencyById = new Map(dependencies.map((item) => [item.id, item]))
  const requiredDependencyChecks = [
    ["RDS_POSTGRES_MIGRATION", "P11_ALIYUN_RDS_DATA_MIGRATION", "corepack pnpm aliyun:rds:migration:evidence:strict"],
    ["ACR_IMAGE_DIGEST_AND_PULL", "P04_ACR_IMAGE_AND_PULL", "corepack pnpm aliyun:image:plan:strict"],
    ["OSS_RUNTIME_ACCESS", "P05_OSS_RAM_STS", "corepack pnpm aliyun:cloud:confirmations:backend:strict"],
    ["BACKEND_ENV_IMPORT", "P06_ENV_IMPORT", "corepack pnpm aliyun:sensitive:blockers:backend"],
  ]
  for (const [id, authorizationPacket, evidenceCommand] of requiredDependencyChecks) {
    const item = dependencyById.get(id)
    if (!item) {
      blockers.push(`predeployDependencies:${id}`)
      continue
    }
    if (item.requiredBeforeRuntimeReady !== true) blockers.push(`predeployDependencies:${id}:requiredBeforeRuntimeReady=true`)
    if (item.authorizationPacket !== authorizationPacket) {
      blockers.push(`predeployDependencies:${id}:authorizationPacket=${authorizationPacket}`)
    }
    if (item.evidenceCommand !== evidenceCommand) blockers.push(`predeployDependencies:${id}:evidenceCommand`)
  }
  const rdsDependency = dependencyById.get("RDS_POSTGRES_MIGRATION") || {}
  if (!Array.isArray(rdsDependency.blockingCredentialNames) ||
    !rdsDependency.blockingCredentialNames.includes("DATABASE_URL_CN")) {
    blockers.push("predeployDependencies:RDS_POSTGRES_MIGRATION:blockingCredentialNames=DATABASE_URL_CN")
  }
  if (!Array.isArray(rdsDependency.supportingEvidenceCommands) ||
    !rdsDependency.supportingEvidenceCommands.includes("corepack pnpm aliyun:rds:runtime-smoke:strict")) {
    blockers.push("predeployDependencies:RDS_POSTGRES_MIGRATION:supportingEvidenceCommands")
  }

  const observability = plan.observability || {}
  if (observability.slsRequired !== true) blockers.push("observability.slsRequired")
  if (observability.healthAlertRequired !== true) blockers.push("observability.healthAlertRequired")
  if (observability.serverErrorAlertRequired !== true) blockers.push("observability.serverErrorAlertRequired")
  if (observability.cloudConfirmationKey !== "slsAlerts") blockers.push("observability.cloudConfirmationKey")

  const confirmations = plan.confirmations || {}
  if (confirmations.cloudConfirmationsFile !== "deploy/aliyun-production-cn.cloud-confirmations.local.json") {
    blockers.push("confirmations.cloudConfirmationsFile")
  }
  if (confirmations.strictCheckCommand !== "corepack pnpm aliyun:cloud:confirmations:strict") {
    blockers.push("confirmations.strictCheckCommand")
  }

  const notIncluded = Array.isArray(plan.notIncludedInFirstBridge) ? plan.notIncludedInFirstBridge : []
  if (notIncluded.some((item) => /RDS|DATABASE_URL_CN|PostgreSQL/i.test(String(item)))) {
    blockers.push("notIncludedInFirstBridge:must_not_exclude_rds")
  }
  for (const requiredText of ["Redis/Tair", "Mini-program", "Payment"]) {
    if (!notIncluded.some((item) => String(item).includes(requiredText))) {
      blockers.push(`notIncludedInFirstBridge:${requiredText}`)
    }
  }

  const security = plan.security || {}
  if (security.containsSecrets !== false) blockers.push("security.containsSecrets=false")
  if (!String(security.secretPolicy || "").includes("non-secret runtime target plan")) {
    blockers.push("security.secretPolicy")
  }

  const secretLikePaths = assertNoSecretLikeValues(plan)
  if (secretLikePaths.length) blockers.push(`contains_secret_like_values:${secretLikePaths.join(",")}`)

  if (target.provider === "ECS") warnings.push("ecs_target_requires_manual_nginx_pm2_ops")

  return {
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
  }
}

function validateCloudEvidence(plan, args) {
  const shouldCheck =
    args.requireCloudEvidence || args.cloudConfirmationsFileProvided
  const evidenceStage = args.evidenceStage
  const requiresControlledHttp =
    evidenceStage === "controlled-disabled" ||
    evidenceStage === "enabled"
  const requiresEnabledDelivery = evidenceStage === "enabled"
  const expectedRuleStatus = requiresEnabledDelivery
    ? "ENABLE"
    : "DISABLE"
  if (!shouldCheck) {
    return {
      checked: false,
      ready: false,
      evidenceStage,
      ruleStatus: "",
      lastDeliveryStatus: "",
      blockers: [],
    }
  }

  const blockers = []
  if (!existsSync(args.cloudConfirmationsFile)) {
    return {
      checked: true,
      ready: false,
      evidenceStage,
      ruleStatus: "",
      lastDeliveryStatus: "",
      blockers: ["cloudEvidence:file_missing"],
    }
  }

  const confirmations = readJson(args.cloudConfirmationsFile)
  if (confirmations.schemaVersion !== 1) {
    blockers.push("cloudEvidence:schemaVersion=1")
  }
  if (confirmations.environment !== "production-cn") {
    blockers.push("cloudEvidence:environment=production-cn")
  }
  if (confirmations.containsValues !== false) {
    blockers.push("cloudEvidence:containsValues=false")
  }
  const secretLikePaths = assertNoSecretLikeValues(confirmations)
  if (secretLikePaths.length) {
    blockers.push(
      `cloudEvidence:contains_secret_like_values:${secretLikePaths.join(",")}`,
    )
  }
  const forbiddenValueFields =
    findForbiddenSecretValueFields(confirmations)
  if (forbiddenValueFields.length) {
    blockers.push(
      `cloudEvidence:forbidden_value_fields:${forbiddenValueFields.join(",")}`,
    )
  }

  const item =
    confirmations.items?.[PERSONAL_TRIAL_EXPIRY_CLOUD_CONFIRMATION_KEY]
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    blockers.push(
      `cloudEvidence:${PERSONAL_TRIAL_EXPIRY_CLOUD_CONFIRMATION_KEY}`,
    )
    return {
      checked: true,
      ready: false,
      evidenceStage,
      ruleStatus: "",
      lastDeliveryStatus: "",
      blockers: [...new Set(blockers)],
    }
  }
  const unknownFields = Object.keys(item).filter(
    (field) => !PERSONAL_TRIAL_EXPIRY_EVIDENCE_FIELDS.has(field),
  )
  if (unknownFields.length) {
    blockers.push(`cloudEvidence:unknown_fields:${unknownFields.join(",")}`)
  }

  const scheduler = Array.isArray(plan.scheduledRequests)
    ? plan.scheduledRequests.find(
      (candidate) =>
        candidate.id === "PERSONAL_TRIAL_RESERVATION_EXPIRY",
    )
    : undefined
  const topology = scheduler?.topology || {}
  const eventTarget = scheduler?.eventTarget || {}
  const expectedTargetEndpoint =
    `acs:api-destination:cn-hangzhou:${item.accountId}:name/${PERSONAL_TRIAL_EXPIRY_API_DESTINATION_NAME}`

  if (item.confirmed !== true) blockers.push("cloudEvidence:confirmed=true")
  if (!/^\d{12,20}$/.test(String(item.accountId || ""))) {
    blockers.push("cloudEvidence:accountId")
  }
  for (const [field, expected] of [
    ["region", "cn-hangzhou"],
    ["eventBusName", topology.eventBusName],
    ["eventSourceName", topology.eventSourceName],
    ["connectionName", topology.connectionName],
    ["apiDestinationName", topology.apiDestinationName],
    ["ruleName", topology.ruleName],
    ["targetId", eventTarget.id],
    ["targetType", eventTarget.type],
    ["targetEndpoint", expectedTargetEndpoint],
    ["cronExpression", scheduler?.schedule?.cronExpression],
    ["timeZone", scheduler?.schedule?.timeZone],
    ["apiDestinationUrl", scheduler?.target?.url],
    ["apiDestinationMethod", scheduler?.target?.method],
    ["connectionAuthorizationType", "API_KEY_AUTH"],
    ["connectionHeaderName", scheduler?.target?.authentication?.headerName],
    ["secretEnvName", PERSONAL_TRIAL_EXPIRY_SECRET_ENV],
    ["pushRetryStrategy", eventTarget.pushRetryStrategy],
    ["errorsTolerance", eventTarget.errorsTolerance],
  ]) {
    if (item[field] !== expected) {
      blockers.push(`cloudEvidence:${field}=${expected}`)
    }
  }
  for (const field of [
    "saeSecretConfigured",
    "connectionSecretConfigured",
    "collisionCheckPassed",
  ]) {
    if (item[field] !== true) {
      blockers.push(`cloudEvidence:${field}=true`)
    }
  }
  if (item.secretValuesRecorded !== false) {
    blockers.push("cloudEvidence:secretValuesRecorded=false")
  }
  if (item.dedicatedSecretDistinctFromSharedCronSecret !== true) {
    blockers.push(
      "cloudEvidence:dedicatedSecretDistinctFromSharedCronSecret=true",
    )
  }
  if (item.deadLetterQueueEnabled !== false) {
    blockers.push("cloudEvidence:deadLetterQueueEnabled=false")
  }
  if (item.ruleStatus !== expectedRuleStatus) {
    blockers.push(
      `cloudEvidence:ruleStatus=${expectedRuleStatus}`,
    )
  }
  if (!isCanonicalTimestamp(item.provisionedVerifiedAt)) {
    blockers.push("cloudEvidence:provisionedVerifiedAt")
  }
  if (!isEvidenceHandle(item.provisioningEvidence)) {
    blockers.push("cloudEvidence:provisioningEvidence")
  }
  if (requiresControlledHttp) {
    if (Number(item.negativeAuthStatus) !== 401) {
      blockers.push("cloudEvidence:negativeAuthStatus=401")
    }
    if (Number(item.controlledPositiveStatus) !== 200) {
      blockers.push("cloudEvidence:controlledPositiveStatus=200")
    }
    if (
      ![0, 1].includes(Number(item.controlledPositiveExpiredCount)) ||
      !Number.isInteger(Number(item.controlledPositiveExpiredCount))
    ) {
      blockers.push("cloudEvidence:controlledPositiveExpiredCount=0_or_1")
    }
    if (!isCanonicalTimestamp(item.controlledVerifiedAt)) {
      blockers.push("cloudEvidence:controlledVerifiedAt")
    }
    if (!isEvidenceHandle(item.controlledEvidence)) {
      blockers.push("cloudEvidence:controlledEvidence")
    }
    if (
      !timestampsStrictlyIncrease([
        item.provisionedVerifiedAt,
        item.controlledVerifiedAt,
      ])
    ) {
      blockers.push(
        "cloudEvidence:timestamp_order=provisioned<controlled",
      )
    }
  }
  if (requiresEnabledDelivery) {
    if (!isCanonicalTimestamp(item.enabledAt)) {
      blockers.push("cloudEvidence:enabledAt")
    }
    if (item.lastDeliveryStatus !== "Success") {
      blockers.push("cloudEvidence:lastDeliveryStatus=Success")
    }
    if (!isCanonicalTimestamp(item.lastDeliveryVerifiedAt)) {
      blockers.push("cloudEvidence:lastDeliveryVerifiedAt")
    }
    if (!isEvidenceHandle(item.deliveryEvidence)) {
      blockers.push("cloudEvidence:deliveryEvidence")
    }
    if (
      !timestampsStrictlyIncrease([
        item.provisionedVerifiedAt,
        item.controlledVerifiedAt,
        item.enabledAt,
        item.lastDeliveryVerifiedAt,
      ])
    ) {
      blockers.push(
        "cloudEvidence:timestamp_order=provisioned<controlled<enabled<delivery",
      )
    }
  }

  return {
    checked: true,
    ready: blockers.length === 0,
    evidenceStage,
    ruleStatus: String(item.ruleStatus || ""),
    lastDeliveryStatus: String(item.lastDeliveryStatus || ""),
    blockers: [...new Set(blockers)],
  }
}

function isCanonicalTimestamp(value) {
  const text = String(value || "")
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text) &&
    Number.isFinite(Date.parse(text))
  )
}

function timestampsStrictlyIncrease(values) {
  if (!values.every(isCanonicalTimestamp)) return false
  const times = values.map((value) => Date.parse(value))
  return times.every(
    (time, index) => index === 0 || time > times[index - 1],
  )
}

function isEvidenceHandle(value) {
  const text = String(value || "").trim()
  return (
    text.length >= 16 &&
    !/^(?:TODO|TBD|PENDING|UNKNOWN|NONE)(?:_|$)/i.test(text)
  )
}

function main() {
  const args = parseArgs(process.argv)
  if (!existsSync(args.planFile)) throw new Error(`runtime_plan_not_found:${args.planFile}`)
  const plan = readJson(args.planFile)
  const planValidation = validatePlan(plan)
  const cloudEvidence = validateCloudEvidence(plan, args)
  const blockers = [
    ...planValidation.blockers,
    ...cloudEvidence.blockers,
  ]
  const personalTrialExpiryScheduler = Array.isArray(plan.scheduledRequests)
    ? plan.scheduledRequests.find(
      (item) => item.id === "PERSONAL_TRIAL_RESERVATION_EXPIRY",
    )
    : undefined
  console.log(JSON.stringify({
    ok: blockers.length === 0,
    planFile: args.planFile,
    containsValues: false,
    environment: plan.environment || "",
    provider: plan.target?.provider || "",
    region: plan.target?.region || "",
    appName: plan.target?.appName || "",
    runtime: plan.target?.runtime || "",
    containerPort: plan.target?.containerPort || null,
    healthPath: plan.target?.healthPath || "",
    apiHost: plan.domains?.apiHost || "",
    assetHost: plan.domains?.assetHost || "",
    imageProvider: plan.image?.provider || "",
    imageRepository: plan.image?.repository || "",
    imageTag: plan.image?.tag || "",
    dataLayerTarget: plan.dataLayer?.formalTarget || "",
    dataLayerConnectionEnvName: plan.dataLayer?.connectionEnvName || "",
    voiceCoachTextRepositoryModeEnvName:
      plan.dataLayer?.voiceCoachTextRepositoryModeEnvName || "",
    voiceCoachTextRepositoryModeRequiredValue:
      plan.dataLayer?.voiceCoachTextRepositoryModeRequiredValue || "",
    voiceCoachTextRepositoryFailClosed:
      plan.dataLayer?.voiceCoachTextRepositoryFailClosed === true,
    predeployDependencyIds: Array.isArray(plan.predeployDependencies)
      ? plan.predeployDependencies.map((item) => item.id)
      : [],
    personalTrialReservationExpiryScheduler: {
      provider: personalTrialExpiryScheduler?.provider || "",
      region: personalTrialExpiryScheduler?.region || "",
      eventBusName:
        personalTrialExpiryScheduler?.topology?.eventBusName || "",
      eventSourceName:
        personalTrialExpiryScheduler?.topology?.eventSourceName || "",
      connectionName:
        personalTrialExpiryScheduler?.topology?.connectionName || "",
      apiDestinationName:
        personalTrialExpiryScheduler?.topology?.apiDestinationName || "",
      ruleName:
        personalTrialExpiryScheduler?.topology?.ruleName || "",
      cronExpression:
        personalTrialExpiryScheduler?.schedule?.cronExpression || "",
      timeZone:
        personalTrialExpiryScheduler?.schedule?.timeZone || "",
      targetType: personalTrialExpiryScheduler?.target?.type || "",
      targetMethod: personalTrialExpiryScheduler?.target?.method || "",
      targetUrl: personalTrialExpiryScheduler?.target?.url || "",
      eventTargetId:
        personalTrialExpiryScheduler?.eventTarget?.id || "",
      eventTargetType:
        personalTrialExpiryScheduler?.eventTarget?.type || "",
      eventTargetEndpointPattern:
        personalTrialExpiryScheduler?.eventTarget?.endpointPattern || "",
      pushRetryStrategy:
        personalTrialExpiryScheduler?.eventTarget?.pushRetryStrategy || "",
      errorsTolerance:
        personalTrialExpiryScheduler?.eventTarget?.errorsTolerance || "",
      deadLetterQueueEnabled:
        personalTrialExpiryScheduler?.eventTarget?.deadLetterQueue?.enabled ===
        true,
      initialRuleStatus:
        personalTrialExpiryScheduler?.rule?.initialStatus || "",
      authenticationHeaderName:
        personalTrialExpiryScheduler?.target?.authentication?.headerName || "",
      authenticationSecretName:
        personalTrialExpiryScheduler?.target?.authentication?.secretName || "",
      collisionPolicy:
        personalTrialExpiryScheduler?.collisionPolicy || "",
      requiredBeforePersonalTrialPublicEnable:
        personalTrialExpiryScheduler?.requiredBeforePersonalTrialPublicEnable ===
        true,
      cloudConfirmationKey:
        personalTrialExpiryScheduler?.cloudConfirmationKey || "",
    },
    cloudEvidence: {
      checked: cloudEvidence.checked,
      ready: cloudEvidence.ready,
      evidenceStage: cloudEvidence.evidenceStage,
      ruleStatus: cloudEvidence.ruleStatus,
      lastDeliveryStatus: cloudEvidence.lastDeliveryStatus,
    },
    blockers: [...new Set(blockers)],
    warnings: planValidation.warnings,
    nextActions: [
      "按 runtime plan 在阿里云 SAE 创建 production-cn 自定义容器应用，区域 cn-hangzhou，端口 3000。",
      "先完成 ACR image-publish.local.json 非密钥证据，再把 SAE runtime 指向远端镜像。",
      "在独立授权后配置阿里云 EventBridge 每 5 分钟调用 personal-trial reservation expiry API destination，并验证鉴权与执行记录。",
      "运行 corepack pnpm aliyun:cloud:confirmations:strict 和 corepack pnpm aliyun:readiness:cloud-ready 后再部署。",
    ],
  }, null, 2))
  if (blockers.length) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-aliyun-runtime-plan.mjs [--plan deploy/aliyun-production-cn.runtime-plan.json] [--cloud-confirmations deploy/aliyun-production-cn.cloud-confirmations.local.json] [--require-cloud-evidence] [--evidence-stage provisioned-disabled|controlled-disabled|enabled]",
    "",
    "Validates the non-secret Aliyun production-cn SAE runtime target plan.",
    "It checks region, app name, container port, health paths, domains, image references, scheduled requests, secret-like values, and optional strict cloud evidence.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
