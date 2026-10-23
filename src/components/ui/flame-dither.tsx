"use client"

import type { CSSProperties } from "react"
import { Dithering } from "@paper-design/shaders-react"

// Pixel flames built from the neon-dither wave: three dithered wave layers stacked
// back to front (deep violet tallest, witch violet, slime-green core lowest), each with its
// own speed and width so the tips flicker out of step like tongues of witch fire.

interface FlameLayer {
  color: string
  // Higher = lower flame line (Dithering offsetY)
  offsetY: number
  // Smaller = narrower, flatter tongues
  scale: number
  speed: number
}

const DEFAULT_LAYERS: FlameLayer[] = [
  { color: "#3d1475", offsetY: 0.3, scale: 0.42, speed: 1.6 },
  { color: "#7c3aed", offsetY: 0.42, scale: 0.34, speed: 2.1 },
  { color: "#3f9a2c", offsetY: 0.74, scale: 0.24, speed: 2.7 },
]

const layer: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" }

export function FlameDither({
  layers = DEFAULT_LAYERS,
  // Lifts or lowers every layer together (+ = lower)
  shift = 0,
  pxSize = 3,
  haze = "radial-gradient(70% 45% at 50% 30%, rgba(110, 230, 90, 0.12), transparent 70%)",
  className = "",
  style,
}: {
  layers?: FlameLayer[]
  shift?: number
  pxSize?: number
  haze?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={className} aria-hidden="true" style={{ ...layer, overflow: "hidden", backgroundColor: "#000", ...style }}>
      {/* Green haze up top */}
      <div style={{ ...layer, backgroundImage: haze }} />

      {/* Light the fire throws upward */}
      <div
        className="flame-glow"
        style={{ ...layer, background: "linear-gradient(0deg, rgba(140, 80, 255, 0.3) 0%, rgba(110, 40, 220, 0.08) 38%, transparent 60%)" }}
      />

      {layers.map((l, i) => (
        <Dithering
          key={i}
          colorBack="#00000000"
          colorFront={l.color}
          speed={l.speed}
          shape="wave"
          type="4x4"
          size={pxSize}
          scale={l.scale}
          offsetY={l.offsetY + shift}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      ))}

      {/* Subtle vignette for depth */}
      <div style={{ ...layer, background: "radial-gradient(120% 80% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.3) 100%)" }} />
    </div>
  )
}
