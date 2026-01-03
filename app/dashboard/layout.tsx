import type React from "react"
import { AuthProvider } from "@/contexts/auth-context"
import { PayProvider } from "@/contexts/pay-context"
import { PayQRDialog } from "@/components/pay-qr-dialog"
import { Navigation, ObsidianBackground } from "@/components/ui/obsidian"

export const metadata = {
  title: "Dashboard - IP内容工厂",
  description: "IP内容工厂控制面板",
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <PayProvider>
        <div className="min-h-[100dvh] bg-background text-foreground-secondary font-sans selection:bg-purple-500/30 dark:selection:text-purple-200 selection:text-purple-700 transition-colors duration-300">
          <ObsidianBackground />

          {/* Navigation Sidebar - Now uses usePathname() for dynamic active state */}
          <Navigation />

          {/* Main Content Area - Account for 84px sidebar (increased from 72px) */}
          <div className="md:pl-[84px] min-h-[100dvh] pb-[calc(4.5rem+var(--safe-area-bottom))] md:pb-0">{children}</div>
        </div>
        <PayQRDialog />
      </PayProvider>
    </AuthProvider>
  )
}
