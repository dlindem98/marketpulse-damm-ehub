/**
 * Right-side auth panel for the login page.
 */

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

      {/* Top — product card, vertically centered */}
      <div className="relative flex grow items-center justify-center p-8 lg:p-14">
        <div className="flex flex-col gap-6">
          <div className="relative overflow-hidden rounded-xl border border-neutral-900/10 bg-white">
            <div className="aspect-[16/12] w-full flex items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-200 relative">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-neutral-900 to-transparent opacity-10" />
              <div className="flex items-center gap-4 text-neutral-900">
                <span className="text-[44px] font-semibold tracking-tight leading-none">
                  Ramp
                </span>
                <Logo className="h-12 w-12" />
              </div>
            </div>
          </div>

          <p className="max-w-[370px] text-pretty text-xl font-medium text-neutral-900">
            Sign in to review the UK book, understand forecast gaps, and
            choose the next commercial play.
          </p>
        </div>
      </div>

      {/* Bottom — sponsor logos grid */}
      <CustomerLogos />
    </div>
  )
}
