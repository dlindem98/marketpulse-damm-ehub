/**
 * Typed API client.
 *
 * Types are generated from FastAPI's OpenAPI by `make types` (root Makefile).
 * Re-run after any backend schema change.
 *
 * Philosophy: every page always goes through the live backend. There is no
 * frontend fallback to static JSON. If the backend is unreachable, that's a
 * real error and we surface it.
 */
import createClient from "openapi-fetch"
import type { paths } from "./api.gen"

export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? "/api",
})
