// Ranks: they last across games, tied to a player's phone (a secret profile key kept on the device).
// The only way up is the podium: rank points (RP) for 1st, 2nd and 3rd place.

export interface Rank { name: string; min: number; color: string; glow: string }

export const RANKS: Rank[] = [
  { name: "Novellino", min: 0, color: "#9a8f80", glow: "rgba(154,143,128,0.35)" },
  { name: "Ombra", min: 40, color: "#b8c2cc", glow: "rgba(184,194,204,0.45)" },
  { name: "Predatore", min: 100, color: "#e0a640", glow: "rgba(224,166,64,0.5)" },
  { name: "Spettro", min: 200, color: "#8cf25a", glow: "rgba(140,242,90,0.5)" },
  { name: "Incubo", min: 350, color: "#a970ff", glow: "rgba(169,112,255,0.55)" },
  { name: "Leggenda", min: 550, color: "#ff3b4e", glow: "rgba(255,59,78,0.6)" },
];

/** RP for each podium place. */
export const PODIUM_RP = [30, 20, 10];

/** A game counts for ranks only if at least this many players really played (sent GPS positions). */
export const RANKED_MIN_PLAYERS = 4;

export function rankOf(rp: number) {
  let i = 0;
  while (i + 1 < RANKS.length && rp >= RANKS[i + 1].min) i++;
  const next = RANKS[i + 1] ?? null;
  return { index: i, ...RANKS[i], next: next ? { name: next.name, min: next.min } : null, rp };
}
