import "server-only"

export const APP_FEATURE_KEYS = [
  "auth",
  "account",
  "home",
  "entitlements",
  "orders",
  "service_record",
  "service_record_review",
  "store_admin",
  "member_invite",
  "company_admin",
  "platform_admin",
  "professional_learning",
  "speech_library",
  "voice_coach",
  "knowledge_context",
  "store_profiles",
  "customer_knowledge_base",
  "content",
  "poster",
  "xiaohongshu",
  "private_copy",
  "content_studio",
  "content_library",
] as const

export type AppFeatureKey = (typeof APP_FEATURE_KEYS)[number]
export type AppAccountStatus = "bound" | "not_bound" | "role_denied" | "suspended" | "inactive"
export type AppNormalizedRole =
  | "employee"
  | "store_manager"
  | "company_admin"
  | "customer"
  | "platform_admin"
  | "guest"
export type AppFeatureReason = "ok" | "not_bound" | "role_denied" | "entitlement_denied" | "suspended" | "inactive"
export type AppFeatureSource = "account" | "membership" | "ai_points" | "platform"
export type AppFeatureDecision = {
  enabled: boolean
  reason: AppFeatureReason
  source: AppFeatureSource
}
export type AppFeatureDecisions = Record<AppFeatureKey, AppFeatureDecision>

export type AppAuthorizationAccount = {
  accountStatus: AppAccountStatus
  userId: string
  membershipId: string | null
  role: unknown
  companyId: string | null
  storeId: string | null
  isCompanyManager: boolean
  isStoreManager: boolean
  isPlatformAdmin: boolean
}

export type AppAuthorizationBilling = {
  aiPointsBalance: number
  aiPointsUnlimited: boolean
}

export type AppRequestedTenantScope = {
  companyId?: string | null
  storeId?: string | null
}

export type AppAuthorizationErrorCode = Exclude<AppFeatureReason, "ok"> | "tenant_scope_denied"

const RECOVERY_FEATURES = new Set<AppFeatureKey>(["auth", "account"])
const TENANT_BASE_FEATURES = new Set<AppFeatureKey>([
  "home",
  "entitlements",
  "orders",
  "service_record",
  "professional_learning",
  "speech_library",
  "knowledge_context",
  "store_profiles",
  "customer_knowledge_base",
  "content_library",
])
const AI_POINT_FEATURES = new Set<AppFeatureKey>([
  "voice_coach",
  "content",
  "poster",
  "xiaohongshu",
  "private_copy",
  "content_studio",
])
const MANAGER_FEATURES = new Set<AppFeatureKey>(["service_record_review", "store_admin", "member_invite"])
const COMPANY_FEATURES = new Set<AppFeatureKey>(["company_admin"])
const PLATFORM_FEATURES = new Set<AppFeatureKey>(["platform_admin"])
const FEATURE_KEY_SET = new Set<string>(APP_FEATURE_KEYS)
const FEATURE_REASON_SET = new Set<string>([
  "ok",
  "not_bound",
  "role_denied",
  "entitlement_denied",
  "suspended",
  "inactive",
])
const FEATURE_SOURCE_SET = new Set<string>(["account", "membership", "ai_points", "platform"])
const AUTHORIZATION_ERROR_CODE_SET = new Set<string>([
  "not_bound",
  "role_denied",
  "entitlement_denied",
  "suspended",
  "inactive",
  "tenant_scope_denied",
])

const NORMALIZED_ROLE_MAP: Record<string, AppNormalizedRole> = {
  company_owner: "company_admin",
  company_admin: "company_admin",
  merchant_owner: "company_admin",
  merchant_admin: "company_admin",
  store_owner: "store_manager",
  store_admin: "store_manager",
  staff: "employee",
  employee: "employee",
  customer: "customer",
}

function decision(enabled: boolean, reason: AppFeatureReason, source: AppFeatureSource): AppFeatureDecision {
  return { enabled, reason, source }
}

function accountDenialReason(account: AppAuthorizationAccount, role: AppNormalizedRole): AppFeatureReason | null {
  if (account.accountStatus === "not_bound") return "not_bound"
  if (account.accountStatus === "role_denied") return "role_denied"
  if (account.accountStatus === "suspended") return "suspended"
  if (account.accountStatus === "inactive") return "inactive"
  if (account.accountStatus !== "bound") return "role_denied"
  if (role === "guest" || role === "customer") return "role_denied"
  return null
}

function isFeatureDecision(value: unknown): value is AppFeatureDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const keys = Object.keys(value)
  if (keys.length !== 3 || !keys.includes("enabled") || !keys.includes("reason") || !keys.includes("source")) {
    return false
  }

  const candidate = value as Record<string, unknown>
  if (typeof candidate.enabled !== "boolean") return false
  if (typeof candidate.reason !== "string" || !FEATURE_REASON_SET.has(candidate.reason)) return false
  if (typeof candidate.source !== "string" || !FEATURE_SOURCE_SET.has(candidate.source)) return false
  return candidate.enabled ? candidate.reason === "ok" : candidate.reason !== "ok"
}

