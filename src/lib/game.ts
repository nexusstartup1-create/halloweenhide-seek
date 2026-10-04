import type { PoolClient } from "pg";
import { randomInt, randomUUID } from "node:crypto";
import { del as delBlob, put as putBlob } from "@vercel/blob";
import { q, tx } from "./db";
import { CARDS, cardState, type CardCode, type CardRow } from "./cards";
import {
  CAPTURE_BOUNTY, ZONE_REFRESH_S, FLASH_EVERY_MIN, FLASH_LEN_MIN, FLASH_MULT, HEAD_START_OPTIONS, HOST_STALE_MIN, LIVE_OPTIONS,
  missionsFor, PAIR_NAMES, PASSWORD_WORDS, RADIUS_OPTIONS, SEED_POOL, WHATSAPP_URL, ZONES, zoneOf, type ZoneKey,
} from "./config";
import { notify } from "./push";
import { bearing, compass, distanceM, inPolygon, neighbours, sectorOf, sectorPolygons } from "./geo";

export type Phase = "LOBBY" | "HEAD_START" | "LIVE" | "PAUSED" | "ENDED";
export type Role = "HUNTER" | "FUGITIVE";

export interface GameRow {
  id: number;
  code: string;
  zone: ZoneKey;
  round: number;
  drawn_at: Date | null;
  started_at: Date | null;
  live_at: Date | null;
  ends_at: Date | null;
  ended_at: Date | null;
  winner_kind: "HUNTER" | "PAIR" | null;
  winner_id: string | null;
  host_id: string | null;
  live_min: number;
  head_start_min: number;
  zone_radius_m: number;
  missions_mode: "chill" | "abbandonati";
  paused_at: Date | null;
}

export interface PlayerRow {
  id: string;
  game_id: number;
  name: string;
  role: Role | null;
  pair_id: string | null;
  rejoin_code: string;
  password: string | null;
  status: "ACTIVE" | "CAPTURED";
  captured_by: string | null;
  captured_at: Date | null;
  lat: number | null;
  lng: number | null;
  acc_m: number | null;
  fix_at: Date | null;
  out_since: Date | null;
  out_reported: boolean;
  last_seen: Date | null;
  spectator: boolean;
}

export class GameError extends Error {}

const FRESH_FIX_MS = 10 * 60_000;
const STARTING_HAND: Record<Role, { code: CardCode; uses: number | null }[]> = {
  FUGITIVE: [{ code: "GHOST_SHIELD", uses: 1 }, { code: "NEBBIA", uses: 2 }, { code: "ECO", uses: 1 }],
  HUNTER: [{ code: "RADAR_PING", uses: null }, { code: "TRACCIA", uses: 1 }],
};

export function normalize(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function code(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return s;
}

export function phaseOf(g: GameRow, now = Date.now()): Phase {
  if (!g.started_at) return "LOBBY";
  if (g.ended_at) return "ENDED";
  if (g.paused_at) return "PAUSED";
  if (g.ends_at && now >= +g.ends_at) return "ENDED";
  if (g.live_at && now < +g.live_at) return "HEAD_START";
  return "LIVE";
}

type Db = Pick<PoolClient, "query">;

async function rows<T>(c: Db | null, text: string, params: unknown[] = []): Promise<T[]> {
  if (c) return (await c.query(text, params)).rows as T[];
  return (await q(text, params)) as T[];
}

export async function getGame(c: Db | null, gid: number) {
  const [g] = await rows<GameRow>(c, "select * from game where id = $1", [gid]);
  if (!g) throw new GameError("Partita non trovata. Forse è stata chiusa: creane una nuova.");
  return g;
}

/** Ends the game once the timer is over. Idempotent. */
async function ensureFinalized(g: GameRow) {
  if (g.started_at && !g.ended_at && !g.paused_at && g.ends_at && Date.now() >= +g.ends_at) {
    await endGame(g.id, g.ends_at);
    return getGame(null, g.id);
  }
  return g;
}

async function endGame(gid: number, at: Date) {
  await tx(async (c) => {
    const w = await resolveWinner(c, gid);
    const res = await c.query(
      "update game set ended_at = $1, winner_kind = $2, winner_id = $3 where id = $4 and ended_at is null",
      [at, w?.kind ?? null, w?.id ?? null, gid],
    );
    if (res.rowCount) await sysMsg(c, gid, "BROADCAST", "Fine partita. Classifica e album delle prove sono aperti a tutti.");
  });
}

export async function hunterTotals(c: Db | null, gid: number) {
  return rows<{ id: string; name: string; stolen: number; last_at: Date | null }>(
    c,
    `select p.id, p.name, coalesce(sum(l.hunter_delta), 0)::int as stolen,
            max(l.at) filter (where l.hunter_delta > 0) as last_at
       from players p left join ledger l on l.hunter_id = p.id
      where p.role = 'HUNTER' and p.game_id = $1 and not p.spectator group by p.id, p.name
      order by stolen desc, last_at asc nulls last, p.name`,
    [gid],
  );
}

export async function pairTable(c: Db | null, gid: number) {
  return rows<{ id: string; name: string; pool: number; active: number; last_gain_at: Date | null }>(
    c,
    `select pr.id, pr.name, pr.pool, pr.last_gain_at,
            (select count(*) from players p where p.pair_id = pr.id and p.status = 'ACTIVE')::int as active
       from pairs pr where pr.game_id = $1 order by pr.id`,
    [gid],
  );
}

async function resolveWinner(c: Db, gid: number): Promise<{ kind: "HUNTER" | "PAIR"; id: string } | null> {
  const pairs = (await pairTable(c, gid)).filter((p) => p.active > 0);
  if (pairs.length === 0) {
    const [top] = await hunterTotals(c, gid);
    return top ? { kind: "HUNTER", id: top.id } : null;
  }
  pairs.sort(
    (a, b) =>
      b.pool - a.pool ||
      b.active - a.active ||
      (a.last_gain_at ? +a.last_gain_at : Infinity) - (b.last_gain_at ? +b.last_gain_at : Infinity),
  );
  return { kind: "PAIR", id: pairs[0].id };
}

export async function sysMsg(c: Db, gid: number, channel: "HUNTERS" | "FUGITIVES" | "BROADCAST", body: string, proofId: number | null = null) {
  await c.query("insert into messages (game_id, channel, kind, body, proof_id) values ($1, $2, 'SYSTEM', $3, $4)", [gid, channel, body, proofId]);
}

const ALERT_TITLE: Record<string, string> = {
  CAPTURED: "Sei stato catturato",
  PARTNER_DOWN: "Partner catturato",
  PINGED: "Radar ping!",
  REVEALED: "Un fantasma ti ha visto",
  INFO: "Night Hunt",
};

async function alert(c: Db, playerId: string, kind: string, body: string) {
  await c.query("insert into alerts (player_id, kind, body) values ($1, $2, $3)", [playerId, kind, body]);
  notify([playerId], ALERT_TITLE[kind] ?? "Night Hunt", body, kind);
}

const fmt = (n: number) => n.toLocaleString("it-IT");

/* ---------------- host (organizzatore) ---------------- */

/** Makes sure the game has a host while anyone is in it: the earliest player to join. */
async function ensureHost(c: Db, gid: number) {
  const { rows } = await c.query(
    `select g.host_id, exists(select 1 from players p where p.id = g.host_id and p.game_id = g.id) as present from game g where g.id = $1`,
    [gid],
  );
  if (rows[0]?.host_id && rows[0].present) return;
  await c.query("update game set host_id = (select id from players where game_id = $1 order by joined_at limit 1) where id = $1", [gid]);
}

function hostIsStale(host: PlayerRow | undefined) {
  return !host || !host.last_seen || Date.now() - +host.last_seen > HOST_STALE_MIN * 60_000;
}

async function requireHost(c: Db, me: PlayerRow) {
  const g = await getGame(c, me.game_id);
  if (g.host_id === me.id) return g;
  const [host] = (await c.query<PlayerRow>("select * from players where id = $1", [g.host_id])).rows;
  if (hostIsStale(host)) {
    await c.query("update game set host_id = $1 where id = $2", [me.id, g.id]);
    await sysMsg(c, g.id, "BROADCAST", `${me.name} è il nuovo organizzatore.`);
    return { ...g, host_id: me.id };
  }
  throw new GameError(`Solo l'organizzatore (${host?.name ?? "?"}) può farlo.`);
}

export async function makeHost(me: PlayerRow, playerId: string) {
  await tx(async (c) => {
    await requireHost(c, me);
    const [p] = (await c.query<PlayerRow>("select * from players where id = $1 and game_id = $2", [playerId, me.game_id])).rows;
    if (!p) throw new GameError("Giocatore non trovato.");
    await c.query("update game set host_id = $1 where id = $2", [p.id, me.game_id]);
    await sysMsg(c, me.game_id, "BROADCAST", `${p.name} è il nuovo organizzatore.`);
  });
}

export async function claimHost(me: PlayerRow) {
  await tx(async (c) => {
    await requireHost(c, me);
  });
}

/* ---------------- lobby ---------------- */

async function requireLobby(c: Db | null, gid: number) {
  const g = await getGame(c, gid);
  if (phaseOf(g) !== "LOBBY") throw new GameError("La partita è già iniziata. Se eri già dentro, rientra con il tuo codice.");
  return g;
}

/** Any change to the roster cancels a previous draw. */
async function invalidateDraw(c: Db, gid: number) {
  const { rows: g } = await c.query("select drawn_at from game where id = $1", [gid]);
  if (!g[0].drawn_at) return;
  await c.query("update players set pair_id = null, password = null where game_id = $1", [gid]);
  await c.query("delete from pairs where game_id = $1", [gid]);
  await c.query("update game set drawn_at = null where id = $1", [gid]);
  await sysMsg(c, gid, "BROADCAST", "La squadra è cambiata: l'estrazione delle coppie va rifatta.");
}

/** A new game in one of the zones. Returns its 5-letter code; the creator joins it as host right after. */
export async function createGame(zone: string, missionsMode = "chill") {
  if (!(zone in ZONES)) throw new GameError("Scegli una zona di gioco.");
  const mode = missionsMode === "abbandonati" ? "abbandonati" : "chill";
  for (let i = 0; i < 20; i++) {
    const c5 = code(5);
    const r = await q<{ id: number }>("insert into game (code, zone, missions_mode) values ($1, $2, $3) on conflict (code) do nothing returning id", [c5, zone, mode]);
    if (r.length) return c5;
  }
  throw new GameError("Non sono riuscito a creare la partita. Riprova.");
}

export async function findGameByCode(raw: string) {
  const [g] = await q<GameRow>("select * from game where code = $1", [normalize(raw)]);
  if (!g) throw new GameError("Codice partita non trovato. Controlla le 5 lettere.");
  return g;
}

/** Validates a player's name and role; returns the cleaned name. */
export function checkPlayer(name: string, role: string) {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 20);
  if (clean.length < 2) throw new GameError("Scrivi un nome di almeno 2 lettere.");
  if (role !== "HUNTER" && role !== "FUGITIVE") throw new GameError("Scegli se sei cercatore o fuggiasco.");
  return clean;
}

