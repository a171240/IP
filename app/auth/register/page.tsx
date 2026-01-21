import RegisterClient from "./register-client"
import { safeRedirect } from "@/lib/safe-redirect"

export const dynamic = "force-dynamic"

type RegisterPageProps = {
  searchParams?: {
    redirect?: string | string[]
  }
}

export default function Page({ searchParams }: RegisterPageProps) {
  const redirectTo = safeRedirect(searchParams?.redirect).href
  return <RegisterClient redirectTo={redirectTo} />
}
