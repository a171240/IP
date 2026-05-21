export function xhsCoverVersion(coverStoragePath?: string | null, updatedAt?: string | null) {
  const path = String(coverStoragePath || "").trim()
  const fileName = path.split("/").pop() || path
  const stamp = fileName.match(/cover_([^./?#]+)/)?.[1]
  if (stamp) return stamp

  return String(updatedAt || "").trim()
}

export function xhsCoverUrl(draftId: string, coverStoragePath?: string | null, updatedAt?: string | null) {
  const id = String(draftId || "").trim()
  if (!id) return null

  const version = xhsCoverVersion(coverStoragePath, updatedAt)
  const suffix = version ? `?v=${encodeURIComponent(version)}` : ""
  return `/api/mp/xhs/covers/${encodeURIComponent(id)}${suffix}`
}
