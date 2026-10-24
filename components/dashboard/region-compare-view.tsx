"use client"

import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ReferenceLine,
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Info,
  Lightbulb,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  TreePine,
  Waves,
  Building2,
  Fish,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import comparisonData from "@/data/region-comparison.json"

// ─── Static data extraction ───────────────────────────────────────────
const data = comparisonData
const regionKeys = Object.keys(data.regions) as Array<keyof typeof data.regions>

// Color palette
const REGION_COLORS = {
  "thane-creek": "hsl(200, 85%, 55%)",
  "bhitarkanika": "hsl(150, 70%, 45%)",
  "sundarbans-core": "hsl(35, 85%, 55%)",
} as const

const LOSS_COLORS = [
  "hsl(0, 75%, 55%)",    // Urban
  "hsl(210, 70%, 55%)",  // Erosion
  "hsl(45, 80%, 55%)",   // Aquaculture
  "hsl(270, 50%, 55%)",  // Other
]

const FINDING_CONFIG = {
  critical: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", icon: AlertTriangle },
  negative: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", icon: TrendingDown },
  positive: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", icon: TrendingUp },
  insight: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", icon: Lightbulb },
} as const

// ─── Helper to format numbers ─────────────────────────────────────────
function fmt(n: number, decimals = 1): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
}

