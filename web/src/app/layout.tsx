/**
 * Root layout — only renders <html><body> and loads the font + global CSS.
 *
 * The actual chrome (sidebar / topbar) lives in `(app)/layout.tsx` so it
 * doesn't bleed into the login screen, which has its own `(auth)/layout.tsx`.
 */

import type { Metadata } from "next"
import { Inter, Instrument_Serif } from "next/font/google"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
})

// ElevenLabs-style editorial display serif. Loaded for the single "Welcome
// back, …" h1 on the inbox; everything else stays Inter for legibility.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "Ramp — Commercial Intelligence for UK Trade",
  description:
    "Daily worklist for UK Commercial Managers: where you're missing target, why, and what to do this week.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  )
}
