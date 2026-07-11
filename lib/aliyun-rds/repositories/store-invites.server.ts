import "server-only"

import { createHash, randomBytes } from "crypto"

import type { PoolClient } from "pg"

import { normalizeAppAccountRole } from "@/lib/aliyun-rds/app-authorization.server"
import { queryAliyunRds, withAliyunRdsTransaction } from "@/lib/aliyun-rds/postgres.server"
import {
  accountContextPayload,
  canAliyunRdsInviteRole,
  getAliyunRdsAppAccountRoleLabel,
  isAliyunRdsStoreScopedRole,
  type AppAccountContext,
  type AppAuthUser,
} from "@/lib/aliyun-rds/repositories/account-profile.server"

type InviteRow = {
  id: string
  company_id: string
  store_id: string | null
  role: string
  max_uses: number | string | null
  used_count: number | string | null
  expires_at: string | Date | null
  status: string | null
  note: string | null
  created_at?: string | null
}

type CompanyRow = {
  id: string
  name: string | null
  status: string | null
}

type StoreRow = {
  id: string
  company_id: string | null
  name: string | null
  status: string | null
}

type MembershipRow = {
  id: string
  user_id: string
  company_id: string | null
  store_id: string | null
  role: string | null
  status: string | null
  created_at?: string | null
}

export type StoreInviteUnusableReason =
  | "role_denied"
  | "inactive"
  | "expired"
  | "exhausted"
  | "company_inactive"
  | "store_inactive"

const STORE_INVITE_UNUSABLE_REASONS = new Set<StoreInviteUnusableReason>([
  "role_denied",
  "inactive",
  "expired",
  "exhausted",
  "company_inactive",
  "store_inactive",
])

const G1_STORE_INVITE_RAW_ROLES = new Set([
  "company_owner",
  "company_admin",
  "merchant_owner",
  "merchant_admin",
  "store_owner",
  "store_admin",
  "staff",
  "employee",
])

export class StoreInviteHttpError extends Error {
  status: number
  code: string
  reason: StoreInviteUnusableReason | null

  constructor(status: number, message: string, code: string, reason?: StoreInviteUnusableReason) {
    super(message)
    this.name = "StoreInviteHttpError"
    this.status = status
    this.code = code
    this.reason = reason && STORE_INVITE_UNUSABLE_REASONS.has(reason) ? reason : null
  }
}

function cleanText(value: unknown, max = 160) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ""
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function createAliyunRdsInviteToken() {
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

export function hashAliyunRdsInviteToken(token: string) {
  const secret = firstText(
    process.env.MP_INVITE_SECRET,
    process.env.WECHAT_LOGIN_SECRET,
    process.env.NEXTAUTH_SECRET,
    process.env.AUTH_SECRET,
  )
  return createHash("sha256").update(`${secret}:${String(token || "").trim()}`).digest("hex")
}

type StoreInviteUsabilityDecision = {
  state: "usable" | "unusable"
  usable: boolean
  unusableReason: StoreInviteUnusableReason | null
  validatedStoreId: string | null
}

function unusableInvite(reason: StoreInviteUnusableReason): StoreInviteUsabilityDecision {
  return { state: "unusable", usable: false, unusableReason: reason, validatedStoreId: null }
}

function finiteInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)
}

