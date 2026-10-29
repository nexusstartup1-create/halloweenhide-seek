import { sendScare } from "@/lib/game";
import { body, handler } from "@/lib/http";

export const POST = handler(async (me, req) => {
  const { targetId, text } = await body<{ targetId: string; text: string }>(req);
  return sendScare(me, String(targetId ?? ""), String(text ?? ""));
});
