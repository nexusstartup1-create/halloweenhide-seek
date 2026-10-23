import { addToGroup, createGroup, GameError, leaveGroup } from "@/lib/game";
import { body, handler } from "@/lib/http";

export const POST = handler(async (me, req) => {
  const b = await body<{ action: string; name?: string; channel?: string; members?: string[] }>(req);
  if (b.action === "create") return createGroup(me, String(b.name ?? ""), b.members);
  if (b.action === "add") return addToGroup(me, String(b.channel ?? ""), b.members);
  if (b.action === "leave") return leaveGroup(me, String(b.channel ?? ""));
  throw new GameError("Azione non valida.");
});
