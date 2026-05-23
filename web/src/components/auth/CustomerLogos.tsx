"use client"

/**
 * Sponsor logo grid for the login side panel.
 *
 * Plain <img> on purpose: these logos are small static files served from
 * public/sponsors, so we do not need next/image sizing or remote config.
 */

import { cn } from "@/lib/utils"

export type Sponsor = {
  name: string
  src: string
  className?: string
  tileClassName?: string
}

const SPONSORS: Sponsor[] = [
  { name: "Damm",              src: "/sponsors/damm.svg", className: "max-h-6 max-w-[88px]" },
  { name: "E-Hub",             src: "/sponsors/ehub-barcelona-upf.jpg", className: "max-h-8 max-w-[48px]" },
  { name: "The AI Collective", src: "/sponsors/the-ai-collective.svg", className: "max-h-8 max-w-[42px]" },
  {
    name: "Deleito",
    src: "/sponsors/deleito.svg",
    className: "max-h-5 max-w-[86px]",
    tileClassName: "bg-[#274a73]",
  },
  { name: "Hugging Face",      src: "/sponsors/hugging-face.svg", className: "max-h-5 max-w-[96px]" },
  { name: "opereit",           src: "/sponsors/opereit-barcelona.jpg", className: "max-h-6 max-w-[92px]" },
  {
    name: "cala",
    src: "/sponsors/cala-ai.png",
    className: "max-h-6 max-w-[78px]",
    tileClassName: "col-start-2",
  },
]

export function CustomerLogos() {
  return (
    <div className="relative z-10 mx-auto w-full max-w-[380px] px-8 pb-10 pt-4 lg:px-10">
      <div className="grid grid-cols-3 gap-2.5">
        {SPONSORS.map((sponsor) => (
          <div
            key={sponsor.name}
            className={cn(
              "flex h-12 items-center justify-center rounded-md border border-black/5 bg-white/85 px-3 shadow-sm shadow-black/[0.03]",
              sponsor.tileClassName,
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sponsor.src}
              alt={sponsor.name}
              className={cn("h-auto w-auto select-none object-contain", sponsor.className)}
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
