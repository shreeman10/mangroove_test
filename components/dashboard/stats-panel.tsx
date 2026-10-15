"use client"

import { TrendingDown, TrendingUp } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { ClassifyDebug, MangroveStats } from "@/lib/types"
import { cn } from "@/lib/utils"

const BASELINE_YEAR = "2020"

const SPECTRAL_ROWS: { key: string; label: string }[] = [
  { key: "B2", label: "B2 · Blue" },
  { key: "B3", label: "B3 · Green" },
  { key: "B4", label: "B4 · Red" },
  { key: "B8", label: "B8 · NIR" },
  { key: "B11", label: "B11 · SWIR" },
  { key: "NDVI", label: "NDVI" },
  { key: "MNDWI", label: "MNDWI" },
]

// Indices live in [-1, 1], surface reflectance in [0, ~10000]
function formatBand(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—"
  return Math.abs(value) < 2 ? value.toFixed(2) : Math.round(value).toLocaleString()
}

function healthStatus(ndvi: number): { label: string; className: string } {
  if (ndvi >= 0.65)
    return { label: "Dense Canopy (Healthy)", className: "text-primary" }
  if (ndvi >= 0.45)
    return { label: "Moderate Canopy", className: "text-yellow-400" }
  return { label: "Degraded", className: "text-destructive" }
}

type StatsPanelProps = {
  regionName: string
  year: string
  stats?: MangroveStats
  baselineStats?: MangroveStats
  debug?: ClassifyDebug
  loading: boolean
}

export function StatsPanel({
  regionName,
  year,
  stats,
  baselineStats,
  debug,
  loading,
}: StatsPanelProps) {
  const total = stats?.totalHectares

  const changePct =
    total !== undefined &&
    baselineStats &&
    baselineStats.totalHectares > 0 &&
    year !== BASELINE_YEAR
      ? ((total - baselineStats.totalHectares) / baselineStats.totalHectares) *
        100
      : null

  const ndvi = stats?.mangroveMeanNdvi ?? 0
  const health = healthStatus(ndvi)
  const gaugePct = Math.max(0, Math.min(100, Math.round(ndvi * 100)))

  const radius = 46
  const circumference = 2 * Math.PI * radius

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">
            Total Mangrove Coverage — {regionName}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold tracking-tight">
              {loading || total === undefined ? "—" : total.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
            <span className="text-sm text-muted-foreground">Hectares</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            {changePct === null ? (
              <Badge variant="outline">vs {BASELINE_YEAR}: —</Badge>
            ) : (
              <Badge variant={changePct >= 0 ? "default" : "destructive"}>
                {changePct >= 0 ? <TrendingUp /> : <TrendingDown />}
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(1)}% vs {BASELINE_YEAR}
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#10B981]" />
              Healthy{" "}
              {stats ? `${stats.healthyHectares.toLocaleString(undefined, { maximumFractionDigits: 1 })} ha` : "—"}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#FBBF24]" />
              Degraded{" "}
              {stats ? `${stats.degradedHectares.toLocaleString(undefined, { maximumFractionDigits: 1 })} ha` : "—"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-4 pt-4">
          <svg viewBox="0 0 120 120" className="size-28 shrink-0" role="img" aria-label={`Canopy health ${gaugePct}%`}>
            <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="10" className="stroke-muted" />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - gaugePct / 100)}
              transform="rotate(-90 60 60)"
              className="stroke-primary transition-[stroke-dashoffset] duration-700 ease-out"
            />
            <text
              x="60"
              y="58"
              textAnchor="middle"
              className="fill-foreground font-mono text-xl font-bold"
            >
              {loading ? "—" : `${gaugePct}%`}
            </text>
            <text x="60" y="74" textAnchor="middle" className="fill-muted-foreground text-[7px]">
              NDVI threshold (&gt;= 0.5)
            </text>
            <text x="60" y="82" textAnchor="middle" className="fill-muted-foreground text-[7px]">
              on selected year
            </text>
            <text x="60" y="90" textAnchor="middle" className="fill-muted-foreground text-[7px]">
              (not model output)
            </text>
          </svg>
          <div>
            <p className="text-xs text-muted-foreground">Ecosystem Health</p>
            <p className={cn("mt-0.5 text-sm font-semibold", health.className)}>
              Status: {loading ? "—" : health.label}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mean NDVI of detected mangroves:{" "}
              <span className="font-mono">{loading ? "—" : ndvi.toFixed(2)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-0 flex-1">
        <CardHeader>
          <CardTitle>Spectral Statistics</CardTitle>
          <CardDescription>Scene means · Sentinel-2 composite</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto pb-3">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-border">
              {SPECTRAL_ROWS.map((row) => (
                <tr key={row.key}>
                  <td className="py-1.5 text-left text-muted-foreground">
                    {row.label}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {loading ? "—" : formatBand(stats?.bandMeans[row.key])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {debug && (
            <div className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground flex flex-col gap-1">
              <p>
                Random Forest ×{debug.constants?.trees || 100} trees · {debug.totalTrainingPoints} training points ({debug.trainingYear} {debug.labelSource}) ·{" "}
                {debug.s2ImageCount} Sentinel-2 scenes
              </p>
              <p>
                Agreement with GMW 2020 on held-out spatial blocks:
                {((debug.multiSeedMeanStd?.oa?.mean ?? 0) * 100)?.toFixed(1) ?? (debug.validation.overallAccuracy * 100).toFixed(1)}% OA
                (±{((debug.multiSeedMeanStd?.oa?.std ?? 0) * 100)?.toFixed(1) ?? "0.0"}%)
              </p>
              {debug.wallToWallMetrics && (
                <p>
                  Pixel-level agreement with GMW 2020 (held-out blocks, prevalence-weighted):
                  {(debug.wallToWallMetrics.oa * 100).toFixed(1)}% OA · PA={(debug.wallToWallMetrics.pa * 100).toFixed(1)}% · UA={(debug.wallToWallMetrics.ua * 100).toFixed(1)}%
                </p>
              )}
              <p className="italic">
                * Note: The deployed model is retrained on all data. These metrics describe the validation model.
              </p>
              {!debug.isTrainingYear && (
                <p className="text-yellow-600 dark:text-yellow-500">
                  {debug.note}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
