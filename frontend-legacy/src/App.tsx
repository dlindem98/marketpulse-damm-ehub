import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Routes, Route } from "react-router-dom"

import { ErrorBoundary } from "@/components/ErrorBoundary"
import { AppShell } from "@/components/AppShell"
import Overview from "@/pages/Overview"
import Forecast from "@/pages/Forecast"
import Drivers from "@/pages/Drivers"
import Promos from "@/pages/Promos"
import Simulator from "@/pages/Simulator"
import Recommendations from "@/pages/Recommendations"
import Chat from "@/pages/Chat"
import ParquetDiagnostics from "./ParquetDiagnostics"

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

export default function App() {
  // Parquet diagnostics is a standalone debug surface — bypass the app shell
  if (typeof window !== "undefined" && window.location.pathname === "/diagnostics/parquet") {
    return (
      <QueryClientProvider client={queryClient}>
        <ParquetDiagnostics />
      </QueryClientProvider>
    )
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Overview />} />
              <Route path="forecast" element={<Forecast />} />
              <Route path="drivers" element={<Drivers />} />
              <Route path="promos" element={<Promos />} />
              <Route path="simulator" element={<Simulator />} />
              <Route path="recommendations" element={<Recommendations />} />
              <Route path="chat" element={<Chat />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
