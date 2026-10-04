import { currentPlayer } from "./auth";
import { GameError, type PlayerRow } from "./game";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function fail(e: unknown) {
  if (e instanceof GameError) return json({ error: e.message }, 400);
  console.error(e);
  return json({ error: "Errore del server. Riprova tra qualche secondo." }, 500);
}

/** Wraps a handler: resolves the session and maps errors to JSON responses. */
export function handler(fn: (me: PlayerRow, req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      const me = await currentPlayer();
      if (!me) return json({ error: "Sessione scaduta. Rientra con il tuo codice." }, 401);
      const out = await fn(me, req);
      return json(out ?? { ok: true });
    } catch (e) {
      return fail(e);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new GameError("Richiesta non valida.");
  }
}
