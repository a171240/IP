import RegisterClient from "./register-client"
import { safeRedirect } from "@/lib/safe-redirect"

export const dynamic = "force-dynamic"

type RegisterPageProps = {
  searchParams?: Promise<{
    redirect?: string | string[]
  }>
}

export default async function Page({ searchParams }: RegisterPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const redirectTo = safeRedirect(resolvedSearchParams?.redirect).href
  return <RegisterClient redirectTo={redirectTo} />
}
