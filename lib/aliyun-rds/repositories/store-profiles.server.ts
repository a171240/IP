import "server-only"

import { queryAliyunRds } from "@/lib/aliyun-rds/postgres.server"

export type StoreProfileAuthUser = {
  id: string
  email?: string | null
  user_metadata?: unknown
}

export type StoreProfileCreateInput = {
  name: string
  city?: string | null
  district?: string | null
  landmark?: string | null
  shop_type?: string | null
  main_offer_name?: string | null
  main_offer_duration_min?: number | null
  included_steps?: unknown
  promises?: unknown
}

export type StoreProfileUpdateInput = Partial<StoreProfileCreateInput>

type StoreProfileRow = {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  name: string
  city: string | null
  district: string | null
  landmark: string | null
  shop_type: string | null
  main_offer_name: string | null
  main_offer_duration_min: number | null
  included_steps?: unknown
  promises?: unknown
  boss_drive_video_path?: string | null
  boss_portrait_path?: string | null
  product_images?: unknown
  avatar_consent_meta?: unknown
}

const STORE_PROFILE_LIST_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "name",
  "city",
  "district",
  "landmark",
  "shop_type",
  "main_offer_name",
  "main_offer_duration_min",
  "promises",
].join(", ")

const STORE_PROFILE_WRITE_COLUMNS = [
  "name",
  "city",
  "district",
  "landmark",
  "shop_type",
  "main_offer_name",
  "main_offer_duration_min",
  "included_steps",
  "promises",
] as const

function metadataText(meta: unknown, key: string) {
  if (!meta || typeof meta !== "object") return ""
  const value = (meta as Record<string, unknown>)[key]
  return typeof value === "string" ? value.trim() : ""
}

async function ensureProfileRowExists(user: StoreProfileAuthUser) {
  const nickname = metadataText(user.user_metadata, "nickname") || user.email?.split("@")[0] || "User"
  const avatarUrl = metadataText(user.user_metadata, "avatar_url") || null
  await queryAliyunRds(
    `
      insert into public.profiles (id, email, nickname, avatar_url, plan, credits_balance, credits_unlimited)
      values ($1, $2, $3, $4, 'free', 30, false)
      on conflict (id) do update
        set email = coalesce(excluded.email, public.profiles.email),
            nickname = coalesce(public.profiles.nickname, excluded.nickname),
            avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
            updated_at = now()
    `,
    [user.id, user.email ?? null, nickname, avatarUrl],
  )
}

function compactUpdate(input: StoreProfileUpdateInput) {
  return STORE_PROFILE_WRITE_COLUMNS
    .filter((key) => Object.prototype.hasOwnProperty.call(input, key))
    .map((key) => [key, key === "included_steps" || key === "promises" ? jsonbParam(input[key]) : input[key]] as const)
}

function jsonbParam(value: unknown) {
  return typeof value === "undefined" || value === null ? null : JSON.stringify(value)
}

export async function listAliyunRdsStoreProfiles(userId: string, limit: number) {
  const result = await queryAliyunRds<Pick<
    StoreProfileRow,
    | "id"
    | "created_at"
    | "updated_at"
    | "name"
    | "city"
    | "district"
    | "landmark"
    | "shop_type"
    | "main_offer_name"
    | "main_offer_duration_min"
    | "promises"
  >>(
    `
      select ${STORE_PROFILE_LIST_COLUMNS}
      from public.store_profiles
      where user_id = $1
      order by updated_at desc
      limit $2
    `,
    [userId, limit],
  )
  return result.rows
}

export async function createAliyunRdsStoreProfile(user: StoreProfileAuthUser, input: StoreProfileCreateInput) {
  await ensureProfileRowExists(user)
  const result = await queryAliyunRds<{ id: string; created_at: string }>(
    `
      insert into public.store_profiles (
        user_id,
        name,
        city,
        district,
        landmark,
        shop_type,
        main_offer_name,
        main_offer_duration_min,
        included_steps,
        promises,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, now())
      returning id, created_at
    `,
    [
      user.id,
      input.name,
      input.city || null,
      input.district || null,
      input.landmark || null,
      input.shop_type || null,
      input.main_offer_name || null,
      typeof input.main_offer_duration_min === "number" ? input.main_offer_duration_min : null,
      jsonbParam(input.included_steps),
      jsonbParam(input.promises),
    ],
  )
  if (!result.rows[0]) throw new Error("insert_failed")
  return result.rows[0]
}

export async function getAliyunRdsStoreProfile(userId: string, id: string) {
  const result = await queryAliyunRds<StoreProfileRow>(
    "select * from public.store_profiles where id = $1 and user_id = $2 limit 1",
    [id, userId],
  )
  return result.rows[0] || null
}

export async function updateAliyunRdsStoreProfile(userId: string, id: string, input: StoreProfileUpdateInput) {
  const entries = compactUpdate(input)
  const assignments = entries.map(([key], index) => `${key} = $${index + 3}`)
  const values = entries.map(([, value]) => value ?? null)
  const result = await queryAliyunRds<StoreProfileRow>(
    `
      update public.store_profiles
      set ${[...assignments, "updated_at = now()"].join(", ")}
      where id = $1 and user_id = $2
      returning *
    `,
    [id, userId, ...values],
  )
  return result.rows[0] || null
}

export async function deleteAliyunRdsStoreProfile(userId: string, id: string) {
  await queryAliyunRds("delete from public.store_profiles where id = $1 and user_id = $2", [id, userId])
}
