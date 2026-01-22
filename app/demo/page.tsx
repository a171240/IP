import DemoClient from "./demo-client"

type DemoPageProps = {
  searchParams?: Record<string, string | string[] | undefined>
}

function getParam(
  searchParams: DemoPageProps["searchParams"],
  key: string
): string | undefined {
  const value = searchParams?.[key]
  if (Array.isArray(value)) return value[0]
  return value
}

export default function DemoPage({ searchParams }: DemoPageProps) {
  const utm = {
    utm_source: getParam(searchParams, "utm_source"),
    utm_medium: getParam(searchParams, "utm_medium"),
    utm_campaign: getParam(searchParams, "utm_campaign"),
    utm_content: getParam(searchParams, "utm_content"),
    utm_term: getParam(searchParams, "utm_term"),
  }

  return <DemoClient utm={utm} calendlyUrl={process.env.CALENDLY_URL} />
}
