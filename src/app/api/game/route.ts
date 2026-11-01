import { findGameByCode, phaseOf, gameZoneName } from "@/lib/game";
import { q } from "@/lib/db";
import { fail, json } from "@/lib/http";

// Lets the join screen show which game a code belongs to before entering it.
export async function GET(req: Request) {
  try {
    const g = await findGameByCode(new URL(req.url).searchParams.get("code") ?? "");
    const [{ n }] = await q<{ n: number }>("select count(*)::int as n from players where game_id = $1 and not hidden", [g.id]);
    return json({ code: g.code, zoneName: gameZoneName(g), phase: phaseOf(g), players: n });
  } catch (e) {
    return fail(e);
  }
}
