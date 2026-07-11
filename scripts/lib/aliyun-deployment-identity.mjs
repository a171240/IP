export const DEPLOYMENT_IDENTITY_FIELDS = Object.freeze([
  "imageDigest",
  "saeAppId",
  "saeDeploymentId",
  "saeVersionId",
  "deploymentCompletedAt",
])

const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const SAE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const PLACEHOLDER_PATTERN = /^(?:TODO|pending|TBD)(?:$|[._:-])/i

export function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

export function validationClockMs(value = Date.now()) {
  const milliseconds = value instanceof Date ? value.getTime() : Number(value)
  return Number.isFinite(milliseconds) ? milliseconds : null
}

export function canonicalIsoTimestampMs(value) {
  if (typeof value !== "string" || value !== value.trim()) return null
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) return null
  return new Date(milliseconds).toISOString() === value ? milliseconds : null
}

export function isDeploymentIdentityPlaceholder(value) {
  return typeof value === "string" && PLACEHOLDER_PATTERN.test(value)
}

export function isCanonicalImageDigest(value) {
  return typeof value === "string" && SHA256_DIGEST_PATTERN.test(value)
}

export function canonicalizeDeploymentIdentity(value, options = {}) {
  const now = validationClockMs(options.now ?? Date.now())
  if (now === null) {
    return { ok: false, errorCode: "validation_clock_invalid", identity: null }
  }
  if (!isPlainObject(value)) {
    return { ok: false, errorCode: "deployment_identity_invalid", identity: null }
  }
  const keys = Object.keys(value).sort()
  const expectedKeys = [...DEPLOYMENT_IDENTITY_FIELDS].sort()
  if (keys.length !== expectedKeys.length || !keys.every((key, index) => key === expectedKeys[index])) {
    return { ok: false, errorCode: "deployment_identity_invalid", identity: null }
  }
  for (const field of DEPLOYMENT_IDENTITY_FIELDS) {
    if (
      typeof value[field] !== "string" ||
      value[field].length === 0 ||
      value[field] !== value[field].trim() ||
      isDeploymentIdentityPlaceholder(value[field])
    ) {
      return { ok: false, errorCode: "deployment_identity_invalid", identity: null }
    }
  }
  if (!isCanonicalImageDigest(value.imageDigest)) {
    return { ok: false, errorCode: "deployment_identity_invalid", identity: null }
  }
  for (const field of ["saeAppId", "saeDeploymentId", "saeVersionId"]) {
    if (!SAE_ID_PATTERN.test(value[field])) {
      return { ok: false, errorCode: "deployment_identity_invalid", identity: null }
    }
  }
  const deploymentCompletedAtMs = canonicalIsoTimestampMs(value.deploymentCompletedAt)
  if (deploymentCompletedAtMs === null) {
    return { ok: false, errorCode: "deployment_identity_invalid", identity: null }
  }
  if (deploymentCompletedAtMs > now) {
    return { ok: false, errorCode: "deployment_identity_completed_in_future", identity: null }
  }
  return {
    ok: true,
    errorCode: null,
    identity: Object.fromEntries(DEPLOYMENT_IDENTITY_FIELDS.map((field) => [field, value[field]])),
  }
}

export function sameDeploymentIdentity(left, right) {
  if (!isPlainObject(left) || !isPlainObject(right)) return false
  return DEPLOYMENT_IDENTITY_FIELDS.every((field) => left[field] === right[field])
}

export function observeDeploymentIdentities(values, options = {}) {
  const now = validationClockMs(options.now ?? Date.now())
  if (now === null) {
    return { ready: false, errorCode: "validation_clock_invalid", identity: null }
  }
  if (!Array.isArray(values) || values.length !== 3 || values.some((value) => value === null || value === undefined)) {
    return { ready: false, errorCode: "remote_deployment_identity_missing", identity: null }
  }
  const canonical = values.map((value) => canonicalizeDeploymentIdentity(value, { now }))
  const invalid = canonical.find((item) => item.ok !== true)
  if (invalid) {
    return {
      ready: false,
      errorCode: invalid.errorCode === "deployment_identity_completed_in_future"
        ? invalid.errorCode
        : "remote_deployment_identity_invalid",
      identity: null,
    }
  }
  const identities = canonical.map((item) => item.identity)
  if (!identities.slice(1).every((identity) => sameDeploymentIdentity(identities[0], identity))) {
    return { ready: false, errorCode: "remote_deployment_identity_mixed", identity: null }
  }
  return { ready: true, errorCode: null, identity: identities[0] }
}

export function publicProvenanceErrorCode(errorCode) {
  if (!errorCode) return null
  if (errorCode === "remote_deployment_identity_missing") return "REMOTE_DEPLOYMENT_IDENTITY_UNAVAILABLE"
  if (errorCode === "remote_deployment_identity_mixed") return "REMOTE_DEPLOYMENT_IDENTITY_MIXED"
  return "REMOTE_DEPLOYMENT_IDENTITY_INVALID"
}
