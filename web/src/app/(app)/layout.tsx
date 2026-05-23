/**
 * Authenticated app shell — direct port of Dub admin's `(dashboard)/layout.tsx`.
 *
 *   <div bg-neutral-50>
 *     <TopNav />          // sticky white bar with brand + tabs
 *     {children}          // each page renders inside MaxWidthWrapper
 *   </div>
 *
 * Sits under the `(app)` route group, so it doesn't wrap /login.
 * The proxy gate (web/proxy.ts) bounces unauthenticated requests to /login.
 */

import { TopNav } from "@/components/shell/TopNav"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-neutral-50">
      <TopNav />
      {children}
    </div>
  )
}
