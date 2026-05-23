/**
 * Meta helpers — labels for SKUs / channels.
 *
 * The backend ships SKU codes like "STAR_24_DOM_330_BTL"; humans need
 * "Estrella Damm 24×330ml". This module is the single place we turn one into
 * the other so labels are consistent across the inbox, decision page, etc.
 */

import type { components } from "./api.gen"

export type SkuMeta = { id: string; label: string; brand?: string; pack?: string }
export type ChannelMeta = { code: string; label: string }

type Meta = components["schemas"]["MetaResponse"]

export function skuLabel(meta: Meta | null | undefined, sku: string): string {
  if (!meta) return sku
  const found = (meta.skus as unknown as SkuMeta[]).find((s) => s.id === sku)
  return found?.label ?? sku
}

export function channelLabel(meta: Meta | null | undefined, code: string): string {
  if (!meta) return code
  const list = (meta.sub_channels_labeled as unknown as ChannelMeta[] | undefined) ?? []
  const found = list.find((c) => c.code === code)
  return found?.label ?? code
}
