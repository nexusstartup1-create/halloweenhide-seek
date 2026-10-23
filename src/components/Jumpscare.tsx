"use client";
import { useEffect } from "react";
import { play } from "./sound";

/** Full-screen apparition with a shriek and a long buzz. Tap or wait to close; then the prankster is revealed. */
export function Jumpscare({ text, onClose }: { text: string; onClose: () => void }) {
  useEffect(() => {
    play("scream");
    try { navigator.vibrate?.([500, 80, 300, 80, 900]); } catch {}
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <button type="button" className="jumpscare" onClick={onClose} aria-label="Chiudi">
      <svg viewBox="0 0 120 140" className="jface" aria-hidden="true">
        <path d="M60 6C30 6 14 28 14 56c0 20 8 36 22 46l6 16 8 14h20l8-14 6-16c14-10 22-26 22-46C106 28 90 6 60 6z" fill="#e9e4dc" />
        <path d="M30 52c6-10 22-12 28 2-8 10-22 10-28-2zM90 52c-6-10-22-12-28 2 8 10 22 10 28-2z" fill="#0b0b0c" />
        <circle cx="44" cy="54" r="3" fill="#e50914" /><circle cx="76" cy="54" r="3" fill="#e50914" />
        <path d="M56 70l4 10 4-10z" fill="#0b0b0c" />
        <path d="M34 92q26 26 52 0l-4 14q-22 16-44 0z" fill="#0b0b0c" />
        <path d="M40 96l4 7 4-7 4 8 4-8 4 8 4-8 4 8 4-8 4 7 4-7" fill="none" stroke="#e9e4dc" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      <span className="jtext">{text}</span>
    </button>
  );
}
