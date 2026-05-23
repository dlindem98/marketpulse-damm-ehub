/**
 * Drivers — SHAP waterfall + English narrative.
 */

import { useSearchParams } from "react-router-dom"
import { StickyFilterBar } from "@/components/StickyFilterBar"
import { DriversWaterfall } from "@/components/charts/DriversWaterfall"
import { Skeleton } from "@/components/ui/skeleton"
import { useDrivers, useMeta } from "@/lib/hooks"
import { PageHeader, Card, CardTitle } from "./Overview"

export default function Drivers() {
  const [params] = useSearchParams()
  const sku = params.get("sku")
  const sub_channel = params.get("sub_channel") ?? "GROCERY"

  const { data: meta } = useMeta()
  const { data: drivers, isLoading } = useDrivers(sku, sub_channel)

  const skuLabel = meta?.skus.find(s => s.id === sku)?.label ?? sku ?? "—"
  const channelLabel = meta?.sub_channels_labeled.find(c => c.code === sub_channel)?.label ?? sub_channel

  return (
    <div className="px-6 pt-5 pb-12 max-w-7xl mx-auto">
      <PageHeader
        title="Drivers"
        subtitle={sku ? `${skuLabel} · ${channelLabel}` : "What's pushing the forecast up or down for a SKU."}
      />
      <StickyFilterBar />

      {!sku && (
        <Card className="mt-4">
          <div className="py-12 px-6 text-center text-sm text-muted-foreground">
            Pick a SKU above to see what's driving its forecast.
          </div>
        </Card>
      )}

      {sku && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          <Card className="lg:col-span-2">
            <CardTitle
              title="Top SHAP drivers"
              subtitle="Bar = contribution to forecast (Hl). Green = pushes up, red = pulls down."
            />
            <div className="px-4 pb-4">
              {isLoading || !drivers ? <Skeleton className="h-[280px] w-full" /> : <DriversWaterfall drivers={drivers} />}
            </div>
          </Card>

          <Card>
            <CardTitle title="In plain English" subtitle="LLM-narrated context per driver" />
            <div className="px-4 pb-4">
              {isLoading || !drivers ? (
                <div className="space-y-3">
                  <Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" />
                </div>
              ) : (
                <ol className="space-y-3 text-sm">
                  {drivers.map((d, i) => (
                    <li key={i} className="flex gap-3">
                      <span className={`inline-flex items-center justify-center rounded-md text-[10px] font-medium px-1.5 h-5 shrink-0 ${
                        d.direction === "positive"
                          ? "bg-[color:var(--positive)]/10 text-[color:var(--positive)]"
                          : "bg-[color:var(--negative)]/10 text-[color:var(--negative)]"
                      }`}>#{i + 1}</span>
                      <div>
                        <div className="font-medium">{d.feature}</div>
                        <div className="text-[11px] text-muted-foreground mt-1">{d.explanation}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
