import { currentPlayer, startSession } from "@/lib/auth";
import {
  checkPlayer, claimHost, createGame, drawPairs, findByRejoinCode, GameError, joinGame, makeHost, newRound, pauseGame, removePlayer, resumeGame, setRole, startGame,
  terminateGame, updateSettings,
} from "@/lib/game";
import { body, fail, json } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const b = await body<{
      action: string; name?: string; role?: string; code?: string; gameCode?: string; zone?: string; playerId?: string;
      liveMin?: number; headStartMin?: number; zoneRadiusM?: number; missionsMode?: string;
    }>(req);

    // Creating, joining and rejoining are the only actions without a session.
    if (b.action === "create") {
      checkPlayer(String(b.name ?? ""), String(b.role ?? "")); // before creating, so no empty games are left behind
      const gameCode = await createGame(String(b.zone ?? ""), String(b.missionsMode ?? "chill"));
      const id = await joinGame(gameCode, String(b.name ?? ""), String(b.role ?? ""));
      await startSession(id);
      return json({ ok: true, gameCode });
    }
    if (b.action === "join") {
      const id = await joinGame(String(b.gameCode ?? ""), String(b.name ?? ""), String(b.role ?? ""));
      await startSession(id);
      return json({ ok: true });
    }
    if (b.action === "rejoin") {
      const p = await findByRejoinCode(String(b.code ?? ""));
      await startSession(p.id);
      return json({ ok: true });
    }

    const me = await currentPlayer();
    if (!me) return json({ error: "Sessione scaduta. Rientra con il tuo codice." }, 401);
    switch (b.action) {
      case "role": await setRole(me, String(b.role)); break;
      case "remove": await removePlayer(me, String(b.playerId ?? me.id)); break;
      case "draw": await drawPairs(me); break;
      case "start": await startGame(me); break;
      case "newRound": await newRound(me); break;
      case "makeHost": await makeHost(me, String(b.playerId)); break;
      case "claimHost": await claimHost(me); break;
      case "settings": await updateSettings(me, b); break;
      case "pause": await pauseGame(me); break;
      case "resume": await resumeGame(me); break;
      case "terminate": await terminateGame(me); break;
      default: throw new GameError("Azione sconosciuta.");
    }
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
