"use client"

import { useEffect, useRef, type ReactNode } from "react"
import Link from "next/link"
import Image from "next/image"
import { Box } from "lucide-react"

const SPOTLIGHT_R = 180

function SpotlightBackground({ children }: { children: ReactNode }) {
  const mouse = useRef({ x: -999, y: -999 })
  const smooth = useRef({ x: -999, y: -999 })
  const lastDrawn = useRef({ x: -99999, y: -99999 })
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const revealRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const reveal = revealRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx || !reveal) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      lastDrawn.current = { x: -99999, y: -99999 }
    }

    const draw = () => {
      const cx = smooth.current.x
      const cy = smooth.current.y

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const points = 48
      ctx.beginPath()
      for (let i = 0; i <= points; i++) {
        const a = (i / points) * Math.PI * 2
        const wobble =
          1 +
          0.1 * Math.sin(a * 3 + 1.7) +
          0.06 * Math.sin(a * 5 + 4.2) +
          0.04 * Math.sin(a * 8 + 0.6)
        const r = SPOTLIGHT_R * wobble
        const x = cx + Math.cos(a) * r
        const y = cy + Math.sin(a) * r * 0.92
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, SPOTLIGHT_R * 1.2)
      gradient.addColorStop(0, "rgba(255,255,255,1)")
      gradient.addColorStop(0.33, "rgba(255,255,255,1)")
      gradient.addColorStop(0.5, "rgba(255,255,255,0.75)")
      gradient.addColorStop(0.62, "rgba(255,255,255,0.4)")
      gradient.addColorStop(0.73, "rgba(255,255,255,0.12)")
      gradient.addColorStop(0.83, "rgba(255,255,255,0)")
      ctx.fillStyle = gradient
      ctx.fill()

      const url = canvas.toDataURL()
      reveal.style.setProperty("mask-image", `url(${url})`)
      reveal.style.setProperty("-webkit-mask-image", `url(${url})`)
    }

    const onMouseMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX
      mouse.current.y = e.clientY
    }
    window.addEventListener("mousemove", onMouseMove)

    resize()
    window.addEventListener("resize", resize)
    draw()

    let rafId = requestAnimationFrame(function animate() {
      smooth.current.x += (mouse.current.x - smooth.current.x) * 0.1
      smooth.current.y += (mouse.current.y - smooth.current.y) * 0.1

      const moved =
        Math.abs(smooth.current.x - lastDrawn.current.x) > 0.5 ||
        Math.abs(smooth.current.y - lastDrawn.current.y) > 0.5

      if (moved) {
        lastDrawn.current = { x: smooth.current.x, y: smooth.current.y }
        draw()
      }

      rafId = requestAnimationFrame(animate)
    })

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0d1117]">
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div
        className="absolute inset-0 bg-center bg-cover bg-no-repeat z-10"
        style={{ backgroundImage: "url('/hero/bg-1.png')" }}
      />
      <div
        ref={revealRef}
        className="absolute inset-0 bg-center bg-cover bg-no-repeat z-20 pointer-events-none"
        style={{ backgroundImage: "url('/hero/bg-2.png')" }}
      />
      <div className="absolute inset-0 bg-[#0d1117]/60 z-30 pointer-events-none" />

      <div className="relative z-40 w-full h-full">{children}</div>
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
  return (
    <div
      className="min-h-screen tracking-[-0.02em] bg-black"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <SpotlightBackground>
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
      </SpotlightBackground>
    </div>
  )
}
