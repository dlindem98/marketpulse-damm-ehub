/**
 * AppShell — Dub.co sidebar pattern (apps/web/ui/layout/sidebar-nav.tsx).
 *
 * Structure mirrors Dub exactly:
 *   - Compact white sidebar with subtle 1px border on the right
 *   - Brand mark at the top, navigation items below, settings at the bottom
 *   - Active item: gray-100 background, black text
 *   - Inactive: gray-500 text, hover:gray-50 background
 *   - No animations, no border accents
 *   - Topbar is a thin breadcrumb row only
 */

import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom"
import {
  LayoutGrid, LineChart, Lightbulb, Tag, Sliders, Target, MessageSquare,
  ArrowUpRight,
} from "lucide-react"
import { useMeta } from "@/lib/hooks"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/",                label: "Overview",          icon: LayoutGrid },
  { to: "/forecast",        label: "Forecast",          icon: LineChart },
  { to: "/drivers",         label: "Drivers",           icon: Lightbulb },
  { to: "/promos",          label: "Promotions",        icon: Tag },
  { to: "/simulator",       label: "Simulator",         icon: Sliders },
  { to: "/recommendations", label: "Recommendations",   icon: Target },
  { to: "/chat",            label: "Ask MarketPulse",   icon: MessageSquare },
] as const

export function AppShell() {
  const { data: meta } = useMeta()
  const navigate = useNavigate()
  const location = useLocation()
  const currentNav = NAV.find(n =>
    n.to === "/" ? location.pathname === "/" : location.pathname.startsWith(n.to)
  )

  const goHero = () => {
    if (meta?.hero) {
      navigate(`/forecast?sku=${meta.hero.sku}&sub_channel=${encodeURIComponent(meta.hero.sub_channel)}`)
    }
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-border flex flex-col bg-background">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground grid place-items-center text-xs font-semibold">
              M
            </div>
            <div>
              <div className="text-[13.5px] font-semibold leading-tight tracking-tight">MarketPulse UK</div>
              <div className="text-[11px] text-muted-foreground">Damm · Engineering Hub</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {NAV.map(n => {
            const Icon = n.icon
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) => cn(
                  "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />
                <span className="truncate">{n.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="px-2 py-3 border-t border-border space-y-0.5">
          {meta?.hero && (
            <button
              onClick={goHero}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground transition"
            >
              <span className="truncate flex-1 text-left">Jump to hero</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground transition"
          >
            <span className="truncate flex-1 text-left">API docs</span>
            <ArrowUpRight className="w-3 h-3" />
          </a>
          <a
            href="/diagnostics/parquet"
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground transition"
          >
            <span className="truncate flex-1 text-left">Parquet diagnostics</span>
            <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-12 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-20 px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {currentNav && (
              <>
                <currentNav.icon className="w-3.5 h-3.5" strokeWidth={2} />
                <span className="text-foreground font-medium">{currentNav.label}</span>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
