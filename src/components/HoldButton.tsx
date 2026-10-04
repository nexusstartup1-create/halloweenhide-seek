"use client";
import { useRef, useState } from "react";
import { buzz } from "./util";

/** Press and hold for `ms` to fire. Releasing early cancels. */
export function HoldButton({ label, onFire, disabled, ms = 1200 }: { label: string; onFire: () => void; disabled?: boolean; ms?: number }) {
  const [p, setP] = useState(0);
  const raf = useRef<number | null>(null);

  const stop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setP(0);
  };
  const down = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    const t0 = e.timeStamp;
    const tick = (t: number) => {
      const v = Math.min(1, (t - t0) / ms);
      setP(v);
      if (v >= 1) {
        stop();
        buzz(60);
        onFire();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  return (
    <button
      type="button"
      className="hold"
      disabled={disabled}
      onPointerDown={down}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled) onFire(); }}
    >
      <i className="fill" style={{ width: `${p * 100}%` }} />
      <span>{label}</span>
    </button>
  );
}
