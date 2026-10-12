"use client"

import { useEffect, useState } from "react"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { BarChart3, FileDown, FileSpreadsheet, Satellite, Home, Gauge } from "lucide-react"
import { useRouter } from "next/navigation"

import { MapPanel } from "@/components/dashboard/map-panel"
import { StatsPanel } from "@/components/dashboard/stats-panel"
import { TimeSeriesDrawer } from "@/components/dashboard/time-series-drawer"
import { RegionCompareView } from "@/components/dashboard/region-compare-view"
import { ChangeDetectionView } from "@/components/dashboard/change-detection-view"
import { MetricsView } from "@/components/dashboard/metrics-view"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { studyAreas } from "@/lib/area"
import {
  BASELINE_YEAR,
  TIMELINE_YEARS,
  type ClassifyResponse,
  type ImageryResponse,
} from "@/lib/types"

const STALE_TIME = 10 * 60 * 1000

// Warm the browser's image cache so the <img> swap is instant once the
// GEE thumbnail URL is known.
function preloadThumbnail(url?: string) {
  if (typeof window !== "undefined" && url) {
    const img = new Image()
    img.src = url
  }
}

export async function fetchImagery(
  region: string,
  year: string
): Promise<ImageryResponse> {
  const res = await fetch(`/api/image/${region}?year=${year}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Failed to fetch imagery")
  preloadThumbnail(data.url)
  return data
}

export async function fetchClassify(
  region: string,
  year: string
): Promise<ClassifyResponse> {
  const res = await fetch(`/api/classify/${region}?year=${year}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Classification failed")
  preloadThumbnail(data.url)
  return data
}

// ─── CSV Export ─────────────────────────────────────────────────────────
function generateCSV(
  region: string,
  queryClient: ReturnType<typeof useQueryClient>
): string {
  const headers = [
    "Year",
    "Total Area (ha)",
    "Healthy Area (ha)",
    "Degraded Area (ha)",
    "NDVI",
    "MNDWI",
    "B2 (Blue)",
    "B3 (Green)",
    "B4 (Red)",
    "B8 (NIR)",
    "B11 (SWIR)",
  ]

  const rows: string[][] = [headers]

  for (const y of TIMELINE_YEARS) {
    const cached = queryClient.getQueryData<ClassifyResponse>([
      "classify",
      region,
      y,
    ])
    const stats = cached?.stats
    if (!stats) {
      rows.push([y, ...Array(headers.length - 1).fill("")])
      continue
    }

    rows.push([
      y,
      stats.totalHectares.toFixed(1),
      stats.healthyHectares.toFixed(1),
      stats.degradedHectares.toFixed(1),
      stats.mangroveMeanNdvi.toFixed(4),
      (stats.bandMeans["MNDWI"] ?? "").toString(),
      (stats.bandMeans["B2"] ?? "").toString(),
      (stats.bandMeans["B3"] ?? "").toString(),
      (stats.bandMeans["B4"] ?? "").toString(),
      (stats.bandMeans["B8"] ?? "").toString(),
      (stats.bandMeans["B11"] ?? "").toString(),
    ])
  }

  return rows.map((r) => r.join(",")).join("\n")
}

function downloadCSV(region: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `MangroveAI_${region}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function DashboardPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [region, setRegion] = useState("thane-creek")
  const [year, setYear] = useState("2024")
  const [viewMode, setViewMode] = useState<"home" | "change" | "compare" | "metrics">("home")

  const regionName = studyAreas[region]?.name ?? region

  const imagery = useQuery({
    queryKey: ["imagery", region, year],
    queryFn: () => fetchImagery(region, year),
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
  })

  const analysis = useQuery({
    queryKey: ["classify", region, year],
    queryFn: () => fetchClassify(region, year),
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
  })

  // Baseline year stats for the "% change vs 2020" badge.
  // Same cache key as the main query when year === baseline → no extra run.
  const baseline = useQuery({
    queryKey: ["classify", region, BASELINE_YEAR],
    queryFn: () => fetchClassify(region, BASELINE_YEAR),
    enabled: year !== BASELINE_YEAR,
    staleTime: STALE_TIME,
  })

  // Background warm-up for the active region: cheap RGB composites for every
  // year first, then the expensive RF classification sequentially (lowest
  // possible GEE load). Already-cached/fresh years are skipped by TanStack,
  // and the currently-viewing year dedupes into the in-flight query.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      for (const y of TIMELINE_YEARS) {
        if (cancelled) return
        await queryClient.prefetchQuery({
          queryKey: ["imagery", region, y],
          queryFn: () => fetchImagery(region, y),
          staleTime: STALE_TIME,
        })
      }
      for (const y of TIMELINE_YEARS) {
        if (cancelled) return
        await queryClient.prefetchQuery({
          queryKey: ["classify", region, y],
          queryFn: () => fetchClassify(region, y),
          staleTime: STALE_TIME,
        })
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [region, queryClient])

  const loading = imagery.isLoading || analysis.isLoading
  const fetching = imagery.isFetching || analysis.isFetching
  const error =
    (analysis.error as Error | null)?.message ??
    (imagery.error as Error | null)?.message ??
    null

  const handleExportCSV = () => {
    const csv = generateCSV(region, queryClient)
    downloadCSV(region, csv)
  }

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-background p-3 text-foreground print:gap-0 print:p-0">
      <header className="flex items-center justify-between rounded-xl border bg-card px-4 py-2 print:rounded-none print:border-0 print:bg-white print:text-black">
        <div className="flex items-center gap-2">
          <Satellite className="size-5 text-primary print:text-black" />
          <span className="text-lg font-bold tracking-tight">
            Mangrove<span className="text-primary print:text-black">AI</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground lg:inline print:hidden">
            Study Region
          </span>
          <Select
            value={region}
            onValueChange={(v) => {
              if (v !== null) setRegion(v)
            }}
          >
            <SelectTrigger className="w-48 print:hidden">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(studyAreas).map(([key, area]) => (
                  <SelectItem key={key} value={key}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {/* Print-only region/year label */}
          <span className="hidden print:inline text-sm font-medium">
            {regionName} · {year}
          </span>

          <Select
            value={year}
            onValueChange={(v) => {
              if (v !== null) setYear(v)
            }}
          >
            <SelectTrigger className="w-24 print:hidden">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TIMELINE_YEARS.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() => setViewMode("home")}
            className="print:hidden"
          >
            <Home /> Home
          </Button>

          <Button
            variant={viewMode === "compare" ? "default" : "outline"}
            onClick={() => setViewMode(viewMode === "compare" ? "home" : "compare")}
            className="print:hidden"
          >
            <BarChart3 /> Compare Regions
          </Button>
          
          <Button
            variant={viewMode === "change" ? "default" : "outline"}
            onClick={() => setViewMode(viewMode === "change" ? "home" : "change")}
            className="print:hidden"
          >
            Change Detection
          </Button>

          <Button
            variant={viewMode === "metrics" ? "default" : "outline"}
            onClick={() => setViewMode(viewMode === "metrics" ? "home" : "metrics")}
            className="print:hidden"
          >
            <Gauge /> Metrics
          </Button>

          <Button onClick={handleExportCSV} variant="outline" className="print:hidden">
            <FileSpreadsheet /> Export CSV
          </Button>

          <Button onClick={() => window.print()} className="print:hidden">
            <FileDown /> Export PDF Report
          </Button>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 gap-3 print:gap-0">
        {viewMode === "metrics" ? (
          <MetricsView />
        ) : viewMode === "change" ? (
          <ChangeDetectionView region={region} currentYear={year} />
        ) : viewMode === "compare" ? (
          <RegionCompareView year={year} />
        ) : (
          <>
            <div className="h-full min-w-0 w-[65%] print:w-full">
              <MapPanel
                regionName={regionName}
                year={year}
                onYearChange={setYear}
                onRegionChange={setRegion}
                imageryUrl={imagery.data?.url}
                maskUrl={analysis.data?.url}
                loading={loading}
                fetching={fetching}
                error={error}
              />
            </div>

            <aside className="h-full min-w-0 w-[35%] print:hidden">
              <StatsPanel
                regionName={regionName}
                year={year}
                stats={analysis.data?.stats}
                baselineStats={baseline.data?.stats ?? analysis.data?.stats}
                debug={analysis.data?.debug}
                loading={loading}
              />
            </aside>
          </>
        )}

        {/* Time Series Drawer - anchored at bottom of main area */}
        <div className="absolute bottom-3 left-3 z-20 print:hidden">
          <TimeSeriesDrawer region={region} />
        </div>
      </main>

    </div>
  )
}
