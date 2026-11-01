import { generateText } from "ai";
import type { Mission } from "./config";

/**
 * Local, place-specific missions for a custom zone: the real places inside the area (OpenStreetMap)
 * turned by an LLM into funny horror missions, in the same tone as the hand-made ones.
 * Everything degrades gracefully: on any failure the caller keeps the generic missions.
 */

type Poi = { name: string; lat: number; lng: number; kind: string };

/** Notable, nameable places inside the play area, from the Overpass (OpenStreetMap) API. */
async function fetchPois(lat: number, lng: number, radiusM: number): Promise<Poi[]> {
  const r = Math.max(120, Math.min(3000, Math.round(radiusM)));
  const q = `[out:json][timeout:20];(
    node(around:${r},${lat},${lng})["name"]["tourism"];
    node(around:${r},${lat},${lng})["name"]["historic"];
    way(around:${r},${lat},${lng})["name"]["historic"];
    way(around:${r},${lat},${lng})["name"]["leisure"~"park|garden|playground|pitch"];
    node(around:${r},${lat},${lng})["name"]["amenity"~"place_of_worship|theatre|cinema|fountain|library|townhall"];
    way(around:${r},${lat},${lng})["name"]["amenity"~"marketplace"];
    node(around:${r},${lat},${lng})["name"]["natural"~"peak|spring|tree"];
  );out center 80;`;
  const resp = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(q),
    signal: AbortSignal.timeout(22_000),
  });
  if (!resp.ok) return [];
  const data = (await resp.json()) as { elements?: { tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }[] };
  const seen = new Set<string>();
  const out: Poi[] = [];
  for (const el of data.elements ?? []) {
    const name = el.tags?.name?.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    const plat = el.lat ?? el.center?.lat;
    const plng = el.lon ?? el.center?.lon;
    if (plat == null || plng == null) continue;
    seen.add(name.toLowerCase());
    const t = el.tags!;
    out.push({ name, lat: plat, lng: plng, kind: t.tourism || t.historic || t.leisure || t.amenity || t.natural || "luogo" });
    if (out.length >= 40) break;
  }
  return out;
}

/** Pulls the first JSON array out of a model reply, tolerating code fences and chatter. */
function extractJsonArray(text: string): unknown[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Returns a bespoke mission set for the zone, or null to fall back to the generic one
 * (too few places found, no AI available, or a bad reply).
 */
export async function generateMissions(zoneName: string, lat: number, lng: number, radiusM: number): Promise<Mission[] | null> {
  try {
    const pois = await fetchPois(lat, lng, radiusM);
    if (pois.length < 4) return null;
    const picked = pois.slice(0, 24);
    const list = picked.map((p, i) => `${i + 1}. ${p.name} (${p.kind})`).join("\n");

    const prompt = `Sei il game designer di "Night Hunt", un nascondino horror-comico che si gioca di sera per le strade di un quartiere.
Zona di gioco: "${zoneName}". Qui sotto i luoghi REALI dentro l'area (numerati):
${list}

Scrivi da 10 a 14 missioni, UNA per luogo diverso, scegliendo i luoghi più evocativi.
Tono: horror ironico, teatrale, da Halloween — come scene di un film dell'orrore comico. In ITALIANO.
Ogni missione è una foto o un breve video (max 20 secondi) che due amici si fanno a vicenda in quel punto.
REGOLE DI SICUREZZA obbligatorie: tutto da spazi pubblici e da fuori; mai entrare in proprietà privata o recintata; mai spaventare o disturbare passanti o chi dorme; niente nulla di pericoloso o illegale.

Rispondi SOLO con un array JSON, senza testo attorno. Ogni elemento:
{"poi": <numero del luogo dalla lista>, "title": "<titolo breve e d'effetto>", "task": "<istruzioni chiare, 1-2 frasi>", "kind": "PHOTO" | "VIDEO", "points": <intero 300-900>}`;

    const { text } = await generateText({
      model: process.env.MISSIONS_AI_MODEL || "anthropic/claude-haiku-4.5",
      prompt,
      temperature: 0.9,
      maxOutputTokens: 2500,
    });

    const arr = extractJsonArray(text);
    if (!arr) return null;
    const missions: Mission[] = [];
    for (const raw of arr) {
      const m = raw as { poi?: number; title?: string; task?: string; kind?: string; points?: number };
      const idx = Number(m.poi) - 1;
      const poi = picked[idx];
      const title = String(m.title ?? "").trim();
      const task = String(m.task ?? "").trim();
      if (!poi || title.length < 2 || task.length < 8) continue;
      missions.push({
        id: `ai-${missions.length + 1}`,
        title: title.slice(0, 80),
        place: poi.name.slice(0, 80),
        lat: poi.lat,
        lng: poi.lng,
        radiusM: 45,
        kind: m.kind === "VIDEO" ? "VIDEO" : "PHOTO",
        task: task.slice(0, 400),
        points: Math.max(300, Math.min(900, Math.round(Number(m.points) || 500))),
      });
      if (missions.length >= 14) break;
    }
    return missions.length >= 6 ? missions : null;
  } catch (e) {
    console.warn("generateMissions:", (e as Error).message);
    return null;
  }
}