export async function joinGame(gameCode: string, name: string, role: string) {
  const clean = checkPlayer(name, role);
  const game = await findGameByCode(gameCode);
  const gid = game.id;
  return tx(async (c) => {
    // Joining mid-game makes you a spectator until the next round.
    const phase = phaseOf(await getGame(c, gid));
    const spectator = phase === "HEAD_START" || phase === "LIVE" || phase === "PAUSED";
    const taken = await c.query("select 1 from players where game_id = $1 and name_key = $2", [gid, clean.toLowerCase()]);
    if (taken.rowCount) throw new GameError(`C'è già un giocatore chiamato ${clean}. Se sei tu, rientra con il codice.`);
    if (phase === "LOBBY") await invalidateDraw(c, gid);
    const id = `p_${code(8).toLowerCase()}`;
    let rejoin = code(4);
    while ((await c.query("select 1 from players where rejoin_code = $1", [rejoin])).rowCount) rejoin = code(4);
    await c.query("insert into players (id, game_id, name, name_key, role, rejoin_code, last_seen, spectator) values ($1, $2, $3, $4, $5, $6, now(), $7)", [
      id, gid, clean, clean.toLowerCase(), role, rejoin, spectator,
    ]);
    if (spectator) await sysMsg(c, gid, "BROADCAST", `${clean} segue la partita da spettatore e gioca dalla prossima.`);
    await ensureHost(c, gid);
    return id;
  });
}

export async function findByRejoinCode(raw: string) {
  const [p] = await q<PlayerRow>("select * from players where rejoin_code = $1", [normalize(raw)]);
  if (!p) throw new GameError("Codice non trovato. Controlla le 4 lettere.");
  return p;
}

export async function setRole(me: PlayerRow, role: string) {
  if (role !== "HUNTER" && role !== "FUGITIVE") throw new GameError("Ruolo non valido.");
  await tx(async (c) => {
    await requireLobby(c, me.game_id);
    if (me.role === role) return;
    await invalidateDraw(c, me.game_id);
    await c.query("update players set role = $1 where id = $2", [role, me.id]);
  });
}

/** Leaving (yourself, in the lobby) or kicking (host, any time). */
export async function removePlayer(me: PlayerRow, playerId: string) {
  const gid = me.game_id;
  let checkEnd = false;
  await tx(async (c) => {
    const g = await getGame(c, gid);
    const phase = phaseOf(g);
    if (playerId === me.id) {
      if (phase !== "LOBBY" && phase !== "ENDED") throw new GameError("Durante la partita non puoi uscire da solo: chiedi all'organizzatore.");
    } else {
      await requireHost(c, me);
    }
    const [p] = (await c.query<PlayerRow>("select * from players where id = $1 and game_id = $2", [playerId, gid])).rows;
    if (!p) throw new GameError("Giocatore non trovato.");
    if (phase === "LOBBY") await invalidateDraw(c, gid);
    await c.query("delete from players where id = $1", [playerId]);
    if (playerId !== me.id) await sysMsg(c, gid, "BROADCAST", `${p.name} è stato tolto dalla partita dall'organizzatore.`);
    await ensureHost(c, gid);
    checkEnd = phase === "LIVE" && p.role === "FUGITIVE";
  });
  if (checkEnd) {
    const [{ n }] = await q<{ n: number }>("select count(*)::int as n from players where game_id = $1 and role = 'FUGITIVE' and status = 'ACTIVE' and not spectator", [gid]);
    if (n === 0) await endGame(gid, new Date());
  }
}

/** Host settings, editable in the lobby: hunt length, head start, zone circle and kind of missions. */
export async function updateSettings(me: PlayerRow, b: { liveMin?: number; headStartMin?: number; zoneRadiusM?: number; missionsMode?: string }) {
  await tx(async (c) => {
    await requireLobby(c, me.game_id);
    await requireHost(c, me);
    const g = await getGame(c, me.game_id);
    const live = b.liveMin != null && LIVE_OPTIONS.includes(Number(b.liveMin)) ? Number(b.liveMin) : g.live_min;
    const head = b.headStartMin != null && HEAD_START_OPTIONS.includes(Number(b.headStartMin)) ? Number(b.headStartMin) : g.head_start_min;
    const radius = b.zoneRadiusM != null && RADIUS_OPTIONS.includes(Number(b.zoneRadiusM)) ? Number(b.zoneRadiusM) : g.zone_radius_m;
    const mode = b.missionsMode === "abbandonati" || b.missionsMode === "chill" ? b.missionsMode : g.missions_mode;
    await c.query("update game set live_min = $1, head_start_min = $2, zone_radius_m = $3, missions_mode = $4 where id = $5", [live, head, radius, mode, g.id]);
  });
}

