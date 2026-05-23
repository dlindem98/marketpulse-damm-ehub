/**
 * Interim NewsArticle type for the Market Pulse rail.
 *
 * Shape mirrors the backend NewsArticle Pydantic model defined in the
 * handoff (backend/app/models/news_article.py). Once the backend endpoint
 * lands and we regenerate openapi-fetch types, swap this for
 *   `import type { components } from "@/lib/api.gen"`
 *   `type NewsArticle = components["schemas"]["NewsArticle"]`
 * and delete this file. The shape should stay identical so nothing else
 * changes.
 */

export type NewsArticle = {
  id: string              // url hash
  url: string
  title: string
  summary: string
  source_domain: string
  /** ISO datetime string. May be null when Tavily didn't surface a date. */
  published_at: string | null
  fetched_at: string
  brand_tags: string[]
  channel_tags: string[]
  event_tags: string[]
  relevance_score: number
}

export type NewsResponse = {
  articles: NewsArticle[]
  /** ISO datetime string for the last successful refresh. */
  updated_at: string | null
}
