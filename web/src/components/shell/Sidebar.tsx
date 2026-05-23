"use client"

/**
 * Sidebar — single-panel shell.
 *
 * Restructured away from Dub's two-pane (64px rail + 240px card) layout
 * because Ramp has a single product surface — the 64px product-switcher
 * rail was cargo-cult. Single 280px panel with the Ramp wordmark up top,
 * sections in the middle, profile at the bottom, news bounded between
 * Recent and the footer (so it stops extending to the screen edge).
 *
 *   <aside w-[280px] bg-neutral-200 (tray)>
 *     <inner card rounded-xl bg-neutral-100>
 *       [Header — fixed]
 *         <Logo + "Ramp"> + <workspace chip>
 *       [Divider]
 *       [Scroll region — flex-1]
 *         WORKFLOW            (section label, Dub-style sentence case)
 *           NavLink Inbox  12
 *           NavLink Promos 47
 *           NavLink Ask
 *         RECENT              (when populated)
 *           RecentRow x 5
 *         NEWS                (flex-1, inner scroll, bounded)
 *           NewsCard x 20
 *       [Divider]
 *       [Footer — fixed]
 *         <Avatar> Sarah Whitfield <chevron menu>
 *
 * Section labels follow Dub's pattern (small, sentence-case, muted) — much
 * lighter visually than the prior "Workflow" h3 lg.
 */

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import {
  ChevronDown, Inbox, Tag, FileText, LogOut, Settings,
  User as UserIcon,
} from "lucide-react"
import { Logo } from "@/components/brand/Logo"
import { NewsCard } from "@/components/market-pulse/NewsCard"
import { Skeleton } from "@/components/ui/skeleton"
import { useMarketPulse } from "@/lib/hooks/useMarketPulse"
import { useCriticalGapCount, usePromoLibrarySize } from "@/lib/hooks/useNavCounts"
import { cn } from "@/lib/utils"

type NavHref = "/" | "/promos" | "/brief"

type NavItem = {
  href: NavHref
  label: string
  icon: typeof Inbox
}

const NAV: NavItem[] = [
  { href: "/",       label: "Inbox",  icon: Inbox },
  { href: "/promos", label: "Promos", icon: Tag },
  { href: "/brief",  label: "Briefs", icon: FileText },
]

