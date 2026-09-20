"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { Loader2, AlertTriangle, ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BASELINE_YEAR, TIMELINE_YEARS } from "@/lib/types"
import { cn } from "@/lib/utils"
import { studyAreas } from "@/lib/area"

const STALE_TIME = 10 * 60 * 1000

export async function fetchChange(region: string, from: string, to: string) {
  const res = await fetch(`/api/change/${region}?from=${from}&to=${to}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Failed to fetch change data")
  
  if (typeof window !== "undefined" && data.url) {
    const img = new Image()
    img.src = data.url
  }
  return data
}

export async function fetchCauses(region: string, from: string, to: string) {
  const res = await fetch(`/api/change/${region}/causes?from=${from}&to=${to}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Failed to fetch cause data")
  return data
}

// Re-using the same GeeImage pattern for correct loading state
function GeeImage({
  src,
  alt,
  className,
  style,
  wrapperClassName,
  pendingLabel = "Rendering…",
}: {
  src?: string
  alt: string
  className?: string
  style?: CSSProperties
  wrapperClassName?: string
  pendingLabel?: string
}) {
  const [displayed, setDisplayed] = useState<string | undefined>(src)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!src) {
      setDisplayed(undefined)
      setPending(false)
      return
    }
    if (src === displayed) return
    setPending(true)
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      setDisplayed(src)
      setPending(false)
    }
    img.onerror = () => {
      if (cancelled) return
      setPending(false)
    }
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src, displayed])

  return (
    <div className={cn("relative h-full w-full", wrapperClassName)}>
      {displayed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={displayed} alt={alt} className={className} style={style} />
      )}
      {pending && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/60 backdrop-blur-sm">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">{pendingLabel}</p>
        </div>
      )}
    </div>
  )
}

const LEGEND = [
  { label: "Stable (No Change)", color: "#111827" },
  { label: "Mangrove Loss", color: "#EF4444" },
  { label: "Mangrove Gain", color: "#10B981" },
]

