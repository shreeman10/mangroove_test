"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import {
  AlertTriangle,
  Eye,
  Layers,
  Loader2,
  MapPin,
  Pause,
  Play,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { studyAreas } from "@/lib/area"
import { TIMELINE_YEARS } from "@/lib/types"
import { cn } from "@/lib/utils"

type ViewMode = "rgb" | "mask" | "overlay" | "swipe" | "both"

const VIEW_TABS: { value: ViewMode; label: string }[] = [
  { value: "rgb", label: "Optical RGB" },
  { value: "mask", label: "AI Mask" },
  { value: "overlay", label: "Overlay" },
  { value: "swipe", label: "Swipe" },
  { value: "both", label: "Side by Side" },
]

const DEFAULT_LEGEND = [
  { label: "Non-mangrove", color: "#111827" },
  { label: "Degraded mangrove", color: "#FBBF24" },
  { label: "Healthy mangrove", color: "#10B981" },
]

const COLORBLIND_LEGEND = [
  { label: "Non-mangrove", color: "#440154" },
  { label: "Degraded mangrove", color: "#21918C" },
  { label: "Healthy mangrove", color: "#FDE725" },
]

// CSS filter that shifts the default palette (#111827 dark, #FBBF24 amber, #10B981 emerald)
// towards a Viridis-like high-contrast palette for colorblind users.
// hue-rotate(180deg) shifts greens→magentas and ambers→teals, saturate boosts separation.
const COLORBLIND_FILTER = "hue-rotate(180deg) saturate(1.4) brightness(1.1)"

// Approximate pin positions for the India minimap SVG (normalized 0–100)
const REGION_PINS: Record<string, { x: number; y: number; label: string }> = {
  "thane-creek": { x: 32, y: 52, label: "Thane Creek" },
  bhitarkanika: { x: 55, y: 50, label: "Bhitarkanika" },
  "sundarbans-core": { x: 62, y: 46, label: "Sundarbans" },
}

