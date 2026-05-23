"use client"

/**
 * Sponsor logo grid for the login side panel.
 *
 * Plain <img> on purpose: dammxeh.com serves these PNGs from their own
 * CDN with `access-control-allow-origin: *`, no rewrite or proxy needed.
 * Avoids next/image remote-patterns gymnastics and the (now removed)
 * opacity-0 fill-mode dance that was leaving the logos invisible.
 *
 * If hot-linking ever breaks, drop the PNGs into web/public/sponsors/
 * and swap the `src` URLs to relative paths.
 */

import { cn } from "@/lib/utils"

export type Sponsor = {
  name: string
  src: string
  className?: string
}

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
      {SPONSORS.map((sponsor) => (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={sponsor.name}
          src={sponsor.src}
          alt={sponsor.name}
          className={cn("h-12 w-auto select-none", sponsor.className)}
          draggable={false}
        />
      ))}
    </div>
  )
}
