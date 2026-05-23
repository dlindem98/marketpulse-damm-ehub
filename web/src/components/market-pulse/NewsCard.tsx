"use client"

/**
 * Compact news card for the Sidebar's Market Pulse section (~210px wide).
 *
 * Layout (tight by design — every line earns its place):
 *   favicon  source.co.uk · 2h
 *   2-line headline that truncates on the third
 *   [relevant accent border-left when matching the current SKU's brand]
 *
 * Click anywhere on the card opens the article in a new tab. No summary,
 * no tag chips — at 210px both crowd the headline.
 */

import { cn } from "@/lib/utils"
import type { NewsArticle } from "@/types/news"

function relativeTime(iso: string | null): string {
  if (!iso) return ""
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diffMs = Date.now() - then
  const m = Math.round(diffMs / 60_000)
  if (m < 1) return "now"
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d`
  const w = Math.round(d / 7)
  if (w < 5) return `${w}w`
  return `${Math.round(d / 30)}mo`
}

export function NewsCard({
  article,
  relevant,
}: {
  article: NewsArticle
  relevant?: boolean
}) {
  const dateStr = relativeTime(article.published_at ?? article.fetched_at)
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    article.source_domain,
  )}&sz=64`

  // <button> + window.open so the browser doesn't show its status-bar
  // URL preview on hover. Trade-off: loses right-click "Open in new tab"
  // / middle-click behavior; for a sidebar news rail that's acceptable.
  function open() {
    window.open(article.url, "_blank", "noopener,noreferrer")
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label={article.title}
      className={cn(
        "group block w-full text-left rounded-lg border bg-white px-2.5 py-2 transition-all",
        "border-[color:var(--border)]",
        "hover:border-neutral-300 hover:shadow-xs",
        relevant && "border-l-2 border-l-[color:var(--positive)]",
      )}
    >
      {/* Source + time row */}
      <div className="flex items-center gap-1.5 text-[10px] text-[color:var(--muted-foreground)] mb-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={favicon}
          alt=""
          className="h-3 w-3 rounded-sm shrink-0"
          loading="lazy"
        />
        <span className="truncate flex-1 min-w-0">{article.source_domain}</span>
        {dateStr && <span className="tabular-nums shrink-0">{dateStr}</span>}
      </div>

      {/* Headline */}
      <div className="text-[12px] font-medium leading-snug text-[color:var(--foreground)] line-clamp-2">
        {article.title}
      </div>
    </button>
  )
}
