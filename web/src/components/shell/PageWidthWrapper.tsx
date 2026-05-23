/**
 * PageWidthWrapper — direct port of Dub consumer dashboard's primitive.
 * Source: apps/web/ui/layout/page-width-wrapper.tsx
 *
 *   mx-auto w-full max-w-screen-xl px-3 lg:px-6
 *
 * Centers content inside the white rounded card with consistent padding.
 */

import { cn } from "@/lib/utils"

export function PageWidthWrapper({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("mx-auto w-full max-w-screen-xl px-3 lg:px-6", className)}>
      {children}
    </div>
  )
}
