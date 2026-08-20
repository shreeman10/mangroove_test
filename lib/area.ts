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
    bbox: [72.960, 19.080, 73.020, 19.160],
  },
};

export function getStudyArea(region: string): StudyArea | undefined {
  return studyAreas[region]
}