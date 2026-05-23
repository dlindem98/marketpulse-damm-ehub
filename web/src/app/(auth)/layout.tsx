/**
 * Auth layout — direct port of Dub's
 *   apps/web/app/app.dub.co/(auth)/layout.tsx
 *
 * Grid:
 *   grid-cols-1                          (mobile)
 *   min-[900px]:grid-cols-[1fr_440px]    (tablet)
 *   lg:grid-cols-[1fr_595px]             (desktop)
 *
 * Left:  form column with subtle grid bg + conic-gradient blob at top
 *        and the Ramp wordmark absolutely pinned to top-center.
 * Right: <SidePanel /> — testimonial card + sponsor logos.
 *
 * Visual primitives ported as inline CSS (Dub's @dub/ui Grid component
 * isn't available to us, so we recreate the dot/line grid via
 * background-image + mask-image).
 */

import Link from "next/link"
import { Wordmark } from "@/components/brand/Wordmark"
import { SidePanel } from "@/components/auth/SidePanel"
import { cn } from "@/lib/utils"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-[100dvh] grid-cols-1 min-[900px]:grid-cols-[minmax(0,1fr)_440px] lg:grid-cols-[minmax(0,1fr)_595px]">
      {/* LEFT — form column with grid background + gradient blob */}
      <div className="relative">
        {/* Background layer (grid + gradient) */}
        <div className="absolute inset-0 isolate overflow-hidden bg-white">
          {/* Subtle grid pattern, faded at top + edges */}
          <div
            className={cn(
              "absolute inset-y-0 left-1/2 w-[1200px] -translate-x-1/2",
              "[mask-composite:intersect] [mask-image:linear-gradient(black,transparent_320px),linear-gradient(90deg,transparent,black_5%,black_95%,transparent)]",
            )}
            aria-hidden
            style={{
              backgroundImage:
                "linear-gradient(to right, rgb(229 229 229) 1px, transparent 1px), linear-gradient(to bottom, rgb(229 229 229) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
              backgroundPosition: "45px 0",
            }}
          />

          {/* Conic-gradient blob behind the wordmark */}
          {[0, 1].map((idx) => (
            <div
              key={idx}
              aria-hidden
              className={cn(
                "absolute left-1/2 top-6 size-[80px] -translate-x-1/2 -translate-y-1/2 scale-x-[1.6]",
                idx === 0 ? "mix-blend-overlay" : "opacity-10",
              )}
            >
              {Array.from({ length: idx === 0 ? 2 : 1 }).map((_, inner) => (
                <div
                  key={inner}
                  className={cn(
                    "absolute -inset-16 mix-blend-overlay blur-[50px] saturate-[2]",
                    "bg-[conic-gradient(from_90deg,#F00_5deg,#EAB308_63deg,#5CFF80_115deg,#1E00FF_170deg,#855AFC_220deg,#3A8BFD_286deg,#F00_360deg)]",
                  )}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Foreground — wordmark + form */}
        <div className="relative flex min-h-[100dvh] w-full justify-center">
          <Link
            href="/"
            className="absolute left-1/2 top-4 z-10 -translate-x-1/2"
          >
            <Wordmark className="h-8" />
          </Link>
          {children}
        </div>
      </div>

      {/* RIGHT — sponsor side panel (hidden below 900px) */}
      <SidePanel />
    </div>
  )
}
