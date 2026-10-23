export const pts = (n: number) => n.toLocaleString("it-IT");

export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = String(m).padStart(2, "0"), ss = String(r).padStart(2, "0");
  return h ? `${String(h).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s fa`;
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  return `${Math.floor(s / 3600)} h fa`;
}

export async function post<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Errore di rete. Riprova.");
  return data as T;
}

/** Vibration: can be turned off by the player, and never more than once every 3 seconds. */
let lastBuzz = 0;
export function vibrationOn() {
  try { return localStorage.getItem("cnh_vibrate") !== "off"; } catch { return true; }
}
export function setVibration(on: boolean) {
  try { localStorage.setItem("cnh_vibrate", on ? "on" : "off"); } catch {}
  if (!on) try { navigator.vibrate?.(0); } catch {}
}
export function buzz(pattern: number | number[]) {
  const now = Date.now();
  if (!vibrationOn() || now - lastBuzz < 3000) return;
  lastBuzz = now;
  try { navigator.vibrate?.(pattern); } catch {}
}

export const CARD_INFO: Record<string, { name: string; effect: string; durationS: number; cooldownS: number; sector?: "ANY" | "LAST_PING" }> = {
  GHOST_SHIELD: { name: "Ghost Shield", effect: "Immune alla cattura per 5 min. Mostra lo schermo al cercatore.", durationS: 300, cooldownS: 0 },
  NEBBIA: { name: "Nebbia", effect: "Tu e il partner sparite dalla mappa dei cercatori e dai radar per 5 min.", durationS: 300, cooldownS: 2400 },
  ECO: { name: "Eco", effect: "Un fuggiasco finto nel settore che scegli, sulla mappa dei cercatori e nei radar, per 5 min.", durationS: 300, cooldownS: 0, sector: "ANY" },
  RADAR_PING: { name: "Radar Ping", effect: "Conta i fuggiaschi nel tuo settore e in quelli vicini. Visibile 5 min.", durationS: 300, cooldownS: 1200 },
  SUSSURRO: { name: "Sussurro", effect: "Rivela ai cercatori il settore di un fuggiasco a caso. Ricarica 10 min.", durationS: 0, cooldownS: 600 },
  ZOMBIE: { name: "Zombie", effect: "Solo da fantasma: risorgi. Torni fuggiasco con una password nuova e 3 minuti di immunità. Una volta sola.", durationS: 0, cooldownS: 0 },
  JUMPSCARE: { name: "Jumpscare", effect: "Un avversario a caso si ritrova a tutto schermo un'apparizione con urlo e vibrazione. Scherzetto!", durationS: 0, cooldownS: 0 },
  TRACCIA: { name: "Traccia", effect: "Segui in diretta un settore dell'ultimo ping per 5 min.", durationS: 300, cooldownS: 0, sector: "LAST_PING" },
};
