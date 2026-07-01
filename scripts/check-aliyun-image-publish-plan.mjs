#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_TEMPLATE_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.image-publish.example.json")
const DEFAULT_LOCAL_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.image-publish.local.json")
const EXPECTED_LOCAL_TAG = "meiye-huajing-app-api:production-cn"
const EXPECTED_PROVIDER = "Aliyun ACR"
const EXPECTED_REGION = "cn-hangzhou"
const EXPECTED_REPOSITORY = "meiye-huajing-app-api"
const EXPECTED_REMOTE_TAG = "production-cn"
const SOURCE_FRESHNESS_BLOCKER = "image.sourceCommitMatchesHead"
const RUNTIME_SOURCE_PATH_PATTERNS = Object.freeze([
  /^app\//,
  /^lib\//,
  /^scripts\//,
  /^deploy\//,
  /^public\//,
  /^middleware\.(?:js|ts)$/,
  /^instrumentation\.(?:js|ts)$/,
  /^next\.config\./,
  /^package(?:-lock)?\.json$/,
  /^pnpm-lock\.yaml$/,
  /^tsconfig\.json$/,
])

const TOP_LEVEL_FIELDS = new Set([
  "schemaVersion",
  "environment",
  "updatedAt",
  "operator",
  "notes",
  "image",
  "acr",
  "runtime",
  "commands",
  "security",
])

const REQUIRED_FIELDS = {
  image: ["localTag", "localDigest", "dockerBuildCommand", "containerSmokeCommand"],
  acr: [
    "confirmed",
    "provider",
    "region",
    "registryHost",
    "vpcRegistryHost",
    "publicNetworkEntranceEnabled",
    "namespace",
    "repository",
    "remoteTag",
    "remoteImage",
    "remoteDigest",
    "imagePushed",
    "digestVerified",
    "pushNetworkPath",
    "evidence",
  ],
  runtime: [
    "confirmed",
    "target",
    "appName",
    "remoteImageConfigured",
    "imagePullConfigured",
    "imagePullCredentialMode",
    "evidence",
  ],
  commands: ["tag", "push", "inspect"],
  security: ["containsRegistryCredentials", "secretPolicy"],
}

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
    templateFile: DEFAULT_TEMPLATE_FILE,
    localFile: DEFAULT_LOCAL_FILE,
    allowIncomplete: false,
    skipDockerProbe: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--template") {
      args.templateFile = resolveValue(argv[++index], "--template")
      continue
    }
    if (arg === "--local") {
      args.localFile = resolveValue(argv[++index], "--local")
      continue
    }
    if (arg === "--allow-incomplete") {
      args.allowIncomplete = true
      continue
    }
    if (arg === "--skip-docker-probe") {
      args.skipDockerProbe = true
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

function text(value) {
  return String(value || "").trim()
}

function isTodo(value) {
  return text(value).startsWith("TODO_")
}

function isSha256(value) {
  return /^sha256:[a-f0-9]{64}$/i.test(text(value))
}

function isNonTodoText(value) {
  const valueText = text(value)
  return Boolean(valueText && !isTodo(valueText))
}

function missingObjectFields(data, objectName) {
  const value = data?.[objectName]
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return REQUIRED_FIELDS[objectName].map((field) => `${objectName}.${field}`)
  }
  return REQUIRED_FIELDS[objectName]
    .filter((field) => !Object.prototype.hasOwnProperty.call(value, field))
    .map((field) => `${objectName}.${field}`)
}

function requireLocalField(data, path, blockers) {
  const [objectName, fieldName] = path.split(".")
  const value = data?.[objectName]?.[fieldName]
  if (typeof value === "string") {
    if (!value.trim()) blockers.push(`empty:${path}`)
    if (isTodo(value)) blockers.push(`todo:${path}`)
    return
  }
  if (value === null || typeof value === "undefined") blockers.push(`empty:${path}`)
}

function validateFile(filePath, mode) {
  if (!existsSync(filePath)) {
    return {
      file: filePath,
      mode,
      exists: false,
      ready: false,
      blockers: ["file_missing"],
      warnings: [],
    }
  }

  const data = readJson(filePath)
  const blockers = []
  const warnings = []
  const unknownTopLevel = Object.keys(data).filter((field) => !TOP_LEVEL_FIELDS.has(field))
  if (unknownTopLevel.length) warnings.push(`unknown_top_level_fields:${unknownTopLevel.join(",")}`)
  if (data.schemaVersion !== 1) blockers.push("schemaVersion=1")
  if (data.environment !== "production-cn") blockers.push("environment=production-cn")

  for (const objectName of Object.keys(REQUIRED_FIELDS)) {
    blockers.push(...missingObjectFields(data, objectName).map((field) => `missing:${field}`))
  }

  const secretMatches = findSecretLikeValues(data)
  if (secretMatches.length) blockers.push(`contains_secret_like_values:${secretMatches.join(",")}`)

  validateCommonValues(data, blockers)
  const sourceFreshness = mode === "local"
    ? validateLocalSourceFreshness(data)
    : {
        checked: false,
        status: "not_applicable",
        blockers: [],
        warnings: [],
      }
  if (mode === "local") {
    validateLocalValues(data, blockers)
    blockers.push(...sourceFreshness.blockers)
    warnings.push(...sourceFreshness.warnings)
  }

  return {
    file: filePath,
    mode,
    exists: true,
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings,
    image: {
      localTag: data.image?.localTag || "",
      localDigestReady: isSha256(data.image?.localDigest),
      remoteDigestCoversCurrentSource: data.image?.remoteDigestCoversCurrentSource,
      sourceFreshness,
    },
    acr: {
      registryHost: data.acr?.registryHost || "",
      vpcRegistryHost: data.acr?.vpcRegistryHost || "",
      vpcEndpoint: data.acr?.vpcEndpoint || null,
      cloudBuildRunner: data.acr?.cloudBuildRunner || null,
      repoSyncSource: data.acr?.repoSyncSource || null,
      publicNetworkEntranceEnabled: data.acr?.publicNetworkEntranceEnabled === true,
      pushNetworkPath: data.acr?.pushNetworkPath || "",
      namespace: data.acr?.namespace || "",
      repository: data.acr?.repository || "",
      remoteImage: data.acr?.remoteImage || "",
      remoteDigest: data.acr?.remoteDigest || "",
      imagePushed: data.acr?.imagePushed === true,
      digestVerified: data.acr?.digestVerified === true,
      purchaseCandidate: data.acr?.purchaseCandidate || null,
    },
    runtime: {
      target: data.runtime?.target || "",
      appName: data.runtime?.appName || "",
      remoteImageConfigured: data.runtime?.remoteImageConfigured === true,
      imagePullConfigured: data.runtime?.imagePullConfigured === true,
    },
  }
}

