#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_POLICY_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.oss-ram-policy.json")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const OSS_SOURCE_FILE = resolve(BACKEND_ROOT, "lib/aliyun-rds/service-record-oss.server.ts")
const ASR_SOURCE_FILE = resolve(BACKEND_ROOT, "lib/aliyun-rds/service-record-asr.server.ts")
const PROCESSING_SOURCE_FILE = resolve(BACKEND_ROOT, "lib/aliyun-rds/repositories/service-record-processing.server.ts")
const OSS_UPLOAD_ROUTE_FILE = resolve(BACKEND_ROOT, "app/api/app/service-records/sessions/[sessionId]/oss-upload/route.ts")
const OSS_SEGMENT_ROUTE_FILE = resolve(BACKEND_ROOT, "app/api/app/service-records/sessions/[sessionId]/segments/oss/route.ts")

const EXPECTED_BUCKET = "meiye-huajing-service-records-production-cn"
const EXPECTED_REGION = "cn-hangzhou"
const EXPECTED_OSS_REGION_ENV_VALUE = "oss-cn-hangzhou"
const EXPECTED_PREFIX = "service-records/production-cn"
const CODE_DEFAULT_PREFIX = "service-records"
const EXPECTED_RESOURCE_SCOPE = `acs:oss:*:*:${EXPECTED_BUCKET}/${EXPECTED_PREFIX}/*`
const EXPECTED_POLICY_ACTIONS = Object.freeze(["oss:GetObject", "oss:PutObject", "oss:PostObject"])
const EXPECTED_SECRET_ENV_NAMES = Object.freeze([
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_SECURITY_TOKEN",
])
const REQUIRED_COMMON_RUNTIME_ENV_NAMES = Object.freeze([
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_REGION",
  "SERVICE_RECORD_OSS_PREFIX",
])
const REQUIRED_RUNTIME_ROLE_ENV_NAMES = Object.freeze([
  "ALIBABA_CLOUD_ROLE_ARN",
  "ALIBABA_CLOUD_OIDC_PROVIDER_ARN",
  "ALIBABA_CLOUD_OIDC_TOKEN_FILE",
])
const OPTIONAL_METADATA_RUNTIME_ROLE_ENV_NAMES = Object.freeze([
  "ALIYUN_OSS_RAM_ROLE_NAME",
  "SERVICE_RECORD_OSS_RAM_ROLE_NAME",
  "ALIBABA_CLOUD_ECS_METADATA",
])
const REQUIRED_FALLBACK_SECRET_ENV_NAMES = Object.freeze([
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_SECURITY_TOKEN",
])
const FORBIDDEN_POLICY_ACTIONS = Object.freeze([
  "oss:*",
  "oss:DeleteObject",
  "oss:ListObjects",
  "oss:ListBuckets",
  "oss:PutBucketAcl",
  "oss:PutBucketPolicy",
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
  /(password|passwd|pwd|token|secret|access[_-]?key)\s*[:=]\s*[^,\s]{8,}/i,
]

function parseArgs(argv) {
  const args = {
    policyFile: DEFAULT_POLICY_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    allowIncomplete: false,
    outPath: "",
    markdownPath: "",
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--policy") {
      args.policyFile = resolveValue(argv[++index], "--policy")
      continue
    }
    if (arg === "--cloud-confirmations") {
      args.cloudConfirmationsFile = resolveValue(argv[++index], "--cloud-confirmations")
      continue
    }
    if (arg === "--allow-incomplete") {
      args.allowIncomplete = true
      continue
    }
    if (arg === "--out") {
      args.outPath = resolveValue(argv[++index], "--out")
      continue
    }
    if (arg === "--markdown") {
      args.markdownPath = resolveValue(argv[++index], "--markdown")
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

function resolveValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function readText(filePath) {
  return readFileSync(filePath, "utf8")
}

function text(value) {
  return String(value || "").trim()
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function findSecretLikeValues(value, path = "$", matches = []) {
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) matches.push(path)
    return matches
  }
  if (!value || typeof value !== "object") return matches
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSecretLikeValues(item, `${path}[${index}]`, matches))
    return matches
  }
  for (const [key, nested] of Object.entries(value)) findSecretLikeValues(nested, `${path}.${key}`, matches)
  return matches
}

