import { issueSignedToken, presignUrl } from "@vercel/blob";
import { currentPlayer } from "@/lib/auth";
import { proofForViewer } from "@/lib/game";

// Checks who is asking, then redirects to a short-lived signed URL (the CDN handles video range requests).
export async function GET(_req: Request, ctx: RouteContext<"/api/media/[id]">) {
  const { id } = await ctx.params;
  const me = await currentPlayer();
  if (!me) return new Response("Sessione scaduta", { status: 401 });
  const proof = await proofForViewer(me, Number(id));
  if (!proof) return new Response("Non visibile", { status: 404 });
  const validUntil = Date.now() + 15 * 60_000;
  const token = await issueSignedToken({ pathname: proof.pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname: proof.pathname, validUntil, access: "private" });
  return new Response(null, { status: 302, headers: { location: presignedUrl, "cache-control": "private, max-age=600" } });
}
