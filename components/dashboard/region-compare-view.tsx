"use client"

import { useMemo } from "react"
import { useQueries } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { studyAreas } from "@/lib/area"
import { BASELINE_YEAR } from "@/lib/types"
import { cn } from "@/lib/utils"
import { fetchClassify } from "@/app/dashboard/page"
import { fetchCauses } from "@/components/dashboard/change-detection-view"

const STALE_TIME = 10 * 60 * 1000
const regionKeys = Object.keys(studyAreas)

type RegionData = {
  totalHectares: number | null
  ndvi: number | null
  trendPct: number | null
  causeUrbanPct: number | null
  causeErosionPct: number | null
  loading: boolean
}

type RegionCompareViewProps = {
  year: string
}

export function RegionCompareView({ year }: RegionCompareViewProps) {
  const currentQueries = useQueries({
    queries: regionKeys.map((rk) => ({
      queryKey: ["classify", rk, year],
      queryFn: () => fetchClassify(rk, year),
      staleTime: STALE_TIME,
    })),
  })

  const baselineQueries = useQueries({
    queries: regionKeys.map((rk) => ({
      queryKey: ["classify", rk, BASELINE_YEAR],
      queryFn: () => fetchClassify(rk, BASELINE_YEAR),
      staleTime: STALE_TIME,
      enabled: year !== BASELINE_YEAR,
    })),
  })

  const causesQueries = useQueries({
    queries: regionKeys.map((rk) => ({
      queryKey: ["causes", rk, BASELINE_YEAR, year],
      queryFn: () => fetchCauses(rk, BASELINE_YEAR, year),
      staleTime: STALE_TIME,
      enabled: year !== BASELINE_YEAR,
    })),
  })

  const regions = useMemo(() => {
    const result: Record<string, RegionData> = {}
    
    regionKeys.forEach((rk, i) => {
      const current = currentQueries[i].data
      const baseline = baselineQueries[i].data
      const causesData = causesQueries[i].data
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

      let causeUrbanPct: number | null = null
      let causeErosionPct: number | null = null

      if (causesData?.causes?.breakdown) {
        causeUrbanPct = causesData.causes.breakdown["Urban/Infrastructure"]?.percentage ?? null
        causeErosionPct = causesData.causes.breakdown["Erosion/Water"]?.percentage ?? null
      }

      result[rk] = {
        totalHectares: stats?.totalHectares ?? null,
        ndvi: stats?.mangroveMeanNdvi ?? null,
        trendPct,
        causeUrbanPct,
        causeErosionPct,
        loading: 
          currentQueries[i].isPending || 
          (year !== BASELINE_YEAR && baselineQueries[i].isPending) ||
          (year !== BASELINE_YEAR && causesQueries[i].isPending),
      }
    })
    return result
  }, [currentQueries, baselineQueries, causesQueries, year])

  const anyLoading = 
    currentQueries.some((q) => q.isPending) || 
    (year !== BASELINE_YEAR && baselineQueries.some((q) => q.isPending)) ||
    (year !== BASELINE_YEAR && causesQueries.some((q) => q.isPending))

  const rows = [
    {
      label: "Total Mangrove Area",
      unit: "ha",
      render: (d: RegionData) =>
        d.totalHectares !== null
          ? d.totalHectares.toLocaleString(undefined, {
              maximumFractionDigits: 1,
            })
          : null,
    },
    {
      label: "Canopy Health (NDVI)",
      unit: "",
      render: (d: RegionData) => (d.ndvi !== null ? d.ndvi.toFixed(3) : null),
    },
    {
      label: `Trend vs ${BASELINE_YEAR}`,
      unit: "%",
      render: (d: RegionData) =>
        d.trendPct !== null
          ? `${d.trendPct >= 0 ? "+" : ""}${d.trendPct.toFixed(1)}`
          : year === BASELINE_YEAR
            ? "—"
            : null,
      colorize: true,
    },
    {
      label: "Loss: Urban/Infrastructure",
      unit: "%",
      render: (d: RegionData) => 
        d.causeUrbanPct !== null
          ? d.causeUrbanPct.toFixed(1)
          : year === BASELINE_YEAR
            ? "—"
            : null
    },
    {
      label: "Loss: Erosion/Water",
      unit: "%",
      render: (d: RegionData) => 
        d.causeErosionPct !== null
          ? d.causeErosionPct.toFixed(1)
          : year === BASELINE_YEAR
            ? "—"
            : null
    }
  ]

  // Chart Data preparation
  const chartData = regionKeys.map(rk => {
    const d = regions[rk];
    
    // Shorten long names for the tight chart layout so Recharts doesn't drop them
    let shortName = studyAreas[rk].name;
    if (rk === "thane-creek") shortName = "Thane";
    if (rk === "pichavaram") shortName = "Pichavaram";
    if (rk === "sundarbans-core") shortName = "Sundarbans";

    return {
      name: shortName,
      fullName: studyAreas[rk].name,
      "Total Area (ha)": d.totalHectares ? Number(d.totalHectares.toFixed(1)) : 0,
      "NDVI": d.ndvi ? Number(d.ndvi.toFixed(3)) : 0,
      "Trend (%)": d.trendPct ? Number(d.trendPct.toFixed(1)) : 0
    }
  })

  return (
    <div className="flex h-full w-full flex-col gap-3 min-h-0">
      <Card className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
        <CardHeader className="border-b bg-muted/40 py-4 shrink-0">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Region Comparison</span>
            <span className="text-sm font-normal text-muted-foreground">
              {year} vs {BASELINE_YEAR}
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col min-h-0 p-6 overflow-y-auto relative">
          
          {/* Dim and spinner when loading */}
          {anyLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/60 backdrop-blur-sm">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Fetching data for comparison...</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-6 h-[250px] w-full shrink-0 mb-6">
            {/* Chart 1: Total Area */}
            <div className="flex flex-col h-full bg-card border rounded-lg p-3">
              <h5 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 text-center">Total Area (ha)</h5>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="name" className="text-[10px]" tickLine={false} axisLine={false} />
                    <YAxis className="text-[10px]" tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '6px', fontSize: '11px' }} />
                    <Bar dataKey="Total Area (ha)" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: NDVI */}
            <div className="flex flex-col h-full bg-card border rounded-lg p-3">
              <h5 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 text-center">Canopy Health (NDVI)</h5>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="name" className="text-[10px]" tickLine={false} axisLine={false} />
                    <YAxis className="text-[10px]" tickLine={false} axisLine={false} domain={[0, 'auto']} />
                    <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '6px', fontSize: '11px' }} />
                    <Bar dataKey="NDVI" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 3: Trend */}
            <div className="flex flex-col h-full bg-card border rounded-lg p-3">
              <h5 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 text-center">Trend vs {BASELINE_YEAR} (%)</h5>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="name" className="text-[10px]" tickLine={false} axisLine={false} />
                    <YAxis className="text-[10px]" tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '6px', fontSize: '11px' }} />
                    <Bar dataKey="Trend (%)" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry["Trend (%)"] < 0 ? 'var(--destructive)' : 'var(--primary)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">
                    Metric
                  </th>
                  {regionKeys.map((rk) => (
                    <th
                      key={rk}
                      className="py-3 px-4 text-right font-medium text-muted-foreground"
                    >
                      {studyAreas[rk].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.label} className="hover:bg-muted/20">
                    <td className="py-3 px-4 text-left text-muted-foreground font-medium">
                      {row.label}
                    </td>
                    {regionKeys.map((rk) => {
                      const d = regions[rk]
                      const val = row.render(d)
                      return (
                        <td key={rk} className="py-3 px-4 text-right">
                          {val !== null ? (
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
        </CardContent>
      </Card>
    </div>
  )
}
