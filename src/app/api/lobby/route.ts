import { currentPlayer, startSession } from "@/lib/auth";
import {
  askLobby, checkPlayer, claimHost, createGame, linkProfile, drawPairs, drawRoles, findByRejoinCode, GameError, joinGame, makeHost, newRound, pauseGame, pickPartner, removePlayer, resumeGame, startGame,
  terminateGame, updateSettings,
} from "@/lib/game";
import { q } from "@/lib/db";
import { body, fail, json } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const b = await body<{
      action: string; name?: string; role?: string; code?: string; gameCode?: string; zone?: string; playerId?: string;
      liveMin?: number; headStartMin?: number; zoneRadiusM?: number; missionsMode?: string; huntersN?: number; partnerId?: string | null;
      consent?: boolean; profile?: string;
      custom?: { name?: string; lat?: number; lng?: number; radiusM?: number; ai?: boolean; places?: { name: string; lat: number; lng: number }[] };
    }>(req);
    // New players must accept the rules and the privacy notice.
    const needConsent = () => {
      if (b.consent !== true) throw new GameError("Per giocare devi accettare regole e privacy.");
    };
    const consented = (id: string) => q("update players set consented_at = now() where id = $1", [id]);

    // Creating, joining and rejoining are the only actions without a session.
    if (b.action === "create") {
      needConsent();
      checkPlayer(String(b.name ?? "")); // before creating, so no empty games are left behind
      const custom = b.custom
        ? { name: String(b.custom.name ?? ""), lat: Number(b.custom.lat), lng: Number(b.custom.lng), radiusM: Number(b.custom.radiusM), ai: Boolean(b.custom.ai), places: Array.isArray(b.custom.places) ? b.custom.places.slice(0, 40) : undefined }
        : undefined;
      const gameCode = await createGame(String(b.zone ?? ""), String(b.missionsMode ?? "chill"), custom);
      const id = await joinGame(gameCode, String(b.name ?? ""));
      await consented(id);
      await linkProfile(id, b.profile, String(b.name ?? ""));
      await startSession(id);
      return json({ ok: true, gameCode });
    }
    if (b.action === "join") {
      needConsent();
      const id = await joinGame(String(b.gameCode ?? ""), String(b.name ?? ""));
      await consented(id);
      await linkProfile(id, b.profile, String(b.name ?? ""));
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
      case "roles": await drawRoles(me); break;
      case "pick": await pickPartner(me, b.partnerId ? String(b.partnerId) : null); break;
      case "remove": await removePlayer(me, String(b.playerId ?? me.id)); break;
      case "draw": await drawPairs(me); break;
      case "start": await startGame(me); break;
      case "newRound": await newRound(me); break;
      case "askLobby": await askLobby(me); break;
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