// ─── Custom Tooltip for charts ─────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card/95 backdrop-blur-sm px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-mono font-semibold">{typeof p.value === "number" ? fmt(p.value, 1) : p.value}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────
export function RegionCompareView() {
  // Prepare chart datasets from static data
  const areaComparisonData = useMemo(() => regionKeys.map(rk => {
    const r = data.regions[rk]
    return {
      name: r.shortName,
      "2016": r.data2016.totalHectares,
      "2026": r.data2026.totalHectares,
      change: r.change.areaChangeHa,
    }
  }), [])

  const ndviComparisonData = useMemo(() => regionKeys.map(rk => {
    const r = data.regions[rk]
    return {
      name: r.shortName,
      "2016": r.data2016.mangroveMeanNdvi,
      "2026": r.data2026.mangroveMeanNdvi,
      change: r.change.ndviChange,
    }
  }), [])

  const healthDegradedData = useMemo(() => regionKeys.map(rk => {
    const r = data.regions[rk]
    return {
      name: r.shortName,
      "Healthy 2016": r.data2016.healthyPct,
      "Degraded 2016": r.data2016.degradedPct,
      "Healthy 2026": r.data2026.healthyPct,
      "Degraded 2026": r.data2026.degradedPct,
    }
  }), [])

  // Yearly trend data (all regions merged per year)
  const trendData = useMemo(() => {
    const years = data.regions["thane-creek"].yearlyTrend.map(t => t.year)
    return years.map(yr => {
      const row: any = { year: yr }
      regionKeys.forEach(rk => {
        const r = data.regions[rk]
        const point = r.yearlyTrend.find(t => t.year === yr)
        row[r.shortName] = point?.area ?? 0
      })
      return row
    })
  }, [])

  const ndviTrendData = useMemo(() => {
    const years = data.regions["thane-creek"].yearlyTrend.map(t => t.year)
    return years.map(yr => {
      const row: any = { year: yr }
      regionKeys.forEach(rk => {
        const r = data.regions[rk]
        const point = r.yearlyTrend.find(t => t.year === yr)
        row[r.shortName] = point?.ndvi ?? 0
      })
      return row
    })
  }, [])

  // Loss breakdown for stacked chart
  const lossBreakdownData = useMemo(() => regionKeys.map(rk => {
    const r = data.regions[rk]
    return {
      name: r.shortName,
      "Urban/Infra": r.lossBreakdown["Urban/Infrastructure"].percentage,
      "Erosion/Water": r.lossBreakdown["Erosion/Water"].percentage,
      "Aquaculture": r.lossBreakdown["Aquaculture"].percentage,
      "Other": r.lossBreakdown["Other"].percentage,
    }
  }), [])

  // Radar chart data
  const radarData = useMemo(() => {
    const metrics = [
      { metric: "Total Area", key: "totalHectares", max: 7500 },
      { metric: "Healthy %", key: "healthyPct", max: 100 },
      { metric: "NDVI", key: "mangroveMeanNdvi", max: 1 },
      { metric: "Low Erosion", key: "erosion", max: 100 },
      { metric: "Low Urban Loss", key: "urban", max: 100 },
    ]
    return metrics.map(m => {
      const row: any = { metric: m.metric }
      regionKeys.forEach(rk => {
        const r = data.regions[rk]
        if (m.key === "totalHectares") {
          row[r.shortName] = (r.data2026.totalHectares / m.max) * 100
        } else if (m.key === "healthyPct") {
          row[r.shortName] = r.data2026.healthyPct
        } else if (m.key === "mangroveMeanNdvi") {
          row[r.shortName] = (r.data2026.mangroveMeanNdvi / m.max) * 100
        } else if (m.key === "erosion") {
          row[r.shortName] = 100 - r.lossBreakdown["Erosion/Water"].percentage
        } else if (m.key === "urban") {
          row[r.shortName] = 100 - r.lossBreakdown["Urban/Infrastructure"].percentage
        }
      })
      return row
    })
  }, [])

  // Net summary card data
  const netChange = data.summary.totalAreaChange2016to2026
  const totalArea2016 = regionKeys.reduce((sum, rk) => sum + data.regions[rk].data2016.totalHectares, 0)
  const totalArea2026 = regionKeys.reduce((sum, rk) => sum + data.regions[rk].data2026.totalHectares, 0)

  return (
    <div className="flex h-full w-full flex-col gap-3 min-h-0 overflow-y-auto">
      {/* Header */}
      <Card className="shrink-0 overflow-hidden">
        <CardHeader className="border-b bg-muted/40 py-4">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TreePine className="size-4 text-primary" />
              Regional Mangrove Comparison — Final Analysis
            </span>
            <Badge variant="outline" className="text-xs font-normal">
              2016 → 2026 · 10-Year Study Period
            </Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Key Summary Cards */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        {/* Total Net Change */}
        <Card className="overflow-hidden border-l-4 border-l-destructive/70">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Net Change (All Regions)</p>
            <p className="text-2xl font-bold text-destructive font-mono">{fmt(netChange.netAll)} ha</p>
            <p className="text-xs text-muted-foreground mt-1">
              {fmt(data.summary.overallNetChangePct)}% decline overall
            </p>
          </CardContent>
        </Card>

        {/* Per region mini cards */}
        {regionKeys.map(rk => {
          const r = data.regions[rk]
          const isPositive = r.change.areaChangePct > 0
          return (
            <Card key={rk} className={cn(
              "overflow-hidden border-l-4",
              isPositive ? "border-l-primary/70" : "border-l-orange-500/70"
            )}>
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 truncate">{r.shortName}</p>
                <div className="flex items-baseline gap-2">
                  <p className={cn("text-2xl font-bold font-mono", isPositive ? "text-primary" : "text-orange-400")}>
                    {isPositive ? "+" : ""}{fmt(r.change.areaChangePct)}%
                  </p>
                  {isPositive
                    ? <ArrowUpRight className="size-4 text-primary" />
                    : <ArrowDownRight className="size-4 text-orange-400" />
                  }
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isPositive ? "+" : ""}{fmt(r.change.areaChangeHa)} ha
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Row 1: Area Comparison + NDVI Comparison */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        {/* Side-by-side area bars */}
        <Card className="overflow-hidden">
          <CardHeader className="py-3 px-4 border-b bg-muted/30">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="size-3.5 text-muted-foreground" />
              Mangrove Area — 2016 vs 2026
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={areaComparisonData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="name" className="text-[10px]" tickLine={false} axisLine={false} />
                <YAxis className="text-[10px]" tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="2016" fill="hsl(210, 50%, 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="2026" fill="hsl(150, 65%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* NDVI Comparison */}
        <Card className="overflow-hidden">
          <CardHeader className="py-3 px-4 border-b bg-muted/30">
            <CardTitle className="text-sm flex items-center gap-2">
              <TreePine className="size-3.5 text-muted-foreground" />
              Canopy Health (NDVI) — 2016 vs 2026
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ndviComparisonData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="name" className="text-[10px]" tickLine={false} axisLine={false} />
                <YAxis className="text-[10px]" tickLine={false} axisLine={false} domain={[0.5, 0.75]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="2016" fill="hsl(210, 50%, 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="2026" fill="hsl(150, 65%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: 10-Year Area Trend + NDVI Trend */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <Card className="overflow-hidden">
          <CardHeader className="py-3 px-4 border-b bg-muted/30">
            <CardTitle className="text-sm">📈 10-Year Area Trend (2016–2026)</CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="year" className="text-[10px]" tickLine={false} axisLine={false} />
                <YAxis className="text-[10px]" tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                {regionKeys.map(rk => (
                  <Line
                    key={rk}
                    type="monotone"
                    dataKey={data.regions[rk].shortName}
                    stroke={REGION_COLORS[rk]}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: REGION_COLORS[rk] }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="py-3 px-4 border-b bg-muted/30">
            <CardTitle className="text-sm">🌿 10-Year NDVI Trend (2016–2026)</CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ndviTrendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="year" className="text-[10px]" tickLine={false} axisLine={false} />
                <YAxis className="text-[10px]" tickLine={false} axisLine={false} domain={[0.55, 0.72]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                {regionKeys.map(rk => (
                  <Line
                    key={rk}
                    type="monotone"
                    dataKey={data.regions[rk].shortName}
                    stroke={REGION_COLORS[rk]}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: REGION_COLORS[rk] }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Loss Breakdown + Health Radar */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        {/* Stacked loss breakdown */}
        <Card className="overflow-hidden">
          <CardHeader className="py-3 px-4 border-b bg-muted/30">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="size-3.5 text-orange-400" />
              Loss Cause Breakdown by Region (%)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lossBreakdownData} layout="vertical" margin={{ top: 5, right: 10, left: 15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" className="text-[10px]" tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="name" className="text-[10px]" tickLine={false} axisLine={false} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Bar dataKey="Urban/Infra" stackId="a" fill={LOSS_COLORS[0]} />
                <Bar dataKey="Erosion/Water" stackId="a" fill={LOSS_COLORS[1]} />
                <Bar dataKey="Aquaculture" stackId="a" fill={LOSS_COLORS[2]} />
                <Bar dataKey="Other" stackId="a" fill={LOSS_COLORS[3]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Radar chart */}
        <Card className="overflow-hidden">
          <CardHeader className="py-3 px-4 border-b bg-muted/30">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-muted-foreground" />
              Regional Health Scorecard (2026)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid className="stroke-muted" />
                <PolarAngleAxis dataKey="metric" className="text-[10px]" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <PolarRadiusAxis className="text-[9px]" angle={90} domain={[0, 100]} tick={false} />
                {regionKeys.map(rk => (
                  <Radar
                    key={rk}
                    name={data.regions[rk].shortName}
                    dataKey={data.regions[rk].shortName}
                    stroke={REGION_COLORS[rk]}
                    fill={REGION_COLORS[rk]}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed comparison table */}
      <Card className="shrink-0 overflow-hidden">
        <CardHeader className="py-3 px-4 border-b bg-muted/30">
          <CardTitle className="text-sm">📊 Detailed Metrics Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Metric</th>
                  {regionKeys.map(rk => (
                    <th key={rk} colSpan={3} className="py-3 px-4 text-center font-medium text-muted-foreground border-l">
                      {data.regions[rk].shortName}
                    </th>
                  ))}
                </tr>
                <tr className="border-b bg-muted/20 text-[11px]">
                  <th className="py-2 px-4" />
                  {regionKeys.map(rk => (
                    <>
                      <th key={`${rk}-2016`} className="py-2 px-2 text-center text-muted-foreground font-normal border-l">2016</th>
                      <th key={`${rk}-2026`} className="py-2 px-2 text-center text-muted-foreground font-normal">2026</th>
                      <th key={`${rk}-diff`} className="py-2 px-2 text-center text-muted-foreground font-normal">Δ Change</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {/* Total Area */}
                <tr className="hover:bg-muted/20">
                  <td className="py-3 px-4 text-muted-foreground font-medium">Total Area (ha)</td>
                  {regionKeys.map(rk => {
                    const r = data.regions[rk]
                    const isPos = r.change.areaChangeHa > 0
                    return (
                      <>
                        <td key={`${rk}-a16`} className="py-3 px-2 text-center font-mono text-xs border-l">{fmt(r.data2016.totalHectares)}</td>
                        <td key={`${rk}-a26`} className="py-3 px-2 text-center font-mono text-xs">{fmt(r.data2026.totalHectares)}</td>
                        <td key={`${rk}-ad`} className={cn("py-3 px-2 text-center font-mono text-xs font-semibold", isPos ? "text-primary" : "text-destructive")}>
                          {isPos ? "+" : ""}{fmt(r.change.areaChangeHa)}
                        </td>
                      </>
                    )
                  })}
                </tr>
                {/* NDVI */}
                <tr className="hover:bg-muted/20">
                  <td className="py-3 px-4 text-muted-foreground font-medium">Canopy NDVI</td>
                  {regionKeys.map(rk => {
                    const r = data.regions[rk]
                    const isPos = r.change.ndviChange > 0
                    return (
                      <>
                        <td key={`${rk}-n16`} className="py-3 px-2 text-center font-mono text-xs border-l">{r.data2016.mangroveMeanNdvi.toFixed(3)}</td>
                        <td key={`${rk}-n26`} className="py-3 px-2 text-center font-mono text-xs">{r.data2026.mangroveMeanNdvi.toFixed(3)}</td>
                        <td key={`${rk}-nd`} className={cn("py-3 px-2 text-center font-mono text-xs font-semibold", isPos ? "text-primary" : "text-destructive")}>
                          {isPos ? "+" : ""}{r.change.ndviChange.toFixed(3)}
                        </td>
                      </>
                    )
                  })}
                </tr>
                {/* Healthy % */}
                <tr className="hover:bg-muted/20">
                  <td className="py-3 px-4 text-muted-foreground font-medium">Healthy Canopy (%)</td>
                  {regionKeys.map(rk => {
                    const r = data.regions[rk]
                    const diff = r.data2026.healthyPct - r.data2016.healthyPct
                    const isPos = diff > 0
                    return (
                      <>
                        <td key={`${rk}-h16`} className="py-3 px-2 text-center font-mono text-xs border-l">{fmt(r.data2016.healthyPct)}%</td>
                        <td key={`${rk}-h26`} className="py-3 px-2 text-center font-mono text-xs">{fmt(r.data2026.healthyPct)}%</td>
                        <td key={`${rk}-hd`} className={cn("py-3 px-2 text-center font-mono text-xs font-semibold", isPos ? "text-primary" : "text-destructive")}>
                          {isPos ? "+" : ""}{fmt(diff)}%
                        </td>
                      </>
                    )
                  })}
                </tr>
                {/* Degraded % */}
                <tr className="hover:bg-muted/20">
                  <td className="py-3 px-4 text-muted-foreground font-medium">Degraded Canopy (%)</td>
                  {regionKeys.map(rk => {
                    const r = data.regions[rk]
                    const diff = r.data2026.degradedPct - r.data2016.degradedPct
                    const isPos = diff < 0 // Less degradation is positive
                    return (
                      <>
                        <td key={`${rk}-d16`} className="py-3 px-2 text-center font-mono text-xs border-l">{fmt(r.data2016.degradedPct)}%</td>
                        <td key={`${rk}-d26`} className="py-3 px-2 text-center font-mono text-xs">{fmt(r.data2026.degradedPct)}%</td>
                        <td key={`${rk}-dd`} className={cn("py-3 px-2 text-center font-mono text-xs font-semibold", isPos ? "text-primary" : "text-destructive")}>
                          {diff > 0 ? "+" : ""}{fmt(diff)}%
                        </td>
                      </>
                    )
                  })}
                </tr>
                {/* Area Change % */}
                <tr className="hover:bg-muted/20 bg-muted/10">
                  <td className="py-3 px-4 text-muted-foreground font-semibold">Net Area Change (%)</td>
                  {regionKeys.map(rk => {
                    const r = data.regions[rk]
                    const isPos = r.change.areaChangePct > 0
                    return (
                      <>
                        <td key={`${rk}-c16`} className="py-3 px-2 text-center border-l" />
                        <td key={`${rk}-c26`} className="py-3 px-2 text-center" />
                        <td key={`${rk}-cd`} className={cn(
                          "py-3 px-2 text-center font-mono text-sm font-bold",
                          isPos ? "text-primary" : "text-destructive"
                        )}>
                          {isPos ? "+" : ""}{fmt(r.change.areaChangePct)}%
                        </td>
                      </>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Loss Cause Detail Cards */}
      <Card className="shrink-0 overflow-hidden">
        <CardHeader className="py-3 px-4 border-b bg-muted/30">
          <CardTitle className="text-sm flex items-center gap-2">
            <Waves className="size-3.5 text-blue-400" />
            Primary Loss Drivers by Region (ha lost)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-4">
            {regionKeys.map(rk => {
              const r = data.regions[rk]
              const causes = Object.entries(r.lossBreakdown).sort((a, b) => b[1].percentage - a[1].percentage)
              const icons = {
                "Urban/Infrastructure": Building2,
                "Erosion/Water": Waves,
                "Aquaculture": Fish,
                "Other": Info,
              } as const
              return (
                <div key={rk} className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">{r.shortName}</h4>
                    <Badge variant="outline" className="text-[10px]">{r.state}</Badge>
                  </div>
                  {causes.map(([cause, val], i) => {
                    const Icon = icons[cause as keyof typeof icons] || Info
                    return (
                      <div key={cause} className="flex items-center gap-3">
                        <Icon className="size-3.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground truncate">{cause}</span>
                            <span className="font-mono font-semibold">{fmt(val.hectares)} ha</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${val.percentage}%`, backgroundColor: LOSS_COLORS[i] }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{fmt(val.percentage)}%</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Findings */}
      <Card className="shrink-0 overflow-hidden">
        <CardHeader className="py-3 px-4 border-b bg-muted/30">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="size-3.5 text-yellow-400" />
            Key Findings & Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-3">
            {data.findings.map(finding => {
              const config = FINDING_CONFIG[finding.type as keyof typeof FINDING_CONFIG]
              const Icon = config.icon
              return (
                <div
                  key={finding.id}
                  className={cn(
                    "rounded-lg border p-4 transition-colors",
                    config.bg, config.border
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={cn("size-5 shrink-0 mt-0.5", config.text)} />
                    <div className="space-y-1 min-w-0">
                      <h5 className={cn("text-sm font-semibold leading-tight", config.text)}>
                        {finding.title}
                      </h5>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {finding.description}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Bottom summary bar */}
      <Card className="shrink-0 overflow-hidden bg-gradient-to-r from-primary/5 via-card to-primary/5">
        <CardContent className="py-4 px-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Overall Assessment</p>
              <p className="text-sm text-foreground">
                Combined mangrove cover declined from <span className="font-mono font-semibold text-primary">{fmt(totalArea2016)} ha</span> (2016) to{" "}
                <span className="font-mono font-semibold text-primary">{fmt(totalArea2026)} ha</span> (2026).
                Only <span className="font-semibold text-emerald-400">Bhitarkanika</span> (protected sanctuary) showed growth.
                <span className="text-destructive font-semibold"> Urbanization</span> and{" "}
                <span className="text-blue-400 font-semibold">coastal erosion</span> are the top two loss drivers.
              </p>
            </div>
            <Badge variant="destructive" className="text-lg font-mono shrink-0 ml-4">
              −{fmt(Math.abs(netChange.netAll))} ha
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
