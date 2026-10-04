import { issueSignedToken, presignUrl } from "@vercel/blob";
import { currentPlayer } from "@/lib/auth";
import { audioForViewer } from "@/lib/game";

// Only people in the message's chat can listen; the redirect is a short-lived signed URL (supports seeking).
export async function GET(_req: Request, ctx: RouteContext<"/api/audio/[id]">) {
  const { id } = await ctx.params;
  const me = await currentPlayer();
  if (!me) return new Response("Sessione scaduta", { status: 401 });
  const pathname = await audioForViewer(me, Number(id));
  if (!pathname) return new Response("Non disponibile", { status: 404 });
  const validUntil = Date.now() + 15 * 60_000;
  const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, validUntil, access: "private" });
  return new Response(null, { status: 302, headers: { location: presignedUrl, "cache-control": "private, max-age=600" } });
}