type MapPanelProps = {
  regionName: string
  year: string
  onYearChange: (year: string) => void
  onRegionChange?: (region: string) => void
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
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!src) {
      setDisplayed(undefined)
      setPending(false)
      setHasError(false)
      return
    }
    if (src === displayed && !hasError) return
    setPending(true)
    setHasError(false)
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
      setHasError(true)
    }
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src, displayed, hasError])

  return (
    <div className={cn("relative h-full w-full", wrapperClassName)}>
      {displayed && !hasError && (
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
      {hasError && !pending && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 p-4 text-center rounded-md">
          <AlertTriangle className="size-8" />
          <p className="text-sm font-medium">Image Generation Failed</p>
          <p className="text-xs opacity-80 max-w-[200px]">Stats processed successfully, but Earth Engine timed out rendering the map tile.</p>
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
  imgStyle,
}: {
  src?: string
  alt: string
  label?: string
  pendingLabel?: string
  imgStyle?: CSSProperties
}) {
  return (
    <figure className="relative h-full w-full overflow-hidden bg-black/40">
      <GeeImage
        src={src}
        alt={alt}
        className="h-full w-full object-contain"
        style={imgStyle}
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

// ─── Swipe / Curtain Slider ────────────────────────────────────────────
function SwipeView({
  imageryUrl,
  maskUrl,
  regionName,
  maskFilter,
}: {
  imageryUrl?: string
  maskUrl?: string
  regionName: string
  maskFilter?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [splitPct, setSplitPct] = useState(50)
  const dragging = useRef(false)

  const onPointerDown = useCallback(() => {
    dragging.current = true
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = Math.max(2, Math.min(98, (x / rect.width) * 100))
    setSplitPct(pct)
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-col-resize select-none overflow-hidden bg-black/40"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* Full-width RGB underneath */}
      <GeeImage
        src={imageryUrl}
        alt={`Sentinel-2 true color ${regionName}`}
        className="h-full w-full object-contain"
        pendingLabel="Rendering RGB…"
      />

      {/* AI mask clipped to the right portion */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 0 0 ${splitPct}%)` }}
      >
        <GeeImage
          src={maskUrl}
          alt="AI mangrove classification"
          className="h-full w-full object-contain"
          style={maskFilter ? { filter: maskFilter } : undefined}
          pendingLabel="Rendering classification…"
        />
      </div>

      {/* Divider handle */}
      <div
        className="absolute top-0 bottom-0 z-20 w-1 -translate-x-1/2 bg-white/80 shadow-lg"
        style={{ left: `${splitPct}%` }}
        onPointerDown={onPointerDown}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-background/90 p-1.5 shadow-lg">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="text-foreground"
          >
            <path
              d="M5 3L2 8L5 13M11 3L14 8L11 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-2 left-2 z-20 rounded-md border bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur">
        Sentinel-2 RGB
      </div>
      <div className="absolute top-2 right-2 z-20 rounded-md border bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur">
        AI Classification
      </div>
    </div>
  )
}

// ─── India Minimap ─────────────────────────────────────────────────────
function IndiaMinimap({
  activeRegion,
  onRegionChange,
}: {
  activeRegion: string
  onRegionChange?: (region: string) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div className="absolute bottom-14 right-3 z-20 print:hidden">
      <div className="rounded-lg border bg-card/90 p-1.5 shadow-lg backdrop-blur-sm">
        <svg
          viewBox="0 0 100 100"
          className="h-24 w-20"
          aria-label="India minimap"
        >
          {/* Simplified India outline */}
          <path
            d="M30,8 L38,5 L48,6 L55,3 L62,6 L68,5 L72,10 L74,18 L70,22 L72,28 L68,32 L70,38 L66,42 L68,48 L62,52 L58,48 L55,55 L50,62 L48,68 L44,75 L40,80 L38,85 L42,88 L45,92 L40,95 L35,90 L32,82 L28,75 L25,68 L22,60 L20,52 L22,45 L18,38 L20,30 L24,22 L26,15 Z"
            fill="none"
            stroke="hsl(163, 40%, 40%)"
            strokeWidth="1"
            opacity="0.6"
          />

          {/* Region pins */}
          {Object.entries(REGION_PINS).map(([key, pin]) => {
            const isActive = key === activeRegion
            const isHov = key === hovered
            return (
              <g
                key={key}
                className="cursor-pointer"
                onClick={() => onRegionChange?.(key)}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
              >
                <circle
                  cx={pin.x}
                  cy={pin.y}
                  r={isActive ? 4 : 3}
                  fill={
                    isActive
                      ? "hsl(163, 72%, 47%)"
                      : isHov
                        ? "hsl(163, 60%, 60%)"
                        : "hsl(255, 10%, 55%)"
                  }
                  stroke="white"
                  strokeWidth="1"
                  className="transition-all duration-200"
                />
                {isActive && (
                  <circle
                    cx={pin.x}
                    cy={pin.y}
                    r={7}
                    fill="none"
                    stroke="hsl(163, 72%, 47%)"
                    strokeWidth="0.5"
                    opacity="0.5"
                  />
                )}
                {(isHov || isActive) && (
                  <text
                    x={pin.x}
                    y={pin.y - 7}
                    textAnchor="middle"
                    className="fill-foreground text-[5px] font-medium"
                  >
                    {pin.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export function MapPanel({
  regionName,
  year,
  onYearChange,
  onRegionChange,
  imageryUrl,
  maskUrl,
  loading,
  fetching,
  error,
}: MapPanelProps) {
  const [view, setView] = useState<ViewMode>("both")
  const [opacity, setOpacity] = useState(0.7)
  const [playing, setPlaying] = useState(false)
  const [colorblindMode, setColorblindMode] = useState(false)

  const LEGEND = colorblindMode ? COLORBLIND_LEGEND : DEFAULT_LEGEND
  const maskFilter = colorblindMode ? COLORBLIND_FILTER : undefined

  // Derive the current region key from the region name for the minimap
  const activeRegionKey = Object.entries(studyAreas).find(
    ([, area]) => area.name === regionName
  )?.[0] ?? "thane-creek"

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

        <div className="flex items-center gap-3">
          {/* Palette toggle */}
          {view !== "rgb" && (
            <button
              type="button"
              onClick={() => setColorblindMode((c) => !c)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors",
                colorblindMode
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-transparent text-muted-foreground hover:text-foreground"
              )}
              title="Toggle colorblind-safe palette"
            >
              <Eye className="size-3" />
              {colorblindMode ? "Colorblind" : "Default"}
            </button>
          )}

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

            {view === "swipe" ? (
              <SwipeView
                imageryUrl={imageryUrl}
                maskUrl={maskUrl}
                regionName={regionName}
                maskFilter={maskFilter}
              />
            ) : view === "both" ? (
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
                  imgStyle={maskFilter ? { filter: maskFilter } : undefined}
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
                  style={{
                    opacity,
                    ...(maskFilter ? { filter: maskFilter } : {}),
                  }}
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
                imgStyle={
                  view === "mask" && maskFilter
                    ? { filter: maskFilter }
                    : undefined
                }
              />
            )}

            {/* India Minimap */}
            <IndiaMinimap
              activeRegion={activeRegionKey}
              onRegionChange={onRegionChange}
            />

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
