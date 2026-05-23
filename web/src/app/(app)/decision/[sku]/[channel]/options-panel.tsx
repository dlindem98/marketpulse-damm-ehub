/**
 * Step 2 — Options. Server Component.
 *
 * Calls /api/recommend (POST, LLM-backed). Returns 3 scenario cards:
 * conservative / balanced / aggressive. Balanced is the visual "default pick"
 * and the one we suggest unless the user has a reason to deviate.
 *
 * Each card lists the concrete actions, expected lift, cost, evidence rows.
 * The "Tweak in simulator" button hands off to Step 3 with the scenario's
 * months/discount pre-filled (via querystring).
 */

import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { serverFetch } from "@/lib/api"
import { confidenceLabel, formatHl, formatPercent, formatGBP } from "@/lib/format"
import type { components } from "@/lib/api.gen"

type RecResponse = components["schemas"]["RecommendationResponse"]
type RecScenario = components["schemas"]["RecommendationScenario"]

/**
 * Build a one-line subtitle anchoring the abstract label
 * ("Conservative") in something concrete from the data the LLM already
 * returned. Approach (b) from Plan F — no backend change required.
 *
 *   "Avg lift 3.2% across 3 actions · medium confidence"
 *   "Single bet · high confidence · evidence: <first evidence row>"
 */
function scenarioSubtitle(s: RecScenario): string | null {
  const actions = s.actions ?? []
  if (actions.length === 0) return null

  const totalLift = actions.reduce((acc, a) => acc + (a.expected_lift_hl ?? 0), 0)
  const avgLift = totalLift / actions.length
  const conf = actions[0].confidence ?? "medium"
  const evidence = actions[0].evidence?.[0]?.trim()

  const head =
    actions.length === 1
      ? `Single play · ${formatHl(actions[0].expected_lift_hl)} lift · ${confidenceLabel(conf)}`
      : `${actions.length} actions · avg ${formatHl(avgLift)} lift · ${confidenceLabel(conf)}`

  // Prefer a real historical anchor if the LLM provided one in evidence.
  if (evidence && /\d/.test(evidence)) return `Based on: ${evidence}`
  return head
}

export async function OptionsPanel({
  sku, sub_channel, period,
}: {
  sku: string
  sub_channel: string
  period?: string
}) {
  const rec = await serverFetch<RecResponse>("/api/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sku, sub_channel, period: period ?? "" }),
  }).catch((e) => {
    console.error("[options] recommend failed", e)
    return null
  })

  if (!rec || !rec.scenarios?.length) {
    return (
      <Card>
        <CardContent>
          <div className="py-8 text-center text-sm text-muted-foreground">
            Couldn&apos;t generate recommendations. Backend or LLM might be unavailable.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {rec.scenarios.map((s) => {
        const isBalanced = s.label === "balanced"
        const subtitle = scenarioSubtitle(s)
        return (
          <Card key={s.label} className={isBalanced ? "ring-2 ring-foreground/15" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="capitalize">{s.label}</CardTitle>
                {isBalanced && <Badge variant="default">Recommended</Badge>}
              </div>
              <CardDescription>{s.headline}</CardDescription>
              {subtitle && (
                <div className="text-[11px] text-muted-foreground/80 mt-1.5 leading-snug">
                  {subtitle}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                  Expected gap closure
                </div>
                <div
                  className="text-2xl font-semibold tabular-nums tracking-tight mt-0.5"
                  style={{
                    color:
                      s.total_expected_gap_closed_pct > 0
                        ? "var(--positive)"
                        : "var(--neutral)",
                  }}
                >
                  {formatPercent(s.total_expected_gap_closed_pct, 0)}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                  Actions
                </div>
                {(s.actions ?? []).map((a, i) => (
                  <div key={i} className="rounded-md border border-border p-2.5 space-y-1">
                    <div className="text-[13px] font-medium leading-snug">{a.action}</div>
                    <div className="text-[10.5px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Lift: {formatHl(a.expected_lift_hl)}</span>
                      <span>Closes: {formatPercent(a.expected_gap_closed_pct, 0)}</span>
                      {a.estimated_cost && <span>Cost: {formatGBP(a.estimated_cost)}</span>}
                      <span>{confidenceLabel(a.confidence)}</span>
                    </div>
                    {a.evidence && a.evidence.length > 0 && (
                      <ul className="text-[10.5px] text-muted-foreground/80 space-y-0.5 pt-1">
                        {a.evidence.slice(0, 2).map((e, j) => (
                          <li key={j} className="flex gap-1.5">
                            <span className="text-muted-foreground/40">•</span>
                            <span className="leading-snug">{e}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
                <span className="font-medium text-foreground">Risk: </span>{s.risk_notes}
              </div>

              <Button
                asChild
                variant={isBalanced ? "default" : "outline"}
                className="w-full h-8 text-xs"
              >
                <Link
                  href={
                    `/decision/${encodeURIComponent(sku)}/${encodeURIComponent(
                      sub_channel,
                    )}?tab=simulate&period=${encodeURIComponent(period ?? "")}` as Parameters<
                      typeof Link
                    >[0]["href"]
                  }
                >
                  Tweak in simulator →
                </Link>
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
