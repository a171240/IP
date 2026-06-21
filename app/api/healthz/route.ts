import { GET as appHealthGet } from "@/app/api/app/health/route"

export const runtime = "nodejs"

export const GET = appHealthGet
