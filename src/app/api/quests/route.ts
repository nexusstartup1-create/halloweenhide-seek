import { head } from "@vercel/blob";
import { completeMission, GameError } from "@/lib/game";
import { body, handler } from "@/lib/http";

export const POST = handler(async (me, req) => {
  const b = await body<{ missionId: string; pathname: string; lat: number; lng: number; acc: number }>(req);
  let meta: { contentType: string; size: number };
  try {
    meta = await head(String(b.pathname));
  } catch {
    throw new GameError("Il file non è arrivato. Riprova a inviarlo.");
  }
  return completeMission(me, String(b.missionId), String(b.pathname), meta, Number(b.lat), Number(b.lng), Number(b.acc));
});
