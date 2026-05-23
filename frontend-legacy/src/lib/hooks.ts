/**
 * TanStack Query hooks — one per endpoint. Every page consumes data
 * through these so caching, loading states, and error handling are
 * centralized.
 */

import { useQuery, useMutation } from "@tanstack/react-query"

const API = (import.meta as any).env?.VITE_API_URL ?? "/api"

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${path}`)
  return r.json() as Promise<T>
}

async function postJson<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${path}`)
  return r.json() as Promise<T>
}

// ────────────────────────────────────────────────────────────────────────────
// Types — minimal duplicates from api.gen.ts for ergonomics. Switch to
// generated types once the openapi-typescript regen handles the new endpoints.
// ────────────────────────────────────────────────────────────────────────────

export type Kpis = {
  total_forecast_hl: number
  total_budget_hl: number
  gap_hl: number
  gap_pct: number
  on_track_skus: number
  off_track_skus: number
  period_range: [string, string]
}

export type Sku = { id: string; label: string; brand: string }
export type ChannelOption = { code: string; label: string }
export type Meta = {
  brands: string[]
  skus: Sku[]
  sub_channels: string[]
  sub_channels_labeled: ChannelOption[]
  sales_channels: string[]
  sales_channels_labeled: ChannelOption[]
  period_range: [string, string]
  hero: { sku: string; brand: string; sub_channel: string; period: string }
}

export type ForecastPoint = {
  period: string
  period_start: string
  point: number
  lo80: number; hi80: number
  lo95: number; hi95: number
  is_actual: boolean
}

export type ForecastSeries = {
  sku: string
  sub_channel: string
  granularity: "month" | "week"
  points: ForecastPoint[]
}

export type GapItem = {
  sku: string
  sub_channel: string
  period: string
  forecast_hl: number
  budget_hl: number
  gap_hl: number
  gap_pct: number
  confidence: "low" | "medium" | "high"
}

export type Driver = {
  feature: string
  shap_value: number
  direction: "positive" | "negative"
  explanation: string
}

export type PromoROI = {
  promo_type: string
  sub_channel: string
  avg_lift_pct: number
  avg_lift_hl: number
  estimated_cost: number | null
  roi: number | null
  n_observations: number
  confidence: "low" | "medium" | "high"
}

export type SimulationResult = {
  baseline: ForecastSeries
  simulated: ForecastSeries
  gap_before_hl: number
  gap_after_hl: number
  gap_closed_pct: number
  estimated_cost: number | null
  notes: string
}

export type Anomaly = {
  sku: string
  sub_channel: string
  period: string
  actual_hl: number
  expected_hl: number
  z_score: number
  candidate_cause: string
}

export type RecommendationAction = {
  action: string
  target_sku: string
  target_sub_channel: string
  target_months: string[]
  expected_lift_hl: number
  expected_gap_closed_pct: number
  estimated_cost: number | null
  confidence: "low" | "medium" | "high"
  evidence: string[]
}

export type RecommendationScenario = {
  label: "conservative" | "balanced" | "aggressive"
  headline: string
  actions: RecommendationAction[]
  total_expected_gap_closed_pct: number
  risk_notes: string
}

export type RecommendationResponse = {
  sku: string
  sub_channel: string
  period: string
  current_gap_hl: number
  current_gap_pct: number
  scenarios: RecommendationScenario[]
}

export type TimelinePoint = {
  period: string
  period_start: string
  point: number
  lo80: number
  hi80: number
  target: number | null
}

export type ChannelRow = {
  name: string
  code: string
  forecast: number
  target: number
  gap_pct: number
}

export type ExplainViewSummary = {
  headline: string
  bullets: string[]
  suggested_next_action: string | null
}

// ────────────────────────────────────────────────────────────────────────────
// Hooks
// ────────────────────────────────────────────────────────────────────────────

export const useMeta = () => useQuery({
  queryKey: ["meta"],
  queryFn: () => getJson<Meta>("/meta"),
  staleTime: Infinity,
})