/** Pause: freezes the game clock, card timers and pings until the host resumes. */
export async function pauseGame(me: PlayerRow) {
  await tx(async (c) => {
    const g = await requireHost(c, me);
    const phase = phaseOf(g);
    if (phase !== "HEAD_START" && phase !== "LIVE") throw new GameError("Si può mettere in pausa solo una partita in corso.");
    await c.query("update game set paused_at = now() where id = $1", [g.id]);
    await sysMsg(c, g.id, "BROADCAST", "Partita in pausa. Fermatevi dove siete.");
  });
}

export async function resumeGame(me: PlayerRow) {
  await tx(async (c) => {
    const g = await requireHost(c, me);
    if (!g.paused_at) throw new GameError("La partita non è in pausa.");
    // Shift every running clock forward by the length of the pause.
    const shift = "(now() - (select paused_at from game where id = $1))";
    await c.query(`update cards set active_until = active_until + ${shift} where active_until > (select paused_at from game where id = $1) and owner_id in (select id from players where game_id = $1)`, [g.id]);
    await c.query(`update cards set cooldown_until = cooldown_until + ${shift} where cooldown_until > (select paused_at from game where id = $1) and owner_id in (select id from players where game_id = $1)`, [g.id]);
    await c.query(`update pings set expires_at = expires_at + ${shift} where game_id = $1 and expires_at > (select paused_at from game where id = $1)`, [g.id]);
    await c.query(`update game set live_at = live_at + ${shift}, ends_at = ends_at + ${shift}, paused_at = null where id = $1`, [g.id]);
    await sysMsg(c, g.id, "BROADCAST", "Si riparte!");
  });
}

/** Ends the game now. A winner is named only if the hunt had already started. */
export async function terminateGame(me: PlayerRow) {
  const g = await tx(async (c) => requireHost(c, me));
  const phase = phaseOf(g);
  if (phase === "LOBBY" || phase === "ENDED") throw new GameError("Nessuna partita in corso.");
  const huntStarted = !!g.live_at && Date.now() >= +g.live_at;
  if (huntStarted) {
    await q("update game set paused_at = null where id = $1", [g.id]);
    await endGame(g.id, new Date());
  } else {
    await tx(async (c) => {
      await c.query("update game set ended_at = now(), paused_at = null, winner_kind = null, winner_id = null where id = $1 and ended_at is null", [g.id]);
      await sysMsg(c, g.id, "BROADCAST", "Partita interrotta dall'organizzatore.");
    });
  }
}

export async function drawPairs(me: PlayerRow) {
  const gid = me.game_id;
  await tx(async (c) => {
    await requireLobby(c, gid);
    await requireHost(c, me);
    await c.query("select id from game where id = $1 for update", [gid]);
    const fugitives = (await c.query<PlayerRow>("select * from players where role = 'FUGITIVE' and game_id = $1 for update", [gid])).rows;
    const hunters = (await c.query("select 1 from players where role = 'HUNTER' and game_id = $1", [gid])).rowCount ?? 0;
    if (hunters < 1) throw new GameError("Serve almeno un cercatore.");
    if (fugitives.length < 2 || fugitives.length % 2) throw new GameError(`I fuggiaschi devono essere in numero pari (ora sono ${fugitives.length}).`);

    await c.query("update players set pair_id = null, password = null where game_id = $1", [gid]);
    await c.query("delete from pairs where game_id = $1", [gid]);
    const order = shuffle(fugitives);
    const names = shuffle(PAIR_NAMES);
    const words = shuffle(PASSWORD_WORDS);
    const lines: string[] = [];
    for (let i = 0; i < order.length / 2; i++) {
      // Pair ids are unique across games, so upload folders and proofs never collide.
      const pid = `G${gid}P${i + 1}`;
      const pname = names[i % names.length];
      await c.query("insert into pairs (id, game_id, name) values ($1, $2, $3)", [pid, gid, pname]);
      for (const k of [0, 1]) {
        const pl = order[i * 2 + k];
        const pw = words[(i * 2 + k) % words.length] + String(randomInt(10, 100));
        await c.query("update players set pair_id = $1, password = $2 where id = $3", [pid, pw, pl.id]);
      }
      lines.push(`${pname}: ${order[i * 2].name} + ${order[i * 2 + 1].name}`);
    }
    await c.query("update game set drawn_at = now() where id = $1", [gid]);
    await sysMsg(c, gid, "BROADCAST", `Coppie estratte. ${lines.join(" · ")}`);
  });
}

/** Wipes one game's round data (scores, cards, captures, pings) without touching other games. */
async function clearRound(c: Db, gid: number, alsoChat: boolean) {
  const inGame = "(select id from players where game_id = $1)";
  await c.query("delete from ledger where game_id = $1", [gid]);
  await c.query("delete from proofs where game_id = $1", [gid]);
  await c.query(`delete from cards where owner_id in ${inGame}`, [gid]);
  await c.query(`delete from capture_attempts where hunter_id in ${inGame}`, [gid]);
  await c.query(`delete from alerts where player_id in ${inGame}`, [gid]);
  await c.query("delete from pings where game_id = $1", [gid]);
  if (alsoChat) {
    await c.query("delete from messages where game_id = $1", [gid]);
    await c.query("delete from flash_slots where game_id = $1", [gid]);
  }
}

export async function startGame(me: PlayerRow) {
  const gid = me.game_id;
  await tx(async (c) => {
    const g = await requireLobby(c, gid);
    await requireHost(c, me);
    if (!g.drawn_at) throw new GameError("Prima estraete le coppie.");
    await clearRound(c, gid, false);
    await c.query("update players set status = 'ACTIVE', captured_by = null, captured_at = null, out_since = null, out_reported = false, spectator = false where game_id = $1", [gid]);
    await c.query("update pairs set pool = $1, last_gain_at = null where game_id = $2", [SEED_POOL, gid]);
    for (const p of (await c.query("select id from pairs where game_id = $1", [gid])).rows) {
      await c.query("insert into ledger (game_id, kind, pair_id, pair_delta) values ($1, 'SEED', $2, $3)", [gid, p.id, SEED_POOL]);
    }
    for (const pl of (await c.query<PlayerRow>("select id, role from players where role is not null and game_id = $1", [gid])).rows) {
      for (const card of STARTING_HAND[pl.role!]) {
        await c.query("insert into cards (code, owner_id, uses_left) values ($1, $2, $3)", [card.code, pl.id, card.uses]);
      }
    }
    await c.query(
      `update game set started_at = now(), live_at = now() + make_interval(mins => $1::int),
              ends_at = now() + make_interval(mins => $1::int + $2::int), ended_at = null, winner_kind = null, winner_id = null, paused_at = null
        where id = $3`,
      [g.head_start_min, g.live_min, gid],
    );
    await sysMsg(c, gid, "BROADCAST", `Si parte! ${g.head_start_min} minuti di vantaggio ai fuggiaschi, poi caccia aperta per ${g.live_min} minuti.`);
    const all = (await c.query("select id from players where game_id = $1", [gid])).rows.map((r) => r.id as string);
    notify(all, "Si parte!", `${g.head_start_min} minuti di vantaggio ai fuggiaschi. Buona caccia.`, "start");
  });
}