function validateLocalSourceFreshness(data) {
  const claimedCurrentSource = data.image?.remoteDigestCoversCurrentSource === true
  const sourceCommit = text(data.acr?.cloudBuildRunner?.lastSuccessfulBuild?.sourceCommit)
  const currentSourceTarSha256 = text(data.image?.currentSourceTarSha256)
  const lastSuccessfulBuild = data.acr?.cloudBuildRunner?.lastSuccessfulBuild || null
  const base = {
    checked: true,
    claimedCurrentSource,
    blockerId: SOURCE_FRESHNESS_BLOCKER,
    currentHead: "",
    imageSourceCommit: sourceCommit,
    currentSourceTarSha256,
    lastSuccessfulBuild,
    changedFiles: [],
    runtimeChangedFiles: [],
    runtimeChangedFileCount: 0,
    changedFileSample: [],
    runtimeChangedFileSample: [],
    blockers: [],
    warnings: [],
  }

  if (!claimedCurrentSource) {
    return {
      ...base,
      status: "not_claimed",
    }
  }

  const head = runGit(["rev-parse", "HEAD"])
  if (!head.ok) {
    return {
      ...base,
      status: "git_head_unavailable",
      blockers: [SOURCE_FRESHNESS_BLOCKER],
      error: head.error,
    }
  }

  const currentHead = head.stdout.trim()
  if (!sourceCommit) {
    return {
      ...base,
      currentHead,
      status: "missing_source_commit",
      blockers: [SOURCE_FRESHNESS_BLOCKER],
    }
  }

  const sourceObject = runGit(["rev-parse", "--verify", `${sourceCommit}^{commit}`])
  if (!sourceObject.ok) {
    return {
      ...base,
      currentHead,
      status: "source_commit_not_found",
      blockers: [SOURCE_FRESHNESS_BLOCKER],
      error: sourceObject.error,
    }
  }

  const normalizedSourceCommit = sourceObject.stdout.trim()
  if (normalizedSourceCommit === currentHead) {
    return {
      ...base,
      currentHead,
      imageSourceCommit: normalizedSourceCommit,
      status: "current",
    }
  }

  const diff = runGit(["diff", "--name-only", `${normalizedSourceCommit}..${currentHead}`, "--"])
  if (!diff.ok) {
    return {
      ...base,
      currentHead,
      imageSourceCommit: normalizedSourceCommit,
      status: "diff_unavailable",
      blockers: [SOURCE_FRESHNESS_BLOCKER],
      error: diff.error,
    }
  }

  const changedFiles = diff.stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
  const runtimeChangedFiles = changedFiles.filter(isRuntimeSourcePath)
  const staleStatus = runtimeChangedFiles.length > 0
    ? "stale_runtime_source"
    : "stale_non_runtime_source"
  return {
    ...base,
    currentHead,
    imageSourceCommit: normalizedSourceCommit,
    status: staleStatus,
    changedFiles,
    runtimeChangedFiles,
    runtimeChangedFileCount: runtimeChangedFiles.length,
    changedFileSample: changedFiles.slice(0, 20),
    runtimeChangedFileSample: runtimeChangedFiles.slice(0, 20),
    blockers: runtimeChangedFiles.length > 0 ? [SOURCE_FRESHNESS_BLOCKER] : [],
    warnings: runtimeChangedFiles.length > 0 ? [] : ["image.sourceCommitDiffHasNoRuntimeFiles"],
  }
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024 * 5,
  })
  if (result.error) {
    return {
      ok: false,
      stdout: result.stdout || "",
      error: `${result.error.code || "git_error"}:${result.error.message}`,
    }
  }
  if (result.status !== 0) {
    return {
      ok: false,
      stdout: result.stdout || "",
      error: (result.stderr || result.stdout || `git_exit_${result.status}`)
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, 3)
        .join(" | "),
    }
  }
  return {
    ok: true,
    stdout: result.stdout || "",
    error: "",
  }
}

function isRuntimeSourcePath(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/")
  return RUNTIME_SOURCE_PATH_PATTERNS.some((pattern) => pattern.test(normalized))
}

function validateCommonValues(data, blockers) {
  const image = data.image || {}
  const acr = data.acr || {}
  const runtime = data.runtime || {}
  const commands = data.commands || {}
  const security = data.security || {}

  if (image.localTag !== EXPECTED_LOCAL_TAG) blockers.push(`image.localTag=${EXPECTED_LOCAL_TAG}`)
  if (image.dockerBuildCommand !== "corepack pnpm aliyun:docker:build") {
    blockers.push("image.dockerBuildCommand")
  }
  if (image.containerSmokeCommand !== "corepack pnpm aliyun:container:smoke") {
    blockers.push("image.containerSmokeCommand")
  }
  if (acr.provider !== EXPECTED_PROVIDER) blockers.push(`acr.provider=${EXPECTED_PROVIDER}`)
  if (acr.region !== EXPECTED_REGION) blockers.push(`acr.region=${EXPECTED_REGION}`)
  if (acr.repository !== EXPECTED_REPOSITORY) blockers.push(`acr.repository=${EXPECTED_REPOSITORY}`)
  if (acr.remoteTag !== EXPECTED_REMOTE_TAG) blockers.push(`acr.remoteTag=${EXPECTED_REMOTE_TAG}`)
  if (security.containsRegistryCredentials !== false) blockers.push("security.containsRegistryCredentials=false")
  if (!text(security.secretPolicy).includes("Do not store ACR username")) blockers.push("security.secretPolicy")

  for (const [name, command] of Object.entries(commands)) {
    const value = text(command)
    if (!value.includes(EXPECTED_LOCAL_TAG) && name === "tag") blockers.push("commands.tag.localTag")
    if (!value.includes(EXPECTED_REPOSITORY)) blockers.push(`commands.${name}.repository`)
    if (/docker\s+login/i.test(value)) blockers.push(`commands.${name}.must_not_include_docker_login`)
  }

  const remoteImage = text(acr.remoteImage)
  if (remoteImage.includes("vercel.app") || remoteImage.includes("docker.io/") || remoteImage.startsWith("localhost/")) {
    blockers.push("acr.remoteImage_forbidden_registry")
  }

  const target = text(runtime.target)
  if (target && !isTodo(target) && target !== "SAE") blockers.push("runtime.target=SAE")
}

