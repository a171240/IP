"use client"

import { usePathname } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { usePay } from "@/contexts/pay-context"
import { GlowButton } from "@/components/ui/obsidian-primitives"

interface PricingPayButtonProps {
  productId: string
  highlighted?: boolean
  children: React.ReactNode
  className?: string
}

export function PricingPayButton({
  productId,
  highlighted,
  children,
  className,
}: PricingPayButtonProps) {
  const pathname = usePathname()
  const { openPayDialog } = usePay()

  const handleClick = () => {
    openPayDialog(productId, pathname)
  }

  return (
    <GlowButton
      primary={highlighted}
      className={className}
      onClick={handleClick}
    >
      {children}
      <ArrowRight size={16} className="ml-2" />
    </GlowButton>
  )
}
