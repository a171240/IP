import "server-only"

import { createHash, randomBytes } from "crypto"

import type { PoolClient } from "pg"

import { queryAliyunRds, withAliyunRdsTransaction } from "@/lib/aliyun-rds/postgres.server"
import {
  accountContextPayload,
  canAliyunRdsInviteRole,
  getAliyunRdsAppAccountContext,
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
  max_uses: number | null
  used_count: number | null
  expires_at: string | null
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

export class StoreInviteHttpError extends Error {
  status: number
  code: string

  constructor(status: number, message: string, code: string) {
    super(message)
    this.name = "StoreInviteHttpError"
    this.status = status
    this.code = code
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

function inviteUsable(invite: InviteRow | null | undefined) {
  if (!invite || invite.status !== "active") return false
  if (Number(invite.used_count || 0) >= Number(invite.max_uses || 1)) return false
  if (!invite.expires_at) return false
  return new Date(invite.expires_at).getTime() > Date.now()
}

async function getCompany(companyId: string, client?: PoolClient) {
  const sql = "select id, name, status from public.mp_companies where id = $1 limit 1"
  const result = client
    ? await client.query<CompanyRow>(sql, [companyId])
    : await queryAliyunRds<CompanyRow>(sql, [companyId])
  return result.rows[0] || null
}

async function getStore(companyId: string, storeId: string, client?: PoolClient) {
  const sql = "select id, company_id, name, status from public.mp_stores where id = $1 and company_id = $2 limit 1"
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
  const requestedRole = cleanText(body.role || "staff", 40)
  const role = (requestedRole || "staff") as any
  if (!canAliyunRdsInviteRole(args.ctx, role)) {
    throw new StoreInviteHttpError(403, "当前账号不能邀请该角色", "role_not_allowed")
  }

  const companyId = args.ctx.companyId || cleanText(body.company_id || body.companyId, 80)
  if (!companyId) throw new StoreInviteHttpError(400, "当前账号缺少公司归属", "company_id_required")

  let storeId = cleanText(body.store_id || body.storeId || "", 80)
  if (args.ctx.isStoreManager && args.ctx.storeId) storeId = args.ctx.storeId
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

export async function getAliyunRdsStoreInvitePreview(token: string) {
  const cleanToken = cleanText(token, 500)
  if (!cleanToken) throw new StoreInviteHttpError(400, "邀请链接无效", "token_required")

  const result = await queryAliyunRds<InviteRow & { company_name: string | null; store_name: string | null }>(
    `
      select
        invite.id, invite.company_id, invite.store_id, invite.role, invite.max_uses, invite.used_count,
        invite.expires_at, invite.status, invite.note, invite.created_at,
        company.name as company_name,
        store.name as store_name
      from public.mp_account_invites invite
      left join public.mp_companies company on company.id = invite.company_id
      left join public.mp_stores store on store.id = invite.store_id
      where invite.token_hash = $1
      limit 1
    `,
    [hashAliyunRdsInviteToken(cleanToken)],
  )
  const invite = result.rows[0]
  if (!invite) throw new StoreInviteHttpError(404, "邀请链接不存在或已失效", "invite_not_found")

  return {
    ok: true,
    usable: inviteUsable(invite),
    invite: {
      id: invite.id,
      role: invite.role,
      role_label: getAliyunRdsAppAccountRoleLabel(invite.role),
      max_uses: invite.max_uses,
      used_count: invite.used_count,
      expires_at: invite.expires_at,
      status: invite.status,
      note: invite.note || "",
      company_id: invite.company_id,
      company_name: invite.company_name || "",
      store_id: invite.store_id || null,
      store_name: invite.store_name || "",
    },
  }
}

export async function assertAliyunRdsStoreInviteUsable(token: string) {
  const preview = await getAliyunRdsStoreInvitePreview(token)
  if (!preview.usable) {
    throw new StoreInviteHttpError(410, "门店入口已过期或次数已用完", "invite_expired")
  }
  return preview
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
        on conflict (user_id, company_id, store_id, role) do update
          set status = 'active',
              accepted_at = excluded.accepted_at,
              last_seen_at = excluded.last_seen_at,
              updated_at = now()
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
        set status = 'active',
            accepted_at = excluded.accepted_at,
            last_seen_at = excluded.last_seen_at,
            updated_at = now()
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
    if (!inviteUsable(invite)) throw new StoreInviteHttpError(410, "邀请链接已过期或次数已用完", "invite_expired")

    const company = await getCompany(invite.company_id, client)
    if (!company) throw new StoreInviteHttpError(404, "公司不存在", "company_not_found")
    const store = invite.store_id ? await getStore(invite.company_id, invite.store_id, client) : null

    const now = new Date().toISOString()
    const membership = await upsertMembership(client, {
      userId: user.id,
      companyId: invite.company_id,
      storeId: invite.store_id || null,
      role: invite.role,
      now,
    })
    if (!membership) throw new StoreInviteHttpError(500, "membership_create_failed", "membership_create_failed")

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
      [user.id, invite.role, company.id, company.name, store?.id || null, store?.name || null],
    )

    return { membership, company, store, role: invite.role }
  })

  const context = await getAliyunRdsAppAccountContext(user)
  return {
    ok: true,
    membership: result.membership,
    role_label: getAliyunRdsAppAccountRoleLabel(result.role),
    company: result.company,
    store: result.store,
    context: accountContextPayload(context),
  }
}
