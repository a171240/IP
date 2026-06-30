#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { runJsonWithCache } from "./lib/run-json-cache.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const AUTHORIZATION_PACKET = "P04_ACR_IMAGE_AND_PULL"

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
]

function parseArgs(argv) {
  const args = {
    localFile: "",
    outPath: "",
    markdownPath: "",
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--local") {
      args.localFile = resolveValue(argv[++index], "--local")
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

function runImagePlan(args) {
  const command = ["scripts/check-aliyun-image-publish-plan.mjs", "--allow-incomplete"]
  if (args.localFile) command.push("--local", args.localFile)
  return runJsonWithCache("acr_image_publish_plan", command, {
    cwd: BACKEND_ROOT,
    maxBuffer: 1024 * 1024 * 20,
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

function candidatesByIds(candidates, ids) {
  const byId = new Map((candidates || []).map((candidate) => [candidate.id, candidate]))
  return uniqueStrings(ids)
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      canUseNow: candidate.canUseNow === true,
      blockers: candidate.blockers || [],
      remoteImage: candidate.remoteImage || "",
      commandMode: candidate.commandMode || "",
      commandPreview: candidate.commandPreview || "",
      requiredEvidence: candidate.requiredEvidence || [],
    }))
}

function buildReport(args) {
  const imagePlan = runImagePlan(args)
  const execution = imagePlan.executionReadiness || {}
  const pushNetworkPlan = imagePlan.pushNetworkPlan || {}
  const candidates = pushNetworkPlan.candidates || []
  const groupsById = new Map((imagePlan.writebackPlan?.groups || []).map((group) => [group.id, group]))
  const imagePushAndDigestReady = groupsById.get("imagePushAndDigest")?.ready === true
  const saeRuntimeImagePullReady = groupsById.get("saeRuntimeImagePull")?.ready === true
  const p04StrictReady = execution.p04StrictReady === true || (imagePushAndDigestReady && saeRuntimeImagePullReady)
  const recommendedPathIds = uniqueStrings(execution.recommendedTransferPathIds || pushNetworkPlan.recommendedPathIds)
  const forbiddenPathIds = uniqueStrings(execution.forbiddenTransferPathIds)
  const recommendedTransferPaths = candidatesByIds(candidates, recommendedPathIds)
  const forbiddenTransferPaths = candidatesByIds(candidates, forbiddenPathIds)
  const runtimePullPending = imagePushAndDigestReady && saeRuntimeImagePullReady !== true
  const hasImmediateTransferPath = recommendedTransferPaths.length > 0 && !imagePushAndDigestReady
  const writebackFields = imagePushAndDigestReady
    ? uniqueStrings([
        "runtime.confirmed=true",
        "runtime.remoteImageConfigured=true",
        "runtime.imagePullConfigured=true",
        "runtime.imagePullCredentialMode=<non-secret runtime pull mode>",
        "runtime.evidence=<non-secret SAE evidence handle>",
      ])
    : uniqueStrings([
        ...(execution.postActionWritebackFields || []),
        "runtime.confirmed=true",
        "runtime.imagePullCredentialMode=<non-secret runtime pull mode>",
      ])

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    packageId: "P04_ACR_IMAGE_TRANSFER_HANDOFF",
    environment: "production-cn",
    currentScope: "backend_aliyun_only",
    authorizationPacket: AUTHORIZATION_PACKET,
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    cloudApiCalledByThisCommand: false,
    dockerPushPerformedByThisCommand: false,
    canStartAfterActionTimeConfirmation: execution.canStartP04AfterActionTimeConfirmation === true,
    currentStatus: {
      p04StrictReady: execution.p04StrictReady === true,
      purchaseAndRepositoryReady: execution.purchaseAndRepositoryReady === true,
      selectedTransferPathReady: execution.selectedTransferPathReady === true,
      selectedTransferPath: execution.selectedTransferPath || pushNetworkPlan.selectedPath || "",
      nextOperatorDecision: execution.nextOperatorDecision || "",
      imagePushAndDigestReady,
      saeRuntimeImagePullReady,
      dockerDaemonReady: execution.dockerDaemonReady === true,
      canProceedWithoutLocalDockerDaemon: execution.canProceedWithoutLocalDockerDaemon === true,
      localPublicPushReady: execution.localPublicPushReady === true,
      publicNetworkEntranceEnabled: pushNetworkPlan.publicNetworkEntranceEnabled === true,
    },
    transferDecision: {
      required: p04StrictReady !== true,
      recommendedTransferPathIds: recommendedPathIds,
      recommendedTransferPaths,
      forbiddenTransferPathIds: forbiddenPathIds,
      forbiddenTransferPaths,
      decisionRule:
        "Choose vpc_registry_from_aliyun_network, or acr_repo_sync_existing_source_tag only when an existing source ACR tag is available, unless ACR public network entrance is explicitly enabled and verified.",
      mustNotUseNow: forbiddenPathIds,
    },
    operatorSteps: p04StrictReady
      ? [
          "P04_ACR_IMAGE_AND_PULL is already strict-ready.",
          "Preserve the verified production-cn remote image digest and SAE image pull configuration.",
          "Do not push the image again unless the backend source changes and a new digest is intentionally produced.",
          "Continue with the remaining backend gates: RDS API smoke/rollback, OSS runtime confirmation, secret env import, SAE health/SLS, and domain HTTPS.",
        ]
      : runtimePullPending
      ? [
          "ACR production-cn image and sha256 digest evidence are already verified.",
          "Configure SAE meiye-huajing-app-api-production-cn to use the verified remote image and runtime pull permission.",
          "Write back only non-secret SAE booleans, runtime pull mode, and evidence handles.",
          "Run corepack pnpm aliyun:image:plan:strict after SAE image pull configuration is recorded.",
        ]
      : hasImmediateTransferPath
      ? [
          "Confirm P04 action-time authorization before any image transfer action.",
          "Choose one recommended transfer path and keep registry credentials only in a credential helper, short-lived operator session, RAM/KMS/Secrets Manager, or Aliyun runtime settings.",
          "Push/sync the production-cn image into Aliyun ACR, then verify the remote sha256 digest in ACR.",
          "Configure SAE meiye-huajing-app-api-production-cn to use the verified remote image and runtime pull permission.",
          "Write back only non-secret booleans, selected path, remote image, sha256 digest, and evidence handles.",
        ]
      : [
          "No image transfer path is currently executable.",
          "Resolve the next operator decision first: fund_ecs_postpaid_or_provide_bound_source_repo_cloud_build.",
          "After a runner or source ACR tag exists, rerun corepack pnpm aliyun:image:plan and regenerate this handoff.",
          "Do not push, sync, configure SAE, or write image digest evidence until ACR contains the production-cn image.",
        ],
    writebackTargets: {
      file: "deploy/aliyun-production-cn.image-publish.local.json",
      fields: writebackFields,
      requiredEvidence: imagePushAndDigestReady
        ? [
            "SAE remote image configured evidence handle",
            "SAE image pull permission configured evidence handle",
          ]
        : [
            "ACR image push/import success evidence handle",
            "remoteDigest sha256 verification evidence handle",
            "SAE remote image configured evidence handle",
            "SAE image pull permission configured evidence handle",
          ],
    },
    verificationCommands: uniqueStrings([
      ...(execution.verificationCommands || []),
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:backend-cn:status",
    ]),
    upstreamImagePlan: {
      ok: imagePlan.ok === true,
      ready: imagePlan.ready === true,
      summary: imagePlan.summary || {},
      localBlockers: imagePlan.local?.blockers || [],
      writebackBlockingGroups: imagePlan.writebackPlan?.blockingGroups || [],
      requiredAuthorizationPackets: imagePlan.writebackPlan?.requiredAuthorizationPackets || [],
    },
    safetyBoundary: [
      "This command is local and value-free; it does not call Aliyun APIs, run docker login, push/import images, configure SAE, import env, or deploy.",
      "Do not use public_registry while acr.publicNetworkEntranceEnabled=false.",
      "Do not write registry username, registry password, docker login output, RAM Secret, AccessKeySecret, STS token, AppSecret, cookies, or image pull secrets into JSON, Markdown, shell history, images, or git.",
      "Record only the transfer path, remote image, sha256 digest, booleans, and non-secret evidence handles.",
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
  const recommended = report.transferDecision.recommendedTransferPaths
    .map((item) => `- ${item.id}: ${item.title}; commandMode=${item.commandMode}; remoteImage=${item.remoteImage || "pending"}`)
    .join("\n")
  const forbidden = report.transferDecision.forbiddenTransferPaths
    .map((item) => `- ${item.id}: blockers=${(item.blockers || []).join(", ") || "none"}`)
    .join("\n")
  const fields = report.writebackTargets.fields.map((field) => `- ${field}`).join("\n")
  const verification = report.verificationCommands.map((command) => `- ${command}`).join("\n")
  const safety = report.safetyBoundary.map((item) => `- ${item}`).join("\n")

  return [
    "# P04 ACR Image Transfer Handoff",
    "",
    `- Scope: ${report.currentScope}`,
    `- Authorization packet: ${report.authorizationPacket}`,
    `- Can start after action-time confirmation: ${report.canStartAfterActionTimeConfirmation}`,
    `- P04 strict ready: ${report.currentStatus.p04StrictReady}`,
    `- Next operator decision: ${report.currentStatus.nextOperatorDecision}`,
    "",
    "## Recommended Transfer Paths",
    recommended || "- none",
    "",
    "## Forbidden Now",
    forbidden || "- none",
    "",
    "## Writeback Fields",
    fields,
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
    "  node scripts/generate-aliyun-acr-image-transfer-handoff.mjs [--local path] [--out path] [--markdown path]",
    "",
    "Generates a non-secret P04 ACR image transfer handoff from the current Aliyun image publish plan.",
    "It never calls Aliyun APIs, runs docker login, pushes images, configures SAE, imports env, or deploys production-cn.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
