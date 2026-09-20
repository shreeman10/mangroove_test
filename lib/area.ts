export type StudyArea = {
  name: string
  bbox: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
}

// export const studyAreas: Record<string, StudyArea> = {
//   "thane-creek": {
//     name: "Thane Creek",
//     bbox: [72.95, 19.15, 73.05, 19.25],
//   },
// }

export const studyAreas: Record<string, StudyArea> = {
  "thane-creek": {
    name: "Thane Creek",
    bbox: [72.960, 19.080, 73.020, 19.160], // [minLng, minLat, maxLng, maxLat]
  },
  "bhitarkanika": {
    name: "Bhitarkanika Mangrove Forest",
    bbox: [86.75, 20.60, 87.05, 20.80], // Odisha coast mangrove ecosystem
  },
  "sundarbans-core": {
    name: "Sundarbans (Indian Delta Core)",
    bbox: [88.750, 21.850, 88.950, 22.050], // West Bengal deltaic mangrove belt
  },
};

export function getStudyArea(region: string): StudyArea | undefined {
  return studyAreas[region]
}