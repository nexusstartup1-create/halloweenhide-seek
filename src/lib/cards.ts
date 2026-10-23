export type CardCode = "GHOST_SHIELD" | "NEBBIA" | "ECO" | "RADAR_PING" | "TRACCIA" | "SUSSURRO" | "ZOMBIE" | "JUMPSCARE";
export type Side = "HUNTER" | "FUGITIVE" | "GHOST" | "ANY";

export interface CardDef {
  code: CardCode;
  name: string;
  side: Side;
  effect: string;
  durationS: number;
  cooldownS: number;
  needsSector?: "ANY" | "LAST_PING";
}

export const CARDS: Record<CardCode, CardDef> = {
  GHOST_SHIELD: { code: "GHOST_SHIELD", name: "Ghost Shield", side: "FUGITIVE", effect: "Immune alla cattura. Mostra lo schermo al cercatore.", durationS: 300, cooldownS: 0 },
  NEBBIA: { code: "NEBBIA", name: "Nebbia", side: "FUGITIVE", effect: "Tu e il partner sparite dalla mappa dei cercatori e dai radar.", durationS: 300, cooldownS: 2400 },
  ECO: { code: "ECO", name: "Eco", side: "FUGITIVE", effect: "Un fuggiasco finto nel settore che scegli: compare sulla mappa dei cercatori e nei radar.", durationS: 300, cooldownS: 0, needsSector: "ANY" },
  RADAR_PING: { code: "RADAR_PING", name: "Radar Ping", side: "HUNTER", effect: "Conta i fuggiaschi nel tuo settore e in quelli vicini. Visibile 5 min.", durationS: 300, cooldownS: 1200 },
  SUSSURRO: { code: "SUSSURRO", name: "Sussurro", side: "GHOST", effect: "Rivela ai cercatori il settore di un fuggiasco a caso (non il tuo ex partner).", durationS: 0, cooldownS: 600 },
  ZOMBIE: { code: "ZOMBIE", name: "Zombie", side: "GHOST", effect: "Solo da fantasma: risorgi. Torni fuggiasco con una password nuova e 3 minuti di immunità.", durationS: 0, cooldownS: 0 },
  JUMPSCARE: { code: "JUMPSCARE", name: "Jumpscare", side: "ANY", effect: "Un avversario a caso si ritrova a tutto schermo un'apparizione con urlo e vibrazione. Scherzetto!", durationS: 0, cooldownS: 0 },
  TRACCIA: { code: "TRACCIA", name: "Traccia", side: "HUNTER", effect: "Segui in diretta un settore illuminato dall'ultimo ping.", durationS: 300, cooldownS: 0, needsSector: "LAST_PING" },
};

export type CardState = "LOCKED" | "READY" | "ACTIVE" | "COOLDOWN" | "SPENT";

export interface CardRow {
  id: number;
  code: CardCode;
  owner_id: string;
  uses_left: number | null;
  activated_at: Date | null;
  active_until: Date | null;
  cooldown_until: Date | null;
  target: string | null;
  voided: boolean;
}

/** `eligible`: the owner can use it now (alive for normal cards, captured for ghost cards). */
export function cardState(c: CardRow, live: boolean, eligible: boolean, now: number): CardState {
  if (c.voided || !eligible) return "SPENT";
  if (c.active_until && now < +c.active_until) return "ACTIVE";
  if (!live) return "LOCKED";
  if (c.uses_left === 0) return "SPENT";
  if (c.cooldown_until && now < +c.cooldown_until) return "COOLDOWN";
  return "READY";
}

/** Cards that survive a capture (they're meant to be used as a ghost). */
export const KEEP_ON_CAPTURE: CardCode[] = ["ZOMBIE"];
/** Immunity right after rising from the dead. */
export const ZOMBIE_SHIELD_S = 180;
