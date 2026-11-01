import type { PoolClient } from "pg";
import { createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { PODIUM_RP, RANKED_MIN_PLAYERS, rankOf } from "./ranks";
import { del as delBlob, put as putBlob } from "@vercel/blob";
import { q, tx } from "./db";
import { CARDS, cardState, KEEP_ON_CAPTURE, ZOMBIE_SHIELD_S, type CardCode, type CardRow } from "./cards";
import {
  BLOOD_MOON_BEFORE_END_MIN, BLOOD_MOON_LEN_MIN, BLOOD_MOON_MULT, BLOOD_MOON_ZONE_FACTOR, GHOST_LINE_COOLDOWN_S, GHOST_LINES, REVEAL_S,
  SHRINK_LAST_MIN, SHRINK_TO, STILL_MIN, STILL_RADIUS_M, TOP_BOUNTY, TREASURE_EVERY_MIN, TREASURE_LEN_MIN, TREASURE_POINTS, TREASURE_RADIUS_M,
  CAPTURE_BOUNTY, ZONE_REFRESH_S, FLASH_EVERY_MIN, FLASH_LEN_MIN, FLASH_MULT, HEAD_START_OPTIONS, HOST_STALE_MIN, LIVE_OPTIONS,
  allMissionsFor, missionsFor, SPECIAL_MISSIONS, type MissionReward, PAIR_NAMES, PASSWORD_WORDS, SOLO_NAME, RADIUS_OPTIONS, SEED_POOL, WHATSAPP_URL, ZONES, zoneOf, type ZoneKey,
} from "./config";
import { notify } from "./push";
import { bearing, compass, distanceM, inPolygon, neighbours, scaleRing, sectorOf, sectorPolygons } from "./geo";

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
  roles_at: Date | null;
  /** Hunters to draw; 0 = automatic (about one in five). */
  hunters_n: number;
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
  away: boolean;
  partner_pick: string | null;
  spectator: boolean;
  profile_id: string | null;
  still_lat: number | null;
  still_lng: number | null;
  still_since: Date | null;
  ghost_line_at: Date | null;
  hidden: boolean;
}

export class GameError extends Error {}

const FRESH_FIX_MS = 10 * 60_000;
const STARTING_HAND: Record<Role, { code: CardCode; uses: number | null }[]> = {
  FUGITIVE: [{ code: "GHOST_SHIELD", uses: 1 }, { code: "NEBBIA", uses: 2 }, { code: "ECO", uses: 1 }, { code: "JUMPSCARE", uses: 1 }],
  HUNTER: [{ code: "RADAR_PING", uses: null }, { code: "TRACCIA", uses: 1 }, { code: "JUMPSCARE", uses: 1 }],
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

/* ---------------- live events on the game clock (frozen while paused) ---------------- */

const clockOf = (g: GameRow, now = Date.now()) => (g.paused_at ? +g.paused_at : now);

/** When the Blood Moon rises and sets, or null if the hunt is too short for one. */
export function bloodMoon(g: GameRow) {
  if (!g.live_at || !g.ends_at) return null;
  const from = +g.ends_at - BLOOD_MOON_BEFORE_END_MIN * 60_000;
  if (from <= +g.live_at) return null;
  return { from, to: from + BLOOD_MOON_LEN_MIN * 60_000 };
}

export function moonOn(g: GameRow, now = Date.now()) {
  const m = bloodMoon(g);
  const t = clockOf(g, now);
  return !!m && phaseOf(g, now) === "LIVE" && t >= m.from && t < m.to;
}

/** The last SHRINK_LAST_MIN minutes of the hunt, when the boundary closes in. */
export function shrinkWindow(g: GameRow) {
  if (!g.live_at || !g.ends_at) return null;
  return { from: Math.max(+g.live_at, +g.ends_at - SHRINK_LAST_MIN * 60_000), to: +g.ends_at };
}

/** The boundary as it is right now: full size, then shrinking towards the centre in the last minutes. */
export function boundaryNow(g: GameRow, now = Date.now()) {
  const base = zoneOf(g.zone).boundary;
  const w = shrinkWindow(g);
  const phase = phaseOf(g, now);
  if (!w || (phase !== "LIVE" && phase !== "PAUSED")) return base;
  const k = Math.min(1, Math.max(0, (clockOf(g, now) - w.from) / (w.to - w.from)));
  return k > 0 ? scaleRing(base, 1 - (1 - SHRINK_TO) * k) : base;
}

/** The treasure of the current window, if one is out. Deterministic from game, round and time slot. */
export function treasureNow(g: GameRow, now = Date.now()) {
  if (phaseOf(g, now) !== "LIVE" || !g.live_at) return null;
  const every = TREASURE_EVERY_MIN * 60_000;
  // The first one comes after a full interval, so the hunt has settled.
  const elapsed = now - +g.live_at - every;
  if (elapsed < 0) return null;
  const slot = Math.floor(elapsed / every);
  const from = +g.live_at + every + slot * every;
  if (now - from >= TREASURE_LEN_MIN * 60_000) return null;
  // Only public places that are still inside the (shrinking) zone when it appears.
  const area = boundaryNow(g, from);
  const spots = zoneOf(g.zone).missions.filter((m) => !m.abandoned && inPolygon(m.lng, m.lat, area));
  if (!spots.length) return null;
  const h = (g.id * 7919 + g.round * 104729 + slot * 15485863) >>> 0;
  const spot = spots[h % spots.length];
  return { slot, lat: spot.lat, lng: spot.lng, place: spot.place, points: TREASURE_POINTS[h % TREASURE_POINTS.length], until: new Date(from + TREASURE_LEN_MIN * 60_000) };
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
    if (res.rowCount) {
      await sysMsg(c, gid, "BROADCAST", "Fine partita. Classifica e album delle prove sono aperti a tutti.");
      await awardRanks(c, gid, w?.kind ?? null);
    }
  });
}

/* ---------------- ranks ---------------- */

/** Links a player to the profile of the phone they play from (created on first use). */
export async function linkProfile(playerId: string, key: unknown, name: string) {
  const id = await profileForKey(key, name);
  if (id) await q("update players set profile_id = $1 where id = $2", [id, playerId]);
}

const keyHash = (key: string) => createHash("sha256").update(key).digest("hex");
const validKey = (key: unknown): key is string => typeof key === "string" && key.length >= 16 && key.length <= 100;

/** The profile a phone's secret key belongs to (created on first use). */
async function profileForKey(key: unknown, name: string) {
  if (!validKey(key)) return null;
  const h = keyHash(key);
  const [k] = await q<{ profile_id: string }>("select profile_id from profile_keys where key_hash = $1", [h]);
  const id = k?.profile_id ?? h;
  await q(
    `insert into profiles (id, name) values ($1, $2)
     on conflict (id) do update set name = case when profiles.username is null then excluded.name else profiles.name end, updated_at = now()`,
    [id, name],
  );
  if (!k) await q("insert into profile_keys (key_hash, profile_id) values ($1, $2) on conflict do nothing", [h, id]);
  return id;
}

function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(pw, salt, 32).toString("hex")}`;
}
function checkPassword(pw: string, stored: string) {
  const [, salt, hash] = stored.split("$");
  const a = scryptSync(pw, Buffer.from(salt, "hex"), 32), b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
const cleanUser = (u: unknown) => {
  const s = String(u ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,20}$/.test(s)) throw new GameError("Nome account: da 3 a 20 caratteri, solo lettere, numeri, punto, trattino.");
  return s;
};
const checkPw = (p: unknown) => {
  const s = String(p ?? "");
  if (s.length < 6 || s.length > 72) throw new GameError("La password deve avere almeno 6 caratteri.");
  return s;
};

/** Protects my rank with a name and password, so it can be recovered on another phone. */
export async function saveAccount(me: PlayerRow, username: unknown, password: unknown, current?: unknown) {
  if (!me.profile_id) throw new GameError("Gioca almeno una partita da questo telefono per avere un rango da salvare.");
  const u = cleanUser(username), pw = checkPw(password);
  const [p] = await q<{ username: string | null; password_hash: string | null }>("select username, password_hash from profiles where id = $1", [me.profile_id]);
  if (p?.password_hash && !(typeof current === "string" && checkPassword(current, p.password_hash))) throw new GameError("Password attuale sbagliata.");
  const [taken] = await q("select 1 from profiles where username = $1 and id <> $2", [u, me.profile_id]);
  if (taken) throw new GameError("Questo nome account è già preso. Scegline un altro.");
  await q("update profiles set username = $1, password_hash = $2, updated_at = now() where id = $3", [u, hashPassword(pw), me.profile_id]);
}

/**
 * Recovers a rank on this phone: checks name and password, then this phone's key points to that profile
 * (and the player in the current game, if any). Five wrong passwords lock the account for 10 minutes.
 */
export async function recoverAccount(key: unknown, username: unknown, password: unknown, playerId?: string | null) {
  if (!validKey(key)) throw new GameError("Telefono non riconosciuto. Ricarica la pagina e riprova.");
  const u = cleanUser(username), pw = String(password ?? "");
  const [p] = await q<{ id: string; password_hash: string | null; locked_until: Date | null; name: string; rp: number }>(
    "select id, password_hash, locked_until, name, rp from profiles where username = $1", [u],
  );
  if (!p || !p.password_hash) throw new GameError("Nome account o password sbagliati.");
  if (p.locked_until && +p.locked_until > Date.now()) throw new GameError("Troppi tentativi sbagliati. Riprova tra qualche minuto.");
  if (!checkPassword(pw, p.password_hash)) {
    await q("update profiles set failed = failed + 1, locked_until = case when failed + 1 >= 5 then now() + interval '10 minutes' else null end where id = $1", [p.id]);
    throw new GameError("Nome account o password sbagliati.");
  }
  await q("update profiles set failed = 0, locked_until = null where id = $1", [p.id]);
  await q(
    "insert into profile_keys (key_hash, profile_id) values ($1, $2) on conflict (key_hash) do update set profile_id = excluded.profile_id, at = now()",
    [keyHash(key), p.id],
  );
  if (playerId) await q("update players set profile_id = $1 where id = $2", [p.id, playerId]);
  return { name: p.name, rank: rankOf(p.rp).name, rp: p.rp };
}

/**
 * At the end of a game: the podium earns rank points. Only real games count — at least RANKED_MIN_PLAYERS
 * players sent GPS positions — and only players who really played. Hunters win: the top 3 hunters by
 * points stolen. Fugitives win: the top 3 pairs, both members.
 */
async function awardRanks(c: Db, gid: number, winner: "HUNTER" | "PAIR" | null) {
  const real = new Set(((await c.query<{ player_id: string }>("select distinct player_id from tracks where game_id = $1", [gid])).rows).map((r) => r.player_id));
  if (real.size < RANKED_MIN_PLAYERS || !winner) return;
  const profiled = new Map(
    (await c.query<{ id: string; profile_id: string }>("select id, profile_id from players where game_id = $1 and profile_id is not null and not spectator", [gid])).rows
      .filter((p) => real.has(p.id))
      .map((p) => [p.id, p.profile_id]),
  );
  for (const pid of new Set(profiled.values())) await c.query("update profiles set games = games + 1, updated_at = now() where id = $1", [pid]);
  const places: string[][] = [];
  if (winner === "HUNTER") {
    for (const h of (await hunterTotals(c, gid)).filter((h) => h.stolen > 0).slice(0, 3)) places.push([h.id]);
  } else {
    const ps = (await pairTable(c, gid)).sort((a, b) => b.pool - a.pool || b.active - a.active).slice(0, 3);
    for (const p of ps) places.push((await c.query<{ id: string }>("select id from players where pair_id = $1", [p.id])).rows.map((r) => r.id));
  }
  for (const [i, ids] of places.entries()) {
    for (const playerId of ids) {
      const prof = profiled.get(playerId);
      if (!prof) continue;
      const { rows } = await c.query<{ rp: number }>(
        "update profiles set rp = rp + $2, podiums = podiums + 1, wins = wins + $3, updated_at = now() where id = $1 returning rp",
        [prof, PODIUM_RP[i], i === 0 ? 1 : 0],
      );
      await c.query("insert into rank_awards (game_id, profile_id, place, rp, rp_after) values ($1, $2, $3, $4, $5) on conflict do nothing", [gid, prof, i + 1, PODIUM_RP[i], rows[0].rp]);
    }
  }
}

export async function hunterTotals(c: Db | null, gid: number) {
  return rows<{ id: string; name: string; ghost: boolean; stolen: number; last_at: Date | null }>(
    c,
    // Hunters, plus ghosts once they've scored a capture.
    `select p.id, p.name, p.role = 'FUGITIVE' as ghost, coalesce(sum(l.hunter_delta), 0)::int as stolen,
            max(l.at) filter (where l.hunter_delta > 0) as last_at
       from players p left join ledger l on l.hunter_id = p.id
      where p.game_id = $1 and not p.spectator and (p.role = 'HUNTER' or (p.role = 'FUGITIVE' and p.status = 'CAPTURED'))
      group by p.id, p.name, p.role
     having p.role = 'HUNTER' or coalesce(sum(l.hunter_delta), 0) > 0
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

