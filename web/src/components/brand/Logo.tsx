/**
 * Ramp logo — a minimalist filled wedge suggesting incline / "ramp up".
 *
 * The mark is a right triangle hugging the bottom-left of a 24×24 viewbox:
 * flat base + vertical left edge + diagonal hypotenuse rising to upper-right.
 * Reads as the literal silhouette of a ramp.
 *
 * Pairs with the `Wordmark` for nav and login. Use `<Logo />` alone for
 * favicons or compact marks; `<Wordmark />` for the full nav header.
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
      {/* Filled wedge / ramp */}
      <path d="M3 21 L21 21 L3 3 Z" fill="currentColor" />
    </svg>
  )
}
