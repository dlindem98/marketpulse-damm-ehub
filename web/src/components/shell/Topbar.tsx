"use client"

/**
 * Topbar — thin breadcrumb row.
 *
 * Right side hosts the data-freshness indicator (when was the last snapshot built).
 * This matters: a Commercial Manager negotiates with a grocer using THESE numbers,
 * so seeing "as of 2 hours ago" or "as of yesterday 6pm" is critical trust signal.
 */

import { usePathname } from "next/navigation"
import { Clock } from "lucide-react"

const TITLES: Record<string, string> = {
  "/": "Inbox",
  "/promos": "Promo library",
  "/ask": "Ask MarketPulse",
}

function titleFor(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname]
  if (pathname.startsWith("/decision/")) return "Decision"
  return ""
}

export function Topbar({ snapshotDate }: { snapshotDate?: string }) {
  const pathname = usePathname()
  const title = titleFor(pathname)
  return (
    <header className="h-12 border-b border-border bg-card/50 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-6">
      <div className="text-[13px] text-muted-foreground">
        <span className="text-foreground font-medium">{title}</span>
      </div>
      {snapshotDate && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          Data as of {snapshotDate}
        </div>
      )}
    </header>
  )
}
