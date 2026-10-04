import { playCard } from "@/lib/game";
import { body, handler } from "@/lib/http";

export const POST = handler(async (me, req) => {
  const { cardId, target } = await body<{ cardId: number; target?: string }>(req);
  return playCard(me, Number(cardId), target ?? null);
});
