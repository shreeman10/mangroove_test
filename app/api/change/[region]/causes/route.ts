import { NextRequest, NextResponse } from "next/server"
import { getStudyArea } from "@/lib/area"
import { getEE } from "@/lib/gee"
import { classifyMangroves } from "@/lib/mangroveClassifier"
import { computeChange } from "@/lib/changeDetection"
import { computeCauseAttribution } from "@/lib/causeAttribution"

type Props = {
  params: Promise<{ region: string }>
}



export async function GET(request: NextRequest, { params }: Props) {
  const { region } = await params

  const queryParams = request.nextUrl.searchParams
  const fromYear = queryParams.get("from") || "2020"
  const toYear = queryParams.get("to") || "2026"



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

    // Run classifications sequentially to avoid GEE Node API evaluate concurrency issues
    const fromResult = await classifyMangroves(ee, geometry, fromYear)
    const toResult = await classifyMangroves(ee, geometry, toYear)

    // Compute change detection diff
    const diffImage = computeChange(
      ee,
      fromResult.classifiedImage,
      toResult.classifiedImage
    )

    // Run rule-based attribution on the loss patches
    const causes = await computeCauseAttribution(
      ee,
      diffImage,
      toResult.augmentedImage,
      geometry
    )

    const payload = {
      region,
      name: studyArea.name,
      fromYear,
      toYear,
      causes,
    }


    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred"
    console.error(`[/api/change/${region}/causes] Error:`, error)
    return NextResponse.json(
      { error: message, region },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    )
  }
}