// ──────────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userOpen, setUserOpen] = useState(false)
  const [newsOpen, setNewsOpen] = useState(false)

  function signOut() {
    document.cookie = "mp_session=; path=/; max-age=0; samesite=lax"
    router.push("/login")
    router.refresh()
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname.startsWith("/decision")
    // Brief nav matches any /brief/* path so the item highlights regardless
    // of which customer's brief is currently open.
    if (href.startsWith("/brief")) return pathname.startsWith("/brief")
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const criticalCount = useCriticalGapCount()
  const promoCount = usePromoLibrarySize()
  const { articles, isLoading: newsLoading } = useMarketPulse()

  return (
    <aside
      data-print-hide
      className="hidden lg:flex sticky top-0 h-screen w-[280px] shrink-0 bg-neutral-200 p-2"
    >
      <div className="flex flex-col flex-1 min-w-0 rounded-xl bg-neutral-100 overflow-hidden">
        {/* ── Header: Ramp wordmark (left) + user avatar (right) ────────── */}
        <div className="px-3 pt-3 pb-2 shrink-0 flex items-center justify-between gap-2">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-md px-1.5 py-1 -mx-1.5 outline-none transition-colors hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-black/30"
            title="Ramp — Inbox"
          >
            <span className="text-[13.5px] font-semibold tracking-tight text-neutral-900">
              Ramp
            </span>
            <Logo className="h-5 w-5 text-neutral-900" />
          </Link>

          {/* User avatar — opens dropdown downward (anchored to top-right). */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setUserOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={userOpen}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-neutral-700 hover:bg-white shadow-xs transition-colors"
              title="Sarah Whitfield · UK · Damm"
            >
              SW
            </button>
            {userOpen && (
              <div
                role="menu"
                className="absolute top-full right-0 mt-1.5 min-w-[200px] rounded-lg border border-neutral-200 bg-white p-1 shadow-lg z-40"
              >
                <div className="px-2.5 py-2 border-b border-neutral-100 mb-1">
                  <div className="text-[12px] font-medium text-neutral-900 leading-tight">
                    Sarah Whitfield
                  </div>
                  <div className="text-[10.5px] text-neutral-500 leading-tight mt-0.5">
                    UK · Damm
                  </div>
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                  onClick={() => setUserOpen(false)}
                >
                  <UserIcon className="h-4 w-4" />
                  Account settings
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                  onClick={() => setUserOpen(false)}
                >
                  <Settings className="h-4 w-4" />
                  Workspace
                </button>
                <div className="my-1 h-px bg-neutral-200" />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                  onClick={signOut}
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Scroll region: nav + recent + news ───────────────────────── */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Fixed top: nav + (optional) recent. Doesn't scroll on its own —
              if there's lots of recents, the page will scroll. News always
              gets a guaranteed slice via its own min-h. */}
          <div className="px-3 pt-3 shrink-0">
            <SectionLabel>Workflow</SectionLabel>
            <nav className="flex flex-col gap-0.5">
              {NAV.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  badge={
                    item.href === "/" ? criticalCount :
                    item.href === "/promos" ? promoCount :
                    null
                  }
                />
              ))}
            </nav>

          </div>

          {/* News — collapsible. When open, takes remaining vertical space
              with internal scroll. When closed, shrinks to just the header
              row so the page can reclaim the space. */}
          <section
            className={cn(
              "flex flex-col mt-5 px-3 pb-3",
              newsOpen ? "flex-1 min-h-[180px]" : "shrink-0",
            )}
          >
            <button
              type="button"
              onClick={() => setNewsOpen((v) => !v)}
              aria-expanded={newsOpen}
              aria-controls="sidebar-news-body"
              className="group px-2 mb-2 flex items-center gap-1.5 rounded-md hover:bg-white/60 transition-colors"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-neutral-400 transition-transform",
                  newsOpen ? "rotate-0" : "-rotate-90",
                )}
                aria-hidden
              />
              <span className="text-[11.5px] font-medium text-neutral-500">News</span>
              {!newsLoading && articles.length > 0 && (
                <span className="ml-auto text-[10.5px] text-neutral-400 tabular-nums">
                  {articles.length}
                </span>
              )}
              {newsLoading && articles.length === 0 && (
                <span className="ml-auto inline-flex h-1.5 w-1.5 rounded-full bg-neutral-300 animate-pulse" />
              )}
            </button>
            {newsOpen && (
              <div
                id="sidebar-news-body"
                className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {newsLoading && articles.length === 0 ? (
                  <div className="space-y-1.5 px-1 py-1">
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                  </div>
                ) : articles.length === 0 ? (
                  <NewsEmptyHint />
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {articles.slice(0, 20).map((a) => (
                      <li key={a.id}>
                        <NewsCard article={a} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>

      </div>
    </aside>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 mb-1.5 text-[11px] font-medium text-neutral-500">
      {children}
    </div>
  )
}

function NavLink({
  item, active, badge,
}: {
  item: NavItem
  active: boolean
  badge: number | null
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-white text-neutral-900 shadow-xs font-medium"
          : "text-neutral-600 hover:bg-white/60 hover:text-neutral-900",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate flex-1">{item.label}</span>
      {badge !== null && badge > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-md px-1.5 min-w-[20px] h-[18px] text-[10.5px] font-medium tabular-nums",
            active
              ? "bg-neutral-100 text-neutral-700"
              : "bg-white/80 text-neutral-600 group-hover:bg-white",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  )
}

function NewsEmptyHint() {
  return (
    <div className="px-2 py-4 text-[11px] leading-snug text-neutral-500">
      No recent market events yet.
      <div className="text-[10px] text-neutral-400 mt-1">
        Run <code className="font-mono">make news</code> to populate.
      </div>
    </div>
  )
}

