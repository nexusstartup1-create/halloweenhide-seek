import { canCapture, claimCapture, GameError } from "@/lib/game";
import { body, handler } from "@/lib/http";

export const POST = handler(async (me, req) => {
  if (!canCapture(me)) throw new GameError("Solo cercatori e fantasmi possono catturare.");
  const { password } = await body<{ password: string }>(req);
  if (!password?.trim()) throw new GameError("Scrivi la password.");
  return claimCapture(me, password);
});