function validatePolicy(policyFile) {
  if (!existsSync(policyFile)) {
    return {
      file: policyFile,
      exists: false,
      ready: false,
      blockers: ["policy_file_missing"],
      warnings: [],
      allowedActions: [],
      resourceScopes: [],
      requiredActionsCovered: false,
      prefixScoped: false,
      forbiddenActionsPresent: [],
    }
  }

  const policy = readJson(policyFile)
  const statements = Array.isArray(policy.Statement) ? policy.Statement : []
  const actions = unique(statements.flatMap((statement) => Array.isArray(statement.Action) ? statement.Action : [statement.Action]).map(text))
  const resources = unique(statements.flatMap((statement) => Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource]).map(text))
  const blockers = []
  const warnings = []
  const forbiddenActionsPresent = actions.filter((action) => FORBIDDEN_POLICY_ACTIONS.includes(action))
  const missingActions = EXPECTED_POLICY_ACTIONS.filter((action) => !actions.includes(action))
  const extraActions = actions.filter((action) => !EXPECTED_POLICY_ACTIONS.includes(action))
  const effects = unique(statements.map((statement) => text(statement.Effect)))
  const secretLikePaths = findSecretLikeValues(policy)

  if (policy.Version !== "1") blockers.push("Version=1")
  if (!statements.length) blockers.push("Statement_present")
  if (effects.some((effect) => effect !== "Allow")) blockers.push("Effect=Allow_only")
  if (missingActions.length) blockers.push(`missing_actions:${missingActions.join(",")}`)
  if (forbiddenActionsPresent.length) blockers.push(`forbidden_actions:${forbiddenActionsPresent.join(",")}`)
  if (extraActions.length) warnings.push(`extra_actions:${extraActions.join(",")}`)
  if (!resources.includes(EXPECTED_RESOURCE_SCOPE)) blockers.push(`resource_scope=${EXPECTED_RESOURCE_SCOPE}`)
  if (resources.some((resource) => /\*$/.test(resource) && !resource.endsWith(`${EXPECTED_PREFIX}/*`))) {
    blockers.push("resource_scope_too_broad")
  }
  if (secretLikePaths.length) blockers.push(`contains_secret_like_values:${secretLikePaths.join(",")}`)

  return {
    file: policyFile,
    exists: true,
    ready: blockers.length === 0,
    blockers: unique(blockers),
    warnings: unique(warnings),
    allowedActions: sorted(actions),
    expectedActions: [...EXPECTED_POLICY_ACTIONS],
    missingActions,
    forbiddenActionsPresent,
    resourceScopes: resources,
    expectedResourceScope: EXPECTED_RESOURCE_SCOPE,
    requiredActionsCovered: missingActions.length === 0,
    prefixScoped: resources.includes(EXPECTED_RESOURCE_SCOPE),
  }
}

