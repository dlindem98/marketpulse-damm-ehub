/**
 * Empty / no-data state for the Market Pulse rail.
 *
 * Shown when:
 *   - The backend endpoint doesn't exist yet (404)
 *   - TAVILY_API_KEY is missing (endpoint returns [])
 *   - Tavily is down and the cache is empty
 *   - Nothing matched the current SKU's brand
 *
 * Stays visible (instead of hiding the rail) so the user trusts the
 * surface is live, not broken.
 */

import { Newspaper } from "lucide-react"

export function EmptyState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--muted)]">
        <Newspaper className="h-4 w-4 text-[color:var(--muted-foreground)]" />
      </div>
      <div className="text-[12.5px] font-medium text-[color:var(--foreground)]">
        No recent market events
      </div>
      <div className="text-[11px] leading-snug text-[color:var(--muted-foreground)] max-w-[200px]">
        {message ?? "We'll surface UK beer & grocer headlines here as soon as the next refresh lands."}
      </div>
    </div>
  )
}
