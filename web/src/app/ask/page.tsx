"use client"

/**
 * Ask MarketPulse — plain-English Q&A.
 *
 * Audience: Commercial Manager prepping for an exec readout or a grocer call
 * who needs a one-line answer right now, not a chart.
 *
 * Backed by /api/explain-view with the user's question as visible_state.
 * Streams in front-end via standard fetch.
 */

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"

type Msg = { role: "user" | "assistant"; text: string }

export default function Page() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Msg[]>([])
  const [pending, setPending] = useState(false)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const q = input.trim()
    if (!q) return
    setInput("")
    setMessages((prev) => [...prev, { role: "user", text: q }])
    setPending(true)
    try {
      const { data } = await api.POST("/api/explain-view", {
        body: { page: "chat", filters: {}, visible_state: { user_question: q } },
      })
      const reply = [data?.headline, "", ...(data?.bullets ?? [])].filter(Boolean).join("\n")
      setMessages((prev) => [...prev, { role: "assistant", text: reply || "(no response)" }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Sorry — couldn't reach the LLM. Try again?" },
      ])
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Ask MarketPulse</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Plain-English questions about forecasts, gaps, and what to do. Backed by the same models that power the inbox.
        </p>
      </header>

      <Card className="h-[540px] flex flex-col">
        <div className="flex-1 overflow-y-auto py-4 px-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              Try: &quot;Why is Estrella in grocery missing target?&quot; or &quot;What&apos;s the biggest promo opportunity right now?&quot;
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-line ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex justify-start">
              <div className="bg-secondary text-muted-foreground rounded-lg px-3.5 py-2.5 text-sm italic">
                Thinking…
              </div>
            </div>
          )}
        </div>
        <form onSubmit={send} className="border-t border-border p-3 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about the UK forecast…"
          />
          <Button type="submit" disabled={!input.trim() || pending}>Send</Button>
        </form>
      </Card>
    </div>
  )
}
