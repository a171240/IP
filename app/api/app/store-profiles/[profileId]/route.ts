import {
  DELETE as deleteStoreProfile,
  GET as getStoreProfile,
  PUT as putStoreProfile,
} from "@/app/api/mp/store-profiles/[profileId]/route"

export const runtime = "nodejs"

export const DELETE = deleteStoreProfile
export const GET = getStoreProfile
export const PUT = putStoreProfile
