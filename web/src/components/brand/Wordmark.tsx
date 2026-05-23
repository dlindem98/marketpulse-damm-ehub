/**
 * Ramp wordmark — "Ramp" text with the curved-wedge Logo placed to the right.
 * Used in the sidebar header and the login screen.
 */

import { Logo } from "./Logo"
import { cn } from "@/lib/utils"

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 text-neutral-900", className)}>
      <span className="text-[15px] font-semibold tracking-tight">Ramp</span>
      <Logo className="h-4 w-4" />
    </div>
  )
}
