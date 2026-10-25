import { currentPlayer } from "@/lib/auth";
import { GameError, recoverAccount, saveAccount } from "@/lib/game";
import { body, fail, json } from "@/lib/http";

/** Rank accounts: "save" protects my rank with a name + password; "recover" brings it to this phone. */
export async function POST(req: Request) {
  try {
    const b = await body<{ action?: string; username?: string; password?: string; current?: string; key?: string }>(req);
    const me = await currentPlayer();
    if (b.action === "save") {
      if (!me) return json({ error: "Sessione scaduta. Rientra con il tuo codice." }, 401);
      await saveAccount(me, b.username, b.password, b.current);
      return json({ ok: true });
    }
    if (b.action === "recover") return json(await recoverAccount(b.key, b.username, b.password, me?.id ?? null));
    throw new GameError("Azione non valida.");
  } catch (e) {
    return fail(e);
  }
}
