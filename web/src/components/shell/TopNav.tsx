"use client"

/**
 * TopNav — direct port of Dub admin's `layout-nav-client.tsx` pattern.
 *
 * Sticky horizontal bar across the top of the authenticated app. White
 * background, single-pixel bottom border. Brand wordmark on the left,
 * inline tabs to the right, and a user/sign-out affordance on the far right.
 *
 * Tab styling matches Dub exactly:
 *   active   = bg-neutral-100 text-neutral-900
 *   inactive = text-neutral-500 hover:text-neutral-700
 *   shape    = rounded-md px-3 py-1.5 text-sm
 *
 * No icons in the tabs themselves — Dub admin doesn't use them. Keeps the
 * bar quiet so the page content does the work.
 */

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { Wordmark } from "@/components/brand/Wordmark"
import { MaxWidthWrapper } from "./MaxWidthWrapper"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/", label: "Inbox" },
  { href: "/promos", label: "Promos" },
  { href: "/ask", label: "Ask" },
] as const

export function TopNav() {
  const pathname = usePathname()
  const router = useRouter()

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
    <div className="sticky left-0 right-0 top-0 z-20 border-b border-neutral-200 bg-white">
      <MaxWidthWrapper>
        <div className="flex h-16 w-full items-center justify-between gap-8">
          {/* Brand */}
          <Link href="/" className="shrink-0">
            <Wordmark />
          </Link>

          {/* Tabs */}
          <nav className="flex flex-1 items-center gap-1">
            {TABS.map((tab) => {
              const active = isActive(tab.href)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-700",
                  )}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>

          {/* User / sign out */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden md:flex items-center gap-2.5 pr-2">
              <div className="h-7 w-7 rounded-full bg-neutral-100 flex items-center justify-center text-[11px] font-semibold text-neutral-700">
                CM
              </div>
              <div className="hidden lg:block min-w-0">
                <div className="text-[12px] font-medium text-neutral-900 leading-tight">
                  Commercial Manager
                </div>
                <div className="text-[10px] text-neutral-500 leading-tight">UK · Damm</div>
              </div>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="p-2 rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </MaxWidthWrapper>
    </div>
  )
}
