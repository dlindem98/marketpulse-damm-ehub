"use client"

/**
 * Sidebar — primary navigation.
 *
 * 4 items only, matched to the Commercial Manager's actual workflow:
 *   - Inbox    : "what needs my attention this week" (the home base)
 *   - Promos   : "what's worked historically" (negotiation reference)
 *   - Ask      : "ad-hoc question, exec prep"
 *   - Settings : data freshness + persona
 *
 * Dub uses a workspace switcher + nav + user footer pattern. We mirror that
 * structure: brand mark at top, primary nav, user footer with role chip.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Inbox, Tag, MessageSquare, Activity } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/" as const, label: "Inbox", icon: Inbox, hint: "Decisions this week" },
  { href: "/promos" as const, label: "Promo library", icon: Tag, hint: "What worked, what didn't" },
  { href: "/ask" as const, label: "Ask MarketPulse", icon: MessageSquare, hint: "Plain-English Q&A" },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="h-14 px-4 flex items-center gap-2 border-b border-border">
        <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
          <Activity className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <div className="text-sm font-semibold tracking-tight">MarketPulse</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium ml-1">UK</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        <div className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Workflow
        </div>
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer — persona pill, makes the audience obvious */}
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-[11px] font-semibold">
            CM
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-medium truncate">Commercial Manager</div>
            <div className="text-[10px] text-muted-foreground truncate">UK · Damm</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
