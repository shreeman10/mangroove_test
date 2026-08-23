"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Control className="flex w-full touch-none items-center py-1 outline-none">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className="absolute h-full rounded-full bg-primary"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: valuesCount(props.value) }).map((_, i) => (
          <SliderPrimitive.Thumb
            key={i}
            data-slot="slider-thumb"
            className="block size-3.5 shrink-0 rounded-full border border-primary bg-background shadow-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        ))}
      </SliderPrimitive.Control>
      {children}
    </SliderPrimitive.Root>
  )
}

function valuesCount(value: unknown): number {
  if (Array.isArray(value)) return value.length
  return typeof value === "number" ? 1 : 0
}

export { Slider }
