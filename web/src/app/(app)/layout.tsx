/**
 * Authenticated app shell — three-column card-on-tray frame.
 *
 *   bg-neutral-200 tray
 *   ┌─────────────┬──────────────────┬───────────────────────────┐
 *   │  Sidebar    │  MarketPulseRail │  main content (white card)│
 *   │   (304px)   │     (300px)      │       (1fr)               │
 *   └─────────────┴──────────────────┴───────────────────────────┘
 *
 * On lg+:
 *   - Sidebar and MarketPulseRail are both sticky/scrollable cards
 *   - Main card scrolls independently inside its rounded-xl container
 *
 * Below lg:
 *   - Sidebar collapses (hidden lg:flex in the component)
 *   - MarketPulseRail collapses (hidden lg:flex in the component)
 *   - Main content takes full width
 *
 * The rail is a context layer — it must NEVER block render or interaction
 * of the main column. All failure modes degrade to its EmptyState.
 */

import { Sidebar } from "@/components/shell/Sidebar"
import { MarketPulseRail } from "@/components/market-pulse/MarketPulseRail"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[min-content_min-content_minmax(0,1fr)] bg-neutral-200">
      <Sidebar />
      <MarketPulseRail />
      <div className="bg-neutral-200 lg:pb-2 lg:pr-2 lg:pt-2 h-screen">
        <div className="relative h-full overflow-y-auto bg-neutral-100 pt-px lg:rounded-xl lg:bg-white">
          {children}
        </div>
      </div>
    </div>
  )
}
