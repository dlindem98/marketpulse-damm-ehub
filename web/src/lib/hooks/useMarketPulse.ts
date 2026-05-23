"use client"

/**
 * Market Pulse SWR hook.
 *
 * Calls GET /api/news with optional brand/channel filters. Revalidates
 * every 5 minutes and on tab focus (default SWR behaviour).
 *
 * Graceful degradation: if the endpoint 404s (backend not yet built) or
 * 500s, the hook returns `{ articles: [], updated_at: null }` instead of
 * throwing — the rail then shows its empty state. The rail must never
 * crash the page just because news is unreachable.
 */

import useSWR from "swr"
import type { NewsArticle, NewsResponse } from "@/types/news"

const EMPTY: NewsResponse = { articles: [], updated_at: null }

async function fetcher(url: string): Promise<NewsResponse> {
  let res: Response
  try {
    res = await fetch(url, { cache: "no-store" })
  } catch {
    // Network error — backend not running, etc.
    return EMPTY
  }
  if (!res.ok) {
    // 404 (endpoint not built yet) / 500 / 503 / etc — degrade silently.
    return EMPTY
  }
  try {
    return (await res.json()) as NewsResponse
  } catch {
    return EMPTY
  }
}

export type UseMarketPulseArgs = {
  brand?: string | null
  channel?: string | null
  limit?: number
}

export function useMarketPulse({ brand, channel, limit = 20 }: UseMarketPulseArgs = {}) {
  const params = new URLSearchParams()
  if (brand) params.set("brand", brand)
  if (channel) params.set("channel", channel)
  if (limit !== 20) params.set("limit", String(limit))
  const key = `/api/news${params.size ? `?${params.toString()}` : ""}`

  const { data, error, isLoading, mutate } = useSWR<NewsResponse>(key, fetcher, {
    refreshInterval: 5 * 60 * 1000,    // 5 minutes
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
    shouldRetryOnError: false,         // fetcher already swallows errors
  })

  const articles: NewsArticle[] = data?.articles ?? []
  return {
    articles,
    updatedAt: data?.updated_at ?? null,
    isLoading,
    /** Surfaced for tests only — runtime path always returns EMPTY on failure. */
    error,
    mutate,
  }
}
