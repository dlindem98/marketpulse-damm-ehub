/**
 * StickyFilterBar — Dub.co filter pattern (apps/web/ui/analytics/toggle.tsx).
 *
 * Tiny chips on a sticky bar, dropdowns on click, URL-synced state.
 * Plain neutral styling — black text, gray-200 border, no brand color.
 */

import { useSearchParams } from "react-router-dom"
import { useMeta } from "@/lib/hooks"
import { ChevronDown, X } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function StickyFilterBar() {
  const { data: meta } = useMeta()
  const [params, setParams] = useSearchParams()

  const sku = params.get("sku") ?? null
  const sub_channel = params.get("sub_channel") ?? null
  const brand = params.get("brand") ?? null

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const reset = () => setParams(new URLSearchParams(), { replace: true })

  const skuLabel = meta?.skus.find(s => s.id === sku)?.label
  const channelLabel = meta?.sub_channels_labeled.find(c => c.code === sub_channel)?.label
  const hasFilters = !!(sku || sub_channel || brand)

  return (
    <div className="sticky top-12 z-10 -mx-6 px-6 py-2.5 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center gap-2 flex-wrap">

        <Chip label="Brand" value={brand}>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto w-56">
            <DropdownMenuLabel className="text-xs">Brand</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => update("brand", null)}>All brands</DropdownMenuItem>
            {meta?.brands.map(b => (
              <DropdownMenuItem key={b} onSelect={() => update("brand", b)}>{b}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </Chip>

        <Chip label="Sub-channel" value={channelLabel ?? null}>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-xs">Sub-channel</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => update("sub_channel", null)}>All sub-channels</DropdownMenuItem>
            {meta?.sub_channels_labeled.map(c => (
              <DropdownMenuItem key={c.code} onSelect={() => update("sub_channel", c.code)}>
                {c.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </Chip>

        <Chip label="SKU" value={skuLabel ?? sku ?? null} wide>
          <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto w-80">
            <DropdownMenuLabel className="text-xs">SKU</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => update("sku", null)}>All SKUs</DropdownMenuItem>
            {meta?.skus
              .filter(s => !brand || s.brand === brand)
              .slice(0, 80)
              .map(s => (
                <DropdownMenuItem key={s.id} onSelect={() => update("sku", s.id)}>
                  <span className="truncate">{s.label}</span>
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </Chip>

        <div className="flex-1" />

        {hasFilters && (
          <button
            onClick={reset}
            className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>
    </div>
  )
}

function Chip({
  label, value, wide = false, children,
}: {
  label: string; value: string | null; wide?: boolean; children: React.ReactNode
}) {
  const active = !!value
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn(
          "flex items-center gap-1.5 h-7 px-2.5 text-xs rounded-md border transition",
          active
            ? "border-foreground/30 bg-accent text-foreground"
            : "border-border bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        )}>
          <span className={active ? "text-muted-foreground" : ""}>{label}</span>
          {value && (
            <>
              <span className="text-foreground/40">·</span>
              <span className={cn("text-foreground font-medium truncate", wide && "max-w-[220px]")}>
                {value}
              </span>
            </>
          )}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      {children}
    </DropdownMenu>
  )
}
