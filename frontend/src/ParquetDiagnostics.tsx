import { useMemo, useState } from "react"
import { ArrowLeft, ChevronLeft, ChevronRight, Database, RefreshCw, Search, X } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type ParquetFile = {
  name: string
  file: string
  rows?: number
  columns?: string[]
  dtypes?: Record<string, string>
  error?: string
}

type ParquetListResponse = {
  snapshot_dir: string
  files: ParquetFile[]
}

type ParquetPreviewResponse = {
  name: string
  file: string
  total_rows: number
  filtered_rows: number
  offset: number
  limit: number
  search: string | null
  column: string | null
  rows_returned: number
  columns: string[]
  dtypes: Record<string, string>
  data: Record<string, unknown>[]
}

const ALL_COLUMNS = "__all__"

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail ?? `Request failed: ${response.status}`)
  }
  return response.json()
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return ""
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

function ParquetDiagnostics() {
  const [selectedName, setSelectedName] = useState<string>("")
  const [searchInput, setSearchInput] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [column, setColumn] = useState(ALL_COLUMNS)
  const [limit, setLimit] = useState(50)
  const [offset, setOffset] = useState(0)

  const filesQuery = useQuery({
    queryKey: ["debug-parquet-files"],
    queryFn: () => fetchJson<ParquetListResponse>("/api/debug/parquet"),
  })

  const files = filesQuery.data?.files ?? []
  const selectedFile = useMemo(() => {
    if (selectedName) return files.find((file) => file.name === selectedName)
    return files[0]
  }, [files, selectedName])

  const activeName = selectedFile?.name ?? ""
  const previewUrl = useMemo(() => {
    if (!activeName) return ""
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    if (appliedSearch.trim()) params.set("search", appliedSearch.trim())
    if (appliedSearch.trim() && column !== ALL_COLUMNS) params.set("column", column)
    return `/api/debug/parquet/${encodeURIComponent(activeName)}?${params.toString()}`
  }, [activeName, appliedSearch, column, limit, offset])

  const previewQuery = useQuery({
    queryKey: ["debug-parquet-preview", previewUrl],
    queryFn: () => fetchJson<ParquetPreviewResponse>(previewUrl),
    enabled: Boolean(previewUrl),
  })

  const preview = previewQuery.data
  const columns = preview?.columns ?? selectedFile?.columns ?? []
  const totalRows = preview?.filtered_rows ?? selectedFile?.rows ?? 0
  const canPrevious = offset > 0
  const canNext = preview ? offset + preview.rows_returned < preview.filtered_rows : false

  function resetPaging(nextOffset = 0) {
    setOffset(nextOffset)
  }

  function applySearch() {
    setAppliedSearch(searchInput)
    resetPaging()
  }

  function clearSearch() {
    setSearchInput("")
    setAppliedSearch("")
    setColumn(ALL_COLUMNS)
    resetPaging()
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-8 py-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold tracking-tight">Parquet Diagnostics</span>
          <span className="text-xs text-muted-foreground">local removable data viewer</span>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <a href="/">
            <ArrowLeft />
            Overview
          </a>
        </Button>
      </header>

      <main className="px-8 py-6 max-w-[1600px] mx-auto space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="size-4" />
                Snapshots
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {filesQuery.isLoading ? (
                <>
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </>
              ) : filesQuery.error ? (
                <p className="text-sm text-destructive">{filesQuery.error.message}</p>
              ) : files.length === 0 ? (
                <p className="text-sm text-muted-foreground">No snapshot Parquet files found.</p>
              ) : (
                files.map((file) => (
                  <button
                    key={file.name}
                    onClick={() => {
                      setSelectedName(file.name)
                      setColumn(ALL_COLUMNS)
                      clearSearch()
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left transition ${
                      activeName === file.name
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{file.name}</span>
                      <Badge variant="secondary">{file.rows?.toLocaleString() ?? "?"}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">{file.file}</div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="text-base">{activeName || "No file selected"}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedFile?.file ?? "Run ETL to create snapshots."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{totalRows.toLocaleString()} visible rows</Badge>
                    <Badge variant="outline">{columns.length} columns</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        filesQuery.refetch()
                        previewQuery.refetch()
                      }}
                    >
                      <RefreshCw />
                      Refresh
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 xl:grid-cols-[220px_1fr_auto_auto] gap-3">
                  <Select
                    value={column}
                    onValueChange={(value) => {
                      setColumn(value)
                      resetPaging()
                    }}
                    disabled={columns.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_COLUMNS}>All columns</SelectItem>
                      {columns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") applySearch()
                      }}
                      placeholder="Filter rows by text"
                      className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    />
                  </div>

                  <Select
                    value={String(limit)}
                    onValueChange={(value) => {
                      setLimit(Number(value))
                      resetPaging()
                    }}
                  >
                    <SelectTrigger className="w-full xl:w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[25, 50, 100, 250, 500].map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value} rows
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex gap-2">
                    <Button onClick={applySearch} className="flex-1 xl:flex-none">
                      Apply
                    </Button>
                    <Button variant="outline" size="icon" onClick={clearSearch} aria-label="Clear filter">
                      <X />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                {previewQuery.isLoading ? (
                  <div className="p-6 space-y-3">
                    <Skeleton className="h-8" />
                    <Skeleton className="h-72" />
                  </div>
                ) : previewQuery.error ? (
                  <div className="p-6 text-sm text-destructive">{previewQuery.error.message}</div>
                ) : !preview ? (
                  <div className="p-6 text-sm text-muted-foreground">Select a file to preview.</div>
                ) : (
                  <>
                    <div className="max-h-[68vh] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow>
                            {preview.columns.map((col) => (
                              <TableHead key={col} className="min-w-[140px] border-r border-border/60">
                                <div className="font-medium">{col}</div>
                                <div className="text-[11px] font-normal text-muted-foreground">
                                  {preview.dtypes[col]}
                                </div>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.data.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={preview.columns.length} className="h-24 text-center text-muted-foreground">
                                No rows match the current filter.
                              </TableCell>
                            </TableRow>
                          ) : (
                            preview.data.map((row, rowIndex) => (
                              <TableRow key={`${preview.offset}-${rowIndex}`}>
                                {preview.columns.map((col) => (
                                  <TableCell
                                    key={col}
                                    className="max-w-[320px] truncate border-r border-border/40 font-mono text-xs"
                                    title={formatValue(row[col])}
                                  >
                                    {formatValue(row[col])}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                      <div>
                        Showing {preview.rows_returned.toLocaleString()} rows from offset {preview.offset.toLocaleString()}
                        {appliedSearch ? ` · filter "${appliedSearch}"` : ""}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canPrevious}
                          onClick={() => resetPaging(Math.max(0, offset - limit))}
                        >
                          <ChevronLeft />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canNext}
                          onClick={() => resetPaging(offset + limit)}
                        >
                          Next
                          <ChevronRight />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

export default ParquetDiagnostics
