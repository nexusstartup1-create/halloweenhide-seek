"use client"

import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { Dithering } from "@paper-design/shaders-react"

// Adapted from the 21st.dev "neon-dither" component: Tailwind classes are inline styles
// here (this project has no Tailwind), it fills its parent instead of the window,
// and `scale` / `offsetY` let the wave sit low and stay flat.

// Helper: read system dark-mode preference
function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
}

type ThemeMode = "light" | "dark" | "system"

interface PaperDesignBackgroundProps {
  // "system" follows the OS
  themeMode?: ThemeMode
  // Visual intensity 0..1
  intensity?: number
  // Enable subtle parallax mouse move
  parallax?: boolean
  // Wave size: smaller = lower, flatter wave (overrides the intensity-based default)
  scale?: number
  // Moves the wave line up (+) or down (-), -1..1
  offsetY?: number
  // Override the theme colours: pixel colour and the soft glow on top
  colorFront?: string
  glow?: string
  className?: string
  style?: CSSProperties
}

const layer: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" }

export function PaperDesignBackground({
  themeMode = "system",
  intensity = 0.8,
  parallax = true,
  scale,
  offsetY = 0,
  colorFront,
  glow,
  className = "",
  style,
}: PaperDesignBackgroundProps) {
  const [systemDark, setSystemDark] = useState<boolean>(getSystemPrefersDark)
  const isDark = themeMode === "system" ? systemDark : themeMode === "dark"

  useEffect(() => {
    if (themeMode !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [themeMode])

  // Derived colors and speeds for light/dark
  const config = useMemo(() => {
    const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v))
    const t = clamp(intensity)

    if (isDark) {
      return {
        back: "#00000000",
        front: mix("#614B00", "#A87C00", t * 0.35), // warm cyber-gold
        bg: "#000000",
        speed: 0.28 + t * 0.35,
        px: Math.round(2 + t * 2), // 2..4
        scale: 1.05 + t * 0.15,
        glow: "radial-gradient(60% 40% at 50% 40%, rgba(255,210,90,0.10), transparent 70%)",
      }
    } else {
      return {
        back: "#00000000",
        front: mix("#3956A3", "#7FA4FF", t * 0.35), // cool skylight
        bg: "#F7FAFF",
        speed: 0.22 + t * 0.28,
        px: Math.round(2 + t * 2),
        scale: 1.03 + t * 0.12,
        glow: "radial-gradient(60% 40% at 50% 40%, rgba(120,165,255,0.10), transparent 70%)",
      }
    }
  }, [isDark, intensity])

  // Optional mouse parallax
  const [shift, setShift] = useState({ x: 0, y: 0 })
  useEffect(() => {
    if (!parallax) return
    const strength = 8 // px at edges
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1
      const y = (e.clientY / window.innerHeight) * 2 - 1
      setShift({ x: -x * strength, y: -y * strength })
    }
    window.addEventListener("mousemove", onMove)
    return () => window.removeEventListener("mousemove", onMove)
  }, [parallax])

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        ...layer,
        overflow: "hidden",
        backgroundColor: config.bg,
        transition: "background-color 0.5s",
        transform: parallax ? `translate3d(${shift.x}px, ${shift.y}px, 0)` : undefined,
        ...style,
      }}
    >
      {/* Core dithering shader */}
      <Dithering
        colorBack={config.back}
        colorFront={colorFront ?? config.front}
        speed={config.speed}
        shape="wave"
        type="4x4"
        size={config.px}
        scale={scale ?? config.scale}
        offsetY={offsetY}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />

      {/* Soft glow layer (theme-aware) */}
      <div style={{ ...layer, backgroundImage: glow ?? config.glow, mixBlendMode: isDark ? "screen" : "multiply" }} />

      {/* Subtle vignette for depth */}
      <div style={{ ...layer, background: "radial-gradient(120% 80% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.25) 100%)" }} />

      {/* Film grain for texture */}
      <div
        style={{
          ...layer,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.25' numOctaves='2' stitchTiles='stitch'/%3E%3C/fe%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.11'/%3E%3C/svg%3E\")",
          backgroundSize: "cover",
          opacity: 0.5,
          mixBlendMode: isDark ? "screen" : "multiply",
        }}
      />

      {/* Top shine sweep */}
      <div style={{ ...layer, background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 35%)", opacity: isDark ? 0.25 : 0.4 }} />
    </div>
  )
}

/**
 * Utility: linear RGB mix between two hex colors (simple)
 */
function mix(a: string, b: string, t: number): string {
  const ah = a.replace("#", "")
  const bh = b.replace("#", "")
  const ai = parseInt(ah, 16)
  const bi = parseInt(bh, 16)
  const ar = (ai >> 16) & 0xff
  const ag = (ai >> 8) & 0xff
  const ab = ai & 0xff
  const br = (bi >> 16) & 0xff
  const bg = (bi >> 8) & 0xff
  const bb = bi & 0xff
  const rr = Math.round(ar + (br - ar) * t)
  const rg = Math.round(ag + (bg - ag) * t)
  const rb = Math.round(ab + (bb - ab) * t)
  return `#${((1 << 24) + (rr << 16) + (rg << 8) + rb).toString(16).slice(1)}`
}