function validateCodeContract() {
  const sourceFiles = [
    OSS_SOURCE_FILE,
    ASR_SOURCE_FILE,
    PROCESSING_SOURCE_FILE,
    OSS_UPLOAD_ROUTE_FILE,
    OSS_SEGMENT_ROUTE_FILE,
  ]
  const fileTexts = sourceFiles.map((file) => ({ file, text: existsSync(file) ? readText(file) : "" }))
  const allText = fileTexts.map((item) => item.text).join("\n")
  const blockers = []
  const warnings = []

  for (const file of sourceFiles) {
    if (!existsSync(file)) blockers.push(`source_missing:${relativeToRoot(file)}`)
  }
  if (!/createAliyunRdsServiceRecordOssPostPolicy/.test(allText)) blockers.push("post_policy_builder_missing")
  if (!/createAliyunRdsServiceRecordOssSignedGetUrl/.test(allText)) blockers.push("signed_get_builder_missing")
  if (!/uploadAliyunRdsServiceRecordOssObject/.test(allText)) blockers.push("server_put_upload_helper_missing")
  if (!/method:\s*"POST"/.test(allText)) blockers.push("client_post_upload_route_missing")
  if (!/submitAliyunRdsBailianAsrTask/.test(allText)) warnings.push("asr_submission_reference_missing")
  for (const envName of [...REQUIRED_COMMON_RUNTIME_ENV_NAMES, ...REQUIRED_FALLBACK_SECRET_ENV_NAMES]) {
    if (!allText.includes(envName)) blockers.push(`runtime_env_reference_missing:${envName}`)
  }
  for (const envName of REQUIRED_RUNTIME_ROLE_ENV_NAMES) {
    if (!allText.includes(envName)) blockers.push(`runtime_role_env_reference_missing:${envName}`)
  }
  if (!/AssumeRoleWithOIDC/.test(allText)) blockers.push("runtime_role_rrsa_oidc_assume_missing")
  if (!/source:\s*"oidc"/.test(allText)) blockers.push("runtime_role_rrsa_oidc_credential_source_missing")
  if (!allText.includes("100.100.100.200/latest")) blockers.push("runtime_role_metadata_endpoint_missing")
  if (!/fetchAliyunMetadataToken/.test(allText)) blockers.push("runtime_role_imdsv2_token_missing")
  if (!/ALIYUN_OSS_METADATA_ALLOW_IMDS_V1/.test(allText)) blockers.push("runtime_role_imdsv1_explicit_opt_in_missing")
  if (!/source:\s*"metadata"/.test(allText)) blockers.push("runtime_role_metadata_credential_source_missing")
  if (!allText.includes(`|| "${CODE_DEFAULT_PREFIX}"`)) {
    blockers.push(`code_default_prefix=${CODE_DEFAULT_PREFIX}`)
  }

  return {
    ready: blockers.length === 0,
    blockers: unique(blockers),
    warnings: unique(warnings),
    sourceFiles: sourceFiles.map(relativeToRoot),
    requiredCommonRuntimeEnvNames: [...REQUIRED_COMMON_RUNTIME_ENV_NAMES],
    requiredRuntimeRoleEnvNames: [...REQUIRED_RUNTIME_ROLE_ENV_NAMES],
    optionalMetadataRuntimeRoleEnvNames: [...OPTIONAL_METADATA_RUNTIME_ROLE_ENV_NAMES],
    fallbackSecretEnvNames: [...REQUIRED_FALLBACK_SECRET_ENV_NAMES],
    runtimeRoleCredentialSupported: !blockers.some((item) => item.startsWith("runtime_role_")),
    credentialModesSupported: [
      "sae_rrsa_oidc",
      "ecs_ram_role_metadata",
      "sts_assume_role_secret_env",
      "least_privilege_ram_user_secret_env",
    ],
    codeDefaultPrefix: CODE_DEFAULT_PREFIX,
    expectedRuntimePrefix: EXPECTED_PREFIX,
    prefixRequiresRuntimeEnv: CODE_DEFAULT_PREFIX !== EXPECTED_PREFIX,
    requiredPolicyActionsFromCode: [...EXPECTED_POLICY_ACTIONS],
    operationEvidence: [
      "createAliyunRdsServiceRecordOssPostPolicy -> oss:PostObject",
      "uploadAliyunRdsServiceRecordOssObject -> oss:PutObject",
      "createAliyunRdsServiceRecordOssSignedGetUrl -> oss:GetObject",
      "ALIBABA_CLOUD_ROLE_ARN RRSA OIDC credentials -> temporary STS credential signing",
      "ALIYUN_OSS_RAM_ROLE_NAME metadata credentials -> temporary STS credential signing fallback",
    ],
  }
}

