"use client"

/**
 * Ask Ramp — plain-English Q&A. Dub-admin composition.
 */

import { useState } from "react"
import { MaxWidthWrapper } from "@/components/shell/MaxWidthWrapper"
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
    <MaxWidthWrapper className="py-10">
      <header className="mb-6 max-w-2xl">
        <h2 className="text-xl font-semibold text-neutral-900">Ask Ramp</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Plain-English questions about forecasts, gaps, and what to do. Backed by the same models that power the inbox.
        </p>
      </header>

      <div className="max-w-2xl rounded-lg border border-neutral-200 bg-white flex flex-col h-[560px]">
        <div className="flex-1 overflow-y-auto py-4 px-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-neutral-500 italic">
              Try: &quot;Why is Estrella in grocery missing target?&quot; or &quot;What&apos;s the biggest promo opportunity right now?&quot;
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-line ${
                  m.role === "user"
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-900"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex justify-start">
              <div className="bg-neutral-100 text-neutral-500 rounded-lg px-3.5 py-2.5 text-sm italic">
                Thinking…
              </div>
            </div>
          )}
        </div>
        <form onSubmit={send} className="border-t border-neutral-200 p-3 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about the UK forecast…"
          />
          <Button type="submit" disabled={!input.trim() || pending}>Send</Button>
        </form>
      </div>
    </MaxWidthWrapper>
  )
}
