import { NextRequest, NextResponse } from "next/server"
import { getStudyArea } from "@/lib/area"
import { getEE, evaluate } from "@/lib/gee"

type Props = {
  params: Promise<{ region: string }>
}

// In-memory response cache (per server process): each (region, year) GEE
// composite is computed once, then reused across clients and navigations.
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

    // Build geometry from bounding box [minLng, minLat, maxLng, maxLat]
    const geometry = ee.Geometry.Rectangle(studyArea.bbox)

    // Query Sentinel-2 L2A harmonized imagery
    const collection = ee
      .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(geometry)
      .filterDate(`${year}-01-01`, `${year}-03-31`)
      .sort("CLOUDY_PIXEL_PERCENTAGE")

    // Check if collection is empty
    const count: number = await evaluate(collection.size())

    if (count === 0) {
      return NextResponse.json(
        {
          error: "No images found for this region and date range",
          region,
          dateRange: `${year}-01-01 to ${year}-03-31`,
        },
        { status: 404 }
      )
    }

    const image = collection.median()

    // Get a thumbnail URL (callback-based, wrapped in Promise)
    const url: string = await new Promise((resolve, reject) => {
      image.getThumbURL(
        {
          region: geometry,
          dimensions: 1024,
          bands: ["B4", "B3", "B2"],
          min: 50,
          max: 2000,
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
      imageCount: count,
    }
    responseCache.set(cacheKey, payload)

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred"
    console.error(`[/api/image/${region}] Error:`, error)
    return NextResponse.json(
      { error: message, region },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    )
  }
}
