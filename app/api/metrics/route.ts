import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

export async function GET() {
  try {
    const metaPath = path.join(process.cwd(), "data", "mangrove-model-meta.json")
    const gbtPath = path.join(process.cwd(), "data", "gbt-meta.json")
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
      let gbtMeta = null
      if (fs.existsSync(gbtPath)) {
        try {
          gbtMeta = JSON.parse(fs.readFileSync(gbtPath, "utf-8"))
        } catch {
          // fallback if file read error
        }
      }
      return NextResponse.json({ ...meta, gbtMeta }, {
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
