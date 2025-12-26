import { Suspense } from "react"

import { PayPageClient } from "./pay-page-client"

export default function PayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <PayPageClient />
    </Suspense>
  )
}
