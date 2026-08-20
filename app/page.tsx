"use client"

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState } from "react";


export default function Home() {
  const router = useRouter()
  const [year, setYear] = useState<number>(2026)
  return (
    <div className="flex flex-col gap-6 p-5 bg-black text-3xl text-white min-h-screen w-screen">
    <div className="">Hello</div>
    <div>
    <Select value={year} onValueChange={()=>setYear}>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="Year" />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectItem value="2026">2026</SelectItem>
      <SelectItem value="2021">2021</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
    </div>
    <button className="bg-gray-500 w-24 rounded-2xl text-2xl"
    onClick={()=>router.push(`/demo?year=${year}`)
      }
    >
      Demo
    </button>
    </div>
    
  );
}
