"use client"

import { useEffect, useState, type CSSProperties } from "react"
import {
  AlertTriangle,
  Layers,
  Loader2,
  Pause,
  Play,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TIMELINE_YEARS } from "@/lib/types"
import { cn } from "@/lib/utils"

type ViewMode = "rgb" | "mask" | "overlay" | "both"

const VIEW_TABS: { value: ViewMode; label: string }[] = [
  { value: "rgb", label: "Optical RGB" },
  { value: "mask", label: "AI Mask" },
  { value: "overlay", label: "Overlay" },
  { value: "both", label: "Side by Side" },
]

const LEGEND = [
  { label: "Non-mangrove", color: "#111827" },
  { label: "Degraded mangrove", color: "#FBBF24" },
  { label: "Healthy mangrove", color: "#10B981" },
]

type MapPanelProps = {
  regionName: string
  year: string
  onYearChange: (year: string) => void
  imageryUrl?: string
  maskUrl?: string
  loading: boolean
  fetching: boolean
  error: string | null
}

// GEE thumbnails can take many seconds to render server-side. Keep the last
// loaded frame visible under a spinner overlay and only swap once the new
// URL has fully downloaded — otherwise the pane looks frozen on old imagery.
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
        // Google Earth Engine thumbnail URLs — plain img, no next/image domain config needed
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

function ImagePane({
  src,
  alt,
  label,
  pendingLabel,
}: {
  src?: string
  alt: string
  label?: string
  pendingLabel?: string
}) {
  return (
    <figure className="relative h-full w-full overflow-hidden bg-black/40">
      <GeeImage
        src={src}
        alt={alt}
        className="h-full w-full object-contain"
        pendingLabel={pendingLabel}
      />
      {label && (
        <figcaption className="absolute top-2 left-2 z-20 rounded-md border bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur">
          {label}
        </figcaption>
      )}
    </figure>
  )
}

export function MapPanel({
  regionName,
  year,
  onYearChange,
  imageryUrl,
  maskUrl,
  loading,
  fetching,
  error,
}: MapPanelProps) {
  const [view, setView] = useState<ViewMode>("both")
  const [opacity, setOpacity] = useState(0.7)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      const idx = TIMELINE_YEARS.indexOf(year)
      onYearChange(TIMELINE_YEARS[(idx + 1) % TIMELINE_YEARS.length])
    }, 4000)
    return () => clearInterval(id)
  }, [playing, year, onYearChange])

  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
          <TabsList>
            {VIEW_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.value === "overlay" && <Layers />}
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {view !== "rgb" && (
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
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
        )}
      </div>

      {view === "overlay" && (
        <div className="flex items-center gap-3 border-b px-4 py-2">
          <span className="text-xs text-muted-foreground">Mask opacity</span>
          <Slider
            value={opacity}
            onValueChange={(v) => {
              if (typeof v === "number") setOpacity(v)
            }}
            min={0}
            max={1}
            step={0.05}
            className="max-w-48"
          />
          <span className="w-8 text-right font-mono text-xs">
            {Math.round(opacity * 100)}%
          </span>
        </div>
      )}

      <CardContent className="relative min-h-0 flex-1 p-0">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="text-sm">Analyzing satellite imagery…</p>
            <p className="text-xs">
              Training Random Forest model for {regionName} · {year}
            </p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <AlertTriangle className="size-6 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              Analysis failed
            </p>
            <p className="max-w-md text-xs break-words text-muted-foreground">
              {error}
            </p>
          </div>
        ) : (
          <>
            {fetching && !loading && (
              <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 rounded-md border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
                <Loader2 className="size-3 animate-spin" /> Running analysis…
              </div>
            )}

            {view === "both" ? (
              <div className="grid h-full grid-cols-2 divide-x divide-border">
                <ImagePane
                  src={imageryUrl}
                  alt={`Sentinel-2 true color ${regionName}`}
                  label="Sentinel-2 RGB"
                  pendingLabel="Rendering RGB…"
                />
                <ImagePane
                  src={maskUrl}
                  alt="AI mangrove classification"
                  label="AI Classification"
                  pendingLabel="Rendering classification…"
                />
              </div>
            ) : view === "overlay" ? (
              <figure className="relative h-full w-full bg-black/40">
                <GeeImage
                  src={imageryUrl}
                  alt={`Sentinel-2 true color ${regionName}`}
                  className="h-full w-full object-contain"
                  pendingLabel="Rendering RGB…"
                />
                <GeeImage
                  src={maskUrl}
                  alt="AI mangrove mask overlay"
                  className="h-full w-full object-contain transition-opacity"
                  style={{ opacity }}
                  wrapperClassName="absolute inset-0"
                  pendingLabel="Rendering classification…"
                />
                <figcaption className="absolute top-2 left-2 z-20 rounded-md border bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur">
                  RGB + AI Mask overlay
                </figcaption>
              </figure>
            ) : (
              <ImagePane
                src={view === "rgb" ? imageryUrl : maskUrl}
                alt={
                  view === "rgb"
                    ? `Sentinel-2 true color ${regionName}`
                    : "AI mangrove classification"
                }
                pendingLabel={
                  view === "rgb" ? "Rendering RGB…" : "Rendering classification…"
                }
              />
            )}

            {/* Timeline scrubber */}
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-4 rounded-xl border bg-background/90 px-4 py-2 shadow-lg backdrop-blur">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? "Pause timeline" : "Play timeline"}
              >
                {playing ? <Pause /> : <Play />}
              </Button>
              <div className="flex items-end gap-1">
                {TIMELINE_YEARS.map((y) => {
                  const active = y === year
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => onYearChange(y)}
                      className="group flex cursor-pointer flex-col items-center gap-1 px-1 outline-none"
                    >
                      <span
                        className={cn(
                          "text-[11px] transition-colors",
                          active
                            ? "font-semibold text-primary"
                            : "text-muted-foreground group-hover:text-foreground"
                        )}
                      >
                        {y}
                      </span>
                      <span
                        className={cn(
                          "h-1 w-7 rounded-full transition-colors",
                          active ? "bg-primary" : "bg-muted group-hover:bg-border"
                        )}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
