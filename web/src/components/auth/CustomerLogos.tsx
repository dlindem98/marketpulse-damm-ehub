"use client"

/**
 * Sponsor logo grid for the login side panel.
 *
 * Port of Dub's apps/web/app/app.dub.co/(auth)/customer-logos.tsx —
 * same fade-in animation, same flex-wrap layout. The sponsors are
 * hot-linked from dammxeh.com's own CDN so we render the official
 * event assets without redistributing them in our repo.
 *
 * Override paths via the SPONSORS array if you later self-host.
 */

import Image from "next/image"
import { cn } from "@/lib/utils"

export type Sponsor = {
  name: string
  /** Full URL or local /sponsors/… path. */
  src: string
  /** Per-logo sizing tweak (Dub uses this to balance visual weight). */
  className?: string
}

// Order matches the strip on dammxeh.com.
// URLs come from the hackathon site's published JS bundle — same assets the
// event organizers serve on their own page.
const ASSET_HOST = "https://www.dammxeh.com/assets"
const SPONSORS: Sponsor[] = [
  { name: "Damm",              src: `${ASSET_HOST}/logo-damm-DSq7tccc.png` },
  { name: "E-Hub",             src: `${ASSET_HOST}/logo-ehub-CMUwona_.png` },
  { name: "The AI Collective", src: `${ASSET_HOST}/logo-ai-collective-XmtVKOto.png` },
  { name: "Deleito",           src: `${ASSET_HOST}/logo-deleito-Ck-EwWVV.png` },
  { name: "Hugging Face",      src: `${ASSET_HOST}/logo-hugging-face-R_eL7IP5.png` },
  { name: "opereit",           src: `${ASSET_HOST}/logo-opereit-CknSoVOc.png` },
  { name: "cala",              src: `${ASSET_HOST}/logo-cala-BjdnwRM4.png` },
]

export function CustomerLogos() {
  return (
    <div className="relative z-10 mx-auto flex max-w-md flex-wrap items-center justify-center gap-x-8 gap-y-5 px-8 pb-12 pt-6 lg:px-10">
      {SPONSORS.map((sponsor, index) => (
        <Image
          key={sponsor.name}
          src={sponsor.src}
          alt={sponsor.name}
          width={140}
          height={48}
          unoptimized
          className={cn(
            "h-10 w-auto opacity-0 animate-in fade-in slide-in-from-bottom-1 duration-700 fill-mode-both",
            sponsor.className,
          )}
          style={{ animationDelay: `${500 + index * 120}ms` }}
        />
      ))}
    </div>
  )
}
