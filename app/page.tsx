"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import Image from "next/image"
import { Box } from "lucide-react"

const SPOTLIGHT_R = 350

function RevealLayer({
  cursorX,
  cursorY,
}: {
  cursorX: number
  cursorY: number
}) {
  const maskImage = `radial-gradient(circle ${SPOTLIGHT_R}px at ${cursorX}px ${cursorY}px, black 0%, transparent 100%)`

  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0 z-10 bg-center bg-cover bg-no-repeat blur-[4px] opacity-40 grayscale-[30%]"
        style={{ backgroundImage: "url('/hero/bg-1.png')" }}
      />
      <div
        className="absolute inset-0 z-20 bg-center bg-cover bg-no-repeat pointer-events-none brightness-125 saturate-[2.5] contrast-125"
        style={{
          backgroundImage: "url('/hero/bg-1.png')",
          maskImage,
          WebkitMaskImage: maskImage,
        }}
      />
      <div className="absolute inset-0 z-30 bg-[#0d1117]/50 pointer-events-none" />
    </div>
  )
}

function Word({
  children,
  delay,
}: {
  children: ReactNode
  delay: number
}) {
  return (
    <span className="word-mask">
      <span className="word-inner" style={{ animationDelay: `${delay}s` }}>
        {children}&nbsp;
      </span>
    </span>
  )
}

export default function LandingPage() {
  const mouse = useRef({ x: -9999, y: -9999 })
  const smooth = useRef({ x: -9999, y: -9999 })
  const [cursorPos, setCursorPos] = useState({ x: -9999, y: -9999 })

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX
      mouse.current.y = e.clientY
    }
    window.addEventListener("mousemove", onMouseMove)

    let rafId = requestAnimationFrame(function animate() {
      smooth.current.x += (mouse.current.x - smooth.current.x) * 0.1
      smooth.current.y += (mouse.current.y - smooth.current.y) * 0.1
      setCursorPos({ x: smooth.current.x, y: smooth.current.y })
      rafId = requestAnimationFrame(animate)
    })

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div
      className="min-h-screen tracking-[-0.02em] bg-black"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <section className="relative w-full overflow-hidden bg-[#0d1117] h-screen">
        <RevealLayer cursorX={cursorPos.x} cursorY={cursorPos.y} />

        <nav className="absolute top-0 left-0 right-0 z-[100] flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <Box className="text-[#10b981] w-6 h-6" />
            <span className="text-white text-xl font-semibold tracking-tight">
              MangroveAI
            </span>
          </div>

          <div className="hidden md:flex items-center">
            <a
              href="#"
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Features
            </a>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="bg-[#10b981] hover:bg-[#059669] text-white px-5 py-2 rounded-full text-sm font-medium transition-all"
            >
              Get Started
            </Link>
          </div>
        </nav>

        <div className="absolute inset-0 z-50 flex items-center pt-16">
          <div className="max-w-7xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6">
              <h1 className="text-white leading-[1.08] mb-8">
                <span className="block font-playfair font-normal text-6xl md:text-7xl">
                  <Word delay={0.15}>Monitor</Word>
                  <Word delay={0.23}>the</Word>
                  <Word delay={0.31}>mangroves.</Word>
                </span>
                <span className="block font-playfair font-normal text-6xl md:text-7xl mt-2">
                  <Word delay={0.45}>Measure</Word>
                  <Word delay={0.53}>the</Word>
                  <Word delay={0.61}>
                    <span className="italic text-shimmer">change.</span>
                  </Word>
                </span>
              </h1>

              <p
                className="text-lg md:text-xl text-white/60 mb-10 max-w-lg leading-relaxed hero-anim"
                style={{ animationDelay: "0.8s" }}
              >
                Analyze satellite imagery to quantify mangrove loss and
                automatically attribute deforestation drivers using spatial ML
                pipelines.
              </p>

              <div
                className="flex flex-wrap items-center gap-4 hero-anim"
                style={{ animationDelay: "1s" }}
              >
                <Link
                  href="/dashboard"
                  className="bg-white hover:bg-white/85 text-[#0d1117] px-8 py-3.5 rounded-full font-medium transition-all"
                >
                  Get started
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="img-reveal relative w-full lg:w-[130%] lg:-mr-[30%] aspect-[1917/912] rounded-xl border border-white/10 bg-black/50 shadow-[0_40px_90px_-20px_rgba(0,0,0,0.8)] overflow-hidden">
                <Image
                  src="/hero/hero-1.png"
                  alt="MangroveAI analytics dashboard preview"
                  fill
                  priority
                  quality={95}
                  sizes="(max-width: 1024px) 100vw, 65vw"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
