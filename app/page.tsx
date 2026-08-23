"use client"

import { useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { FileDown, Satellite } from "lucide-react"

import { MapPanel } from "@/components/dashboard/map-panel"
import { StatsPanel } from "@/components/dashboard/stats-panel"
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

export default function Home() {
  const [region, setRegion] = useState("thane-creek")
  const [year, setYear] = useState("2024")

  const regionName = studyAreas[region]?.name ?? region

  const fetchImagery = async (): Promise<ImageryResponse> => {
    const res = await fetch(`/api/image/${region}?year=${year}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to fetch imagery")
    return data
  }

  const classifyFetch =
    (y: string) =>
    async (): Promise<ClassifyResponse> => {
      const res = await fetch(`/api/classify/${region}?year=${y}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Classification failed")
      return data
    }

  const imagery = useQuery({
    queryKey: ["imagery", region, year],
    queryFn: fetchImagery,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000,
  })

  const analysis = useQuery({
    queryKey: ["classify", region, year],
    queryFn: classifyFetch(year),
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000,
  })

  // Baseline year stats for the "% change vs 2020" badge.
  // Same cache key as the main query when year === baseline → no extra run.
  const baseline = useQuery({
    queryKey: ["classify", region, BASELINE_YEAR],
    queryFn: classifyFetch(BASELINE_YEAR),
    enabled: year !== BASELINE_YEAR,
    staleTime: 10 * 60 * 1000,
  })

  const loading = imagery.isLoading || analysis.isLoading
  const fetching = imagery.isFetching || analysis.isFetching
  const error =
    (analysis.error as Error | null)?.message ??
    (imagery.error as Error | null)?.message ??
    null

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-background p-3 text-foreground">
      <header className="flex items-center justify-between rounded-xl border bg-card px-4 py-2">
        <div className="flex items-center gap-2">
          <Satellite className="size-5 text-primary" />
          <span className="text-lg font-bold tracking-tight">
            Mangrove<span className="text-primary">AI</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground lg:inline">
            Study Region
          </span>
          <Select
            value={region}
            onValueChange={(v) => {
              if (v !== null) setRegion(v)
            }}
          >
            <SelectTrigger className="w-48">
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

          <Select
            value={year}
            onValueChange={(v) => {
              if (v !== null) setYear(v)
            }}
          >
            <SelectTrigger className="w-24">
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

          <Button onClick={() => window.print()}>
            <FileDown /> Export PDF Report
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-3">
        <div className="h-full min-w-0 w-[65%]">
          <MapPanel
            regionName={regionName}
            year={year}
            onYearChange={setYear}
            imageryUrl={imagery.data?.url}
            maskUrl={analysis.data?.url}
            loading={loading}
            fetching={fetching}
            error={error}
          />
        </div>

        <aside className="h-full min-w-0 w-[35%]">
          <StatsPanel
            regionName={regionName}
            year={year}
            stats={analysis.data?.stats}
            baselineStats={baseline.data?.stats ?? analysis.data?.stats}
            debug={analysis.data?.debug}
            loading={loading}
          />
        </aside>
      </main>
    </div>
  )
}
