"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { TIMELINE_YEARS, BASELINE_YEAR, type ClassifyResponse } from "@/lib/types"
import { cn } from "@/lib/utils"

type TimeSeriesPoint = {
  year: string
  totalHectares: number | null
  meanNdvi: number | null
  healthyHectares: number | null
  degradedHectares: number | null
  changePct: number | null
  healthLabel: string | null
  cached: boolean
}

function healthStatus(ndvi: number): string {
  if (ndvi >= 0.65) return "Dense Canopy (Healthy)"
  if (ndvi >= 0.45) return "Moderate Canopy"
  return "Degraded"
}

function CustomTooltip(props: {
  active?: boolean
  payload?: Array<{ payload?: TimeSeriesPoint }>
  label?: string
}) {
  const { active, payload, label } = props
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as TimeSeriesPoint | undefined
  if (!d) return null

  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-1.5 font-semibold text-foreground">{label}</p>
      {d.cached && d.totalHectares !== null ? (
        <>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Total Area</span>
            <span className="font-mono font-medium">
              {d.totalHectares.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}{" "}
              ha
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Mean NDVI</span>
            <span className="font-mono font-medium">
              {d.meanNdvi?.toFixed(3) ?? "—"}
            </span>
          </div>
          {d.changePct !== null && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">
                vs {BASELINE_YEAR}
              </span>
              <span
                className={cn(
                  "font-mono font-medium",
                  d.changePct >= 0 ? "text-primary" : "text-destructive"
                )}
              >
                {d.changePct >= 0 ? "+" : ""}
                {d.changePct.toFixed(1)}%
              </span>
            </div>
          )}
          {d.healthLabel && (
            <div className="mt-1 border-t border-border pt-1 text-muted-foreground">
              Health: <span className="text-foreground">{d.healthLabel}</span>
            </div>
          )}
        </>
      ) : (
        <p className="text-muted-foreground italic">Data not yet loaded</p>
      )}
    </div>
  )
}

type TimeSeriesDrawerProps = {
  region: string
}

export function TimeSeriesDrawer({ region }: TimeSeriesDrawerProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data, deltaPerYear } = useMemo(() => {
    let baselineHa: number | null = null
    const points: TimeSeriesPoint[] = []

    for (const y of TIMELINE_YEARS) {
      const cached = queryClient.getQueryData<ClassifyResponse>([
        "classify",
        region,
        y,
      ])
      const stats = cached?.stats

      if (y === BASELINE_YEAR && stats) {
        baselineHa = stats.totalHectares
      }

      if (stats) {
        const changePct =
          baselineHa !== null && baselineHa > 0 && y !== BASELINE_YEAR
            ? ((stats.totalHectares - baselineHa) / baselineHa) * 100
            : null

        points.push({
          year: y,
          totalHectares: stats.totalHectares,
          meanNdvi: stats.mangroveMeanNdvi,
          healthyHectares: stats.healthyHectares,
          degradedHectares: stats.degradedHectares,
          changePct,
          healthLabel: healthStatus(stats.mangroveMeanNdvi),
          cached: true,
        })
      } else {
        points.push({
          year: y,
          totalHectares: null,
          meanNdvi: null,
          healthyHectares: null,
          degradedHectares: null,
          changePct: null,
          healthLabel: null,
          cached: false,
        })
      }
    }

    // Compute Δ Hectares/Year from first and last *available* data points
    const available = points.filter((p) => p.cached && p.totalHectares !== null)
    let delta: number | null = null
    if (available.length >= 2) {
      const first = available[0]
      const last = available[available.length - 1]
      const yearSpan =
        parseInt(last.year) - parseInt(first.year)
      if (yearSpan > 0) {
        delta = (last.totalHectares! - first.totalHectares!) / yearSpan
      }
    }

    return { data: points, deltaPerYear: delta }
  }, [queryClient, region])

  // Re-evaluate when the drawer is opened (cache may have grown)
  const refreshKey = open ? Date.now() : 0
  void refreshKey

  return (
    <div className="print:hidden">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className="gap-1.5"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        Time Series
      </Button>

      {open && (
        <Card className="absolute bottom-0 left-0 right-0 z-30 mx-3 mb-3 animate-in slide-in-from-bottom-4 duration-300 border bg-card/95 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">
                Multi-Year Coverage Trend
              </h3>
              {deltaPerYear !== null && (
                <Badge
                  variant={deltaPerYear >= 0 ? "default" : "destructive"}
                  className="text-[10px]"
                >
                  <TrendingUp className="size-3" />
                  Δ {deltaPerYear >= 0 ? "+" : ""}
                  {deltaPerYear.toFixed(1)} ha/yr
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setOpen(false)}
              aria-label="Close time series drawer"
            >
              <ChevronDown />
            </Button>
          </div>

          <div className="px-4 py-3" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="hectaresGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="hsl(163, 72%, 47%)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(163, 72%, 47%)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id="ndviGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="hsl(45, 93%, 55%)"
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(45, 93%, 55%)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(255, 10%, 25%)"
                  vertical={false}
                />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11, fill: "hsl(255, 5%, 65%)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="hectares"
                  orientation="left"
                  tick={{ fontSize: 10, fill: "hsl(255, 5%, 65%)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                  }
                  label={{
                    value: "Hectares",
                    angle: -90,
                    position: "insideLeft",
                    offset: 10,
                    style: { fontSize: 10, fill: "hsl(255, 5%, 55%)" },
                  }}
                />
                <YAxis
                  yAxisId="ndvi"
                  orientation="right"
                  domain={[0, 1]}
                  tick={{ fontSize: 10, fill: "hsl(255, 5%, 65%)" }}
                  axisLine={false}
                  tickLine={false}
                  label={{
                    value: "NDVI",
                    angle: 90,
                    position: "insideRight",
                    offset: 10,
                    style: { fontSize: 10, fill: "hsl(255, 5%, 55%)" },
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  yAxisId="hectares"
                  type="monotone"
                  dataKey="totalHectares"
                  stroke="hsl(163, 72%, 47%)"
                  strokeWidth={2}
                  fill="url(#hectaresGradient)"
                  dot={{ r: 3, fill: "hsl(163, 72%, 47%)" }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
                <Area
                  yAxisId="ndvi"
                  type="monotone"
                  dataKey="meanNdvi"
                  stroke="hsl(45, 93%, 55%)"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  fill="url(#ndviGradient)"
                  dot={{ r: 3, fill: "hsl(45, 93%, 55%)" }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded bg-[hsl(163,72%,47%)]" />
              Total Hectares
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded border-t-2 border-dashed border-[hsl(45,93%,55%)]" />
              Mean NDVI
            </span>
            {data.some((d) => !d.cached) && (
              <span className="ml-auto italic">
                Some years still loading…
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
