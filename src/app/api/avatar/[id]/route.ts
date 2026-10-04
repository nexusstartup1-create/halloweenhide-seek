import { currentPlayer } from "@/lib/auth";
import { getAvatar } from "@/lib/game";

// Profile photos are only visible to people in the game.
export async function GET(_req: Request, ctx: RouteContext<"/api/avatar/[id]">) {
  const { id } = await ctx.params;
  const me = await currentPlayer();
  if (!me) return new Response("Sessione scaduta", { status: 401 });
  const img = await getAvatar(me, id);
  if (!img) return new Response("Nessuna foto", { status: 404 });
  return new Response(new Uint8Array(img), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400, immutable" },
  });
}