export async function newRound(me: PlayerRow) {
  const gid = me.game_id;
  await tx(async (c) => {
    const g = await getGame(c, gid);
    await requireHost(c, me);
    if (phaseOf(g) !== "ENDED") throw new GameError("Si può ricominciare solo a partita finita.");
    await clearRound(c, gid, true);
    await c.query("update players set pair_id = null, password = null, status = 'ACTIVE', captured_by = null, captured_at = null, spectator = false where game_id = $1", [gid]);
    await c.query("delete from pairs where game_id = $1", [gid]);
    await c.query(
      `update game set round = round + 1, drawn_at = null, started_at = null, live_at = null, ends_at = null,
              ended_at = null, winner_kind = null, winner_id = null, paused_at = null where id = $1`,
      [gid],
    );
  });
}

/* ---------------- capture ---------------- */

export type CaptureResult =
  | { result: "OK"; stolen: number; targetName: string; pairName: string; partnerActive: boolean; poolLeft: number }
  | { result: "WRONG"; attemptsLeft: number }
  | { result: "ALREADY"; targetName: string; capturedBy: string }
  | { result: "SHIELDED"; shieldLeftS: number }
  | { result: "LOCKED"; lockedS: number }
  | { result: "PHASE"; phase: Phase };

const MAX_WRONG = 5;
const LOCK_S = 60;

export async function lockState(hunterId: string) {
  const r = await q<{ n: number; first: Date | null }>(
    `select count(*)::int as n, min(at) as first from capture_attempts
      where hunter_id = $1 and result = 'WRONG' and at > now() - interval '${LOCK_S} seconds'`,
    [hunterId],
  );
  const { n, first } = r[0];
  const lockedS = n >= MAX_WRONG && first ? Math.max(0, Math.ceil(LOCK_S - (Date.now() - +first) / 1000)) : 0;
  return { attemptsLeft: Math.max(0, MAX_WRONG - n), lockedS };
}

export async function claimCapture(hunter: PlayerRow, raw: string): Promise<CaptureResult> {
  const hunterId = hunter.id;
  const gid = hunter.game_id;
  const g = await getGame(null, gid);
  const phase = phaseOf(g);
  if (hunter.spectator) throw new GameError("Sei spettatore: giochi dalla prossima partita.");
  if (phase !== "LIVE") return { result: "PHASE", phase };
  const pw = normalize(raw);
  const lock = await lockState(hunterId);
  if (lock.lockedS > 0) return { result: "LOCKED", lockedS: lock.lockedS };

  const out = await tx<CaptureResult>(async (c) => {
    const log = (result: string, targetId: string | null = null) =>
      c.query("insert into capture_attempts (hunter_id, input, result, target_id) values ($1, $2, $3, $4)", [hunterId, pw, result, targetId]);

    const [t] = (await c.query<PlayerRow>("select * from players where game_id = $1 and password = $2 and role = 'FUGITIVE' and not spectator for update", [gid, pw])).rows;
    if (!t) {
      await log("WRONG");
      const [{ n }] = (
        await c.query(
          `select count(*)::int as n from capture_attempts where hunter_id = $1 and result = 'WRONG' and at > now() - interval '${LOCK_S} seconds'`,
          [hunterId],
        )
      ).rows;
      return { result: "WRONG", attemptsLeft: Math.max(0, MAX_WRONG - n) };
    }
    if (t.status === "CAPTURED") {
      await log("ALREADY", t.id);
      const [by] = (await c.query("select name from players where id = $1", [t.captured_by])).rows;
      return { result: "ALREADY", targetName: t.name, capturedBy: by?.name ?? "?" };
    }
    const [shield] = (
      await c.query<CardRow>("select * from cards where owner_id = $1 and code = 'GHOST_SHIELD' and not voided and active_until > now()", [t.id])
    ).rows;
    if (shield) {
      await log("SHIELDED", t.id);
      return { result: "SHIELDED", shieldLeftS: Math.ceil((+shield.active_until! - Date.now()) / 1000) };
    }

    const [pair] = (await c.query("select * from pairs where id = $1 for update", [t.pair_id])).rows;
    const [{ n }] = (await c.query("select count(*)::int as n from players where pair_id = $1 and status = 'ACTIVE'", [t.pair_id])).rows;
    const stolen = Math.floor(pair.pool / n);

    await c.query(
      "insert into ledger (game_id, kind, pair_id, pair_delta, hunter_id, hunter_delta, ref_id, actor_id) values ($6, 'CAPTURE', $1, $2, $3, $4, $5, $3)",
      [pair.id, -stolen, hunterId, stolen + CAPTURE_BOUNTY, t.id, gid],
    );
    await c.query("update players set status = 'CAPTURED', captured_by = $1, captured_at = now() where id = $2", [hunterId, t.id]);
    await c.query("update pairs set pool = pool - $1 where id = $2", [stolen, pair.id]);
    await c.query("update cards set voided = true where owner_id = $1", [t.id]);
    // The captured player comes back as a ghost on the hunters' side, first whisper after 3 minutes.
    await c.query("insert into cards (code, owner_id, uses_left, cooldown_until) values ('SUSSURRO', $1, null, now() + interval '3 minutes')", [t.id]);
    await log("OK", t.id);

    const [hunterRow] = (await c.query("select name from players where id = $1", [hunterId])).rows;
    const [partner] = (await c.query<PlayerRow>("select * from players where pair_id = $1 and id <> $2", [pair.id, t.id])).rows;
    const partnerActive = partner?.status === "ACTIVE";
    await sysMsg(c, gid, "HUNTERS", `${hunterRow.name} ha catturato ${t.name} (${pair.name}) · +${fmt(stolen + CAPTURE_BOUNTY)}. ${t.name} ora è un fantasma dalla vostra parte.`);
    await sysMsg(c, gid, "FUGITIVES", `${t.name} (${pair.name}) è stato catturato.`);
    await alert(c, t.id, "CAPTURED", `Catturato da ${hunterRow.name}. Ora sei un fantasma: aiuta i cercatori con il Sussurro.`);
    if (partner && partnerActive) {
      await alert(c, partner.id, "PARTNER_DOWN", `${t.name} è stato catturato. Il pool (${fmt(pair.pool - stolen)}) ora è tutto tuo.`);
    }
    return { result: "OK", stolen: stolen + CAPTURE_BOUNTY, targetName: t.name, pairName: pair.name, partnerActive, poolLeft: pair.pool - stolen };
  });

  if (out.result === "OK") {
    const [{ n }] = await q<{ n: number }>("select count(*)::int as n from players where game_id = $1 and role = 'FUGITIVE' and status = 'ACTIVE' and not spectator", [gid]);
    if (n === 0) await endGame(gid, new Date());
  }
  return out;
}

/* ---------------- cards ---------------- */

