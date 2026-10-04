import { album } from "@/lib/game";
import { handler } from "@/lib/http";

export const GET = handler(async (me) => ({ proofs: await album(me) }));
