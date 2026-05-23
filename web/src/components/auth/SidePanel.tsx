/**
 * Right-side auth panel — direct port of Dub's
 *   apps/web/app/app.dub.co/(auth)/side-panel.tsx
 *
 * Structure:
 *   <div border-l bg-neutral-50, hidden under 900px>
 *     <conic-gradient blob at bottom-center>
 *     <Testimonial card>   - image + headline + "Read more"
 *     <CustomerLogos />    - sponsor grid at the bottom
 *   </div>
 *
 * For Ramp the "testimonial" is a self-description card (no fake customer
 * quotes — we're at a hackathon, not selling). Same visual rhythm as Dub.
 */

import Link from "next/link"
import { Logo } from "@/components/brand/Logo"
import { CustomerLogos } from "./CustomerLogos"
import { cn } from "@/lib/utils"

export function SidePanel() {
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden border-l border-black/5 bg-neutral-50 min-[900px]:flex">
      {/* Conic-gradient blob at the bottom — Dub's exact pattern */}
      {[0, 1].map((idx) => (
        <div
          key={idx}
          className={cn(
            "absolute bottom-0 left-1/2 size-[80px] -translate-x-1/2 translate-y-1/2 scale-x-[1.6]",
            idx === 0 ? "mix-blend-overlay" : "opacity-15",
          )}
        >
          {Array.from({ length: idx === 0 ? 2 : 1 }).map((_, innerIdx) => (
            <div
              key={innerIdx}
              className={cn(
                "absolute -inset-16 mix-blend-overlay blur-[50px] saturate-[2]",
                "bg-[conic-gradient(from_90deg,#F00_5deg,#EAB308_63deg,#5CFF80_115deg,#1E00FF_170deg,#855AFC_220deg,#3A8BFD_286deg,#F00_360deg)]",
              )}
            />
          ))}
        </div>
      ))}

      {/* Top — testimonial-style card, vertically centered */}
      <div className="relative flex grow items-center justify-center p-8 lg:p-14">
        <div className="flex flex-col gap-6">
          {/* Card with the Ramp wedge mark as the hero visual */}
          <div className="relative overflow-hidden rounded-xl border border-neutral-900/10 bg-white">
            <div className="aspect-[16/12] w-full flex items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-200 relative">
              <Logo className="h-28 w-28 text-neutral-900" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-neutral-900 to-transparent opacity-10" />
              <div className="absolute left-6 top-6 text-sm font-semibold tracking-tight text-neutral-900">
                Ramp
              </div>
            </div>
          </div>

          <p className="max-w-[370px] text-pretty text-xl font-medium text-neutral-900">
            Forecast the UK book. Explain the gap. Recommend the play —
            every Monday morning.
          </p>

          <Link
            href="https://github.com/GeriMan2004/marketpulse-damm-ehub"
            target="_blank"
            className="flex h-8 w-fit items-center rounded-lg bg-black/5 px-3 text-sm font-medium text-neutral-900 transition-[transform,background-color] duration-75 hover:bg-black/10 active:scale-[0.98]"
          >
            View on GitHub
          </Link>
        </div>
      </div>

      {/* Bottom — sponsor logos grid */}
      <CustomerLogos />
    </div>
  )
}