export async function playCard(player: PlayerRow, cardId: number, target: string | null) {
  const gid = player.game_id;
  const g = await getGame(null, gid);
  const BOUNDARY = zoneOf(g.zone).boundary;
  if (player.spectator) throw new GameError("Sei spettatore: giochi dalla prossima partita.");
  if (phaseOf(g) !== "LIVE") throw new GameError("Le carte si giocano solo a caccia aperta.");

  return tx(async (c) => {
    const [card] = (await c.query<CardRow>("select * from cards where id = $1 and owner_id = $2 for update", [cardId, player.id])).rows;
    if (!card) throw new GameError("Carta non trovata.");
    const def = CARDS[card.code as CardCode];
    const eligible = def.side === "GHOST" ? player.status === "CAPTURED" : player.status === "ACTIVE";
    if (!eligible) throw new GameError(def.side === "GHOST" ? "Il Sussurro è solo per i fantasmi." : "Sei fuori dal gioco.");
    if (cardState(card, true, true, Date.now()) !== "READY") throw new GameError("Questa carta non è pronta.");
    if (def.needsSector === "ANY" && (!target || !/^C[1-9]$/.test(target))) throw new GameError("Scegli un settore.");

    let message = `${def.name} attiva.`;

    if (card.code === "RADAR_PING") {
      const [me] = (await c.query<PlayerRow>("select * from players where id = $1", [player.id])).rows;
      if (!me.fix_at || Date.now() - +me.fix_at > 2 * 60_000) {
        throw new GameError("Serve una posizione GPS recente. Tieni la mappa aperta qualche secondo.");
      }
      const origin = sectorOf(me.lng!, me.lat!, BOUNDARY);
      const lit = neighbours(origin);
      const counts: Record<string, number> = Object.fromEntries(lit.map((s) => [s, 0]));
      const fugitives = (await c.query<PlayerRow>(VISIBLE_FUGITIVES, [gid])).rows;
      const hit: PlayerRow[] = [];
      for (const f of fugitives) {
        const s = sectorOf(f.lng!, f.lat!, BOUNDARY);
        if (s in counts) {
          counts[s]++;
          hit.push(f);
        }
      }
      const decoys = (await c.query(ECO_DECOYS, [gid])).rows;
      for (const d of decoys) if (d.target in counts) counts[d.target]++;
      await c.query("insert into pings (game_id, hunter_id, origin, sectors, expires_at) values ($5, $1, $2, $3, now() + make_interval(secs => $4::int))", [
        player.id, origin, JSON.stringify(counts), def.durationS, gid,
      ]);
      for (const f of hit) await alert(c, f.id, "PINGED", `Radar ping sul tuo settore (${sectorOf(f.lng!, f.lat!, BOUNDARY)}).`);
      const summary = lit.map((s) => `${s}:${counts[s]}`).join(" · ");
      await sysMsg(c, gid, "HUNTERS", `${player.name} · radar da ${origin} → ${summary}`);
      message = `Radar da ${origin}: ${summary}`;
    }

    if (card.code === "SUSSURRO") {
      const visible = (await c.query<PlayerRow>(VISIBLE_FUGITIVES, [gid])).rows.filter((f) => f.pair_id !== player.pair_id);
      if (!visible.length) throw new GameError("Nessun fuggiasco visibile adesso. Riprova tra poco.");
      const f = visible[randomInt(visible.length)];
      const sector = sectorOf(f.lng!, f.lat!, BOUNDARY);
      await sysMsg(c, gid, "HUNTERS", `Il fantasma ${player.name} sussurra: c'è un fuggiasco nel settore ${sector}.`);
      await alert(c, f.id, "REVEALED", `Un fantasma ha rivelato ai cercatori il tuo settore (${sector}). Spostati!`);
      const hunters = (await c.query("select id from players where role = 'HUNTER' and game_id = $1", [gid])).rows.map((r) => r.id as string);
      notify(hunters, "Sussurro dal fantasma", `Un fuggiasco è nel settore ${sector}.`, "whisper");
      message = `Hai rivelato il settore ${sector} ai cercatori.`;
    }

    if (card.code === "TRACCIA") {
      const [ping] = (await c.query("select sectors from pings where hunter_id = $1 order by at desc limit 1", [player.id])).rows;
      if (!ping) throw new GameError("Prima usa un Radar Ping.");
      if (!target || !(target in ping.sectors)) throw new GameError("Scegli un settore illuminato dall'ultimo ping.");
      message = `Traccia su ${target} per 5 minuti.`;
    }

    if (card.code === "GHOST_SHIELD") {
      const [partner] = (await c.query("select id from players where pair_id = $1 and id <> $2", [player.pair_id, player.id])).rows;
      if (partner) await alert(c, partner.id, "INFO", `${player.name} ha attivato Ghost Shield.`);
    }

    await c.query(
      `update cards set activated_at = now(),
              active_until = now() + make_interval(secs => $2),
              cooldown_until = now() + make_interval(secs => $3),
              uses_left = case when uses_left is null then null else uses_left - 1 end,
              target = $4
        where id = $1`,
      [card.id, def.durationS, def.durationS + def.cooldownS, target],
    );
    return { message };
  });
}

/** Active fugitives of game $1 with a recent GPS fix and no Nebbia running. */
const VISIBLE_FUGITIVES = `
  select p.* from players p where p.game_id = $1 and p.role = 'FUGITIVE' and p.status = 'ACTIVE' and not p.spectator
     and p.fix_at > now() - interval '${FRESH_FIX_MS / 1000} seconds'
     and not exists (select 1 from cards k join players m on m.id = k.owner_id
                      where m.pair_id = p.pair_id and k.code = 'NEBBIA' and not k.voided and k.active_until > now())`;

/** Running Eco decoys in game $1. */
const ECO_DECOYS = `
  select k.id, k.target from cards k join players p on p.id = k.owner_id
   where p.game_id = $1 and k.code = 'ECO' and not k.voided and k.active_until > now()`;

/* ---------------- fugitive zones on the hunters' map ---------------- */

export interface Zone { lat: number; lng: number; radiusM: number; ageS: number }

/**
 * One blurred circle per visible fugitive (plus Eco decoys). The random shift is refreshed in SQL at most
 * once per ZONE_REFRESH_S per player, so concurrent polls from several hunters all see the same circle.
 */
export async function hunterZones(g: GameRow): Promise<Zone[]> {
  const round = g.round;
  const ZONE_RADIUS_M = g.zone_radius_m;
  const ZONE_MAX_OFFSET_M = Math.round(g.zone_radius_m * 0.69);
  await q(
    `update players p set
        blur_lat = p.lat + (r.d * cos(r.a)) / 111320.0,
        blur_lng = p.lng + (r.d * sin(r.a)) / (111320.0 * cos(radians(p.lat))),
        blur_at = now()
       from (select id, random() * 2 * pi() as a, sqrt(random()) * $1::float as d from players) r
      where r.id = p.id and p.game_id = $3 and p.role = 'FUGITIVE' and p.status = 'ACTIVE' and p.lat is not null
        and (p.blur_at is null or p.blur_at < now() - make_interval(secs => $2::int))`,
    [ZONE_MAX_OFFSET_M, ZONE_REFRESH_S, g.id],
  );
  const real = (await q<PlayerRow & { blur_lat: number; blur_lng: number }>(VISIBLE_FUGITIVES, [g.id])).filter((f) => f.blur_lat != null);
  const zones: Zone[] = real.map((f) => ({
    lat: f.blur_lat,
    lng: f.blur_lng,
    radiusM: ZONE_RADIUS_M,
    ageS: f.fix_at ? Math.round((Date.now() - +f.fix_at) / 1000) : 0,
  }));
  // Eco decoys: a fake zone somewhere in the chosen sector, moving once a minute like the real ones.
  const decoys = await q<{ id: number; target: string }>(ECO_DECOYS, [g.id]);
  const sectors = sectorPolygons(zoneOf(g.zone).boundary);
  const bucket = Math.floor(Date.now() / (ZONE_REFRESH_S * 1000));
  for (const d of decoys) {
    const sec = sectors.find((x) => x.id === d.target);
    if (!sec) continue;
    const [x0, y1] = sec.ring[0], [x1, y0] = sec.ring[2];
    const r1 = ((d.id * 9301 + bucket * 49297 + round) % 233280) / 233280;
    const r2 = ((d.id * 4096 + bucket * 1013 + round * 7) % 233280) / 233280;
    zones.push({ lat: y0 + (y1 - y0) * (0.2 + 0.6 * r1), lng: x0 + (x1 - x0) * (0.2 + 0.6 * r2), radiusM: ZONE_RADIUS_M, ageS: 20 });
  }
  // Shuffle so the list order never maps back to a player.
  return zones.sort((a, b) => a.lat - b.lat);
}

/* ---------------- missions (photo / video proofs) ---------------- */

