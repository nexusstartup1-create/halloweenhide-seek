import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { q } from "./db";
import type { PlayerRow } from "./game";

const COOKIE = "cnh_session";

export async function currentPlayer(): Promise<PlayerRow | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [p] = await q<PlayerRow>("select p.* from sessions s join players p on p.id = s.player_id where s.token = $1", [token]);
  return p ?? null;
}

export async function startSession(playerId: string) {
  const token = randomBytes(24).toString("base64url");
  await q("insert into sessions (token, player_id) values ($1, $2)", [token, playerId]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await q("delete from sessions where token = $1", [token]);
  jar.delete(COOKIE);
}
