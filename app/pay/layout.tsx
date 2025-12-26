import type React from "react"

import { AuthProvider } from "@/contexts/auth-context"

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
