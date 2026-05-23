/**
 * Ramp logo — two parallel ramps (a short one in front, a tall one behind),
 * each shaped like a soft-edged forward slash. Reads as motion / inclining
 * traffic without any text.
 *
 * Native viewBox is 512×300; both shapes use `fill="currentColor"` so the
 * mark inherits whatever colour the parent sets via Tailwind text-*.
 */

import { cn } from "@/lib/utils"

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-6 w-6", className)}
      aria-hidden
    >
      <path
        d="M48 235 Q42 235 46 229 L118 148 Q122 144 128 144 L196 144 Q204 144 198 151 L126 232 Q122 236 116 236 Z"
        fill="currentColor"
      />
      <path
        d="M155 235 Q149 235 153 229 L305 67 Q309 62 316 62 L401 62 Q409 62 403 69 L251 231 Q247 236 240 236 Z"
        fill="currentColor"
      />
    </svg>
  )
}
