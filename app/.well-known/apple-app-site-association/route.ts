import { NextResponse } from "next/server"

import {
  buildAppleAppSiteAssociationPayload,
  resolveAppleAppSiteAssociationConfig,
} from "@/lib/app-universal-link/aasa"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const config = resolveAppleAppSiteAssociationConfig()
  const payload = buildAppleAppSiteAssociationPayload(config)
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": config.ready ? "public, max-age=300, s-maxage=300" : "no-store",
  }

  if (!config.ready) {
    return NextResponse.json(
      {
        ok: false,
        service: "meiye-huajing-app-aasa",
        missing: config.missing,
        applinks: payload.applinks,
      },
      { status: 503, headers },
    )
  }

  return NextResponse.json(payload, { headers })
}