function timestamp(value: string | number | Date | null) {
  if (value === null) return Number.NaN
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

export function evaluateStoreInviteUsability(args: {
  invite: InviteRow
  company: CompanyRow | null
  store: StoreRow | null
  now: string | number | Date
}): StoreInviteUsabilityDecision {
  if (!G1_STORE_INVITE_RAW_ROLES.has(args.invite.role)) return unusableInvite("role_denied")
  const normalizedRole = normalizeAppAccountRole(args.invite.role, false)
  const companyScoped = normalizedRole === "company_admin"
  const storeScoped = normalizedRole === "store_manager" || normalizedRole === "employee"
  if ((!companyScoped && !storeScoped) || (companyScoped && args.invite.store_id !== null)) {
    return unusableInvite("role_denied")
  }
  if (args.invite.status !== "active") return unusableInvite("inactive")

  const expiresAt = timestamp(args.invite.expires_at)
  const now = timestamp(args.now)
  if (!Number.isFinite(expiresAt) || !Number.isFinite(now) || expiresAt <= now) {
    return unusableInvite("expired")
  }

  const maxUses = args.invite.max_uses
  const usedCount = args.invite.used_count
  if (
    !finiteInteger(maxUses)
    || !finiteInteger(usedCount)
    || Number(maxUses) <= 0
    || Number(maxUses) > 200
    || Number(usedCount) < 0
    || Number(usedCount) >= Number(maxUses)
  ) {
    return unusableInvite("exhausted")
  }

  if (
    !args.company
    || args.company.id !== args.invite.company_id
    || args.company.status !== "active"
  ) {
    return unusableInvite("company_inactive")
  }
  if (!storeScoped) {
    return { state: "usable", usable: true, unusableReason: null, validatedStoreId: null }
  }

  const rawStoreId = cleanText(args.invite.store_id, 80)
  if (
    !rawStoreId
    || !args.store
    || args.store.id !== rawStoreId
    || args.store.company_id !== args.invite.company_id
    || args.store.status !== "active"
  ) {
    return unusableInvite("store_inactive")
  }
  return { state: "usable", usable: true, unusableReason: null, validatedStoreId: args.store.id }
}

async function getCompany(companyId: string, client?: PoolClient, forShare = false) {
  const sql = `select id, name, status from public.mp_companies where id = $1 limit 1${forShare ? " for share" : ""}`
  const result = client
    ? await client.query<CompanyRow>(sql, [companyId])
    : await queryAliyunRds<CompanyRow>(sql, [companyId])
  return result.rows[0] || null
}

async function getStore(companyId: string, storeId: string, client?: PoolClient, forShare = false) {
  const sql = `select id, company_id, name, status from public.mp_stores where id = $1 and company_id = $2 limit 1${forShare ? " for share" : ""}`
  const result = client
    ? await client.query<StoreRow>(sql, [storeId, companyId])
    : await queryAliyunRds<StoreRow>(sql, [storeId, companyId])
  return result.rows[0] || null
}

export async function createAliyunRdsStoreInvite(args: {
  ctx: AppAccountContext
  user: AppAuthUser
  body: unknown
}) {
  const body = isRecord(args.body) ? args.body : {}
  const hasRequestedRole = Object.prototype.hasOwnProperty.call(body, "role")
  if (hasRequestedRole && (typeof body.role !== "string" || !body.role.trim())) {
    throw new StoreInviteHttpError(403, "当前账号不能邀请该角色", "role_not_allowed")
  }
  const role = hasRequestedRole ? cleanText(body.role, 40) : "staff"
  if (!canAliyunRdsInviteRole(args.ctx, role)) {
    throw new StoreInviteHttpError(403, "当前账号不能邀请该角色", "role_not_allowed")
  }

  const companyId = args.ctx.companyId || cleanText(body.company_id || body.companyId, 80)
  if (!companyId) throw new StoreInviteHttpError(400, "当前账号缺少公司归属", "company_id_required")

  let storeId = cleanText(body.store_id || body.storeId || "", 80)
  if (args.ctx.isStoreManager && args.ctx.storeId) storeId = args.ctx.storeId
  if (normalizeAppAccountRole(role, false) === "company_admin" && storeId) {
    throw new StoreInviteHttpError(400, "公司级角色不能绑定门店", "store_id_not_allowed")
  }
  if (isAliyunRdsStoreScopedRole(role) && !storeId) {
    throw new StoreInviteHttpError(400, "邀请员工或店长时必须选择门店", "store_id_required")
  }

  const company = await getCompany(companyId)
  if (!company) throw new StoreInviteHttpError(404, "公司不存在", "company_not_found")

  let store: StoreRow | null = null
  if (storeId) {
    store = await getStore(company.id, storeId)
    if (!store) throw new StoreInviteHttpError(404, "门店不存在", "store_not_found")
    if (args.ctx.isStoreManager && args.ctx.storeId && store.id !== args.ctx.storeId) {
      throw new StoreInviteHttpError(403, "只能邀请本店成员", "store_scope_required")
    }
  }

  const token = createAliyunRdsInviteToken()
  const maxUses = clampInt(body.max_uses || body.maxUses, 1, args.ctx.isCompanyManager ? 200 : 50, 1)
  const expiresInDays = clampInt(body.expires_in_days || body.expiresInDays, 1, 30, 7)
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const result = await queryAliyunRds<InviteRow>(
    `
      insert into public.mp_account_invites
        (company_id, store_id, role, token_hash, invited_by_user_id, max_uses, used_count, expires_at, status, note, metadata)
      values ($1, $2, $3, $4, $5, $6, 0, $7, 'active', $8, $9::jsonb)
      returning id, company_id, store_id, role, max_uses, used_count, expires_at, status, note, created_at
    `,
    [
      company.id,
      store?.id || null,
      role,
      hashAliyunRdsInviteToken(token),
      args.user.id,
      maxUses,
      expiresAt,
      cleanText(body.note || "", 240) || null,
      JSON.stringify({ created_from: "app_store_admin_production_cn_rds" }),
    ],
  )
  const invite = result.rows[0]
  if (!invite) throw new StoreInviteHttpError(500, "invite_create_failed", "invite_create_failed")

  const path = `/pages/store-admin/invite-accept/index?token=${encodeURIComponent(token)}`
  return {
    ok: true,
    context: accountContextPayload(args.ctx),
    invite: {
      ...invite,
      role_label: getAliyunRdsAppAccountRoleLabel(role),
      company_name: company.name,
      store_name: store?.name || "",
    },
    token,
    path,
  }
}

type InvitePreviewRow = InviteRow & {
  company_row_id: string | null
  company_name: string | null
  company_status: string | null
  store_row_id: string | null
  store_company_id: string | null
  store_name: string | null
  store_status: string | null
}

export async function getAliyunRdsStoreInvitePreview(token: string) {
  const cleanToken = cleanText(token, 500)
  if (!cleanToken) throw new StoreInviteHttpError(400, "邀请链接无效", "token_required")

  const result = await queryAliyunRds<InvitePreviewRow>(
    `
      select
        invite.id, invite.company_id, invite.store_id, invite.role, invite.max_uses, invite.used_count,
        invite.expires_at, invite.status, invite.note, invite.created_at,
        company.id as company_row_id,
        company.name as company_name,
        company.status as company_status,
        store.id as store_row_id,
        store.company_id as store_company_id,
        store.name as store_name,
        store.status as store_status
      from public.mp_account_invites invite
      left join public.mp_companies company on company.id = invite.company_id
      left join public.mp_stores store
        on store.id = invite.store_id
       and store.company_id = invite.company_id
      where invite.token_hash = $1
      limit 1
    `,
    [hashAliyunRdsInviteToken(cleanToken)],
  )
  const invite = result.rows[0]
  if (!invite) throw new StoreInviteHttpError(404, "邀请链接不存在或已失效", "invite_not_found")
  const company: CompanyRow | null = invite.company_row_id
    ? { id: invite.company_row_id, name: invite.company_name, status: invite.company_status }
    : null
  const store: StoreRow | null = invite.store_row_id
    ? {
        id: invite.store_row_id,
        company_id: invite.store_company_id,
        name: invite.store_name,
        status: invite.store_status,
      }
    : null
  const decision = evaluateStoreInviteUsability({
    invite,
    company,
    store,
    now: new Date(Date.now()),
  })

  return {
    ok: true,
    state: decision.state,
    usable: decision.usable,
    unusable_reason: decision.unusableReason,
    invite: {
      id: invite.id,
      role: invite.role,
      role_label: getAliyunRdsAppAccountRoleLabel(invite.role),
      max_uses: invite.max_uses,
      used_count: invite.used_count,
      expires_at: invite.expires_at,
      status: invite.status,
      note: invite.note || "",
      company_id: company?.id || null,
      company_name: company?.name || "",
      store_id: store?.id || null,
      store_name: store?.name || "",
    },
  }
}

function throwInviteUsabilityError(reason: StoreInviteUnusableReason): never {
  if (reason === "role_denied") {
    throw new StoreInviteHttpError(403, "当前邀请角色不可用", "role_denied")
  }
  throw new StoreInviteHttpError(410, "当前邀请不可用", "invite_unusable", reason)
}

export async function assertAliyunRdsStoreInviteUsable(token: string) {
  const preview = await getAliyunRdsStoreInvitePreview(token)
  if (!preview.usable) {
    throwInviteUsabilityError(preview.unusable_reason || "role_denied")
  }
  return preview
}

async function getMembershipForUpdate(client: PoolClient, args: {
  userId: string
  companyId: string
  storeId: string | null
  role: string
}) {
  if (args.storeId) {
    const result = await client.query<MembershipRow>(
      `
        select id, user_id, company_id, store_id, role, status, created_at
        from public.mp_account_memberships
        where user_id = $1 and company_id = $2 and store_id = $3 and role = $4
        limit 1
        for update
      `,
      [args.userId, args.companyId, args.storeId, args.role],
    )
    return result.rows[0] || null
  }

  const result = await client.query<MembershipRow>(
    `
      select id, user_id, company_id, store_id, role, status, created_at
      from public.mp_account_memberships
      where user_id = $1 and company_id = $2 and store_id is null and role = $3
      limit 1
      for update
    `,
    [args.userId, args.companyId, args.role],
  )
  return result.rows[0] || null
}

async function upsertMembership(client: PoolClient, args: {
  userId: string
  companyId: string
  storeId: string | null
  role: string
  now: string
}) {
  if (args.storeId) {
    const result = await client.query<MembershipRow>(
      `
        insert into public.mp_account_memberships
          (user_id, company_id, store_id, role, status, accepted_at, last_seen_at)
        values ($1, $2, $3, $4, 'active', $5, $5)
        on conflict (user_id, company_id, store_id, role) where store_id is not null do update
          set accepted_at = excluded.accepted_at,
              last_seen_at = excluded.last_seen_at,
              updated_at = now()
          where mp_account_memberships.status = 'active'
        returning id, user_id, company_id, store_id, role, status, created_at
      `,
      [args.userId, args.companyId, args.storeId, args.role, args.now],
    )
    return result.rows[0]
  }

  const result = await client.query<MembershipRow>(
    `
      insert into public.mp_account_memberships
        (user_id, company_id, store_id, role, status, accepted_at, last_seen_at)
      values ($1, $2, null, $3, 'active', $4, $4)
      on conflict (user_id, company_id, role) where store_id is null do update
        set accepted_at = excluded.accepted_at,
            last_seen_at = excluded.last_seen_at,
            updated_at = now()
        where mp_account_memberships.status = 'active'
      returning id, user_id, company_id, store_id, role, status, created_at
    `,
    [args.userId, args.companyId, args.role, args.now],
  )
  return result.rows[0]
}

export async function acceptAliyunRdsStoreInvite(token: string, user: AppAuthUser) {
  const cleanToken = cleanText(token, 500)
  if (!cleanToken) throw new StoreInviteHttpError(400, "邀请链接无效", "token_required")

  const result = await withAliyunRdsTransaction(async (client) => {
    const inviteResult = await client.query<InviteRow>(
      `
        select id, company_id, store_id, role, max_uses, used_count, expires_at, status, note
        from public.mp_account_invites
        where token_hash = $1
        limit 1
        for update
      `,
      [hashAliyunRdsInviteToken(cleanToken)],
    )
    const invite = inviteResult.rows[0]
    if (!invite) throw new StoreInviteHttpError(404, "邀请链接不存在或已失效", "invite_not_found")

    const company = await getCompany(invite.company_id, client, true)
    const store = invite.store_id ? await getStore(invite.company_id, invite.store_id, client, true) : null
    const now = new Date(Date.now()).toISOString()
    const decision = evaluateStoreInviteUsability({ invite, company, store, now })
    if (!decision.usable) throwInviteUsabilityError(decision.unusableReason || "role_denied")

    const validatedCompany = company as CompanyRow
    const validatedStore = decision.validatedStoreId ? store : null
    const role = cleanText(invite.role, 40)
    const existingMembership = await getMembershipForUpdate(client, {
      userId: user.id,
      companyId: validatedCompany.id,
      storeId: decision.validatedStoreId,
      role,
    })
    if (existingMembership && existingMembership.status !== "active") {
      throw new StoreInviteHttpError(403, "当前成员状态不可重新激活", "role_denied")
    }

    const membership = await upsertMembership(client, {
      userId: user.id,
      companyId: validatedCompany.id,
      storeId: decision.validatedStoreId,
      role,
      now,
    })
    if (!membership) throw new StoreInviteHttpError(403, "当前成员状态不可重新激活", "role_denied")

    await client.query(
      "update public.mp_account_invites set used_count = used_count + 1, updated_at = now() where id = $1",
      [invite.id],
    )
    await client.query(
      `
        update public.profiles
        set account_role = $2,
            company_id = $3,
            company_name = $4,
            store_id = $5,
            store_name = $6,
            updated_at = now()
        where id = $1
      `,
      [
        user.id,
        role,
        validatedCompany.id,
        validatedCompany.name,
        decision.validatedStoreId,
        validatedStore?.name || null,
      ],
    )

    return { membership, company: validatedCompany, store: validatedStore, role }
  })

  return {
    ok: true,
    membership: result.membership,
    role_label: getAliyunRdsAppAccountRoleLabel(result.role),
    company: result.company,
    store: result.store,
  }
}