/** The flash mission of the current window, if one is running. Deterministic from round and time slot. */
export function flashNow(g: GameRow, now = Date.now()) {
  if (phaseOf(g, now) !== "LIVE" || !g.live_at) return null;
  const elapsed = now - +g.live_at;
  const every = FLASH_EVERY_MIN * 60_000;
  const slot = Math.floor(elapsed / every);
  if (elapsed - slot * every >= FLASH_LEN_MIN * 60_000) return null;
  const missions = missionsFor(g.zone, g.missions_mode);
  const h = (g.round * 7919 + slot * 104729 + g.id * 31) % missions.length;
  return { slot, mission: missions[h], until: new Date(+g.live_at + slot * every + FLASH_LEN_MIN * 60_000) };
}

/** Announces a new flash mission once (first poll that sees it). */
async function announceFlash(g: GameRow) {
  const f = flashNow(g);
  if (!f) return;
  const ins = await q("insert into flash_slots (game_id, round, slot, mission_id) values ($4, $1, $2, $3) on conflict do nothing returning slot", [
    g.round, f.slot, f.mission.id, g.id,
  ]);
  if (!ins.length) return;
  const text = `Missione lampo: "${f.mission.title}" (${f.mission.place}) vale ${FLASH_MULT}× per ${FLASH_LEN_MIN} minuti!`;
  await q("insert into messages (game_id, channel, kind, body) values ($1, 'FUGITIVES', 'SYSTEM', $2)", [g.id, text]);
  const fug = await q<{ id: string }>("select id from players where game_id = $1 and role = 'FUGITIVE' and status = 'ACTIVE'", [g.id]);
  notify(fug.map((r) => r.id), "Missione lampo", text, "flash");
}

export function proofPrefix(round: number, pairId: string, missionId: string) {
  return `r${round}/${pairId}/${missionId}/`;
}

/** Checks done before handing out an upload token. Returns the folder the file must go into. */
export async function checkMissionUpload(me: PlayerRow, missionId: string, lat: number, lng: number, acc: number) {
  const g = await getGame(null, me.game_id);
  const phase = phaseOf(g);
  if (phase !== "LIVE" && phase !== "HEAD_START") throw new GameError("Le missioni sono aperte solo durante la partita.");
  if (me.role !== "FUGITIVE" || me.status !== "ACTIVE" || !me.pair_id || me.spectator) throw new GameError("Solo i fuggiaschi in gioco fanno le missioni.");
  const m = missionsFor(g.zone, g.missions_mode).find((x) => x.id === missionId);
  if (!m) throw new GameError("Missione non trovata.");
  const d = distanceM(lat, lng, m.lat, m.lng);
  if (!Number.isFinite(d) || d > m.radiusM + Math.min(acc || 0, 25)) {
    throw new GameError(`Sei a ${Math.round(d)} m da ${m.place}. La prova va fatta entro ${m.radiusM} m.`);
  }
  const done = await q("select 1 from proofs where mission_id = $1 and pair_id = $2", [m.id, me.pair_id]);
  if (done.length) throw new GameError("La tua coppia ha già completato questa missione.");
  return { mission: m, prefix: proofPrefix(g.round, me.pair_id, m.id) };
}

export async function completeMission(
  me: PlayerRow,
  missionId: string,
  pathname: string,
  meta: { contentType: string; size: number },
  lat: number,
  lng: number,
  acc: number,
) {
  const { mission, prefix } = await checkMissionUpload(me, missionId, lat, lng, acc);
  if (!pathname.startsWith(prefix)) throw new GameError("File caricato nella cartella sbagliata. Riprova.");
  const kind = meta.contentType.startsWith("video/") ? "VIDEO" : meta.contentType.startsWith("image/") ? "PHOTO" : null;
  if (kind !== mission.kind) throw new GameError(mission.kind === "VIDEO" ? "Questa missione vuole un video." : "Questa missione vuole una foto.");

  const g = await getGame(null, me.game_id);
  const flash = flashNow(g)?.mission.id === mission.id;
  const points = flash ? mission.points * FLASH_MULT : mission.points;

  return tx(async (c) => {
    const ins = await c.query(
      `insert into proofs (game_id, mission_id, pair_id, player_id, pathname, kind, content_type, points, flash) values ($9, $1, $2, $3, $4, $5, $6, $7, $8)
       on conflict do nothing returning id`,
      [mission.id, me.pair_id, me.id, pathname, kind, meta.contentType, points, flash, me.game_id],
    );
    if (!ins.rowCount) throw new GameError("La tua coppia ha già completato questa missione.");
    const proofId = Number(ins.rows[0].id);
    await c.query("insert into ledger (game_id, kind, pair_id, pair_delta, ref_id, actor_id) values ($5, 'MISSION', $1, $2, $3, $4)", [
      me.pair_id, points, mission.id, me.id, me.game_id,
    ]);
    await c.query("update pairs set pool = pool + $1, last_gain_at = now() where id = $2", [points, me.pair_id]);
    const [pair] = (await c.query("select name from pairs where id = $1", [me.pair_id])).rows;
    await sysMsg(c, me.game_id, "FUGITIVES", `${pair.name} · "${mission.title}" · +${fmt(points)}${flash ? " (lampo!)" : ""}`, proofId);
    return { message: `+${fmt(points)} alla coppia${flash ? ", missione lampo!" : ""}` };
  });
}

/** Fugitives can watch proofs during the game; everyone can after it ends. Hunters never during play. */
export async function proofForViewer(me: PlayerRow, proofId: number) {
  const [p] = await q<{ pathname: string; content_type: string }>("select pathname, content_type from proofs where id = $1 and game_id = $2", [proofId, me.game_id]);
  if (!p) return null;
  const g = await getGame(null, me.game_id);
  if (phaseOf(g) === "ENDED" || me.role === "FUGITIVE") return p;
  return null;
}

export async function album(me: PlayerRow) {
  const g = await getGame(null, me.game_id);
  if (phaseOf(g) !== "ENDED" && me.role !== "FUGITIVE") return [];
  const list = await q<{ id: number; mission_id: string; kind: string; pair: string; player: string; at: Date; points: number }>(
    `select pr.id::int as id, pr.mission_id, pr.kind, pr.points, pr.at, pa.name as pair, pl.name as player
       from proofs pr join pairs pa on pa.id = pr.pair_id join players pl on pl.id = pr.player_id
      where pr.game_id = $1 order by pr.id`,
    [g.id],
  );
  const missions = zoneOf(g.zone).missions;
  return list.map((p) => ({ ...p, title: missions.find((m) => m.id === p.mission_id)?.title ?? p.mission_id }));
}

/* ---------------- location ---------------- */

export async function reportLocation(player: PlayerRow, lat: number, lng: number, acc: number) {
  const g = await getGame(null, player.game_id);
  const BOUNDARY = zoneOf(g.zone).boundary;
  const phase = phaseOf(g);
  await q("update players set lat = $1, lng = $2, acc_m = $3, fix_at = now() where id = $4", [lat, lng, acc, player.id]);
  if (!player.role || player.status !== "ACTIVE" || player.spectator || (phase !== "LIVE" && phase !== "HEAD_START")) return;

  if (inPolygon(lng, lat, BOUNDARY)) {
    if (player.out_since) await q("update players set out_since = null, out_reported = false where id = $1", [player.id]);
    return;
  }
  if (!player.out_since) {
    await q("update players set out_since = now() where id = $1", [player.id]);
    return;
  }
  if (!player.out_reported && Date.now() - +player.out_since > 60_000) {
    await tx(async (c) => {
      await c.query("update players set out_reported = true where id = $1", [player.id]);
      const sector = sectorOf(lng, lat, BOUNDARY);
      if (player.role === "FUGITIVE") await sysMsg(c, g.id, "HUNTERS", `Fuori confine da oltre 60 s: ${player.name}, vicino al settore ${sector}.`);
      else await sysMsg(c, g.id, "BROADCAST", `Fuori confine da oltre 60 s: ${player.name} (cercatore).`);
    });
  }
}

/* ---------------- chat ---------------- */

