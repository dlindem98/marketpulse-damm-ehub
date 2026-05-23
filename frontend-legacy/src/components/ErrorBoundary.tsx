/**
 * ErrorBoundary — catches React render errors so they show up on screen
 * instead of a black void.
 */

import { Component, type ReactNode } from "react"

type Props = { children: ReactNode }
type State = { error: Error | null; info: string | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[ErrorBoundary]", error, info)
    this.setState({ error, info: info.componentStack ?? null })
  }

  reset = () => this.setState({ error: null, info: null })

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen bg-background text-foreground p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <h1 className="text-xl font-semibold text-destructive">UI crashed</h1>
          <div className="text-sm text-muted-foreground">
            React caught an error while rendering. Stack trace below — open the browser
            dev tools console for the full details.
          </div>
          <pre className="bg-card border border-border rounded p-4 text-xs whitespace-pre-wrap overflow-auto">
            <strong>{this.state.error.name}:</strong> {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          {this.state.info && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Component stack</summary>
              <pre className="bg-card border border-border rounded p-4 text-xs whitespace-pre-wrap overflow-auto mt-2">
                {this.state.info}
              </pre>
            </details>
          )}
          <button
            onClick={this.reset}
            className="px-4 py-2 rounded border border-border hover:bg-accent/40 text-sm"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
