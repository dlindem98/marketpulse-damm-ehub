/**
 * Auth layout — direct port of Dub's AuthLayout pattern.
 *
 * Vertical sandwich: top spacer / centered content / bottom terms.
 * `grow basis-0` on both ends pushes the form to the exact middle of the
 * viewport. No card chrome — the form sits flat on the page.
 */

import Link from "next/link"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-between bg-white">
      <div className="grow basis-0">
        <div className="h-24" />
      </div>

      <div className="relative flex w-full flex-col items-center justify-center px-4">
        {children}
      </div>

      <div className="flex grow basis-0 flex-col justify-end">
        <p className="px-20 py-8 text-center text-xs font-medium text-neutral-500 md:px-0">
          By continuing, you agree to the{" "}
          <Link href="#" className="font-semibold text-neutral-600 hover:text-neutral-800">
            demo terms
          </Link>
          . Any button signs you in — this is a hackathon walkthrough.
        </p>
      </div>
    </div>
  )
}
