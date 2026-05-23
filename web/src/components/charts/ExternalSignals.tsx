/**
 * ExternalSignals — compact sidebar block surfacing the non-Damm context the
 * forecast already ingests. The brief explicitly values external enrichment
 * being visible and documented; this is the visible half.
 *
 * Each signal is a short labelled row, no charts. Source is disclosed when
 * we're showing a prior-year proxy (the snapshot's actuals don't cover
 * future months — we fall back to the same calendar month a year back).
 */

import { Cloud, LineChart, Search, CalendarDays } from "lucide-react"
import type { components } from "@/lib/api.gen"

type Signals = components["schemas"]["ExternalSignals"]

export function ExternalSignals({ signals }: { signals: Signals | null }) {
  if (!signals) return null

  const { weather, search, retail, events, source } = signals
  const isProxy = source === "prior_year"

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white">
      <header className="px-5 pt-4 pb-2">
        <h3 className="text-[13px] font-semibold text-neutral-900">External context</h3>
        <p className="text-[12px] text-neutral-500 mt-0.5">
          {isProxy
            ? "Same month a year back — proxy for the forecast window."
            : "Live readings for this period."}
        </p>
      </header>
      <div className="px-5 pb-4 space-y-3">
        {/* Weather */}
        {weather.temp_c !== null && weather.temp_c !== undefined && (
          <Row icon={<Cloud className="h-3.5 w-3.5" />} label="Weather">
            <span className="tabular-nums font-medium text-neutral-900">
              {weather.temp_c.toFixed(1)}°C
            </span>
            {weather.anomaly_c !== null && weather.anomaly_c !== undefined && (
              <span
                className={`ml-1.5 text-[11px] tabular-nums ${
                  weather.anomaly_c > 0.5
                    ? "text-[color:var(--negative)]"
                    : weather.anomaly_c < -0.5
                      ? "text-[color:var(--positive)]"
                      : "text-neutral-500"
                }`}
              >
                {weather.anomaly_c > 0 ? "+" : ""}
                {weather.anomaly_c.toFixed(1)}° vs avg
              </span>
            )}
          </Row>
        )}

        {/* Search trends */}
        {(search.estrella !== null || search.beer !== null) && (
          <Row icon={<Search className="h-3.5 w-3.5" />} label="Search interest">
            <div className="flex items-center gap-2 text-[11.5px]">
              {search.beer !== null && search.beer !== undefined && (
                <TrendPill label="beer" value={search.beer} />
              )}
              {search.estrella !== null && search.estrella !== undefined && (
                <TrendPill
                  label="Estrella"
                  value={search.estrella}
                  trend={search.estrella_trend ?? undefined}
                />
              )}
            </div>
          </Row>
        )}

        {/* Retail macro */}
        {retail.food_drink_index !== null && retail.food_drink_index !== undefined && (
          <Row icon={<LineChart className="h-3.5 w-3.5" />} label="UK food &amp; drink retail">
            <span className="tabular-nums font-medium text-neutral-900">
              {retail.food_drink_index.toFixed(1)}
            </span>
            {retail.food_drink_trend && (
              <TrendArrow direction={retail.food_drink_trend} />
            )}
            <span className="ml-1 text-[11px] text-neutral-500">ONS index</span>
          </Row>
        )}

        {/* Calendar events */}
        {events.length > 0 && (
          <Row icon={<CalendarDays className="h-3.5 w-3.5" />} label="In this month">
            <div className="flex flex-wrap gap-1.5">
              {events.map((e, i) => (
                <span
                  key={`${e.label}-${i}`}
                  className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[10.5px] text-neutral-700"
                >
                  {e.label}
                </span>
              ))}
            </div>
          </Row>
        )}
      </div>
      <footer className="border-t border-neutral-100 px-5 py-2 text-[10.5px] text-neutral-400">
        Sources: NASA POWER · Google Trends · ONS · UK holidays
      </footer>
    </section>
  )
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="shrink-0 mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-neutral-500 font-medium">
          {label}
        </div>
        <div className="mt-0.5 flex items-baseline gap-1 flex-wrap text-[12.5px] text-neutral-700">
          {children}
        </div>
      </div>
    </div>
  )
}

function TrendPill({
  label,
  value,
  trend,
}: {
  label: string
  value: number
  trend?: "up" | "flat" | "down"
}) {
  const trendColor =
    trend === "up"
      ? "text-[color:var(--positive)]"
      : trend === "down"
        ? "text-[color:var(--negative)]"
        : "text-neutral-400"
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-1.5 py-0.5 tabular-nums">
      <span className="text-neutral-500">{label}</span>
      <span className="font-semibold text-neutral-900">{value.toFixed(0)}</span>
      {trend && (
        <span className={trendColor}>
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "·"}
        </span>
      )}
    </span>
  )
}

function TrendArrow({ direction }: { direction: "up" | "flat" | "down" }) {
  if (direction === "flat") return <span className="text-neutral-400 ml-1">·</span>
  const color =
    direction === "up" ? "text-[color:var(--positive)]" : "text-[color:var(--negative)]"
  return <span className={`ml-1 ${color}`}>{direction === "up" ? "↑" : "↓"}</span>
}
