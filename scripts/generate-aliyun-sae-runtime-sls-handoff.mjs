#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { runJsonWithCache } from "./lib/run-json-cache.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const AUTHORIZATION_PACKET = "P08_SAE_RUNTIME_SLS"
const DEFAULT_RUNTIME_PLAN_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.runtime-plan.json")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const DEFAULT_IMAGE_PUBLISH_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.image-publish.local.json")

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /:\/\/[^\s:@]+:[^\s@]+@/,
  /docker login .* -p\s+\S{8,}/i,
  /AccessKeySecret\s*[:=]\s*\S{8,}/i,
  /registry[_ -]?password\s*[:=]\s*\S{8,}/i,
  /DATABASE_URL_CN\s*[:=]\s*\S{8,}/i,
]

function parseArgs(argv) {
  const args = {
    planFile: DEFAULT_RUNTIME_PLAN_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    imagePublishFile: DEFAULT_IMAGE_PUBLISH_FILE,
    outPath: "",
    markdownPath: "",
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--plan") {
      args.planFile = resolveValue(argv[++index], "--plan")
      continue
    }
    if (arg === "--cloud-confirmations") {
      args.cloudConfirmationsFile = resolveValue(argv[++index], "--cloud-confirmations")
      continue
    }
    if (arg === "--image-publish") {
      args.imagePublishFile = resolveValue(argv[++index], "--image-publish")
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

function runRuntimePlan(args) {
  const command = ["scripts/check-aliyun-runtime-plan.mjs"]
  if (args.planFile !== DEFAULT_RUNTIME_PLAN_FILE) command.push("--plan", args.planFile)
  return runJsonWithCache("sae_runtime_plan", command, {
    cwd: BACKEND_ROOT,
    maxBuffer: 1024 * 1024 * 10,
    timeoutMs: 30_000,
  })
}

function runCloudConfirmations(args) {
  return runJsonWithCache("sae_cloud_confirmations", [
    "scripts/check-aliyun-cloud-confirmations.mjs",
    "--backend-only",
    "--allow-incomplete",
    "--local",
    args.cloudConfirmationsFile,
  ], {
    cwd: BACKEND_ROOT,
    maxBuffer: 1024 * 1024 * 40,
    timeoutMs: 30_000,
  })
}

function runImagePlan(args) {
  return runJsonWithCache("sae_image_publish_plan", [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--allow-incomplete",
    "--local",
    args.imagePublishFile,
  ], {
    cwd: BACKEND_ROOT,
    maxBuffer: 1024 * 1024 * 30,
    timeoutMs: 30_000,
  })
}

function uniqueStrings(values) {
  const seen = new Set()
  const result = []
  for (const value of values || []) {
    const item = String(value || "").trim()
    if (!item || seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

function compactCandidate(candidate) {
  if (!candidate) return null
  return {
    id: candidate.id || "",
    title: candidate.title || "",
    canUseNow: candidate.canUseNow === true,
    blockers: candidate.blockers || [],
    consolePaths: candidate.consolePaths || [],
    writeBackFields: candidate.writeBackFields || [],
    requiredEvidence: candidate.requiredEvidence || [],
  }
}

function buildDependencyGates(plan, cloudConfirmations, imagePlan) {
  const dependencies = plan.predeployDependencies || []
  const cloudSummary = cloudConfirmations.summary || {}
  const ossAccessPlan = cloudConfirmations.ossAccessPlan || {}
  const imageExecution = imagePlan.executionReadiness || {}
  const readinessById = {
    RDS_POSTGRES_MIGRATION: false,
    ACR_IMAGE_DIGEST_AND_PULL: imagePlan.ready === true || imageExecution.p04StrictReady === true,
    OSS_RUNTIME_ACCESS: cloudSummary.ossAccessPlanReady === true,
    BACKEND_ENV_IMPORT: cloudSummary.envImportPlanReady === true,
  }
  const extraBlockersById = {
    RDS_POSTGRES_MIGRATION: [
      "DATABASE_URL_CN",
      "RDS_MIGRATION_EVIDENCE_NOT_READY",
    ],
    ACR_IMAGE_DIGEST_AND_PULL: imageExecution.ready === true ? [] : imageExecution.postActionWritebackFields || [
      "acr.remoteDigest=sha256:<64 hex>",
      "acr.imagePushed=true",
      "runtime.imagePullConfigured=true",
    ],
    OSS_RUNTIME_ACCESS: cloudSummary.ossAccessPlanReady === true
      ? []
      : (ossAccessPlan.selectedBlockers?.length ? ossAccessPlan.selectedBlockers : [
          "oss.confirmed",
          "oss.ramLeastPrivilege",
        ]),
    BACKEND_ENV_IMPORT: cloudSummary.envImportPlanReady === true ? [] : [
      "envImport.confirmed",
      "envImport.secretNotInImage",
    ],
  }

  return dependencies.map((dependency) => ({
    id: dependency.id,
    requiredBeforeRuntimeReady: dependency.requiredBeforeRuntimeReady === true,
    authorizationPacket: dependency.authorizationPacket || "",
    evidenceCommand: dependency.evidenceCommand || "",
    supportingEvidenceCommands: dependency.supportingEvidenceCommands || [],
    blockingCredentialNames: dependency.blockingCredentialNames || [],
    ready: readinessById[dependency.id] === true,
    blockers: extraBlockersById[dependency.id] || [],
  }))
}

function buildReport(args) {
  const plan = readJson(args.planFile)
  const runtimePlan = runRuntimePlan(args)
  const cloudConfirmations = runCloudConfirmations(args)
  const imagePlan = runImagePlan(args)
  const runtimeSlsPlan = cloudConfirmations.runtimeSlsPlan || {}
  const runtimeGroup = runtimeSlsPlan.groups?.runtime || {}
  const slsGroup = runtimeSlsPlan.groups?.slsAlerts || {}
  const runtimeCandidate = compactCandidate((runtimeGroup.candidates || []).find((item) => item.id === "sae_custom_container_runtime"))
  const slsCandidate = compactCandidate((slsGroup.candidates || []).find((item) => item.id === "sls_health_5xx_alerts"))
  const cloudSummary = cloudConfirmations.summary || {}
  const imageExecution = imagePlan.executionReadiness || {}
  const dependencyGates = buildDependencyGates(plan, cloudConfirmations, imagePlan)
  const dependencyGatesReady = dependencyGates.every((gate) => gate.ready === true)
  const blockedCredentialNames = uniqueStrings([
    ...(cloudSummary.envImportBlockedCredentialNames || []),
    ...dependencyGates.flatMap((gate) => gate.blockingCredentialNames || []),
  ])
  const readySecretEnvVariableCount = Number(cloudSummary.envImportReadySecretEnvVariableCount || 0)

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    packageId: "P08_SAE_RUNTIME_SLS_HANDOFF",
    environment: "production-cn",
    currentScope: "backend_aliyun_only",
    authorizationPacket: AUTHORIZATION_PACKET,
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    cloudApiCalledByThisCommand: false,
    deploymentPerformedByThisCommand: false,
    browserInteraction: {
      foregroundBrowserInteraction: false,
      pageSwitchAllowedByThisCommand: false,
      browserClickAllowedByThisCommand: false,
    },
    target: {
      provider: runtimePlan.provider || plan.target?.provider || "",
      region: runtimePlan.region || plan.target?.region || "",
      appName: runtimePlan.appName || plan.target?.appName || "",
      runtime: runtimePlan.runtime || plan.target?.runtime || "",
      containerPort: runtimePlan.containerPort || plan.target?.containerPort || 0,
      healthPath: runtimePlan.healthPath || plan.target?.healthPath || "",
      strictHealthPath: plan.target?.strictHealthPath || "",
      publicIngress: plan.target?.publicIngress === true,
      slsProject: runtimeSlsPlan.targets?.slsProject || slsGroup.targetProject || "meiye-huajing-app-prod-cn",
      slsLogstore: runtimeSlsPlan.targets?.slsLogstore || slsGroup.targetLogstore || "app-api",
    },
    currentStatus: {
      runtimePlanReady: runtimePlan.ok === true,
      runtimeSlsPlanReady: cloudSummary.runtimeSlsPlanReady === true,
      runtimeConfirmed: runtimeGroup.ready === true,
      slsAlertsConfirmed: slsGroup.ready === true,
      imagePublishReady: imagePlan.ready === true || imageExecution.p04StrictReady === true,
      acrImageDigestReady: imagePlan.local?.acr?.digestVerified === true,
      runtimeImagePullConfigured: imagePlan.local?.runtime?.imagePullConfigured === true,
      ossRuntimeAccessReady: cloudSummary.ossAccessPlanReady === true,
      envImportReady: cloudSummary.envImportPlanReady === true,
      dependencyGatesReady,
      canConfigureRuntimeNow: runtimePlan.ok === true && dependencyGatesReady,
      blockedCredentialNames,
      readySecretEnvVariableCount,
      selectedRuntimeMode: runtimeGroup.selectedMode || "pending_create_sae_custom_container_runtime",
      selectedSlsMode: slsGroup.selectedMode || "pending_bind_sae_logs_and_alerts",
    },
    dependencyGates,
    operatorSteps: [
      "Confirm P08 action-time authorization before creating or modifying SAE runtime or SLS alerts.",
      "Close the RDS, ACR image digest/pull, OSS runtime access, and backend env import gates before marking SAE runtime ready.",
      "Create or confirm SAE custom-container app meiye-huajing-app-api-production-cn in cn-hangzhou with port 3000 and /api/healthz health check.",
      "Configure the SAE runtime to use the verified ACR remote image, image pull permission, runtime identity, and secret env source.",
      "Bind SAE logs to SLS project/logstore, then configure health and 5xx alert rules with non-secret evidence handles.",
      "Write back only resource names, booleans, digest handles, endpoint names, alert names, and non-secret evidence handles.",
    ],
    runtimeOperation: {
      selectedMode: runtimeGroup.selectedMode || "pending_create_sae_custom_container_runtime",
      ready: runtimeGroup.ready === true,
      blockers: runtimeGroup.blockers || [],
      recommendedModeIds: runtimeGroup.recommendedModeIds || ["sae_custom_container_runtime"],
      candidate: runtimeCandidate,
      writebackTemplate: runtimeGroup.writebackTemplate || {},
    },
    slsOperation: {
      selectedMode: slsGroup.selectedMode || "pending_bind_sae_logs_and_alerts",
      ready: slsGroup.ready === true,
      blockers: slsGroup.blockers || [],
      recommendedModeIds: slsGroup.recommendedModeIds || ["sls_health_5xx_alerts"],
      candidate: slsCandidate,
      writebackTemplate: slsGroup.writebackTemplate || {},
    },
    writebackTargets: {
      cloudConfirmationsFile: "deploy/aliyun-production-cn.cloud-confirmations.local.json",
      runtimeFields: uniqueStrings([
        ...(runtimeCandidate?.writeBackFields || []),
        ...(runtimeGroup.writebackTemplate?.requiredCompletionFields || []).map((field) => `items.runtime.${field}`),
      ]),
      slsAlertFields: uniqueStrings([
        ...(slsCandidate?.writeBackFields || []),
        ...(slsGroup.writebackTemplate?.requiredCompletionFields || []).map((field) => `items.slsAlerts.${field}`),
      ]),
      imagePublishFile: "deploy/aliyun-production-cn.image-publish.local.json",
      imageRuntimeFields: uniqueStrings([
        ...(imageExecution.postActionWritebackFields || []),
        "runtime.remoteImageConfigured=true",
        "runtime.imagePullConfigured=true",
      ]),
    },
    verificationCommands: uniqueStrings([
      "corepack pnpm aliyun:runtime:plan",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:cloud:confirmations:backend:strict",
      "corepack pnpm aliyun:rds:migration:evidence:strict",
      "corepack pnpm aliyun:rds:runtime-smoke:strict",
      "corepack pnpm aliyun:oss:runtime-access:strict",
      "corepack pnpm aliyun:sensitive:blockers:backend",
      "corepack pnpm aliyun:backend-cn:status",
    ]),
    upstream: {
      runtimePlan: {
        ok: runtimePlan.ok === true,
        blockers: runtimePlan.blockers || [],
        predeployDependencyIds: runtimePlan.predeployDependencyIds || [],
      },
      cloudConfirmations: {
        ok: cloudConfirmations.ok === true,
        totalBlockers: cloudSummary.totalBlockers || 0,
        runtimeSlsPlanReady: cloudSummary.runtimeSlsPlanReady === true,
        recommendedRuntimeSlsModes: cloudSummary.recommendedRuntimeSlsModes || [],
        writebackBlockingGroups: cloudSummary.writebackBlockingGroups || [],
      },
      imagePlan: {
        ok: imagePlan.ok === true,
        ready: imagePlan.ready === true,
        p04StrictReady: imageExecution.p04StrictReady === true,
        selectedTransferPathReady: imageExecution.selectedTransferPathReady === true,
        recommendedTransferPathIds: imageExecution.recommendedTransferPathIds || [],
      },
    },
    safetyBoundary: [
      "This command is local and value-free; it does not call Aliyun APIs, create SAE, configure SLS, import env, mutate DNS, push images, or deploy.",
      "This command must stay background-only; it does not switch browser pages, click console UI, or foreground any browser tab.",
      "Do not mark runtime ready until ACR digest/pull, RDS migration, OSS runtime access, secret env import, health check, and SLS alerts have non-secret evidence.",
      "Never store registry password, AccessKeySecret, RAM Secret, STS token, DATABASE_URL_CN value, database password, webhook token, AppSecret, cookies, or Supabase service role key.",
    ],
  }
}

function findSecretLikeValues(value, path = "$") {
  const matches = []
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) matches.push(path)
    return matches
  }
  if (!value || typeof value !== "object") return matches
  if (Array.isArray(value)) {
    value.forEach((item, index) => matches.push(...findSecretLikeValues(item, `${path}[${index}]`)))
    return matches
  }
  for (const [key, nested] of Object.entries(value)) {
    matches.push(...findSecretLikeValues(nested, `${path}.${key}`))
  }
  return matches
}

function renderMarkdown(report) {
  const gates = report.dependencyGates
    .map((gate) => `- ${gate.id}: ready=${gate.ready}; auth=${gate.authorizationPacket}; evidence=${gate.evidenceCommand}`)
    .join("\n")
  const runtimeFields = report.writebackTargets.runtimeFields.map((field) => `- ${field}`).join("\n")
  const slsFields = report.writebackTargets.slsAlertFields.map((field) => `- ${field}`).join("\n")
  const verification = report.verificationCommands.map((command) => `- ${command}`).join("\n")
  const safety = report.safetyBoundary.map((item) => `- ${item}`).join("\n")

  return [
    "# P08 SAE Runtime and SLS Handoff",
    "",
    `- Scope: ${report.currentScope}`,
    `- Authorization packet: ${report.authorizationPacket}`,
    `- Runtime target: ${report.target.provider} ${report.target.region} ${report.target.appName}`,
    `- Container: ${report.target.runtime} port ${report.target.containerPort} health ${report.target.healthPath}`,
    `- Runtime confirmed: ${report.currentStatus.runtimeConfirmed}`,
    `- SLS alerts confirmed: ${report.currentStatus.slsAlertsConfirmed}`,
    `- Dependency gates ready: ${report.currentStatus.dependencyGatesReady}`,
    `- Can configure runtime now: ${report.currentStatus.canConfigureRuntimeNow}`,
    `- Blocked credentials: ${report.currentStatus.blockedCredentialNames.join(", ") || "none"}`,
    `- Ready secret env variable count: ${report.currentStatus.readySecretEnvVariableCount}`,
    "",
    "## Dependency Gates",
    gates || "- none",
    "",
    "## Runtime Writeback",
    runtimeFields || "- none",
    "",
    "## SLS Writeback",
    slsFields || "- none",
    "",
    "## Verification",
    verification,
    "",
    "## Safety Boundary",
    safety,
    "",
  ].join("\n")
}

function writeTextFile(filePath, text) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, text)
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildReport(args)
  const secretMatches = findSecretLikeValues(report)
  if (secretMatches.length) throw new Error(`secret_like_values_detected:${secretMatches.join(",")}`)

  const output = JSON.stringify(report, null, 2)
  if (args.outPath) writeTextFile(args.outPath, `${output}\n`)
  if (args.markdownPath) {
    const markdown = renderMarkdown(report)
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(markdown))) {
      throw new Error("secret_like_values_detected:markdown")
    }
    writeTextFile(args.markdownPath, markdown)
  }
  console.log(output)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-aliyun-sae-runtime-sls-handoff.mjs [--plan path] [--cloud-confirmations path] [--image-publish path] [--out path] [--markdown path]",
    "",
    "Generates a non-secret P08 SAE runtime and SLS handoff from the runtime plan, cloud confirmations, and image publish plan.",
    "It never calls Aliyun APIs, switches browser pages, creates SAE, configures SLS, imports env, pushes images, or deploys production-cn.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
