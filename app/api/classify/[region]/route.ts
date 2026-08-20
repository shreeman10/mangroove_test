import { NextRequest, NextResponse } from "next/server"
import { getStudyArea } from "@/lib/area"
import { getEE } from "@/lib/gee"
import { classifyMangroves } from "@/lib/mangroveClassifier"

type Props = {
  params: Promise<{ region: string }>
}

export async function GET(request: NextRequest, { params }: Props) {
  const { region } = await params

  const queryParams = request.nextUrl.searchParams
  const year = queryParams.get("year") || "2024"

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

    const { classifiedImage, debug } = await classifyMangroves(ee, geometry, year)

    // In the image - 0 = non-mangrove-dark part, 1 = mangrove-the greenish thing
    const url: string = await new Promise((resolve, reject) => {
      classifiedImage.getThumbURL(
        {
          region: geometry,
          dimensions: 1024,
          min: 0,
          max: 1,
          palette: ["#111827", "#10B981"],
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
      debug,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred"
    console.error(`[/api/classify/${region}] Error:`, error)
    return NextResponse.json(
      { error: message, region },
      { status: 500 }
    )
  }
}
