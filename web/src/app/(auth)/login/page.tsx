"use client"

/**
 * Login form — matches Dub's actual ordering from the screenshot:
 *   1. Email input + "Log in with email" PRIMARY (black, full width)
 *   2. OR separator
 *   3. Continue with Google  (outline)
 *   4. Continue with GitHub  (outline)
 *
 * Plus: "Don't have an account? Sign up" link and the dotted alternative
 * banner below ("Built for the Damm × Engineering Hub Hackathon").
 *
 * Auth is fake — any button signs you in by setting the mp_session cookie.
 */

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

const SESSION_COOKIE = "mp_session"

function signIn(): void {
  const maxAge = 60 * 60 * 24 * 30
  document.cookie = `${SESSION_COOKIE}=demo; path=/; max-age=${maxAge}; samesite=lax`
}

export default function LoginPage() {
  return (
    <div className="flex w-full justify-center px-4 pt-32 pb-16">
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
  const [pending, setPending] = useState<"google" | "github" | "email" | null>(null)

  async function handle(provider: "google" | "github" | "email") {
    setPending(provider)
    await new Promise((r) => setTimeout(r, 350))
    signIn()
    router.push(next)
    router.refresh()
  }

  return (
    <div className="w-full max-w-sm">
      <h3 className="text-center text-xl font-semibold text-neutral-900">
        Log in to your Ramp account
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

      {/* OAuth — secondary */}
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="h-10 gap-2.5 font-medium border-neutral-200"
          onClick={() => handle("google")}
          disabled={pending !== null}
        >
          {pending === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
          Continue with Google
        </Button>
        <Button
          variant="outline"
          className="h-10 gap-2.5 font-medium border-neutral-200"
          onClick={() => handle("github")}
          disabled={pending !== null}
        >
          {pending === "github" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitHubIcon />}
          Continue with GitHub
        </Button>
      </div>

      {/* Sign-up link */}
      <p className="mt-6 text-center text-sm font-medium text-neutral-500">
        Don&apos;t have an account?{" "}
        <span className="font-semibold text-neutral-700">
          It&apos;s a demo — any button works.
        </span>
      </p>

      {/* Alternative banner — Dub's dotted pattern style */}
      <Link
        href="https://github.com/GeriMan2004/marketpulse-damm-ehub"
        target="_blank"
        className="relative mt-10 block overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-4 transition-colors hover:bg-neutral-100"
      >
        <div
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-[640px] -translate-x-1/2 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgb(212 212 216) 1px, transparent 0)",
            backgroundSize: "12px 12px",
          }}
        />
        <div className="relative text-center text-sm text-neutral-600">
          <p>Built for the Damm × Engineering Hub Hackathon</p>
          <span className="block font-semibold text-neutral-800">Barcelona · 23–24 May 2026</span>
        </div>
      </Link>

      {/* Terms */}
      <p className="mt-6 text-center text-xs font-medium text-neutral-500">
        By continuing, you agree to the demo terms. Any button signs you in.
      </p>
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
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-neutral-900" aria-hidden>
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.95 0-1.32.47-2.39 1.24-3.24-.12-.31-.54-1.54.12-3.2 0 0 1.01-.32 3.3 1.24a11.5 11.5 0 0 1 6 0c2.29-1.56 3.3-1.24 3.3-1.24.66 1.66.24 2.89.12 3.2.77.85 1.24 1.92 1.24 3.24 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.21v3.28c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  )
}
