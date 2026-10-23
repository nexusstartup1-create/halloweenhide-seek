import { replayOf } from "@/lib/game";
import { handler } from "@/lib/http";

/** End-of-game replay: everyone's route and the captures. */
export const GET = handler(async (me) => replayOf(me));
