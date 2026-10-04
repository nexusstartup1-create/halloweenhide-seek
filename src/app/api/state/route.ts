import { q } from "@/lib/db";
import { playerState } from "@/lib/game";
import { handler } from "@/lib/http";

export const GET = handler(async (me, req) => {
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;
  await q("update players set last_seen = now() where id = $1", [me.id]);
  return playerState(me, after);
});
