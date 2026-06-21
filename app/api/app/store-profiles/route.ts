import { GET as getStoreProfiles, POST as postStoreProfiles } from "@/app/api/mp/store-profiles/route"

export const runtime = "nodejs"

export const GET = getStoreProfiles
export const POST = postStoreProfiles