export function ChangeDetectionView({
  region,
  currentYear,
}: {
  region: string
  currentYear: string
}) {
  const [fromYear, setFromYear] = useState(BASELINE_YEAR)
  const [toYear, setToYear] = useState(currentYear)
  
  const regionName = studyAreas[region]?.name ?? region

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["change", region, fromYear, toYear],
    queryFn: () => fetchChange(region, fromYear, toYear),
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
  })

  const { data: causesData, isLoading: causesLoading } = useQuery({
    queryKey: ["causes", region, fromYear, toYear],
    queryFn: () => fetchCauses(region, fromYear, toYear),
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
  })

  const loading = isLoading
  const fetching = isFetching
  const errMsg = (error as Error | null)?.message

  const stats = data?.stats
  
  let netTrend: "positive" | "negative" | "neutral" = "neutral"
  if (stats) {
    if (stats.netChangeHectares > 0.1) netTrend = "positive"
    else if (stats.netChangeHectares < -0.1) netTrend = "negative"
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 gap-3">
      <div className="flex h-full min-w-0 w-[65%] flex-col gap-3">
        <Card className="flex-1 overflow-hidden h-full">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Period:</span>
              <Select value={fromYear} onValueChange={setFromYear}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMELINE_YEARS.map((y) => (
                    <SelectItem key={y} value={y} disabled={y >= toYear}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ArrowRight className="size-4 text-muted-foreground" />
              <Select value={toYear} onValueChange={setToYear}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMELINE_YEARS.map((y) => (
                    <SelectItem key={y} value={y} disabled={y <= fromYear}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              {LEGEND.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 rounded-sm border border-border"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          
          <CardContent className="relative h-[calc(100%-49px)] p-0">
            {loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-sm">Analyzing change detection…</p>
                <p className="text-xs">
                  Computing differences for {regionName} ({fromYear} ➝ {toYear})
                </p>
              </div>
            ) : errMsg ? (
               <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <AlertTriangle className="size-6 text-destructive" />
                <p className="text-sm font-medium text-destructive">
                  Analysis failed
                </p>
                <p className="max-w-md text-xs break-words text-muted-foreground">
                  {errMsg}
                </p>
              </div>
            ) : (
              <figure className="relative h-full w-full bg-black/40">
                 <GeeImage
                  src={data?.url}
                  alt={`Change detection for ${regionName}`}
                  className="h-full w-full object-contain"
                  pendingLabel="Rendering change map…"
                />
                {fetching && !loading && (
                  <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 rounded-md border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
                    <Loader2 className="size-3 animate-spin" /> Fetching updates…
                  </div>
                )}
              </figure>
            )}
          </CardContent>
        </Card>
      </div>
      
      <aside className="h-full min-w-0 w-[35%]">
        <Card className="flex h-full flex-col overflow-hidden">
          <CardHeader className="border-b bg-muted/40 py-4">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Change Statistics</span>
              <span className="text-xs font-normal text-muted-foreground">
                {fromYear} to {toYear}
              </span>
            </CardTitle>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-y-auto p-5">
            {!stats && !loading ? (
              <p className="text-sm text-muted-foreground">No stats available.</p>
            ) : loading ? (
              <div className="space-y-4">
                <div className="h-16 animate-pulse rounded-lg bg-muted" />
                <div className="h-16 animate-pulse rounded-lg bg-muted" />
                <div className="h-24 animate-pulse rounded-lg bg-muted" />
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                
                <div className="grid gap-3">
                  <div className="rounded-lg border bg-card p-3 shadow-sm">
                    <p className="text-xs font-medium text-muted-foreground">Mangrove Loss</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-bold tracking-tight text-destructive">
                        {stats?.lossHectares.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </span>
                      <span className="text-sm text-muted-foreground">ha</span>
                    </div>
                  </div>
                  
                  <div className="rounded-lg border bg-card p-3 shadow-sm">
                    <p className="text-xs font-medium text-muted-foreground">Mangrove Gain</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-bold tracking-tight text-emerald-500">
                        {stats?.gainHectares.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </span>
                      <span className="text-sm text-muted-foreground">ha</span>
                    </div>
                  </div>
                  
                  <div className={cn("rounded-lg border p-4 shadow-sm", 
                    netTrend === "positive" ? "bg-emerald-500/10 border-emerald-500/20" : 
                    netTrend === "negative" ? "bg-destructive/10 border-destructive/20" : "bg-card"
                  )}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Net Change</p>
                      {netTrend === "positive" ? (
                        <TrendingUp className="size-4 text-emerald-500" />
                      ) : netTrend === "negative" ? (
                        <TrendingDown className="size-4 text-destructive" />
                      ) : (
                        <Minus className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className={cn("text-3xl font-bold tracking-tight", 
                        netTrend === "positive" ? "text-emerald-500" : 
                        netTrend === "negative" ? "text-destructive" : "text-foreground"
                      )}>
                        {stats?.netChangeHectares > 0 ? "+" : ""}
                        {stats?.netChangeHectares.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </span>
                      <span className="text-sm text-muted-foreground">ha</span>
                    </div>
                  </div>
                </div>
                
                <div className="rounded-lg border bg-card p-4">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Pixel Counts
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stable (Unchanged)</span>
                      <span className="font-mono">{stats?.pixelCounts.stable.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-destructive">Loss</span>
                      <span className="font-mono">{stats?.pixelCounts.loss.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-emerald-500">Gain</span>
                      <span className="font-mono">{stats?.pixelCounts.gain.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Causes of Mangrove Loss */}
                <div className="rounded-lg border bg-card p-4">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Drivers of Mangrove Loss
                  </h4>
                  {causesLoading ? (
                    <div className="space-y-3">
                      <div className="h-6 animate-pulse rounded bg-muted w-3/4" />
                      <div className="h-6 animate-pulse rounded bg-muted w-1/2" />
                    </div>
                  ) : causesData?.causes?.breakdown ? (
                    <div className="space-y-4">
                      {Object.entries(causesData.causes.breakdown)
                        .filter(([k]) => k !== "Aquaculture/Conversion" && k !== "Unclassified")
                        .map(([category, stats]: [string, any]) => (
                        <div key={category} className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{category}</span>
                            <span className="text-muted-foreground">{stats.percentage.toFixed(1)}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div 
                              className={cn("h-full rounded-full", category === "Urban/Infrastructure" ? "bg-amber-500" : "bg-blue-500")} 
                              style={{ width: `${stats.percentage}%` }} 
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">{stats.hectares.toFixed(2)} ha</p>
                        </div>
                      ))}
                      
                      {/* Unclassified separate */}
                      {causesData.causes.breakdown["Unclassified"] && (
                        <div className="space-y-1.5 pt-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium text-muted-foreground">Unclassified</span>
                            <span className="text-muted-foreground">{causesData.causes.breakdown["Unclassified"].percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 border-t pt-3">
                        <p className="text-[11px] text-muted-foreground italic leading-relaxed">
                          * These are rule-based heuristic categories based on distance-to-infrastructure (ESA WorldCover) and water-index thresholds, not a trained ML classifier.
                        </p>
                        <p className="text-[11px] text-muted-foreground italic mt-2 leading-relaxed">
                          * Note: &quot;Aquaculture/Conversion&quot; rule checks are currently disabled in this build. 0% does not indicate it was checked and ruled out.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Cause attribution unavailable.</p>
                  )}
                </div>

              </div>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
