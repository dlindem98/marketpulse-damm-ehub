"use client"

/**
 * Regenerate + Copy + Print actions for the brief page.
 * Client component — touches browser APIs (window.print, navigator.clipboard)
 * and uses next/navigation for the regenerate refresh.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Printer, Copy, Check, RefreshCw } from "lucide-react"

export function BriefActions() {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [isRegenerating, startTransition] = useTransition()

  async function copyBrief() {
    const article = document.querySelector("article")
    if (!article) return
    const text = article.innerText.replace(/\n{3,}/g, "\n\n").trim()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API blocked — silent. Print is still available.
    }
  }

  function regenerate() {
    // router.refresh() re-runs the server components for this route,
    // which re-invokes the POST /api/brief call → fresh LLM prose.
    // Wrapped in startTransition so isPending reflects the actual fetch.
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={regenerate}
        disabled={isRegenerating}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-60 disabled:cursor-wait"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${isRegenerating ? "animate-spin" : ""}`}
        />
        {isRegenerating ? "Regenerating…" : "Regenerate"}
      </button>
      <button
        type="button"
        onClick={copyBrief}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-[color:var(--positive)]" /> Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" /> Copy
          </>
        )}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
      >
        <Printer className="h-3.5 w-3.5" /> Print
      </button>
    </div>
  )
}
