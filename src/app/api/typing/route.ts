import { setTyping } from "@/lib/game";
import { body, handler } from "@/lib/http";

export const POST = handler(async (me, req) => {
  const { channel, audio } = await body<{ channel: string; audio?: boolean }>(req);
  await setTyping(me, String(channel), !!audio);
});
