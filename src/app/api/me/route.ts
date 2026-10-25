import { endSession } from "@/lib/auth";
import { deleteMyData } from "@/lib/game";
import { handler } from "@/lib/http";

/** DELETE: "Cancella i miei dati" — removes the player and everything they left, then signs out. */
export const DELETE = handler(async (me) => {
  await deleteMyData(me);
  await endSession().catch(() => {});
});