/** The pair with the most points while at least two pairs are still in, unless two share the top. */
async function bountyPair(c: Db | null, gid: number) {
  const alive = (await pairTable(c, gid)).filter((p) => p.active > 0).sort((a, b) => b.pool - a.pool);
  if (alive.length < 2 || alive[0].pool === alive[1].pool) return null;
  return alive[0];
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

export async function sysMsg(c: Db, gid: number, channel: string, body: string, proofId: number | null = null) {
  await c.query("insert into messages (game_id, channel, kind, body, proof_id) values ($1, $2, 'SYSTEM', $3, $4)", [gid, channel, body, proofId]);
}

const ALERT_TITLE: Record<string, string> = {
  CAPTURED: "Sei stato catturato",
  PARTNER_DOWN: "Partner catturato",
  PINGED: "Radar ping!",
  REVEALED: "Un fantasma ti ha visto",
  JUMPSCARE: "👁️ C'è qualcuno dietro di te",
  GHOST_LINE: "👻 Una voce nel buio",
  STILL: "Ti hanno visto",
  TREASURE: "💰 Tesoro!",
  INFO: "Night Hunt",
};

/** In-app alert plus push. `pushBody` replaces the text on the lock screen (e.g. not to spoil a jumpscare). */
async function alert(c: Db, playerId: string, kind: string, body: string, pushBody = body) {
  await c.query("insert into alerts (player_id, kind, body) values ($1, $2, $3)", [playerId, kind, body]);
  notify([playerId], ALERT_TITLE[kind] ?? "Night Hunt", pushBody, kind);
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
  await c.query("update game set host_id = (select id from players where game_id = $1 and not hidden order by joined_at limit 1) where id = $1", [gid]);
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
  // Housekeeping: old games and their data go after KEEP_DAYS (see the privacy page).
  await purgeOldGames().catch((e) => console.warn("purge:", e));
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
/** Roles aren't chosen any more: they're drawn by the host in the lobby. */
export function checkPlayer(name: string) {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 20);
  if (clean.length < 2) throw new GameError("Scrivi un nome di almeno 2 lettere.");
  return clean;
}

export async function joinGame(gameCode: string, name: string) {
  const clean = checkPlayer(name);
  const game = await findGameByCode(gameCode);
  const gid = game.id;
  return tx(async (c) => {
    // Joining mid-game makes you a spectator until the next round.
    const phase = phaseOf(await getGame(c, gid));
    const spectator = phase === "HEAD_START" || phase === "LIVE" || phase === "PAUSED";
    const taken = await c.query("select 1 from players where game_id = $1 and name_key = $2", [gid, clean.toLowerCase()]);
    if (taken.rowCount) throw new GameError(`C'è già un giocatore chiamato ${clean}. Se sei tu, rientra con il codice.`);
    if (phase === "LOBBY") await invalidateDraw(c, gid);
    // Roles already drawn: whoever arrives late joins the fugitives (no redraw needed).
    const role = phase === "LOBBY" && (await getGame(c, gid)).roles_at ? "FUGITIVE" : null;
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

/** Hunters to draw for n players: the host's choice, or about one in five (at least 1, always leaving 2 fugitives). */
export function huntersFor(n: number, wanted: number) {
  const auto = Math.max(1, Math.round(n / 5));
  return Math.max(1, Math.min(wanted > 0 ? wanted : auto, n - 2));
}

/** Host draws the roles at random. Partner choices and any drawn pairs start over. */
export async function drawRoles(me: PlayerRow) {
  const gid = me.game_id;
  await tx(async (c) => {
    const g = await requireLobby(c, gid);
    await requireHost(c, me);
    const ps = (await c.query<PlayerRow>("select * from players where game_id = $1 and not spectator and not hidden for update", [gid])).rows;
    if (ps.length < 3) throw new GameError("Servono almeno 3 giocatori: 1 cercatore e 2 fuggiaschi.");
    const n = huntersFor(ps.length, g.hunters_n);
    const hunters = shuffle(ps).slice(0, n);
    await c.query("update players set role = 'FUGITIVE', partner_pick = null, pair_id = null, password = null where game_id = $1 and not spectator and not hidden", [gid]);
    await c.query("update players set role = 'HUNTER' where id = any($1)", [hunters.map((h) => h.id)]);
    await c.query("delete from pairs where game_id = $1", [gid]);
    await c.query("update game set roles_at = now(), drawn_at = null where id = $1", [gid]);
    // Who's hunting stays a secret here: everyone turns over their own card in the lobby.
    await sysMsg(c, gid, "BROADCAST", `Ruoli estratti: ${n === 1 ? "1 cercatore" : `${n} cercatori`}, tutti gli altri scappano. Girate la vostra carta in lobby, poi i fuggiaschi si scelgono il compagno.`);
  });
}

/** A fugitive picks (or clears) the partner they want. Two players who pick each other are a pair. */
export async function pickPartner(me: PlayerRow, partnerId: string | null) {
  await tx(async (c) => {
    const g = await requireLobby(c, me.game_id);
    if (!g.roles_at) throw new GameError("Prima l'organizzatore estrae i ruoli.");
    if (me.role !== "FUGITIVE") throw new GameError("Il compagno lo scelgono solo i fuggiaschi.");
    if (partnerId) {
      if (partnerId === me.id) throw new GameError("Non puoi fare coppia con te stesso.");
      const [p] = (await c.query<PlayerRow>("select * from players where id = $1 and game_id = $2", [partnerId, me.game_id])).rows;
      if (!p || p.role !== "FUGITIVE" || p.spectator) throw new GameError("Puoi scegliere solo un altro fuggiasco.");
    }
    await invalidateDraw(c, me.game_id);
    await c.query("update players set partner_pick = $1 where id = $2", [partnerId, me.id]);
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
export async function updateSettings(me: PlayerRow, b: { liveMin?: number; headStartMin?: number; zoneRadiusM?: number; missionsMode?: string; huntersN?: number }) {
  await tx(async (c) => {
    await requireLobby(c, me.game_id);
    await requireHost(c, me);
    const g = await getGame(c, me.game_id);
    const live = b.liveMin != null && LIVE_OPTIONS.includes(Number(b.liveMin)) ? Number(b.liveMin) : g.live_min;
    const head = b.headStartMin != null && HEAD_START_OPTIONS.includes(Number(b.headStartMin)) ? Number(b.headStartMin) : g.head_start_min;
    const radius = b.zoneRadiusM != null && RADIUS_OPTIONS.includes(Number(b.zoneRadiusM)) ? Number(b.zoneRadiusM) : g.zone_radius_m;
    const mode = b.missionsMode === "abbandonati" || b.missionsMode === "chill" ? b.missionsMode : g.missions_mode;
    const huntersN = b.huntersN != null && Number.isInteger(Number(b.huntersN)) && Number(b.huntersN) >= 0 && Number(b.huntersN) <= 50 ? Number(b.huntersN) : g.hunters_n;
    await c.query("update game set live_min = $1, head_start_min = $2, zone_radius_m = $3, missions_mode = $4, hunters_n = $5 where id = $6", [live, head, radius, mode, huntersN, g.id]);
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
    await c.query(`update players set still_since = still_since + ${shift} where game_id = $1 and still_since is not null`, [g.id]);
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
    if (!(await getGame(c, gid)).roles_at) throw new GameError("Prima estrai i ruoli.");
    if (hunters < 1) throw new GameError("Serve almeno un cercatore: rifai l'estrazione dei ruoli.");
    if (fugitives.length < 2) throw new GameError("Servono almeno 2 fuggiaschi.");

    await c.query("update players set pair_id = null, password = null where game_id = $1", [gid]);
    await c.query("delete from pairs where game_id = $1", [gid]);
    // Pairs that chose each other stay together; everyone else is drawn at random.
    const byId = new Map(fugitives.map((f) => [f.id, f]));
    const chosen: PlayerRow[] = [];
    const taken = new Set<string>();
    for (const f of fugitives) {
      const other = f.partner_pick ? byId.get(f.partner_pick) : undefined;
      if (other && other.partner_pick === f.id && !taken.has(f.id) && !taken.has(other.id)) {
        chosen.push(f, other);
        taken.add(f.id).add(other.id);
      }
    }
    const order = [...chosen, ...shuffle(fugitives.filter((f) => !taken.has(f.id)))];
    const names = shuffle(PAIR_NAMES);
    // No player limit: names get a number once the list runs out, passwords are drawn until unique.
    const nameFor = (i: number) => (i < names.length ? names[i] : `${names[i % names.length]} ${Math.floor(i / names.length) + 1}`);
    const used = new Set<string>();
    const password = () => {
      for (let tries = 0; ; tries++) {
        // Two digits while there's room, then four (16 words x 9000 numbers).
        const pw = PASSWORD_WORDS[randomInt(PASSWORD_WORDS.length)] + String(tries < 50 ? randomInt(10, 100) : randomInt(1000, 10000));
        if (!used.has(pw)) return used.add(pw), pw;
      }
    };
    const lines: string[] = [];
    // Odd count: the last one drawn plays alone and keeps the whole pool.
    const pairCount = Math.ceil(order.length / 2);
    for (let i = 0; i < pairCount; i++) {
      // Pair ids are unique across games, so upload folders and proofs never collide.
      const pid = `G${gid}P${i + 1}`;
      const members = order.slice(i * 2, i * 2 + 2);
      const pname = members.length === 1 ? SOLO_NAME : nameFor(i);
      await c.query("insert into pairs (id, game_id, name) values ($1, $2, $3)", [pid, gid, pname]);
      for (const pl of members) await c.query("update players set pair_id = $1, password = $2 where id = $3", [pid, password(), pl.id]);
      lines.push(`${pname}: ${members.map((m) => m.name).join(" + ")}`);
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
  await c.query("delete from tracks where game_id = $1", [gid]);
  await c.query("delete from sos where game_id = $1", [gid]);
  await c.query("delete from reveals where game_id = $1", [gid]);
  await c.query("delete from treasures where game_id = $1", [gid]);
  await c.query("delete from game_events where game_id = $1", [gid]);
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
    await c.query(
      `update players set status = 'ACTIVE', captured_by = null, captured_at = null, out_since = null, out_reported = false, spectator = false,
              still_lat = null, still_lng = null, still_since = null, ghost_line_at = null where game_id = $1`,
      [gid],
    );
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
    // New round: roles and partners are drawn and chosen again.
    await c.query("update players set role = null, partner_pick = null, pair_id = null, password = null, status = 'ACTIVE', captured_by = null, captured_at = null, spectator = false where game_id = $1", [gid]);
    await c.query("delete from pairs where game_id = $1", [gid]);
    await c.query(
      `update game set round = round + 1, drawn_at = null, roles_at = null, started_at = null, live_at = null, ends_at = null,
              ended_at = null, winner_kind = null, winner_id = null, paused_at = null where id = $1`,
      [gid],
    );
    await sysMsg(c, gid, "BROADCAST", "Si torna in lobby: nuova partita con gli stessi giocatori. Girate la carta quando vengono estratti i ruoli!");
  });
}

/** After a game, a player who isn't the host asks to go back to the lobby. */
export async function askLobby(me: PlayerRow) {
  const g = await getGame(null, me.game_id);
  if (phaseOf(g) !== "ENDED") throw new GameError("La partita non è ancora finita.");
  await tx((c) => sysMsg(c, g.id, "BROADCAST", `${me.name} vuole tornare in lobby per un'altra partita.`));
  if (g.host_id && g.host_id !== me.id) notify([g.host_id], "Un'altra partita?", `${me.name} vuole tornare in lobby. Apri Night Hunt per ricominciare.`, "lobby");
}

/* ---------------- capture ---------------- */

export type CaptureResult =
  | { result: "OK"; stolen: number; targetName: string; pairName: string; partnerActive: boolean; poolLeft: number; bounty: boolean }
  | { result: "WRONG"; attemptsLeft: number }
  | { result: "ALREADY"; targetName: string; capturedBy: string }
  | { result: "SHIELDED"; shieldLeftS: number }
  | { result: "LOCKED"; lockedS: number }
  | { result: "PHASE"; phase: Phase }
  | { result: "PARTNER"; targetName: string };

/** Ghosts (captured fugitives) hunt like the hunters. */
export const isGhost = (p: PlayerRow) => p.role === "FUGITIVE" && p.status === "CAPTURED" && !p.spectator;
export const canCapture = (p: PlayerRow) => (p.role === "HUNTER" || isGhost(p)) && !p.spectator;

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
    // Serialize every capture attempt by the same hunter: without this, a flood of guesses sent in
    // parallel all read the attempt count before any of them commits, so the 5-wrong lock never fires
    // and the (small) password space can be brute-forced in one burst.
    await c.query("select pg_advisory_xact_lock(hashtext($1)::int8)", [hunterId]);
    const { rows: [lk] } = await c.query<{ n: number; first: Date | null }>(
      `select count(*)::int as n, min(at) as first from capture_attempts where hunter_id = $1 and result = 'WRONG' and at > now() - interval '${LOCK_S} seconds'`,
      [hunterId],
    );
    if (lk.n >= MAX_WRONG && lk.first) {
      return { result: "LOCKED", lockedS: Math.max(0, Math.ceil(LOCK_S - (Date.now() - +lk.first) / 1000)) };
    }

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
    // A ghost knows its ex-partner's password: no instant betrayal.
    if (hunter.role === "FUGITIVE" && hunter.pair_id && t.pair_id === hunter.pair_id) {
      await log("PARTNER", t.id);
      return { result: "PARTNER", targetName: t.name };
    }
    const [shield] = (
      await c.query<CardRow>("select * from cards where owner_id = $1 and code = 'GHOST_SHIELD' and not voided and active_until > now()", [t.id])
    ).rows;
    if (shield) {
      await log("SHIELDED", t.id);
      return { result: "SHIELDED", shieldLeftS: Math.ceil((+shield.active_until! - Date.now()) / 1000) };
    }

    const top = await bountyPair(c, gid);
    const [pair] = (await c.query("select * from pairs where id = $1 for update", [t.pair_id])).rows;
    const [{ n }] = (await c.query("select count(*)::int as n from players where pair_id = $1 and status = 'ACTIVE'", [t.pair_id])).rows;
    const stolen = Math.floor(pair.pool / n);
    const bonus = CAPTURE_BOUNTY + (top?.id === pair.id ? TOP_BOUNTY : 0);

    await c.query(
      "insert into ledger (game_id, kind, pair_id, pair_delta, hunter_id, hunter_delta, ref_id, actor_id) values ($6, 'CAPTURE', $1, $2, $3, $4, $5, $3)",
      [pair.id, -stolen, hunterId, stolen + bonus, t.id, gid],
    );
    await c.query("update players set status = 'CAPTURED', captured_by = $1, captured_at = now() where id = $2", [hunterId, t.id]);
    await c.query("update pairs set pool = pool - $1 where id = $2", [stolen, pair.id]);
    await c.query("update cards set voided = true where owner_id = $1 and not (code = any($2))", [t.id, KEEP_ON_CAPTURE]);
    // The captured player comes back as a ghost on the hunters' side, first whisper after 3 minutes.
    await c.query("insert into cards (code, owner_id, uses_left, cooldown_until) values ('SUSSURRO', $1, null, now() + interval '3 minutes')", [t.id]);
    await log("OK", t.id);

    const [hunterRow] = (await c.query("select name from players where id = $1", [hunterId])).rows;
    const by = hunter.role === "HUNTER" ? hunterRow.name : `il fantasma ${hunterRow.name}`;
    const [partner] = (await c.query<PlayerRow>("select * from players where pair_id = $1 and id <> $2", [pair.id, t.id])).rows;
    const partnerActive = partner?.status === "ACTIVE";
    await sysMsg(c, gid, "HUNTERS", `${hunter.role === "HUNTER" ? hunterRow.name : `👻 ${hunterRow.name}`} ha catturato ${t.name} (${pair.name}) · +${fmt(stolen + bonus)}${bonus > CAPTURE_BOUNTY ? " con la taglia 🎯" : ""}. ${t.name} ora è un fantasma dalla vostra parte.`);
    await sysMsg(c, gid, "FUGITIVES", `${t.name} (${pair.name}) è stato catturato${hunter.role === "HUNTER" ? "" : " da un fantasma"}.`);
    await alert(c, t.id, "CAPTURED", `Catturato da ${by}. Ora sei un fantasma: catturi come i cercatori e hai il Sussurro.`);
    if (partner && partnerActive) {
      await alert(c, partner.id, "PARTNER_DOWN", `${t.name} è stato catturato. Il pool (${fmt(pair.pool - stolen)}) ora è tutto tuo.`);
    }
    return { result: "OK", stolen: stolen + bonus, targetName: t.name, pairName: pair.name, partnerActive, poolLeft: pair.pool - stolen, bounty: bonus > CAPTURE_BOUNTY };
  });

  if (out.result === "OK") {
    const [{ n }] = await q<{ n: number }>("select count(*)::int as n from players where game_id = $1 and role = 'FUGITIVE' and status = 'ACTIVE' and not spectator", [gid]);
    if (n === 0) await endGame(gid, new Date());
  }
  return out;
}

/* ---------------- cards ---------------- */

/** Zombie card: a ghost comes back as an active fugitive, new password, short immunity. */
async function rise(c: Db, g: GameRow, player: PlayerRow, card: CardRow) {
  const taken = new Set((await c.query<{ password: string }>("select password from players where game_id = $1 and password is not null", [g.id])).rows.map((r) => r.password));
  let pw = "";
  for (let i = 0; !pw || taken.has(pw); i++) pw = PASSWORD_WORDS[randomInt(PASSWORD_WORDS.length)] + String(i < 50 ? randomInt(10, 100) : randomInt(1000, 10000));
  await c.query("update cards set uses_left = 0, activated_at = now() where id = $1", [card.id]);
  // Ghost-only cards (Sussurro) go; the points stolen as a ghost stay.
  await c.query("update cards set voided = true where owner_id = $1 and code = 'SUSSURRO'", [player.id]);
  await c.query(
    "update players set status = 'ACTIVE', captured_by = null, captured_at = null, password = $1, out_since = null, out_reported = false, still_lat = null, still_lng = null, still_since = now() where id = $2",
    [pw, player.id],
  );
  await c.query(
    "insert into cards (code, owner_id, uses_left, activated_at, active_until) values ('GHOST_SHIELD', $1, 0, now(), now() + make_interval(secs => $2::int))",
    [player.id, ZOMBIE_SHIELD_S],
  );
  const [pair] = (await c.query<{ name: string }>("select name from pairs where id = $1", [player.pair_id])).rows;
  await sysMsg(c, g.id, "HUNTERS", `🧟 ${player.name} è risorto dalla tomba ed è di nuovo un fuggiasco (${pair?.name ?? "?"}). Ha una password nuova.`);
  await sysMsg(c, g.id, "FUGITIVES", `🧟 ${player.name} è risorto! ${pair?.name ?? "La sua coppia"} è di nuovo in gioco.`);
  await sysMsg(c, g.id, "BROADCAST", `🧟 ${player.name} è risorto dalla tomba.`);
  await alert(c, player.id, "INFO", `Sei risorto! Nuova password: ${pw}. Immune per ${ZOMBIE_SHIELD_S / 60} minuti.`);
  return { message: `Sei risorto! Nuova password ${pw}, immune per ${ZOMBIE_SHIELD_S / 60} minuti.` };
}

const REWARD_NAME: Record<MissionReward, string> = { ZOMBIE: "Zombie", GHOST_SHIELD: "Ghost Shield", ECO: "Eco" };

/** Card unlocked by a mission: to the uploader, or to the partner if the uploader already holds an unused Zombie. */
async function grantReward(c: Db, me: PlayerRow, reward: MissionReward) {
  const holds = async (id: string) =>
    !!(await c.query("select 1 from cards where owner_id = $1 and code = 'ZOMBIE' and not voided and uses_left <> 0", [id])).rowCount;
  let to: { id: string; name: string } | null = me;
  if (reward === "ZOMBIE" && (await holds(me.id))) {
    const [partner] = (await c.query<{ id: string; name: string; status: string }>("select id, name, status from players where pair_id = $1 and id <> $2", [me.pair_id, me.id])).rows;
    to = partner && !(await holds(partner.id)) ? partner : null;
  }
  if (!to) return null;
  await c.query("insert into cards (code, owner_id, uses_left) values ($1, $2, 1)", [reward, to.id]);
  await alert(c, to.id, "INFO", `Carta sbloccata: ${REWARD_NAME[reward]}${reward === "ZOMBIE" ? ". Se ti catturano, usala da fantasma per risorgere." : "."}`);
  return { name: REWARD_NAME[reward], to: to.name };
}

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
    if (!eligible) throw new GameError(def.side === "GHOST" ? `${def.name}: si usa solo da fantasma.` : "Sei fuori dal gioco.");
    if (cardState(card, true, true, Date.now()) !== "READY") throw new GameError("Questa carta non è pronta.");
    if (def.needsSector === "ANY" && (!target || !/^C[1-9]$/.test(target))) throw new GameError("Scegli un settore.");

    let message = `${def.name} attiva.`;

    if (card.code === "ZOMBIE") return rise(c, g, player, card);

    if (card.code === "JUMPSCARE") {
      // A random opponent: hunters scare a free fugitive, fugitives scare a hunter.
      const victims = (
        await c.query<{ id: string; name: string }>(
          player.role === "HUNTER"
            ? "select id, name from players where game_id = $1 and role = 'FUGITIVE' and status = 'ACTIVE' and not spectator"
            : "select id, name from players where game_id = $1 and role = 'HUNTER' and not spectator",
          [gid],
        )
      ).rows;
      if (!victims.length) throw new GameError("Non c'è nessuno da spaventare adesso.");
      const v = victims[randomInt(victims.length)];
      await alert(c, v.id, "JUMPSCARE", `Scherzetto di ${player.name}! 🎃`, "Apri Night Hunt. Subito.");
      await sysMsg(c, gid, player.role === "HUNTER" ? "HUNTERS" : "FUGITIVES", `🎃 ${player.name} ha fatto un jumpscare a ${v.name}.`);
      message = `Jumpscare a ${v.name}. Appena guarda il telefono...`;
    }

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
  const ZONE_MAX_OFFSET_M = Math.round(g.zone_radius_m * 0.69);
  // Blood Moon: smaller circles. The offset shrinks with them, so the fugitive is still inside.
  const k = moonOn(g) ? BLOOD_MOON_ZONE_FACTOR : 1;
  const ZONE_RADIUS_M = Math.round(g.zone_radius_m * k);
  // New random offset (metres north/east) once per ZONE_REFRESH_S; the circle itself follows the live fix.
  await q(
    `update players p set
        blur_dy = r.d * cos(r.a),
        blur_dx = r.d * sin(r.a),
        blur_at = now()
       from (select id, random() * 2 * pi() as a, sqrt(random()) * $1::float as d from players) r
      where r.id = p.id and p.game_id = $3 and p.role = 'FUGITIVE' and p.status = 'ACTIVE' and p.lat is not null
        and (p.blur_at is null or p.blur_dx is null or p.blur_at < now() - make_interval(secs => $2::int))`,
    [ZONE_MAX_OFFSET_M, ZONE_REFRESH_S, g.id],
  );
  const real = (await q<PlayerRow & { blur_dx: number | null; blur_dy: number | null }>(VISIBLE_FUGITIVES, [g.id])).filter((f) => f.blur_dx != null && f.lat != null);
  const zones: Zone[] = real.map((f) => ({
    lat: f.lat! + (f.blur_dy! * k) / 111320,
    lng: f.lng! + (f.blur_dx! * k) / (111320 * Math.cos((f.lat! * Math.PI) / 180)),
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
  const m = allMissionsFor(g.zone, g.missions_mode).find((x) => x.id === missionId);
  if (!m) throw new GameError("Missione non trovata.");
  if (![lat, lng].every(Number.isFinite)) throw new GameError("Serve la posizione GPS.");
  if (m.special === "AMBUSH") {
    // A hunter with a fresh fix must really be this close right now.
    const hunters = await q<{ lat: number; lng: number; acc_m: number | null }>(
      `select lat, lng, acc_m from players where game_id = $1 and role = 'HUNTER' and not spectator
          and lat is not null and fix_at > now() - interval '2 minutes'`,
      [me.game_id],
    );
    const nearest = Math.min(...hunters.map((h) => distanceM(lat, lng, h.lat, h.lng) - Math.min(h.acc_m ?? 0, 25)));
    if (!(nearest <= m.radiusM + Math.min(acc || 0, 25))) {
      throw new GameError(
        hunters.length ? `Nessun cercatore entro ${m.radiusM} m da te in questo momento. Avvicinatevi (con prudenza).` : "Nessun cercatore ha un GPS attivo adesso. Riprova tra poco.",
      );
    }
  } else if (m.special === "STREET") {
    if (!inPolygon(lng, lat, zoneOf(g.zone).boundary)) throw new GameError("Questa missione si fa dentro la zona di gioco.");
  } else {
    const d = distanceM(lat, lng, m.lat, m.lng);
    if (!Number.isFinite(d) || d > m.radiusM + Math.min(acc || 0, 25)) {
      throw new GameError(`Sei a ${Math.round(d)} m da ${m.place}. La prova va fatta entro ${m.radiusM} m.`);
    }
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
  const moon = moonOn(g);
  const points = mission.points * (flash ? FLASH_MULT : 1) * (moon ? BLOOD_MOON_MULT : 1);

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
    const card = mission.reward ? await grantReward(c, me, mission.reward) : null;
    const cardNote = card ? ` · 🃏 ${card.name} a ${card.to}` : "";
    await sysMsg(c, me.game_id, "FUGITIVES", `${pair.name} · "${mission.title}" · +${fmt(points)}${flash ? " (lampo!)" : ""}${moon ? " 🩸" : ""}${cardNote}`, proofId);
    return {
      message: `+${fmt(points)} alla coppia${flash ? ", missione lampo!" : ""}${moon ? " Luna di Sangue: punti doppi!" : ""}${card ? ` Carta sbloccata: ${card.name}${card.to === me.name ? "" : ` (a ${card.to})`}.` : mission.reward ? " Avete già una carta Zombie a testa." : ""}`,
    };
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
  const missions = [...zoneOf(g.zone).missions, ...SPECIAL_MISSIONS];
  return list.map((p) => ({ ...p, title: missions.find((m) => m.id === p.mission_id)?.title ?? p.mission_id }));
}

/* ---------------- location ---------------- */

/** A replay point at most every 30 s, or sooner after moving 12 m. */
const TRACK_MIN_M = 12;
const TRACK_MIN_MS = 30_000;

async function recordTrack(p: PlayerRow, lat: number, lng: number) {
  const [last] = await q<{ lat: number; lng: number; at: Date }>(
    "select lat, lng, at from tracks where game_id = $1 and player_id = $2 order by id desc limit 1",
    [p.game_id, p.id],
  );
  if (last && distanceM(last.lat, last.lng, lat, lng) < TRACK_MIN_M && Date.now() - +last.at < TRACK_MIN_MS) return;
  const mode = p.role === "HUNTER" ? "H" : p.status === "CAPTURED" ? "G" : "F";
  await q("insert into tracks (game_id, player_id, mode, lat, lng) values ($1, $2, $3, $4, $5)", [p.game_id, p.id, mode, lat, lng]);
}

/** Everything the end-of-game replay needs: who played, their routes, the captures. Only once the round is over. */
export async function replayOf(me: PlayerRow) {
  const g = await getGame(null, me.game_id);
  if (phaseOf(g) !== "ENDED" || !g.started_at) throw new GameError("Il replay è disponibile a partita finita.");
  const players = await q<{ id: string; name: string; role: Role; pair_id: string | null; pair: string | null }>(
    `select p.id, p.name, p.role, p.pair_id, pr.name as pair
       from players p left join pairs pr on pr.id = p.pair_id
      where p.game_id = $1 and p.role is not null`,
    [g.id],
  );
  const pts = await q<{ player_id: string; mode: string; lat: number; lng: number; t: string }>(
    "select player_id, mode, lat, lng, (extract(epoch from at) * 1000)::bigint as t from tracks where game_id = $1 order by id",
    [g.id],
  );
  const caps = await q<{ victim: string; hunter: string | null; t: string }>(
    "select ref_id as victim, hunter_id as hunter, (extract(epoch from at) * 1000)::bigint as t from ledger where game_id = $1 and kind = 'CAPTURE' order by at",
    [g.id],
  );
  const tracks: Record<string, [number, number, number, string][]> = {};
  for (const p of pts) (tracks[p.player_id] ??= []).push([Number(p.t), p.lat, p.lng, p.mode]);
  return {
    start: +g.started_at,
    live: g.live_at ? +g.live_at : null,
    end: +(g.ended_at ?? g.ends_at ?? new Date()),
    boundary: zoneOf(g.zone).boundary,
    players: players.filter((p) => tracks[p.id]).map((p) => ({ id: p.id, name: p.name, role: p.role, pairId: p.pair_id, pair: p.pair })),
    tracks,
    captures: caps.map((c) => ({ victim: c.victim, hunter: c.hunter, t: Number(c.t) })),
  };
}

/* ---------------- privacy ---------------- */

/** Days a finished game's data is kept (routes, photos, videos, messages, positions). */
export const KEEP_DAYS = 30;

/**
 * "Cancella i miei dati": removes the player and everything they left on the server — position and
 * routes, profile photo, voice messages (files and text are blanked), the mission photos/videos they
 * uploaded, SOS calls, push subscriptions and sessions. Points already won stay with the pair.
 */
export async function deleteMyData(me: PlayerRow) {
  const files = [
    ...(await q<{ p: string }>("select audio_path as p from messages where sender_id = $1 and audio_path is not null", [me.id])),
    ...(await q<{ p: string }>("select pathname as p from proofs where player_id = $1", [me.id])),
  ];
  for (const f of files) await delBlob(f.p).catch(() => {});
  const gid = me.game_id;
  let checkEnd = false;
  await tx(async (c) => {
    const g = await getGame(c, gid);
    const phase = phaseOf(g);
    await c.query("delete from proofs where player_id = $1", [me.id]);
    await c.query("update messages set body = '', audio_path = null, deleted_at = coalesce(deleted_at, now()) where sender_id = $1", [me.id]);
    await c.query("delete from tracks where player_id = $1", [me.id]);
    await c.query("delete from sos where player_id = $1", [me.id]);
    await c.query("delete from reveals where player_id = $1", [me.id]);
    await c.query("update treasures set player_id = null where player_id = $1", [me.id]);
    await c.query("delete from alerts where player_id = $1", [me.id]);
    await c.query("delete from capture_attempts where hunter_id = $1", [me.id]);
    // The rank account too: profile, the phones linked to it, its podium history.
    if (me.profile_id) {
      await c.query("update players set profile_id = null where profile_id = $1", [me.profile_id]);
      await c.query("delete from rank_awards where profile_id = $1", [me.profile_id]);
      await c.query("delete from profile_keys where profile_id = $1", [me.profile_id]);
      await c.query("delete from profiles where id = $1", [me.profile_id]);
    }
    if (phase === "LOBBY") await invalidateDraw(c, gid);
    await c.query("delete from players where id = $1", [me.id]); // sessions, push, cards, groups: cascade
    await sysMsg(c, gid, "BROADCAST", `${me.name} ha lasciato la partita e cancellato i suoi dati.`);
    await ensureHost(c, gid);
    checkEnd = phase === "LIVE" && me.role === "FUGITIVE";
  });
  if (checkEnd) {
    const [{ n }] = await q<{ n: number }>("select count(*)::int as n from players where game_id = $1 and role = 'FUGITIVE' and status = 'ACTIVE' and not spectator", [gid]);
    if (n === 0) await endGame(gid, new Date());
  }
}

/**
 * Deletes games finished more than KEEP_DAYS ago (or abandoned for twice as long) with all their data
 * and files. Runs a few at a time whenever a new game is created.
 */
export async function purgeOldGames(limit = 5) {
  const old = await q<{ id: number }>(
    `select id from game
      where (ended_at is not null and ended_at < now() - make_interval(days => $1))
         or (ended_at is null and created_at < now() - make_interval(days => $1 * 2))
      order by id limit $2`,
    [KEEP_DAYS, limit],
  );
  for (const { id } of old) {
    const files = [
      ...(await q<{ p: string }>("select audio_path as p from messages where game_id = $1 and audio_path is not null", [id])),
      ...(await q<{ p: string }>("select pathname as p from proofs where game_id = $1", [id])),
    ];
    for (const f of files) await delBlob(f.p).catch(() => {});
    await tx(async (c) => {
      const inGame = "(select id from players where game_id = $1)";
      await c.query(`delete from alerts where player_id in ${inGame}`, [id]);
      await c.query(`delete from capture_attempts where hunter_id in ${inGame}`, [id]);
      for (const t of ["tracks", "sos", "pings", "ledger", "proofs", "messages", "flash_slots", "chat_groups", "reveals", "treasures", "game_events"]) await c.query(`delete from ${t} where game_id = $1`, [id]);
      await c.query("delete from game where id = $1", [id]); // players and pairs: cascade
    });
  }
  return old.length;
}

/* ---------------- SOS ---------------- */

/** Someone needs help: everyone is told where they are, and a running game pauses. */
export async function sendSos(me: PlayerRow, lat: number | null, lng: number | null, acc: number | null) {
  if (lat != null && lng != null) await q("update players set lat = $1, lng = $2, acc_m = $3::real, fix_at = now() where id = $4", [lat, lng, acc ?? 0, me.id]);
  await tx(async (c) => {
    const g = await getGame(c, me.game_id);
    const { rows } = await c.query("select id from sos where game_id = $1 and player_id = $2 and resolved_at is null", [g.id, me.id]);
    if (!rows.length) await c.query("insert into sos (game_id, player_id) values ($1, $2)", [g.id, me.id]);
    const phase = phaseOf(g);
    if (phase === "LIVE" || phase === "HEAD_START") await c.query("update game set paused_at = now() where id = $1 and paused_at is null", [g.id]);
    await sysMsg(c, g.id, "BROADCAST", `🆘 SOS da ${me.name}. Partita in pausa: aprite l'avviso per vedere dov'è.`);
  });
  const others = (await q<{ id: string }>("select id from players where game_id = $1 and id <> $2", [me.game_id, me.id])).map((r) => r.id);
  notify(others, `🆘 SOS · ${me.name}`, "Ha bisogno di aiuto. Apri Night Hunt per vedere dov'è.", "sos");
}

export async function sosComing(me: PlayerRow, id: number) {
  const [row] = await q<{ player_id: string; name: string }>(
    `update sos s set responders = array_append(s.responders, $3)
      where s.id = $1 and s.game_id = $2 and s.resolved_at is null and s.player_id <> $4 and not ($3 = any(s.responders))
      returning s.player_id, (select name from players where id = s.player_id) as name`,
    [id, me.game_id, me.name, me.id],
  );
  if (!row) return;
  await tx((c) => sysMsg(c, me.game_id, "BROADCAST", `🏃 ${me.name} sta andando ad aiutare ${row.name}.`));
  notify([row.player_id], "Arriva aiuto", `${me.name} sta venendo da te.`, "sos-help");
}

export async function resolveSos(me: PlayerRow, id: number) {
  const g = await getGame(null, me.game_id);
  const [row] = await q<{ player_id: string }>("select player_id from sos where id = $1 and game_id = $2 and resolved_at is null", [id, g.id]);
  if (!row) return;
  if (row.player_id !== me.id && g.host_id !== me.id) throw new GameError("Può chiudere l'SOS solo chi l'ha mandato o l'organizzatore.");
  const [who] = await q<{ name: string }>("select name from players where id = $1", [row.player_id]);
  await tx(async (c) => {
    await c.query("update sos set resolved_at = now(), resolved_by = $2 where id = $1", [id, me.name]);
    await sysMsg(c, g.id, "BROADCAST", `✅ SOS di ${who?.name ?? "?"} risolto${row.player_id === me.id ? "" : ` da ${me.name}`}. L'organizzatore può far ripartire la partita.`);
  });
  const others = (await q<{ id: string }>("select id from players where game_id = $1 and id <> $2", [g.id, me.id])).map((r) => r.id);
  notify(others, "✅ SOS risolto", `${who?.name ?? "Il giocatore"} sta bene.`, "sos-ok");
}

const ROUGH_FIX_M = 150;

export async function reportLocation(player: PlayerRow, lat: number, lng: number, acc: number) {
  const g = await getGame(null, player.game_id);
  // In the last minutes the line closes in: "out" means out of the boundary as it is now.
  const BOUNDARY = boundaryNow(g);
  const phase = phaseOf(g);
  // A rough network fix never replaces a sharp GPS fix from the last minute (Android sends both).
  await q(
    // Explicit casts: Postgres can't infer the type of $3 inside "$3 / 3" and refuses the query.
    `update players set lat = $1, lng = $2, acc_m = $3::real, fix_at = now()
     where id = $4 and not ($3::real > $5::real and acc_m is not null and acc_m < $3::real / 3 and fix_at > now() - interval '60 seconds')`,
    [lat, lng, acc, player.id, ROUGH_FIX_M],
  );
  // Too rough to say who's over the line (no "fuori confine") or to draw on the replay.
  if (acc > ROUGH_FIX_M) return;
  if (player.role && !player.spectator && (phase === "LIVE" || phase === "HEAD_START")) await recordTrack(player, lat, lng);
  if (!player.role || player.status !== "ACTIVE" || player.spectator || (phase !== "LIVE" && phase !== "HEAD_START")) return;

  if (player.role === "FUGITIVE" && acc <= STILL_RADIUS_M) {
    // Moving away from where they were standing restarts the "still" clock.
    const moved = player.still_lat == null || distanceM(player.still_lat, player.still_lng!, lat, lng) > STILL_RADIUS_M;
    if (moved) await q("update players set still_lat = $1, still_lng = $2, still_since = now() where id = $3", [lat, lng, player.id]);
    if (phase === "LIVE") await takeTreasure(g, player, lat, lng, acc);
  }

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

/** First free fugitive close enough to the treasure of the moment takes it for the pair. */
async function takeTreasure(g: GameRow, player: PlayerRow, lat: number, lng: number, acc: number) {
  const t = treasureNow(g);
  if (!t || !player.pair_id || distanceM(lat, lng, t.lat, t.lng) > TREASURE_RADIUS_M + Math.min(acc, 20)) return;
  const moon = moonOn(g);
  const points = t.points * (moon ? BLOOD_MOON_MULT : 1);
  await tx(async (c) => {
    const ins = await c.query(
      "insert into treasures (game_id, round, slot, pair_id, player_id, points) values ($1, $2, $3, $4, $5, $6) on conflict do nothing",
      [g.id, g.round, t.slot, player.pair_id, player.id, points],
    );
    if (!ins.rowCount) return;
    await c.query("insert into ledger (game_id, kind, pair_id, pair_delta, ref_id, actor_id) values ($1, 'TREASURE', $2, $3, $4, $5)", [
      g.id, player.pair_id, points, `T${t.slot}`, player.id,
    ]);
    await c.query("update pairs set pool = pool + $1, last_gain_at = now() where id = $2", [points, player.pair_id]);
    const [pair] = (await c.query<{ name: string }>("select name from pairs where id = $1", [player.pair_id])).rows;
    await sysMsg(c, g.id, "BROADCAST", `💰 ${player.name} (${pair.name}) ha preso il tesoro di ${t.place} · +${fmt(points)}${moon ? " 🩸" : ""}`);
    await alert(c, player.id, "TREASURE", `Tesoro preso! +${fmt(points)} alla coppia${moon ? " (Luna di Sangue: doppio)" : ""}.`);
  });
}

/**
 * Announces each live event once (the first poll that sees it) and reveals fugitives who stood still
 * too long. Runs on every poll during the hunt; the inserts make it safe with many phones polling.
 */
async function liveEvents(g: GameRow) {
  const now = Date.now();
  const once = async (kind: string) =>
    (await q("insert into game_events (game_id, round, kind) values ($1, $2, $3) on conflict do nothing returning kind", [g.id, g.round, kind])).length > 0;
  const everyone = async () => (await q<{ id: string }>("select id from players where game_id = $1", [g.id])).map((r) => r.id);

  const moon = bloodMoon(g);
  if (moon && moonOn(g, now) && (await once("MOON"))) {
    const text = `🩸 Luna di Sangue! Per ${BLOOD_MOON_LEN_MIN} minuti i cercatori vedono cerchi più piccoli e missioni e tesori valgono doppio.`;
    await q("insert into messages (game_id, channel, kind, body) values ($1, 'BROADCAST', 'SYSTEM', $2)", [g.id, text]);
    notify(await everyone(), "🩸 Luna di Sangue", text, "moon");
  }
  const shrink = shrinkWindow(g);
  if (shrink && now >= shrink.from && (await once("SHRINK"))) {
    const text = `⚠️ La zona si restringe! Negli ultimi ${SHRINK_LAST_MIN} minuti il confine si stringe verso il centro: chi resta fuori più di 60 s viene segnalato.`;
    await q("insert into messages (game_id, channel, kind, body) values ($1, 'BROADCAST', 'SYSTEM', $2)", [g.id, text]);
    notify(await everyone(), "⚠️ La zona si restringe", text, "shrink");
  }
  const t = treasureNow(g, now);
  if (t && (await once(`T${t.slot}`))) {
    const text = `💰 Tesoro apparso a ${t.place}: +${fmt(t.points)} al primo fuggiasco che ci arriva. Sparisce tra ${TREASURE_LEN_MIN} minuti.`;
    await q("insert into messages (game_id, channel, kind, body) values ($1, 'BROADCAST', 'SYSTEM', $2)", [g.id, text]);
    notify(await everyone(), "💰 Tesoro", text, "treasure");
  }

  // Standing still: counted from the start of the hunt, never during Nebbia.
  const still = await q<{ id: string; name: string; lat: number; lng: number }>(
    `update players p set still_since = now()
      where p.game_id = $1 and p.role = 'FUGITIVE' and p.status = 'ACTIVE' and not p.spectator and p.lat is not null
        and greatest(p.still_since, $2::timestamptz) < now() - make_interval(mins => $3::int)
        and not exists (select 1 from cards k join players m on m.id = k.owner_id
                         where m.pair_id = p.pair_id and k.code = 'NEBBIA' and not k.voided and k.active_until > now())
      returning p.id, p.name, coalesce(p.still_lat, p.lat) as lat, coalesce(p.still_lng, p.lng) as lng`,
    [g.id, g.live_at, STILL_MIN],
  );
  if (!still.length) return;
  const BOUNDARY = zoneOf(g.zone).boundary;
  await tx(async (c) => {
    for (const f of still) {
      await c.query("insert into reveals (game_id, player_id, lat, lng, until) values ($1, $2, $3, $4, now() + make_interval(secs => $5::int))", [g.id, f.id, f.lat, f.lng, REVEAL_S]);
      await alert(c, f.id, "STILL", `Sei fermo da ${STILL_MIN} minuti: per ${REVEAL_S} secondi i cercatori vedono dove sei. Muoviti!`);
      await sysMsg(c, g.id, "HUNTERS", `👁️ Un fuggiasco è fermo da ${STILL_MIN} minuti nel settore ${sectorOf(f.lng, f.lat, BOUNDARY)}: è sulla mappa per ${REVEAL_S} secondi!`);
    }
  });
  const hunters = (await q<{ id: string }>("select id from players where game_id = $1 and (role = 'HUNTER' or status = 'CAPTURED')", [g.id])).map((r) => r.id);
  notify(hunters, "👁️ Fuggiasco fermo", `Un fuggiasco fermo da ${STILL_MIN} minuti è sulla mappa. Corri!`, "still");
}

/* ---------------- ghost whispers in the dark ---------------- */

/** A ghost sends one of the preset lines to a random free fugitive (never the ex partner). */
export async function ghostLine(me: PlayerRow, index: number) {
  const g = await getGame(null, me.game_id);
  if (phaseOf(g) !== "LIVE") throw new GameError("Si sussurra solo a caccia aperta.");
  if (!isGhost(me)) throw new GameError("Solo i fantasmi possono sussurrare nel buio.");
  const line = GHOST_LINES[index];
  if (!line) throw new GameError("Frase non valida.");
  return tx(async (c) => {
    const ok = await c.query(
      "update players set ghost_line_at = now() where id = $1 and (ghost_line_at is null or ghost_line_at < now() - make_interval(secs => $2::int))",
      [me.id, GHOST_LINE_COOLDOWN_S],
    );
    if (!ok.rowCount) throw new GameError("Il buio ha bisogno di tempo: riprova tra poco.");
    const victims = (
      await c.query<{ id: string; name: string }>(
        "select id, name from players where game_id = $1 and role = 'FUGITIVE' and status = 'ACTIVE' and not spectator and pair_id is distinct from $2",
        [me.game_id, me.pair_id],
      )
    ).rows;
    if (!victims.length) throw new GameError("Non c'è nessuno da spaventare adesso.");
    const v = victims[randomInt(victims.length)];
    await alert(c, v.id, "GHOST_LINE", line);
    await sysMsg(c, me.game_id, "HUNTERS", `👻 ${me.name} ha sussurrato a ${v.name}: “${line}”`);
    return { message: `Hai sussurrato a ${v.name}: “${line}”` };
  });
}

/* ---------------- phantom (hidden prank watcher) ---------------- */

/**
 * The hidden phantom makes a full-screen horror apparition (the existing jumpscare) pop up on one chosen
 * player's phone, with a message it writes. Only a hidden player can do this, only within its own game.
 */
export async function sendScare(me: PlayerRow, targetId: string, text: string) {
  if (!me.hidden) throw new GameError("Azione non disponibile.");
  const [t] = await q<{ id: string; name: string }>("select id, name from players where id = $1 and game_id = $2 and not hidden", [targetId, me.game_id]);
  if (!t) throw new GameError("Bersaglio non trovato.");
  const clean = String(text ?? "").trim().replace(/\s+/g, " ").slice(0, 140) || "TI HO TROVATO.";
  await tx((c) => alert(c, t.id, "JUMPSCARE", clean, "Apri Night Hunt. Subito."));
  return { ok: true, name: t.name };
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

/* ---------------- group chats: anyone in the game, picked by whoever creates the group ---------------- */

const isGroup = (channel: string) => /^G\d+$/.test(channel);
const groupId = (channel: string) => Number(channel.slice(1));
const MAX_GROUP_NAME = 30;

async function myGroups(p: PlayerRow) {
  return q<{ id: number; name: string; created_by: string | null }>(
    `select g.id::int as id, g.name, g.created_by from chat_groups g join chat_group_members m on m.group_id = g.id
      where m.player_id = $1 and g.game_id = $2 order by g.id`,
    [p.id, p.game_id],
  );
}

/** Team chats the role allows, plus every group this player is in. */
export async function readableChannels(p: PlayerRow, phase: Phase): Promise<string[]> {
  return [...channelsFor(p, phase), ...(await myGroups(p)).map((g) => `G${g.id}`)];
}

async function groupPlayers(gid: number, ids: unknown): Promise<PlayerRow[]> {
  const list = Array.isArray(ids) ? [...new Set(ids.map(String))] : [];
  if (!list.length) return [];
  return q<PlayerRow>("select * from players where game_id = $1 and id = any($2)", [gid, list]);
}

export async function createGroup(me: PlayerRow, rawName: string, memberIds: unknown) {
  const name = Array.from(String(rawName ?? "").trim().replace(/\s+/g, " ")).slice(0, MAX_GROUP_NAME).join("");
  if (!name) throw new GameError("Dai un nome al gruppo.");
  const others = (await groupPlayers(me.game_id, memberIds)).filter((x) => x.id !== me.id);
  if (!others.length) throw new GameError("Scegli almeno una persona.");
  return tx(async (c) => {
    const [grp] = (await c.query<{ id: string }>("insert into chat_groups (game_id, name, created_by) values ($1, $2, $3) returning id", [me.game_id, name, me.id])).rows;
    for (const m of [me, ...others]) await c.query("insert into chat_group_members (group_id, player_id) values ($1, $2) on conflict do nothing", [grp.id, m.id]);
    await sysMsg(c, me.game_id, `G${grp.id}`, `${me.name} ha creato il gruppo con ${others.map((o) => o.name).join(", ")}.`);
    return { channel: `G${grp.id}` };
  });
}

/** Outside a transaction pass null. */
async function requireMember(c: Db | null, me: PlayerRow, channel: string) {
  if (!isGroup(channel)) throw new GameError("Gruppo non trovato.");
  const sql = "select 1 from chat_group_members m join chat_groups g on g.id = m.group_id where m.group_id = $1 and m.player_id = $2 and g.game_id = $3";
  const args = [groupId(channel), me.id, me.game_id];
  const found = c ? (await c.query(sql, args)).rowCount : (await q(sql, args)).length;
  if (!found) throw new GameError("Non fai parte di questo gruppo.");
}

export async function addToGroup(me: PlayerRow, channel: string, memberIds: unknown) {
  const add = await groupPlayers(me.game_id, memberIds);
  if (!add.length) throw new GameError("Scegli almeno una persona.");
  await tx(async (c) => {
    await requireMember(c, me, channel);
    const added: string[] = [];
    for (const m of add) {
      const r = await c.query("insert into chat_group_members (group_id, player_id) values ($1, $2) on conflict do nothing", [groupId(channel), m.id]);
      if (r.rowCount) added.push(m.name);
    }
    if (added.length) await sysMsg(c, me.game_id, channel, `${me.name} ha aggiunto ${added.join(", ")}.`);
  });
}

export async function leaveGroup(me: PlayerRow, channel: string) {
  await tx(async (c) => {
    await requireMember(c, me, channel);
    await c.query("delete from chat_group_members where group_id = $1 and player_id = $2", [groupId(channel), me.id]);
    const { rowCount } = await c.query("select 1 from chat_group_members where group_id = $1", [groupId(channel)]);
    if (rowCount) await sysMsg(c, me.game_id, channel, `${me.name} ha lasciato il gruppo.`);
    else {
      await c.query("delete from messages where game_id = $1 and channel = $2", [me.game_id, channel]);
      await c.query("delete from chat_groups where id = $1", [groupId(channel)]);
    }
  });
}

async function checkWritable(p: PlayerRow, channel: string) {
  const g = await getGame(null, p.game_id);
  if (isGroup(channel)) {
    await requireMember(null, p, channel);
    return g;
  }
  const phase = phaseOf(g);
  const writable = channelsFor(p, phase).filter((ch) => ch !== "BROADCAST" || phase === "LOBBY" || phase === "ENDED");
  if (!channelsFor(p, phase).includes(channel as Channel)) throw new GameError("Questa chat è riservata all'altra squadra.");
  if (!writable.includes(channel as Channel)) throw new GameError("Durante la partita il canale Tutti è in sola lettura.");
  return g;
}

const CHAT_LABEL: Record<Channel, string> = { HUNTERS: "Cercatori", FUGITIVES: "Fuggiaschi", BROADCAST: "Tutti" };
// The app polls only while it's on screen and sends a beacon when it leaves it,
// so "not away and seen in the last few seconds" means the chat is in front of them.
const ON_SCREEN_MS = 8_000;

/** Push for a new chat message to everyone who can read that chat and isn't looking at the app right now. */
async function notifyChat(g: GameRow, sender: PlayerRow, channel: string, preview: string) {
  const phase = phaseOf(g);
  const group = isGroup(channel);
  const rows = group
    ? await q<PlayerRow>(
        "select p.* from players p join chat_group_members m on m.player_id = p.id where m.group_id = $1 and p.id <> $2",
        [groupId(channel), sender.id],
      )
    : await q<PlayerRow>("select * from players where game_id = $1 and id <> $2", [g.id, sender.id]);
  const label = group
    ? (await q<{ name: string }>("select name from chat_groups where id = $1", [groupId(channel)]))[0]?.name ?? "Gruppo"
    : CHAT_LABEL[channel as Channel] ?? "Chat";
  const to = rows
    .filter((r) => group || channelsFor(r, phase).includes(channel as Channel))
    .filter((r) => r.away || !r.last_seen || Date.now() - +r.last_seen > ON_SCREEN_MS)
    .map((r) => r.id);
  notify(to, `${sender.name} · ${label}`, preview, `chat-${channel}`);
}

const AUDIO_TYPES: Record<string, string> = { "audio/mp4": "m4a", "audio/aac": "aac", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3" };
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

/** Voice message: stored privately in Blob, played back through /api/audio/[id]. */
/** Voice message. `radio` marks a push-to-talk message and the voice effect it's played back with. */
export async function postAudio(p: PlayerRow, channel: string, bytes: Buffer, contentType: string, ms: number, radio: string | null = null) {
  const fx = radio === "police" || radio === "ghost" ? radio : null;
  const base = contentType.split(";")[0].trim().toLowerCase();
  const ext = AUDIO_TYPES[base];
  if (!ext) throw new GameError("Formato audio non supportato.");
  if (!bytes.length) throw new GameError("Audio vuoto.");
  if (bytes.length > MAX_AUDIO_BYTES) throw new GameError("Audio troppo lungo.");
  const g = await checkWritable(p, channel);
  const blob = await putBlob(`audio/g${g.id}/r${g.round}/${randomUUID()}.${ext}`, bytes, { access: "private", contentType: base });
  await q("insert into messages (game_id, channel, sender_id, body, audio_path, audio_ms, audio_type, radio) values ($6, $1, $2, '', $3, $4, $5, $7)", [
    channel, p.id, blob.pathname, Math.max(0, Math.min(61_000, Math.round(ms) || 0)), base, g.id, fx,
  ]);
  await q("update players set typing_at = null where id = $1", [p.id]);
  await notifyChat(g, p, channel, fx ? "📻 Messaggio radio" : "🎤 Messaggio vocale");
}

export async function audioForViewer(me: PlayerRow, id: number) {
  const [m] = await q<{ channel: string; audio_path: string | null; deleted_at: Date | null }>(
    "select channel, audio_path, deleted_at from messages where id = $1 and game_id = $2",
    [id, me.game_id],
  );
  if (!m?.audio_path || m.deleted_at) return null;
  const g = await getGame(null, me.game_id);
  return (await readableChannels(me, phaseOf(g))).includes(m.channel) ? m.audio_path : null;
}

export async function postMessage(p: PlayerRow, channel: string, body: string) {
  const text = body.trim().slice(0, 500);
  if (!text) throw new GameError("Messaggio vuoto.");
  // "Tutti" (broadcast) is open to everyone before and after the game, read-only during it.
  const g = await checkWritable(p, channel);
  await q("insert into messages (game_id, channel, sender_id, body) values ($1, $2, $3, $4)", [p.game_id, channel, p.id, text]);
  await q("update players set typing_at = null where id = $1", [p.id]);
  await notifyChat(g, p, channel, text.length > 140 ? `${text.slice(0, 140)}…` : text);
}

/** "Elimina per tutti": your own messages, or anyone's if you're the host. System messages stay. */
export async function deleteMessage(me: PlayerRow, id: number) {
  const [m] = await q<{ sender_id: string | null; kind: string; deleted_at: Date | null; audio_path: string | null; channel: string }>(
    "select sender_id, kind, deleted_at, audio_path, channel from messages where id = $1 and game_id = $2",
    [id, me.game_id],
  );
  if (!m || m.kind !== "USER") throw new GameError("Messaggio non trovato.");
  // Group chats are private, the host included.
  if (isGroup(m.channel)) await requireMember(null, me, m.channel);
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
  if (!(await readableChannels(p, phaseOf(g))).includes(channel)) return;
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

/**
 * End-of-game standings. General: everyone individually — hunters by points stolen; fugitives by
 * their share of the pair pool at the end (0 once captured, it was stolen) plus what they stole as ghosts.
 * Categories: hunters (born hunters only), ghosts, missions per player. Pairs are in results.pairs.
 */
async function standingsOf(g: GameRow) {
  const [players, pools, proofs] = await Promise.all([
    q<{ id: string; name: string; role: Role; status: string; pair_id: string | null; stolen: number }>(
      `select p.id, p.name, p.role, p.status, p.pair_id,
              coalesce((select sum(l.hunter_delta) from ledger l where l.hunter_id = p.id and l.game_id = p.game_id), 0)::int as stolen
         from players p where p.game_id = $1 and not p.spectator and p.role is not null order by p.joined_at`,
      [g.id],
    ),
    q<{ id: string; name: string; pool: number }>("select id, name, pool from pairs where game_id = $1", [g.id]),
    q<{ player_id: string; n: number; pts: number }>(
      "select player_id, count(*)::int as n, coalesce(sum(points), 0)::int as pts from proofs where game_id = $1 group by player_id",
      [g.id],
    ),
  ]);
  const pairOf = new Map(pools.map((p) => [p.id, p]));
  // Split each pool among the members still free; the odd point goes to the first of them.
  const share = new Map<string, number>();
  for (const pr of pools) {
    const free = players.filter((p) => p.pair_id === pr.id && p.status === "ACTIVE");
    const each = free.length ? Math.floor(pr.pool / free.length) : 0;
    free.forEach((p, i) => share.set(p.id, each + (i === 0 ? pr.pool - each * free.length : 0)));
  }
  const sortDesc = <T extends { points: number; name: string }>(xs: T[]) => xs.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const general = sortDesc(
    players.map((p) => {
      const ghost = p.role === "FUGITIVE" && p.status === "CAPTURED";
      const quota = share.get(p.id) ?? 0;
      return {
        id: p.id, name: p.name, role: p.role, ghost,
        points: p.role === "HUNTER" ? p.stolen : quota + p.stolen,
        detail: p.role === "HUNTER" ? "cercatore" : ghost ? (p.stolen ? `fantasma · ${fmt(p.stolen)} rubati` : "fantasma") : `in fuga · quota ${fmt(quota)}`,
      };
    }),
  );
  const hunters = sortDesc(players.filter((p) => p.role === "HUNTER").map((p) => ({ id: p.id, name: p.name, points: p.stolen })));
  const ghosts = sortDesc(
    players
      .filter((p) => p.role === "FUGITIVE" && p.status === "CAPTURED")
      .map((p) => ({ id: p.id, name: p.name, points: p.stolen, detail: pairOf.get(p.pair_id ?? "")?.name ?? "" })),
  );
  const missions = players
    .filter((p) => p.role === "FUGITIVE")
    .map((p) => {
      const pr = proofs.find((x) => x.player_id === p.id);
      return { id: p.id, name: p.name, count: pr?.n ?? 0, points: pr?.pts ?? 0, detail: pairOf.get(p.pair_id ?? "")?.name ?? "" };
    })
    .sort((a, b) => b.count - a.count || b.points - a.points || a.name.localeCompare(b.name));
  return { general, hunters, ghosts, missions };
}

/** Graveyard for the final screen: everyone captured this round, with the points their pair lost and who took them. */
async function fallenOf(g: GameRow) {
  const rows = await q<{ id: string; name: string; pair: string | null; lost: number; by: string | null; at: Date; status: string }>(
    `select p.id, p.name, p.status, pr.name as pair, -l.pair_delta as lost, h.name as by, l.at
       from ledger l
       join players p on p.id = l.ref_id
       left join pairs pr on pr.id = l.pair_id
       left join players h on h.id = l.hunter_id
      where l.game_id = $1 and l.kind = 'CAPTURE' and l.at >= coalesce($2, 'epoch'::timestamptz)
      order by l.at`,
    [g.id, g.started_at],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, pair: r.pair ?? "", lost: r.lost, by: r.by ?? "?", at: r.at.toISOString(), risen: r.status === "ACTIVE" }));
}

export async function playerState(me: PlayerRow, afterMsg: number) {
  let g = await getGame(null, me.game_id);
  const zone = zoneOf(g.zone);
  const BOUNDARY = zone.boundary;
  g = await ensureFinalized(g);
  const now = Date.now();
  const phase = phaseOf(g, now);
  const live = phase === "LIVE";
  if (live) {
    await announceFlash(g);
    await liveEvents(g);
  }
  const flash = flashNow(g, now);
  const isHost = g.host_id === me.id;

  const groups = await myGroups(me);
  const channels = [...channelsFor(me, phase), ...groups.map((x) => `G${x.id}`)];
  const groupMembers = groups.length
    ? await q<{ group_id: number; id: string; name: string }>(
        "select m.group_id::int as group_id, p.id, p.name from chat_group_members m join players p on p.id = m.player_id where m.group_id = any($1) order by m.added_at",
        [groups.map((x) => x.id)],
      )
    : [];
  const treasure = treasureNow(g, now);
  const treasureTaken = treasure
    ? (await q<{ name: string }>("select pr.name from treasures t join pairs pr on pr.id = t.pair_id where t.game_id = $1 and t.round = $2 and t.slot = $3", [g.id, g.round, treasure.slot]))[0]?.name ?? null
    : null;
  const [messages, alerts, cardRows, hunters, pairs, roster] = await Promise.all([
    q(
      `select m.id::int as id, m.channel, m.kind, m.body, m.at, m.proof_id::int as proof_id, pr.kind as proof_kind,
              p.name as sender, p.id as sender_id, p.id = $3 as mine, m.deleted_at is not null as deleted,
              m.audio_path is not null as audio, m.audio_ms, m.radio
         from messages m left join players p on p.id = m.sender_id left join proofs pr on pr.id = m.proof_id
        where m.game_id = $4 and m.channel = any($1) and m.id > $2 order by m.id desc limit 100`,
      [channels, afterMsg, me.id, g.id],
    ),
    q("select id::int as id, kind, body, at from alerts where player_id = $1 and at > now() - interval '10 minutes' order by id desc", [me.id]),
    q<CardRow>("select * from cards where owner_id = $1 order by id", [me.id]),
    hunterTotals(null, g.id),
    pairTable(null, g.id),
    q<{ id: string; name: string; role: Role | null; pair_id: string | null; status: string; avatar_at: Date | null; typing_channel: string | null; typing_at: Date | null; typing_kind: string | null; spectator: boolean; rejoin_code: string; last_seen: Date | null; partner_pick: string | null; profile_id: string | null }>(
      // Hidden phantoms never appear in any roster, lobby list, host view or standings.
      "select id, name, role, pair_id, status, avatar_at, typing_channel, typing_at, typing_kind, spectator, rejoin_code, last_seen, partner_pick, profile_id from players where game_id = $1 and not hidden order by joined_at",
      [g.id],
    ),
  ]);

  const cards = cardRows.map((c) => ({
    id: c.id,
    code: c.code,
    // A Zombie held while still free is waiting, not spent: it's for after a capture.
    state:
      c.code === "ZOMBIE" && me.status === "ACTIVE" && !c.voided && c.uses_left !== 0
        ? ("LOCKED" as const)
        : cardState(c, live, CARDS[c.code as CardCode].side === "GHOST" ? me.status === "CAPTURED" : me.status === "ACTIVE", now),
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
      rolesDrawn: !!g.roles_at,
      huntersN: g.hunters_n,
      huntersPlanned: huntersFor(roster.filter((r) => !r.spectator).length, g.hunters_n),
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
      // Live events: times in ms on the server clock (the app corrects with serverNow).
      moon: (() => {
        const m = bloodMoon(g);
        return m ? { ...m, on: moonOn(g, now), mult: BLOOD_MOON_MULT } : null;
      })(),
      shrink: shrinkWindow(g),
      boundaryNow: boundaryNow(g, now),
      bounty: (() => {
        if (!live) return null;
        const alive = pairs.filter((p) => p.active > 0).sort((a, b) => b.pool - a.pool);
        if (alive.length < 2 || alive[0].pool === alive[1].pool) return null;
        return { pairId: alive[0].id, name: alive[0].name, points: TOP_BOUNTY };
      })(),
      treasure: treasure && !treasureTaken ? { lat: treasure.lat, lng: treasure.lng, place: treasure.place, points: treasure.points, until: treasure.until } : null,
    },
    // Host panel: everyone's rejoin code and status.
    hostView: isHost
      ? roster.map((p) => ({ id: p.id, name: p.name, role: p.role, status: p.status, spectator: p.spectator, rejoinCode: p.rejoin_code, lastSeen: p.last_seen }))
      : null,
    me: { id: me.id, name: me.name, role: me.role, status: me.status, pairId: me.pair_id, rejoinCode: me.rejoin_code, spectator: me.spectator },
    // Rank of my phone's profile, and what this game gave me.
    rank: await (async () => {
      if (!me.profile_id) return null;
      const [p] = await q<{ rp: number; games: number; podiums: number; wins: number; username: string | null }>("select rp, games, podiums, wins, username from profiles where id = $1", [me.profile_id]);
      if (!p) return null;
      const [award] = await q<{ place: number; rp: number; rp_after: number }>("select place, rp, rp_after from rank_awards where game_id = $1 and profile_id = $2", [g.id, me.profile_id]);
      return { ...rankOf(p.rp), games: p.games, podiums: p.podiums, wins: p.wins, account: p.username, award: award ? { place: award.place, rp: award.rp, before: rankOf(award.rp_after - award.rp).name } : null };
    })(),
    // Open SOS calls, with the live position of whoever sent them.
    sos: (
      await q<{ id: string; player_id: string; name: string; lat: number | null; lng: number | null; acc_m: number | null; fix_at: Date | null; at: Date; responders: string[] }>(
        `select s.id, s.player_id, p.name, p.lat, p.lng, p.acc_m, p.fix_at, s.at, s.responders
           from sos s join players p on p.id = s.player_id
          where s.game_id = $1 and s.resolved_at is null order by s.at`,
        [g.id],
      )
    ).map((r) => ({ id: Number(r.id), playerId: r.player_id, name: r.name, lat: r.lat, lng: r.lng, acc: r.acc_m, fixAt: r.fix_at, at: r.at, responders: r.responders, mine: r.player_id === me.id })),
    avatars: Object.fromEntries(roster.filter((p) => p.avatar_at).map((p) => [p.id, +p.avatar_at!])),
    typing: roster
      .filter((p) => p.id !== me.id && p.typing_at && now - +p.typing_at < 5000 && channels.includes(p.typing_channel ?? ""))
      .map((p) => ({ id: p.id, name: p.name, channel: p.typing_channel, audio: p.typing_kind === "audio" })),
    lobby: {
      players: await (async () => {
        const ids = roster.map((p) => p.profile_id).filter(Boolean);
        const rp = new Map((await q<{ id: string; rp: number }>("select id, rp from profiles where id = any($1)", [ids])).map((r) => [r.id, r.rp]));
        return roster.map((p) => ({ id: p.id, name: p.name, role: p.role, pairId: p.pair_id, spectator: p.spectator, partnerPick: p.partner_pick, rank: rankOf(rp.get(p.profile_id ?? "") ?? 0).index }));
      })(),
      pairs: pairs.map((p) => ({ id: p.id, name: p.name, members: roster.filter((r) => r.pair_id === p.id).map((r) => r.name) })),
    },
    cards,
    messages: messages.reverse(),
    channels,
    groups: groups.map((x) => ({
      channel: `G${x.id}`,
      name: x.name,
      createdBy: x.created_by,
      members: groupMembers.filter((m) => m.group_id === x.id).map((m) => ({ id: m.id, name: m.name })),
    })),
    alerts,
    // Messages already on the phone that were deleted since: the client blanks them out.
    deletedIds: (
      await q<{ id: number }>("select id::int as id from messages where game_id = $2 and channel = any($1) and deleted_at is not null", [channels, g.id])
    ).map((r) => r.id),
    results:
      phase === "ENDED" || (me.spectator && phase !== "LOBBY")
        ? {
            fallen: await fallenOf(g),
            standings: await standingsOf(g),
            hunters: hunters.map((h) => ({ id: h.id, name: h.name, stolen: h.stolen, ghost: h.ghost })),
            pairs: pairs
              .map((p) => ({ id: p.id, name: p.name, pool: p.pool, active: p.active, members: roster.filter((r) => r.pair_id === p.id).map((r) => ({ id: r.id, name: r.name })) }))
              .sort((a, b) => b.pool - a.pool),
          }
        : null,
  };

  // The hidden phantom: its own all-seeing view. Everyone else's position, live, with names.
  if (me.hidden) {
    const people = await q<{ id: string; name: string; role: Role | null; status: string; lat: number | null; lng: number | null; acc_m: number | null; fix_at: Date | null }>(
      "select id, name, role, status, lat, lng, acc_m, fix_at from players where game_id = $1 and not hidden and lat is not null order by name",
      [g.id],
    );
    return {
      ...base,
      phantom: {
        phase,
        boundary: boundaryNow(g, now),
        people: people.map((p) => ({
          id: p.id, name: p.name, role: p.role, status: p.status,
          lat: p.lat, lng: p.lng, acc: p.acc_m, fixAt: p.fix_at,
        })),
      },
    };
  }

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
        hunters: hunters.map((h) => ({ id: h.id, name: h.name, stolen: h.stolen, ghost: h.ghost })),
        fugitives: fugitives.map((f) => ({ pairId: f.pair_id!, captured: f.status === "CAPTURED" })),
        pings,
        lastPingSectors: lastPing ? Object.keys(lastPing.sectors) : [],
        track,
        attemptsLeft: lock.attemptsLeft,
        lockedS: lock.lockedS,
        zones: live ? await hunterZones(g) : [],
        // Fugitives who stood still too long, for a few seconds at their exact spot.
        reveals: live
          ? await q<{ lat: number; lng: number; until: Date }>("select lat, lng, until from reveals where game_id = $1 and until > now() order by id", [g.id])
          : [],
      },
    };
  }

  if (me.role === "FUGITIVE" && me.pair_id) {
    const pair = pairs.find((p) => p.id === me.pair_id)!;
    const [partner] = await q<PlayerRow>("select * from players where pair_id = $1 and id <> $2", [me.pair_id, me.id]);
    const proofs = await q<{ id: number; mission_id: string }>("select id::int as id, mission_id from proofs where pair_id = $1", [me.pair_id]);
    const missions = allMissionsFor(g.zone, g.missions_mode).map((m) => ({
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
      ghostCapture: isGhost(me)
        ? {
            ...(await lockState(me.id)),
            stolen: hunters.find((h) => h.id === me.id)?.stolen ?? 0,
            lines: GHOST_LINES,
            lineAt: me.ghost_line_at ? new Date(+me.ghost_line_at + GHOST_LINE_COOLDOWN_S * 1000) : null,
          }
        : null,
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
