import "server-only"

import { queryAliyunRds } from "@/lib/aliyun-rds/postgres.server"
import {
  normalizeSceneCardInput,
  type VoiceCoachSceneCardInput,
} from "@/lib/voice-coach/session-context"

type SceneCardRow = {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  name: string
  scene_kind: string | null
  service_name: string | null
  customer_stage: string | null
  scene_goal: string | null
  focus_stages: unknown
  likely_questions: unknown
  target_objections: unknown
  communication_method_tags: unknown
  must_cover_points: unknown
  do_not_say: unknown
  notes: string | null
}

const SCENE_CARD_WRITE_COLUMNS = [
  "name",
  "scene_kind",
  "service_name",
  "customer_stage",
  "scene_goal",
  "focus_stages",
  "likely_questions",
  "target_objections",
  "communication_method_tags",
  "must_cover_points",
  "do_not_say",
  "notes",
] as const

type SceneCardInput = ReturnType<typeof normalizeSceneCardInput>

function compactUpdate(input: SceneCardInput) {
  return SCENE_CARD_WRITE_COLUMNS.map((key) => [
    key,
    isJsonbColumn(key) ? jsonbParam(input[key]) : input[key],
  ] as const)
}

function isJsonbColumn(key: (typeof SCENE_CARD_WRITE_COLUMNS)[number]) {
  return [
    "focus_stages",
    "likely_questions",
    "target_objections",
    "communication_method_tags",
    "must_cover_points",
    "do_not_say",
  ].includes(key)
}

function jsonbParam(value: unknown) {
  return typeof value === "undefined" || value === null ? null : JSON.stringify(value)
}

export async function listAliyunRdsSceneCards(userId: string, limit: number) {
  const result = await queryAliyunRds<SceneCardRow>(
    `
      select *
      from public.voice_coach_scene_cards
      where user_id = $1
      order by updated_at desc
      limit $2
    `,
    [userId, limit],
  )
  return result.rows
}

export async function createAliyunRdsSceneCard(userId: string, rawInput: VoiceCoachSceneCardInput) {
  const input = normalizeSceneCardInput(rawInput)
  const result = await queryAliyunRds<SceneCardRow>(
    `
      insert into public.voice_coach_scene_cards (
        user_id,
        name,
        scene_kind,
        service_name,
        customer_stage,
        scene_goal,
        focus_stages,
        likely_questions,
        target_objections,
        communication_method_tags,
        must_cover_points,
        do_not_say,
        notes,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, now())
      returning *
    `,
    [
      userId,
      input.name,
      input.scene_kind,
      input.service_name,
      input.customer_stage,
      input.scene_goal,
      jsonbParam(input.focus_stages),
      jsonbParam(input.likely_questions),
      jsonbParam(input.target_objections),
      jsonbParam(input.communication_method_tags),
      jsonbParam(input.must_cover_points),
      jsonbParam(input.do_not_say),
      input.notes,
    ],
  )
  if (!result.rows[0]) throw new Error("insert_failed")
  return result.rows[0]
}

export async function getAliyunRdsSceneCard(userId: string, id: string) {
  const result = await queryAliyunRds<SceneCardRow>(
    "select * from public.voice_coach_scene_cards where id = $1 and user_id = $2 limit 1",
    [id, userId],
  )
  return result.rows[0] || null
}

export async function updateAliyunRdsSceneCard(
  userId: string,
  id: string,
  rawInput: VoiceCoachSceneCardInput,
) {
  const input = normalizeSceneCardInput(rawInput)
  const entries = compactUpdate(input)
  const assignments = entries.map(([key], index) => {
    const cast = isJsonbColumn(key) ? "::jsonb" : ""
    return `${key} = $${index + 3}${cast}`
  })
  const values = entries.map(([, value]) => value ?? null)
  const result = await queryAliyunRds<SceneCardRow>(
    `
      update public.voice_coach_scene_cards
      set ${[...assignments, "updated_at = now()"].join(", ")}
      where id = $1 and user_id = $2
      returning *
    `,
    [id, userId, ...values],
  )
  return result.rows[0] || null
}

export async function deleteAliyunRdsSceneCard(userId: string, id: string) {
  await queryAliyunRds("delete from public.voice_coach_scene_cards where id = $1 and user_id = $2", [
    id,
    userId,
  ])
}
