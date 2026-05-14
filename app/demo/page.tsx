import DemoClient from "./demo-client"

type DemoSearchParams = Record<string, string | string[] | undefined>

type DemoPageProps = {
  searchParams?: Promise<DemoSearchParams>
}

function getParam(
  searchParams: DemoSearchParams | undefined,
  key: string
): string | undefined {
  const value = searchParams?.[key]
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function DemoPage({ searchParams }: DemoPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const utm = {
    utm_source: getParam(resolvedSearchParams, "utm_source"),
    utm_medium: getParam(resolvedSearchParams, "utm_medium"),
    utm_campaign: getParam(resolvedSearchParams, "utm_campaign"),
    utm_content: getParam(resolvedSearchParams, "utm_content"),
    utm_term: getParam(resolvedSearchParams, "utm_term"),
  }

  return <DemoClient utm={utm} calendlyUrl={process.env.CALENDLY_URL} />
}
