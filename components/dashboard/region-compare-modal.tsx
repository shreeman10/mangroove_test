"use client"

import { useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { studyAreas } from "@/lib/area"
import {
  BASELINE_YEAR,
  type ClassifyResponse,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { fetchClassify } from "@/app/dashboard/page"

const STALE_TIME = 10 * 60 * 1000
const regionKeys = Object.keys(studyAreas)

type RegionData = {
  totalHectares: number | null
  ndvi: number | null
  trendPct: number | null
  loading: boolean
}

type RegionCompareModalProps = {
  year: string
  onClose: () => void
}

export function RegionCompareModal({ year, onClose }: RegionCompareModalProps) {
  const queryClient = useQueryClient()
  const [tick, setTick] = useState(0)

  // Trigger prefetch for any region/year combos that aren't cached yet
  useEffect(() => {
    for (const rk of regionKeys) {
      queryClient.prefetchQuery({
        queryKey: ["classify", rk, year],
        queryFn: () => fetchClassify(rk, year),
        staleTime: STALE_TIME,
      })
      if (year !== BASELINE_YEAR) {
        queryClient.prefetchQuery({
          queryKey: ["classify", rk, BASELINE_YEAR],
          queryFn: () => fetchClassify(rk, BASELINE_YEAR),
          staleTime: STALE_TIME,
        })
      }
    }
  }, [queryClient, year])

  // Read data from cache
  const regions = useMemo(() => {
    // tick is used to force re-computation when prefetches settle
    void tick
    const result: Record<string, RegionData> = {}
    for (const rk of regionKeys) {
      const current = queryClient.getQueryData<ClassifyResponse>([
        "classify",
        rk,
        year,
      ])
      const baseline = queryClient.getQueryData<ClassifyResponse>([
        "classify",
        rk,
        BASELINE_YEAR,
      ])
      const stats = current?.stats
      const baseStats = baseline?.stats

      let trendPct: number | null = null
      if (
        stats &&
        baseStats &&
        baseStats.totalHectares > 0 &&
        year !== BASELINE_YEAR
      ) {
        trendPct =
          ((stats.totalHectares - baseStats.totalHectares) /
            baseStats.totalHectares) *
          100
      }

      result[rk] = {
        totalHectares: stats?.totalHectares ?? null,
        ndvi: stats?.mangroveMeanNdvi ?? null,
        trendPct,
        loading: !stats,
      }
    }
    return result
  }, [queryClient, year, tick])

  // Poll to re-read cache while any region is still loading
  const anyLoading = Object.values(regions).some((r) => r.loading)
  useEffect(() => {
    if (!anyLoading) return
    const id = setInterval(() => setTick((t) => t + 1), 2000)
    return () => clearInterval(id)
  }, [anyLoading])

  const rows: {
    label: string
    unit: string
    render: (d: RegionData) => string | null
    colorize?: boolean
  }[] = [
    {
      label: "Total Mangrove Area",
      unit: "ha",
      render: (d) =>
        d.totalHectares !== null
          ? d.totalHectares.toLocaleString(undefined, {
              maximumFractionDigits: 1,
            })
          : null,
    },
    {
      label: "Canopy Health (NDVI)",
      unit: "",
      render: (d) => (d.ndvi !== null ? d.ndvi.toFixed(3) : null),
    },
    {
      label: `Trend vs ${BASELINE_YEAR}`,
      unit: "%",
      render: (d) =>
        d.trendPct !== null
          ? `${d.trendPct >= 0 ? "+" : ""}${d.trendPct.toFixed(1)}`
          : year === BASELINE_YEAR
            ? "—"
            : null,
      colorize: true,
    },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm print:hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Card className="relative w-full max-w-2xl mx-4 animate-in fade-in zoom-in-95 duration-200 border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">Region Comparison</h2>
            <p className="text-xs text-muted-foreground">
              Comparing all study areas for{" "}
              <span className="font-mono font-medium text-foreground">
                {year}
              </span>
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close comparison"
          >
            <X />
          </Button>
        </div>

        <div className="overflow-x-auto px-5 py-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-left font-medium text-muted-foreground">
                  Metric
                </th>
                {regionKeys.map((rk) => (
                  <th
                    key={rk}
                    className="pb-2 text-right font-medium text-muted-foreground"
                  >
                    {studyAreas[rk].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className="py-2.5 text-left text-muted-foreground">
                    {row.label}
                  </td>
                  {regionKeys.map((rk) => {
                    const d = regions[rk]
                    const val = row.render(d)
                    return (
                      <td key={rk} className="py-2.5 text-right">
                        {d.loading ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" />
                          </span>
                        ) : val !== null ? (
                          <span
                            className={cn(
                              "font-mono",
                              row.colorize &&
                                d.trendPct !== null &&
                                (d.trendPct >= 0
                                  ? "text-primary"
                                  : "text-destructive")
                            )}
                          >
                            {val}
                            {row.unit && (
                              <span className="ml-0.5 text-muted-foreground">
                                {row.unit}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {anyLoading && (
          <div className="border-t px-5 py-2 text-[10px] text-muted-foreground italic">
            <Loader2 className="mr-1 inline size-3 animate-spin" />
            Fetching data for regions not yet cached…
          </div>
        )}
      </Card>
    </div>
  )
}
