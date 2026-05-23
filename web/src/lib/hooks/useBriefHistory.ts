"use client"

/**
 * Past briefs the user has generated, persisted in localStorage.
 *
 * No backend persistence — every visit to /brief/[customer] re-runs the
 * LLM, so the "history" is just a list of {customer, last opened at}
 * pointers. Re-clicking an entry re-generates the brief fresh.
 *
 * Capped at 12 entries, deduped by customer key. The brief page writes
 * here via <BriefHistoryTracker />; /brief reads here to render the
 * Past Briefs list.
 */

import { useEffect, useState } from "react"

export type BriefHistoryEntry = {
  customer: string             // key, e.g. "tesco"
  customer_label: string       // display label, e.g. "Tesco"
  generated_at: number         // unix ms
}

const KEY = "ramp:brief-history"
const CAP = 12
const EVENT_NAME = "ramp:brief-history-changed"

function safeRead(): BriefHistoryEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is BriefHistoryEntry =>
        !!r && typeof r === "object" &&
        typeof (r as BriefHistoryEntry).customer === "string" &&
        typeof (r as BriefHistoryEntry).customer_label === "string" &&
        typeof (r as BriefHistoryEntry).generated_at === "number",
    )
  } catch {
    return []
  }
}

function safeWrite(entries: BriefHistoryEntry[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries))
    window.dispatchEvent(new Event(EVENT_NAME))
  } catch {
    /* quota / private mode — swallow */
  }
}

/** Record a brief generation. Bumps timestamp if already present. */
export function recordBriefGeneration(entry: Omit<BriefHistoryEntry, "generated_at">): void {
  const current = safeRead()
  const filtered = current.filter((r) => r.customer !== entry.customer)
  const next: BriefHistoryEntry[] = [
    { ...entry, generated_at: Date.now() },
    ...filtered,
  ].slice(0, CAP)
  safeWrite(next)
}

/** Subscribe to the brief history; re-renders on change. */
export function useBriefHistory(): BriefHistoryEntry[] {
  const [list, setList] = useState<BriefHistoryEntry[]>([])

  useEffect(() => {
    setList(safeRead())
    const onChange = () => setList(safeRead())
    window.addEventListener(EVENT_NAME, onChange)
    window.addEventListener("storage", onChange)
    return () => {
      window.removeEventListener(EVENT_NAME, onChange)
      window.removeEventListener("storage", onChange)
    }
  }, [])

  return list
}
