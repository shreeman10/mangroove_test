import { NextRequest, NextResponse } from "next/server"
import { getStudyArea } from "@/lib/area"
import { getEE } from "@/lib/gee"
import { classifyMangroves } from "@/lib/mangroveClassifier"
import { computeChange, computeChangeStats } from "@/lib/changeDetection"

type Props = {
  params: Promise<{ region: string }>
}

// In-memory response cache for the change detection route
const changeCache = new Map<string, unknown>()

export async function GET(request: NextRequest, { params }: Props) {
  const { region } = await params

  const queryParams = request.nextUrl.searchParams
  const fromYear = queryParams.get("from") || "2020"
  const toYear = queryParams.get("to") || "2026"

  const cacheKey = `${region}?from=${fromYear}&to=${toYear}`
  const cached = changeCache.get(cacheKey)
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

    // Run both classifications concurrently
    const [fromResult, toResult] = await Promise.all([
      classifyMangroves(ee, geometry, fromYear, region),
      classifyMangroves(ee, geometry, toYear, region),
    ])

    // Compute change detection diff
    const diffImage = computeChange(
      ee,
      fromResult.classifiedImage,
      toResult.classifiedImage
    )

    // Compute numerical stats for gain/loss
    const stats = await computeChangeStats(ee, diffImage, geometry)

    // Diff values: 0 = stable, 1 = loss, 2 = gain
    // Palette: dark/muted (#111827) = stable, red (#EF4444) = loss, green (#10B981) = gain
    const url: string = await new Promise((resolve, reject) => {
      diffImage.getThumbURL(
        {
          region: geometry,
          dimensions: 1024,
          min: 0,
          max: 2,
          palette: ["#111827", "#EF4444", "#10B981"],
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
      fromYear,
      toYear,
      stats,
    }
    changeCache.set(cacheKey, payload)

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred"
    console.error(`[/api/change/${region}] Error:`, error)
    return NextResponse.json(
      { error: message, region },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    )
  }
}
