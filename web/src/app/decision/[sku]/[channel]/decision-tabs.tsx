"use client"

/**
 * Client-only tab shell. The three panels are server-rendered React children
 * passed in via a slot map, so each panel can be its own Suspense boundary
 * and stream independently.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Slot = "diagnosis" | "options" | "simulate"

export function DecisionTabs({
  defaultTab,
  children,
}: {
  defaultTab: string
  children: Record<Slot, React.ReactNode>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const onChange = useCallback(
    (value: string) => {
      const next = new URLSearchParams(params.toString())
      next.set("tab", value)
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [router, pathname, params],
  )

  const safeDefault: Slot = (["diagnosis", "options", "simulate"] as const).includes(
    defaultTab as Slot,
  )
    ? (defaultTab as Slot)
    : "diagnosis"

  return (
    <Tabs defaultValue={safeDefault} onValueChange={onChange}>
      <TabsList>
        <TabsTrigger value="diagnosis">
          <span className="inline-flex items-center gap-2">
            <Step n={1} /> Diagnosis
          </span>
        </TabsTrigger>
        <TabsTrigger value="options">
          <span className="inline-flex items-center gap-2">
            <Step n={2} /> Options
          </span>
        </TabsTrigger>
        <TabsTrigger value="simulate">
          <span className="inline-flex items-center gap-2">
            <Step n={3} /> Simulate
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="diagnosis">{children.diagnosis}</TabsContent>
      <TabsContent value="options">{children.options}</TabsContent>
      <TabsContent value="simulate">{children.simulate}</TabsContent>
    </Tabs>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
      {n}
    </span>
  )
}