export const useKpis = () => useQuery({
  queryKey: ["kpis"],
  queryFn: () => getJson<Kpis>("/kpis"),
  staleTime: 60_000,
})

export const useForecast = (sku: string | null, sub_channel: string | null) => useQuery({
  queryKey: ["forecast", sku, sub_channel],
  queryFn: () => getJson<ForecastSeries>(`/forecast?sku=${encodeURIComponent(sku!)}&sub_channel=${encodeURIComponent(sub_channel!)}`),
  enabled: !!sku && !!sub_channel,
  staleTime: 60_000,
})

export const useGap = (sub_channel: string | null = null, limit = 50) => useQuery({
  queryKey: ["gap", sub_channel, limit],
  queryFn: () => {
    const qs = new URLSearchParams({ limit: String(limit) })
    if (sub_channel) qs.set("sub_channel", sub_channel)
    return getJson<GapItem[]>(`/gap?${qs}`)
  },
  staleTime: 60_000,
})

export const useDrivers = (sku: string | null, sub_channel: string | null, period = "") => useQuery({
  queryKey: ["drivers", sku, sub_channel, period],
  queryFn: () => getJson<Driver[]>(`/drivers?sku=${encodeURIComponent(sku!)}&sub_channel=${encodeURIComponent(sub_channel!)}&period=${period}`),
  enabled: !!sku && !!sub_channel,
  staleTime: 60_000,
})

export const usePromoROI = (sub_channel: string | null = null) => useQuery({
  queryKey: ["promo_roi", sub_channel],
  queryFn: () => {
    const qs = new URLSearchParams({ top_k: "20" })
    if (sub_channel) qs.set("sub_channel", sub_channel)
    return getJson<PromoROI[]>(`/promos/roi?${qs}`)
  },
  staleTime: 5 * 60_000,
})

export const useAnomalies = (sub_channel: string | null = null, limit = 20) => useQuery({
  queryKey: ["anomalies", sub_channel, limit],
  queryFn: () => {
    const qs = new URLSearchParams({ limit: String(limit) })
    if (sub_channel) qs.set("sub_channel", sub_channel)
    return getJson<Anomaly[]>(`/anomalies?${qs}`)
  },
  staleTime: 5 * 60_000,
})

export const useForecastTimeline = (brand: string | null = null, sub_channel: string | null = null) =>
  useQuery({
    queryKey: ["forecast_timeline", brand, sub_channel],
    queryFn: () => {
      const qs = new URLSearchParams()
      if (brand) qs.set("brand", brand)
      if (sub_channel) qs.set("sub_channel", sub_channel)
      return getJson<TimelinePoint[]>(`/forecast/timeline?${qs}`)
    },
    staleTime: 60_000,
  })

export const useForecastByChannel = (brand: string | null = null) =>
  useQuery({
    queryKey: ["forecast_by_channel", brand],
    queryFn: () => {
      const qs = new URLSearchParams()
      if (brand) qs.set("brand", brand)
      return getJson<ChannelRow[]>(`/forecast/by-sub-channel?${qs}`)
    },
    staleTime: 60_000,
  })

export const useSimulate = () => useMutation({
  mutationFn: (req: { sku: string; sub_channel: string; months: string[]; discount_pct: number; promo_type: string }) =>
    postJson<SimulationResult>("/simulate", req),
})

export const useRecommend = (sku: string | null, sub_channel: string | null, period: string | null) => useQuery({
  queryKey: ["recommend", sku, sub_channel, period],
  queryFn: () => postJson<RecommendationResponse>("/recommend", { sku, sub_channel, period }),
  enabled: !!sku && !!sub_channel && !!period,
  staleTime: 5 * 60_000,
  retry: 1,
})

export const useExplainView = () => useMutation({
  mutationFn: (req: { page: string; filters: Record<string, any>; visible_state: Record<string, any> }) =>
    postJson<ExplainViewSummary>("/explain-view", req),
})
