"use client"

/**
 * Week / Month toggle for the forecast chart. Updates a URL param so the
 * parent RSC re-renders with a re-fetched forecast at the new granularity.
 *
 * Weekly mode is real: the backend distributes monthly points across ISO
 * weeks by days-in-month share (see backend/app/services/weekly_split.py),
 * so the sum of weekly bars within a month equals the monthly point.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation"

const OPTIONS = [
  { value: "month", label: "Month" },
  { value: "week",  label: "Week"  },
] as const

export function GranularityToggle({ value }: { value: "month" | "week" }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()

  function go(next: "month" | "week") {
    if (next === value) return
    const params = new URLSearchParams(search.toString())
    if (next === "month") params.delete("granularity")
    else params.set("granularity", next)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div
      role="tablist"
      aria-label="Chart granularity"
      className="inline-flex items-center gap-0.5 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5"
    >
      {OPTIONS.map((opt) => {
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => go(opt.value)}
            className={`px-2.5 py-1 text-[11.5px] font-medium rounded-md transition-colors ${
              isActive
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
