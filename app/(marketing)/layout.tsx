import type React from "react"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"
import { AuthProvider } from "@/contexts/auth-context"
import { PayProvider } from "@/contexts/pay-context"
import { PayQRDialog } from "@/components/pay-qr-dialog"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <PayProvider>
        <div className="relative min-h-[100dvh] bg-background text-foreground-secondary font-sans selection:bg-violet-500/30 dark:selection:text-violet-200 selection:text-violet-700 transition-colors duration-300">
          <ObsidianBackgroundLite />
          <div className="relative z-10">{children}</div>
        </div>
        <PayQRDialog />
      </PayProvider>
    </AuthProvider>
  )
}

