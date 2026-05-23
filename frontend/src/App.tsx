import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { NumberTicker } from "@/components/ui/number-ticker"
import { BorderBeam } from "@/components/ui/border-beam"
import ParquetDiagnostics from "./ParquetDiagnostics"

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
})

type Kpis = {
  total_forecast_hl: number
  total_budget_hl: number
  gap_hl: number
  gap_pct: number
  on_track_skus: number
  off_track_skus: number
  period_range: [string, string]
}

function useKpis() {
  return useQuery({
    queryKey: ["kpis"],
    queryFn: async (): Promise<Kpis> => {
      const r = await fetch("/api/kpis")
      if (!r.ok) throw new Error("Failed to load KPIs")
      return r.json()
    },
  })
}

function KpiTile({ label, value, suffix = "", muted = false }: { label: string; value: number; suffix?: string; muted?: boolean }) {
  return (
    <Card className={muted ? "opacity-80" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">
          <NumberTicker value={value} decimalPlaces={Math.abs(value) < 10 ? 2 : 0} />
          <span className="text-base text-muted-foreground ml-1">{suffix}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function Overview() {
  const { data, isLoading, error } = useKpis()

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
    )
  }
  if (error) return <div className="text-destructive">Couldn't load KPIs — make sure the backend is running on :8000</div>
  if (!data) return null

  const gapPctSigned = data.gap_pct * 100
  const isBelow = gapPctSigned < 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Forecast (Hl)" value={data.total_forecast_hl} />
        <KpiTile label="Budget (Hl)"   value={data.total_budget_hl} muted />
        <Card className="relative overflow-hidden">
          <BorderBeam size={120} duration={6} />
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Gap vs budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              <NumberTicker value={gapPctSigned} decimalPlaces={1} />
              <span className="text-base text-muted-foreground ml-1">%</span>
            </div>
            <Badge variant={isBelow ? "destructive" : "default"} className="mt-2">
              {isBelow ? "Below" : "On/above"} target
            </Badge>
          </CardContent>
        </Card>
        <KpiTile label="SKUs at risk" value={data.off_track_skus} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pre-flight check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>✅ Frontend renders against the FastAPI backend.</p>
          <p>✅ shadcn/ui + Magic UI components working.</p>
          <p>✅ Tailwind v4 dark theme + Damm-red accent.</p>
          <p className="text-muted-foreground pt-2">
            Period: <code>{data.period_range[0]} → {data.period_range[1]}</code>
            {" · "}
            Open <a href="http://localhost:8000/docs" className="underline text-primary" target="_blank">/docs</a> to inspect the API.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function App() {
  if (window.location.pathname === "/diagnostics/parquet") {
    return (
      <QueryClientProvider client={queryClient}>
        <ParquetDiagnostics />
      </QueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen">
        <header className="border-b border-border px-8 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold tracking-tight">MarketPulse UK</span>
            <span className="text-xs text-muted-foreground">Damm × Engineering Hub</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/diagnostics/parquet" className="text-xs text-muted-foreground hover:text-foreground transition">Parquet diagnostics</a>
            <a href="http://localhost:8000/docs" target="_blank" className="text-xs text-muted-foreground hover:text-foreground transition">/docs</a>
          </div>
        </header>

        <main className="px-8 py-6 max-w-7xl mx-auto">
          <h1 className="text-2xl font-semibold mb-6">Overview</h1>
          <Overview />
        </main>
      </div>
    </QueryClientProvider>
  )
}
