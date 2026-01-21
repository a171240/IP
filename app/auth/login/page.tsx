import LoginClient from "./login-client"
import { safeRedirect } from "@/lib/safe-redirect"

export const dynamic = "force-dynamic"

type LoginPageProps = {
  searchParams?: {
    redirect?: string | string[]
  }
}

export default function Page({ searchParams }: LoginPageProps) {
  const redirectTo = safeRedirect(searchParams?.redirect).href
  return <LoginClient redirectTo={redirectTo} />
}
