/**
 * Chat — plain conversational Q&A backed by /api/explain-view.
 */

import { useState } from "react"
import { useExplainView } from "@/lib/hooks"
import { PageHeader, Card } from "./Overview"

export default function Chat() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([])
  const ask = useExplainView()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    const userMsg = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: "user", text: userMsg }])
    ask.mutate(
      { page: "chat", filters: {}, visible_state: { user_question: userMsg } },
      {
        onSuccess: (data) => {
          const reply = [data.headline, "", ...data.bullets].filter(Boolean).join("\n")
          setMessages(prev => [...prev, { role: "assistant", text: reply }])
        },
      },
    )
  }

  return (
    <div className="px-6 pt-5 pb-12 max-w-3xl mx-auto">
      <PageHeader title="Ask MarketPulse" subtitle="Plain-English questions about forecasts, gaps, and what to do." />

      <Card className="mt-5 h-[540px] flex flex-col">
        <div className="flex-1 overflow-y-auto py-4 px-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              Try: "Why is Estrella in grocery missing target?" or "What's the biggest promo opportunity right now?"
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-line ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {ask.isPending && (
            <div className="flex justify-start">
              <div className="bg-secondary text-muted-foreground rounded-lg px-3.5 py-2.5 text-sm italic">
                Thinking…
              </div>
            </div>
          )}
        </div>
        <form onSubmit={handleSubmit} className="border-t border-border p-3 flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything about the UK forecast…"
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={!input.trim() || ask.isPending}
            className="px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
          >
            Send
          </button>
        </form>
      </Card>
    </div>
  )
}
