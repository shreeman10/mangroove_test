import { NextRequest, NextResponse } from "next/server"
import { getStudyArea } from "@/lib/area"
import { getEE } from "@/lib/gee"

type Props = {
  params: Promise<{ region: string }>
}


export async function GET(request: NextRequest, { params }: Props) {
  const { region } = await params

  const queryParams = request.nextUrl.searchParams
  const year = queryParams.get("year")

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
    const count: number = await new Promise((resolve, reject) => {
      collection.size().evaluate(
        (val: number) => resolve(val),
        (err: string) => reject(new Error("Failed to count images: " + err))
      )
    })

    if (count === 0) {
      return NextResponse.json(
        {
          error: "No images found for this region and date range",
          region,
          dateRange: "2024-01-01 to 2024-03-31",
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

    return NextResponse.json({
      url,
      region,
      name: studyArea.name,
      imageCount: count,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred"
    console.error(`[/api/image/${region}] Error:`, error)
    return NextResponse.json(
      { error: message, region },
      { status: 500 }
    )
  }
}
