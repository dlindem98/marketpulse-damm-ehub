"use client"

/**
 * AtRiskDrawer — bottom-sheet that pops up when a customer is selected in
 * the URL. Calendar stays visible behind a dimmed backdrop.
 *
 * Dismissal removes the ?customer= param via router.push, which makes
 * deep-links work and keeps URL state as the single source of truth.
 *
 * Implemented as a client component so it can handle backdrop click / ESC
 * key / focus management. The actual at-risk list is passed in as
 * `children` so the parent (server component) can render the SKUs while
 * this stays animation-only.
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { ArrowRight } from "lucide-react"

// Fallback in case onAnimationEnd never fires (e.g. prefers-reduced-motion
// disables the animation entirely). Slightly longer than the CSS duration
// so the animation event wins under normal conditions.
const CLOSE_FALLBACK_MS = 450

export function AtRiskDrawer({
  customerLabel,
  customerKey,
  daysFromNow,
  weekday,
  children,
}: {
  customerLabel: string
  customerKey: string
  daysFromNow: number | null
  weekday: string | null
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  // `isClosing` keeps the drawer mounted during the slide-out animation.
  // The actual navigation fires from `onAnimationEnd` so the URL change
  // happens at the exact moment the animation completes — not via a
  // setTimeout that can fire too early/late and cause visual jank.
  const [isClosing, setIsClosing] = useState(false)
  // Guard: animation events can fire multiple times (parent + descendant
  // animations), but we should only navigate once.
  const navigatedRef = useRef(false)

  function commitClose() {
    if (navigatedRef.current) return
    navigatedRef.current = true
    // `replace` so the open/close toggle doesn't pollute browser history.
    router.replace(pathname)
  }

  function close() {
    if (isClosing) return
    setIsClosing(true)
    // Fallback in case the animation never fires (reduced-motion users).
    window.setTimeout(commitClose, CLOSE_FALLBACK_MS)
  }

  function handleAnimationEnd(e: React.AnimationEvent<HTMLDivElement>) {
    // Only commit on the drawer's own slide-out — ignore any nested
    // descendant animations that bubble up.
    if (!isClosing) return
    if (e.target !== e.currentTarget) return
    commitClose()
  }

  // ESC key dismiss. Body scroll lock not needed — the drawer is scoped
  // to the main card (absolute positioning inside the layout's relative
  // container) so the sidebar stays interactive.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const whenLabel =
    daysFromNow == null
      ? null
      : daysFromNow === 0
        ? "Today"
        : daysFromNow === 1
          ? "Tomorrow"
          : `${weekday} · in ${daysFromNow} days`

  return (
    // `absolute inset-0` (NOT fixed) — bubbles up to the layout's relative
    // main-card container, scoping the drawer to that surface only. The
    // sidebar stays clear and interactive.
    <div className="absolute inset-0 z-50" role="dialog" aria-modal="true">
      {/* Backdrop — click to dismiss. Duration synced to the drawer (300ms)
          so the two animations end together. Without this, the backdrop
          finishes first and the drawer's lingering shadow casts on the
          newly-uncovered card area, looking like a brief darkening. */}
      <button
        type="button"
        aria-label="Close drawer"
        onClick={close}
        className={[
          "absolute inset-0 bg-black/20 backdrop-blur-[2px] duration-300 fill-mode-forwards",
          isClosing ? "animate-out fade-out" : "animate-in fade-in",
        ].join(" ")}
      />

      {/* Drawer — slides up from the bottom on open, down on close.
          Shadow softened during close so the dimming doesn't linger on
          the card after the backdrop is gone. */}
      <div
        onAnimationEnd={handleAnimationEnd}
        className={[
          "absolute bottom-0 left-0 right-0",
          "h-[68%] max-h-[720px]",
          "bg-white rounded-t-2xl",
          "flex flex-col overflow-hidden",
          "duration-300 fill-mode-forwards",
          isClosing
            ? "animate-out slide-out-to-bottom shadow-none"
            : "animate-in slide-in-from-bottom shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.18)]",
        ].join(" ")}
      >
        {/* Drag handle — clickable to dismiss. Replaces the redundant X
            button; backdrop click and ESC still work as redundant closes. */}
        <button
          type="button"
          onClick={close}
          aria-label="Close drawer"
          className="group flex justify-center pt-3 pb-2 shrink-0 cursor-pointer"
        >
          <span
            className="h-1 w-10 rounded-full bg-neutral-200 transition-colors group-hover:bg-neutral-400"
            aria-hidden
          />
        </button>

        {/* Header */}
        <header className="flex items-start justify-between gap-4 px-6 pt-2 pb-4 shrink-0">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-neutral-500 font-medium">
              For your call · SKUs at risk
            </div>
            <h2 className="text-[20px] font-semibold tracking-tight text-neutral-900 mt-1 truncate">
              {customerLabel}
              {whenLabel && (
                <span className="ml-2 text-neutral-500 font-normal text-[14px]">
                  {whenLabel}
                </span>
              )}
            </h2>
          </div>
          <Link
            href={`/brief/${customerKey}`}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 text-white text-[12px] font-medium px-3 py-2 hover:bg-neutral-800 transition-colors"
          >
            Generate brief
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </header>

        {/* Body — scrollable list of SKUs */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 [scrollbar-width:thin]">
          {children}
        </div>
      </div>
    </div>
  )
}
