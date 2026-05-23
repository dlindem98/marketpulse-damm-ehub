"use client"

/**
 * Sidebar — direct port of Dub consumer dashboard's left rail.
 *
 * Source: apps/web/ui/layout/sidebar/sidebar-nav.tsx + app-sidebar-nav.tsx
 *
 * Dub uses a 2-pane sidebar (64px icons + 240px areas) because they have
 * 7+ nav areas (Links, Program, Settings, etc). We have 3, so we collapse
 * to a single 240px pane with brand top / nav middle / user bottom.
 *
 * Background: bg-neutral-200 (blends with the page tray).
 * On mobile: drawer that slides in.
 */

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Inbox, Tag, MessageSquare, LogOut, Settings, User as UserIcon } from "lucide-react"
import { Wordmark } from "@/components/brand/Wordmark"
import { cn } from "@/lib/utils"
import { useState } from "react"

const NAV = [
  { href: "/" as const, label: "Inbox", icon: Inbox },
  { href: "/promos" as const, label: "Promos", icon: Tag },
  { href: "/ask" as const, label: "Ask", icon: MessageSquare },
] as const

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userOpen, setUserOpen] = useState(false)

  function signOut() {
    document.cookie = "mp_session=; path=/; max-age=0; samesite=lax"
    router.push("/login")
    router.refresh()
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname.startsWith("/decision")
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-60 shrink-0 flex-col bg-neutral-200">
      {/* Brand */}
      <div className="px-4 py-4">
        <Link
          href="/"
          className="inline-flex items-center rounded-lg px-1 py-2 outline-none focus-visible:ring-2 focus-visible:ring-black/50"
        >
          <Wordmark />
        </Link>
      </div>

      {/* Nav inside a rounded-xl bg-neutral-100 panel (mirrors Dub's areas panel) */}
      <div className="flex-1 px-2 pb-2 overflow-hidden">
        <div className="h-full flex flex-col rounded-xl bg-neutral-100 p-3 text-neutral-500">
          <div className="flex flex-col gap-0.5">
            {NAV.map((item) => {
              const active = isActive(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-white text-neutral-900 shadow-xs"
                      : "text-neutral-600 hover:bg-white/60 hover:text-neutral-900",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* User dropdown (matches Dub's UserDropdown popover) */}
          <div className="relative">
            {userOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1.5 rounded-lg border border-neutral-200 bg-white p-1 shadow-md z-10">
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
            <button
              type="button"
              onClick={() => setUserOpen((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/60"
            >
              <div className="h-7 w-7 rounded-full bg-neutral-900 flex items-center justify-center text-[11px] font-semibold text-white shrink-0">
                CM
              </div>
              <div className="min-w-0 text-left">
                <div className="text-[12.5px] font-medium text-neutral-900 leading-tight truncate">
                  Commercial Manager
                </div>
                <div className="text-[10.5px] text-neutral-500 leading-tight truncate">
                  UK · Damm
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
