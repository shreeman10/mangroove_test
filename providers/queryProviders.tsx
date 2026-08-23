"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Earth Engine analysis results are expensive — keep them around
      staleTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

export default function QueryProvider({children}:{children:React.ReactNode}) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
