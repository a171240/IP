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
    "namespace",
    "repository",
    "remoteTag",
    "remoteImage",
    "remoteDigest",
    "imagePushed",
    "digestVerified",
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
  if (mode === "local") validateLocalValues(data, blockers)

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
    },
    acr: {
      registryHost: data.acr?.registryHost || "",
      namespace: data.acr?.namespace || "",
      repository: data.acr?.repository || "",
      remoteImage: data.acr?.remoteImage || "",
      imagePushed: data.acr?.imagePushed === true,
      digestVerified: data.acr?.digestVerified === true,
    },
    runtime: {
      target: data.runtime?.target || "",
      appName: data.runtime?.appName || "",
      remoteImageConfigured: data.runtime?.remoteImageConfigured === true,
      imagePullConfigured: data.runtime?.imagePullConfigured === true,
    },
  }
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
    "acr.namespace",
    "acr.remoteImage",
    "acr.remoteDigest",
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
  if (acr.confirmed !== true) blockers.push("acr.confirmed")
  if (acr.imagePushed !== true) blockers.push("acr.imagePushed")
  if (acr.digestVerified !== true) blockers.push("acr.digestVerified")
  if (!isSha256(acr.remoteDigest)) blockers.push("acr.remoteDigest=sha256")
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
  if (
    isNonTodoText(registryHost) &&
    isNonTodoText(namespace) &&
    remoteImage !== `${registryHost}/${namespace}/${EXPECTED_REPOSITORY}:${EXPECTED_REMOTE_TAG}`
  ) {
    blockers.push("acr.remoteImage_mismatch")
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

function inspectDockerImageReference(reference) {
  const result = spawnSync("docker", ["image", "inspect", reference, "--format", "{{json .}}"], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 1024 * 1024 * 2,
  })
  return result
}

function findLocalDockerImageListing(tag) {
  const result = spawnSync("docker", ["image", "ls", "--no-trunc", "--digests", "--format", "{{json .}}", tag], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  })
  if (result.error?.code === "ENOENT") {
    return { status: "docker_cli_missing" }
  }
  if (result.error) {
    return { status: "docker_error", error: result.error.message }
  }
  if (result.status !== 0) {
    return {
      status: "image_not_found_or_docker_unavailable",
      detail: (result.stderr || result.stdout || "").split(/\r?\n/).filter(Boolean).slice(0, 3).join(" | "),
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
  if (result.error?.code === "ENOENT") {
    return { status: "docker_cli_missing", tag }
  }
  if (result.error) {
    return { status: "docker_error", tag, error: result.error.message }
  }
  if (result.status !== 0) {
    const listing = findLocalDockerImageListing(tag)
    const fallbackId = listing.listing?.ID
    if (!fallbackId || fallbackId === "<none>") {
      return {
        status: listing.status,
        tag,
        detail: listing.detail || listing.error || (result.stderr || result.stdout || "").split(/\r?\n/).filter(Boolean).slice(0, 3).join(" | "),
      }
    }
    result = inspectDockerImageReference(fallbackId)
    inspectedReference = fallbackId
    fallbackFromTagInspect = true
  }
  if (result.error?.code === "ENOENT") {
    return { status: "docker_cli_missing", tag }
  }
  if (result.error) {
    return { status: "docker_error", tag, error: result.error.message }
  }
  if (result.status !== 0) {
    return {
      status: "image_not_found_or_docker_unavailable",
      tag,
      detail: (result.stderr || result.stdout || "").split(/\r?\n/).filter(Boolean).slice(0, 3).join(" | "),
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
    }
  } catch (error) {
    return {
      status: "inspect_parse_failed",
      tag,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function summarize(template, local) {
  return {
    templateReady: template.ready,
    localExists: local.exists,
    localReady: local.ready,
    totalBlockers: template.blockers.length + local.blockers.length,
    totalWarnings: template.warnings.length + local.warnings.length,
  }
}

function main() {
  const args = parseArgs(process.argv)
  const template = validateFile(args.templateFile, "template")
  const local = validateFile(args.localFile, "local")
  const localDockerImage = inspectLocalDockerImage(EXPECTED_LOCAL_TAG)
  const ready = template.ready && local.ready
  const report = {
    ok: ready,
    ready,
    allowIncomplete: args.allowIncomplete,
    containsValues: false,
    summary: summarize(template, local),
    template,
    local,
    localDockerImage,
    nextActions: [
      "Copy deploy/aliyun-production-cn.image-publish.example.json to deploy/aliyun-production-cn.image-publish.local.json after ACR is chosen.",
      "Fill only registry host, namespace, repository, image digest, booleans, and evidence handles. Do not store registry credentials.",
      "Run corepack pnpm aliyun:docker:build and corepack pnpm aliyun:container:smoke before pushing the image.",
      "Push or import the image into Aliyun ACR, configure SAE to use the remote image, then run corepack pnpm aliyun:image:plan:strict.",
    ],
  }

  console.log(JSON.stringify(report, null, 2))
  if (!ready && !args.allowIncomplete) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-aliyun-image-publish-plan.mjs [--allow-incomplete] [--template path] [--local path]",
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
