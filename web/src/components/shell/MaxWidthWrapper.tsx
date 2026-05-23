/**
 * MaxWidthWrapper — direct port of Dub's `@dub/ui` primitive.
 * Centers content with consistent horizontal padding and a max-width.
 * Used for both the top-nav inner row and page content so they align.
 */

import { cn } from "@/lib/utils"

export function MaxWidthWrapper({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("mx-auto w-full max-w-screen-xl px-3 lg:px-10", className)}>
      {children}
    </div>
  )
}
