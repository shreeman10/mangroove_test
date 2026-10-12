import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

export async function GET() {
  try {
    const metaPath = path.join(process.cwd(), "data", "mangrove-model-meta.json")
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
      return NextResponse.json(meta, {
        headers: { "Cache-Control": "public, max-age=3600" },
      })
    }
    return NextResponse.json(
      { error: "Model metadata file not found" },
      { status: 404 }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load metrics" },
      { status: 500 }
    )
  }
}
