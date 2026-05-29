import { randomUUID } from "crypto"

import { NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

const AVATAR_BUCKET = process.env.MP_PROFILE_AVATAR_BUCKET || "mp-profile-avatars"
const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

function cleanText(value: unknown, maxLength = 80) {
  return String(value || "").trim().slice(0, maxLength)
}

function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(extra || {}) }, { status })
}

function safeMetadata(meta: unknown) {
  return meta && typeof meta === "object" ? { ...(meta as Record<string, unknown>) } : {}
}

function inferContentType(file: File) {
  const direct = cleanText(file.type, 80).toLowerCase()
  if (ALLOWED_TYPES.has(direct)) return direct

  const name = cleanText(file.name, 160).toLowerCase()
  if (name.endsWith(".png")) return "image/png"
  if (name.endsWith(".webp")) return "image/webp"
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg"
  return ""
}

function avatarExtension(contentType: string) {
  if (contentType === "image/png") return "png"
  if (contentType === "image/webp") return "webp"
  return "jpg"
}

async function ensurePublicAvatarBucket(admin: ReturnType<typeof createAdminSupabaseClient>) {
  const { data } = await admin.storage.getBucket(AVATAR_BUCKET)
  if (!data) {
    const { error } = await admin.storage.createBucket(AVATAR_BUCKET, { public: true })
    if (error && !/already exists/i.test(error.message || "")) {
      throw new Error(error.message || "avatar_bucket_create_failed")
    }
    return
  }

  const bucket = data as { public?: boolean }
  if (!bucket.public) {
    throw new Error("avatar_bucket_not_public")
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return jsonError("auth_required", 401)

  const form = await request.formData().catch(() => null)
  if (!form) return jsonError("invalid_form_data", 400)

  const file = form.get("file")
  if (!(file instanceof File)) return jsonError("missing_file", 400)

  const contentType = inferContentType(file)
  if (!contentType) return jsonError("unsupported_avatar_type", 400)
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
    return jsonError("avatar_too_large", 400, { maxBytes: MAX_AVATAR_BYTES })
  }

  let admin
  try {
    admin = createAdminSupabaseClient()
    await ensurePublicAvatarBucket(admin)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "avatar_storage_env_missing", 500)
  }

  const ext = avatarExtension(contentType)
  const path = `avatars/${user.id}/${Date.now()}-${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await admin.storage.from(AVATAR_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  })
  if (uploadError) return jsonError(uploadError.message || "avatar_upload_failed", 500)

  const { data: publicData } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  const avatarUrl = cleanText(publicData.publicUrl, 1000)
  if (!avatarUrl) return jsonError("avatar_public_url_missing", 500)

  const nickname = cleanText(form.get("nickname"), 40)
  const nextMetadata = {
    ...safeMetadata(user.user_metadata),
    ...(nickname ? { nickname } : {}),
    avatar_url: avatarUrl,
  }

  const { data: updatedUserData, error: userUpdateError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: nextMetadata,
  })
  if (userUpdateError) return jsonError(userUpdateError.message || "avatar_user_update_failed", 500)

  const profileUpdate: {
    id: string
    email: string | null
    nickname?: string
    avatar_url: string
  } = {
    id: user.id,
    email: user.email ?? null,
    avatar_url: avatarUrl,
  }
  if (nickname) profileUpdate.nickname = nickname

  const { error: profileError } = await admin.from("profiles").upsert(profileUpdate, { onConflict: "id" })
  if (profileError) return jsonError(profileError.message || "avatar_profile_update_failed", 500)

  return NextResponse.json({
    ok: true,
    avatar_url: avatarUrl,
    user: {
      id: user.id,
      email: user.email ?? null,
      user_metadata: updatedUserData.user?.user_metadata || nextMetadata,
    },
    profile: {
      nickname: nickname || null,
      avatar_url: avatarUrl,
    },
  })
}
