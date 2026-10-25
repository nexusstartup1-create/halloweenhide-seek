import { handler } from "@/lib/http";
import { testPush } from "@/lib/push";

export const POST = handler(async (me) => ({ subs: await testPush(me.id) }));
