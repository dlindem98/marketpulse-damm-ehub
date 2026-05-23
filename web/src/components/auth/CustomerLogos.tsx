"use client"

/**
 * Sponsor logo grid for the login side panel.
 *
 * Direct port of Dub's apps/web/app/app.dub.co/(auth)/customer-logos.tsx
 * — same fade-in-blur animation, same flex-wrap layout, same px/py rhythm.
 *
 * Each sponsor renders as <Image> when a `logo` filename is set, or as a
 * text wordmark fallback. Drop SVGs into web/public/sponsors/ to switch.
 */

import Image from "next/image"
import { cn } from "@/lib/utils"

export type Sponsor = {
  name: string
  /** Filename inside web/public/sponsors/ (e.g. "damm.svg"). Optional. */
  logo?: string
  /** Per-logo class override (sizing tweaks per Dub's pattern). */
  className?: string
}

// The 7 hackathon sponsors, in the order they appear on dammxeh.com.
// Add the `logo` field once SVG files exist in web/public/sponsors/.
const SPONSORS: Sponsor[] = [
  { name: "Damm" },
  { name: "E-Hub" },
  { name: "The AI Collective" },
  { name: "Deleito" },
  { name: "Hugging Face" },
  { name: "opereit" },
  { name: "cala" },
]

export function CustomerLogos() {
  return (
    <div className="relative z-10 mx-auto flex max-w-md flex-wrap items-center justify-center gap-x-10 gap-y-6 px-8 pb-12 pt-6 lg:px-10">
      {SPONSORS.map((sponsor, index) => (
        <SponsorMark
          key={sponsor.name}
          sponsor={sponsor}
          style={{ animationDelay: `${500 + index * 120}ms` }}
        />
      ))}
    </div>
  )
}

function SponsorMark({
  sponsor,
  style,
}: {
  sponsor: Sponsor
  style?: React.CSSProperties
}) {
  const animClass = "animate-in fade-in slide-in-from-bottom-1 duration-700 fill-mode-both"

  if (sponsor.logo) {
    return (
      <Image
        src={`/sponsors/${sponsor.logo}`}
        alt={sponsor.name}
        width={120}
        height={24}
        className={cn("h-5 w-auto opacity-70", animClass, sponsor.className)}
        style={style}
      />
    )
  }
  // Text wordmark — used until real SVG files are added.
  return (
    <span
      className={cn(
        "text-[13px] font-semibold tracking-tight text-neutral-500",
        animClass,
        sponsor.className,
      )}
      style={style}
    >
      {sponsor.name}
    </span>
  )
}
