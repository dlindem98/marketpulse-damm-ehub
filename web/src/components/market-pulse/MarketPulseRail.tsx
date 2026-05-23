"use client"

/**
 * Market Pulse — persistent left rail of UK beer/grocer trade-press news.
 *
 * Sits between the Sidebar and the main content card in the (app) layout,
 * styled as a third "card-on-tray" column to match the existing chrome:
 *
 *   [Sidebar 304px] [MarketPulse 300px] [main white card]
 *
 * Hidden below `lg` (handoff: no mobile rail in Phase 1).
 *
 * Context-awareness on the decision page:
 *   - usePathname() detects /decision/[sku]/[channel]
 *   - looks up that SKU's brand via /api/meta (cheap, SWR'd, cached)
 *   - passes brand to useMarketPulse so the backend orders matching
 *     articles first
 *   - flags those rows with the "Relevant" chip + positive border
 *
 * The rail never blocks the page: a missing /api/news endpoint, missing
 * TAVILY_API_KEY, or downed backend all degrade to the empty state.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import { useMemo } from "react"
import { useMarketPulse } from "@/lib/hooks/useMarketPulse"
import { NewsCard } from "./NewsCard"
import { EmptyState } from "./EmptyState"
import { Skeleton } from "@/components/ui/skeleton"

type MetaSku = { id: string; brand?: string; label?: string }
type MetaResponse = { skus?: MetaSku[] }

const metaFetcher = async (url: string): Promise<MetaResponse | null> => {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as MetaResponse
  } catch {
    return null
  }
}

/** Normalise a brand string to the keyword tag used by the backend tagger. */
function brandToTag(brand: string | null | undefined): string | null {
  if (!brand) return null
  const b = brand.toLowerCase()
  if (b.includes("estrella")) return "estrella"
  if (b.includes("cruzcampo")) return "cruzcampo"
  if (b.includes("madri")) return "madri"
  if (b.includes("san miguel")) return "san_miguel"
  return null
}

function useContextBrand(): { brand: string | null; brandTag: string | null } {
  const pathname = usePathname()
  const sku = useMemo(() => {
    if (!pathname?.startsWith("/decision/")) return null
    const parts = pathname.split("/")
    return parts[2] ? decodeURIComponent(parts[2]) : null
  }, [pathname])

  // Only fetch meta when we actually have a SKU to look up.
  const { data: meta } = useSWR<MetaResponse | null>(
    sku ? "/api/meta" : null,
    metaFetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 },
  )

  const brand = useMemo(() => {
    if (!sku || !meta?.skus) return null
    return meta.skus.find((s) => s.id === sku)?.brand ?? null
  }, [sku, meta])

  return { brand, brandTag: brandToTag(brand) }
}

function formatUpdated(iso: string | null): string {
  if (!iso) return "Awaiting refresh"
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ""
  const m = Math.round(ms / 60_000)
  if (m < 1) return "Updated just now"
  if (m < 60) return `Updated ${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `Updated ${h}h ago`
  return `Updated ${Math.round(h / 24)}d ago`
}

export function MarketPulseRail() {
  const { brandTag } = useContextBrand()
  const { articles, updatedAt, isLoading } = useMarketPulse({ brand: brandTag })

  return (
    <aside
      // Hidden below lg per handoff spec.
      // Width 300px fixed — sits on the gray tray as its own rounded card,
      // matching the Sidebar's areas-card style.
      className="hidden lg:flex w-[300px] shrink-0 h-screen sticky top-0 py-2"
    >
      <div className="flex h-full w-full flex-col rounded-xl bg-[color:var(--card)] border border-[color:var(--border)] overflow-hidden">
        {/* Header */}
        <header className="px-4 pt-3.5 pb-3 border-b border-[color:var(--border)]">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--muted-foreground)]">
              Market Pulse
            </h3>
            <span className="text-[10px] text-[color:var(--muted-foreground)] tabular-nums">
              {formatUpdated(updatedAt)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)] leading-snug">
            UK beer & grocer headlines — context only, never enters the model.
          </p>
        </header>

        {/* Body — scrolls independently */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoading && articles.length === 0 ? (
            <div className="space-y-2 px-1.5 py-1">
              <Skeleton className="h-[88px] w-full rounded-lg" />
              <Skeleton className="h-[88px] w-full rounded-lg" />
              <Skeleton className="h-[88px] w-full rounded-lg" />
            </div>
          ) : articles.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-0.5">
              {articles.slice(0, 20).map((article) => {
                const isRelevant = !!brandTag && article.brand_tags.includes(brandTag)
                return (
                  <li key={article.id}>
                    <NewsCard article={article} relevant={isRelevant} />
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer credit */}
        <div className="border-t border-[color:var(--border)] px-3 py-2 text-[10px] text-[color:var(--muted-foreground)]">
          Sourced via{" "}
          <Link
            href="https://tavily.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[color:var(--foreground)] hover:underline"
          >
            Tavily
          </Link>
        </div>
      </div>
    </aside>
  )
}