function validateLocalValues(data, blockers) {
  const requiredLocalPaths = [
    "image.localDigest",
    "acr.registryHost",
    "acr.vpcRegistryHost",
    "acr.publicNetworkEntranceEnabled",
    "acr.namespace",
    "acr.remoteImage",
    "acr.remoteDigest",
    "acr.pushNetworkPath",
    "acr.evidence",
    "runtime.target",
    "runtime.appName",
    "runtime.imagePullCredentialMode",
    "runtime.evidence",
  ]
  for (const path of requiredLocalPaths) requireLocalField(data, path, blockers)

  const acr = data.acr || {}
  const runtime = data.runtime || {}
  if (!isSha256(data.image?.localDigest)) blockers.push("image.localDigest=sha256")
  if (data.image?.remoteDigestCoversCurrentSource === false) {
    blockers.push("image.remoteDigestCoversCurrentSource")
  }
  if (acr.confirmed !== true) blockers.push("acr.confirmed")
  if (acr.imagePushed !== true) blockers.push("acr.imagePushed")
  if (acr.digestVerified !== true) blockers.push("acr.digestVerified")
  if (!isSha256(acr.remoteDigest)) blockers.push("acr.remoteDigest=sha256")
  if (!isPushNetworkPathReady(acr)) blockers.push("acr.pushNetworkPath")
  if (runtime.confirmed !== true) blockers.push("runtime.confirmed")
  if (runtime.remoteImageConfigured !== true) blockers.push("runtime.remoteImageConfigured")
  if (runtime.imagePullConfigured !== true) blockers.push("runtime.imagePullConfigured")

  const registryHost = text(acr.registryHost)
  const namespace = text(acr.namespace)
  const remoteImage = text(acr.remoteImage)
  if (registryHost && !isTodo(registryHost) && !registryHost.includes(".aliyuncs.com")) {
    blockers.push("acr.registryHost_aliyuncs")
  }
  if (registryHost && !isTodo(registryHost) && !registryHost.includes(EXPECTED_REGION)) {
    blockers.push(`acr.registryHost_region=${EXPECTED_REGION}`)
  }
  const vpcRegistryHost = text(acr.vpcRegistryHost)
  if (vpcRegistryHost && !isTodo(vpcRegistryHost) && !vpcRegistryHost.includes("-vpc.")) {
    blockers.push("acr.vpcRegistryHost_vpc")
  }
  if (acr.pushNetworkPath === "public_registry" && acr.publicNetworkEntranceEnabled !== true) {
    blockers.push("acr.publicNetworkEntranceEnabled")
  }
  if (
    isNonTodoText(registryHost) &&
    isNonTodoText(namespace) &&
    remoteImage !== `${registryHost}/${namespace}/${EXPECTED_REPOSITORY}:${EXPECTED_REMOTE_TAG}`
  ) {
    blockers.push("acr.remoteImage_mismatch")
  }
}

function isPushNetworkPathReady(acr) {
  const pushNetworkPath = text(acr.pushNetworkPath)
  if (!pushNetworkPath || isTodo(pushNetworkPath) || pushNetworkPath.startsWith("pending")) return false
  const publicNetworkReady = acr.publicNetworkEntranceEnabled === true
  const vpcRegistryReady = isAcrVpcRegistryReady(acr)
  const cloudRunnerReady = isAcrCloudRunnerReady(acr)
  const acrRepoSyncReady = isAcrRepoSyncSourceReady(acr)
  return (
    (pushNetworkPath === "public_registry" && publicNetworkReady) ||
    (pushNetworkPath === "vpc_registry_from_aliyun_network" && vpcRegistryReady && cloudRunnerReady) ||
    (pushNetworkPath === "acr_repo_sync_existing_source_tag" && acrRepoSyncReady)
  )
}

function isAcrVpcRegistryReady(acr) {
  const endpoint = acr?.vpcEndpoint
  if (!isNonTodoText(acr?.vpcRegistryHost)) return false
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) return false
  return (
    endpoint.enabled === true &&
    endpoint.linked === true &&
    text(endpoint.status).toUpperCase() === "RUNNING" &&
    !text(endpoint.issue)
  )
}

function acrVpcRegistryBlockers(acr) {
  const endpoint = acr?.vpcEndpoint
  const blockers = []
  if (!isNonTodoText(acr?.vpcRegistryHost)) blockers.push("acr.vpcRegistryHost")
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) {
    blockers.push("acr.vpcEndpoint")
    return blockers
  }
  if (endpoint.enabled !== true) blockers.push("acr.vpcEndpoint.enabled")
  if (endpoint.linked !== true) blockers.push("acr.vpcEndpoint.linked")
  if (text(endpoint.status).toUpperCase() !== "RUNNING") blockers.push("acr.vpcEndpoint.status")
  const issue = text(endpoint.issue)
  if (issue) blockers.push(`acr.vpcEndpoint.issue:${issue}`)
  return blockers
}

function isAcrCloudRunnerReady(acr) {
  return acr?.cloudBuildRunner?.ready === true
}

function acrCloudRunnerBlockers(acr) {
  const runner = acr?.cloudBuildRunner
  const blockers = []
  if (!runner || typeof runner !== "object" || Array.isArray(runner)) {
    blockers.push("acr.cloudBuildRunner")
    return blockers
  }
  if (runner.ready !== true) blockers.push("acr.cloudBuildRunner.ready")
  const status = text(runner.status)
  if (status && !["ready", "completed"].includes(status)) blockers.push(`acr.cloudBuildRunner.status:${status}`)
  const blockedBy = text(runner.blockedBy)
  if (blockedBy) blockers.push(`acr.cloudBuildRunner.blockedBy:${blockedBy}`)
  return blockers
}

function isAcrRepoSyncSourceReady(acr) {
  const source = acr?.repoSyncSource
  return Boolean(
    source &&
    typeof source === "object" &&
    !Array.isArray(source) &&
    isNonTodoText(source.instanceId) &&
    isNonTodoText(source.repositoryId) &&
    isNonTodoText(source.tag),
  )
}

