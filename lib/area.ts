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
  "pichavaram": {
    name: "Pichavaram Mangrove Forest",
    bbox: [79.760, 11.400, 79.820, 11.460], // Tamil Nadu estuarine mangrove network
  },
  "sundarbans-core": {
    name: "Sundarbans (Indian Delta Core)",
    bbox: [88.750, 21.850, 88.950, 22.050], // West Bengal deltaic mangrove belt
  },
};

export function getStudyArea(region: string): StudyArea | undefined {
  return studyAreas[region]
}