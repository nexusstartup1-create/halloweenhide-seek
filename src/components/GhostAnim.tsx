"use client";
import { DotLottieReact, setWasmUrl } from "@lottiefiles/dotlottie-react";
import { useState, useSyncExternalStore } from "react";

setWasmUrl("/lottie/dotlottie-player.wasm");

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(query);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const useReducedMotion = () => useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);

/** The ghost floating at the top of the ghost screen. */
export function GhostLoop({ size = 150 }: { size?: number }) {
  const reduced = useReducedMotion();
  return (
    <div className="ghostanim" style={{ width: size, height: size }} aria-hidden="true">
      <DotLottieReact src="/animations/ghost.lottie" loop autoplay={!reduced} />
    </div>
  );
}

const seenKey = (id: string) => `cnh_ghost_intro_${id}`;
const alreadySeen = (id: string) => {
  try { return localStorage.getItem(seenKey(id)) === "1"; } catch { return false; }
};

/** Full-screen "you're a ghost now" moment, played once per capture; tap to close. */
export function GhostIntro({ playerId }: { playerId: string }) {
  const [open, setOpen] = useState(() => typeof window !== "undefined" && !alreadySeen(playerId));
  const close = () => {
    try { localStorage.setItem(seenKey(playerId), "1"); } catch {}
    setOpen(false);
  };
  if (!open) return null;
  return (
    <button type="button" className="ghostintro" onClick={close} aria-label="Chiudi">
      <div className="ghostintro-anim">
        <DotLottieReact
          src="/animations/ghost.lottie"
          autoplay
          dotLottieRefCallback={(d) => d?.addEventListener("complete", () => setTimeout(close, 900))}
        />
      </div>
      <b>Sei un fantasma</b>
      <span>Ora giochi con i cercatori</span>
    </button>
  );
}

/** Gravestone with a little ghost, heading the graveyard on the final screen. */
export function GraveLoop() {
  const reduced = useReducedMotion();
  return (
    <div className="graveanim" aria-hidden="true">
      <DotLottieReact src="/animations/gravestone.lottie" loop autoplay={!reduced} />
    </div>
  );
}

type RoleKey = "HUNTER" | "FUGITIVE";
const ROLE_ANIM: Record<RoleKey, string> = { HUNTER: "/animations/jason.lottie", FUGITIVE: "/animations/character.lottie" };

/** Jason for hunters, the kid running off with a pumpkin for fugitives. */
export function RoleCharacter({ role, size = 150 }: { role: RoleKey; size?: number }) {
  const reduced = useReducedMotion();
  return (
    <div className={`rolechar ${role === "HUNTER" ? "hunter" : "fugitive"}`} style={{ height: size }} aria-hidden="true">
      {/* key: swap cleanly when the role changes */}
      <DotLottieReact key={role} src={ROLE_ANIM[role]} loop autoplay={!reduced} />
    </div>
  );
}

/** Full-screen role reveal when the game starts, once per round; tap to close. */
export function RoleIntro({ storageKey, role, title, line }: { storageKey: string; role: RoleKey; title: string; line: string }) {
  const [open, setOpen] = useState(() => typeof window !== "undefined" && !alreadySeen(storageKey));
  const close = () => {
    try { localStorage.setItem(seenKey(storageKey), "1"); } catch {}
    setOpen(false);
  };
  if (!open) return null;
  return (
    <button type="button" className={`ghostintro roleintro ${role === "HUNTER" ? "hunter" : "fugitive"}`} onClick={close} aria-label="Chiudi">
      <div className="roleintro-anim">
        <DotLottieReact src={ROLE_ANIM[role]} loop autoplay />
      </div>
      <b>{title}</b>
      <span>{line}</span>
      <small>Tocca per iniziare</small>
    </button>
  );
}
