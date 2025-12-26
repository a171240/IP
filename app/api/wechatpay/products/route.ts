import { NextResponse } from "next/server"

import { listWechatpayProducts } from "@/lib/wechatpay/products"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({ products: listWechatpayProducts() })
}

