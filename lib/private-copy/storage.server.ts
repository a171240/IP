import "server-only"

import { createHash } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  type PrivateCopyCustomerProfile,
  type PrivateCopyGenerateRequest,
  type PrivateCopyOutput,
  type PrivateCopyRisk,
} from "@/lib/private-copy/types"

type RequestSupabase = SupabaseClient

export function privateCopyInputHash(input: PrivateCopyGenerateRequest) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

export function privateCopyPreviewText(outputs: PrivateCopyOutput[], fallback: string) {
  const text = outputs[0]?.text || fallback || ""
  return text.replace(/\s+/g, " ").trim().slice(0, 80)
}

export async function loadPrivateCopyCustomerProfile(opts: {
  supabase: RequestSupabase
  userId: string
  customerProfileId?: string
}) {
  const id = (opts.customerProfileId || "").trim()
  if (!id) return null

  const { data, error } = await opts.supabase
    .from("voice_coach_customer_profiles")
    .select("*")
    .eq("id", id)
    .eq("user_id", opts.userId)
    .maybeSingle()

  if (error) throw new Error(error.message || "customer_profile_query_failed")
  if (!data) throw new Error("customer_profile_not_found")
  return data as PrivateCopyCustomerProfile
}

export async function loadPrivateCopyDraft(opts: {
  supabase: RequestSupabase
  userId: string
  draftId: string
}) {
  const { data, error } = await opts.supabase
    .from("private_copy_drafts")
    .select("*")
    .eq("id", opts.draftId)
    .eq("user_id", opts.userId)
    .maybeSingle()

  if (error) throw new Error(error.message || "private_copy_draft_query_failed")
  return data
}

export async function createPrivateCopyDraft(opts: {
  supabase: RequestSupabase
  userId: string
  request: PrivateCopyGenerateRequest
  inputHash: string
}) {
  const now = new Date().toISOString()
  const { data, error } = await opts.supabase
    .from("private_copy_drafts")
    .insert({
      user_id: opts.userId,
      module: opts.request.module,
      scene: opts.request.scene || null,
      channel: opts.request.channel || null,
      status: "generating",
      input: opts.request.input,
      input_hash: opts.inputHash,
      customer_profile_id: opts.request.customer_profile_id || null,
      variant_of: opts.request.variant_of || null,
      updated_at: now,
    })
    .select("id")
    .single()

  if (error || !data?.id) throw new Error(error?.message || "private_copy_draft_create_failed")
  return data.id as string
}

export async function markPrivateCopyDraftSuccess(opts: {
  supabase: RequestSupabase
  userId: string
  draftId: string
  outputs: PrivateCopyOutput[]
  usageTips: string[]
  risk: PrivateCopyRisk
  cost: number
  plan: string
  model: string
}) {
  const now = new Date().toISOString()
  const preview = privateCopyPreviewText(opts.outputs, "")
  const { error } = await opts.supabase
    .from("private_copy_drafts")
    .update({
      status: "draft",
      outputs: opts.outputs,
      usage_tips: opts.usageTips,
      risk_level: opts.risk.level,
      risk_flags: opts.risk.flags,
      preview_text: preview || null,
      credits_cost: opts.cost,
      plan_at_generate: opts.plan,
      model_provider: "deepseek",
      model_name: opts.model,
      error_message: null,
      updated_at: now,
    })
    .eq("id", opts.draftId)
    .eq("user_id", opts.userId)

  if (error) throw new Error(error.message || "private_copy_draft_update_failed")
}

export async function markPrivateCopyDraftFailed(opts: {
  supabase: RequestSupabase
  userId: string
  draftId: string
  errorMessage: string
}) {
  await opts.supabase
    .from("private_copy_drafts")
    .update({
      status: "failed",
      error_message: opts.errorMessage.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.draftId)
    .eq("user_id", opts.userId)
}
