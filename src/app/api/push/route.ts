import type { PushSubscription } from "web-push";
import { GameError } from "@/lib/game";
import { body, handler } from "@/lib/http";
import { saveSubscription } from "@/lib/push";

export const POST = handler(async (me, req) => {
  const sub = await body<PushSubscription>(req);
  try {
    await saveSubscription(me.id, sub);
  } catch {
    throw new GameError("Iscrizione alle notifiche non valida.");
  }
});
