import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentPlayer } from "@/lib/auth";
import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from "@/lib/config";
import { checkMissionUpload, GameError } from "@/lib/game";
import { fail, json } from "@/lib/http";

// Issues a short-lived client token so the phone uploads the photo/video straight to Blob storage.
export async function POST(req: Request) {
  try {
    const me = await currentPlayer();
    if (!me) return json({ error: "Sessione scaduta. Rientra con il tuo codice." }, 401);
    const b = (await req.json()) as HandleUploadBody;
    const out = await handleUpload({
      body: b,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const p = JSON.parse(clientPayload ?? "{}") as { missionId?: string; lat?: number; lng?: number; acc?: number };
        const { mission, prefix } = await checkMissionUpload(me, String(p.missionId), Number(p.lat), Number(p.lng), Number(p.acc));
        if (!pathname.startsWith(prefix)) throw new GameError("Percorso del file non valido.");
        return {
          allowedContentTypes: mission.kind === "VIDEO" ? ["video/*"] : ["image/*"],
          maximumSizeInBytes: mission.kind === "VIDEO" ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return json(out);
  } catch (e) {
    if (e instanceof GameError) return json({ error: e.message }, 400);
    return fail(e);
  }
}
