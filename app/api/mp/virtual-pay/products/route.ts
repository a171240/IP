import { NextResponse } from "next/server"

import { listVirtualPayProducts } from "@/lib/wechatpay/virtual-pay.server"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({ products: listVirtualPayProducts() })
}

