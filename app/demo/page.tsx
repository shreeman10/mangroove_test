"use client"

import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

type ImageryResponse = {
    url: string
    region: string
    name: string
    imageCount?: number
}

const DemoPage = () => {
    const params = useSearchParams()
    const year = params.get("year") || "2024"
    const region = "thane-creek"

    const imagery = useQuery<ImageryResponse>({
        queryKey: ["imagery", region, year],
        queryFn: async () => {
            const res = await fetch(`/api/image/${region}?year=${year}`)
            return res.json()
        },
    })

    const classification = useQuery<ImageryResponse>({
        queryKey: ["classify", region, year],
        queryFn: async () => {
            const res = await fetch(`/api/classify/${region}?year=${year}`)
            return res.json()
        },
    })

    const isLoading = imagery.isLoading || classification.isLoading
    const error = imagery.error || classification.error

    if (isLoading) {
        return (
            <div className="flex flex-col gap-6 p-5 bg-black text-3xl text-white min-h-screen w-screen">
                <h2>Thane-creek</h2>
                <div className="text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 to-purple-500">
                    Loading...
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col gap-6 p-5 bg-black text-3xl text-white min-h-screen w-screen">
                <h2>Thane-creek</h2>
                <div className="text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 to-purple-500">
                    Error
                    {error.message}
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6 p-5 bg-black text-3xl text-white min-h-screen w-full overflow-x-hidden">
            <h2>Thane-creek — {year}</h2>

            <div className="flex">


            <div className="flex flex-row gap-8">
                <div className="flex flex-col gap-2">
                    <h3 className="text-xl text-gray-400">Satellite Imagery</h3>
                    {imagery.data?.url && (
                        <div className="w-150">

                        <img
                            src={imagery.data.url}
                            alt="Sentinel-2 satellite image"
                            className="w-full h-auto"
                            />
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <h3 className="text-xl text-gray-400">Mangrove Classification</h3>
                    {classification.data?.url && (
                        <div className="w-150">

                        <img
                            src={classification.data.url}
                            alt="Mangrove classification map"
                            className="w-full h-auto"
                            />
                        </div>
                    )}
                </div>
            </div>
            </div>
        </div>
    )
}

export default DemoPage