function normalizedScopeIdentifier(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

function isAuthorizationErrorCode(value: unknown): value is AppAuthorizationErrorCode {
  return typeof value === "string" && AUTHORIZATION_ERROR_CODE_SET.has(value)
}

function hasActiveTenantScope(account: AppAuthorizationAccount, role: AppNormalizedRole) {
  if (role === "platform_admin") return true
  if (!account.membershipId || !account.companyId) return false
  if ((role === "employee" || role === "store_manager") && !account.storeId) return false
  return true
}

function featureAllowsRole(feature: AppFeatureKey, role: AppNormalizedRole) {
  if (TENANT_BASE_FEATURES.has(feature) || AI_POINT_FEATURES.has(feature)) {
    return role === "employee" || role === "store_manager" || role === "company_admin" || role === "platform_admin"
  }
  if (MANAGER_FEATURES.has(feature)) {
    return role === "store_manager" || role === "company_admin" || role === "platform_admin"
  }
  if (COMPANY_FEATURES.has(feature)) return role === "company_admin" || role === "platform_admin"
  if (PLATFORM_FEATURES.has(feature)) return role === "platform_admin"
  return false
}

function featureDecision(
  feature: AppFeatureKey,
  account: AppAuthorizationAccount,
  billing: AppAuthorizationBilling,
): AppFeatureDecision {
  if (RECOVERY_FEATURES.has(feature)) return decision(true, "ok", "account")

  const role = normalizeAppAccountRole(account.role, account.isPlatformAdmin === true)
  const accountReason = accountDenialReason(account, role)
  if (accountReason) return decision(false, accountReason, "account")
  if (!featureAllowsRole(feature, role)) return decision(false, "role_denied", "membership")
  if (!hasActiveTenantScope(account, role)) return decision(false, "not_bound", "account")

  if (AI_POINT_FEATURES.has(feature)) {
    const hasPoints = billing.aiPointsUnlimited === true || Number(billing.aiPointsBalance) > 0
    return hasPoints
      ? decision(true, "ok", "ai_points")
      : decision(false, "entitlement_denied", "ai_points")
  }

  return decision(true, "ok", role === "platform_admin" ? "platform" : "membership")
}

export function normalizeAppAccountRole(role: unknown, isPlatformAdmin: boolean): AppNormalizedRole {
  if (isPlatformAdmin === true) return "platform_admin"
  const rawRole = String(role || "").trim()
  return NORMALIZED_ROLE_MAP[rawRole] || "guest"
}

export function buildAppFeatureDecisions(
  account: AppAuthorizationAccount,
  billing: AppAuthorizationBilling,
): AppFeatureDecisions {
  const entries = APP_FEATURE_KEYS.map((feature) => [feature, featureDecision(feature, account, billing)])
  return Object.fromEntries(entries) as AppFeatureDecisions
}

export function getAppFeatureDecision(
  decisions: unknown,
  feature: string,
): AppFeatureDecision {
  if (
    decisions &&
    typeof decisions === "object" &&
    !Array.isArray(decisions) &&
    FEATURE_KEY_SET.has(feature) &&
    Object.prototype.hasOwnProperty.call(decisions, feature)
  ) {
    const featureDecisionResult = (decisions as Record<string, unknown>)[feature]
    if (isFeatureDecision(featureDecisionResult)) return featureDecisionResult
  }
  return decision(false, "entitlement_denied", "account")
}

export function canAccessAppTenantScope(
  account: AppAuthorizationAccount,
  requestedScope: AppRequestedTenantScope,
) {
  if (!requestedScope || typeof requestedScope !== "object" || Array.isArray(requestedScope)) return false

  const hasRequestedCompanyId = Object.prototype.hasOwnProperty.call(requestedScope, "companyId")
  const hasRequestedStoreId = Object.prototype.hasOwnProperty.call(requestedScope, "storeId")
  if (!hasRequestedCompanyId && !hasRequestedStoreId) return false

  const requestedCompanyId = normalizedScopeIdentifier(requestedScope.companyId)
  const requestedStoreId = normalizedScopeIdentifier(requestedScope.storeId)
  if (hasRequestedCompanyId && !requestedCompanyId) return false
  if (hasRequestedStoreId && !requestedStoreId) return false
  if (account.accountStatus !== "bound") return false
  if (account.isPlatformAdmin === true) return true
  if (!account.membershipId || !account.companyId) return false

  const role = normalizeAppAccountRole(account.role, false)
  if (role === "company_admin") {
    return hasRequestedCompanyId && !hasRequestedStoreId && requestedCompanyId === account.companyId
  }
  if (role !== "employee" && role !== "store_manager") return false
  if (!hasRequestedStoreId || requestedStoreId !== account.storeId) return false
  if (hasRequestedCompanyId && requestedCompanyId !== account.companyId) return false
  return true
}

export function appAuthorizationErrorResponse(code: unknown, feature?: string) {
  const safeCode = isAuthorizationErrorCode(code) ? code : "entitlement_denied"
  const body: { ok: false; code: AppAuthorizationErrorCode; feature?: AppFeatureKey } = {
    ok: false,
    code: safeCode,
  }
  if (feature && FEATURE_KEY_SET.has(feature)) body.feature = feature as AppFeatureKey
  return { ok: false as const, status: 403 as const, body }
}

export function requireAppFeatureAccess(
  account: AppAuthorizationAccount,
  decisions: unknown,
  feature: string,
  requestedScope?: AppRequestedTenantScope,
) {
  const featureDecisionResult = getAppFeatureDecision(decisions, feature)
  if (featureDecisionResult.enabled !== true || featureDecisionResult.reason !== "ok") {
    return appAuthorizationErrorResponse(featureDecisionResult.reason, feature)
  }
  if (requestedScope && !canAccessAppTenantScope(account, requestedScope)) {
    return appAuthorizationErrorResponse("tenant_scope_denied", feature)
  }
  return { ok: true as const, account }
}
