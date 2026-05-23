"use client"

/**
 * Login form for the auth entrypoint.
 */

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const SESSION_COOKIE = "mp_session"

function signIn(): void {
  const maxAge = 60 * 60 * 24 * 30
  document.cookie = `${SESSION_COOKIE}=authenticated; path=/; max-age=${maxAge}; samesite=lax`
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center px-4 py-20 pt-28 min-[900px]:pt-20">
      <Suspense fallback={<div className="w-full max-w-sm" />}>
        <LoginCard />
      </Suspense>
    </div>
  )
}

function LoginCard() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get("next") || "/"
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState<"sso" | "email" | null>(null)

  async function handle(provider: "sso" | "email") {
    setPending(provider)
    await new Promise((r) => setTimeout(r, 350))
    signIn()
    router.push(next)
    router.refresh()
  }

  return (
    <div className="w-full max-w-sm">
      <h3 className="text-center text-xl font-semibold text-neutral-900">
        Log in to your Ramp workspace
      </h3>

      {/* Email — primary path */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (pending) return
          handle("email")
        }}
        className="mt-8 flex flex-col gap-3"
      >
        <div>
          <label className="text-sm font-medium text-neutral-900">Work email</label>
          <Input
            type="email"
            placeholder="name@damm.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="mt-1.5 h-10"
          />
        </div>
        <Button
          type="submit"
          className="h-10 font-medium"
          disabled={pending !== null}
        >
          {pending === "email" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Log in with email
        </Button>
      </form>

      {/* OR separator */}
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-neutral-200" />
        <div className="text-[11px] uppercase tracking-wider text-neutral-400">OR</div>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      {/* SSO — secondary */}
      <Button
        variant="outline"
        className="h-10 w-full gap-2.5 font-medium border-neutral-200"
        onClick={() => handle("sso")}
        disabled={pending !== null}
      >
        {pending === "sso" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <KeyRound className="h-4 w-4 text-neutral-700" />
        )}
        Continue with SSO
      </Button>

      {/* Sign-up link */}
      <p className="mt-6 text-center text-sm font-medium text-neutral-500">
        Don&apos;t have an account?{" "}
        <span className="font-semibold text-neutral-700">Ask your workspace admin for access.</span>
      </p>

      {/* Terms */}
      <p className="mt-10 text-center text-xs font-medium text-neutral-500">
        By continuing, you agree to Ramp&apos;s terms and privacy policy.
      </p>
    </div>
  )
}