function acrRepoSyncSourceBlockers(acr) {
  const source = acr?.repoSyncSource
  const blockers = []
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    blockers.push("acr.repoSyncSource")
    return blockers
  }
  if (!isNonTodoText(source.instanceId)) blockers.push("acr.repoSyncSource.instanceId")
  if (!isNonTodoText(source.repositoryId)) blockers.push("acr.repoSyncSource.repositoryId")
  if (!isNonTodoText(source.tag)) blockers.push("acr.repoSyncSource.tag")
  return blockers
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

function inspectDockerImageReference(reference) {
  const result = spawnSync("docker", ["image", "inspect", reference, "--format", "{{json .}}"], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 1024 * 1024 * 2,
  })
  return result
}

function compactDockerOutput(result) {
  return (result.stderr || result.stdout || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" | ")
}

function classifyDockerUnavailable(result, tag) {
  if (result.error?.code === "ENOENT") {
    return {
      status: "docker_cli_missing",
      tag,
      dockerClientInstalled: false,
      dockerServerAvailable: false,
      nextEvidenceAction: "Install Docker CLI or use an Aliyun-side ACR import/VPC runner path.",
    }
  }
  if (result.error?.code === "ETIMEDOUT") {
    return {
      status: "docker_daemon_unavailable_or_timeout",
      tag,
      dockerClientInstalled: true,
      dockerServerAvailable: false,
      error: result.error.message,
      nextEvidenceAction: "Start Docker Desktop/daemon for local smoke, or use ACR import/VPC runner without relying on this machine's Docker daemon.",
    }
  }
  if (result.error) {
    return {
      status: "docker_error",
      tag,
      dockerClientInstalled: true,
      dockerServerAvailable: false,
      error: result.error.message,
      nextEvidenceAction: "Resolve the Docker command error before local smoke, or use ACR import/VPC runner.",
    }
  }
  const detail = compactDockerOutput(result)
  if (/error during connect|Cannot connect to the Docker daemon|docker\.sock/i.test(detail)) {
    return {
      status: "docker_daemon_unavailable",
      tag,
      dockerClientInstalled: true,
      dockerServerAvailable: false,
      detail,
      nextEvidenceAction: "Start Docker Desktop/daemon for local smoke, or use ACR import/VPC runner without relying on this machine's Docker daemon.",
    }
  }
  return null
}

