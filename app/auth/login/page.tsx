import LoginClient from "./login-client"
import { safeRedirect } from "@/lib/safe-redirect"

export const dynamic = "force-dynamic"

type LoginPageProps = {
  searchParams?: Promise<{ redirect?: string | string[] }> | { redirect?: string | string[] }
}

export default async function Page({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const redirectTo = safeRedirect(resolvedSearchParams?.redirect).href
  return <LoginClient redirectTo={redirectTo} />
}