type Channel = "HUNTERS" | "FUGITIVES" | "BROADCAST";

/** Team chats are open from the lobby on, so each side can plan before the start. Ghosts join the hunters. */
export function channelsFor(p: PlayerRow, phase: Phase): Channel[] {
  if (p.spectator && phase !== "LOBBY" && phase !== "ENDED") return ["BROADCAST"];
  if (p.role === "HUNTER") return ["HUNTERS", "BROADCAST"];
  if (p.role === "FUGITIVE") return p.status === "ACTIVE" || phase === "LOBBY" ? ["FUGITIVES", "BROADCAST"] : ["HUNTERS", "BROADCAST"];
  return ["BROADCAST"];
}

async function checkWritable(p: PlayerRow, channel: string) {
  const g = await getGame(null, p.game_id);
  const phase = phaseOf(g);
  const writable = channelsFor(p, phase).filter((ch) => ch !== "BROADCAST" || phase === "LOBBY" || phase === "ENDED");
  if (!channelsFor(p, phase).includes(channel as Channel)) throw new GameError("Questa chat è riservata all'altra squadra.");
  if (!writable.includes(channel as Channel)) throw new GameError("Durante la partita il canale Tutti è in sola lettura.");
  return g;
}

const AUDIO_TYPES: Record<string, string> = { "audio/mp4": "m4a", "audio/aac": "aac", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3" };
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

/** Voice message: stored privately in Blob, played back through /api/audio/[id]. */
export async function postAudio(p: PlayerRow, channel: string, bytes: Buffer, contentType: string, ms: number) {
  const base = contentType.split(";")[0].trim().toLowerCase();
  const ext = AUDIO_TYPES[base];
  if (!ext) throw new GameError("Formato audio non supportato.");
  if (!bytes.length) throw new GameError("Audio vuoto.");
  if (bytes.length > MAX_AUDIO_BYTES) throw new GameError("Audio troppo lungo.");
  const g = await checkWritable(p, channel);
  const blob = await putBlob(`audio/g${g.id}/r${g.round}/${randomUUID()}.${ext}`, bytes, { access: "private", contentType: base });
  await q("insert into messages (game_id, channel, sender_id, body, audio_path, audio_ms, audio_type) values ($6, $1, $2, '', $3, $4, $5)", [
    channel, p.id, blob.pathname, Math.max(0, Math.min(61_000, Math.round(ms) || 0)), base, g.id,
  ]);
  await q("update players set typing_at = null where id = $1", [p.id]);
}

export async function audioForViewer(me: PlayerRow, id: number) {
  const [m] = await q<{ channel: string; audio_path: string | null; deleted_at: Date | null }>(
    "select channel, audio_path, deleted_at from messages where id = $1 and game_id = $2",
    [id, me.game_id],
  );
  if (!m?.audio_path || m.deleted_at) return null;
  const g = await getGame(null, me.game_id);
  return channelsFor(me, phaseOf(g)).includes(m.channel as Channel) ? m.audio_path : null;
}

export async function postMessage(p: PlayerRow, channel: string, body: string) {
  const text = body.trim().slice(0, 500);
  if (!text) throw new GameError("Messaggio vuoto.");
  // "Tutti" (broadcast) is open to everyone before and after the game, read-only during it.
  await checkWritable(p, channel);
  await q("insert into messages (game_id, channel, sender_id, body) values ($1, $2, $3, $4)", [p.game_id, channel, p.id, text]);
  await q("update players set typing_at = null where id = $1", [p.id]);
}

/** "Elimina per tutti": your own messages, or anyone's if you're the host. System messages stay. */
export async function deleteMessage(me: PlayerRow, id: number) {
  const [m] = await q<{ sender_id: string | null; kind: string; deleted_at: Date | null; audio_path: string | null }>(
    "select sender_id, kind, deleted_at, audio_path from messages where id = $1 and game_id = $2",
    [id, me.game_id],
  );
  if (!m || m.kind !== "USER") throw new GameError("Messaggio non trovato.");
  if (m.deleted_at) return;
  if (m.sender_id !== me.id) {
    const g = await getGame(null, me.game_id);
    if (g.host_id !== me.id) throw new GameError("Puoi eliminare solo i tuoi messaggi.");
  }
  await q("update messages set deleted_at = now(), body = '', audio_path = null where id = $1", [id]);
  if (m.audio_path) await delBlob(m.audio_path).catch(() => {});
}

/** "Sta scrivendo…": remembered for a few seconds, only shown to people in the same chat. */
export async function setTyping(p: PlayerRow, channel: string, audio = false) {
  const g = await getGame(null, p.game_id);
  if (!channelsFor(p, phaseOf(g)).includes(channel as Channel)) return;
  await q("update players set typing_channel = $1, typing_kind = $2, typing_at = now() where id = $3", [channel, audio ? "audio" : "text", p.id]);
}

/* ---------------- profile photos ---------------- */

const MAX_AVATAR_BYTES = 300 * 1024;

export async function saveAvatar(p: PlayerRow, bytes: Buffer | null) {
  if (bytes) {
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!jpeg) throw new GameError("La foto deve essere un'immagine JPEG.");
    if (bytes.length > MAX_AVATAR_BYTES) throw new GameError("Foto troppo pesante.");
  }
  await q("update players set avatar = $1, avatar_at = $2 where id = $3", [bytes, bytes ? new Date() : null, p.id]);
}

/** Only people in the same game can see a profile photo. */
export async function getAvatar(viewer: PlayerRow, playerId: string) {
  const [r] = await q<{ avatar: Buffer | null }>("select avatar from players where id = $1 and game_id = $2", [playerId, viewer.game_id]);
  return r?.avatar ?? null;
}

/* ---------------- player state ---------------- */

