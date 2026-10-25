import { ghostLine } from "@/lib/game";
import { body, handler } from "@/lib/http";

export const POST = handler(async (me, req) => {
  const { line } = await body<{ line: number }>(req);
  return ghostLine(me, Number(line));
});
