/**
 * Authenticated app shell — direct port of Dub consumer dashboard.
 *
 * Source: apps/web/app/app.dub.co/(dashboard)/layout.tsx
 *       + apps/web/ui/layout/main-nav.tsx
 *
 * The iconic "card on a tray" frame:
 *   - Outer grid: [sidebar 240px][main 1fr]
 *   - Both columns sit on a bg-neutral-200 tray
 *   - Main column gets pt-2 pr-2 pb-2 padding so the inner card floats
 *   - Inner scrollable area: rounded-xl bg-white — THIS is what makes Dub
 *     consumer look the way it does
 *
 * The sidebar is rendered by <Sidebar />, the content by {children}. Each
 * page is responsible for wrapping its content in <PageContent title="…">.
 */

import { Sidebar } from "@/components/shell/Sidebar"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[min-content_minmax(0,1fr)] bg-neutral-200">
      <Sidebar />
      <div className="bg-neutral-200 lg:pb-2 lg:pr-2 lg:pt-2 h-screen">
        <div className="relative h-full overflow-y-auto bg-neutral-100 pt-px lg:rounded-xl lg:bg-white">
          {children}
        </div>
      </div>
    </div>
  )
}
