import DeliveryPackClient from "../[packId]/delivery-pack-client"
import { sampleDeliveryPackOutput, samplePackId } from "@/lib/delivery-pack/sample"

export const runtime = "nodejs"

export default function DeliveryPackSamplePage() {
  return (
    <DeliveryPackClient
      packId={samplePackId}
      status="done"
      createdAt="2026-02-01T00:00:00.000Z"
      output={sampleDeliveryPackOutput}
      downloadUrl="/api/delivery-pack/sample/download"
    />
  )
}
