"use client"

/**
 * Login — direct port of Dub's `/login` page composition.
 *
 *   <Wordmark />  (centered, above the form)
 *   <h3>Sign in to your Ramp account</h3>
 *   <LoginForm />
 *     - Continue with Google
 *     - Continue with GitHub
 *     - AuthMethodsSeparator (or)
 *     - Email input + Continue with email
 *
 * No card border, no extra chrome. Form sits flat on the page; AuthLayout
 * handles vertical centering. Any button sets the mp_session cookie and
 * bounces to ?next=… (defaults to /).
 */

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { Loader2 } from "lucide-react"
import { Wordmark } from "@/components/brand/Wordmark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const SESSION_COOKIE = "mp_session"

function signIn(): void {
  const maxAge = 60 * 60 * 24 * 30
  document.cookie = `${SESSION_COOKIE}=demo; path=/; max-age=${maxAge}; samesite=lax`
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginFormSkeleton() {
  return <div className="w-full max-w-sm h-[420px]" />
}

function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get("next") || "/"
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState<"google" | "github" | "email" | null>(null)

  async function handle(provider: "google" | "github" | "email") {
    setPending(provider)
    await new Promise((r) => setTimeout(r, 450))
    signIn()
    router.push(next)
    router.refresh()
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex justify-center mb-7">
        <Wordmark className="text-neutral-900" />
      </div>

      <h3 className="text-center text-xl font-semibold text-neutral-900">
        Sign in to your Ramp account
      </h3>
      <p className="mt-1.5 text-center text-sm text-neutral-500">
        UK commercial intelligence, in one inbox.
      </p>

      <div className="mt-8 flex flex-col gap-2">
        <Button
          variant="outline"
          className="h-10 gap-2.5"
          onClick={() => handle("google")}
          disabled={pending !== null}
        >
          {pending === "google" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          Continue with Google
        </Button>
        <Button
          className="h-10 gap-2.5"
          onClick={() => handle("github")}
          disabled={pending !== null}
        >
          {pending === "github" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GitHubIcon />
          )}
          Continue with GitHub
        </Button>
      </div>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-neutral-200" />
        <div className="text-[11px] uppercase tracking-wider text-neutral-500">or</div>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (pending) return
          handle("email")
        }}
        className="flex flex-col gap-2"
      >
        <Input
          type="email"
          placeholder="you@damm.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="h-10"
        />
        <Button
          type="submit"
          variant="outline"
          className="h-10"
          disabled={pending !== null}
        >
          {pending === "email" ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Continue with email
        </Button>
      </form>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.95 0-1.32.47-2.39 1.24-3.24-.12-.31-.54-1.54.12-3.2 0 0 1.01-.32 3.3 1.24a11.5 11.5 0 0 1 6 0c2.29-1.56 3.3-1.24 3.3-1.24.66 1.66.24 2.89.12 3.2.77.85 1.24 1.92 1.24 3.24 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.21v3.28c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  )
}
