"use client";
import { DotLottieReact, setWasmUrl } from "@lottiefiles/dotlottie-react";
import { useSyncExternalStore } from "react";

// Served from /public so the player works without reaching a CDN (see package.json copy:maplibre).
setWasmUrl("/lottie/dotlottie-player.wasm");

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(query);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** The cat peeking out of a pumpkin. The source frames are 800×600 with the pumpkin in the middle, so we crop to it. */
export function PumpkinCat() {
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);
  return (
    <div className="pumpkin" aria-hidden="true">
      <DotLottieReact src="/animations/pumpkin-cat.lottie" loop autoplay={!reduced} className="pumpkin-canvas" />
    </div>
  );
}
