"use client"

/**
 * /brief — past briefs the user has generated.
 *
 * No backend persistence; this reads from localStorage. Each entry is a
 * pointer back to /brief/[customer] which re-runs the LLM fresh on visit.
 * Empty state directs the user to generate one from the inbox.
 */

import Link from "next/link"
import { ArrowRight, FileText } from "lucide-react"
import { PageContent } from "@/components/shell/PageContent"
import { PageWidthWrapper } from "@/components/shell/PageWidthWrapper"
import { useBriefHistory, type BriefHistoryEntry } from "@/lib/hooks/useBriefHistory"
import { formatRelative } from "@/lib/format"

export default function BriefHistoryPage() {
  const history = useBriefHistory()

  return (
    <PageContent>
      <PageWidthWrapper className="pb-12 max-w-3xl">
        <header className="mt-2 mb-8">
          <h1 className="font-serif text-[40px] leading-[1.05] tracking-[-0.02em] text-neutral-900">
            Past briefs
          </h1>
          <p className="text-sm text-neutral-500 mt-2 max-w-xl">
            Briefs you&apos;ve generated for customer calls. Click to regenerate
            from the latest forecast.
          </p>
        </header>

        {history.length === 0 ? (
          <EmptyState />
        ) : (
          <section>
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-neutral-500 font-medium mb-3">
              History
            </div>
            <ul className="space-y-2">
              {history.map((entry) => (
                <li key={entry.customer}>
                  <BriefHistoryRow entry={entry} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </PageWidthWrapper>
    </PageContent>
  )
}

function BriefHistoryRow({ entry }: { entry: BriefHistoryEntry }) {
  return (
    <Link
      href={`/brief/${entry.customer}`}
      className="group flex items-center gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3.5 hover:border-neutral-300 hover:shadow-xs transition-all"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 text-neutral-500 shrink-0">
        <FileText className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-neutral-900 truncate">
          {entry.customer_label} brief
        </div>
        <div className="text-[11.5px] text-neutral-500 mt-0.5 tabular-nums">
          Generated {formatRelative(new Date(entry.generated_at))}
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-500 group-hover:text-neutral-900 transition-colors shrink-0">
        Open
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/40 px-6 py-12 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white border border-neutral-200 mb-4">
        <FileText className="h-4 w-4 text-neutral-400" />
      </span>
      <p className="text-[13.5px] text-neutral-700 font-medium">
        No briefs yet
      </p>
      <p className="text-[12px] text-neutral-500 mt-1 max-w-sm mx-auto">
        Generate a brief from a customer card on the{" "}
        <Link href="/" className="text-neutral-900 font-medium hover:underline">
          inbox
        </Link>
        {" "}— it&apos;ll show up here for quick re-access.
      </p>
    </div>
  )
}
