"use client";
import type { Fix, GameState } from "./types";
import { clock, pts } from "./util";

/** Warn this long before the Blood Moon rises and before the zone starts to shrink. */
const MOON_WARN_MS = 5 * 60_000;
const SHRINK_WARN_MS = 3 * 60_000;

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));
}

/**
 * The evening's live events for this player: Blood Moon, shrinking zone, treasure and bounty.
 * `side`: what the player is doing now (a ghost hunts with the hunters).
 */
export function LiveEvents({ s, now, side, fix = null }: { s: GameState; now: number; side: "hunter" | "fugitive"; fix?: Fix | null }) {
  const g = s.game;
  if (g.phase !== "LIVE" && g.phase !== "PAUSED") return null;
  const out: React.ReactNode[] = [];

  const m = g.moon;
  if (m && now >= m.from && now < m.to) {
    out.push(
      <div key="moon" className="ev moon">
        <b>🩸 Luna di Sangue · {clock(m.to - now)}</b>
        <span>{side === "hunter" ? "I cerchi dei fuggiaschi sono più piccoli: è il momento di stringere." : `Missioni e tesori valgono ×${m.mult}, ma i cercatori vi vedono meglio.`}</span>
      </div>,
    );
  } else if (m && m.from > now && m.from - now < MOON_WARN_MS) {
    out.push(<div key="moon" className="ev moon soon"><b>🩸 Luna di Sangue tra {clock(m.from - now)}</b></div>);
  }

  const sh = g.shrink;
  if (sh && now >= sh.from) {
    out.push(
      <div key="shrink" className="ev shrink">
        <b>⚠️ La zona si restringe</b>
        <span>Resta dentro la linea rossa: chi è fuori per più di 60 s viene segnalato.</span>
      </div>,
    );
  } else if (sh && sh.from - now < SHRINK_WARN_MS) {
    out.push(<div key="shrink" className="ev shrink soon"><b>⚠️ Tra {clock(sh.from - now)} la zona inizia a restringersi</b></div>);
  }

  const t = g.treasure;
  if (t) {
    const d = fix ? Math.round(metres(fix, t)) : null;
    const mult = m?.on ? m.mult : 1;
    out.push(
      <div key="treasure" className="ev treasure">
        <b>💰 Tesoro · {t.place}</b>
        <span>
          {side === "fugitive" ? `+${pts(t.points * mult)} al primo che ci arriva` : "I fuggiaschi ci andranno: aspettali lì"}
          {d != null ? ` · ${d} m` : ""} · sparisce tra {clock(+new Date(t.until) - now)}
        </span>
      </div>,
    );
  }

  const b = g.bounty;
  if (b && side === "hunter") {
    out.push(<div key="bounty" className="ev bounty"><b>🎯 Taglia su {b.name}</b><span>Sono i più ricchi: ogni cattura vale +{pts(b.points)} in più.</span></div>);
  } else if (b && b.pairId === s.me.pairId) {
    out.push(<div key="bounty" className="ev bounty"><b>🎯 Avete una taglia sulla testa</b><span>Siete i più ricchi: chi vi prende guadagna +{pts(b.points)} in più.</span></div>);
  }

  return out.length ? <div className="events">{out}</div> : null;
}
