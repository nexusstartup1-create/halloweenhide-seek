"use client";
// Graphics budget for the 3D map. Old phones (2-3 GB of RAM: iPhone 6/7/8/SE, low-end Android) get a
// lighter map: smaller textures, fewer frames, lower resolution. Safari kills the WebGL context when a
// page uses too much graphics memory; after that happens once, this phone stays in light mode.

const KEY = "cnh_lite_gfx";

export function liteGraphics(): boolean {
  if (typeof window === "undefined") return false;
  try { if (localStorage.getItem(KEY) === "1") return true; } catch {}
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (nav.deviceMemory != null && nav.deviceMemory <= 3) return true;
  if (nav.hardwareConcurrency != null && nav.hardwareConcurrency <= 2) return true;
  // iPhones up to the 8 / 8 Plus / SE: 4.7" and 5.5" screens.
  const iphone = /iPhone/.test(nav.userAgent);
  const longSide = Math.max(screen.width, screen.height);
  return iphone && longSide <= 736;
}

/** Remembers that this phone lost the 3D map once: light mode from now on. */
export function markLiteGraphics() {
  try { localStorage.setItem(KEY, "1"); } catch {}
}

/** Copies a canvas texture into a smaller one (for the light mode). */
export function shrinkCanvas(src: HTMLCanvasElement, maxSide: number) {
  if (Math.max(src.width, src.height) <= maxSide) return src;
  const k = maxSide / Math.max(src.width, src.height);
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * k);
  c.height = Math.round(src.height * k);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
