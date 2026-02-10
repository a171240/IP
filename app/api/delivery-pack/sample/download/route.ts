import { NextResponse } from "next/server"
import { renderDeliveryPackPdf } from "@/lib/delivery-pack/pdf"
import { sampleDeliveryPackInput, sampleDeliveryPackOutput } from "@/lib/delivery-pack/sample"

export const runtime = "nodejs"

export async function GET() {
  const pdfBuffer = await renderDeliveryPackPdf(sampleDeliveryPackInput, sampleDeliveryPackOutput)
  const body = new Uint8Array(pdfBuffer).buffer
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="delivery_pack_sample.pdf"',
      "Cache-Control": "public, max-age=86400",
    },
  })
}
