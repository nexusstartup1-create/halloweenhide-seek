import { GameError, reportLocation } from "@/lib/game";
import { body, handler } from "@/lib/http";

export const POST = handler(async (me, req) => {
  const { lat, lng, acc } = await body<{ lat: number; lng: number; acc: number }>(req);
  if (![lat, lng].every(Number.isFinite)) throw new GameError("Posizione non valida.");
  await reportLocation(me, lat, lng, Number(acc) || 0);
});
