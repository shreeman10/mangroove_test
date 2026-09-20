export type ImageryResponse = {
  url: string
  region: string
  name: string
  imageCount?: number
}

export type MangroveStats = {
  totalHectares: number
  healthyHectares: number
  degradedHectares: number
  pixelCounts: { nonMangrove: number; degraded: number; healthy: number }
  mangroveMeanNdvi: number
  bandMeans: Record<string, number>
}

export type ClassifyDebug = {
  totalTrainingPoints: number
  s2ImageCount: number
}

export type ClassifyResponse = {
  url: string
  region: string
  name: string
  year?: string
  stats?: MangroveStats
  debug?: ClassifyDebug
}

export const TIMELINE_YEARS = ["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"]
export const BASELINE_YEAR = "2020"
