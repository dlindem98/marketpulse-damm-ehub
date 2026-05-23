"use client"

/**
 * A single article in the Market Pulse rail.
 *
 * Layout (per the handoff spec):
 *   - Top row: favicon (16px) + source domain + relative time (right)
 *   - Headline: 2 lines max, truncated
 *   - Tag chips: 1-2 most relevant
 *   - Click anywhere: opens url in a new tab
 *
 * Relevance accent: when `relevant` is true, render a 2px left border in
 * --positive and a small "Relevant" chip. This is the context-aware
 * highlight on the decision page when the article matches the SKU's brand.
 */

import { cn } from "@/lib/utils"
import type { NewsArticle } from "@/types/news"

const TAG_LABELS: Record<string, string> = {
  // Brands
  estrella: "Estrella",
  cruzcampo: "Cruzcampo",
  madri: "Madri",
  san_miguel: "San Miguel",
  competitor: "Competitor",
  // Channels
  tesco: "Tesco",
  sainsburys: "Sainsbury's",
  asda: "Asda",
  morrisons: "Morrisons",
  waitrose: "Waitrose",
  on_trade: "On-trade",
  // Events
  price: "Price",
  launch: "Launch",
  delisting: "Delisting",
  weather: "Weather",
  regulation: "Regulation",
}

function tagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag.replace(/_/g, " ")
}

function relativeTime(iso: string | null): string {
  if (!iso) return ""
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diffMs = Date.now() - then
  const m = Math.round(diffMs / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d`
  const w = Math.round(d / 7)
  if (w < 5) return `${w}w`
  return `${Math.round(d / 30)}mo`
}

/** Pick the 1-2 most informative tags from all three buckets. */
function pickDisplayTags(a: NewsArticle): string[] {
  // Priority: event > brand > channel. Event is the "what happened",
  // brand/channel is the "who".
  const picked: string[] = []
  if (a.event_tags[0]) picked.push(a.event_tags[0])
  if (a.brand_tags[0]) picked.push(a.brand_tags[0])
  else if (a.channel_tags[0]) picked.push(a.channel_tags[0])
  return picked.slice(0, 2)
}

export function NewsCard({
  article,
  relevant,
}: {
  article: NewsArticle
  relevant?: boolean
}) {
  const tags = pickDisplayTags(article)
  const dateStr = relativeTime(article.published_at ?? article.fetched_at)
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    article.source_domain,
  )}&sz=64`

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group block rounded-lg border border-transparent px-3 py-2.5 transition-colors",
        "hover:bg-[color:var(--muted)]",
        relevant && "border-l-2 border-l-[color:var(--positive)] bg-[color:var(--positive-soft)]/30",
      )}
    >
      {/* Top row: source + time */}
      <div className="flex items-center gap-1.5 text-[10.5px] text-[color:var(--muted-foreground)] mb-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={favicon}
          alt=""
          className="h-3.5 w-3.5 rounded-sm shrink-0"
          loading="lazy"
        />
        <span className="truncate flex-1">{article.source_domain}</span>
        {dateStr && (
          <span className="tabular-nums shrink-0">{dateStr}</span>
        )}
      </div>

      {/* Headline */}
      <div className="text-[13px] font-medium leading-snug text-[color:var(--foreground)] line-clamp-2 group-hover:text-[color:var(--foreground)]">
        {article.title}
      </div>

      {/* Tag chips */}
      {(relevant || tags.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {relevant && (
            <span className="inline-flex items-center rounded-md bg-[color:var(--positive)] px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-white">
              Relevant
            </span>
          )}
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-md bg-[color:var(--muted)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--muted-foreground)]"
            >
              {tagLabel(t)}
            </span>
          ))}
        </div>
      )}
    </a>
  )
}