function findLocalDockerImageListing(tag) {
  const result = spawnSync("docker", ["image", "ls", "--no-trunc", "--digests", "--format", "{{json .}}", tag], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  })
  const dockerUnavailable = classifyDockerUnavailable(result, tag)
  if (dockerUnavailable) return dockerUnavailable
  if (result.status !== 0) {
    return {
      status: "image_not_found_or_docker_unavailable",
      detail: compactDockerOutput(result),
    }
  }
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean)
  if (!lines.length) return { status: "image_not_found_or_docker_unavailable", detail: "docker image ls returned no rows" }
  try {
    return { status: "listed", listing: JSON.parse(lines[0]) }
  } catch (error) {
    return {
      status: "image_list_parse_failed",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function inspectLocalDockerImage(tag) {
  let result = inspectDockerImageReference(tag)
  let inspectedReference = tag
  let fallbackFromTagInspect = false
  const dockerUnavailable = classifyDockerUnavailable(result, tag)
  if (dockerUnavailable) return dockerUnavailable
  if (result.status !== 0) {
    const directUnavailable = classifyDockerUnavailable(result, tag)
    if (directUnavailable) return directUnavailable
    const listing = findLocalDockerImageListing(tag)
    const fallbackId = listing.listing?.ID
    if (!fallbackId || fallbackId === "<none>") {
      return {
        status: listing.status,
        tag,
        dockerClientInstalled: listing.dockerClientInstalled,
        dockerServerAvailable: listing.dockerServerAvailable,
        detail: listing.detail || listing.error || compactDockerOutput(result),
        nextEvidenceAction: listing.nextEvidenceAction || "Rebuild/smoke the local image or use ACR import/VPC runner.",
      }
    }
    result = inspectDockerImageReference(fallbackId)
    inspectedReference = fallbackId
    fallbackFromTagInspect = true
  }
  const fallbackUnavailable = classifyDockerUnavailable(result, tag)
  if (fallbackUnavailable) return fallbackUnavailable
  if (result.status !== 0) {
    return {
      status: "image_not_found_or_docker_unavailable",
      tag,
      detail: compactDockerOutput(result),
    }
  }
  try {
    const metadata = JSON.parse(result.stdout.trim().split(/\r?\n/)[0])
    return {
      status: "ready",
      tag,
      id: metadata.Id || "",
      inspectedReference,
      fallbackFromTagInspect,
      repoTags: metadata.RepoTags || [],
      repoDigests: metadata.RepoDigests || [],
      size: metadata.Size || 0,
      dockerClientInstalled: true,
      dockerServerAvailable: true,
    }
  } catch (error) {
    return {
      status: "inspect_parse_failed",
      tag,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function checkDockerContext() {
  const result = spawnSync(process.execPath, ["scripts/check-aliyun-docker-context.mjs"], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  })
  if (result.error?.code === "ENOENT") return { ok: false, status: "node_missing" }
  if (result.error?.code === "ETIMEDOUT") return { ok: false, status: "timeout" }
  if (result.error) return { ok: false, status: "error", error: result.error.message }
  if (result.status !== 0) {
    return {
      ok: false,
      status: "failed",
      detail: (result.stderr || result.stdout || "").split(/\r?\n/).filter(Boolean).slice(0, 3).join(" | "),
    }
  }
  try {
    const parsed = JSON.parse(result.stdout)
    return {
      ok: parsed.ok === true,
      status: parsed.ok === true ? "ready" : "failed",
      checkedFiles: parsed.checkedFiles || 0,
      dockerignorePatterns: parsed.dockerignorePatterns || 0,
      dockerfileSnippets: parsed.dockerfileSnippets || 0,
      sensitiveEnvExcluded: parsed.sensitiveEnvExcluded === true,
    }
  } catch (error) {
    return {
      ok: false,
      status: "parse_failed",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function skippedDockerContext() {
  return {
    ok: false,
    status: "skipped_by_explicit_flag",
    skipped: true,
    checkedFiles: 0,
    dockerignorePatterns: 0,
    dockerfileSnippets: 0,
    sensitiveEnvExcluded: false,
  }
}

function skippedLocalDockerImage(tag) {
  return {
    status: "skipped_by_explicit_flag",
    tag,
    skipped: true,
    dockerClientInstalled: false,
    dockerServerAvailable: false,
    nextEvidenceAction: "Docker probe skipped by explicit flag; use non-secret image-publish evidence for this fixture-first check.",
  }
}

function summarize(template, local) {
  const pushNetworkPlan = buildAcrPushNetworkPlan(local)
  const writebackPlan = buildImageWritebackPlan(local, pushNetworkPlan)
  const executionReadiness = buildAcrExecutionReadiness(local, {}, {}, pushNetworkPlan, writebackPlan)
  return {
    templateReady: template.ready,
    localExists: local.exists,
    localReady: local.ready,
    totalBlockers: template.blockers.length + local.blockers.length,
    totalWarnings: template.warnings.length + local.warnings.length,
    writebackBlockingGroups: writebackPlan.blockingGroups,
    requiredAuthorizationPackets: writebackPlan.requiredAuthorizationPackets,
    pushNetworkPathReady: pushNetworkPlan.selectedReady,
    recommendedPushNetworkPaths: pushNetworkPlan.recommendedPathIds,
    canStartP04AfterActionTimeConfirmation: executionReadiness.canStartP04AfterActionTimeConfirmation,
    p04StrictReady: executionReadiness.p04StrictReady,
  }
}

function fieldFromBlocker(value) {
  const blocker = String(value || "")
  const prefixed = blocker.match(/^(?:missing|todo|empty):(.+)$/)
  if (prefixed) return prefixed[1]
  const expected = blocker.match(/^([^=]+)=/)
  if (expected) return expected[1]
  return blocker
}

function uniqueStrings(values) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const item = String(value || "").trim()
    if (!item || seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

const WRITEBACK_GROUP_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "acrPurchaseAndRepository",
    title: "ACR 购买确认和镜像仓库基础信息",
    source: "阿里云控制台 -> 容器镜像服务 ACR -> 企业版实例/命名空间/镜像仓库",
    actionScope: "purchase_and_repository_only",
    canStartNow: true,
    requiresActionTimeConfirmation: true,
    requiredAuthorizationPackets: Object.freeze(["P03_ACR_PURCHASE"]),
    consoleTaskIds: Object.freeze(["C02_ACR_IMAGE_AND_PULL"]),
    blockerFields: Object.freeze(["acr.confirmed", "acr.registryHost", "acr.namespace"]),
    writeTargets: Object.freeze([
      "deploy/aliyun-production-cn.image-publish.local.json: acr.confirmed=true",
      "deploy/aliyun-production-cn.image-publish.local.json: acr.registryHost=<cn-hangzhou aliyuncs.com host>",
      "deploy/aliyun-production-cn.image-publish.local.json: acr.namespace=<actual namespace>",
    ]),
    expectedEvidence: Object.freeze([
      "ACR Enterprise Economic / cn-hangzhou / 1 month 购买或已开通确认",
      "registryHost 必须是真实 aliyuncs.com host，不能保留 TODO",
      "namespace 和 repository=meiye-huajing-app-api 已确认",
    ]),
    forbidden: Object.freeze([
      "不要写入 ACR 用户名、密码、临时 token 或 RAM Secret",
      "当前动作不执行 docker login、docker push 或 SAE 镜像拉取配置",
    ]),
    verifyCommands: Object.freeze(["corepack pnpm aliyun:image:plan"]),
  }),
  Object.freeze({
    id: "imagePushAndDigest",
    title: "镜像推送/导入 ACR 和 digest 核对",
    source: "本机 Docker + 阿里云 ACR 镜像仓库",
    actionScope: "image_push_or_import_and_digest_verification",
    canStartNow: false,
    dependsOnGroups: Object.freeze(["acrPurchaseAndRepository"]),
    requiresActionTimeConfirmation: true,
    requiredAuthorizationPackets: Object.freeze(["P04_ACR_IMAGE_AND_PULL"]),
    consoleTaskIds: Object.freeze(["C02_ACR_IMAGE_AND_PULL"]),
    blockerFields: Object.freeze([
      "acr.remoteImage",
      "acr.remoteDigest",
      "acr.evidence",
      "acr.imagePushed",
      "acr.digestVerified",
      "acr.pushNetworkPath",
      "acr.publicNetworkEntranceEnabled",
      "image.remoteDigestCoversCurrentSource",
      SOURCE_FRESHNESS_BLOCKER,
    ]),
    writeTargets: Object.freeze([
      "deploy/aliyun-production-cn.image-publish.local.json: acr.remoteImage=<registryHost>/<namespace>/meiye-huajing-app-api:production-cn",
      "deploy/aliyun-production-cn.image-publish.local.json: acr.remoteDigest=sha256:<64 hex>",
      "deploy/aliyun-production-cn.image-publish.local.json: acr.imagePushed=true",
      "deploy/aliyun-production-cn.image-publish.local.json: acr.digestVerified=true",
      "deploy/aliyun-production-cn.image-publish.local.json: acr.pushNetworkPath=public_registry|vpc_registry_from_aliyun_network|acr_repo_sync_existing_source_tag",
      "deploy/aliyun-production-cn.image-publish.local.json: acr.publicNetworkEntranceEnabled=true if pushing from local/public network",
      "deploy/aliyun-production-cn.image-publish.local.json: acr.evidence=<non-secret evidence handle>",
      "deploy/aliyun-production-cn.image-publish.local.json: acr.cloudBuildRunner.lastSuccessfulBuild.sourceCommit=<git HEAD used for the image>",
    ]),
    expectedEvidence: Object.freeze([
      "远端 ACR 镜像已推送或导入",
      "远端 digest 与推送后的 sha256 digest 已核对",
      "lastSuccessfulBuild.sourceCommit 必须等于当前 HEAD，或当前 HEAD 相对该 commit 没有运行相关文件变化",
      "已选择 ACR 推送网络路径；当前公网入口未开启时不能直接从本机走公网 registry push",
      "本地镜像仍可通过 corepack pnpm aliyun:container:smoke",
    ]),
    forbidden: Object.freeze([
      "不要把 docker login 命令、registry 密码或临时 token 写入 JSON/Markdown/git",
      "acrPurchaseAndRepository 未 ready 前不要执行镜像推送动作",
    ]),
    verifyCommands: Object.freeze([
      "corepack pnpm aliyun:container:smoke",
      "corepack pnpm aliyun:image:plan:strict",
    ]),
  }),
  Object.freeze({
    id: "saeRuntimeImagePull",
    title: "SAE runtime 指向 ACR 镜像并具备拉取权限",
    source: "阿里云控制台 -> SAE -> meiye-huajing-app-api-production-cn -> 镜像部署/拉取配置",
    actionScope: "sae_runtime_remote_image_and_pull_permission",
    canStartNow: false,
    dependsOnGroups: Object.freeze(["acrPurchaseAndRepository", "imagePushAndDigest"]),
    requiresActionTimeConfirmation: true,
    requiredAuthorizationPackets: Object.freeze(["P08_SAE_RUNTIME_SLS", "P04_ACR_IMAGE_AND_PULL"]),
    consoleTaskIds: Object.freeze(["C01_SAE_RUNTIME", "C02_ACR_IMAGE_AND_PULL"]),
    blockerFields: Object.freeze([
      "runtime.confirmed",
      "runtime.remoteImageConfigured",
      "runtime.imagePullConfigured",
      "runtime.evidence",
    ]),
    writeTargets: Object.freeze([
      "deploy/aliyun-production-cn.image-publish.local.json: runtime.confirmed=true",
      "deploy/aliyun-production-cn.image-publish.local.json: runtime.remoteImageConfigured=true",
      "deploy/aliyun-production-cn.image-publish.local.json: runtime.imagePullConfigured=true",
      "deploy/aliyun-production-cn.image-publish.local.json: runtime.evidence=<non-secret SAE evidence handle>",
    ]),
    expectedEvidence: Object.freeze([
      "SAE production-cn 自定义容器应用存在",
      "SAE 已指向 ACR remote image",
      "SAE 镜像拉取权限已配置且不需要把凭证写入本地文件",
    ]),
    forbidden: Object.freeze([
      "不要把 SAE 镜像拉取凭证、RAM Secret 或 AccessKeySecret 写入 JSON/Markdown/git",
      "不要在 env import、SLS 告警和域名完成前宣称 production-cn 可部署",
    ]),
    verifyCommands: Object.freeze([
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:readiness:cloud-ready",
    ]),
  }),
])

function buildAcrPushNetworkPlan(local) {
  const acr = local.acr || {}
  const selectedPath = text(acr.pushNetworkPath) || "pending_choose_vpc_registry_or_enable_public_network_entrance"
  const registryHost = text(acr.registryHost)
  const vpcRegistryHost = text(acr.vpcRegistryHost)
  const namespace = text(acr.namespace)
  const publicRemoteImage = isNonTodoText(registryHost) && isNonTodoText(namespace)
    ? `${registryHost}/${namespace}/${EXPECTED_REPOSITORY}:${EXPECTED_REMOTE_TAG}`
    : ""
  const vpcRemoteImage = isNonTodoText(vpcRegistryHost) && isNonTodoText(namespace)
    ? `${vpcRegistryHost}/${namespace}/${EXPECTED_REPOSITORY}:${EXPECTED_REMOTE_TAG}`
    : ""
  const publicBlockers = uniqueStrings([
    acr.publicNetworkEntranceEnabled === true ? "" : "acr.publicNetworkEntranceEnabled=false",
    isNonTodoText(registryHost) ? "" : "acr.registryHost",
    isNonTodoText(namespace) ? "" : "acr.namespace",
  ])
  const vpcBlockers = uniqueStrings([
    ...acrVpcRegistryBlockers(acr),
    ...acrCloudRunnerBlockers(acr),
    isNonTodoText(namespace) ? "" : "acr.namespace",
  ])
  const repoSyncBlockers = uniqueStrings([
    ...acrRepoSyncSourceBlockers(acr),
    isNonTodoText(namespace) ? "" : "acr.namespace",
  ])
  const candidates = [
    {
      id: "public_registry",
      title: "Local/public-network docker push to ACR public registry",
      canUseNow: publicBlockers.length === 0,
      blockers: publicBlockers,
      remoteImage: publicRemoteImage,
      commandMode: "local_docker_push_after_controlled_registry_auth",
      commandPreview: publicBlockers.length === 0
        ? `docker push ${publicRemoteImage}`
        : "blocked_until_public_registry_entrance_enabled_and_registry_host_ready",
      requiredEvidence: [
        "acr.publicNetworkEntranceEnabled=true",
        "remote digest sha256 verified after push",
        "registry credential stays in Docker credential helper or short-lived operator session only",
      ],
    },
    {
      id: "vpc_registry_from_aliyun_network",
      title: "Build and push through ACR VPC registry from an Aliyun-network runner",
      canUseNow: vpcBlockers.length === 0,
      blockers: vpcBlockers,
      remoteImage: vpcRemoteImage,
      commandMode: "docker_push_from_vpc_reachable_aliyun_runner",
      commandPreview: vpcBlockers.length === 0
        ? `docker push ${vpcRemoteImage}`
        : "blocked_until_vpc_registry_host_namespace_and_cloud_runner_ready",
      requiredEvidence: [
        "runner is in Aliyun network/VPC path that can reach the VPC registry host",
        "runner can build the current source without relying on local Docker daemon",
        "remote digest sha256 verified after push",
        "no registry credential written to JSON, Markdown, image, shell history, or git",
      ],
    },
    {
      id: "acr_repo_sync_existing_source_tag",
      title: "Use ACR repo sync only when an existing source ACR tag is available",
      canUseNow: repoSyncBlockers.length === 0,
      blockers: repoSyncBlockers,
      remoteImage: publicRemoteImage || vpcRemoteImage,
      commandMode: "acr_repo_sync_existing_source_tag",
      commandPreview: repoSyncBlockers.length === 0
        ? "create ACR repo sync task from existing source tag, then record remoteDigest and non-secret evidence handle"
        : "blocked_until_existing_source_acr_tag_is_available",
      requiredEvidence: [
        "source ACR instance/repository/tag exists and contains the intended image",
        "ACR repo sync task succeeded",
        "remote digest sha256 verified in ACR",
        "task id or console evidence handle recorded without credentials",
      ],
    },
  ]
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const selected = candidateById.get(selectedPath) || null
  const recommendedPathIds = candidates
    .filter((candidate) => candidate.canUseNow)
    .map((candidate) => candidate.id)
  return {
    selectedPath,
    selectedReady: selected?.canUseNow === true,
    selectedBlockers: selected ? selected.blockers : ["acr.pushNetworkPath"],
    publicNetworkEntranceEnabled: acr.publicNetworkEntranceEnabled === true,
    registryHost,
    vpcRegistryHost,
    recommendedPathIds,
    candidates,
    safetyBoundary: [
      "Do not run local/public docker push while acr.publicNetworkEntranceEnabled=false.",
      "Do not store docker login commands, registry passwords, RAM Secret, STS token, or cookies in files or reports.",
      "Record only push path, remote image, sha256 digest, booleans, and non-secret evidence handles.",
    ],
  }
}

function buildImageWritebackPlan(local, pushNetworkPlan = buildAcrPushNetworkPlan(local)) {
  const blockers = Array.isArray(local.blockers) ? local.blockers : []
  const baseGroups = WRITEBACK_GROUP_DEFINITIONS.map((definition) => {
    const fields = new Set(definition.blockerFields)
    const groupBlockers = blockers.filter((blocker) => fields.has(fieldFromBlocker(blocker)))
    const ready = groupBlockers.length === 0
    const completedPurchaseGroup = definition.id === "acrPurchaseAndRepository" && ready
    const group = {
      id: definition.id,
      title: definition.title,
      source: definition.source,
      actionScope: definition.actionScope,
      ready,
      canStartNow: completedPurchaseGroup ? false : Boolean(definition.canStartNow),
      dependsOnGroups: definition.dependsOnGroups || [],
      requiresActionTimeConfirmation: completedPurchaseGroup ? false : definition.requiresActionTimeConfirmation,
      requiredAuthorizationPackets: definition.requiredAuthorizationPackets,
      consoleTaskIds: definition.consoleTaskIds,
      blockers: groupBlockers,
      writeTargets: definition.writeTargets,
      expectedEvidence: definition.expectedEvidence,
      forbidden: definition.forbidden,
      verifyCommands: definition.verifyCommands,
      nonSecretEvidenceOnly: true,
    }
    if (definition.id === "imagePushAndDigest") {
      return {
        ...group,
        pushNetworkPlan: {
          selectedPath: pushNetworkPlan.selectedPath,
          selectedReady: pushNetworkPlan.selectedReady,
          selectedBlockers: pushNetworkPlan.selectedBlockers,
          recommendedPathIds: pushNetworkPlan.recommendedPathIds,
          candidates: pushNetworkPlan.candidates,
        },
      }
    }
    return group
  })
  const readyById = new Map(baseGroups.map((group) => [group.id, group.ready]))
  const groups = baseGroups.map((group) => {
    const dependsOnGroups = group.dependsOnGroups || []
    const dependenciesReady = dependsOnGroups.length > 0 && dependsOnGroups.every((id) => readyById.get(id) === true)
    return {
      ...group,
      canStartNow: group.canStartNow || (group.ready !== true && dependenciesReady),
    }
  })
  const blockingGroups = groups.filter((group) => !group.ready).map((group) => group.id)

  return {
    file: local.file,
    exists: local.exists,
    ready: local.ready,
    totalBlockers: blockers.length,
    blockingGroups,
    groups,
    requiredAuthorizationPackets: uniqueStrings(groups.flatMap((group) => group.ready ? [] : group.requiredAuthorizationPackets)),
    strictVerificationOrder: [
      "corepack pnpm aliyun:container:smoke",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:cloud:confirmations:strict",
      "corepack pnpm aliyun:readiness:cloud-ready",
      "corepack pnpm aliyun:predeploy",
    ],
    safetyBoundary: [
      "This report is local and value-free; it does not call Aliyun APIs, buy ACR, push images, configure SAE, import env, or deploy.",
      "Write only non-secret evidence handles and booleans into image-publish.local.json.",
      "Never store registry passwords, docker login output, RAM Secret, AccessKeySecret, AppSecret, STS token, or cookies.",
    ],
  }
}

function buildAcrExecutionReadiness(
  local,
  dockerContext,
  localDockerImage,
  pushNetworkPlan,
  writebackPlan,
) {
  const groupsById = new Map((writebackPlan.groups || []).map((group) => [group.id, group]))
  const purchaseReady = groupsById.get("acrPurchaseAndRepository")?.ready === true
  const imagePushGroup = groupsById.get("imagePushAndDigest") || {}
  const runtimePullGroup = groupsById.get("saeRuntimeImagePull") || {}
  const publicRegistry = (pushNetworkPlan.candidates || []).find((candidate) => candidate.id === "public_registry")
  const forbiddenTransferPathIds = (pushNetworkPlan.candidates || [])
    .filter((candidate) => candidate.canUseNow !== true && candidate.id === "public_registry")
    .map((candidate) => candidate.id)
  const recommendedTransferPathIds = pushNetworkPlan.recommendedPathIds || []
  const dockerDaemonReady = localDockerImage.dockerServerAvailable === true
  const localPublicPushReady = dockerDaemonReady && publicRegistry?.canUseNow === true
  const selectedTransferPathReady = pushNetworkPlan.selectedReady === true
  const p04StrictReady = imagePushGroup.ready === true && runtimePullGroup.ready === true

  let nextOperatorDecision = "choose_vpc_runner_or_existing_acr_source_tag"
  if (isAcrVpcRegistryReady(local.acr || {}) && !isAcrCloudRunnerReady(local.acr || {})) {
    nextOperatorDecision = "fund_ecs_postpaid_or_provide_bound_source_repo_cloud_build"
  }
  if (!purchaseReady) nextOperatorDecision = "confirm_acr_purchase_and_repository_first"
  if (selectedTransferPathReady) nextOperatorDecision = "execute_selected_transfer_path_then_record_digest"
  if (imagePushGroup.ready === true && runtimePullGroup.ready !== true) {
    nextOperatorDecision = "configure_sae_runtime_image_pull"
  }
  if (p04StrictReady) nextOperatorDecision = "preserve_ready_state_with_strict_verification"

  return {
    ready: p04StrictReady,
    canStartP04AfterActionTimeConfirmation: purchaseReady && p04StrictReady !== true,
    p04StrictReady,
    purchaseAndRepositoryReady: purchaseReady,
    selectedTransferPathReady,
    selectedTransferPath: pushNetworkPlan.selectedPath || "",
    recommendedTransferPathIds,
    forbiddenTransferPathIds,
    localPublicPushReady,
    dockerContextReady: dockerContext.ok === true,
    dockerDaemonReady,
    dockerClientInstalled: localDockerImage.dockerClientInstalled === true,
    canProceedWithoutLocalDockerDaemon: recommendedTransferPathIds.some((id) =>
      id === "vpc_registry_from_aliyun_network" || id === "acr_repo_sync_existing_source_tag"),
    nextOperatorDecision,
    postActionWritebackFields: [
      "acr.pushNetworkPath",
      "acr.remoteImage",
      "acr.remoteDigest=sha256:<64 hex>",
      "acr.imagePushed=true",
      "acr.digestVerified=true",
      "acr.evidence=<non-secret evidence handle>",
      "acr.cloudBuildRunner.lastSuccessfulBuild.sourceCommit=<git HEAD used for the image>",
      "runtime.remoteImageConfigured=true",
      "runtime.imagePullConfigured=true",
      "runtime.evidence=<non-secret SAE evidence handle>",
    ],
    verificationCommands: [
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:cloud:confirmations:backend:strict",
      "corepack pnpm aliyun:backend-cn:status",
    ],
    safetyBoundary: [
      "Do not use public_registry until acr.publicNetworkEntranceEnabled=true.",
      "Do not continue local/public docker push when Docker daemon is unavailable.",
      "Use only Docker credential helper, short-lived operator session, RAM/KMS/Secrets Manager, or Aliyun runtime settings for registry credentials.",
      "Record only selected path, remote image, sha256 digest, booleans, and non-secret evidence handles.",
    ],
  }
}

function main() {
  const args = parseArgs(process.argv)
  const template = validateFile(args.templateFile, "template")
  const local = validateFile(args.localFile, "local")
  const dockerContext = args.skipDockerProbe ? skippedDockerContext() : checkDockerContext()
  const localDockerImage = args.skipDockerProbe ? skippedLocalDockerImage(EXPECTED_LOCAL_TAG) : inspectLocalDockerImage(EXPECTED_LOCAL_TAG)
  const ready = template.ready && local.ready
  const pushNetworkPlan = buildAcrPushNetworkPlan(local)
  const writebackPlan = buildImageWritebackPlan(local, pushNetworkPlan)
  const executionReadiness = buildAcrExecutionReadiness(
    local,
    dockerContext,
    localDockerImage,
    pushNetworkPlan,
    writebackPlan,
  )
  const report = {
    ok: ready,
    ready,
    allowIncomplete: args.allowIncomplete,
    skipDockerProbe: args.skipDockerProbe,
    containsValues: false,
    summary: summarize(template, local),
    template,
    local,
    dockerContext,
    localDockerImage,
    pushNetworkPlan,
    executionReadiness,
    writebackPlan,
    nextActions: buildNextActions(local, writebackPlan, pushNetworkPlan),
  }

  console.log(JSON.stringify(report, null, 2))
  if (!ready && !args.allowIncomplete) process.exit(1)
}

function buildNextActions(local, writebackPlan, pushNetworkPlan = buildAcrPushNetworkPlan(local)) {
  const acrPurchaseReady = (writebackPlan.groups || [])
    .some((group) => group.id === "acrPurchaseAndRepository" && group.ready === true)
  const imagePushAndDigestReady = (writebackPlan.groups || [])
    .some((group) => group.id === "imagePushAndDigest" && group.ready === true)
  const saeRuntimeImagePullReady = (writebackPlan.groups || [])
    .some((group) => group.id === "saeRuntimeImagePull" && group.ready === true)
  const base = [
    "Fill only registry host, namespace, repository, image digest, booleans, and evidence handles. Do not store registry credentials.",
    "Run corepack pnpm aliyun:docker:build and corepack pnpm aliyun:container:smoke before pushing the image.",
  ]
  if (!local.exists) {
    return [
      "Copy deploy/aliyun-production-cn.image-publish.example.json to deploy/aliyun-production-cn.image-publish.local.json after ACR is chosen.",
      "If the ACR buy page is still waiting for payment, record only the non-secret purchase candidate quote and do not mark ACR as confirmed.",
      ...base,
    ]
  }
  if (!acrPurchaseReady) {
    return [
      "Record only the non-secret ACR purchase/repository evidence after action-time confirmation; do not mark ACR as confirmed before the console shows the instance and repository.",
      ...base,
    ]
  }
  if (imagePushAndDigestReady && saeRuntimeImagePullReady) {
    return [
      "P04_ACR_IMAGE_AND_PULL is locally strict-ready: ACR image push/import, remote digest, and SAE image pull evidence are recorded.",
      "Preserve the recorded digest and SAE image pull configuration unless the backend source changes and a new production-cn image is intentionally produced.",
      "Continue with the remaining backend gates: RDS API smoke/rollback, OSS runtime confirmation, secret env import, SAE health/SLS, and domain HTTPS.",
      "Run corepack pnpm aliyun:image:plan:strict as the P04 guard before any later runtime deployment.",
    ]
  }
  if (imagePushAndDigestReady && !saeRuntimeImagePullReady) {
    return [
      "ACR image push/import and remote digest evidence are confirmed; next configure SAE to use the verified production-cn image and image pull permission.",
      "Write back only runtime.confirmed, runtime.remoteImageConfigured, runtime.imagePullConfigured, runtime.imagePullCredentialMode, and non-secret SAE evidence handles.",
      "Do not push the image again unless the backend source changes and a new digest is intentionally produced.",
      "Run corepack pnpm aliyun:image:plan:strict after SAE image pull configuration is recorded.",
    ]
  }
  return [
    "ACR purchase/repository evidence is confirmed; next close P04_ACR_IMAGE_AND_PULL by pushing/importing the image and recording remote digest evidence.",
    ...base,
    pushNetworkPlan.publicNetworkEntranceEnabled
      ? "Current ACR public registry entrance is enabled; local/public docker push can be used only with controlled registry auth and no persisted credentials."
      : "Current ACR public registry entrance is not enabled; VPC registry requires an Aliyun-network runner, and ACR repo sync requires an existing source ACR tag.",
    `Recommended push network paths now: ${pushNetworkPlan.recommendedPathIds.length ? pushNetworkPlan.recommendedPathIds.join(", ") : "none"}.`,
    "Push or import the image into Aliyun ACR, configure SAE to use the remote image, then run corepack pnpm aliyun:image:plan:strict.",
  ]
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-aliyun-image-publish-plan.mjs [--allow-incomplete] [--template path] [--local path] [--skip-docker-probe]",
    "",
    "Checks the non-secret Aliyun ACR image publish plan and runtime image pull evidence.",
    "It never reads or prints registry passwords, AppSecret, AccessKey, tokens, or other secret values.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
