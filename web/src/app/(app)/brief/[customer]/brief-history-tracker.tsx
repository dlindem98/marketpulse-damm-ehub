"use client"

/**
 * Side-effect-only: writes a brief-generation entry to localStorage so the
 * /brief history page knows this customer was generated. Renders nothing.
 * Mounted once per /brief/[customer] visit.
 */

import { useEffect } from "react"
import { recordBriefGeneration } from "@/lib/hooks/useBriefHistory"

export function BriefHistoryTracker({
  customer,
  customer_label,
}: {
  customer: string
  customer_label: string
}) {
  useEffect(() => {
    recordBriefGeneration({ customer, customer_label })
  }, [customer, customer_label])

  return null
}
