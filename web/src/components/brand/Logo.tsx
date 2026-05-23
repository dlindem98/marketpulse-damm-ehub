/**
 * Ramp logo — filled wedge with a subtly curved hypotenuse.
 *
 * The shape is a right triangle hugging the bottom-right of a 24x24 viewbox:
 *   - flat base along the bottom
 *   - vertical edge along the right
 *   - the diagonal hypotenuse is replaced with a quadratic-bezier curve
 *     that sags gently into the wedge (control point at 14,14)
 *
 * Reads as a smooth-onramp silhouette — minimal, geometric, no chrome.
 */

import { cn } from "@/lib/utils"

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-6 w-6", className)}
      aria-hidden
    >
      <path d="M3 21 L21 21 L21 3 Q14 14 3 21 Z" fill="currentColor" />
    </svg>
  )
}
