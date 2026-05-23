/**
 * Typed API client for the FastAPI backend.
 *
 * Server-side default base: http://localhost:8000 (or API_URL env).
 * Client-side base: NEXT_PUBLIC_API_URL (defaults to /api proxy).
 *
 * Philosophy: every page hits the live backend. No static-JSON fallback.
 * If backend is down, surface the error — don't fake data.
 */

import createClient from "openapi-fetch"
import type { paths } from "./api.gen"

const baseUrl =
  typeof window === "undefined"
    ? process.env.API_URL ?? "http://localhost:8000"
    : process.env.NEXT_PUBLIC_API_URL ?? "/api"

export const api = createClient<paths>({ baseUrl })

/**
 * Convenience server-only fetcher with sensible defaults.
 * Use in Server Components for one-shot reads.
 */
export async function serverFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${baseUrl}${path}`
  const res = await fetch(url, {
    ...init,
    // RSC fetches aren't cached by default in Next 16 — be explicit.
    cache: "no-store",
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText} for ${path}`)
  }
  return res.json() as Promise<T>
}
