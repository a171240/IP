import { notFound, redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import DeliveryPackClient from "./delivery-pack-client"
import type { DeliveryPackOutput } from "@/lib/delivery-pack/schema"

export const runtime = "nodejs"

type PageProps = {
  params: Promise<{ packId: string }>
}

export default async function DeliveryPackPage({ params }: PageProps) {
  const { packId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent(`/delivery-pack/${packId}`)}`)
  }

  const { data, error } = await supabase
    .from("delivery_packs")
    .select("id, status, created_at, zip_path, output_json, error_message")
    .eq("id", packId)
    .eq("user_id", user.id)
    .single()

  if (error || !data) {
    notFound()
  }

  const output = (data.output_json || null) as DeliveryPackOutput | null

  return (
    <DeliveryPackClient
      packId={data.id}
      status={data.status}
      createdAt={data.created_at}
      errorMessage={data.error_message}
      output={output}
    />
  )
}
