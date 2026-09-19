import { evaluate } from "@/lib/gee"

/**
 * Computes a pixel-wise difference between two classified images.
 * Classifications are expected to have:
 * 0 = non-mangrove
 * 1 = degraded
 * 2 = healthy
 * 
 * We map these to a 3-class change image:
 * 0 = Stable (unchanged: either non-mangrove in both, or mangrove in both)
 * 1 = Loss (mangrove in A, non-mangrove in B)
 * 2 = Gain (non-mangrove in A, mangrove in B)
 * 
 * Decision on transition: Healthy -> Degraded or Degraded -> Healthy
 * Both remain "mangrove", so they are considered "Stable" (0) in this
 * change detection layer, which focuses purely on extent gain/loss.
 */
export function computeChange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ee: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  imageFrom: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  imageTo: any
) {
  // Convert 0,1,2 into binary mangrove/non-mangrove (0 or 1)
  const mangroveFrom = imageFrom.gt(0)
  const mangroveTo = imageTo.gt(0)

  // Start with all 0s (stable)
  let diffImage = ee.Image(0).rename("change")

  // Gain: 0 in 'from', 1 in 'to' -> set to 2
  diffImage = diffImage.where(mangroveFrom.eq(0).and(mangroveTo.eq(1)), 2)

  // Loss: 1 in 'from', 0 in 'to' -> set to 1
  diffImage = diffImage.where(mangroveFrom.eq(1).and(mangroveTo.eq(0)), 1)

  return diffImage
}

export type ChangeStats = {
  lossHectares: number
  gainHectares: number
  netChangeHectares: number
  pixelCounts: { stable: number; loss: number; gain: number }
}

export async function computeChangeStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ee: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  diffImage: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geometry: any
): Promise<ChangeStats> {
  const counts = await evaluate<Record<string, Record<string, number>>>(
    diffImage.reduceRegion({
      reducer: ee.Reducer.frequencyHistogram().unweighted(),
      geometry,
      scale: 10,
      maxPixels: 1e13,
    })
  )

  const hist = Object.values(counts)[0] ?? {}
  const countOf = (cls: number) => Number(hist[String(cls)] ?? 0)

  const stablePx = countOf(0)
  const lossPx = countOf(1)
  const gainPx = countOf(2)

  const hectares = (pixels: number) => (pixels * 100) / 10000

  const lossHa = hectares(lossPx)
  const gainHa = hectares(gainPx)
  const netHa = gainHa - lossHa

  return {
    lossHectares: lossHa,
    gainHectares: gainHa,
    netChangeHectares: netHa,
    pixelCounts: {
      stable: stablePx,
      loss: lossPx,
      gain: gainPx,
    },
  }
}
