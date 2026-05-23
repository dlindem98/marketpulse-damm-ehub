/**
 * Authenticated app shell.
 *
 * Two-column card-on-tray frame:
 *   bg-neutral-200 tray
 *   ┌───────────────────┬───────────────────────────┐
 *   │  Sidebar (280px)  │  main content (white card)│
 *   └───────────────────┴───────────────────────────┘
 *
 * The 64px brand rail from Dub consumer was dropped — Ramp has a single
 * product surface, so the rail was cargo-cult. Logo + workspace + nav +
 * recents + news + profile all live in one panel now (see Sidebar.tsx).
 * `min-content` grid template adapts to whatever width the sidebar uses.
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
