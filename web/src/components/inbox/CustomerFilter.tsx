"use client"

/**
 * CustomerFilter — pill bar above the Action Queue.
 *
 * Client component: writes ?customer=<key> via router.push so the server
 * Inbox re-renders with the filter applied. Counts come pre-computed from the
 * server so we don't need access to the gap list here.
 */

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { CUSTOMER_LABELS, type Customer } from "@/lib/calls"

const ORDER: Customer[] = ["tesco", "sainsburys", "asda", "morrisons", "on_trade"]

export type CustomerCounts = Record<Customer | "all", number>

export function CustomerFilter({
  counts,
  activeCustomer,
}: {
  counts: CustomerCounts
  activeCustomer: Customer | null
}) {
  const router = useRouter()
  const search = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function select(next: Customer | null) {
    const params = new URLSearchParams(search?.toString() ?? "")
    if (next) params.set("customer", next)
    else params.delete("customer")
    const q = params.toString()
    startTransition(() => {
      router.push(q ? `/?${q}` : "/")
    })
  }

  return (
    <div
      className={[
        "flex flex-wrap items-center gap-1.5 transition-opacity",
        isPending ? "opacity-60" : "opacity-100",
      ].join(" ")}
      role="group"
      aria-label="Filter action queue by customer"
    >
      <Pill
        label="All"
        count={counts.all}
        active={activeCustomer === null}
        onClick={() => select(null)}
      />
      {ORDER.map((c) => (
        <Pill
          key={c}
          label={CUSTOMER_LABELS[c]}
          count={counts[c]}
          active={activeCustomer === c}
          onClick={() => select(c)}
        />
      ))}
    </div>
  )
}

function Pill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "text-xs px-3 py-1.5 rounded-full border transition-colors",
        "inline-flex items-center gap-1.5",
        active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900",
      ].join(" ")}
    >
      <span>{label}</span>
      <span
        className={[
          "tabular-nums text-[11px]",
          active ? "text-neutral-300" : "text-neutral-400",
        ].join(" ")}
      >
        {count}
      </span>
    </button>
  )
}
