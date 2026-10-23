import { GameError, MAX_AUDIO_BYTES, postAudio } from "@/lib/game";
import { handler } from "@/lib/http";

// Body is the raw recording; channel, duration and the radio effect (if any) travel in the query string.
export const POST = handler(async (me, req) => {
  const url = new URL(req.url);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_AUDIO_BYTES) throw new GameError("Audio troppo lungo.");
  const bytes = Buffer.from(await req.arrayBuffer());
  await postAudio(me, String(url.searchParams.get("channel")), bytes, req.headers.get("content-type") ?? "", Number(url.searchParams.get("ms")), url.searchParams.get("radio"));
});
