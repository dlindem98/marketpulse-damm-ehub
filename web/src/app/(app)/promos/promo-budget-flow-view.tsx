"use client"

import { useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import useSWR from "swr"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatHl, formatPeriodShort } from "@/lib/format"
import type { components } from "@/lib/api.gen"

type PromoBudgetFlow = components["schemas"]["PromoBudgetFlow"]
type FlowItem = components["schemas"]["PromoBudgetFlowItem"]
type AffectedProduct = components["schemas"]["PromoAffectedProduct"]
type FlowNode = { y: number; h: number; center: number; item: FlowItem }
type ProductNode = { y: number; h: number; center: number; product: AffectedProduct; weight: number }

const PROMO_COLORS: Record<string, string> = {
  "multi-buy": "var(--positive)",
  "price-cut": "var(--chart-1)",
  "rollback": "var(--warn)",
  "clearance": "var(--negative)",
  "listing": "var(--neutral)",
}

const fetcher = async (url: string): Promise<PromoBudgetFlow> => {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json() as Promise<PromoBudgetFlow>
}

export function PromoBudgetFlowView() {
  const [month, setMonth] = useState<string | null>(null)
  const [promoType, setPromoType] = useState<string | null>(null)

  const query = new URLSearchParams()
  if (month) query.set("month", month)
  if (promoType) query.set("promo_type", promoType)

  const { data, error, isLoading } = useSWR<PromoBudgetFlow>(
    `/api/promos/budget-flow${query.size ? `?${query.toString()}` : ""}`,
    fetcher,
  )

  const activeMonth = month ?? data?.month ?? ""
  const activePromo = data?.preview?.promo_type ?? data?.dominant_promo_type ?? ""
  const topFlow = useMemo(() => (data?.flow ?? []).slice(0, 5), [data?.flow])
  const selectedFlow = useMemo(
    () => topFlow.find((item) => item.promo_type === activePromo) ?? topFlow[0],
    [activePromo, topFlow],
  )
  const availableMonths = useMemo(
    () => [...(data?.available_months ?? [])].sort((a, b) => a.localeCompare(b)),
    [data?.available_months],
  )
  const previewProducts = useMemo(
    () => uniqueProducts(data?.preview?.affected_products ?? []),
    [data?.preview?.affected_products],
  )

  if (error) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Could not load promo budget flow.
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-neutral-500">
            Promo plan mix
          </div>
          <h1 className="mt-1 font-serif text-[34px] leading-[1.05] tracking-[-0.01em] text-neutral-900">
            Promo Budget Flow
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-500">
            Share of planned promo activity by month. Budget here means promo-plan allocation, not financial budget.
          </p>
        </div>

        <div className="w-full sm:w-[180px]">
          <Select
            value={activeMonth}
            onValueChange={(value) => {
              setMonth(value)
              setPromoType(null)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((m) => (
                <SelectItem key={m} value={m}>{formatPeriodShort(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {isLoading ? (
        <LoadingState />
      ) : !data || data.flow.length === 0 ? (
        <EmptyState month={activeMonth} />
      ) : (
        <>
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 xl:p-5">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-neutral-900">
                  {formatPeriodShort(data.month)} allocation
                </h2>
                <p className="mt-0.5 text-[12px] text-neutral-500">
                  {data.total_promo_events} planned promo events · click a flow to compare forecast impact.
                </p>
              </div>
              <FlowImpactPanel
                flow={selectedFlow}
                products={previewProducts}
              />
            </div>

            <BudgetFlowGraph
              month={data.month}
              flow={topFlow}
              activePromo={activePromo}
              products={previewProducts}
              onSelect={setPromoType}
            />
          </section>
        </>
      )}
    </section>
  )
}

function BudgetFlowGraph({
  month,
  flow,
  activePromo,
  products,
  onSelect,
}: {
  month: string
  flow: FlowItem[]
  activePromo: string
  products: AffectedProduct[]
  onSelect: (promoType: string) => void
}) {
  const layout = useMemo(
    () => buildFlowLayout(flow, activePromo, products),
    [activePromo, flow, products],
  )
  const activeNode = layout.promos.find((node) => node.item.promo_type === activePromo)
  const left = { x: 70, y: 94, h: 300, w: 12 }
  const promoX = 540
  const productX = 1110
  const chartWidth = 1280
  const chartHeight = 500

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-[440px] w-full 2xl:h-[560px]"
          role="img"
          aria-label={`${formatPeriodShort(month)} promo budget flow`}
        >
          <rect x="0" y="0" width={chartWidth} height={chartHeight} fill="white" />

          <text x={left.x} y="42" className="fill-neutral-500 text-[11px] font-medium uppercase tracking-[0.18em]">
            Monthly plan
          </text>
          <text x={promoX - 4} y="42" className="fill-neutral-500 text-[11px] font-medium uppercase tracking-[0.18em]">
            Mechanics
          </text>
          <text x={productX - 4} y="42" className="fill-neutral-500 text-[11px] font-medium uppercase tracking-[0.18em]">
            Affected products
          </text>

          {layout.promos.map((node, i) => {
            const color = PROMO_COLORS[node.item.promo_type] ?? "var(--neutral)"
            const active = node.item.promo_type === activePromo
            const sourceBand = proportionalBand(left.y, left.h, layout.promos, i)
            return (
              <path
                key={`source-${node.item.promo_type}`}
                d={ribbonPath(
                  left.x + left.w,
                  sourceBand.y,
                  sourceBand.y + sourceBand.h,
                  promoX,
                  node.y,
                  node.y + node.h,
                )}
                fill={color}
                opacity={active ? 0.24 : 0.08}
                className="cursor-pointer transition-opacity hover:opacity-30"
                onClick={() => onSelect(node.item.promo_type)}
              >
                <title>{`${promoLabel(node.item.promo_type)} ${plainPercent(node.item.usage_pct)}`}</title>
              </path>
            )
          })}

          {activeNode && layout.products.map((node, i) => {
            const color = PROMO_COLORS[activePromo] ?? "var(--neutral)"
            const sourceBand = productSourceBand(activeNode, layout.products, i)
            return (
              <path
                key={`product-${node.product.material_id}`}
                d={ribbonPath(
                  promoX + 10,
                  sourceBand.y,
                  sourceBand.y + sourceBand.h,
                  productX,
                  node.y,
                  node.y + node.h,
                )}
                fill={color}
                opacity={0.18}
              >
                <title>{node.product.label}</title>
              </path>
            )
          })}

          <rect x={left.x} y={left.y} width={left.w} height={left.h} rx="2" fill="var(--chart-1)" opacity="0.92" />
          <text x={left.x + 20} y={left.y + 18} className="fill-neutral-900 text-[13px] font-semibold">
            Promo Plan
          </text>
          <text x={left.x + 20} y={left.y + 38} className="fill-neutral-500 text-[12px]">
            {formatPeriodShort(month)} · 100%
          </text>

          {layout.promos.map((node) => {
            const color = PROMO_COLORS[node.item.promo_type] ?? "var(--neutral)"
            const active = node.item.promo_type === activePromo
            return (
              <g
                key={`promo-${node.item.promo_type}`}
                className="cursor-pointer"
                onClick={() => onSelect(node.item.promo_type)}
              >
                <rect
                  x={promoX}
                  y={node.y}
                  width="10"
                  height={node.h}
                  rx="2"
                  fill={color}
                  opacity={active ? 0.95 : 0.38}
                />
                <text x={promoX + 22} y={node.center - 4} className="fill-neutral-900 text-[13px] font-semibold">
                  {promoLabel(node.item.promo_type)}
                </text>
                <text x={promoX + 22} y={node.center + 14} className="fill-neutral-500 text-[12px]">
                  {plainPercent(node.item.usage_pct)}
                </text>
              </g>
            )
          })}

          {layout.products.length > 0 ? layout.products.map((node) => (
            <g key={`product-node-${node.product.material_id}`}>
              <rect
                x={productX}
                y={node.y}
                width="10"
                height={node.h}
                rx="2"
                fill={PROMO_COLORS[activePromo] ?? "var(--neutral)"}
                opacity="0.72"
              />
              <text x={productX + 20} y={node.center - 4} className="fill-neutral-900 text-[12px] font-semibold">
                {compactProductLabel(node.product.label)}
              </text>
              <text x={productX + 20} y={node.center + 13} className="fill-neutral-500 text-[11px]">
                {formatHl(node.product.forecast_hl)} → {formatHl(projectedWithPromo(node.product, activeNode?.item.avg_lift_pct))}
              </text>
            </g>
          )) : (
            <text x={productX} y="180" className="fill-neutral-400 text-[12px]">
              No product match
            </text>
          )}
        </svg>
      </div>

      <div className="flex flex-wrap gap-2">
        {flow.map((item) => (
          <button
            key={item.promo_type}
            type="button"
            onClick={() => onSelect(item.promo_type)}
            className={[
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] transition",
              item.promo_type === activePromo
                ? "border-neutral-900 text-neutral-900"
                : "border-neutral-200 text-neutral-500 hover:text-neutral-900",
            ].join(" ")}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: PROMO_COLORS[item.promo_type] ?? "var(--neutral)" }}
            />
            <span className="capitalize">{promoLabel(item.promo_type)}</span>
            <span className="tabular-nums">{plainPercent(item.usage_pct)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function buildFlowLayout(
  flow: FlowItem[],
  activePromo: string,
  products: AffectedProduct[],
): { promos: FlowNode[]; products: ProductNode[] } {
  const promos = stackPromoNodes(flow, 80, 334, 16)
  const activeNode = promos.find((node) => node.item.promo_type === activePromo)
  if (!activeNode || products.length === 0) return { promos, products: [] }
  const weights = productWeights(products)
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || products.length
  const productNodes = stackWeightedNodes(products.slice(0, 3), weights, weightTotal, 100, 284, 28)
  return { promos, products: productNodes }
}

function stackPromoNodes(flow: FlowItem[], startY: number, totalHeight: number, gap: number): FlowNode[] {
  const usable = totalHeight - Math.max(flow.length - 1, 0) * gap
  let y = startY
  return flow.map((item) => {
    const h = Math.max(usable * item.usage_pct, 24)
    const node = { y, h, center: y + h / 2, item }
    y += h + gap
    return node
  })
}

function stackWeightedNodes(
  products: AffectedProduct[],
  weights: number[],
  weightTotal: number,
  startY: number,
  totalHeight: number,
  gap: number,
): ProductNode[] {
  const usable = totalHeight - Math.max(products.length - 1, 0) * gap
  let y = startY
  return products.map((product, i) => {
    const weight = weights[i] ?? 1
    const h = Math.max((usable * weight) / weightTotal, 30)
    const node = { y, h, center: y + h / 2, product, weight }
    y += h + gap
    return node
  })
}

function productWeights(products: AffectedProduct[]): number[] {
  return products.slice(0, 3).map((product) => {
    const forecast = Math.max(product.forecast_hl ?? 0, 1)
    const gap = Math.abs(product.gap_pct ?? 0)
    const lift = Math.abs(product.estimated_lift_pct ?? 0)
    return Math.max(forecast * (gap + lift), 1)
  })
}

function uniqueProducts(products: AffectedProduct[]): AffectedProduct[] {
  const seen = new Set<string>()
  return products.filter((product) => {
    const key = product.label.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 3)
}

function proportionalBand(startY: number, totalHeight: number, nodes: FlowNode[], index: number) {
  const before = nodes.slice(0, index).reduce((sum, node) => sum + node.item.usage_pct, 0)
  const pct = nodes[index]?.item.usage_pct ?? 0
  return {
    y: startY + before * totalHeight,
    h: Math.max(pct * totalHeight, 3),
  }
}

function productSourceBand(activeNode: FlowNode, products: ProductNode[], index: number) {
  const totalWeight = products.reduce((sum, node) => sum + node.weight, 0) || products.length
  const before = products.slice(0, index).reduce((sum, node) => sum + node.weight, 0)
  const weight = products[index]?.weight ?? 1
  return {
    y: activeNode.y + (before / totalWeight) * activeNode.h,
    h: Math.max((weight / totalWeight) * activeNode.h, 3),
  }
}

function ribbonPath(
  x1: number,
  y1Top: number,
  y1Bottom: number,
  x2: number,
  y2Top: number,
  y2Bottom: number,
): string {
  const c1 = x1 + (x2 - x1) * 0.48
  const c2 = x1 + (x2 - x1) * 0.62
  return [
    `M ${x1} ${y1Top}`,
    `C ${c1} ${y1Top}, ${c2} ${y2Top}, ${x2} ${y2Top}`,
    `L ${x2} ${y2Bottom}`,
    `C ${c2} ${y2Bottom}, ${c1} ${y1Bottom}, ${x1} ${y1Bottom}`,
    "Z",
  ].join(" ")
}

function compactProductLabel(label: string): string {
  return label.length > 28 ? `${label.slice(0, 27)}…` : label
}

function FlowImpactPanel({
  flow,
  products,
}: {
  flow?: FlowItem
  products: AffectedProduct[]
}) {
  const liftPct = flow?.avg_lift_pct ?? averageProductLift(products)
  const baseline = products.reduce((sum, product) => sum + (product.forecast_hl ?? 0), 0)
  const withPromo = products.reduce(
    (sum, product) => sum + projectedWithPromo(product, liftPct),
    0,
  )
  const delta = withPromo - baseline

  if (!flow) {
    return (
      <aside className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-500">
        Select a promo flow to compare forecast impact.
      </aside>
    )
  }

  return (
    <aside className="w-full xl:max-w-[560px]">
      <div className="grid grid-cols-3 gap-2">
        <ImpactMetric label="Base" value={formatHl(baseline)} />
        <ImpactMetric label="After promo" value={formatHl(withPromo)} />
        <ImpactMetric
          label="Lift"
          value={`${delta >= 0 ? "+" : ""}${formatHl(delta)}`}
          positive={delta >= 0}
        />
      </div>
    </aside>
  )
}

function ImpactMetric({
  label,
  value,
  positive,
}: {
  label: string
  value: string
  positive?: boolean
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
      <div className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </div>
      <div
        className="mt-1 truncate text-[13px] font-semibold tabular-nums"
        style={positive == null ? undefined : { color: positive ? "var(--positive)" : "var(--negative)" }}
      >
        {value}
      </div>
    </div>
  )
}

function projectedWithPromo(product: AffectedProduct, fallbackLift: number | null | undefined): number {
  const base = product.forecast_hl ?? 0
  const lift = product.estimated_lift_pct ?? fallbackLift ?? 0
  return Math.max(base * (1 + lift), 0)
}

function averageProductLift(products: AffectedProduct[]): number | null {
  const lifts = products
    .map((product) => product.estimated_lift_pct)
    .filter((lift): lift is number => lift !== null && lift !== undefined && !Number.isNaN(lift))
  if (!lifts.length) return null
  return lifts.reduce((sum, lift) => sum + lift, 0) / lifts.length
}

function LoadingState() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-4 h-16 w-full rounded-xl" />
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    </div>
  )
}

function EmptyState({ month }: { month: string }) {
  return (
    <section className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
      <AlertTriangle className="mt-0.5 h-4 w-4 text-neutral-400" />
      <div>
        <div className="font-medium text-neutral-900">No planned promo activity</div>
        <div className="mt-0.5">
          {month ? `${formatPeriodShort(month)} has no promo events in the trade plan.` : "No promo events were found."}
        </div>
      </div>
    </section>
  )
}

function promoLabel(type: string): string {
  return type
    .split("-")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

function plainPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—"
  return `${(value * 100).toFixed(0)}%`
}