function validateCloudConfirmations(filePath) {
  if (!existsSync(filePath)) {
    return {
      file: filePath,
      exists: false,
      ready: false,
      blockers: ["cloud_confirmations_file_missing"],
      warnings: [],
    }
  }

  const data = readJson(filePath)
  const oss = data?.items?.oss || {}
  const blockers = []
  const warnings = []
  const secretEnvNames = Array.isArray(oss.secretEnvNames) ? oss.secretEnvNames.map(text).filter(Boolean) : []
  const requiredSecretEnvNames = new Set(EXPECTED_SECRET_ENV_NAMES)
  const missingSecretEnvNames = EXPECTED_SECRET_ENV_NAMES.filter((name) => !secretEnvNames.includes(name))
  const accessMode = text(oss.accessMode)
  const credentialBoundary = text(oss.credentialBoundary)

  if (oss.confirmed !== true) blockers.push("oss.confirmed")
  if (text(oss.bucket) !== EXPECTED_BUCKET) blockers.push(`oss.bucket=${EXPECTED_BUCKET}`)
  if (text(oss.region) !== EXPECTED_REGION) blockers.push(`oss.region=${EXPECTED_REGION}`)
  if (oss.corsConfigured !== true) blockers.push("oss.corsConfigured")
  if (oss.ramLeastPrivilege !== true) blockers.push("oss.ramLeastPrivilege")
  if (text(oss.serviceRecordPrefix) !== EXPECTED_PREFIX) blockers.push(`oss.serviceRecordPrefix=${EXPECTED_PREFIX}`)
  if (!["sae_runtime_role", "sts_assume_role", "least_privilege_ram_user_secret_env"].includes(accessMode)) {
    blockers.push("oss.accessMode")
  }
  if (["sts_assume_role", "least_privilege_ram_user_secret_env"].includes(accessMode) && missingSecretEnvNames.length) {
    blockers.push(`oss.secretEnvNames:${missingSecretEnvNames.join(",")}`)
  }
  if (secretEnvNames.some((name) => !requiredSecretEnvNames.has(name))) {
    warnings.push(`oss.extraSecretEnvNames:${secretEnvNames.filter((name) => !requiredSecretEnvNames.has(name)).join(",")}`)
  }
  if (accessMode === "sae_runtime_role" && credentialBoundary && credentialBoundary !== "runtime_role_no_long_lived_secret") {
    blockers.push("oss.credentialBoundary=runtime_role_no_long_lived_secret")
  }
  if (accessMode === "sts_assume_role" && credentialBoundary !== "sts_token_secret_env_only") {
    blockers.push("oss.credentialBoundary=sts_token_secret_env_only")
  }
  if (accessMode === "least_privilege_ram_user_secret_env" && credentialBoundary !== "access_key_secret_env_only") {
    blockers.push("oss.credentialBoundary=access_key_secret_env_only")
  }
  const secretLikePaths = findSecretLikeValues(oss)
  if (secretLikePaths.length) blockers.push(`contains_secret_like_values:${secretLikePaths.join(",")}`)

  return {
    file: filePath,
    exists: true,
    ready: blockers.length === 0,
    blockers: unique(blockers),
    warnings: unique(warnings),
    confirmed: oss.confirmed === true,
    bucket: text(oss.bucket),
    expectedBucket: EXPECTED_BUCKET,
    region: text(oss.region),
    expectedRegion: EXPECTED_REGION,
    corsConfigured: oss.corsConfigured === true,
    ramLeastPrivilege: oss.ramLeastPrivilege === true,
    serviceRecordPrefix: text(oss.serviceRecordPrefix),
    expectedServiceRecordPrefix: EXPECTED_PREFIX,
    accessMode: accessMode || "pending_choose_sae_runtime_role_or_sts",
    roleOrUserName: text(oss.roleOrUserName),
    policyName: text(oss.policyName) || "MeiyeHuajingServiceRecordsOssPolicy",
    secretEnvNames,
    credentialBoundary: credentialBoundary || "pending_runtime_role_or_sts",
    evidence: text(oss.evidence),
  }
}

function relativeToRoot(filePath) {
  return filePath.startsWith(`${BACKEND_ROOT}/`) ? filePath.slice(BACKEND_ROOT.length + 1) : filePath
}

