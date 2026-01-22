import type React from "react"
import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { MARKETING_METRICS } from "@/lib/marketing/content"
import { UtmPersist } from "@/components/analytics/utm-persist"
import "./globals.css"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
const metadataTitle = "交付周期可控｜IP内容工厂"
const metadataDescription = `统一口径与质检，返工更少、交付更稳。${MARKETING_METRICS.workflowTemplates}个工作流模板覆盖${MARKETING_METRICS.industryTemplates}行业，把定位→选题→日历→脚本→质检写进一条交付线。`

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: metadataTitle,
  description: metadataDescription,
  generator: "v0.app",
  keywords: ["商业IP", "内容交付", "工作流", "MCN", "代运营", "内容中台", "短视频脚本", "4X4"],
  openGraph: {
    title: metadataTitle,
    description: metadataDescription,
    url: "/",
    siteName: "IP内容工厂",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: metadataTitle,
    description: metadataDescription,
  },
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-visual",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange={false}>
          <UtmPersist />
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
