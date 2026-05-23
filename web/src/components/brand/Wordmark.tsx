/**
 * Ramp wordmark — Logo mark + "Ramp" text. Used in the top nav and login.
 */

import { Logo } from "./Logo"
import { cn } from "@/lib/utils"

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-neutral-900", className)}>
      <Logo className="h-5 w-5" />
      <span className="text-[15px] font-semibold tracking-tight">Ramp</span>
    </div>
  )
}
