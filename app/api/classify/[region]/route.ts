import { NextRequest, NextResponse } from "next/server"
import { getStudyArea } from "@/lib/area"
import { getEE } from "@/lib/gee"
import { classifyMangroves, computeStats, getBaselineStats } from "@/lib/mangroveClassifier"

type Props = {
  params: Promise<{ region: string }>
}

// In-memory response cache (per server process): the ~40s RF pipeline for a
// (region, year) pair runs once, then is reused across clients/navigations.
const responseCache = new Map<string, unknown>()

export async function GET(request: NextRequest, { params }: Props) {
  const { region } = await params

  const queryParams = request.nextUrl.searchParams
  const year = queryParams.get("year") || "2024"

  const cacheKey = `${region}?year=${year}`
  const cached = responseCache.get(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "no-store" },
    })
  }

  try {
    const studyArea = getStudyArea(region)
    if (!studyArea) {
      return NextResponse.json(
        { error: `Unknown region: "${region}"` },
        { status: 404 }
      )
    }

    const ee = await getEE()

    const geometry = ee.Geometry.Rectangle(studyArea.bbox)

    const { classifiedImage, augmentedImage, debug } = await classifyMangroves(ee, geometry, year, region)

    // Numerical stats: hectares per class, NDVI health index, band means.
    // Computed from the same classified image — no extra RF training run.
    const stats = await computeStats(ee, classifiedImage, augmentedImage, geometry)

    // Classification values: 0 = non-mangrove, 1 = degraded mangrove,
    const url: string = await new Promise((resolve, reject) => {
      classifiedImage.getThumbURL(
        {
          region: geometry,
          dimensions: 1024,
          min: 0,
          max: 2,
          palette: ["#111827", "#FBBF24", "#10B981"],
          format: "png",
        },
        (thumbUrl: string, err: string) => {
          if (err) {
            reject(new Error("getThumbURL failed: " + err))
          } else {
            resolve(thumbUrl)
          }
        }
      )
    })

    const payload = {
      url,
      region,
      name: studyArea.name,
      year,
      stats,
      debug,
    }
    responseCache.set(cacheKey, payload)

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred"
    console.error(`[/api/classify/${region}] Error:`, error)
    return NextResponse.json(
      { error: message, region },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    )
  }
}