function buildReport(args) {
  const policy = validatePolicy(args.policyFile)
  const codeContract = validateCodeContract()
  const cloudConfirmations = validateCloudConfirmations(args.cloudConfirmationsFile)
  const blockers = [
    ...policy.blockers.map((item) => `policy:${item}`),
    ...codeContract.blockers.map((item) => `code:${item}`),
    ...cloudConfirmations.blockers.map((item) => `cloud:${item}`),
  ]
  const warnings = [
    ...policy.warnings.map((item) => `policy:${item}`),
    ...codeContract.warnings.map((item) => `code:${item}`),
    ...cloudConfirmations.warnings.map((item) => `cloud:${item}`),
  ]
  const secretLeakPayload = {
    policy,
    codeContract,
    cloudConfirmations,
    blockers,
    warnings,
  }
  const secretLikePaths = findSecretLikeValues(secretLeakPayload)
  const ok = blockers.length === 0 && secretLikePaths.length === 0

  return {
    ok,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    currentScope: "backend_aliyun_only",
    authorizationPacket: "P05_OSS_RAM_STS",
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    cloudApiCalled: false,
    currentAnswer: ok
      ? "OSS runtime access evidence is ready for backend production-cn."
      : "OSS runtime access is not ready; local policy/code contract is checked, but cloud RAM/STS/runtime role evidence still has blockers.",
    expectedBucket: EXPECTED_BUCKET,
    expectedRegion: EXPECTED_REGION,
    expectedOssRegionEnvValue: EXPECTED_OSS_REGION_ENV_VALUE,
    expectedServiceRecordPrefix: EXPECTED_PREFIX,
    policy,
    codeContract,
    cloudConfirmations,
    executionReadiness: {
      canStartP05AfterActionTimeConfirmation: true,
      resourceReadyForP05: cloudConfirmations.bucket === EXPECTED_BUCKET &&
        cloudConfirmations.region === EXPECTED_REGION &&
        cloudConfirmations.corsConfigured === true &&
        cloudConfirmations.serviceRecordPrefix === EXPECTED_PREFIX,
      policyTemplateReady: policy.ready,
      codeContractReady: codeContract.ready,
      accessGrantReady: cloudConfirmations.confirmed === true && cloudConfirmations.ramLeastPrivilege === true,
      preferredModeId: "sae_runtime_role",
      preferredModeAvoidsLongLivedSecret: true,
      fallbackModeIds: ["sts_assume_role", "least_privilege_ram_user_secret_env"],
      nextOperatorDecision: "bind_sae_runtime_role_or_sts_to_policy_then_record_non_secret_evidence",
      postActionWritebackFields: [
        "items.oss.confirmed=true",
        "items.oss.ramLeastPrivilege=true",
        "items.oss.accessMode=sae_runtime_role or sts_assume_role",
        "items.oss.roleOrUserName=<non-secret role/user name>",
        "items.oss.credentialBoundary=runtime_role_no_long_lived_secret or sts_token_secret_env_only",
        "SAE RRSA/OIDC env ALIBABA_CLOUD_ROLE_ARN, ALIBABA_CLOUD_OIDC_PROVIDER_ARN, and ALIBABA_CLOUD_OIDC_TOKEN_FILE when accessMode=sae_runtime_role",
        "SAE plain env SERVICE_RECORD_OSS_PREFIX=service-records/production-cn",
      ],
      verificationCommands: [
        "corepack pnpm aliyun:oss:runtime-access:strict",
        "corepack pnpm aliyun:cloud:confirmations:backend:strict",
        "corepack pnpm aliyun:sensitive:blockers:backend",
      ],
    },
    blockers: unique(blockers),
    warnings: unique(warnings),
    forbiddenValues: [
      "ALIYUN_OSS_ACCESS_KEY_SECRET value",
      "ALIYUN_OSS_SECURITY_TOKEN value",
      "AccessKeySecret",
      "STS token",
      "cookie",
      "customer audio payloads",
    ],
    secretLeakCheck: {
      ok: secretLikePaths.length === 0,
      matches: secretLikePaths,
    },
  }
}

