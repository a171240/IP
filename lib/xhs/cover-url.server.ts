import "server-only"

import { signXhsAssetUrl } from "@/lib/xhs/assets.server"
import { xhsCoverUrl } from "@/lib/xhs/cover-url"

export async function resolveXhsCoverImageUrl(
  draftId: string,
  coverStoragePath?: string | null,
  updatedAt?: string | null
) {
  const path = String(coverStoragePath || "").trim()
  if (!path) return null

  try {
    return await signXhsAssetUrl({ path })
  } catch {
    return xhsCoverUrl(draftId, path, updatedAt)
  }
}
