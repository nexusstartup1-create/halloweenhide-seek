import { saveAvatar } from "@/lib/game";
import { handler } from "@/lib/http";

// The phone already crops and compresses the photo to a 256 px JPEG; the body is the raw file.
export const POST = handler(async (me, req) => {
  const bytes = Buffer.from(await req.arrayBuffer());
  await saveAvatar(me, bytes);
});

export const DELETE = handler(async (me) => {
  await saveAvatar(me, null);
});
