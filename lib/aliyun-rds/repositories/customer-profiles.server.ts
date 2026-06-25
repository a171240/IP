import "server-only"

import { queryAliyunRds } from "@/lib/aliyun-rds/postgres.server"
import {
  normalizeCustomerProfileInput,
  type VoiceCoachCustomerProfileInput,
} from "@/lib/voice-coach/session-context"

type CustomerProfileRow = {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  name: string
  age_label: string | null
  occupation: string | null
  personality_tags: unknown
  communication_style: string | null
  core_concerns: unknown
  trust_triggers: unknown
  past_experience: string | null
  notes: string | null
}

const CUSTOMER_PROFILE_WRITE_COLUMNS = [
  "name",
  "age_label",
  "occupation",
  "personality_tags",
  "communication_style",
  "core_concerns",
  "trust_triggers",
  "past_experience",
  "notes",
] as const

type CustomerProfileInput = ReturnType<typeof normalizeCustomerProfileInput>

function compactUpdate(input: CustomerProfileInput) {
  return CUSTOMER_PROFILE_WRITE_COLUMNS.map((key) => [
    key,
    key === "personality_tags" || key === "core_concerns" || key === "trust_triggers"
      ? jsonbParam(input[key])
      : input[key],
  ] as const)
}

function jsonbParam(value: unknown) {
  return typeof value === "undefined" || value === null ? null : JSON.stringify(value)
}

export async function listAliyunRdsCustomerProfiles(userId: string, limit: number) {
  const result = await queryAliyunRds<CustomerProfileRow>(
    `
      select *
      from public.voice_coach_customer_profiles
      where user_id = $1
      order by updated_at desc
      limit $2
    `,
    [userId, limit],
  )
  return result.rows
}

export async function createAliyunRdsCustomerProfile(userId: string, rawInput: VoiceCoachCustomerProfileInput) {
  const input = normalizeCustomerProfileInput(rawInput)
  const result = await queryAliyunRds<CustomerProfileRow>(
    `
      insert into public.voice_coach_customer_profiles (
        user_id,
        name,
        age_label,
        occupation,
        personality_tags,
        communication_style,
        core_concerns,
        trust_triggers,
        past_experience,
        notes,
        updated_at
      )
      values ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9, $10, now())
      returning *
    `,
    [
      userId,
      input.name,
      input.age_label,
      input.occupation,
      jsonbParam(input.personality_tags),
      input.communication_style,
      jsonbParam(input.core_concerns),
      jsonbParam(input.trust_triggers),
      input.past_experience,
      input.notes,
    ],
  )
  if (!result.rows[0]) throw new Error("insert_failed")
  return result.rows[0]
}

export async function getAliyunRdsCustomerProfile(userId: string, id: string) {
  const result = await queryAliyunRds<CustomerProfileRow>(
    "select * from public.voice_coach_customer_profiles where id = $1 and user_id = $2 limit 1",
    [id, userId],
  )
  return result.rows[0] || null
}

export async function updateAliyunRdsCustomerProfile(
  userId: string,
  id: string,
  rawInput: VoiceCoachCustomerProfileInput,
) {
  const input = normalizeCustomerProfileInput(rawInput)
  const entries = compactUpdate(input)
  const assignments = entries.map(([key], index) => `${key} = $${index + 3}`)
  const values = entries.map(([, value]) => value ?? null)
  const result = await queryAliyunRds<CustomerProfileRow>(
    `
      update public.voice_coach_customer_profiles
      set ${[...assignments, "updated_at = now()"].join(", ")}
      where id = $1 and user_id = $2
      returning *
    `,
    [id, userId, ...values],
  )
  return result.rows[0] || null
}

export async function deleteAliyunRdsCustomerProfile(userId: string, id: string) {
  await queryAliyunRds("delete from public.voice_coach_customer_profiles where id = $1 and user_id = $2", [
    id,
    userId,
  ])
}