function renderMarkdown(report) {
  return [
    "# P05 OSS Runtime Access Handoff",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Scope",
    "",
    `- currentScope: ${report.currentScope}`,
    `- authorizationPacket: ${report.authorizationPacket}`,
    `- ok: ${report.ok}`,
    `- readOnlyOnly: ${report.readOnlyOnly}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- cloudApiCalled: ${report.cloudApiCalled}`,
    `- containsValues: ${report.containsValues}`,
    "",
    "## Current Status",
    "",
    `- currentAnswer: ${report.currentAnswer}`,
    `- expectedBucket: ${report.expectedBucket}`,
    `- expectedRegion: ${report.expectedRegion}`,
    `- expectedOssRegionEnvValue: ${report.expectedOssRegionEnvValue}`,
    `- expectedServiceRecordPrefix: ${report.expectedServiceRecordPrefix}`,
    `- blockers: ${report.blockers.join(", ") || "none"}`,
    `- warnings: ${report.warnings.join(", ") || "none"}`,
    "",
    "## Local Policy",
    "",
    `- file: ${relativeToRoot(report.policy.file)}`,
    `- ready: ${report.policy.ready}`,
    `- allowedActions: ${report.policy.allowedActions.join(", ") || "none"}`,
    `- expectedResourceScope: ${report.policy.expectedResourceScope}`,
    `- prefixScoped: ${report.policy.prefixScoped}`,
    `- forbiddenActionsPresent: ${report.policy.forbiddenActionsPresent.join(", ") || "none"}`,
    "",
    "## Code Contract",
    "",
    `- ready: ${report.codeContract.ready}`,
    `- runtimeRoleCredentialSupported: ${report.codeContract.runtimeRoleCredentialSupported}`,
    `- credentialModesSupported: ${report.codeContract.credentialModesSupported.join(", ")}`,
    `- requiredCommonRuntimeEnvNames: ${report.codeContract.requiredCommonRuntimeEnvNames.join(", ")}`,
    `- requiredRuntimeRoleEnvNames: ${report.codeContract.requiredRuntimeRoleEnvNames.join(", ")}`,
    `- optionalMetadataRuntimeRoleEnvNames: ${report.codeContract.optionalMetadataRuntimeRoleEnvNames.join(", ")}`,
    `- fallbackSecretEnvNames: ${report.codeContract.fallbackSecretEnvNames.join(", ")}`,
    `- codeDefaultPrefix: ${report.codeContract.codeDefaultPrefix}`,
    `- expectedRuntimePrefix: ${report.codeContract.expectedRuntimePrefix}`,
    `- prefixRequiresRuntimeEnv: ${report.codeContract.prefixRequiresRuntimeEnv}`,
    "",
    "## Cloud Confirmation",
    "",
    `- file: ${relativeToRoot(report.cloudConfirmations.file)}`,
    `- ready: ${report.cloudConfirmations.ready}`,
    `- confirmed: ${report.cloudConfirmations.confirmed}`,
    `- bucket: ${report.cloudConfirmations.bucket}`,
    `- region: ${report.cloudConfirmations.region}`,
    `- corsConfigured: ${report.cloudConfirmations.corsConfigured}`,
    `- ramLeastPrivilege: ${report.cloudConfirmations.ramLeastPrivilege}`,
    `- serviceRecordPrefix: ${report.cloudConfirmations.serviceRecordPrefix}`,
    `- accessMode: ${report.cloudConfirmations.accessMode || "none"}`,
    `- policyName: ${report.cloudConfirmations.policyName || "none"}`,
    `- credentialBoundary: ${report.cloudConfirmations.credentialBoundary || "none"}`,
    "",
    "## Execution Readiness",
    "",
    `- canStartP05AfterActionTimeConfirmation: ${report.executionReadiness.canStartP05AfterActionTimeConfirmation}`,
    `- resourceReadyForP05: ${report.executionReadiness.resourceReadyForP05}`,
    `- policyTemplateReady: ${report.executionReadiness.policyTemplateReady}`,
    `- codeContractReady: ${report.executionReadiness.codeContractReady}`,
    `- accessGrantReady: ${report.executionReadiness.accessGrantReady}`,
    `- preferredModeId: ${report.executionReadiness.preferredModeId}`,
    `- preferredModeAvoidsLongLivedSecret: ${report.executionReadiness.preferredModeAvoidsLongLivedSecret}`,
    `- fallbackModeIds: ${report.executionReadiness.fallbackModeIds.join(", ")}`,
    `- nextOperatorDecision: ${report.executionReadiness.nextOperatorDecision}`,
    "",
    "## Writeback Fields After Authorized P05 Action",
    "",
    ...report.executionReadiness.postActionWritebackFields.map((item) => `- ${item}`),
    "",
    "## Verification Commands",
    "",
    ...report.executionReadiness.verificationCommands.map((item) => `- ${item}`),
    "",
    "## Safety Boundary",
    "",
    ...report.forbiddenValues.map((item) => `- Do not write ${item}.`),
    "",
  ].join("\n")
}

function writeOutput(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function printHelp() {
  console.log(`Usage: node scripts/check-aliyun-oss-runtime-access.mjs [--allow-incomplete] [--out path] [--markdown path]

Validates the non-secret OSS policy/code/runtime evidence for P05_OSS_RAM_STS.
The checker reads local files only and never calls Aliyun APIs or prints secret values.`)
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildReport(args)
  if (args.outPath) writeOutput(args.outPath, JSON.stringify(report, null, 2))
  if (args.markdownPath) writeOutput(args.markdownPath, renderMarkdown(report))
  const output = `${JSON.stringify(report, null, 2)}\n`
  process.stdout.write(output)
  if (!args.allowIncomplete && !report.ok) process.exitCode = 1
}

main()
