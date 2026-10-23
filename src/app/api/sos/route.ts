import { GameError, resolveSos, sendSos, sosComing } from "@/lib/game";
import { body, handler } from "@/lib/http";

/** SOS: send (with the current position), "I'm coming", or resolve. */
export const POST = handler(async (me, req) => {
  const b = await body<{ action?: "send" | "coming" | "resolve"; id?: number; lat?: number; lng?: number; acc?: number }>(req);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  if (!b.action || b.action === "send") return void (await sendSos(me, num(b.lat), num(b.lng), num(b.acc)));
  const id = num(b.id);
  if (id == null) throw new GameError("SOS non trovato.");
  if (b.action === "coming") await sosComing(me, id);
  else if (b.action === "resolve") await resolveSos(me, id);
  else throw new GameError("Azione non valida.");
});