export async function playerState(me: PlayerRow, afterMsg: number) {
  let g = await getGame(null, me.game_id);
  const zone = zoneOf(g.zone);
  const BOUNDARY = zone.boundary;
  g = await ensureFinalized(g);
  const now = Date.now();
  const phase = phaseOf(g, now);
  const live = phase === "LIVE";
  if (live) await announceFlash(g);
  const flash = flashNow(g, now);
  const isHost = g.host_id === me.id;

  const channels = channelsFor(me, phase);
  const [messages, alerts, cardRows, hunters, pairs, roster] = await Promise.all([
    q(
      `select m.id::int as id, m.channel, m.kind, m.body, m.at, m.proof_id::int as proof_id, pr.kind as proof_kind,
              p.name as sender, p.id as sender_id, p.id = $3 as mine, m.deleted_at is not null as deleted,
              m.audio_path is not null as audio, m.audio_ms
         from messages m left join players p on p.id = m.sender_id left join proofs pr on pr.id = m.proof_id
        where m.game_id = $4 and m.channel = any($1) and m.id > $2 order by m.id desc limit 100`,
      [channels, afterMsg, me.id, g.id],
    ),
    q("select id::int as id, kind, body, at from alerts where player_id = $1 and at > now() - interval '10 minutes' order by id desc", [me.id]),
    q<CardRow>("select * from cards where owner_id = $1 order by id", [me.id]),
    hunterTotals(null, g.id),
    pairTable(null, g.id),
    q<{ id: string; name: string; role: Role | null; pair_id: string | null; status: string; avatar_at: Date | null; typing_channel: string | null; typing_at: Date | null; typing_kind: string | null; spectator: boolean; rejoin_code: string; last_seen: Date | null }>(
      "select id, name, role, pair_id, status, avatar_at, typing_channel, typing_at, typing_kind, spectator, rejoin_code, last_seen from players where game_id = $1 order by joined_at",
      [g.id],
    ),
  ]);

  const cards = cardRows.map((c) => ({
    id: c.id,
    code: c.code,
    state: cardState(c, live, CARDS[c.code as CardCode].side === "GHOST" ? me.status === "CAPTURED" : me.status === "ACTIVE", now),
    usesLeft: c.uses_left,
    activeUntil: c.active_until,
    cooldownUntil: c.cooldown_until,
    target: c.target,
  }));

  let winner: { kind: string; name: string } | null = null;
  if (g.winner_kind === "HUNTER") winner = { kind: "HUNTER", name: hunters.find((h) => h.id === g.winner_id)?.name ?? "?" };
  if (g.winner_kind === "PAIR") winner = { kind: "PAIR", name: pairs.find((p) => p.id === g.winner_id)?.name ?? "?" };

  const base = {
    serverNow: now,
    game: {
      code: g.code,
      zone: g.zone,
      zoneName: zone.name,
      round: g.round,
      phase,
      drawn: !!g.drawn_at,
      liveAt: g.live_at,
      endsAt: g.ends_at,
      boundary: BOUNDARY,
      whatsappUrl: WHATSAPP_URL,
      winner,
      headStartMin: g.head_start_min,
      liveMin: g.live_min,
      missionsMode: g.missions_mode,
      pausedAt: g.paused_at,
      options: { live: LIVE_OPTIONS, headStart: HEAD_START_OPTIONS, radius: RADIUS_OPTIONS },
      hostId: g.host_id,
      hostName: roster.find((r) => r.id === g.host_id)?.name ?? null,
      hostStale: hostIsStale((await q<PlayerRow>("select * from players where id = $1", [g.host_id]))[0]),
      captureBounty: CAPTURE_BOUNTY,
      zoneRadiusM: g.zone_radius_m,
    },
    // Host panel: everyone's rejoin code and status.
    hostView: isHost
      ? roster.map((p) => ({ id: p.id, name: p.name, role: p.role, status: p.status, spectator: p.spectator, rejoinCode: p.rejoin_code, lastSeen: p.last_seen }))
      : null,
    me: { id: me.id, name: me.name, role: me.role, status: me.status, pairId: me.pair_id, rejoinCode: me.rejoin_code, spectator: me.spectator },
    avatars: Object.fromEntries(roster.filter((p) => p.avatar_at).map((p) => [p.id, +p.avatar_at!])),
    typing: roster
      .filter((p) => p.id !== me.id && p.typing_at && now - +p.typing_at < 5000 && channels.includes(p.typing_channel as Channel))
      .map((p) => ({ id: p.id, name: p.name, channel: p.typing_channel, audio: p.typing_kind === "audio" })),
    lobby: {
      players: roster.map((p) => ({ id: p.id, name: p.name, role: p.role, pairId: p.pair_id, spectator: p.spectator })),
      pairs: pairs.map((p) => ({ id: p.id, name: p.name, members: roster.filter((r) => r.pair_id === p.id).map((r) => r.name) })),
    },
    cards,
    messages: messages.reverse(),
    channels,
    alerts,
    // Messages already on the phone that were deleted since: the client blanks them out.
    deletedIds: (
      await q<{ id: number }>("select id::int as id from messages where game_id = $2 and channel = any($1) and deleted_at is not null", [channels, g.id])
    ).map((r) => r.id),
    results:
      phase === "ENDED" || (me.spectator && phase !== "LOBBY")
        ? {
            hunters: hunters.map((h) => ({ id: h.id, name: h.name, stolen: h.stolen })),
            pairs: pairs.map((p) => ({ id: p.id, name: p.name, pool: p.pool, active: p.active })).sort((a, b) => b.pool - a.pool),
          }
        : null,
  };

  if (me.spectator && phase !== "LOBBY" && phase !== "ENDED") return base;

  if (me.role === "HUNTER" && phase !== "LOBBY") {
    const fugitives = roster.filter((r) => r.role === "FUGITIVE" && r.pair_id && !r.spectator).sort((a, b) => a.pair_id!.localeCompare(b.pair_id!));
    const pings = await q(
      `select pg.id::int as id, pg.origin, pg.sectors, pg.expires_at, p.name as hunter
         from pings pg join players p on p.id = pg.hunter_id where pg.game_id = $1 and pg.expires_at > now() order by pg.id desc`,
      [g.id],
    );
    const [lastPing] = await q("select sectors from pings where hunter_id = $1 order by at desc limit 1", [me.id]);
    let track: { sector: string; count: number; until: Date } | null = null;
    const tc = cardRows.find((c) => c.code === "TRACCIA" && c.active_until && now < +c.active_until && c.target);
    if (tc) {
      const fs = await q<PlayerRow>(VISIBLE_FUGITIVES, [g.id]);
      const decoys = (await q<{ target: string }>(ECO_DECOYS, [g.id])).filter((d) => d.target === tc.target);
      const count = fs.filter((f) => sectorOf(f.lng!, f.lat!, BOUNDARY) === tc.target).length + decoys.length;
      track = { sector: tc.target!, count, until: tc.active_until! };
    }
    const lock = await lockState(me.id);
    return {
      ...base,
      hunter: {
        stolen: hunters.find((h) => h.id === me.id)?.stolen ?? 0,
        rank: hunters.findIndex((h) => h.id === me.id) + 1,
        hunters: hunters.map((h) => ({ id: h.id, name: h.name, stolen: h.stolen })),
        fugitives: fugitives.map((f) => ({ pairId: f.pair_id!, captured: f.status === "CAPTURED" })),
        pings,
        lastPingSectors: lastPing ? Object.keys(lastPing.sectors) : [],
        track,
        attemptsLeft: lock.attemptsLeft,
        lockedS: lock.lockedS,
        zones: live ? await hunterZones(g) : [],
      },
    };
  }

  if (me.role === "FUGITIVE" && me.pair_id) {
    const pair = pairs.find((p) => p.id === me.pair_id)!;
    const [partner] = await q<PlayerRow>("select * from players where pair_id = $1 and id <> $2", [me.pair_id, me.id]);
    const proofs = await q<{ id: number; mission_id: string }>("select id::int as id, mission_id from proofs where pair_id = $1", [me.pair_id]);
    const missions = missionsFor(g.zone, g.missions_mode).map((m) => ({
      ...m,
      proofId: proofs.find((p) => p.mission_id === m.id)?.id ?? null,
      flashUntil: flash?.mission.id === m.id ? flash.until : null,
      flashPoints: flash?.mission.id === m.id ? m.points * FLASH_MULT : null,
    }));
    const activeMembers = [me, partner].filter((p) => p && p.status === "ACTIVE");
    const share = activeMembers.length ? Math.floor(pair.pool / activeMembers.length) : 0;
    const rem = pair.pool - share * activeMembers.length;
    const shareOf = (p: PlayerRow | undefined) => (p && p.status === "ACTIVE" ? share + (activeMembers[0]?.id === p.id ? rem : 0) : 0);
    let partnerInfo = null;
    if (partner) {
      const both = me.lat != null && partner.lat != null;
      partnerInfo = {
        id: partner.id,
        name: partner.name,
        status: partner.status,
        share: shareOf(partner),
        distanceM: both ? Math.round(distanceM(me.lat!, me.lng!, partner.lat!, partner.lng!)) : null,
        dir: both ? compass(bearing(me.lat!, me.lng!, partner.lat!, partner.lng!)) : null,
        lat: partner.lat,
        lng: partner.lng,
        fixAt: partner.fix_at,
      };
    }
    const alive = pairs.filter((p) => p.active > 0).sort((a, b) => b.pool - a.pool || b.active - a.active);
    return {
      ...base,
      fugitive: {
        password: me.password,
        pair: { id: pair.id, name: pair.name, pool: pair.pool, active: pair.active },
        myShare: shareOf(me),
        partner: partnerInfo,
        missions,
        leader: alive[0] ? { name: alive[0].name, pool: alive[0].pool, isMe: alive[0].id === pair.id } : null,
      },
    };
  }

  return base;
}
