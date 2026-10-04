import { deleteMessage, postMessage } from "@/lib/game";
import { body, handler } from "@/lib/http";

export const POST = handler(async (me, req) => {
  const { channel, text } = await body<{ channel: string; text: string }>(req);
  await postMessage(me, channel, String(text ?? ""));
});

export const DELETE = handler(async (me, req) => {
  const { id } = await body<{ id: number }>(req);
  await deleteMessage(me, Number(id));
});
